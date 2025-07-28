/**
 * Configuration Management for Notification Service
 * 
 * Centralized configuration with environment-based settings
 * and validation for notification channels, email, SMS, and push settings.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3005),
  DEBUG: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
  
  // Service Configuration
  SERVICE_NAME: z.string().default('notification-service'),
  VERSION: z.string().default('1.0.0'),
  HEALTH_CHECK_PATH: z.string().default('/health'),
  
  // Database Configuration
  DATABASE: z.object({
    URL: z.string().url(),
    SSL: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
    POOL_MIN: z.coerce.number().default(2),
    POOL_MAX: z.coerce.number().default(10),
    MIGRATE_ON_START: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true)
  }).default({
    URL: 'postgresql://postgres:password@localhost:5432/notifications',
    SSL: false,
    POOL_MIN: 2,
    POOL_MAX: 10,
    MIGRATE_ON_START: true
  }),
  
  // Redis Configuration
  REDIS: z.object({
    URL: z.string().url().default('redis://localhost:6379'),
    PASSWORD: z.string().optional(),
    DB: z.coerce.number().default(2),
    KEY_PREFIX: z.string().default('notif:'),
    CLUSTER_MODE: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false)
  }).default({}),
  
  // Kafka Configuration
  KAFKA: z.object({
    BROKERS: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val : val.split(',')).default(['localhost:9092']),
    CLIENT_ID: z.string().default('notification-service'),
    GROUP_ID: z.string().default('notification-consumers'),
    SESSION_TIMEOUT: z.coerce.number().default(30000),
    HEARTBEAT_INTERVAL: z.coerce.number().default(3000),
    MAX_BYTES_PER_PARTITION: z.coerce.number().default(1048576),
    ENABLE_AUTO_COMMIT: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    AUTO_COMMIT_INTERVAL: z.coerce.number().default(5000),
    RETRY_ATTEMPTS: z.coerce.number().default(5),
    RETRY_DELAY: z.coerce.number().default(100)
  }).default({}),
  
  // Kafka Topics
  KAFKA_TOPICS: z.object({
    USER_NOTIFICATIONS: z.string().default('user-notifications'),
    TRADE_ALERTS: z.string().default('trade-alerts'),
    RISK_ALERTS: z.string().default('risk-alerts'),
    MARKET_ALERTS: z.string().default('market-alerts'),
    SYSTEM_NOTIFICATIONS: z.string().default('system-notifications'),
    EMAIL_QUEUE: z.string().default('email-queue'),
    SMS_QUEUE: z.string().default('sms-queue'),
    PUSH_QUEUE: z.string().default('push-queue'),
    NOTIFICATION_STATUS: z.string().default('notification-status')
  }).default({}),
  
  // Email Configuration (SMTP)
  EMAIL: z.object({
    ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    FROM_ADDRESS: z.string().email().default('noreply@mltrading.com'),
    FROM_NAME: z.string().default('ML Trading Platform'),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
    SMTP_USER: z.string(),
    SMTP_PASSWORD: z.string(),
    MAX_CONNECTIONS: z.coerce.number().default(5),
    RATE_LIMIT: z.coerce.number().default(14), // Emails per second
    TEMPLATE_PATH: z.string().default('./templates'),
    RETRY_ATTEMPTS: z.coerce.number().default(3),
    RETRY_DELAY: z.coerce.number().default(5000)
  }).default({
    ENABLED: true,
    FROM_ADDRESS: 'noreply@mltrading.com',
    FROM_NAME: 'ML Trading Platform',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
    MAX_CONNECTIONS: 5,
    RATE_LIMIT: 14,
    TEMPLATE_PATH: './templates',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 5000
  }),
  
  // SMS Configuration (Twilio)
  SMS: z.object({
    ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
    PROVIDER: z.enum(['twilio', 'aws-sns']).default('twilio'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),
    RATE_LIMIT: z.coerce.number().default(1), // SMS per second
    RETRY_ATTEMPTS: z.coerce.number().default(3),
    RETRY_DELAY: z.coerce.number().default(10000)
  }).default({
    ENABLED: false,
    PROVIDER: 'twilio',
    AWS_REGION: 'us-east-1',
    RATE_LIMIT: 1,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 10000
  }),
  
  // Push Notification Configuration
  PUSH: z.object({
    ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
    WEB_PUSH_VAPID_EMAIL: z.string().email().optional(),
    FCM_SERVER_KEY: z.string().optional(),
    APNS_KEY_ID: z.string().optional(),
    APNS_TEAM_ID: z.string().optional(),
    APNS_BUNDLE_ID: z.string().optional(),
    APNS_PRIVATE_KEY: z.string().optional(),
    RATE_LIMIT: z.coerce.number().default(10), // Push notifications per second
    RETRY_ATTEMPTS: z.coerce.number().default(3),
    RETRY_DELAY: z.coerce.number().default(5000)
  }).default({
    ENABLED: false,
    RATE_LIMIT: 10,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 5000
  }),
  
  // Queue Configuration
  QUEUE: z.object({
    CONCURRENCY: z.coerce.number().default(10),
    MAX_ATTEMPTS: z.coerce.number().default(3),
    BACKOFF_DELAY: z.coerce.number().default(5000),
    REMOVE_ON_COMPLETE: z.coerce.number().default(100),
    REMOVE_ON_FAIL: z.coerce.number().default(50),
    JOB_TTL: z.coerce.number().default(86400000), // 24 hours
    STALLED_INTERVAL: z.coerce.number().default(30000),
    MAX_STALLED_COUNT: z.coerce.number().default(1)
  }).default({}),
  
  // Rate Limiting
  RATE_LIMITING: z.object({
    ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
    MAX_REQUESTS: z.coerce.number().default(100),
    SKIP_SUCCESSFUL_REQUESTS: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false)
  }).default({}),
  
  // Security Configuration
  SECURITY: z.object({
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().default('ml-trading-platform'),
    JWT_AUDIENCE: z.string().default('notification-service'),
    CORS_ORIGINS: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val : val.split(',')).default(['http://localhost:3000']),
    ENABLE_AUTH: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    ENABLE_RATE_LIMITING: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true)
  }).default({
    JWT_SECRET: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    JWT_ISSUER: 'ml-trading-platform',
    JWT_AUDIENCE: 'notification-service',
    CORS_ORIGINS: ['http://localhost:3000'],
    ENABLE_AUTH: true,
    ENABLE_RATE_LIMITING: true
  }),
  
  // Monitoring Configuration
  MONITORING: z.object({
    ENABLE_METRICS: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    METRICS_INTERVAL: z.coerce.number().default(30000),
    ENABLE_HEALTH_CHECK: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    HEALTH_CHECK_INTERVAL: z.coerce.number().default(10000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
  }).default({}),
  
  // Notification Preferences
  NOTIFICATION_DEFAULTS: z.object({
    EMAIL_ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    SMS_ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(false),
    PUSH_ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    DIGEST_ENABLED: z.union([z.string(), z.boolean()]).transform(val => val === 'true' || val === true).default(true),
    DIGEST_FREQUENCY: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    DIGEST_TIME: z.string().default('08:00'),
    TIMEZONE: z.string().default('UTC')
  }).default({}),
  
  // External Services
  EXTERNAL_SERVICES: z.object({
    API_GATEWAY_URL: z.string().url().default('http://localhost:8080'),
    USER_SERVICE_URL: z.string().url().default('http://localhost:3000'),
    TRADING_SERVICE_URL: z.string().url().default('http://localhost:3001'),
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
  DATABASE: {
    URL: process.env.DATABASE_URL,
    SSL: process.env.DATABASE_SSL,
    POOL_MIN: process.env.DATABASE_POOL_MIN,
    POOL_MAX: process.env.DATABASE_POOL_MAX,
    MIGRATE_ON_START: process.env.DATABASE_MIGRATE_ON_START,
  },
  
  // Redis
  REDIS: {
    URL: process.env.REDIS_URL,
    PASSWORD: process.env.REDIS_PASSWORD,
    DB: process.env.REDIS_DB,
    KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    CLUSTER_MODE: process.env.REDIS_CLUSTER_MODE,
  },
  
  // Kafka
  KAFKA: {
    BROKERS: process.env.KAFKA_BROKERS,
    CLIENT_ID: process.env.KAFKA_CLIENT_ID,
    GROUP_ID: process.env.KAFKA_GROUP_ID,
    SESSION_TIMEOUT: process.env.KAFKA_SESSION_TIMEOUT,
    HEARTBEAT_INTERVAL: process.env.KAFKA_HEARTBEAT_INTERVAL,
    MAX_BYTES_PER_PARTITION: process.env.KAFKA_MAX_BYTES_PER_PARTITION,
    ENABLE_AUTO_COMMIT: process.env.KAFKA_ENABLE_AUTO_COMMIT,
    AUTO_COMMIT_INTERVAL: process.env.KAFKA_AUTO_COMMIT_INTERVAL,
    RETRY_ATTEMPTS: process.env.KAFKA_RETRY_ATTEMPTS,
    RETRY_DELAY: process.env.KAFKA_RETRY_DELAY,
  },
  
  // Kafka Topics
  KAFKA_TOPICS: {
    USER_NOTIFICATIONS: process.env.KAFKA_TOPIC_USER_NOTIFICATIONS,
    TRADE_ALERTS: process.env.KAFKA_TOPIC_TRADE_ALERTS,
    RISK_ALERTS: process.env.KAFKA_TOPIC_RISK_ALERTS,
    MARKET_ALERTS: process.env.KAFKA_TOPIC_MARKET_ALERTS,
    SYSTEM_NOTIFICATIONS: process.env.KAFKA_TOPIC_SYSTEM_NOTIFICATIONS,
    EMAIL_QUEUE: process.env.KAFKA_TOPIC_EMAIL_QUEUE,
    SMS_QUEUE: process.env.KAFKA_TOPIC_SMS_QUEUE,
    PUSH_QUEUE: process.env.KAFKA_TOPIC_PUSH_QUEUE,
    NOTIFICATION_STATUS: process.env.KAFKA_TOPIC_NOTIFICATION_STATUS,
  },
  
  // Email
  EMAIL: {
    ENABLED: process.env.EMAIL_ENABLED,
    FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    FROM_NAME: process.env.EMAIL_FROM_NAME,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    MAX_CONNECTIONS: process.env.EMAIL_MAX_CONNECTIONS,
    RATE_LIMIT: process.env.EMAIL_RATE_LIMIT,
    TEMPLATE_PATH: process.env.EMAIL_TEMPLATE_PATH,
    RETRY_ATTEMPTS: process.env.EMAIL_RETRY_ATTEMPTS,
    RETRY_DELAY: process.env.EMAIL_RETRY_DELAY,
  },
  
  // SMS
  SMS: {
    ENABLED: process.env.SMS_ENABLED,
    PROVIDER: process.env.SMS_PROVIDER,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    AWS_REGION: process.env.AWS_REGION,
    RATE_LIMIT: process.env.SMS_RATE_LIMIT,
    RETRY_ATTEMPTS: process.env.SMS_RETRY_ATTEMPTS,
    RETRY_DELAY: process.env.SMS_RETRY_DELAY,
  },
  
  // Push Notifications
  PUSH: {
    ENABLED: process.env.PUSH_ENABLED,
    WEB_PUSH_VAPID_PUBLIC_KEY: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    WEB_PUSH_VAPID_PRIVATE_KEY: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    WEB_PUSH_VAPID_EMAIL: process.env.WEB_PUSH_VAPID_EMAIL,
    FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
    APNS_KEY_ID: process.env.APNS_KEY_ID,
    APNS_TEAM_ID: process.env.APNS_TEAM_ID,
    APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID,
    APNS_PRIVATE_KEY: process.env.APNS_PRIVATE_KEY,
    RATE_LIMIT: process.env.PUSH_RATE_LIMIT,
    RETRY_ATTEMPTS: process.env.PUSH_RETRY_ATTEMPTS,
    RETRY_DELAY: process.env.PUSH_RETRY_DELAY,
  },
  
  // Queue
  QUEUE: {
    CONCURRENCY: process.env.QUEUE_CONCURRENCY,
    MAX_ATTEMPTS: process.env.QUEUE_MAX_ATTEMPTS,
    BACKOFF_DELAY: process.env.QUEUE_BACKOFF_DELAY,
    REMOVE_ON_COMPLETE: process.env.QUEUE_REMOVE_ON_COMPLETE,
    REMOVE_ON_FAIL: process.env.QUEUE_REMOVE_ON_FAIL,
    JOB_TTL: process.env.QUEUE_JOB_TTL,
    STALLED_INTERVAL: process.env.QUEUE_STALLED_INTERVAL,
    MAX_STALLED_COUNT: process.env.QUEUE_MAX_STALLED_COUNT,
  },
  
  // Rate Limiting
  RATE_LIMITING: {
    ENABLED: process.env.RATE_LIMITING_ENABLED,
    WINDOW_MS: process.env.RATE_LIMITING_WINDOW_MS,
    MAX_REQUESTS: process.env.RATE_LIMITING_MAX_REQUESTS,
    SKIP_SUCCESSFUL_REQUESTS: process.env.RATE_LIMITING_SKIP_SUCCESSFUL,
  },
  
  // Security
  SECURITY: {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_ISSUER: process.env.JWT_ISSUER,
    JWT_AUDIENCE: process.env.JWT_AUDIENCE,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    ENABLE_AUTH: process.env.SECURITY_ENABLE_AUTH,
    ENABLE_RATE_LIMITING: process.env.SECURITY_ENABLE_RATE_LIMITING,
  },
  
  // Monitoring
  MONITORING: {
    ENABLE_METRICS: process.env.MONITORING_ENABLE_METRICS,
    METRICS_INTERVAL: process.env.MONITORING_METRICS_INTERVAL,
    ENABLE_HEALTH_CHECK: process.env.MONITORING_ENABLE_HEALTH_CHECK,
    HEALTH_CHECK_INTERVAL: process.env.MONITORING_HEALTH_CHECK_INTERVAL,
    LOG_LEVEL: process.env.MONITORING_LOG_LEVEL,
  },
  
  // Notification Defaults
  NOTIFICATION_DEFAULTS: {
    EMAIL_ENABLED: process.env.NOTIFICATION_EMAIL_ENABLED,
    SMS_ENABLED: process.env.NOTIFICATION_SMS_ENABLED,
    PUSH_ENABLED: process.env.NOTIFICATION_PUSH_ENABLED,
    DIGEST_ENABLED: process.env.NOTIFICATION_DIGEST_ENABLED,
    DIGEST_FREQUENCY: process.env.NOTIFICATION_DIGEST_FREQUENCY,
    DIGEST_TIME: process.env.NOTIFICATION_DIGEST_TIME,
    TIMEZONE: process.env.NOTIFICATION_TIMEZONE,
  },
  
  // External Services
  EXTERNAL_SERVICES: {
    API_GATEWAY_URL: process.env.API_GATEWAY_URL,
    USER_SERVICE_URL: process.env.USER_SERVICE_URL,
    TRADING_SERVICE_URL: process.env.TRADING_SERVICE_URL,
    WEBSOCKET_SERVICE_URL: process.env.WEBSOCKET_SERVICE_URL,
  },
};

export const config = configSchema.parse(env);

export type Config = typeof config;