import { Router } from 'express';
import { SentimentAnalysisService } from '../services/sentimentAnalysis';
import { logger } from '../utils/logger';

const router = Router();
const sentimentService = new SentimentAnalysisService();

// Get sentiment for a single symbol
router.get('/symbol/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const sentiment = sentimentService.getSentiment(symbol.toUpperCase());
    
    if (!sentiment) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    res.json(sentiment);
  } catch (error) {
    logger.error('Error fetching sentiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sentiment for multiple symbols
router.get('/symbols', (req, res) => {
  try {
    const { symbols } = req.query;
    
    if (!symbols || typeof symbols !== 'string') {
      return res.status(400).json({ error: 'Symbols parameter required' });
    }
    
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const sentiments = sentimentService.getMultipleSentiments(symbolList);
    
    res.json(sentiments);
  } catch (error) {
    logger.error('Error fetching multiple sentiments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get news for a symbol
router.get('/news/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = '10' } = req.query;
    
    const news = sentimentService.getNews(
      symbol.toUpperCase(), 
      parseInt(limit as string)
    );
    
    res.json({
      symbol: symbol.toUpperCase(),
      count: news.length,
      articles: news
    });
  } catch (error) {
    logger.error('Error fetching news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get social media posts for a symbol
router.get('/social/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { platform, limit = '20' } = req.query;
    
    const posts = sentimentService.getSocialPosts(
      symbol.toUpperCase(),
      platform as string,
      parseInt(limit as string)
    );
    
    res.json({
      symbol: symbol.toUpperCase(),
      platform: platform || 'all',
      count: posts.length,
      posts
    });
  } catch (error) {
    logger.error('Error fetching social posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sentiment trend
router.get('/trend/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1D' } = req.query;
    
    if (!['1H', '1D', '1W', '1M'].includes(period as string)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: 1H, 1D, 1W, 1M' 
      });
    }
    
    const trend = sentimentService.getSentimentTrend(
      symbol.toUpperCase(),
      period as '1H' | '1D' | '1W' | '1M'
    );
    
    res.json(trend);
  } catch (error) {
    logger.error('Error fetching sentiment trend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get overall market sentiment
router.get('/market', (req, res) => {
  try {
    const marketSentiment = sentimentService.getMarketSentiment();
    res.json(marketSentiment);
  } catch (error) {
    logger.error('Error fetching market sentiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analyze custom text
router.post('/analyze', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text parameter required' });
    }
    
    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 characters)' });
    }
    
    const analysis = sentimentService.analyzeText(text);
    
    res.json({
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      analysis
    });
  } catch (error) {
    logger.error('Error analyzing text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sentiment summary dashboard data
router.get('/dashboard', (req, res) => {
  try {
    const { symbols } = req.query;
    const symbolList = symbols 
      ? (symbols as string).split(',').map(s => s.trim().toUpperCase())
      : ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD'];
    
    // Get sentiments for all symbols
    const sentiments = sentimentService.getMultipleSentiments(symbolList);
    
    // Get market sentiment
    const marketSentiment = sentimentService.getMarketSentiment();
    
    // Get top movers
    const sortedSentiments = [...sentiments].sort((a, b) => 
      Math.abs(b.sentiment) - Math.abs(a.sentiment)
    );
    
    const topMovers = sortedSentiments.slice(0, 5).map(s => ({
      symbol: s.symbol,
      sentiment: s.sentiment,
      change: s.sentiment > 0 ? 'bullish' : s.sentiment < 0 ? 'bearish' : 'neutral',
      confidence: s.confidence,
      mentions: s.volume.mentions
    }));
    
    // Calculate sentiment distribution
    const distribution = {
      bullish: sentiments.filter(s => s.sentiment > 0.3).length,
      neutral: sentiments.filter(s => s.sentiment >= -0.3 && s.sentiment <= 0.3).length,
      bearish: sentiments.filter(s => s.sentiment < -0.3).length
    };
    
    res.json({
      timestamp: Date.now(),
      marketSentiment,
      distribution,
      topMovers,
      symbols: sentiments
    });
  } catch (error) {
    logger.error('Error fetching sentiment dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start real-time updates (WebSocket events)
router.post('/realtime/start', (req, res) => {
  try {
    const { interval = 30000 } = req.body;
    sentimentService.startRealTimeUpdates(interval);
    res.json({ 
      success: true, 
      message: `Real-time updates started with ${interval}ms interval` 
    });
  } catch (error) {
    logger.error('Error starting real-time updates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stop real-time updates
router.post('/realtime/stop', (req, res) => {
  try {
    sentimentService.stopRealTimeUpdates();
    res.json({ 
      success: true, 
      message: 'Real-time updates stopped' 
    });
  } catch (error) {
    logger.error('Error stopping real-time updates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as sentimentRoutes };