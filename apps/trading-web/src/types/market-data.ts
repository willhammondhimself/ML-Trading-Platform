import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Type-Safe Market Data Contracts and Schemas
 * 
 * Comprehensive type definitions for multi-provider market data integration
 * with Zod validation schemas for runtime type safety
 */

// Base Types
export type MarketDataProvider = 'alpha_vantage' | 'polygon' | 'iex' | 'finnhub' | 'yahoo' | 'quandl' | 'newsapi' | 'twitter';
export type DataFrequency = '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' | '1day' | '1week' | '1month';
export type AssetType = 'stock' | 'forex' | 'crypto' | 'commodity' | 'index' | 'option' | 'future';
export type DataQuality = 'real_time' | 'delayed_15min' | 'delayed_20min' | 'end_of_day' | 'historical';

// Validation Schemas
export const DecimalSchema = z.string().transform(val => new Decimal(val));
export const TimestampSchema = z.number().int().positive();
export const SymbolSchema = z.string().min(1).max(20).regex(/^[A-Z0-9.-]+$/);

// Price Data Schemas
export const PriceDataSchema = z.object({
  symbol: SymbolSchema,
  timestamp: TimestampSchema,
  open: DecimalSchema,
  high: DecimalSchema,
  low: DecimalSchema,
  close: DecimalSchema,
  volume: z.number().nonnegative(),
  adjustedClose: DecimalSchema.optional(),
  vwap: DecimalSchema.optional(),
  trades: z.number().optional(),
  quality: z.enum(['real_time', 'delayed_15min', 'delayed_20min', 'end_of_day', 'historical']),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

export const QuoteDataSchema = z.object({
  symbol: SymbolSchema,
  timestamp: TimestampSchema,
  bid: DecimalSchema,
  ask: DecimalSchema,
  bidSize: z.number().nonnegative(),
  askSize: z.number().nonnegative(),
  last: DecimalSchema,
  lastSize: z.number().nonnegative(),
  change: DecimalSchema.optional(),
  changePercent: DecimalSchema.optional(),
  quality: z.enum(['real_time', 'delayed_15min', 'delayed_20min', 'end_of_day', 'historical']),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

export const TradeDataSchema = z.object({
  symbol: SymbolSchema,
  timestamp: TimestampSchema,
  price: DecimalSchema,
  size: z.number().positive(),
  exchange: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  tradeId: z.string().optional(),
  quality: z.enum(['real_time', 'delayed_15min', 'delayed_20min', 'end_of_day', 'historical']),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// Order Book Schema
export const OrderBookLevelSchema = z.object({
  price: DecimalSchema,
  size: z.number().nonnegative(),
  orders: z.number().optional()
});

export const OrderBookDataSchema = z.object({
  symbol: SymbolSchema,
  timestamp: TimestampSchema,
  bids: z.array(OrderBookLevelSchema),
  asks: z.array(OrderBookLevelSchema),
  sequence: z.number().optional(),
  quality: z.enum(['real_time', 'delayed_15min', 'delayed_20min', 'end_of_day', 'historical']),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// Company Information Schema
export const CompanyInfoSchema = z.object({
  symbol: SymbolSchema,
  name: z.string(),
  description: z.string().optional(),
  exchange: z.string(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  marketCap: z.number().optional(),
  peRatio: DecimalSchema.optional(),
  dividendYield: DecimalSchema.optional(),
  beta: DecimalSchema.optional(),
  lastUpdated: TimestampSchema,
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// News Data Schema
export const NewsDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  content: z.string().optional(),
  author: z.string().optional(),
  source: z.string(),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  publishedAt: TimestampSchema,
  symbols: z.array(SymbolSchema),
  sentiment: z.object({
    score: z.number().min(-1).max(1),
    label: z.enum(['positive', 'neutral', 'negative']),
    confidence: z.number().min(0).max(1)
  }).optional(),
  topics: z.array(z.string()).optional(),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// Social Media Schema
export const SocialDataSchema = z.object({
  id: z.string(),
  platform: z.enum(['twitter', 'reddit', 'stocktwits', 'linkedin']),
  content: z.string(),
  author: z.string(),
  authorFollowers: z.number().optional(),
  timestamp: TimestampSchema,
  symbols: z.array(SymbolSchema),
  sentiment: z.object({
    score: z.number().min(-1).max(1),
    label: z.enum(['positive', 'neutral', 'negative']),
    confidence: z.number().min(0).max(1)
  }),
  engagement: z.object({
    likes: z.number().nonnegative(),
    shares: z.number().nonnegative(),
    comments: z.number().nonnegative()
  }).optional(),
  hashtags: z.array(z.string()).optional(),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// Economic Indicators Schema
export const EconomicIndicatorSchema = z.object({
  indicator: z.string(),
  country: z.string(),
  value: DecimalSchema,
  previousValue: DecimalSchema.optional(),
  unit: z.string(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  releaseDate: TimestampSchema,
  nextReleaseDate: TimestampSchema.optional(),
  importance: z.enum(['low', 'medium', 'high']),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter'])
});

// Type Definitions from Schemas
export type PriceData = z.infer<typeof PriceDataSchema>;
export type QuoteData = z.infer<typeof QuoteDataSchema>;
export type TradeData = z.infer<typeof TradeDataSchema>;
export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;
export type OrderBookData = z.infer<typeof OrderBookDataSchema>;
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;
export type NewsData = z.infer<typeof NewsDataSchema>;
export type SocialData = z.infer<typeof SocialDataSchema>;
export type EconomicIndicator = z.infer<typeof EconomicIndicatorSchema>;

// API Response Schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.string().optional(),
  metadata: z.object({
    timestamp: TimestampSchema,
    provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']),
    rateLimitRemaining: z.number().optional(),
    rateLimitReset: TimestampSchema.optional(),
    requestId: z.string().optional(),
    cached: z.boolean().optional(),
    cacheExpiry: TimestampSchema.optional()
  })
});

export const PaginatedResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    items: z.array(z.unknown()),
    pagination: z.object({
      page: z.number().positive(),
      pageSize: z.number().positive(),
      totalPages: z.number().nonnegative(),
      totalItems: z.number().nonnegative(),
      hasNext: z.boolean(),
      hasPrevious: z.boolean()
    })
  })
});

export type ApiResponse<T = unknown> = z.infer<typeof ApiResponseSchema> & {
  data: T;
};

export type PaginatedResponse<T = unknown> = z.infer<typeof PaginatedResponseSchema> & {
  data: {
    items: T[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  };
};

// Market Data Request Schemas
export const HistoricalDataRequestSchema = z.object({
  symbol: SymbolSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(['1min', '5min', '15min', '30min', '1hour', '4hour', '1day', '1week', '1month']),
  adjusted: z.boolean().optional().default(true),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']).optional()
});

export const RealTimeDataRequestSchema = z.object({
  symbols: z.array(SymbolSchema),
  dataTypes: z.array(z.enum(['quote', 'trade', 'orderbook'])),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']).optional()
});

export const NewsRequestSchema = z.object({
  symbols: z.array(SymbolSchema).optional(),
  topics: z.array(z.string()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']).optional()
});

export type HistoricalDataRequest = z.infer<typeof HistoricalDataRequestSchema>;
export type RealTimeDataRequest = z.infer<typeof RealTimeDataRequestSchema>;
export type NewsRequest = z.infer<typeof NewsRequestSchema>;

// Provider Configuration Schema
export const ProviderConfigSchema = z.object({
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']),
  enabled: z.boolean(),
  priority: z.number().min(1).max(10),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  rateLimit: z.object({
    requestsPerMinute: z.number().positive(),
    requestsPerHour: z.number().positive(),
    requestsPerDay: z.number().positive(),
    burstSize: z.number().positive()
  }),
  features: z.object({
    realTimeQuotes: z.boolean(),
    historicalData: z.boolean(),
    news: z.boolean(),
    social: z.boolean(),
    orderBook: z.boolean(),
    trades: z.boolean(),
    companyInfo: z.boolean(),
    economicIndicators: z.boolean()
  }),
  websocket: z.object({
    enabled: z.boolean(),
    url: z.string().url().optional(),
    maxConnections: z.number().positive().optional(),
    reconnectDelay: z.number().positive().optional()
  }).optional(),
  quality: z.enum(['real_time', 'delayed_15min', 'delayed_20min', 'end_of_day', 'historical']),
  region: z.array(z.string()).optional(),
  exchanges: z.array(z.string()).optional()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Cache Configuration Schema
export const CacheConfigSchema = z.object({
  enabled: z.boolean(),
  redis: z.object({
    host: z.string(),
    port: z.number().min(1).max(65535),
    password: z.string().optional(),
    database: z.number().min(0).max(15).optional().default(0),
    keyPrefix: z.string().optional().default('market-data:'),
    maxMemoryPolicy: z.enum(['allkeys-lru', 'volatile-lru', 'allkeys-lfu', 'volatile-lfu']).optional()
  }),
  ttl: z.object({
    realTime: z.number().positive().default(5), // 5 seconds
    historical: z.number().positive().default(3600), // 1 hour
    companyInfo: z.number().positive().default(86400), // 1 day
    news: z.number().positive().default(1800), // 30 minutes
    social: z.number().positive().default(300) // 5 minutes
  }),
  compression: z.object({
    enabled: z.boolean().default(true),
    algorithm: z.enum(['gzip', 'lz4', 'snappy']).default('lz4'),
    threshold: z.number().positive().default(1024) // bytes
  })
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;

// Market Data Service Configuration
export const MarketDataServiceConfigSchema = z.object({
  providers: z.array(ProviderConfigSchema),
  cache: CacheConfigSchema,
  fallback: z.object({
    enabled: z.boolean(),
    maxRetries: z.number().min(1).max(5),
    retryDelay: z.number().positive(),
    fallbackOrder: z.array(z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']))
  }),
  normalization: z.object({
    enabled: z.boolean(),
    timezone: z.string().default('UTC'),
    decimalPrecision: z.number().min(2).max(10).default(4),
    volumeNormalization: z.boolean().default(true),
    currencyConversion: z.boolean().default(false),
    baseCurrency: z.string().default('USD')
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    metricsRetention: z.number().positive().default(86400), // 24 hours
    alertThresholds: z.object({
      errorRate: z.number().min(0).max(100).default(5), // 5%
      latency: z.number().positive().default(1000), // 1 second
      rateLimitUtilization: z.number().min(0).max(100).default(80) // 80%
    })
  })
});

export type MarketDataServiceConfig = z.infer<typeof MarketDataServiceConfigSchema>;

// Error Schemas
export const MarketDataErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  provider: z.enum(['alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl', 'newsapi', 'twitter']).optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: TimestampSchema,
  retryable: z.boolean(),
  rateLimited: z.boolean().optional()
});

export type MarketDataError = z.infer<typeof MarketDataErrorSchema>;

// Validation Helper Functions
export function validatePriceData(data: unknown): PriceData {
  return PriceDataSchema.parse(data);
}

export function validateQuoteData(data: unknown): QuoteData {
  return QuoteDataSchema.parse(data);
}

export function validateTradeData(data: unknown): TradeData {
  return TradeDataSchema.parse(data);
}

export function validateOrderBookData(data: unknown): OrderBookData {
  return OrderBookDataSchema.parse(data);
}

export function validateNewsData(data: unknown): NewsData {
  return NewsDataSchema.parse(data);
}

export function validateSocialData(data: unknown): SocialData {
  return SocialDataSchema.parse(data);
}

export function validateApiResponse<T>(data: unknown): ApiResponse<T> {
  return ApiResponseSchema.parse(data) as ApiResponse<T>;
}

export function validateProviderConfig(data: unknown): ProviderConfig {
  return ProviderConfigSchema.parse(data);
}

export function validateMarketDataServiceConfig(data: unknown): MarketDataServiceConfig {
  return MarketDataServiceConfigSchema.parse(data);
}

// Type Guards
export function isPriceData(data: unknown): data is PriceData {
  return PriceDataSchema.safeParse(data).success;
}

export function isQuoteData(data: unknown): data is QuoteData {
  return QuoteDataSchema.safeParse(data).success;
}

export function isTradeData(data: unknown): data is TradeData {
  return TradeDataSchema.safeParse(data).success;
}

export function isOrderBookData(data: unknown): data is OrderBookData {
  return OrderBookDataSchema.safeParse(data).success;
}

export function isNewsData(data: unknown): data is NewsData {
  return NewsDataSchema.safeParse(data).success;
}

export function isSocialData(data: unknown): data is SocialData {
  return SocialDataSchema.safeParse(data).success;
}

// Constants
export const DEFAULT_CACHE_TTL = {
  REAL_TIME: 5, // 5 seconds
  HISTORICAL: 3600, // 1 hour
  COMPANY_INFO: 86400, // 1 day
  NEWS: 1800, // 30 minutes
  SOCIAL: 300 // 5 minutes
};

export const DEFAULT_RATE_LIMITS = {
  ALPHA_VANTAGE: { requestsPerMinute: 5, requestsPerHour: 500 },
  POLYGON: { requestsPerMinute: 1000, requestsPerHour: 100000 },
  IEX: { requestsPerMinute: 100, requestsPerHour: 10000 },
  FINNHUB: { requestsPerMinute: 60, requestsPerHour: 3600 },
  YAHOO: { requestsPerMinute: 2000, requestsPerHour: 48000 },
  QUANDL: { requestsPerMinute: 300, requestsPerHour: 50000 }
};

export const SUPPORTED_EXCHANGES = [
  'NYSE', 'NASDAQ', 'AMEX', 'LSE', 'TSE', 'HKEX', 'SSE', 'BSE', 'NSE'
] as const;

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR'
] as const;