/**
 * Market Data Type Definitions
 * Enterprise-grade types for financial market data
 */

import { Decimal } from 'decimal.js';

// === Core Market Data Types ===

export interface Symbol {
  symbol: string;
  exchange: string;
  assetType: AssetType;
  currency: string;
  name?: string;
  sector?: string;
  industry?: string;
}

export enum AssetType {
  STOCK = 'stock',
  ETF = 'etf',
  OPTION = 'option',
  FUTURE = 'future',
  FOREX = 'forex',
  CRYPTO = 'crypto',
  BOND = 'bond',
  COMMODITY = 'commodity'
}

export interface Price {
  value: Decimal;
  currency: string;
  timestamp: number;
  source: string;
  precision: number;
}

export interface Volume {
  value: Decimal;
  timestamp: number;
  source: string;
}

// === Real-time Data Types ===

export interface Quote {
  symbol: Symbol;
  bid: Price;
  ask: Price;
  bidSize: Volume;
  askSize: Volume;
  spread: Decimal;
  timestamp: number;
  source: DataProvider;
  quality: DataQuality;
}

export interface Trade {
  id: string;
  symbol: Symbol;
  price: Price;
  volume: Volume;
  side: TradeSide;
  timestamp: number;
  source: DataProvider;
  conditions?: string[];
  venue?: string;
  quality: DataQuality;
}

export enum TradeSide {
  BUY = 'buy',
  SELL = 'sell',
  UNKNOWN = 'unknown'
}

export interface OrderBookLevel {
  price: Price;
  size: Volume;
  orderCount?: number;
}

export interface OrderBook {
  symbol: Symbol;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  source: DataProvider;
  depth: number;
  quality: DataQuality;
}

// === Historical Data Types ===

export interface OHLCV {
  symbol: Symbol;
  open: Price;
  high: Price;
  low: Price;
  close: Price;
  volume: Volume;
  vwap?: Price;
  timestamp: number;
  period: TimePeriod;
  source: DataProvider;
  quality: DataQuality;
}

export enum TimePeriod {
  SECOND = '1s',
  MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  THIRTY_MINUTES = '30m',
  HOUR = '1h',
  FOUR_HOURS = '4h',
  DAY = '1d',
  WEEK = '1w',
  MONTH = '1M',
  YEAR = '1y'
}

export interface HistoricalDataRequest {
  symbols: string[];
  period: TimePeriod;
  startDate: Date;
  endDate: Date;
  includeAfterHours?: boolean;
  adjustedData?: boolean;
  providers?: DataProvider[];
}

// === Alternative Data Types ===

export interface NewsItem {
  id: string;
  headline: string;
  content: string;
  source: string;
  author?: string;
  timestamp: number;
  symbols: string[];
  sentiment?: SentimentScore;
  relevance: number;
  tags: string[];
  url?: string;
  imageUrl?: string;
}

export interface SentimentScore {
  score: number; // -1 to 1
  magnitude: number; // 0 to 1
  confidence: number; // 0 to 1
  source: string;
}

export interface SocialMediaPost {
  id: string;
  platform: SocialPlatform;
  content: string;
  author: string;
  timestamp: number;
  symbols: string[];
  sentiment?: SentimentScore;
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    reach?: number;
  };
  verified: boolean;
}

export enum SocialPlatform {
  TWITTER = 'twitter',
  REDDIT = 'reddit',
  STOCKTWITS = 'stocktwits',
  DISCORD = 'discord',
  TELEGRAM = 'telegram'
}

// === Data Provider Types ===

export enum DataProvider {
  ALPHA_VANTAGE = 'alpha_vantage',
  IEX_CLOUD = 'iex_cloud',
  FINNHUB = 'finnhub',
  POLYGON = 'polygon',
  YAHOO_FINANCE = 'yahoo_finance',
  BLOOMBERG = 'bloomberg',
  REUTERS = 'reuters',
  QUANDL = 'quandl',
  INTERNAL = 'internal'
}

export interface DataProviderConfig {
  provider: DataProvider;
  apiKey: string;
  baseUrl: string;
  rateLimits: RateLimit;
  endpoints: ProviderEndpoints;
  priority: number;
  enabled: boolean;
  healthCheck: HealthCheckConfig;
}

export interface RateLimit {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstSize: number;
}

export interface ProviderEndpoints {
  realtime?: string;
  historical?: string;
  news?: string;
  fundamentals?: string;
  websocket?: string;
}

export interface HealthCheckConfig {
  endpoint: string;
  interval: number;
  timeout: number;
  retries: number;
}

// === Data Quality Types ===

export interface DataQuality {
  score: number; // 0 to 1
  latency: number; // milliseconds
  completeness: number; // 0 to 1
  accuracy: number; // 0 to 1
  staleness: number; // milliseconds since last update
  provider: DataProvider;
  timestamp: number;
}

export interface DataQualityThresholds {
  minScore: number;
  maxLatency: number;
  maxStaleness: number;
  minCompleteness: number;
  minAccuracy: number;
}

// === Subscription Types ===

export interface MarketDataSubscription {
  id: string;
  symbols: string[];
  dataTypes: MarketDataType[];
  filters?: SubscriptionFilter;
  clientId: string;
  timestamp: number;
  active: boolean;
}

export enum MarketDataType {
  QUOTE = 'quote',
  TRADE = 'trade',
  ORDER_BOOK = 'orderbook',
  OHLCV = 'ohlcv',
  NEWS = 'news',
  SOCIAL = 'social',
  FUNDAMENTALS = 'fundamentals'
}

export interface SubscriptionFilter {
  priceRange?: PriceRange;
  volumeThreshold?: number;
  tradeSides?: TradeSide[];
  venues?: string[];
  minRelevance?: number;
  sentiment?: SentimentFilter;
}

export interface PriceRange {
  min: Decimal;
  max: Decimal;
}

export interface SentimentFilter {
  minScore?: number;
  maxScore?: number;
  minConfidence?: number;
}

// === Cache Types ===

export interface CacheConfig {
  defaultTTL: number;
  realtimeTTL: number;
  historicalTTL: number;
  newsTTL: number;
  maxMemoryUsage: number;
  compressionEnabled: boolean;
}

export interface CacheKey {
  provider: DataProvider;
  dataType: MarketDataType;
  symbol: string;
  period?: TimePeriod;
  timestamp?: number;
  parameters?: Record<string, any>;
}

// === API Response Types ===

export interface MarketDataResponse<T> {
  success: boolean;
  data?: T;
  error?: MarketDataError;
  metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  timestamp: number;
  source: DataProvider;
  cached: boolean;
  latency: number;
  dataQuality: DataQuality;
  rateLimitRemaining: number;
  nextUpdateTime?: number;
}

export interface MarketDataError {
  code: string;
  message: string;
  details?: any;
  retryAfter?: number;
  provider: DataProvider;
}

// === Event Types ===

export interface MarketDataEvent {
  type: MarketDataEventType;
  symbol: string;
  data: any;
  timestamp: number;
  source: DataProvider;
  quality: DataQuality;
}

export enum MarketDataEventType {
  QUOTE_UPDATE = 'quote_update',
  TRADE_EXECUTED = 'trade_executed',
  ORDER_BOOK_UPDATE = 'orderbook_update',
  OHLCV_UPDATE = 'ohlcv_update',
  NEWS_PUBLISHED = 'news_published',
  SOCIAL_POST = 'social_post',
  PROVIDER_ERROR = 'provider_error',
  DATA_STALE = 'data_stale',
  QUALITY_DEGRADED = 'quality_degraded'
}

// === Utility Types ===

export type MarketDataHandler<T = any> = (data: T) => Promise<void> | void;

export interface DataNormalizationRule {
  provider: DataProvider;
  dataType: MarketDataType;
  transform: (raw: any) => any;
  validate: (data: any) => boolean;
}

export interface ProviderFailover {
  primary: DataProvider;
  fallbacks: DataProvider[];
  switchThreshold: number;
  cooldownPeriod: number;
  autoRecovery: boolean;
}