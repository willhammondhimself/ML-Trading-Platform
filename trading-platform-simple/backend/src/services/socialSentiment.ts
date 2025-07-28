import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface SocialMediaPost {
  id: string;
  platform: 'twitter' | 'reddit' | 'stocktwits' | 'discord' | 'youtube';
  author: string;
  content: string;
  timestamp: number;
  likes: number;
  shares: number;
  comments: number;
  followers: number;
  verified: boolean;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 to 1
  confidence: number; // 0 to 1
  symbols: string[]; // Mentioned stock symbols
  hashtags: string[];
  mentions: string[];
  influence: number; // 0-1 based on author's following and engagement
}

export interface InfluencerProfile {
  username: string;
  platform: 'twitter' | 'reddit' | 'stocktwits' | 'discord' | 'youtube';
  displayName: string;
  followers: number;
  verified: boolean;
  bio: string;
  tradingStyle: 'day_trader' | 'swing_trader' | 'long_term' | 'options' | 'crypto' | 'analyst';
  accuracy: number; // Historical prediction accuracy (0-1)
  influence: number; // Overall influence score (0-1)
  specializations: string[]; // Symbols or sectors they focus on
  lastActive: number;
  profileUrl: string;
}

export interface SentimentAnalysis {
  symbol: string;
  timestamp: number;
  totalMentions: number;
  sentiment: {
    bullish: number; // percentage
    bearish: number; // percentage
    neutral: number; // percentage
  };
  sentimentScore: number; // Weighted average sentiment (-1 to 1)
  confidence: number; // 0-1 confidence in analysis
  momentum: 'increasing' | 'decreasing' | 'stable';
  momentumStrength: number; // 0-1
  platforms: {
    twitter: { mentions: number; sentiment: number };
    reddit: { mentions: number; sentiment: number };
    stocktwits: { mentions: number; sentiment: number };
    discord: { mentions: number; sentiment: number };
    youtube: { mentions: number; sentiment: number };
  };
  topInfluencers: {
    username: string;
    platform: string;
    sentiment: string;
    influence: number;
    post: string;
  }[];
  keyThemes: {
    theme: string;
    mentions: number;
    sentiment: number;
  }[];
  viralContent: SocialMediaPost[];
  anomalyScore: number; // How unusual current sentiment is
}

export interface TrendingTopic {
  topic: string;
  mentions: number;
  sentiment: number;
  platforms: string[];
  symbols: string[];
  growth: number; // mentions growth rate
  peaked: boolean; // whether trend is past peak
  timeToLive: number; // estimated hours until trend dies
  relatedTopics: string[];
}

export interface SocialSignal {
  symbol: string;
  signal: 'buy' | 'sell' | 'hold';
  strength: number; // 0-1
  reasoning: string;
  confidence: number; // 0-1
  timeframe: '1h' | '4h' | '1d' | '3d';
  sources: {
    influencerSignals: number;
    retailSentiment: number;
    volumeSpike: number;
    viralContent: number;
  };
  riskFactors: string[];
  supportingEvidence: string[];
}

export class SocialSentimentService extends EventEmitter {
  private influencers: Map<string, InfluencerProfile> = new Map();
  private recentPosts: SocialMediaPost[] = [];
  private sentimentHistory: Map<string, SentimentAnalysis[]> = new Map();
  private trendingTopics: TrendingTopic[] = [];
  private socialSignals: Map<string, SocialSignal> = new Map();

  // Mock influencers data
  private readonly MOCK_INFLUENCERS: InfluencerProfile[] = [
    {
      username: 'DeepFuckingValue',
      platform: 'reddit',
      displayName: 'Keith Gill (Roaring Kitty)',
      followers: 2500000,
      verified: true,
      bio: 'Not a financial advisor. I like the stock.',
      tradingStyle: 'long_term',
      accuracy: 0.78,
      influence: 0.95,
      specializations: ['GME', 'VALUE_INVESTING'],
      lastActive: Date.now() - 2 * 60 * 60 * 1000,
      profileUrl: 'https://reddit.com/u/DeepFuckingValue'
    },
    {
      username: 'elonmusk',
      platform: 'twitter',
      displayName: 'Elon Musk',
      followers: 150000000,
      verified: true,
      bio: 'CEO Tesla, SpaceX, Neuralink, Boring Company',
      tradingStyle: 'long_term',
      accuracy: 0.65,
      influence: 1.0,
      specializations: ['TSLA', 'CRYPTO', 'TECH'],
      lastActive: Date.now() - 30 * 60 * 1000,
      profileUrl: 'https://twitter.com/elonmusk'
    },
    {
      username: 'WallStBets',
      platform: 'reddit',
      displayName: 'r/wallstreetbets',
      followers: 12000000,
      verified: false,
      bio: 'Like 4chan found a Bloomberg Terminal',
      tradingStyle: 'day_trader',
      accuracy: 0.45,
      influence: 0.85,
      specializations: ['MEME_STOCKS', 'OPTIONS'],
      lastActive: Date.now() - 5 * 60 * 1000,
      profileUrl: 'https://reddit.com/r/wallstreetbets'
    },
    {
      username: 'jimcramer',
      platform: 'twitter',
      displayName: 'Jim Cramer',
      followers: 2000000,
      verified: true,
      bio: 'Host of Mad Money on CNBC',
      tradingStyle: 'analyst',
      accuracy: 0.52,
      influence: 0.75,
      specializations: ['GENERAL_MARKET'],
      lastActive: Date.now() - 1 * 60 * 60 * 1000,
      profileUrl: 'https://twitter.com/jimcramer'
    },
    {
      username: 'chamath',
      platform: 'twitter',
      displayName: 'Chamath Palihapitiya',
      followers: 1500000,
      verified: true,
      bio: 'Founder and CEO of Social Capital',
      tradingStyle: 'long_term',
      accuracy: 0.68,
      influence: 0.80,
      specializations: ['SPAC', 'TECH', 'GROWTH'],
      lastActive: Date.now() - 4 * 60 * 60 * 1000,
      profileUrl: 'https://twitter.com/chamath'
    },
    {
      username: 'KerrisdaleCap',
      platform: 'twitter',
      displayName: 'Kerrisdale Capital',
      followers: 75000,
      verified: true,
      bio: 'Investment management firm',
      tradingStyle: 'analyst',
      accuracy: 0.72,
      influence: 0.65,
      specializations: ['SHORT_SELLING', 'RESEARCH'],
      lastActive: Date.now() - 6 * 60 * 60 * 1000,
      profileUrl: 'https://twitter.com/KerrisdaleCap'
    }
  ];

  constructor() {
    super();
    this.initializeInfluencers();
    this.generateMockPosts();
    this.analyzeSentiment();
    this.generateTrendingTopics();
    this.generateSocialSignals();
    logger.info('Social Sentiment Service initialized');
  }

  /**
   * Initialize influencer profiles
   */
  private initializeInfluencers(): void {
    this.MOCK_INFLUENCERS.forEach(influencer => {
      const key = `${influencer.platform}_${influencer.username}`;
      this.influencers.set(key, influencer);
    });
  }

  /**
   * Generate mock social media posts
   */
  private generateMockPosts(): void {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'GME', 'AMC', 'SPY'];
    const platforms: ('twitter' | 'reddit' | 'stocktwits' | 'discord' | 'youtube')[] = 
      ['twitter', 'reddit', 'stocktwits', 'discord', 'youtube'];
    
    const bullishPhrases = [
      'to the moon!', 'diamond hands', 'bullish AF', 'this is the way', 'buy the dip',
      'rocket ship ready', 'printing money', 'absolute unit', 'generational opportunity',
      'loading up', 'all in', 'can\'t go wrong', 'free money', 'calls are printing'
    ];
    
    const bearishPhrases = [
      'puts are printing', 'overvalued garbage', 'dump incoming', 'dead cat bounce',
      'bear trap avoided', 'short squeeze over', 'bubble bursting', 'rugpull incoming',
      'recession incoming', 'sell everything', 'crash imminent', 'peak euphoria'
    ];
    
    const neutralPhrases = [
      'watching from sidelines', 'waiting for confirmation', 'mixed signals',
      'too early to tell', 'need more data', 'holding my position',
      'market is uncertain', 'range bound', 'consolidation phase'
    ];

    // Generate 500 recent posts
    for (let i = 0; i < 500; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const timestamp = Date.now() - Math.random() * 24 * 60 * 60 * 1000; // Last 24 hours
      
      // Determine sentiment and select phrase
      const sentimentRoll = Math.random();
      let sentiment: 'bullish' | 'bearish' | 'neutral';
      let phrases: string[];
      let sentimentScore: number;
      
      if (sentimentRoll < 0.45) {
        sentiment = 'bullish';
        phrases = bullishPhrases;
        sentimentScore = 0.3 + Math.random() * 0.7;
      } else if (sentimentRoll < 0.75) {
        sentiment = 'bearish';
        phrases = bearishPhrases;
        sentimentScore = -0.3 - Math.random() * 0.7;
      } else {
        sentiment = 'neutral';
        phrases = neutralPhrases;
        sentimentScore = (Math.random() - 0.5) * 0.4;
      }
      
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const content = `$${symbol} ${phrase} ${this.generateRandomContent()}`;
      
      // Get random influencer or generate random user
      const isInfluencer = Math.random() < 0.1;
      let author: string, followers: number, verified: boolean, influence: number;
      
      if (isInfluencer) {
        const influencerList = Array.from(this.influencers.values()).filter(inf => inf.platform === platform);
        if (influencerList.length > 0) {
          const influencer = influencerList[Math.floor(Math.random() * influencerList.length)];
          author = influencer.username;
          followers = influencer.followers;
          verified = influencer.verified;
          influence = influencer.influence;
        } else {
          author = this.generateRandomUsername();
          followers = Math.floor(Math.random() * 10000);
          verified = false;
          influence = followers / 1000000;
        }
      } else {
        author = this.generateRandomUsername();
        followers = Math.floor(Math.random() * 10000);
        verified = Math.random() < 0.05;
        influence = Math.min(1.0, followers / 1000000 + (verified ? 0.1 : 0));
      }
      
      const post: SocialMediaPost = {
        id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        platform,
        author,
        content,
        timestamp,
        likes: Math.floor(Math.random() * (followers / 100 + 1)),
        shares: Math.floor(Math.random() * (followers / 500 + 1)),
        comments: Math.floor(Math.random() * (followers / 1000 + 1)),
        followers,
        verified,
        sentiment,
        sentimentScore,
        confidence: 0.7 + Math.random() * 0.25,
        symbols: [symbol],
        hashtags: this.generateHashtags(symbol, sentiment),
        mentions: [],
        influence
      };
      
      this.recentPosts.push(post);
    }
    
    // Sort by timestamp (newest first)
    this.recentPosts.sort((a, b) => b.timestamp - a.timestamp);
    
    // Keep only recent posts (last 24 hours)
    this.recentPosts = this.recentPosts.slice(0, 200);
  }

  /**
   * Generate random content for posts
   */
  private generateRandomContent(): string {
    const templates = [
      'Technical analysis looking strong',
      'Fundamentals are solid',
      'Chart pattern forming',
      'Volume is interesting',
      'Options flow looking spicy',
      'Earnings coming up',
      'Breaking resistance',
      'Found support',
      'Risk/reward looks good',
      'Market makers at work'
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Generate random username
   */
  private generateRandomUsername(): string {
    const prefixes = ['Bull', 'Bear', 'Diamond', 'Paper', 'Rocket', 'Moon', 'Ape', 'Smooth', 'Wrinkled', 'Chad'];
    const suffixes = ['Hands', 'Brain', 'Trader', 'Investor', 'Degen', 'Gang', 'Squad', 'Crew', 'Army', 'Force'];
    const numbers = Math.floor(Math.random() * 9999);
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${prefix}${suffix}${numbers}`;
  }

  /**
   * Generate hashtags based on symbol and sentiment
   */
  private generateHashtags(symbol: string, sentiment: string): string[] {
    const baseHashtags = [`${symbol}`, 'trading', 'stocks'];
    
    if (sentiment === 'bullish') {
      baseHashtags.push('moon', 'diamondhands', 'bullish');
    } else if (sentiment === 'bearish') {
      baseHashtags.push('puts', 'bearish', 'short');
    }
    
    if (Math.random() < 0.3) {
      baseHashtags.push('options');
    }
    
    return baseHashtags;
  }

  /**
   * Analyze sentiment for all symbols
   */
  private analyzeSentiment(): void {
    const symbols = [...new Set(this.recentPosts.flatMap(post => post.symbols))];
    
    symbols.forEach(symbol => {
      const symbolPosts = this.recentPosts.filter(post => post.symbols.includes(symbol));
      if (symbolPosts.length === 0) return;
      
      // Calculate platform-specific sentiment
      const platforms = {
        twitter: { mentions: 0, sentiment: 0 },
        reddit: { mentions: 0, sentiment: 0 },
        stocktwits: { mentions: 0, sentiment: 0 },
        discord: { mentions: 0, sentiment: 0 },
        youtube: { mentions: 0, sentiment: 0 }
      };
      
      symbolPosts.forEach(post => {
        platforms[post.platform].mentions++;
        platforms[post.platform].sentiment += post.sentimentScore * post.influence;
      });
      
      // Normalize platform sentiments
      Object.keys(platforms).forEach(platform => {
        const p = platforms[platform as keyof typeof platforms];
        if (p.mentions > 0) {
          p.sentiment = p.sentiment / p.mentions;
        }
      });
      
      // Calculate overall sentiment
      const totalMentions = symbolPosts.length;
      const weightedSentiment = symbolPosts.reduce((sum, post) => 
        sum + post.sentimentScore * post.influence, 0
      ) / symbolPosts.reduce((sum, post) => sum + post.influence, 1);
      
      // Calculate sentiment distribution
      const bullishPosts = symbolPosts.filter(p => p.sentiment === 'bullish').length;
      const bearishPosts = symbolPosts.filter(p => p.sentiment === 'bearish').length;
      const neutralPosts = symbolPosts.filter(p => p.sentiment === 'neutral').length;
      
      const sentiment = {
        bullish: (bullishPosts / totalMentions) * 100,
        bearish: (bearishPosts / totalMentions) * 100,
        neutral: (neutralPosts / totalMentions) * 100
      };
      
      // Get top influencers for this symbol
      const topInfluencers = symbolPosts
        .filter(post => post.influence > 0.1)
        .sort((a, b) => b.influence - a.influence)
        .slice(0, 5)
        .map(post => ({
          username: post.author,
          platform: post.platform,
          sentiment: post.sentiment,
          influence: post.influence,
          post: post.content.substring(0, 100) + '...'
        }));
      
      // Identify key themes
      const keyThemes = this.extractKeyThemes(symbolPosts);
      
      // Find viral content
      const viralContent = symbolPosts
        .filter(post => (post.likes + post.shares * 2) > 100)
        .sort((a, b) => (b.likes + b.shares * 2) - (a.likes + a.shares * 2))
        .slice(0, 3);
      
      // Calculate momentum
      const recentPosts = symbolPosts.filter(p => p.timestamp > Date.now() - 4 * 60 * 60 * 1000);
      const olderPosts = symbolPosts.filter(p => 
        p.timestamp <= Date.now() - 4 * 60 * 60 * 1000 && 
        p.timestamp > Date.now() - 8 * 60 * 60 * 1000
      );
      
      let momentum: 'increasing' | 'decreasing' | 'stable' = 'stable';
      let momentumStrength = 0.1;
      
      if (recentPosts.length > 0 && olderPosts.length > 0) {
        const recentSentiment = recentPosts.reduce((sum, p) => sum + p.sentimentScore, 0) / recentPosts.length;
        const olderSentiment = olderPosts.reduce((sum, p) => sum + p.sentimentScore, 0) / olderPosts.length;
        const sentimentChange = recentSentiment - olderSentiment;
        
        if (Math.abs(sentimentChange) > 0.1) {
          momentum = sentimentChange > 0 ? 'increasing' : 'decreasing';
          momentumStrength = Math.min(1.0, Math.abs(sentimentChange) * 5);
        }
      }
      
      // Calculate anomaly score
      const avgSentiment = this.getHistoricalAverageSentiment(symbol);
      const anomalyScore = Math.abs(weightedSentiment - avgSentiment) / 2; // Normalize to 0-1
      
      const analysis: SentimentAnalysis = {
        symbol,
        timestamp: Date.now(),
        totalMentions,
        sentiment,
        sentimentScore: weightedSentiment,
        confidence: Math.min(0.95, 0.5 + (totalMentions / 100) * 0.4), // More mentions = higher confidence
        momentum,
        momentumStrength,
        platforms,
        topInfluencers,
        keyThemes,
        viralContent,
        anomalyScore: Math.min(1.0, anomalyScore)
      };
      
      // Store analysis
      if (!this.sentimentHistory.has(symbol)) {
        this.sentimentHistory.set(symbol, []);
      }
      const history = this.sentimentHistory.get(symbol)!;
      history.unshift(analysis);
      
      // Keep only last 24 analysis points
      if (history.length > 24) {
        history.splice(24);
      }
    });
  }

  /**
   * Extract key themes from posts
   */
  private extractKeyThemes(posts: SocialMediaPost[]): { theme: string; mentions: number; sentiment: number }[] {
    const themes = new Map<string, {mentions: number; totalSentiment: number}>();
    
    const keywords = [
      'earnings', 'revenue', 'growth', 'dividend', 'split', 'buyback',
      'merger', 'acquisition', 'ipo', 'partnership', 'lawsuit',
      'fda approval', 'product launch', 'guidance', 'outlook',
      'recession', 'inflation', 'fed', 'rates', 'economy'
    ];
    
    posts.forEach(post => {
      const content = post.content.toLowerCase();
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          if (!themes.has(keyword)) {
            themes.set(keyword, {mentions: 0, totalSentiment: 0});
          }
          const theme = themes.get(keyword)!;
          theme.mentions++;
          theme.totalSentiment += post.sentimentScore;
        }
      });
    });
    
    return Array.from(themes.entries())
      .map(([theme, data]) => ({
        theme,
        mentions: data.mentions,
        sentiment: data.totalSentiment / data.mentions
      }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5);
  }

  /**
   * Get historical average sentiment for a symbol
   */
  private getHistoricalAverageSentiment(symbol: string): number {
    const history = this.sentimentHistory.get(symbol) || [];
    if (history.length < 2) return 0;
    
    const recentHistory = history.slice(1, 10); // Skip current, use last 9
    return recentHistory.reduce((sum, analysis) => sum + analysis.sentimentScore, 0) / recentHistory.length;
  }

  /**
   * Generate trending topics
   */
  private generateTrendingTopics(): void {
    const topics = [
      'AI Revolution', 'Electric Vehicles', 'Metaverse', 'Web3', 'Cryptocurrency',
      'Renewable Energy', 'Space Exploration', 'Biotech Breakthrough', 'Chip Shortage',
      'Supply Chain', 'Inflation Fears', 'Fed Rate Hikes', 'Earnings Season',
      'IPO Wave', 'SPAC Merger', 'Short Squeeze', 'Meme Stocks', 'Options Expiry'
    ];
    
    this.trendingTopics = topics.map(topic => {
      const mentions = Math.floor(Math.random() * 10000) + 1000;
      const sentiment = (Math.random() - 0.5) * 2; // -1 to 1
      const growth = (Math.random() - 0.3) * 200; // -60% to 140%
      const platforms = ['twitter', 'reddit', 'stocktwits'].filter(() => Math.random() > 0.3);
      const symbols = ['AAPL', 'GOOGL', 'TSLA', 'NVDA', 'META'].filter(() => Math.random() > 0.6);
      
      return {
        topic,
        mentions,
        sentiment,
        platforms,
        symbols,
        growth,
        peaked: growth < 10,
        timeToLive: Math.floor(Math.random() * 48) + 4,
        relatedTopics: topics.filter(t => t !== topic && Math.random() > 0.8).slice(0, 3)
      };
    }).sort((a, b) => b.mentions - a.mentions).slice(0, 10);
  }

  /**
   * Generate social trading signals
   */
  private generateSocialSignals(): void {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'];
    
    symbols.forEach(symbol => {
      const sentimentAnalysis = this.sentimentHistory.get(symbol);
      if (!sentimentAnalysis || sentimentAnalysis.length === 0) return;
      
      const currentSentiment = sentimentAnalysis[0];
      const historicalAvg = this.getHistoricalAverageSentiment(symbol);
      
      // Calculate signal components
      const influencerSignals = currentSentiment.topInfluencers.length > 0 ? 
        currentSentiment.topInfluencers.filter(inf => inf.sentiment === 'bullish').length / currentSentiment.topInfluencers.length : 0.5;
      
      const retailSentiment = (currentSentiment.sentimentScore + 1) / 2; // Normalize to 0-1
      const volumeSpike = currentSentiment.totalMentions > 50 ? Math.min(1, currentSentiment.totalMentions / 200) : 0.2;
      const viralContent = currentSentiment.viralContent.length > 0 ? 0.8 : 0.2;
      
      // Weighted signal calculation
      const signalScore = (
        influencerSignals * 0.3 +
        retailSentiment * 0.3 +
        volumeSpike * 0.2 +
        viralContent * 0.2
      );
      
      // Determine signal
      let signal: 'buy' | 'sell' | 'hold';
      let strength: number;
      let timeframe: '1h' | '4h' | '1d' | '3d';
      
      if (signalScore > 0.65 && currentSentiment.momentum === 'increasing') {
        signal = 'buy';
        strength = Math.min(0.95, signalScore + 0.1);
        timeframe = currentSentiment.anomalyScore > 0.5 ? '1h' : '1d';
      } else if (signalScore < 0.35 && currentSentiment.momentum === 'decreasing') {
        signal = 'sell';
        strength = Math.min(0.95, (1 - signalScore) + 0.1);
        timeframe = currentSentiment.anomalyScore > 0.5 ? '1h' : '1d';
      } else {
        signal = 'hold';
        strength = 0.1 + Math.random() * 0.3;
        timeframe = '1d';
      }
      
      // Generate reasoning
      const reasoning = this.generateSignalReasoning(symbol, currentSentiment, signal, {
        influencerSignals, retailSentiment, volumeSpike, viralContent
      });
      
      // Identify risk factors
      const riskFactors: string[] = [];
      if (currentSentiment.anomalyScore > 0.7) riskFactors.push('Unusual sentiment spike');
      if (currentSentiment.totalMentions < 10) riskFactors.push('Low mention volume');
      if (currentSentiment.confidence < 0.6) riskFactors.push('Low confidence in analysis');
      if (currentSentiment.topInfluencers.length === 0) riskFactors.push('No major influencer activity');
      
      // Supporting evidence
      const supportingEvidence: string[] = [];
      if (currentSentiment.viralContent.length > 0) supportingEvidence.push(`${currentSentiment.viralContent.length} viral posts detected`);
      if (currentSentiment.totalMentions > 100) supportingEvidence.push(`High mention volume: ${currentSentiment.totalMentions} posts`);
      if (currentSentiment.topInfluencers.length > 2) supportingEvidence.push(`${currentSentiment.topInfluencers.length} influential accounts active`);
      if (currentSentiment.momentum !== 'stable') supportingEvidence.push(`${currentSentiment.momentum} sentiment momentum`);
      
      const socialSignal: SocialSignal = {
        symbol,
        signal,
        strength,
        reasoning,
        confidence: currentSentiment.confidence,
        timeframe,
        sources: {
          influencerSignals,
          retailSentiment,
          volumeSpike,
          viralContent
        },
        riskFactors,
        supportingEvidence
      };
      
      this.socialSignals.set(symbol, socialSignal);
    });
  }

  /**
   * Generate reasoning for social signals
   */
  private generateSignalReasoning(
    symbol: string, 
    sentiment: SentimentAnalysis, 
    signal: string,
    sources: { influencerSignals: number; retailSentiment: number; volumeSpike: number; viralContent: number }
  ): string {
    const parts: string[] = [];
    
    if (signal === 'buy') {
      parts.push(`Bullish social sentiment for ${symbol} with ${sentiment.totalMentions} mentions`);
      if (sources.influencerSignals > 0.6) parts.push('Key influencers showing positive sentiment');
      if (sources.volumeSpike > 0.5) parts.push('Above-average social media activity');
      if (sources.viralContent > 0.5) parts.push('Viral content driving engagement');
      if (sentiment.sentiment.bullish > 60) parts.push(`${Math.round(sentiment.sentiment.bullish)}% bullish sentiment`);
    } else if (signal === 'sell') {
      parts.push(`Bearish social sentiment for ${symbol} with declining momentum`);
      if (sources.influencerSignals < 0.4) parts.push('Influencers turning bearish');
      if (sentiment.sentiment.bearish > 50) parts.push(`${Math.round(sentiment.sentiment.bearish)}% bearish sentiment`);
      if (sentiment.momentum === 'decreasing') parts.push('Negative sentiment momentum');
    } else {
      parts.push(`Mixed social signals for ${symbol} - no clear directional bias`);
      if (sentiment.sentiment.neutral > 40) parts.push('High neutral sentiment');
      if (sentiment.totalMentions < 20) parts.push('Low social media activity');
    }
    
    return parts.join('. ') + '.';
  }

  /**
   * Get sentiment analysis for a symbol
   */
  getSentimentAnalysis(symbol: string, hours: number = 24): SentimentAnalysis[] {
    const history = this.sentimentHistory.get(symbol.toUpperCase()) || [];
    const since = Date.now() - hours * 60 * 60 * 1000;
    return history.filter(analysis => analysis.timestamp >= since);
  }

  /**
   * Get all sentiment analyses
   */
  getAllSentimentAnalyses(): SentimentAnalysis[] {
    const allAnalyses: SentimentAnalysis[] = [];
    this.sentimentHistory.forEach(analyses => {
      if (analyses.length > 0) {
        allAnalyses.push(analyses[0]); // Get latest for each symbol
      }
    });
    return allAnalyses.sort((a, b) => b.totalMentions - a.totalMentions);
  }

  /**
   * Get recent posts
   */
  getRecentPosts(symbol?: string, platform?: string, limit: number = 50): SocialMediaPost[] {
    let posts = this.recentPosts;
    
    if (symbol) {
      posts = posts.filter(post => post.symbols.includes(symbol.toUpperCase()));
    }
    
    if (platform) {
      posts = posts.filter(post => post.platform === platform);
    }
    
    return posts.slice(0, limit);
  }

  /**
   * Get trending topics
   */
  getTrendingTopics(): TrendingTopic[] {
    return [...this.trendingTopics];
  }

  /**
   * Get social trading signals
   */
  getSocialSignals(): SocialSignal[] {
    return Array.from(this.socialSignals.values())
      .sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get social signal for specific symbol
   */
  getSocialSignal(symbol: string): SocialSignal | null {
    return this.socialSignals.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get influencer profiles
   */
  getInfluencers(platform?: string): InfluencerProfile[] {
    const allInfluencers = Array.from(this.influencers.values());
    return platform ? allInfluencers.filter(inf => inf.platform === platform) : allInfluencers;
  }

  /**
   * Start real-time social sentiment updates
   */
  startRealTimeUpdates(intervalMs: number = 60000): void { // 1 minute default
    logger.info('Starting real-time social sentiment updates');
    
    const updateSentiment = () => {
      try {
        // Generate new posts
        this.generateMockPosts();
        
        // Re-analyze sentiment
        this.analyzeSentiment();
        
        // Update trending topics
        this.generateTrendingTopics();
        
        // Generate new signals
        this.generateSocialSignals();
        
        // Emit updates
        this.emit('sentiment-updated', {
          timestamp: Date.now(),
          totalPosts: this.recentPosts.length,
          analyses: this.getAllSentimentAnalyses().length,
          signals: this.getSocialSignals().length
        });
        
        logger.info('Social sentiment data updated');
        
      } catch (error) {
        logger.error('Error updating social sentiment:', error);
      }
    };
    
    // Initial update
    updateSentiment();
    
    // Set up interval
    setInterval(updateSentiment, intervalMs);
  }
}