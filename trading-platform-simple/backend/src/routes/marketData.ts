import { Router } from 'express';
import { MarketDataService } from '../services/marketData';
import { RealMarketDataService } from '../services/realMarketData';
import { logger } from '../utils/logger';

const router = Router();
const marketDataService = new MarketDataService();
const realMarketDataService = new RealMarketDataService();

// Get quote for a single symbol
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // Try real market data first
    let quote = await realMarketDataService.getQuote(symbol.toUpperCase());
    
    // Fallback to simulated data
    if (!quote) {
      quote = marketDataService.getQuote(symbol.toUpperCase()) || null;
    }
    
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    res.json(quote);
  } catch (error) {
    logger.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quotes for multiple symbols
router.get('/quotes', async (req, res) => {
  try {
    const { symbols } = req.query;
    
    if (!symbols) {
      // Return mix of real and simulated data
      const realQuotes = realMarketDataService.getCachedQuotes();
      const simulatedQuotes = marketDataService.getAllQuotes();
      
      // Prefer real quotes, fallback to simulated
      const quotesMap = new Map();
      simulatedQuotes.forEach(quote => quotesMap.set(quote.symbol, quote));
      realQuotes.forEach(quote => quotesMap.set(quote.symbol, quote));
      
      return res.json(Array.from(quotesMap.values()));
    }
    
    const symbolArray = Array.isArray(symbols) 
      ? symbols.map(s => String(s).toUpperCase())
      : String(symbols).split(',').map(s => s.trim().toUpperCase());
    
    // Try real market data first
    const realQuotes = await realMarketDataService.getMultipleQuotes(symbolArray);
    const realSymbols = new Set(realQuotes.map(q => q.symbol));
    
    // Get simulated quotes for symbols not available in real data
    const missingSymbols = symbolArray.filter(symbol => !realSymbols.has(symbol));
    const simulatedQuotes = marketDataService.getQuotes(missingSymbols);
    
    const allQuotes = [...realQuotes, ...simulatedQuotes];
    res.json(allQuotes);
  } catch (error) {
    logger.error('Error fetching quotes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order book for a symbol
router.get('/orderbook/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { levels = '10' } = req.query;
    
    const orderBook = marketDataService.generateOrderBook(
      symbol.toUpperCase(), 
      parseInt(String(levels))
    );
    
    res.json(orderBook);
  } catch (error) {
    logger.error('Error fetching order book:', error);
    res.status(404).json({ error: 'Symbol not found' });
  }
});

// Get historical data for a symbol
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { range = '1y' } = req.query;
    
    // Try real market data first
    let historicalData = await realMarketDataService.getHistoricalData(
      symbol.toUpperCase(), 
      String(range)
    );
    
    // Fallback to simulated data
    if (!historicalData || historicalData.length === 0) {
      const days = range === '1y' ? 365 : range === '6m' ? 180 : range === '3m' ? 90 : 30;
      historicalData = marketDataService.generateHistoricalData(
        symbol.toUpperCase(),
        days
      );
    }
    
    res.json(historicalData);
  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(404).json({ error: 'Symbol not found' });
  }
});

// Get market status
router.get('/status', (req, res) => {
  try {
    const status = marketDataService.getMarketStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error fetching market status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search symbols (mock implementation)
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    const query = String(q || '').toLowerCase();
    
    const symbols = [
      'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 
      'NFLX', 'CRM', 'UBER', 'COIN', 'SNOW', 'ZM', 'PLTR', 'SQ'
    ];
    
    const filtered = symbols.filter(symbol => 
      symbol.toLowerCase().includes(query)
    );
    
    const results = filtered.map(symbol => ({
      symbol,
      name: `${symbol} Inc.`, // Mock company name
      exchange: 'NASDAQ',
      type: 'stock'
    }));
    
    res.json(results);
  } catch (error) {
    logger.error('Error searching symbols:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get news for symbols
router.get('/news', async (req, res) => {
  try {
    const { symbols, limit = '10' } = req.query;
    
    if (!symbols) {
      return res.status(400).json({ error: 'Symbols parameter required' });
    }
    
    const symbolArray = Array.isArray(symbols) 
      ? symbols.map(s => String(s).toUpperCase())
      : String(symbols).split(',').map(s => s.trim().toUpperCase());
    
    const news = await realMarketDataService.getNews(symbolArray, parseInt(String(limit)));
    res.json(news);
  } catch (error) {
    logger.error('Error fetching news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get data provider status
router.get('/providers', (req, res) => {
  try {
    const status = realMarketDataService.getProviderStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error fetching provider status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as marketDataRoutes };