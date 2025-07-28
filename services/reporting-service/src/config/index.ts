/**
 * Configuration Management for Reporting Service
 * 
 * Centralized configuration with environment-based settings for
 * analytics, regulatory reporting, data aggregation, and export formats.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3006),
  DEBUG: z.string().transform(val => val === 'true').default('false'),
  
  // Service Configuration
  SERVICE_NAME: z.string().default('reporting-service'),
  VERSION: z.string().default('1.0.0'),
  HEALTH_CHECK_PATH: z.string().default('/health'),
  
  // Database Configuration (PostgreSQL)
  DATABASE: z.object({
    URL: z.string().url(),
    SSL: z.string().transform(val => val === 'true').default('false'),
    POOL_MIN: z.coerce.number().default(2),
    POOL_MAX: z.coerce.number().default(20),
    MIGRATE_ON_START: z.string().transform(val => val === 'true').default('true'),
    CONNECTION_TIMEOUT: z.coerce.number().default(10000),
    IDLE_TIMEOUT: z.coerce.number().default(30000),
    QUERY_TIMEOUT: z.coerce.number().default(60000)
  }).default({
    URL: 'postgresql://postgres:password@localhost:5432/reporting',
    SSL: false,
    POOL_MIN: 2,
    POOL_MAX: 20,
    MIGRATE_ON_START: true,
    CONNECTION_TIMEOUT: 10000,
    IDLE_TIMEOUT: 30000,
    QUERY_TIMEOUT: 60000
  }),
  
  // Time Series Database (InfluxDB) Configuration
  INFLUXDB: z.object({
    URL: z.string().url().default('http://localhost:8086'),
    TOKEN: z.string().optional(),
    ORG: z.string().default('ml-trading'),
    BUCKET: z.string().default('trading-metrics'),
    TIMEOUT: z.coerce.number().default(30000),
    WRITE_PRECISION: z.enum(['ns', 'us', 'ms', 's']).default('ms'),
    BATCH_SIZE: z.coerce.number().default(1000),
    FLUSH_INTERVAL: z.coerce.number().default(10000)
  }).default({}),
  
  // Redis Configuration
  REDIS: z.object({
    URL: z.string().url().default('redis://localhost:6379'),
    PASSWORD: z.string().optional(),
    DB: z.coerce.number().default(3),
    KEY_PREFIX: z.string().default('report:'),
    CLUSTER_MODE: z.string().transform(val => val === 'true').default('false'),
    KEY_TTL: z.coerce.number().default(3600) // 1 hour default
  }).default({}),
  
  // Kafka Configuration
  KAFKA: z.object({
    BROKERS: z.string().transform(val => val.split(',')).default(['localhost:9092']),
    CLIENT_ID: z.string().default('reporting-service'),
    GROUP_ID: z.string().default('reporting-consumers'),
    SESSION_TIMEOUT: z.coerce.number().default(30000),
    HEARTBEAT_INTERVAL: z.coerce.number().default(3000),
    MAX_BYTES_PER_PARTITION: z.coerce.number().default(1048576),
    ENABLE_AUTO_COMMIT: z.string().transform(val => val === 'true').default('true'),
    AUTO_COMMIT_INTERVAL: z.coerce.number().default(5000),
    RETRY_ATTEMPTS: z.coerce.number().default(5),
    RETRY_DELAY: z.coerce.number().default(100)
  }).default({}),
  
  // Kafka Topics
  KAFKA_TOPICS: z.object({
    TRADE_EVENTS: z.string().default('trade-events'),
    ORDER_EVENTS: z.string().default('order-events'),
    PORTFOLIO_UPDATES: z.string().default('portfolio-updates'),
    MARKET_DATA: z.string().default('market-data'),
    ML_PREDICTIONS: z.string().default('ml-predictions'),
    RISK_METRICS: z.string().default('risk-metrics'),
    USER_ACTIVITIES: z.string().default('user-activities'),
    COMPLIANCE_EVENTS: z.string().default('compliance-events'),
    SYSTEM_METRICS: z.string().default('system-metrics')
  }).default({}),
  
  // Report Generation Configuration
  REPORTING: z.object({
    OUTPUT_DIR: z.string().default('./reports'),
    TEMP_DIR: z.string().default('./temp'),
    MAX_CONCURRENT_REPORTS: z.coerce.number().default(5),
    REPORT_RETENTION_DAYS: z.coerce.number().default(90),
    BATCH_SIZE: z.coerce.number().default(10000),
    EXPORT_TIMEOUT: z.coerce.number().default(300000), // 5 minutes
    ENABLE_COMPRESSION: z.string().transform(val => val === 'true').default('true'),
    WATERMARK_ENABLED: z.string().transform(val => val === 'true').default('true')
  }).default({}),
  
  // Supported Export Formats
  EXPORT_FORMATS: z.object({
    PDF_ENABLED: z.string().transform(val => val === 'true').default('true'),
    CSV_ENABLED: z.string().transform(val => val === 'true').default('true'),
    XLSX_ENABLED: z.string().transform(val => val === 'true').default('true'),
    JSON_ENABLED: z.string().transform(val => val === 'true').default('true'),
    PARQUET_ENABLED: z.string().transform(val => val === 'true').default('false')
  }).default({}),
  
  // Analytics Configuration
  ANALYTICS: z.object({
    AGGREGATION_INTERVAL: z.coerce.number().default(60000), // 1 minute
    RETENTION_POLICY_DAYS: z.coerce.number().default(730), // 2 years
    ENABLE_REAL_TIME: z.string().transform(val => val === 'true').default('true'),
    ENABLE_PREDICTIONS: z.string().transform(val => val === 'true').default('true'),
    ML_MODEL_ENDPOINT: z.string().url().optional(),
    PERFORMANCE_THRESHOLD_MS: z.coerce.number().default(1000)
  }).default({}),
  
  // Regulatory Reporting Configuration
  REGULATORY: z.object({
    ENABLED: z.string().transform(val => val === 'true').default('true'),
    JURISDICTION: z.string().default('US'),
    REPORTING_ENTITY_ID: z.string().default('ML-TRADING-001'),
    MiFID_ENABLED: z.string().transform(val => val === 'true').default('false'),
    EMIR_ENABLED: z.string().transform(val => val === 'true').default('false'),
    CFTC_ENABLED: z.string().transform(val => val === 'true').default('true'),
    SEC_ENABLED: z.string().transform(val => val === 'true').default('true'),
    AUTO_SUBMIT: z.string().transform(val => val === 'true').default('false'),
    SUBMISSION_ENDPOINT: z.string().url().optional(),
    ENCRYPTION_ENABLED: z.string().transform(val => val === 'true').default('true')
  }).default({}),
  
  // Scheduling Configuration
  SCHEDULER: z.object({
    ENABLED: z.string().transform(val => val === 'true').default('true'),
    TIMEZONE: z.string().default('UTC'),
    DAILY_REPORTS_TIME: z.string().default('06:00'),
    WEEKLY_REPORTS_DAY: z.string().default('monday'),
    MONTHLY_REPORTS_DAY: z.coerce.number().default(1),
    CLEANUP_TIME: z.string().default('02:00'),
    MAX_RETRY_ATTEMPTS: z.coerce.number().default(3)
  }).default({}),
  
  // Data Aggregation Configuration
  DATA_AGGREGATION: z.object({
    ENABLE_INCREMENTAL: z.string().transform(val => val === 'true').default('true'),
    CHUNK_SIZE: z.coerce.number().default(50000),
    PARALLEL_JOBS: z.coerce.number().default(4),
    MEMORY_LIMIT_MB: z.coerce.number().default(2048),
    ENABLE_MATERIALIZED_VIEWS: z.string().transform(val => val === 'true').default('true'),
    REFRESH_INTERVAL_MINUTES: z.coerce.number().default(15)
  }).default({}),
  
  // Security Configuration
  SECURITY: z.object({
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().default('ml-trading-platform'),
    JWT_AUDIENCE: z.string().default('reporting-service'),
    CORS_ORIGINS: z.string().transform(val => val.split(',')).default(['http://localhost:3000']),
    ENABLE_AUTH: z.string().transform(val => val === 'true').default('true'),
    ENABLE_RATE_LIMITING: z.string().transform(val => val === 'true').default('true'),
    REPORT_ENCRYPTION_KEY: z.string().optional(),
    AUDIT_LOG_ENABLED: z.string().transform(val => val === 'true').default('true')
  }).default({
    JWT_SECRET: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    JWT_ISSUER: 'ml-trading-platform',
    JWT_AUDIENCE: 'reporting-service',
    CORS_ORIGINS: ['http://localhost:3000'],
    ENABLE_AUTH: true,
    ENABLE_RATE_LIMITING: true,
    AUDIT_LOG_ENABLED: true
  }),
  
  // Rate Limiting Configuration
  RATE_LIMITING: z.object({
    ENABLED: z.string().transform(val => val === 'true').default('true'),
    WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
    MAX_REQUESTS: z.coerce.number().default(100),
    SKIP_SUCCESSFUL_REQUESTS: z.string().transform(val => val === 'true').default('false'),
    HEAVY_REPORTS_LIMIT: z.coerce.number().default(5) // Per hour
  }).default({}),
  
  // Monitoring Configuration
  MONITORING: z.object({
    ENABLE_METRICS: z.string().transform(val => val === 'true').default('true'),
    METRICS_INTERVAL: z.coerce.number().default(30000),
    ENABLE_HEALTH_CHECK: z.string().transform(val => val === 'true').default('true'),
    HEALTH_CHECK_INTERVAL: z.coerce.number().default(10000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    ALERT_THRESHOLD_ERROR_RATE: z.coerce.number().default(0.05), // 5%
    ALERT_THRESHOLD_RESPONSE_TIME: z.coerce.number().default(5000) // 5 seconds
  }).default({}),
  
  // Performance Configuration
  PERFORMANCE: z.object({
    ENABLE_CLUSTERING: z.string().transform(val => val === 'true').default('false'),
    WORKER_PROCESSES: z.coerce.number().default(0), // 0 = CPU count
    MEMORY_LIMIT_MB: z.coerce.number().default(2048),
    GC_INTERVAL_MS: z.coerce.number().default(300000),
    CONNECTION_POOL_SIZE: z.coerce.number().default(20),
    QUERY_CACHE_SIZE_MB: z.coerce.number().default(256)
  }).default({}),
  
  // External Services Configuration
  EXTERNAL_SERVICES: z.object({
    API_GATEWAY_URL: z.string().url().default('http://localhost:8080'),
    USER_SERVICE_URL: z.string().url().default('http://localhost:3000'),
    TRADING_SERVICE_URL: z.string().url().default('http://localhost:3001'),
    ML_SERVICE_URL: z.string().url().default('http://localhost:3003'),
    RISK_SERVICE_URL: z.string().url().default('http://localhost:3004'),
    NOTIFICATION_SERVICE_URL: z.string().url().default('http://localhost:3005'),
    WEBSOCKET_SERVICE_URL: z.string().url().default('http://localhost:8081')
  }).default({})
});

const env = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DEBUG: process.env.DEBUG,
  
  SERVICE_NAME: process.env.SERVICE_NAME,
  VERSION: process.env.VERSION,
  HEALTH_CHECK_PATH: process.env.HEALTH_CHECK_PATH,
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SSL: process.env.DATABASE_SSL,
  DATABASE_POOL_MIN: process.env.DATABASE_POOL_MIN,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  DATABASE_MIGRATE_ON_START: process.env.DATABASE_MIGRATE_ON_START,
  DATABASE_CONNECTION_TIMEOUT: process.env.DATABASE_CONNECTION_TIMEOUT,
  DATABASE_IDLE_TIMEOUT: process.env.DATABASE_IDLE_TIMEOUT,
  DATABASE_QUERY_TIMEOUT: process.env.DATABASE_QUERY_TIMEOUT,
  
  // InfluxDB
  INFLUXDB_URL: process.env.INFLUXDB_URL,
  INFLUXDB_TOKEN: process.env.INFLUXDB_TOKEN,
  INFLUXDB_ORG: process.env.INFLUXDB_ORG,
  INFLUXDB_BUCKET: process.env.INFLUXDB_BUCKET,
  INFLUXDB_TIMEOUT: process.env.INFLUXDB_TIMEOUT,
  INFLUXDB_WRITE_PRECISION: process.env.INFLUXDB_WRITE_PRECISION,
  INFLUXDB_BATCH_SIZE: process.env.INFLUXDB_BATCH_SIZE,
  INFLUXDB_FLUSH_INTERVAL: process.env.INFLUXDB_FLUSH_INTERVAL,
  
  // Redis
  REDIS_URL: process.env.REDIS_URL,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: process.env.REDIS_DB,
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
  REDIS_CLUSTER_MODE: process.env.REDIS_CLUSTER_MODE,
  REDIS_KEY_TTL: process.env.REDIS_KEY_TTL,
  
  // Kafka
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID,
  KAFKA_SESSION_TIMEOUT: process.env.KAFKA_SESSION_TIMEOUT,
  KAFKA_HEARTBEAT_INTERVAL: process.env.KAFKA_HEARTBEAT_INTERVAL,
  KAFKA_MAX_BYTES_PER_PARTITION: process.env.KAFKA_MAX_BYTES_PER_PARTITION,
  KAFKA_ENABLE_AUTO_COMMIT: process.env.KAFKA_ENABLE_AUTO_COMMIT,
  KAFKA_AUTO_COMMIT_INTERVAL: process.env.KAFKA_AUTO_COMMIT_INTERVAL,
  KAFKA_RETRY_ATTEMPTS: process.env.KAFKA_RETRY_ATTEMPTS,
  KAFKA_RETRY_DELAY: process.env.KAFKA_RETRY_DELAY,
  
  // Kafka Topics
  KAFKA_TOPIC_TRADE_EVENTS: process.env.KAFKA_TOPIC_TRADE_EVENTS,
  KAFKA_TOPIC_ORDER_EVENTS: process.env.KAFKA_TOPIC_ORDER_EVENTS,
  KAFKA_TOPIC_PORTFOLIO_UPDATES: process.env.KAFKA_TOPIC_PORTFOLIO_UPDATES,
  KAFKA_TOPIC_MARKET_DATA: process.env.KAFKA_TOPIC_MARKET_DATA,
  KAFKA_TOPIC_ML_PREDICTIONS: process.env.KAFKA_TOPIC_ML_PREDICTIONS,
  KAFKA_TOPIC_RISK_METRICS: process.env.KAFKA_TOPIC_RISK_METRICS,
  KAFKA_TOPIC_USER_ACTIVITIES: process.env.KAFKA_TOPIC_USER_ACTIVITIES,
  KAFKA_TOPIC_COMPLIANCE_EVENTS: process.env.KAFKA_TOPIC_COMPLIANCE_EVENTS,
  KAFKA_TOPIC_SYSTEM_METRICS: process.env.KAFKA_TOPIC_SYSTEM_METRICS,
  
  // Reporting
  REPORTING_OUTPUT_DIR: process.env.REPORTING_OUTPUT_DIR,
  REPORTING_TEMP_DIR: process.env.REPORTING_TEMP_DIR,
  REPORTING_MAX_CONCURRENT_REPORTS: process.env.REPORTING_MAX_CONCURRENT_REPORTS,
  REPORTING_REPORT_RETENTION_DAYS: process.env.REPORTING_REPORT_RETENTION_DAYS,
  REPORTING_BATCH_SIZE: process.env.REPORTING_BATCH_SIZE,
  REPORTING_EXPORT_TIMEOUT: process.env.REPORTING_EXPORT_TIMEOUT,
  REPORTING_ENABLE_COMPRESSION: process.env.REPORTING_ENABLE_COMPRESSION,
  REPORTING_WATERMARK_ENABLED: process.env.REPORTING_WATERMARK_ENABLED,
  
  // Export Formats
  EXPORT_PDF_ENABLED: process.env.EXPORT_PDF_ENABLED,
  EXPORT_CSV_ENABLED: process.env.EXPORT_CSV_ENABLED,
  EXPORT_XLSX_ENABLED: process.env.EXPORT_XLSX_ENABLED,
  EXPORT_JSON_ENABLED: process.env.EXPORT_JSON_ENABLED,
  EXPORT_PARQUET_ENABLED: process.env.EXPORT_PARQUET_ENABLED,
  
  // Analytics
  ANALYTICS_AGGREGATION_INTERVAL: process.env.ANALYTICS_AGGREGATION_INTERVAL,
  ANALYTICS_RETENTION_POLICY_DAYS: process.env.ANALYTICS_RETENTION_POLICY_DAYS,
  ANALYTICS_ENABLE_REAL_TIME: process.env.ANALYTICS_ENABLE_REAL_TIME,
  ANALYTICS_ENABLE_PREDICTIONS: process.env.ANALYTICS_ENABLE_PREDICTIONS,
  ANALYTICS_ML_MODEL_ENDPOINT: process.env.ANALYTICS_ML_MODEL_ENDPOINT,
  ANALYTICS_PERFORMANCE_THRESHOLD_MS: process.env.ANALYTICS_PERFORMANCE_THRESHOLD_MS,
  
  // Regulatory
  REGULATORY_ENABLED: process.env.REGULATORY_ENABLED,
  REGULATORY_JURISDICTION: process.env.REGULATORY_JURISDICTION,
  REGULATORY_REPORTING_ENTITY_ID: process.env.REGULATORY_REPORTING_ENTITY_ID,
  REGULATORY_MIFID_ENABLED: process.env.REGULATORY_MIFID_ENABLED,
  REGULATORY_EMIR_ENABLED: process.env.REGULATORY_EMIR_ENABLED,
  REGULATORY_CFTC_ENABLED: process.env.REGULATORY_CFTC_ENABLED,
  REGULATORY_SEC_ENABLED: process.env.REGULATORY_SEC_ENABLED,
  REGULATORY_AUTO_SUBMIT: process.env.REGULATORY_AUTO_SUBMIT,
  REGULATORY_SUBMISSION_ENDPOINT: process.env.REGULATORY_SUBMISSION_ENDPOINT,
  REGULATORY_ENCRYPTION_ENABLED: process.env.REGULATORY_ENCRYPTION_ENABLED,
  
  // Scheduler
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED,
  SCHEDULER_TIMEZONE: process.env.SCHEDULER_TIMEZONE,
  SCHEDULER_DAILY_REPORTS_TIME: process.env.SCHEDULER_DAILY_REPORTS_TIME,
  SCHEDULER_WEEKLY_REPORTS_DAY: process.env.SCHEDULER_WEEKLY_REPORTS_DAY,
  SCHEDULER_MONTHLY_REPORTS_DAY: process.env.SCHEDULER_MONTHLY_REPORTS_DAY,
  SCHEDULER_CLEANUP_TIME: process.env.SCHEDULER_CLEANUP_TIME,
  SCHEDULER_MAX_RETRY_ATTEMPTS: process.env.SCHEDULER_MAX_RETRY_ATTEMPTS,
  
  // Data Aggregation
  DATA_AGGREGATION_ENABLE_INCREMENTAL: process.env.DATA_AGGREGATION_ENABLE_INCREMENTAL,
  DATA_AGGREGATION_CHUNK_SIZE: process.env.DATA_AGGREGATION_CHUNK_SIZE,
  DATA_AGGREGATION_PARALLEL_JOBS: process.env.DATA_AGGREGATION_PARALLEL_JOBS,
  DATA_AGGREGATION_MEMORY_LIMIT_MB: process.env.DATA_AGGREGATION_MEMORY_LIMIT_MB,
  DATA_AGGREGATION_ENABLE_MATERIALIZED_VIEWS: process.env.DATA_AGGREGATION_ENABLE_MATERIALIZED_VIEWS,
  DATA_AGGREGATION_REFRESH_INTERVAL_MINUTES: process.env.DATA_AGGREGATION_REFRESH_INTERVAL_MINUTES,
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ISSUER: process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  SECURITY_ENABLE_AUTH: process.env.SECURITY_ENABLE_AUTH,
  SECURITY_ENABLE_RATE_LIMITING: process.env.SECURITY_ENABLE_RATE_LIMITING,
  SECURITY_REPORT_ENCRYPTION_KEY: process.env.SECURITY_REPORT_ENCRYPTION_KEY,
  SECURITY_AUDIT_LOG_ENABLED: process.env.SECURITY_AUDIT_LOG_ENABLED,
  
  // Rate Limiting
  RATE_LIMITING_ENABLED: process.env.RATE_LIMITING_ENABLED,
  RATE_LIMITING_WINDOW_MS: process.env.RATE_LIMITING_WINDOW_MS,
  RATE_LIMITING_MAX_REQUESTS: process.env.RATE_LIMITING_MAX_REQUESTS,
  RATE_LIMITING_SKIP_SUCCESSFUL: process.env.RATE_LIMITING_SKIP_SUCCESSFUL,
  RATE_LIMITING_HEAVY_REPORTS_LIMIT: process.env.RATE_LIMITING_HEAVY_REPORTS_LIMIT,
  
  // Monitoring
  MONITORING_ENABLE_METRICS: process.env.MONITORING_ENABLE_METRICS,
  MONITORING_METRICS_INTERVAL: process.env.MONITORING_METRICS_INTERVAL,
  MONITORING_ENABLE_HEALTH_CHECK: process.env.MONITORING_ENABLE_HEALTH_CHECK,
  MONITORING_HEALTH_CHECK_INTERVAL: process.env.MONITORING_HEALTH_CHECK_INTERVAL,
  MONITORING_LOG_LEVEL: process.env.MONITORING_LOG_LEVEL,
  MONITORING_ALERT_THRESHOLD_ERROR_RATE: process.env.MONITORING_ALERT_THRESHOLD_ERROR_RATE,
  MONITORING_ALERT_THRESHOLD_RESPONSE_TIME: process.env.MONITORING_ALERT_THRESHOLD_RESPONSE_TIME,
  
  // Performance
  PERFORMANCE_ENABLE_CLUSTERING: process.env.PERFORMANCE_ENABLE_CLUSTERING,
  PERFORMANCE_WORKER_PROCESSES: process.env.PERFORMANCE_WORKER_PROCESSES,
  PERFORMANCE_MEMORY_LIMIT_MB: process.env.PERFORMANCE_MEMORY_LIMIT_MB,
  PERFORMANCE_GC_INTERVAL_MS: process.env.PERFORMANCE_GC_INTERVAL_MS,
  PERFORMANCE_CONNECTION_POOL_SIZE: process.env.PERFORMANCE_CONNECTION_POOL_SIZE,
  PERFORMANCE_QUERY_CACHE_SIZE_MB: process.env.PERFORMANCE_QUERY_CACHE_SIZE_MB,
  
  // External Services
  API_GATEWAY_URL: process.env.API_GATEWAY_URL,
  USER_SERVICE_URL: process.env.USER_SERVICE_URL,
  TRADING_SERVICE_URL: process.env.TRADING_SERVICE_URL,
  ML_SERVICE_URL: process.env.ML_SERVICE_URL,
  RISK_SERVICE_URL: process.env.RISK_SERVICE_URL,
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL,
  WEBSOCKET_SERVICE_URL: process.env.WEBSOCKET_SERVICE_URL
};

export const config = configSchema.parse(env);

export type Config = typeof config;