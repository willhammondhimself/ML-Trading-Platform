import { Router } from 'express';
import { Portfolio, Position, Trade } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// Mock portfolio data
const mockPortfolio: Portfolio = {
  totalValue: 125000,
  totalPnL: 15000,
  totalPnLPercent: 13.64,
  cashBalance: 25000,
  todaysPnL: 1250,
  todaysPnLPercent: 1.01,
  positions: [
    {
      symbol: 'AAPL',
      quantity: 100,
      averagePrice: 150.25,
      currentPrice: 175.30,
      unrealizedPnL: 2505,
      realizedPnL: 0,
      side: 'long'
    },
    {
      symbol: 'GOOGL',
      quantity: 50,
      averagePrice: 2800.50,
      currentPrice: 2950.75,
      unrealizedPnL: 7512.50,
      realizedPnL: 500,
      side: 'long'
    },
    {
      symbol: 'TSLA',
      quantity: 75,
      averagePrice: 220.15,
      currentPrice: 245.80,
      unrealizedPnL: 1923.75,
      realizedPnL: -250,
      side: 'long'
    }
  ]
};

const mockTrades: Trade[] = [
  {
    id: '1',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 100,
    price: 150.25,
    timestamp: Date.now() - 86400000, // 1 day ago
    status: 'filled'
  },
  {
    id: '2',
    symbol: 'GOOGL',
    side: 'buy',
    quantity: 50,
    price: 2800.50,
    timestamp: Date.now() - 172800000, // 2 days ago
    status: 'filled'
  },
  {
    id: '3',
    symbol: 'TSLA',
    side: 'buy',
    quantity: 75,
    price: 220.15,
    timestamp: Date.now() - 259200000, // 3 days ago
    status: 'filled'
  }
];

// Get portfolio summary
router.get('/summary', (req, res) => {
  try {
    res.json(mockPortfolio);
  } catch (error) {
    logger.error('Error fetching portfolio summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all positions
router.get('/positions', (req, res) => {
  try {
    res.json(mockPortfolio.positions);
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get position for specific symbol
router.get('/positions/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const position = mockPortfolio.positions.find(
      pos => pos.symbol.toUpperCase() === symbol.toUpperCase()
    );
    
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }
    
    res.json(position);
  } catch (error) {
    logger.error('Error fetching position:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trade history
router.get('/trades', (req, res) => {
  try {
    const { symbol, limit = '50' } = req.query;
    
    let trades = mockTrades;
    
    if (symbol) {
      trades = trades.filter(
        trade => trade.symbol.toUpperCase() === String(symbol).toUpperCase()
      );
    }
    
    const limitNum = parseInt(String(limit));
    trades = trades.slice(0, limitNum);
    
    res.json(trades);
  } catch (error) {
    logger.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Place new order (mock)
router.post('/orders', (req, res) => {
  try {
    const { symbol, side, quantity, price, type = 'market' } = req.body;
    
    if (!symbol || !side || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const order = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: symbol.toUpperCase(),
      side,
      quantity: Number(quantity),
      price: Number(price) || 0,
      type,
      status: 'pending',
      timestamp: Date.now()
    };
    
    // Simulate order execution
    setTimeout(() => {
      order.status = 'filled';
      logger.info('Order filled:', order);
    }, 1000);
    
    res.status(201).json(order);
  } catch (error) {
    logger.error('Error placing order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get portfolio performance metrics
router.get('/performance', (req, res) => {
  try {
    const { period = '1M' } = req.query;
    
    // Mock performance data
    const performance = {
      period,
      totalReturn: 13.64,
      sharpeRatio: 1.85,
      maxDrawdown: -8.2,
      winRate: 72.5,
      averageWin: 4.2,
      averageLoss: -2.1,
      profitFactor: 2.8,
      timestamps: [] as number[],
      values: [] as number[]
    };
    
    // Generate mock time series data
    const now = Date.now();
    const days = period === '1D' ? 1 : period === '1W' ? 7 : period === '1M' ? 30 : 90;
    const points = Math.min(days, 100);
    
    for (let i = points; i >= 0; i--) {
      const timestamp = now - (i * 24 * 60 * 60 * 1000);
      const value = 100000 + (Math.random() - 0.5) * 20000 + (points - i) * 500;
      
      performance.timestamps.push(timestamp);
      performance.values.push(Math.round(value));
    }
    
    res.json(performance);
  } catch (error) {
    logger.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as portfolioRoutes };