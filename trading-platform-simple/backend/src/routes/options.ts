import { Router } from 'express';
import { OptionsPricingService } from '../services/optionsPricing';
import { MarketDataService } from '../services/marketData';
import { logger } from '../utils/logger';

const router = Router();
const optionsPricingService = new OptionsPricingService();
const marketDataService = new MarketDataService();

// Get option pricing for a specific option
router.post('/pricing', (req, res) => {
  try {
    const {
      stockPrice,
      strikePrice,
      timeToExpiration,
      riskFreeRate = 0.05,
      volatility = 0.25,
      dividendYield = 0
    } = req.body;

    // Validate required fields
    if (!stockPrice || !strikePrice || timeToExpiration === undefined || !volatility) {
      return res.status(400).json({
        error: 'Missing required fields: stockPrice, strikePrice, timeToExpiration, volatility'
      });
    }

    const pricing = optionsPricingService.calculateOptionPricing({
      stockPrice,
      strikePrice,
      timeToExpiration,
      riskFreeRate,
      volatility,
      dividendYield
    });

    res.json({
      success: true,
      pricing,
      inputs: {
        stockPrice,
        strikePrice,
        timeToExpiration,
        riskFreeRate,
        volatility,
        dividendYield
      }
    });
  } catch (error) {
    logger.error('Error calculating option pricing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate implied volatility
router.post('/implied-volatility', (req, res) => {
  try {
    const {
      marketPrice,
      optionType,
      stockPrice,
      strikePrice,
      timeToExpiration,
      riskFreeRate = 0.05,
      dividendYield = 0,
      tolerance = 0.0001,
      maxIterations = 100
    } = req.body;

    // Validate required fields
    if (!marketPrice || !optionType || !stockPrice || !strikePrice || timeToExpiration === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: marketPrice, optionType, stockPrice, strikePrice, timeToExpiration'
      });
    }

    if (!['call', 'put'].includes(optionType)) {
      return res.status(400).json({
        error: 'optionType must be either "call" or "put"'
      });
    }

    const result = optionsPricingService.calculateImpliedVolatility(
      marketPrice,
      optionType,
      {
        stockPrice,
        strikePrice,
        timeToExpiration,
        riskFreeRate,
        dividendYield
      },
      tolerance,
      maxIterations
    );

    res.json({
      success: true,
      ...result,
      inputs: {
        marketPrice,
        optionType,
        stockPrice,
        strikePrice,
        timeToExpiration,
        riskFreeRate,
        dividendYield
      }
    });
  } catch (error) {
    logger.error('Error calculating implied volatility:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get option chain for a symbol
router.get('/chain/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { expirations } = req.query;

    // Get current stock price
    const quote = marketDataService.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Default expiration dates if not provided
    let expirationDates: string[];
    if (expirations && typeof expirations === 'string') {
      expirationDates = expirations.split(',');
    } else {
      // Generate default expiration dates (next 4 monthly expirations)
      expirationDates = [];
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const expDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 15); // 3rd Friday approximation
        expirationDates.push(expDate.toISOString().split('T')[0]);
      }
    }

    const optionChain = optionsPricingService.getOptionChain(
      symbol.toUpperCase(),
      quote.price,
      expirationDates
    );

    res.json(optionChain);
  } catch (error) {
    logger.error('Error fetching option chain:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate payoff diagram
router.post('/payoff-diagram', (req, res) => {
  try {
    const {
      stockPrice,
      strikePrice,
      timeToExpiration,
      riskFreeRate = 0.05,
      volatility = 0.25,
      dividendYield = 0,
      spotPriceRange = {
        min: stockPrice * 0.8,
        max: stockPrice * 1.2,
        steps: 50
      }
    } = req.body;

    // Validate required fields
    if (!stockPrice || !strikePrice || timeToExpiration === undefined || !volatility) {
      return res.status(400).json({
        error: 'Missing required fields: stockPrice, strikePrice, timeToExpiration, volatility'
      });
    }

    const payoffData = optionsPricingService.calculatePayoffDiagram(
      {
        stockPrice,
        strikePrice,
        timeToExpiration,
        riskFreeRate,
        volatility,
        dividendYield
      },
      spotPriceRange
    );

    res.json({
      success: true,
      payoffData,
      inputs: {
        stockPrice,
        strikePrice,
        timeToExpiration,
        riskFreeRate,
        volatility,
        dividendYield,
        spotPriceRange
      }
    });
  } catch (error) {
    logger.error('Error generating payoff diagram:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate portfolio risk metrics
router.post('/portfolio-risk', (req, res) => {
  try {
    const { positions } = req.body;

    if (!positions || !Array.isArray(positions)) {
      return res.status(400).json({
        error: 'positions must be an array of option positions'
      });
    }

    // Validate position structure
    for (const position of positions) {
      if (!position.type || !['call', 'put'].includes(position.type)) {
        return res.status(400).json({
          error: 'Each position must have a valid type ("call" or "put")'
        });
      }
      if (typeof position.quantity !== 'number') {
        return res.status(400).json({
          error: 'Each position must have a numeric quantity'
        });
      }
      if (!position.inputs || typeof position.inputs !== 'object') {
        return res.status(400).json({
          error: 'Each position must have valid option inputs'
        });
      }
    }

    const riskMetrics = optionsPricingService.calculatePortfolioRisk(positions);

    res.json({
      success: true,
      riskMetrics,
      positionCount: positions.length
    });
  } catch (error) {
    logger.error('Error calculating portfolio risk:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Black-Scholes calculator with real-time data
router.get('/calculator/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      strikePrice,
      daysToExpiration = 30,
      volatility = 0.25,
      riskFreeRate = 0.05,
      dividendYield = 0
    } = req.query;

    // Get current stock price
    const quote = marketDataService.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const strike = strikePrice ? parseFloat(String(strikePrice)) : quote.price;
    const timeToExpiration = parseFloat(String(daysToExpiration)) / 365;

    const pricing = optionsPricingService.calculateOptionPricing({
      stockPrice: quote.price,
      strikePrice: strike,
      timeToExpiration,
      riskFreeRate: parseFloat(String(riskFreeRate)),
      volatility: parseFloat(String(volatility)),
      dividendYield: parseFloat(String(dividendYield))
    });

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentPrice: quote.price,
      pricing,
      inputs: {
        stockPrice: quote.price,
        strikePrice: strike,
        timeToExpiration,
        riskFreeRate: parseFloat(String(riskFreeRate)),
        volatility: parseFloat(String(volatility)),
        dividendYield: parseFloat(String(dividendYield)),
        daysToExpiration: parseFloat(String(daysToExpiration))
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in options calculator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as optionsRoutes };