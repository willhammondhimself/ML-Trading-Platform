import { EventEmitter } from 'events';
import {
  MarketDataProvider,
  DataQuality,
  PriceData,
  QuoteData,
  TradeData,
  OrderBookData,
  CompanyInfo,
  NewsData,
  SocialData,
  EconomicIndicator,
  HistoricalDataRequest,
  RealTimeDataRequest,
  NewsRequest,
  ApiResponse,
  PaginatedResponse,
  ProviderConfig,
  MarketDataError
} from '@/types/market-data';

/**
 * Core Market Data Provider Interfaces
 * 
 * Defines the contract for all market data providers to ensure
 * consistent behavior across different data sources
 */

// Base Provider Interface
export interface IMarketDataProvider extends EventEmitter {
  // Provider Information
  readonly name: MarketDataProvider;
  readonly quality: DataQuality;
  readonly config: ProviderConfig;
  
  // Lifecycle Management
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isHealthy(): boolean;
  getStatus(): ProviderStatus;
  
  // Historical Data
  getHistoricalPrices(request: HistoricalDataRequest): Promise<ApiResponse<PriceData[]>>;
  getHistoricalTrades?(symbol: string, startDate: string, endDate: string): Promise<ApiResponse<TradeData[]>>;
  
  // Real-time Data
  subscribeToQuotes(symbols: string[]): Promise<string>; // returns subscription ID
  subscribeToTrades(symbols: string[]): Promise<string>;
  subscribeToOrderBook?(symbols: string[]): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  
  // Company Information
  getCompanyInfo?(symbol: string): Promise<ApiResponse<CompanyInfo>>;
  searchSymbols?(query: string): Promise<ApiResponse<SymbolSearchResult[]>>;
  
  // Rate Limiting
  checkRateLimit(): RateLimitStatus;
  waitForRateLimit(): Promise<void>;
  
  // Error Handling
  handleError(error: unknown): MarketDataError;
  isRetryableError(error: MarketDataError): boolean;
}

// News Provider Interface
export interface INewsProvider extends EventEmitter {
  readonly name: MarketDataProvider;
  readonly config: ProviderConfig;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // News Data
  getNews(request: NewsRequest): Promise<PaginatedResponse<NewsData>>;
  getNewsBySymbol(symbol: string, limit?: number): Promise<ApiResponse<NewsData[]>>;
  searchNews(query: string, limit?: number): Promise<PaginatedResponse<NewsData>>;
  
  // Real-time News
  subscribeToNews(symbols?: string[]): Promise<string>;
  subscribeToKeywords(keywords: string[]): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  
  // Sentiment Analysis
  analyzeSentiment?(text: string): Promise<SentimentResult>;
  
  // Rate Limiting
  checkRateLimit(): RateLimitStatus;
  waitForRateLimit(): Promise<void>;
}

// Social Media Provider Interface
export interface ISocialProvider extends EventEmitter {
  readonly name: MarketDataProvider;
  readonly config: ProviderConfig;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Social Data
  getSocialMentions(symbols: string[], limit?: number): Promise<ApiResponse<SocialData[]>>;
  getSocialSentiment(symbol: string): Promise<ApiResponse<SocialSentimentSummary>>;
  getTrendingSymbols(): Promise<ApiResponse<TrendingSymbol[]>>;
  
  // Real-time Social Data
  subscribeToMentions(symbols: string[]): Promise<string>;
  subscribeToHashtags(hashtags: string[]): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  
  // Analytics
  getSocialMetrics(symbol: string, timeframe: string): Promise<ApiResponse<SocialMetrics>>;
  
  // Rate Limiting
  checkRateLimit(): RateLimitStatus;
  waitForRateLimit(): Promise<void>;
}

// Alternative Data Provider Interface
export interface IAlternativeDataProvider extends EventEmitter {
  readonly name: MarketDataProvider;
  readonly config: ProviderConfig;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Economic Indicators
  getEconomicIndicators(country?: string): Promise<ApiResponse<EconomicIndicator[]>>;
  getEconomicCalendar(startDate: string, endDate: string): Promise<ApiResponse<EconomicEvent[]>>;
  
  // Alternative Metrics
  getCorporateActions(symbol: string): Promise<ApiResponse<CorporateAction[]>>;
  getInsiderTrading(symbol: string): Promise<ApiResponse<InsiderTrade[]>>;
  getInstitutionalHoldings(symbol: string): Promise<ApiResponse<InstitutionalHolding[]>>;
  
  // ESG Data
  getESGScores?(symbol: string): Promise<ApiResponse<ESGScore>>;
  
  // Rate Limiting
  checkRateLimit(): RateLimitStatus;
  waitForRateLimit(): Promise<void>;
}

// Provider Events
export interface ProviderEvents {
  // Connection Events
  'connected': () => void;
  'disconnected': (reason: string) => void;
  'reconnecting': (attempt: number) => void;
  'error': (error: MarketDataError) => void;
  
  // Data Events
  'quote': (data: QuoteData) => void;
  'trade': (data: TradeData) => void;
  'orderbook': (data: OrderBookData) => void;
  'news': (data: NewsData) => void;
  'social': (data: SocialData) => void;
  
  // Rate Limiting Events
  'rate-limit-warning': (status: RateLimitStatus) => void;
  'rate-limit-exceeded': (resetTime: number) => void;
  
  // Health Events
  'health-check': (healthy: boolean, details?: any) => void;
  'status-changed': (status: ProviderStatus) => void;
}

// Supporting Types
export interface ProviderStatus {
  name: MarketDataProvider;
  healthy: boolean;
  connected: boolean;
  lastActivity: number;
  errorCount: number;
  rateLimitStatus: RateLimitStatus;
  metrics: ProviderMetrics;
  subscriptions: SubscriptionInfo[];
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetTime: number;
  resetIn: number; // seconds until reset
  blocked: boolean;
}

export interface ProviderMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  successRate: number;
  dataPointsReceived: number;
  lastRequestTime: number;
  uptime: number;
}

export interface SubscriptionInfo {
  id: string;
  type: 'quote' | 'trade' | 'orderbook' | 'news' | 'social';
  symbols: string[];
  createdAt: number;
  messageCount: number;
  lastMessage: number;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
  country: string;
  score: number;
}

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'neutral' | 'negative';
  confidence: number; // 0 to 1
  keywords: string[];
}

export interface SocialSentimentSummary {
  symbol: string;
  timestamp: number;
  overallSentiment: SentimentResult;
  volume: number;
  platforms: Record<string, {
    sentiment: SentimentResult;
    volume: number;
  }>;
  trending: boolean;
}

export interface TrendingSymbol {
  symbol: string;
  mentions: number;
  sentiment: SentimentResult;
  change: number; // percentage change in mentions
  timeframe: string;
}

export interface SocialMetrics {
  symbol: string;
  timeframe: string;
  totalMentions: number;
  uniqueAuthors: number;
  averageSentiment: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topHashtags: string[];
  topKeywords: string[];
  influencerMentions: number;
  platforms: Record<string, {
    mentions: number;
    sentiment: number;
  }>;
}

export interface EconomicEvent {
  id: string;
  name: string;
  country: string;
  category: string;
  date: number;
  impact: 'low' | 'medium' | 'high';
  forecast: string;
  previous: string;
  actual?: string;
  currency: string;
  description?: string;
}

export interface CorporateAction {
  symbol: string;
  type: 'dividend' | 'split' | 'merger' | 'spinoff' | 'delisting';
  date: number;
  exDate: number;
  paymentDate?: number;
  details: Record<string, any>;
  impact: string;
}

export interface InsiderTrade {
  symbol: string;
  insider: string;
  title: string;
  transactionType: 'buy' | 'sell';
  shares: number;
  price: number;
  value: number;
  date: number;
  filingDate: number;
  sharesOwned: number;
}

export interface InstitutionalHolding {
  symbol: string;
  institution: string;
  shares: number;
  value: number;
  percentageOfShares: number;
  percentageOfPortfolio: number;
  changeInShares: number;
  changeInValue: number;
  date: number;
  quarter: string;
}

export interface ESGScore {
  symbol: string;
  overallScore: number;
  environmentalScore: number;
  socialScore: number;
  governanceScore: number;
  industryRank: number;
  globalRank: number;
  lastUpdated: number;
  breakdown: Record<string, number>;
}

// Provider Factory Interface
export interface IProviderFactory {
  createMarketDataProvider(config: ProviderConfig): IMarketDataProvider;
  createNewsProvider(config: ProviderConfig): INewsProvider;
  createSocialProvider(config: ProviderConfig): ISocialProvider;
  createAlternativeDataProvider(config: ProviderConfig): IAlternativeDataProvider;
  
  getSupportedProviders(): MarketDataProvider[];
  getProviderCapabilities(provider: MarketDataProvider): ProviderCapabilities;
  validateConfig(config: ProviderConfig): boolean;
}

export interface ProviderCapabilities {
  realTimeQuotes: boolean;
  historicalData: boolean;
  news: boolean;
  social: boolean;
  orderBook: boolean;
  trades: boolean;
  companyInfo: boolean;
  economicIndicators: boolean;
  alternativeData: boolean;
  websocketSupport: boolean;
  rateLimitInfo: {
    requestsPerMinute: number;
    requestsPerHour: number;
    burstLimit: number;
  };
  dataQuality: DataQuality;
  supportedExchanges: string[];
  supportedAssetTypes: string[];
}

// Market Data Service Interface
export interface IMarketDataService extends EventEmitter {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Provider Management
  addProvider(config: ProviderConfig): Promise<void>;
  removeProvider(provider: MarketDataProvider): Promise<void>;
  getProviders(): IMarketDataProvider[];
  getProvider(name: MarketDataProvider): IMarketDataProvider | null;
  
  // Data Access
  getHistoricalData(request: HistoricalDataRequest): Promise<ApiResponse<PriceData[]>>;
  getCurrentQuote(symbol: string): Promise<ApiResponse<QuoteData>>;
  getCompanyInfo(symbol: string): Promise<ApiResponse<CompanyInfo>>;
  
  // Real-time Subscriptions
  subscribeToQuotes(symbols: string[]): Promise<string>;
  subscribeToTrades(symbols: string[]): Promise<string>;
  subscribeToNews(symbols?: string[]): Promise<string>;
  unsubscribeAll(): Promise<void>;
  
  // Health and Status
  getHealth(): ServiceHealth;
  getMetrics(): ServiceMetrics;
  
  // Configuration
  updateConfig(config: any): Promise<void>;
  getConfig(): any;
}

export interface ServiceHealth {
  healthy: boolean;
  issues: string[];
  providers: Record<MarketDataProvider, ProviderStatus>;
  cacheHealth: {
    connected: boolean;
    hitRate: number;
    errorRate: number;
  };
}

export interface ServiceMetrics {
  totalRequests: number;
  totalErrors: number;
  averageResponseTime: number;
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
  };
  providerMetrics: Record<MarketDataProvider, ProviderMetrics>;
  realTimeMetrics: {
    quotesPerSecond: number;
    tradesPerSecond: number;
    newsPerMinute: number;
    activeSubscriptions: number;
  };
}