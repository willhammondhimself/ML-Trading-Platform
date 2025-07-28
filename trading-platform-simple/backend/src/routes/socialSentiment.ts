import { Router } from 'express';
import { SocialSentimentService } from '../services/socialSentiment';
import { logger } from '../utils/logger';

const router = Router();
const socialService = new SocialSentimentService();

// Start real-time updates
socialService.startRealTimeUpdates();

// Get sentiment analysis for a specific symbol
router.get('/sentiment/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { hours } = req.query;
    
    const hoursToFetch = hours ? parseInt(hours as string) : 24;
    if (isNaN(hoursToFetch) || hoursToFetch < 1 || hoursToFetch > 168) {
      return res.status(400).json({
        error: 'Hours parameter must be between 1 and 168 (1 week)'
      });
    }
    
    const sentimentData = socialService.getSentimentAnalysis(symbol, hoursToFetch);
    
    if (sentimentData.length === 0) {
      return res.status(404).json({
        error: 'No sentiment data available for this symbol',
        availableSymbols: socialService.getAllSentimentAnalyses().map(s => s.symbol)
      });
    }
    
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      sentimentData,
      count: sentimentData.length,
      timeRange: `${hoursToFetch} hours`,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching sentiment analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all sentiment analyses (latest for each symbol)
router.get('/sentiment', (req, res) => {
  try {
    const sentimentData = socialService.getAllSentimentAnalyses();
    
    // Calculate aggregate statistics
    const summary = {
      totalSymbols: sentimentData.length,
      totalMentions: sentimentData.reduce((sum, s) => sum + s.totalMentions, 0),
      averageSentiment: sentimentData.reduce((sum, s) => sum + s.sentimentScore, 0) / sentimentData.length,
      bullishSymbols: sentimentData.filter(s => s.sentimentScore > 0.2).length,
      bearishSymbols: sentimentData.filter(s => s.sentimentScore < -0.2).length,
      neutralSymbols: sentimentData.filter(s => Math.abs(s.sentimentScore) <= 0.2).length,
      highConfidence: sentimentData.filter(s => s.confidence > 0.8).length,
      viralContent: sentimentData.reduce((sum, s) => sum + s.viralContent.length, 0),
      influencerActivity: sentimentData.reduce((sum, s) => sum + s.topInfluencers.length, 0)
    };
    
    res.json({
      success: true,
      sentimentData,
      summary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching all sentiment analyses:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment analyses',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get recent social media posts
router.get('/posts', (req, res) => {
  try {
    const { symbol, platform, limit } = req.query;
    
    const limitNum = limit ? parseInt(limit as string) : 50;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      return res.status(400).json({
        error: 'Limit parameter must be between 1 and 200'
      });
    }
    
    if (platform && !['twitter', 'reddit', 'stocktwits', 'discord', 'youtube'].includes(platform as string)) {
      return res.status(400).json({
        error: 'Platform must be one of: twitter, reddit, stocktwits, discord, youtube'
      });
    }
    
    const posts = socialService.getRecentPosts(symbol as string, platform as string, limitNum);
    
    // Calculate post statistics
    const stats = {
      totalPosts: posts.length,
      platforms: [...new Set(posts.map(p => p.platform))],
      symbols: [...new Set(posts.flatMap(p => p.symbols))],
      sentimentDistribution: {
        bullish: posts.filter(p => p.sentiment === 'bullish').length,
        bearish: posts.filter(p => p.sentiment === 'bearish').length,
        neutral: posts.filter(p => p.sentiment === 'neutral').length
      },
      averageEngagement: posts.reduce((sum, p) => sum + p.likes + p.shares + p.comments, 0) / posts.length,
      verifiedAuthors: posts.filter(p => p.verified).length,
      highInfluencePosts: posts.filter(p => p.influence > 0.5).length
    };
    
    res.json({
      success: true,
      posts,
      stats,
      filters: {
        symbol: symbol || 'all',
        platform: platform || 'all',
        limit: limitNum
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching social media posts:', error);
    res.status(500).json({
      error: 'Failed to fetch social media posts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get trending topics
router.get('/trending', (req, res) => {
  try {
    const topics = socialService.getTrendingTopics();
    
    // Categorize topics
    const rising = topics.filter(t => t.growth > 20 && !t.peaked);
    const peaking = topics.filter(t => t.peaked && t.growth > 0);
    const declining = topics.filter(t => t.growth < -10);
    
    const summary = {
      totalTopics: topics.length,
      risingTopics: rising.length,
      peakingTopics: peaking.length,
      decliningTopics: declining.length,
      totalMentions: topics.reduce((sum, t) => sum + t.mentions, 0),
      averageGrowth: topics.reduce((sum, t) => sum + t.growth, 0) / topics.length,
      hottest: topics[0] || null,
      longestLasting: topics.reduce((longest, current) => 
        current.timeToLive > longest.timeToLive ? current : longest, topics[0]
      )
    };
    
    res.json({
      success: true,
      topics,
      categorized: {
        rising,
        peaking,
        declining
      },
      summary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching trending topics:', error);
    res.status(500).json({
      error: 'Failed to fetch trending topics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get social trading signals
router.get('/signals', (req, res) => {
  try {
    const signals = socialService.getSocialSignals();
    
    // Calculate signal statistics
    const summary = {
      totalSignals: signals.length,
      buySignals: signals.filter(s => s.signal === 'buy').length,
      sellSignals: signals.filter(s => s.signal === 'sell').length,
      holdSignals: signals.filter(s => s.signal === 'hold').length,
      strongSignals: signals.filter(s => s.strength > 0.7).length,
      highConfidence: signals.filter(s => s.confidence > 0.8).length,
      averageStrength: signals.reduce((sum, s) => sum + s.strength, 0) / signals.length,
      averageConfidence: signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length,
      mostBullish: signals.filter(s => s.signal === 'buy').sort((a, b) => b.strength - a.strength)[0] || null,
      mostBearish: signals.filter(s => s.signal === 'sell').sort((a, b) => b.strength - a.strength)[0] || null
    };
    
    res.json({
      success: true,
      signals,
      summary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching social trading signals:', error);
    res.status(500).json({
      error: 'Failed to fetch social trading signals',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get social signal for specific symbol
router.get('/signals/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const signal = socialService.getSocialSignal(symbol);
    
    if (!signal) {
      return res.status(404).json({
        error: 'No social signal available for this symbol',
        availableSymbols: socialService.getSocialSignals().map(s => s.symbol)
      });
    }
    
    res.json({
      success: true,
      signal,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching social signal:', error);
    res.status(500).json({
      error: 'Failed to fetch social signal',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get influencer profiles
router.get('/influencers', (req, res) => {
  try {
    const { platform } = req.query;
    
    if (platform && !['twitter', 'reddit', 'stocktwits', 'discord', 'youtube'].includes(platform as string)) {
      return res.status(400).json({
        error: 'Platform must be one of: twitter, reddit, stocktwits, discord, youtube'
      });
    }
    
    const influencers = socialService.getInfluencers(platform as string);
    
    // Sort by influence score
    influencers.sort((a, b) => b.influence - a.influence);
    
    // Calculate statistics
    const stats = {
      totalInfluencers: influencers.length,
      platforms: [...new Set(influencers.map(i => i.platform))],
      verified: influencers.filter(i => i.verified).length,
      averageFollowers: influencers.reduce((sum, i) => sum + i.followers, 0) / influencers.length,
      averageAccuracy: influencers.reduce((sum, i) => sum + i.accuracy, 0) / influencers.length,
      averageInfluence: influencers.reduce((sum, i) => sum + i.influence, 0) / influencers.length,
      tradingStyles: [...new Set(influencers.map(i => i.tradingStyle))],
      topInfluencer: influencers[0] || null,
      mostAccurate: influencers.sort((a, b) => b.accuracy - a.accuracy)[0] || null
    };
    
    res.json({
      success: true,
      influencers,
      stats,
      filters: {
        platform: platform || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching influencer profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch influencer profiles',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get social sentiment dashboard
router.get('/dashboard', (req, res) => {
  try {
    const { symbol } = req.query;
    
    // Get sentiment data
    const allSentiment = socialService.getAllSentimentAnalyses();
    const sentimentData = symbol ? 
      allSentiment.filter(s => s.symbol === symbol.toString().toUpperCase()) : 
      allSentiment;
    
    // Get recent posts
    const recentPosts = socialService.getRecentPosts(symbol as string, undefined, 100);
    
    // Get trending topics
    const trendingTopics = socialService.getTrendingTopics();
    
    // Get social signals
    const socialSignals = socialService.getSocialSignals();
    const filteredSignals = symbol ? 
      socialSignals.filter(s => s.symbol === symbol.toString().toUpperCase()) : 
      socialSignals;
    
    // Get influencers
    const influencers = socialService.getInfluencers();
    
    // Calculate dashboard metrics
    const dashboardMetrics = {
      totalSymbols: [...new Set(recentPosts.flatMap(p => p.symbols))].length,
      totalMentions: sentimentData.reduce((sum, s) => sum + s.totalMentions, 0),
      totalPosts: recentPosts.length,
      averageSentiment: sentimentData.reduce((sum, s) => sum + s.sentimentScore, 0) / sentimentData.length,
      bullishSignals: filteredSignals.filter(s => s.signal === 'buy').length,
      bearishSignals: filteredSignals.filter(s => s.signal === 'sell').length,
      strongSignals: filteredSignals.filter(s => s.strength > 0.7).length,
      viralPosts: recentPosts.filter(p => (p.likes + p.shares * 2) > 100).length,
      influencerPosts: recentPosts.filter(p => p.influence > 0.1).length,
      trendingTopics: trendingTopics.length,
      risingTopics: trendingTopics.filter(t => t.growth > 20 && !t.peaked).length,
      platformBreakdown: {
        twitter: recentPosts.filter(p => p.platform === 'twitter').length,
        reddit: recentPosts.filter(p => p.platform === 'reddit').length,
        stocktwits: recentPosts.filter(p => p.platform === 'stocktwits').length,
        discord: recentPosts.filter(p => p.platform === 'discord').length,
        youtube: recentPosts.filter(p => p.platform === 'youtube').length
      }
    };
    
    // Get top content
    const topPosts = recentPosts
      .sort((a, b) => (b.likes + b.shares * 2) - (a.likes + a.shares * 2))
      .slice(0, 10);
    
    const topInfluencerPosts = recentPosts
      .filter(p => p.influence > 0.1)
      .sort((a, b) => b.influence - a.influence)
      .slice(0, 5);
    
    res.json({
      success: true,
      dashboard: {
        metrics: dashboardMetrics,
        sentimentData: sentimentData.slice(0, 20),
        socialSignals: filteredSignals.slice(0, 10),
        trendingTopics: trendingTopics.slice(0, 10),
        topPosts,
        topInfluencerPosts,
        influencers: influencers.slice(0, 10)
      },
      filters: {
        symbol: symbol || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating social sentiment dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate social sentiment dashboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const sentimentData = socialService.getAllSentimentAnalyses();
    const recentPosts = socialService.getRecentPosts();
    const signals = socialService.getSocialSignals();
    const topics = socialService.getTrendingTopics();
    const influencers = socialService.getInfluencers();
    
    const health = {
      status: 'healthy',
      symbolsTracked: sentimentData.length,
      totalPosts: recentPosts.length,
      totalSignals: signals.length,
      trendingTopics: topics.length,
      influencersTracked: influencers.length,
      averageSentiment: sentimentData.reduce((sum, s) => sum + s.sentimentScore, 0) / sentimentData.length,
      averageConfidence: sentimentData.reduce((sum, s) => sum + s.confidence, 0) / sentimentData.length,
      strongSignals: signals.filter(s => s.strength > 0.7).length,
      dataFreshness: recentPosts.length > 0 ? 
        Date.now() - Math.max(...recentPosts.map(p => p.timestamp)) < 60 * 60 * 1000 ? 'fresh' : 'stale' : 
        'no_data',
      platformCoverage: [...new Set(recentPosts.map(p => p.platform))].length,
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking social sentiment health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as socialSentimentRoutes };