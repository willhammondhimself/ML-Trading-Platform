import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { PositionModel } from '../models/position';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';
import { forceUpdateUserPositions, getUpdaterStatus } from '../services/position-updater';
import { logger } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const PositionQuerySchema = z.object({
  symbol: z.string().optional(),
  activeOnly: z.string().optional().refine(val => {
    if (val === undefined) return true;
    return val === 'true' || val === 'false';
  }, 'activeOnly must be true or false')
});

const ClosePositionSchema = z.object({
  realizePnl: z.boolean().default(true)
});

const AnalyticsQuerySchema = z.object({
  symbol: z.string().optional()
});

/**
 * GET /api/positions
 * Get user's positions
 */
router.get('/', validateRequest(PositionQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof PositionQuerySchema>;

    let positions;

    if (query.activeOnly === 'true') {
      positions = await PositionModel.findActivePositionsByUserId(userId);
    } else {
      positions = await PositionModel.findByUserId(userId);
    }

    // Filter by symbol if provided
    if (query.symbol) {
      positions = positions.filter(p => p.symbol === query.symbol.toUpperCase());
    }

    res.json({
      positions: positions.map(position => ({
        id: position.id,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.average_price,
        marketValue: position.market_value,
        unrealizedPnl: position.unrealized_pnl,
        realizedPnl: position.realized_pnl,
        openedAt: position.opened_at,
        updatedAt: position.updated_at
      }))
    });

  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({
      error: 'Failed to fetch positions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/positions/:id
 * Get specific position by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;

    const position = await PositionModel.findById(positionId);

    if (!position) {
      return res.status(404).json({
        error: 'Position not found'
      });
    }

    // Ensure user can only access their own positions
    if (position.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      position: {
        id: position.id,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.average_price,
        marketValue: position.market_value,
        unrealizedPnl: position.unrealized_pnl,
        realizedPnl: position.realized_pnl,
        openedAt: position.opened_at,
        updatedAt: position.updated_at,
        metadata: position.metadata
      }
    });

  } catch (error) {
    logger.error('Error fetching position:', error);
    res.status(500).json({
      error: 'Failed to fetch position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/positions/:symbol/close
 * Close a position for a specific symbol
 */
router.post('/:symbol/close', validateRequest(ClosePositionSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const symbol = req.params.symbol.toUpperCase();
    const { realizePnl } = req.body as z.infer<typeof ClosePositionSchema>;

    const closedPosition = await PositionModel.closePosition(userId, symbol, realizePnl);

    if (!closedPosition) {
      return res.status(404).json({
        error: 'Position not found or already closed'
      });
    }

    logger.info('Position closed', {
      positionId: closedPosition.id,
      userId,
      symbol,
      realizePnl
    });

    res.json({
      message: 'Position closed successfully',
      position: {
        id: closedPosition.id,
        symbol: closedPosition.symbol,
        quantity: closedPosition.quantity,
        averagePrice: closedPosition.average_price,
        marketValue: closedPosition.market_value,
        unrealizedPnl: closedPosition.unrealized_pnl,
        realizedPnl: closedPosition.realized_pnl,
        updatedAt: closedPosition.updated_at
      }
    });

  } catch (error) {
    logger.error('Error closing position:', error);
    res.status(500).json({
      error: 'Failed to close position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/positions/portfolio/summary
 * Get portfolio summary for the user
 */
router.get('/portfolio/summary', async (req, res) => {
  try {
    const userId = req.user!.id;

    const summary = await PositionModel.getPortfolioSummary(userId);

    res.json({
      portfolio: {
        totalValue: summary.totalValue,
        totalUnrealizedPnl: summary.totalUnrealizedPnl,
        totalRealizedPnl: summary.totalRealizedPnl,
        positionCount: summary.positionCount,
        positions: summary.positions.map(position => ({
          id: position.id,
          symbol: position.symbol,
          quantity: position.quantity,
          averagePrice: position.average_price,
          marketValue: position.market_value,
          unrealizedPnl: position.unrealized_pnl,
          realizedPnl: position.realized_pnl,
          openedAt: position.opened_at,
          updatedAt: position.updated_at
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching portfolio summary:', error);
    res.status(500).json({
      error: 'Failed to fetch portfolio summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/positions/analytics
 * Get position analytics for the user
 */
router.get('/analytics', validateRequest(AnalyticsQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof AnalyticsQuerySchema>;

    const analytics = await PositionModel.getPositionAnalytics(userId, query.symbol);

    res.json({
      analytics: {
        totalPositions: analytics.totalPositions,
        profitablePositions: analytics.profitablePositions,
        losingPositions: analytics.losingPositions,
        totalPnl: analytics.totalPnl,
        avgPnl: analytics.avgPnl,
        bestPosition: analytics.bestPosition,
        worstPosition: analytics.worstPosition,
        winRate: analytics.totalPositions > 0 
          ? ((analytics.profitablePositions / analytics.totalPositions) * 100).toFixed(2) + '%'
          : '0%'
      }
    });

  } catch (error) {
    logger.error('Error fetching position analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch position analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/positions/largest
 * Get largest positions by value
 */
router.get('/largest', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const positions = await PositionModel.getLargestPositions(userId, limit);

    res.json({
      positions: positions.map(position => ({
        id: position.id,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.average_price,
        marketValue: position.market_value,
        unrealizedPnl: position.unrealized_pnl,
        realizedPnl: position.realized_pnl,
        openedAt: position.opened_at,
        updatedAt: position.updated_at
      }))
    });

  } catch (error) {
    logger.error('Error fetching largest positions:', error);
    res.status(500).json({
      error: 'Failed to fetch largest positions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/positions/refresh
 * Force refresh position values with latest market prices
 */
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user!.id;

    await forceUpdateUserPositions(userId);

    res.json({
      message: 'Position values refreshed successfully'
    });

  } catch (error) {
    logger.error('Error refreshing positions:', error);
    res.status(500).json({
      error: 'Failed to refresh positions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/positions/status
 * Get position updater service status
 */
router.get('/status/updater', async (req, res) => {
  try {
    const status = getUpdaterStatus();
    
    res.json({
      positionUpdater: status
    });

  } catch (error) {
    logger.error('Error getting updater status:', error);
    res.status(500).json({
      error: 'Failed to get updater status'
    });
  }
});

export default router;