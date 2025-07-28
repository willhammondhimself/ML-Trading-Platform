import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { TradeModel } from '../models/trade';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';
import { logger } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const TradeQuerySchema = z.object({
  symbol: z.string().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  limit: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseInt(val);
    return !isNaN(num) && num > 0 && num <= 100;
  }, 'Limit must be between 1 and 100'),
  offset: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseInt(val);
    return !isNaN(num) && num >= 0;
  }, 'Offset must be non-negative'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['executed_at', 'symbol', 'quantity', 'price']).default('executed_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const StatsQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

/**
 * GET /api/trades
 * Get user's trades with optional filtering and pagination
 */
router.get('/', validateRequest(TradeQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof TradeQuerySchema>;

    const options = {
      symbol: query.symbol,
      side: query.side,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    };

    const result = await TradeModel.findByUserId(userId, options);

    res.json({
      trades: result.trades.map(trade => ({
        id: trade.id,
        orderId: trade.order_id,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        commission: trade.commission,
        executedAt: trade.executed_at,
        executionVenue: trade.execution_venue,
        value: (parseFloat(trade.quantity) * parseFloat(trade.price)).toFixed(8)
      })),
      pagination: {
        total: result.total,
        limit: options.limit || 50,
        offset: options.offset || 0,
        hasMore: (options.offset || 0) + result.trades.length < result.total
      }
    });

  } catch (error) {
    logger.error('Error fetching trades:', error);
    res.status(500).json({
      error: 'Failed to fetch trades',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trades/:id
 * Get specific trade by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const tradeId = req.params.id;

    const trade = await TradeModel.findById(tradeId);

    if (!trade) {
      return res.status(404).json({
        error: 'Trade not found'
      });
    }

    // Ensure user can only access their own trades
    if (trade.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      trade: {
        id: trade.id,
        orderId: trade.order_id,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        commission: trade.commission,
        executedAt: trade.executed_at,
        executionVenue: trade.execution_venue,
        value: (parseFloat(trade.quantity) * parseFloat(trade.price)).toFixed(8),
        metadata: trade.metadata
      }
    });

  } catch (error) {
    logger.error('Error fetching trade:', error);
    res.status(500).json({
      error: 'Failed to fetch trade',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trades/daily
 * Get user's trades for a specific day
 */
router.get('/daily', async (req, res) => {
  try {
    const userId = req.user!.id;
    const dateStr = req.query.date as string;
    
    const date = dateStr ? new Date(dateStr) : new Date();
    
    if (isNaN(date.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }

    const trades = await TradeModel.findUserDailyTrades(userId, date);

    // Calculate daily summary
    let totalVolume = 0;
    let totalCommissions = 0;
    let buyTrades = 0;
    let sellTrades = 0;

    trades.forEach(trade => {
      const volume = parseFloat(trade.quantity) * parseFloat(trade.price);
      totalVolume += volume;
      totalCommissions += parseFloat(trade.commission);
      
      if (trade.side === 'BUY') buyTrades++;
      else sellTrades++;
    });

    res.json({
      date: date.toISOString().split('T')[0],
      summary: {
        totalTrades: trades.length,
        totalVolume: totalVolume.toFixed(8),
        totalCommissions: totalCommissions.toFixed(8),
        buyTrades,
        sellTrades
      },
      trades: trades.map(trade => ({
        id: trade.id,
        orderId: trade.order_id,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        commission: trade.commission,
        executedAt: trade.executed_at,
        executionVenue: trade.execution_venue,
        value: (parseFloat(trade.quantity) * parseFloat(trade.price)).toFixed(8)
      }))
    });

  } catch (error) {
    logger.error('Error fetching daily trades:', error);
    res.status(500).json({
      error: 'Failed to fetch daily trades',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trades/stats
 * Get trading statistics for a date range
 */
router.get('/stats', validateRequest(StatsQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof StatsQuerySchema>;

    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    const stats = await TradeModel.getUserTradingStats(userId, startDate, endDate);

    res.json({
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      stats: {
        totalTrades: stats.totalTrades,
        totalVolume: stats.totalVolume,
        totalCommissions: stats.totalCommissions,
        avgTradeSize: stats.avgTradeSize,
        buyTrades: stats.buyTrades,
        sellTrades: stats.sellTrades,
        uniqueSymbols: stats.uniqueSymbols,
        buyPercentage: stats.totalTrades > 0 
          ? ((stats.buyTrades / stats.totalTrades) * 100).toFixed(2) + '%'
          : '0%',
        sellPercentage: stats.totalTrades > 0 
          ? ((stats.sellTrades / stats.totalTrades) * 100).toFixed(2) + '%'
          : '0%',
        avgCommissionPerTrade: stats.totalTrades > 0 
          ? (parseFloat(stats.totalCommissions) / stats.totalTrades).toFixed(8)
          : '0'
      }
    });

  } catch (error) {
    logger.error('Error fetching trading stats:', error);
    res.status(500).json({
      error: 'Failed to fetch trading stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trades/volume
 * Get trading volume for a date range
 */
router.get('/volume', validateRequest(StatsQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof StatsQuerySchema>;

    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    const volume = await TradeModel.calculateUserVolume(userId, startDate, endDate);

    res.json({
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      volume: {
        totalVolume: volume.totalVolume,
        tradeCount: volume.tradeCount,
        avgVolumePerTrade: volume.tradeCount > 0 
          ? (parseFloat(volume.totalVolume) / volume.tradeCount).toFixed(8)
          : '0'
      }
    });

  } catch (error) {
    logger.error('Error fetching trading volume:', error);
    res.status(500).json({
      error: 'Failed to fetch trading volume',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trades/with-orders
 * Get trades with their associated order information
 */
router.get('/with-orders', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      symbol: req.query.symbol as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    };

    const trades = await TradeModel.findTradesWithOrderInfo(userId, options);

    res.json({
      trades: trades.map(trade => ({
        id: trade.id,
        orderId: trade.order_id,
        orderType: trade.order_type,
        orderPlacedAt: trade.order_placed_at,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        commission: trade.commission,
        executedAt: trade.executed_at,
        executionVenue: trade.execution_venue,
        value: (parseFloat(trade.quantity) * parseFloat(trade.price)).toFixed(8)
      }))
    });

  } catch (error) {
    logger.error('Error fetching trades with order info:', error);
    res.status(500).json({
      error: 'Failed to fetch trades with order info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;