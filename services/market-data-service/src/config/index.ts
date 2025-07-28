/**
 * Market Data Service Configuration
 * Environment-based configuration with Zod validation
 */

import { z } from 'zod';
import { DataProvider } from '../types';

// === Configuration Schemas ===

const ServiceConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().default(3002),
  metricsPort: z.number().default(9092),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(6379),
  password: z.string().optional(),
  database: z.number().default(1),
  keyPrefix: z.string().default('market-data:'),
  maxRetryAttempts: z.number().default(3),
  retryDelayOnFailover: z.number().default(100),
  connectTimeout: z.number().default(10000),
  commandTimeout: z.number().default(5000)
});

const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  database: z.string().default('trading_platform'),
  username: z.string().default('trading_user'),
  password: z.string().default('trading_password'),
  ssl: z.boolean().default(false),
  pool: z.object({
    min: z.number().default(2),
    max: z.number().default(10),
    idle: z.number().default(10000)
  }).default({})
});

const InfluxDBConfigSchema = z.object({
  url: z.string().default('http://localhost:8086'),
  token: z.string(),
  org: z.string().default('trading-platform'),
  bucket: z.string().default('market-data'),
  timeout: z.number().default(10000),
  retries: z.number().default(3),
  batchSize: z.number().default(5000),
  flushInterval: z.number().default(1000)
});

const KafkaConfigSchema = z.object({
  clientId: z.string().default('market-data-service'),
  brokers: z.array(z.string()).default(['localhost:9092']),
  groupId: z.string().default('market-data-consumers'),
  topics: z.object({
    quotes: z.string().default('market.quotes'),
    trades: z.string().default('market.trades'),
    orderbook: z.string().default('market.orderbook'),
    news: z.string().default('market.news'),
    social: z.string().default('market.social'),
    quality: z.string().default('market.quality')
  }).default({})
});

const DataProviderConfigSchema = z.object({
  provider: z.nativeEnum(DataProvider),
  apiKey: z.string(),
  baseUrl: z.string(),
  enabled: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  rateLimits: z.object({
    requestsPerSecond: z.number().default(10),
    requestsPerMinute: z.number().default(500),
    requestsPerHour: z.number().default(10000),
    requestsPerDay: z.number().default(200000),
    burstSize: z.number().default(20)
  }).default({}),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().default(60000),
    timeout: z.number().default(10000),
    endpoint: z.string().optional()
  }).default({})
});

const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTTL: z.number().default(300), // 5 minutes
  realtimeTTL: z.number().default(5), // 5 seconds
  historicalTTL: z.number().default(3600), // 1 hour
  newsTTL: z.number().default(300), // 5 minutes
  socialTTL: z.number().default(60), // 1 minute
  maxMemoryUsage: z.number().default(1073741824), // 1GB
  compressionEnabled: z.boolean().default(true),
  compressionThreshold: z.number().default(1024), // 1KB
  keyPrefix: z.string().default('cache:'),
  cleanupInterval: z.number().default(300000) // 5 minutes
});

const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(true),
  requestsPerMinute: z.number().default(1000),
  burstSize: z.number().default(2000),
  windowSize: z.number().default(60000), // 1 minute
  skipSuccessfulRequests: z.boolean().default(false),
  keyGenerator: z.string().default('ip'),
  headers: z.boolean().default(true),
  message: z.string().default('Too many requests')
});

const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  failureThreshold: z.number().default(5),
  successThreshold: z.number().default(3),
  timeout: z.number().default(60000), // 1 minute
  monitoringPeriod: z.number().default(60000), // 1 minute
  healthCheckInterval: z.number().default(30000) // 30 seconds
});

const DataQualityConfigSchema = z.object({
  minScore: z.number().min(0).max(1).default(0.7),
  maxLatency: z.number().default(5000), // 5 seconds
  maxStaleness: z.number().default(60000), // 1 minute
  minCompleteness: z.number().min(0).max(1).default(0.8),
  minAccuracy: z.number().min(0).max(1).default(0.9),
  qualityCheckInterval: z.number().default(10000), // 10 seconds
  alertThreshold: z.number().min(0).max(1).default(0.5)
});

const WebSocketConfigSchema = z.object({
  enabled: z.boolean().default(true),
  heartbeatInterval: z.number().default(30000), // 30 seconds
  maxConnections: z.number().default(50000),
  connectionTimeout: z.number().default(30000), // 30 seconds
  messageTimeout: z.number().default(5000), // 5 seconds
  reconnectAttempts: z.number().default(5),
  reconnectInterval: z.number().default(1000) // 1 second
});

const MonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  prometheus: z.object({
    enabled: z.boolean().default(true),
    prefix: z.string().default('market_data_'),
    collectDefaultMetrics: z.boolean().default(true)
  }).default({}),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().default(30000) // 30 seconds
  }).default({}),
  metrics: z.object({
    collectionInterval: z.number().default(5000), // 5 seconds
    retentionPeriod: z.number().default(86400000) // 24 hours
  }).default({})
});

const MainConfigSchema = z.object({
  // Service configuration
  service: ServiceConfigSchema.default({}),
  
  // External services
  redis: RedisConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  influxdb: InfluxDBConfigSchema,
  kafka: KafkaConfigSchema.default({}),
  
  // Data providers
  providers: z.array(DataProviderConfigSchema).default([]),
  
  // Service features
  cache: CacheConfigSchema.default({}),
  rateLimiting: RateLimitConfigSchema.default({}),
  circuitBreaker: CircuitBreakerConfigSchema.default({}),
  dataQuality: DataQualityConfigSchema.default({}),
  websocket: WebSocketConfigSchema.default({}),
  monitoring: MonitoringConfigSchema.default({})
});

// === Configuration Loading ===

function loadConfig(): z.infer<typeof MainConfigSchema> {
  const rawConfig = {
    service: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3002'),
      metricsPort: parseInt(process.env.METRICS_PORT || '9092'),
      logLevel: process.env.LOG_LEVEL || 'info'
    },
    
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DATABASE || '1'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'market-data:'
    },
    
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'trading_platform',
      username: process.env.DATABASE_USER || 'trading_user',
      password: process.env.DATABASE_PASSWORD || 'trading_password',
      ssl: process.env.DATABASE_SSL === 'true'
    },
    
    influxdb: {
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || '',
      org: process.env.INFLUXDB_ORG || 'trading-platform',
      bucket: process.env.INFLUXDB_BUCKET || 'market-data'
    },
    
    kafka: {
      clientId: process.env.KAFKA_CLIENT_ID || 'market-data-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      groupId: process.env.KAFKA_GROUP_ID || 'market-data-consumers'
    },
    
    providers: createProviderConfigs(),
    
    cache: {
      defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '300'),
      realtimeTTL: parseInt(process.env.CACHE_REALTIME_TTL || '5'),
      historicalTTL: parseInt(process.env.CACHE_HISTORICAL_TTL || '3600'),
      newsTTL: parseInt(process.env.CACHE_NEWS_TTL || '300')
    },
    
    rateLimiting: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '1000'),
      burstSize: parseInt(process.env.RATE_LIMIT_BURST_SIZE || '2000')
    },
    
    circuitBreaker: {
      enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
      timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000')
    },
    
    dataQuality: {
      minScore: parseFloat(process.env.DATA_QUALITY_MIN_SCORE || '0.7'),
      maxStaleness: parseInt(process.env.DATA_STALENESS_THRESHOLD || '60000')
    },
    
    websocket: {
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'),
      maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '50000'),
      connectionTimeout: parseInt(process.env.WS_CONNECTION_TIMEOUT || '30000')
    }
  };

  try {
    return MainConfigSchema.parse(rawConfig);
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
}

function createProviderConfigs() {
  const providers: any[] = [];

  // Alpha Vantage
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    providers.push({
      provider: DataProvider.ALPHA_VANTAGE,
      apiKey: process.env.ALPHA_VANTAGE_API_KEY,
      baseUrl: 'https://www.alphavantage.co',
      priority: 3,
      rateLimits: {
        requestsPerMinute: 5,
        requestsPerDay: 500
      }
    });
  }

  // IEX Cloud
  if (process.env.IEX_CLOUD_API_KEY) {
    providers.push({
      provider: DataProvider.IEX_CLOUD,
      apiKey: process.env.IEX_CLOUD_API_KEY,
      baseUrl: 'https://cloud.iexapis.com',
      priority: 1,
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerMonth: 500000
      }
    });
  }

  // Finnhub
  if (process.env.FINNHUB_API_KEY) {
    providers.push({
      provider: DataProvider.FINNHUB,
      apiKey: process.env.FINNHUB_API_KEY,
      baseUrl: 'https://finnhub.io',
      priority: 2,
      rateLimits: {
        requestsPerMinute: 30,
        requestsPerDay: 1000
      }
    });
  }

  // Polygon
  if (process.env.POLYGON_API_KEY) {
    providers.push({
      provider: DataProvider.POLYGON,
      apiKey: process.env.POLYGON_API_KEY,
      baseUrl: 'https://api.polygon.io',
      priority: 1,
      rateLimits: {
        requestsPerMinute: 50,
        requestsPerMonth: 100000
      }
    });
  }

  // Yahoo Finance (usually free tier)
  providers.push({
    provider: DataProvider.YAHOO_FINANCE,
    apiKey: process.env.YAHOO_FINANCE_API_KEY || 'public',
    baseUrl: 'https://query1.finance.yahoo.com',
    priority: 4,
    rateLimits: {
      requestsPerSecond: 2,
      requestsPerMinute: 100
    }
  });

  return providers;
}

// === Export Configuration ===

export const config = loadConfig();

// Export types
export type Config = z.infer<typeof MainConfigSchema>;
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type InfluxDBConfig = z.infer<typeof InfluxDBConfigSchema>;
export type KafkaConfig = z.infer<typeof KafkaConfigSchema>;
export type DataProviderConfig = z.infer<typeof DataProviderConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type DataQualityConfig = z.infer<typeof DataQualityConfigSchema>;
export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;