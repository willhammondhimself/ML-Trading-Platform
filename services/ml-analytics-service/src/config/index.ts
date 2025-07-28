/**
 * Configuration Management
 * Centralized configuration for ML Analytics WebSocket Service
 */

import { z } from 'zod';

// Configuration schemas for validation
const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(6379),
  password: z.string().optional(),
  database: z.number().default(0),
  keyPrefix: z.string().default('ml-analytics:'),
  maxRetryAttempts: z.number().default(3),
  retryDelayOnFailover: z.number().default(100),
  enableReadyCheck: z.boolean().default(true),
  maxRetriesPerRequest: z.number().default(3),
  lazyConnect: z.boolean().default(true)
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

const KafkaConfigSchema = z.object({
  clientId: z.string().default('ml-analytics-service'),
  brokers: z.array(z.string()).default(['localhost:9092']),
  groupId: z.string().default('ml-analytics-consumers'),
  topics: z.object({
    predictions: z.string().default('ml.predictions'),
    modelMetrics: z.string().default('ml.model-metrics'),
    featureImportance: z.string().default('ml.feature-importance'),
    accuracyHistory: z.string().default('ml.accuracy-history')
  }).default({}),
  consumer: z.object({
    sessionTimeout: z.number().default(30000),
    rebalanceTimeout: z.number().default(60000),
    heartbeatInterval: z.number().default(3000),
    maxBytesPerPartition: z.number().default(1048576), // 1MB
    minBytes: z.number().default(1),
    maxBytes: z.number().default(10485760), // 10MB
    maxWaitTime: z.number().default(5000)
  }).default({})
});

const ConnectionPoolConfigSchema = z.object({
  maxConnections: z.number().default(10000),
  minConnections: z.number().default(100),
  connectionTimeout: z.number().default(30000),
  idleTimeout: z.number().default(300000), // 5 minutes
  healthCheckInterval: z.number().default(30000),
  loadBalancing: z.enum(['round-robin', 'least-connections', 'weighted', 'random']).default('least-connections'),
  failoverEnabled: z.boolean().default(true),
  failoverTimeout: z.number().default(5000)
});

const MessageQueueConfigSchema = z.object({
  maxQueueSize: z.number().default(100000),
  maxMemoryUsage: z.number().default(536870912), // 512MB
  persistToDisk: z.boolean().default(true),
  diskPath: z.string().default('./data/queue'),
  retentionTime: z.number().default(86400000), // 24 hours
  batchSize: z.number().default(100),
  batchTimeout: z.number().default(1000),
  priorityLevels: z.object({
    critical: z.number().default(1),
    high: z.number().default(2),
    normal: z.number().default(3),
    low: z.number().default(4)
  }).default({}),
  deduplication: z.boolean().default(true),
  orderingGuarantee: z.boolean().default(true)
});

const RateLimitingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokensPerSecond: z.number().default(100),
  burstSize: z.number().default(200),
  windowSize: z.number().default(1000), // 1 second
  maxConcurrentRequests: z.number().default(1000),
  backoffStrategy: z.enum(['exponential', 'linear', 'fixed']).default('exponential'),
  backoffMultiplier: z.number().default(2),
  maxBackoffDelay: z.number().default(30000), // 30 seconds
  perChannelLimits: z.record(z.object({
    tokensPerSecond: z.number(),
    burstSize: z.number(),
    enabled: z.boolean().default(true)
  })).default({})
});

const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  failureThreshold: z.number().default(5),
  timeoutThreshold: z.number().default(10000), // 10 seconds
  resetTimeout: z.number().default(60000), // 1 minute
  monitoringPeriod: z.number().default(60000), // 1 minute
  successThreshold: z.number().default(3),
  healthCheckInterval: z.number().default(30000),
  healthCheckTimeout: z.number().default(5000),
  errorTypes: z.array(z.string()).default(['TIMEOUT', 'CONNECTION_ERROR', 'RATE_LIMIT_ERROR'])
});

const MonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  metricsRetentionTime: z.number().default(3600000), // 1 hour
  alertThresholds: z.object({
    latency: z.object({
      p50: z.number().default(100), // ms
      p95: z.number().default(500), // ms
      p99: z.number().default(1000) // ms
    }).default({}),
    errorRate: z.number().default(0.01), // 1%
    connectionRate: z.number().default(0.95), // 95%
    queueSize: z.number().default(0.8), // 80% of max
    memoryUsage: z.number().default(0.85) // 85%
  }).default({}),
  healthCheckEnabled: z.boolean().default(true),
  healthCheckInterval: z.number().default(10000),
  metricsCollectionInterval: z.number().default(5000)
});

const CorsConfigSchema = z.object({
  origins: z.array(z.string()).default([
    'http://localhost:3000',
    'http://localhost:3001',
    'https://trading-platform.local'
  ]),
  methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
  allowedHeaders: z.array(z.string()).default(['Content-Type', 'Authorization', 'X-Requested-With']),
  credentials: z.boolean().default(true)
});

const ConfigSchema = z.object({
  // Service configuration
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().default(8001),
  metricsPort: z.number().default(9090),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // External services
  redis: RedisConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  kafka: KafkaConfigSchema.default({}),
  
  // WebSocket service components
  connectionPool: ConnectionPoolConfigSchema.default({}),
  messageQueue: MessageQueueConfigSchema.default({}),
  rateLimiting: RateLimitingConfigSchema.default({}),
  circuitBreaker: CircuitBreakerConfigSchema.default({}),
  monitoring: MonitoringConfigSchema.default({}),
  cors: CorsConfigSchema.default({}),
  
  // Protocol Buffer settings
  protocolBuffers: z.object({
    enabled: z.boolean().default(true),
    fallbackToJson: z.boolean().default(true),
    compressionLevel: z.number().min(0).max(9).default(6)
  }).default({}),
  
  // Security settings
  security: z.object({
    enableAuth: z.boolean().default(false),
    jwtSecret: z.string().optional(),
    apiKeys: z.array(z.string()).default([]),
    rateLimitBypassKeys: z.array(z.string()).default([])
  }).default({})
});

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): z.infer<typeof ConfigSchema> {
  const rawConfig = {
    // Service configuration
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '8001'),
    metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Redis configuration
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DATABASE || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'ml-analytics:'
    },
    
    // Database configuration
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'trading_platform',
      username: process.env.DATABASE_USER || 'trading_user',
      password: process.env.DATABASE_PASSWORD || 'trading_password',
      ssl: process.env.DATABASE_SSL === 'true',
      pool: {
        min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
        max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
        idle: parseInt(process.env.DATABASE_POOL_IDLE || '10000')
      }
    },
    
    // Kafka configuration
    kafka: {
      clientId: process.env.KAFKA_CLIENT_ID || 'ml-analytics-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      groupId: process.env.KAFKA_GROUP_ID || 'ml-analytics-consumers',
      topics: {
        predictions: process.env.KAFKA_PREDICTIONS_TOPIC || 'ml.predictions',
        modelMetrics: process.env.KAFKA_MODEL_METRICS_TOPIC || 'ml.model-metrics',
        featureImportance: process.env.KAFKA_FEATURE_IMPORTANCE_TOPIC || 'ml.feature-importance',
        accuracyHistory: process.env.KAFKA_ACCURACY_HISTORY_TOPIC || 'ml.accuracy-history'
      }
    },
    
    // Connection pool configuration
    connectionPool: {
      maxConnections: parseInt(process.env.MAX_CONNECTIONS || '10000'),
      minConnections: parseInt(process.env.MIN_CONNECTIONS || '100'),
      connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30000'),
      idleTimeout: parseInt(process.env.IDLE_TIMEOUT || '300000'),
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      loadBalancing: process.env.LOAD_BALANCING_STRATEGY || 'least-connections',
      failoverEnabled: process.env.FAILOVER_ENABLED !== 'false',
      failoverTimeout: parseInt(process.env.FAILOVER_TIMEOUT || '5000')
    },
    
    // Message queue configuration
    messageQueue: {
      maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '100000'),
      maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE || '536870912'),
      persistToDisk: process.env.PERSIST_TO_DISK !== 'false',
      retentionTime: parseInt(process.env.MESSAGE_RETENTION_TIME || '86400000'),
      batchSize: parseInt(process.env.BATCH_SIZE || '100'),
      batchTimeout: parseInt(process.env.BATCH_TIMEOUT || '1000')
    },
    
    // Rate limiting configuration
    rateLimiting: {
      enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
      tokensPerSecond: parseInt(process.env.TOKENS_PER_SECOND || '100'),
      burstSize: parseInt(process.env.BURST_SIZE || '200'),
      windowSize: parseInt(process.env.RATE_LIMIT_WINDOW || '1000'),
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '1000')
    },
    
    // Circuit breaker configuration
    circuitBreaker: {
      enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
      failureThreshold: parseInt(process.env.FAILURE_THRESHOLD || '5'),
      timeoutThreshold: parseInt(process.env.TIMEOUT_THRESHOLD || '10000'),
      resetTimeout: parseInt(process.env.RESET_TIMEOUT || '60000')
    },
    
    // Monitoring configuration
    monitoring: {
      enabled: process.env.MONITORING_ENABLED !== 'false',
      metricsRetentionTime: parseInt(process.env.METRICS_RETENTION_TIME || '3600000'),
      healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '10000'),
      metricsCollectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL || '5000')
    },
    
    // CORS configuration
    cors: {
      origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(','),
      credentials: process.env.CORS_CREDENTIALS !== 'false'
    },
    
    // Protocol Buffer settings
    protocolBuffers: {
      enabled: process.env.PROTOBUF_ENABLED !== 'false',
      fallbackToJson: process.env.PROTOBUF_FALLBACK !== 'false',
      compressionLevel: parseInt(process.env.PROTOBUF_COMPRESSION_LEVEL || '6')
    },
    
    // Security settings
    security: {
      enableAuth: process.env.ENABLE_AUTH === 'true',
      jwtSecret: process.env.JWT_SECRET,
      apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),
      rateLimitBypassKeys: (process.env.RATE_LIMIT_BYPASS_KEYS || '').split(',').filter(Boolean)
    }
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
}

// Export the validated configuration
export const config = loadConfig();

// Export types for use in other modules
export type Config = z.infer<typeof ConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type KafkaConfig = z.infer<typeof KafkaConfigSchema>;
export type ConnectionPoolConfig = z.infer<typeof ConnectionPoolConfigSchema>;
export type MessageQueueConfig = z.infer<typeof MessageQueueConfigSchema>;
export type RateLimitingConfig = z.infer<typeof RateLimitingConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type CorsConfig = z.infer<typeof CorsConfigSchema>;