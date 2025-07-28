/**
 * Market Data Service Types
 * Unified type exports
 */

// Core market data types
export * from './market-data';

// Provider interface types
export interface IDataProvider {
  name: string;
  priority: number;
  isHealthy(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(symbols: string[], dataTypes: MarketDataType[]): Promise<void>;
  unsubscribe(symbols: string[], dataTypes: MarketDataType[]): Promise<void>;
  getQuote(symbol: string): Promise<Quote | null>;
  getTrades(symbol: string, limit?: number): Promise<Trade[]>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook | null>;
  getHistoricalData(request: HistoricalDataRequest): Promise<OHLCV[]>;
  getNews(symbols: string[], limit?: number): Promise<NewsItem[]>;
}

export interface IDataNormalizer {
  normalize(data: any, provider: DataProvider, dataType: MarketDataType): Promise<any>;
  validate(data: any, dataType: MarketDataType): boolean;
  calculateQuality(data: any, provider: DataProvider): DataQuality;
}

export interface IDataCache {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, ttl?: number): Promise<void>;
  del(key: CacheKey): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  getStats(): CacheStats;
}

export interface ICacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  keyCount: number;
  evictions: number;
}

export interface IFailoverManager {
  getActiveProvider(dataType: MarketDataType): DataProvider;
  reportProviderHealth(provider: DataProvider, healthy: boolean): void;
  switchProvider(dataType: MarketDataType, reason: string): Promise<DataProvider>;
  getProviderStats(): Record<DataProvider, ProviderStats>;
}

export interface ProviderStats {
  uptime: number;
  errorRate: number;
  avgLatency: number;
  requestCount: number;
  lastError?: string;
  lastErrorTime?: number;
  isHealthy: boolean;
}

// Import base types
import {
  MarketDataType,
  DataProvider,
  Quote,
  Trade,
  OrderBook,
  OHLCV,
  NewsItem,
  HistoricalDataRequest,
  DataQuality,
  CacheKey
} from './market-data';

export {
  MarketDataType,
  DataProvider,
  Quote,
  Trade,
  OrderBook,
  OHLCV,
  NewsItem,
  HistoricalDataRequest,
  DataQuality,
  CacheKey
};