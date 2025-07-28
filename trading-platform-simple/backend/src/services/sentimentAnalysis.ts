import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface SentimentData {
  symbol: string;
  sentiment: number; // -1 to 1 scale
  confidence: number; // 0 to 1 scale
  sources: {
    news: number;
    social: number;
    analyst: number;
  };
  signals: {
    bullish: string[];
    bearish: string[];
    neutral: string[];
  };
  volume: {
    mentions: number;
    engagement: number;
    reach: number;
  };
  timestamp: number;
}

interface NewsArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  publishedAt: Date;
  symbols: string[];
  sentiment: number;
  keywords: string[];
  url?: string;
}

interface SocialPost {
  id: string;
  text: string;
  author: string;
  platform: 'twitter' | 'reddit' | 'stocktwits';
  timestamp: Date;
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  sentiment: number;
  symbols: string[];
}

interface SentimentTrend {
  symbol: string;
  period: string;
  data: Array<{
    timestamp: number;
    sentiment: number;
    volume: number;
  }>;
  change: {
    value: number;
    percent: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

export class SentimentAnalysisService extends EventEmitter {
  private sentimentCache: Map<string, SentimentData> = new Map();
  private newsCache: Map<string, NewsArticle[]> = new Map();
  private socialCache: Map<string, SocialPost[]> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  // Sentiment keywords and weights
  private readonly sentimentKeywords = {
    bullish: {
      strong: ['breakthrough', 'soaring', 'surging', 'record high', 'beat expectations', 'strong buy', 'outperform'],
      moderate: ['positive', 'growth', 'upgrade', 'bullish', 'optimistic', 'gaining', 'momentum'],
      weak: ['stable', 'steady', 'holding', 'support', 'accumulation']
    },
    bearish: {
      strong: ['crash', 'plunge', 'collapse', 'bankruptcy', 'fraud', 'investigation', 'sell-off'],
      moderate: ['negative', 'decline', 'downgrade', 'bearish', 'pessimistic', 'falling', 'weakness'],
      weak: ['concern', 'caution', 'uncertainty', 'resistance', 'distribution']
    }
  };

  constructor() {
    super();
    this.initializeMockData();
    logger.info('Sentiment analysis service initialized');
  }

  /**
   * Initialize with mock sentiment data
   */
  private initializeMockData() {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD'];
    
    symbols.forEach(symbol => {
      this.generateMockSentiment(symbol);
      this.generateMockNews(symbol);
      this.generateMockSocialPosts(symbol);
    });
  }

  /**
   * Generate realistic mock sentiment data
   */
  private generateMockSentiment(symbol: string): SentimentData {
    // Create biases for certain stocks
    const stockBiases: Record<string, number> = {
      'NVDA': 0.3,  // AI hype
      'TSLA': -0.1, // Controversial
      'META': 0.1,  // Recovery story
      'AMD': 0.2,   // Competition with Intel
    };

    const bias = stockBiases[symbol] || 0;
    const randomSentiment = (Math.random() - 0.5) * 0.8 + bias;
    const sentiment = Math.max(-1, Math.min(1, randomSentiment));
    
    const data: SentimentData = {
      symbol,
      sentiment,
      confidence: 0.7 + Math.random() * 0.3,
      sources: {
        news: sentiment + (Math.random() - 0.5) * 0.2,
        social: sentiment + (Math.random() - 0.5) * 0.3,
        analyst: sentiment + (Math.random() - 0.5) * 0.1
      },
      signals: this.generateSignals(sentiment),
      volume: {
        mentions: Math.floor(Math.random() * 5000) + 1000,
        engagement: Math.floor(Math.random() * 50000) + 10000,
        reach: Math.floor(Math.random() * 1000000) + 100000
      },
      timestamp: Date.now()
    };

    this.sentimentCache.set(symbol, data);
    return data;
  }

  /**
   * Generate sentiment signals based on score
   */
  private generateSignals(sentiment: number): SentimentData['signals'] {
    const bullishSignals = [
      'High social media momentum',
      'Positive analyst coverage',
      'Increasing retail interest',
      'Strong technical setup',
      'Institutional accumulation'
    ];

    const bearishSignals = [
      'Negative news sentiment',
      'Declining social mentions',
      'Analyst downgrades',
      'Technical breakdown',
      'Institutional selling'
    ];

    const neutralSignals = [
      'Mixed analyst opinions',
      'Consolidating price action',
      'Average social sentiment',
      'Waiting for catalyst'
    ];

    const signals: SentimentData['signals'] = {
      bullish: [],
      bearish: [],
      neutral: []
    };

    if (sentiment > 0.3) {
      signals.bullish = bullishSignals.slice(0, Math.floor(Math.random() * 3) + 1);
    } else if (sentiment < -0.3) {
      signals.bearish = bearishSignals.slice(0, Math.floor(Math.random() * 3) + 1);
    } else {
      signals.neutral = neutralSignals.slice(0, Math.floor(Math.random() * 2) + 1);
    }

    return signals;
  }

  /**
   * Generate mock news articles
   */
  private generateMockNews(symbol: string): NewsArticle[] {
    const templates = [
      {
        positive: `${symbol} beats earnings expectations, guides higher for next quarter`,
        negative: `${symbol} misses revenue targets amid challenging market conditions`,
        neutral: `${symbol} announces executive changes in strategic reorganization`
      },
      {
        positive: `Analysts upgrade ${symbol} to Buy on strong growth prospects`,
        negative: `${symbol} faces regulatory scrutiny over business practices`,
        neutral: `${symbol} to report earnings next week, analysts divided`
      },
      {
        positive: `${symbol} launches innovative product, stock jumps in pre-market`,
        negative: `Competition heats up as rivals challenge ${symbol}'s market share`,
        neutral: `${symbol} explores strategic partnerships in key markets`
      }
    ];

    const sources = ['Reuters', 'Bloomberg', 'CNBC', 'WSJ', 'Financial Times', 'MarketWatch'];
    const articles: NewsArticle[] = [];
    
    for (let i = 0; i < 5; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const sentimentType = Math.random() > 0.5 ? 'positive' : Math.random() > 0.5 ? 'negative' : 'neutral';
      const sentimentScore = sentimentType === 'positive' ? 0.3 + Math.random() * 0.5 :
                           sentimentType === 'negative' ? -0.8 + Math.random() * 0.5 :
                           -0.2 + Math.random() * 0.4;

      articles.push({
        id: `news-${symbol}-${i}`,
        title: template[sentimentType as keyof typeof template],
        content: this.generateMockContent(sentimentType),
        source: sources[Math.floor(Math.random() * sources.length)],
        publishedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        symbols: [symbol],
        sentiment: sentimentScore,
        keywords: this.extractKeywords(sentimentType),
        url: `https://example.com/news/${symbol}-${i}`
      });
    }

    this.newsCache.set(symbol, articles);
    return articles;
  }

  /**
   * Generate mock article content
   */
  private generateMockContent(sentimentType: string): string {
    const contents = {
      positive: 'The company reported strong quarterly results, exceeding analyst expectations across all key metrics. Management expressed confidence in continued growth momentum.',
      negative: 'Concerns mount as the company faces headwinds from multiple fronts. Analysts are reassessing their outlook amid growing uncertainty.',
      neutral: 'The company continues to execute on its strategic initiatives while navigating a complex market environment. Results were mixed but in line with guidance.'
    };
    return contents[sentimentType as keyof typeof contents] || contents.neutral;
  }

  /**
   * Extract keywords based on sentiment
   */
  private extractKeywords(sentimentType: string): string[] {
    const keywords = {
      positive: ['growth', 'beat', 'strong', 'momentum', 'upgrade'],
      negative: ['miss', 'concern', 'decline', 'weakness', 'downgrade'],
      neutral: ['steady', 'mixed', 'guidance', 'outlook', 'forecast']
    };
    return keywords[sentimentType as keyof typeof keywords] || keywords.neutral;
  }

  /**
   * Generate mock social media posts
   */
  private generateMockSocialPosts(symbol: string): SocialPost[] {
    const posts: SocialPost[] = [];
    const platforms: Array<'twitter' | 'reddit' | 'stocktwits'> = ['twitter', 'reddit', 'stocktwits'];
    
    for (let i = 0; i < 10; i++) {
      const sentiment = Math.random() - 0.5;
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      
      posts.push({
        id: `social-${symbol}-${i}`,
        text: this.generateSocialText(symbol, sentiment),
        author: `user${Math.floor(Math.random() * 10000)}`,
        platform,
        timestamp: new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000),
        engagement: {
          likes: Math.floor(Math.random() * 1000),
          shares: Math.floor(Math.random() * 100),
          comments: Math.floor(Math.random() * 50)
        },
        sentiment: sentiment * 2, // Scale to -1 to 1
        symbols: [symbol]
      });
    }

    this.socialCache.set(symbol, posts);
    return posts;
  }

  /**
   * Generate realistic social media text
   */
  private generateSocialText(symbol: string, sentiment: number): string {
    const bullishPosts = [
      `$${symbol} looking strong here! Breaking out of consolidation 🚀`,
      `Loading up on $${symbol} before earnings. This is going to moon! 💎🙌`,
      `$${symbol} chart setup is beautiful. Target $XXX by EOY`,
      `Just bought more $${symbol}. Thank me later 📈`
    ];

    const bearishPosts = [
      `$${symbol} is overvalued. Taking profits here 📉`,
      `Warning: $${symbol} showing weakness. Support broken`,
      `Shorting $${symbol} here. This rally is fake`,
      `$${symbol} bagholders in denial. This is going lower`
    ];

    const neutralPosts = [
      `Watching $${symbol} for a breakout. Could go either way`,
      `$${symbol} consolidating. Waiting for direction`,
      `What's everyone's thoughts on $${symbol}?`,
      `$${symbol} earnings next week. Playing it safe`
    ];

    if (sentiment > 0.3) {
      return bullishPosts[Math.floor(Math.random() * bullishPosts.length)];
    } else if (sentiment < -0.3) {
      return bearishPosts[Math.floor(Math.random() * bearishPosts.length)];
    } else {
      return neutralPosts[Math.floor(Math.random() * neutralPosts.length)];
    }
  }

  /**
   * Get current sentiment for a symbol
   */
  getSentiment(symbol: string): SentimentData | null {
    const cached = this.sentimentCache.get(symbol.toUpperCase());
    
    // Refresh if data is older than 5 minutes
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached;
    }
    
    // Generate fresh data
    return this.generateMockSentiment(symbol.toUpperCase());
  }

  /**
   * Get sentiment for multiple symbols
   */
  getMultipleSentiments(symbols: string[]): SentimentData[] {
    return symbols
      .map(symbol => this.getSentiment(symbol))
      .filter((s): s is SentimentData => s !== null);
  }

  /**
   * Get news for a symbol
   */
  getNews(symbol: string, limit: number = 10): NewsArticle[] {
    const news = this.newsCache.get(symbol.toUpperCase()) || [];
    return news.slice(0, limit);
  }

  /**
   * Get social posts for a symbol
   */
  getSocialPosts(symbol: string, platform?: string, limit: number = 20): SocialPost[] {
    let posts = this.socialCache.get(symbol.toUpperCase()) || [];
    
    if (platform) {
      posts = posts.filter(p => p.platform === platform);
    }
    
    return posts.slice(0, limit);
  }

  /**
   * Get sentiment trend over time
   */
  getSentimentTrend(symbol: string, period: '1H' | '1D' | '1W' | '1M' = '1D'): SentimentTrend {
    const points = period === '1H' ? 12 : period === '1D' ? 24 : period === '1W' ? 7 : 30;
    const data = [];
    
    const currentSentiment = this.getSentiment(symbol);
    const baseSentiment = currentSentiment?.sentiment || 0;
    
    for (let i = points; i >= 0; i--) {
      const timestamp = Date.now() - (i * this.getPeriodMillis(period) / points);
      const variation = (Math.random() - 0.5) * 0.2;
      const sentiment = baseSentiment + variation * (1 - i / points);
      
      data.push({
        timestamp,
        sentiment: Math.max(-1, Math.min(1, sentiment)),
        volume: Math.floor(Math.random() * 1000) + 500
      });
    }
    
    const firstValue = data[0].sentiment;
    const lastValue = data[data.length - 1].sentiment;
    const change = lastValue - firstValue;
    const changePercent = firstValue !== 0 ? (change / Math.abs(firstValue)) * 100 : 0;
    
    return {
      symbol: symbol.toUpperCase(),
      period,
      data,
      change: {
        value: change,
        percent: changePercent,
        trend: change > 0.1 ? 'improving' : change < -0.1 ? 'declining' : 'stable'
      }
    };
  }

  /**
   * Get period in milliseconds
   */
  private getPeriodMillis(period: string): number {
    const periods: Record<string, number> = {
      '1H': 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000
    };
    return periods[period] || periods['1D'];
  }

  /**
   * Calculate aggregate market sentiment
   */
  getMarketSentiment(): {
    overall: number;
    bullishPercent: number;
    bearishPercent: number;
    topBullish: string[];
    topBearish: string[];
  } {
    const allSentiments = Array.from(this.sentimentCache.values());
    
    const overall = allSentiments.reduce((sum, s) => sum + s.sentiment, 0) / allSentiments.length;
    const bullish = allSentiments.filter(s => s.sentiment > 0.3);
    const bearish = allSentiments.filter(s => s.sentiment < -0.3);
    
    const topBullish = bullish
      .sort((a, b) => b.sentiment - a.sentiment)
      .slice(0, 3)
      .map(s => s.symbol);
    
    const topBearish = bearish
      .sort((a, b) => a.sentiment - b.sentiment)
      .slice(0, 3)
      .map(s => s.symbol);
    
    return {
      overall,
      bullishPercent: (bullish.length / allSentiments.length) * 100,
      bearishPercent: (bearish.length / allSentiments.length) * 100,
      topBullish,
      topBearish
    };
  }

  /**
   * Start real-time sentiment updates
   */
  startRealTimeUpdates(updateFrequency: number = 30000) {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      // Update sentiments with small variations
      this.sentimentCache.forEach((sentiment, symbol) => {
        const variation = (Math.random() - 0.5) * 0.1;
        sentiment.sentiment = Math.max(-1, Math.min(1, sentiment.sentiment + variation));
        sentiment.timestamp = Date.now();
        
        // Emit update event
        this.emit('sentiment-update', {
          symbol,
          sentiment: sentiment.sentiment,
          change: variation
        });
      });

      // Emit market sentiment update
      this.emit('market-sentiment', this.getMarketSentiment());
    }, updateFrequency);

    logger.info(`Started real-time sentiment updates every ${updateFrequency}ms`);
  }

  /**
   * Stop real-time updates
   */
  stopRealTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Stopped real-time sentiment updates');
    }
  }

  /**
   * Analyze text sentiment (mock implementation)
   */
  analyzeText(text: string): {
    sentiment: number;
    confidence: number;
    keywords: string[];
  } {
    let score = 0;
    let matchedKeywords: string[] = [];

    // Check bullish keywords
    Object.entries(this.sentimentKeywords.bullish).forEach(([strength, keywords]) => {
      keywords.forEach(keyword => {
        if (text.toLowerCase().includes(keyword)) {
          score += strength === 'strong' ? 0.5 : strength === 'moderate' ? 0.3 : 0.1;
          matchedKeywords.push(keyword);
        }
      });
    });

    // Check bearish keywords
    Object.entries(this.sentimentKeywords.bearish).forEach(([strength, keywords]) => {
      keywords.forEach(keyword => {
        if (text.toLowerCase().includes(keyword)) {
          score -= strength === 'strong' ? 0.5 : strength === 'moderate' ? 0.3 : 0.1;
          matchedKeywords.push(keyword);
        }
      });
    });

    return {
      sentiment: Math.max(-1, Math.min(1, score)),
      confidence: Math.min(1, matchedKeywords.length * 0.2),
      keywords: matchedKeywords
    };
  }
}