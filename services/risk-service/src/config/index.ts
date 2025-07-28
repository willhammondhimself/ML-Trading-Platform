/**
 * Configuration Management for Risk Service
 * 
 * Centralized configuration with environment variable validation,
 * type safety, and default values for all service settings.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const configSchema = z.object({
    // Basic service configuration
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(3004),
    DEBUG: z.coerce.boolean().default(false),
    
    // CORS settings
    CORS_ORIGINS: z.string().default('*').transform(origins => 
        origins === '*' ? ['*'] : origins.split(',').map(origin => origin.trim())
    ),
    
    // Database configuration
    DATABASE_URL: z.string().default('postgres://risk_user:risk_pass@localhost:5432/risk_db'),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().default(20),
    DATABASE_IDLE_TIMEOUT: z.coerce.number().default(30000),
    DATABASE_CONNECTION_TIMEOUT: z.coerce.number().default(60000),
    
    // Redis configuration
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(3),
    REDIS_KEY_PREFIX: z.string().default('risk:'),
    
    // Kafka configuration
    KAFKA_BROKERS: z.string().default('localhost:9092').transform(brokers =>
        brokers.split(',').map(broker => broker.trim())
    ),
    KAFKA_CLIENT_ID: z.string().default('risk-service'),
    KAFKA_GROUP_ID: z.string().default('risk-service-group'),
    KAFKA_USERNAME: z.string().optional(),
    KAFKA_PASSWORD: z.string().optional(),
    
    // Kafka topics
    KAFKA_TOPICS: z.object({
        TRADES: z.string().default('trades'),
        POSITIONS: z.string().default('positions'),
        ORDERS: z.string().default('orders'),
        MARKET_DATA: z.string().default('market-data'),
        RISK_ALERTS: z.string().default('risk-alerts'),
        COMPLIANCE_EVENTS: z.string().default('compliance-events'),
        AUDIT_TRAIL: z.string().default('audit-trail')
    }).default({}),
    
    // External service URLs
    TRADING_SERVICE_URL: z.string().default('http://localhost:3001'),
    USER_SERVICE_URL: z.string().default('http://localhost:3000'),
    ML_PIPELINE_SERVICE_URL: z.string().default('http://localhost:8002'),
    MARKET_DATA_SERVICE_URL: z.string().default('http://localhost:3002'),
    
    // Risk management settings
    RISK_CONFIG: z.object({
        MAX_POSITION_SIZE: z.coerce.number().default(1000000), // $1M
        MAX_DAILY_LOSS: z.coerce.number().default(50000), // $50K
        MAX_PORTFOLIO_VALUE: z.coerce.number().default(10000000), // $10M
        VAR_CONFIDENCE_LEVEL: z.coerce.number().default(0.95), // 95%
        VAR_TIME_HORIZON: z.coerce.number().default(1), // 1 day
        MARGIN_REQUIREMENT: z.coerce.number().default(0.3), // 30%
        LEVERAGE_LIMIT: z.coerce.number().default(4), // 4:1
        CONCENTRATION_LIMIT: z.coerce.number().default(0.2) // 20% per asset
    }).default({}),
    
    // Compliance settings
    COMPLIANCE_CONFIG: z.object({
        TRADE_REPORTING_ENABLED: z.coerce.boolean().default(true),
        REGULATORY_REPORTING_ENABLED: z.coerce.boolean().default(true),
        AML_MONITORING_ENABLED: z.coerce.boolean().default(true),
        POSITION_LIMIT_MONITORING: z.coerce.boolean().default(true),
        SUSPICIOUS_ACTIVITY_THRESHOLD: z.coerce.number().default(100000), // $100K
        LARGE_TRADE_THRESHOLD: z.coerce.number().default(50000), // $50K
        HIGH_FREQUENCY_THRESHOLD: z.coerce.number().default(100) // 100 trades/hour
    }).default({}),
    
    // Monitoring settings
    MONITORING_CONFIG: z.object({
        RISK_CHECK_INTERVAL: z.coerce.number().default(5000), // 5 seconds
        COMPLIANCE_CHECK_INTERVAL: z.coerce.number().default(10000), // 10 seconds
        ALERT_COOLDOWN_PERIOD: z.coerce.number().default(300000), // 5 minutes
        METRIC_RETENTION_DAYS: z.coerce.number().default(365),
        AUDIT_LOG_RETENTION_DAYS: z.coerce.number().default(2555) // 7 years
    }).default({}),
    
    // Alert settings
    ALERT_CONFIG: z.object({
        EMAIL_ENABLED: z.coerce.boolean().default(true),
        SMS_ENABLED: z.coerce.boolean().default(false),
        SLACK_ENABLED: z.coerce.boolean().default(false),
        WEBHOOK_ENABLED: z.coerce.boolean().default(true),
        EMAIL_SMTP_HOST: z.string().optional(),
        EMAIL_SMTP_PORT: z.coerce.number().optional(),
        EMAIL_USERNAME: z.string().optional(),
        EMAIL_PASSWORD: z.string().optional(),
        SLACK_WEBHOOK_URL: z.string().optional(),
        ALERT_WEBHOOK_URL: z.string().optional()
    }).default({}),
    
    // Rate limiting
    RATE_LIMIT: z.object({
        WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
        MAX_REQUESTS: z.coerce.number().default(1000),
        SKIP_FAILED_REQUESTS: z.coerce.boolean().default(false),
        SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false)
    }).default({}),
    
    // Authentication settings
    AUTH_CONFIG: z.object({
        JWT_SECRET: z.string().default('risk-service-secret-key'),
        JWT_EXPIRE_TIME: z.string().default('24h'),
        API_KEY_HEADER: z.string().default('X-API-Key'),
        REQUIRE_AUTH: z.coerce.boolean().default(true)
    }).default({}),
    
    // Logging configuration
    LOG_CONFIG: z.object({
        LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
        FORMAT: z.enum(['json', 'simple']).default('json'),
        MAX_FILES: z.coerce.number().default(5),
        MAX_SIZE: z.string().default('20m'),
        ENABLE_CONSOLE: z.coerce.boolean().default(true),
        ENABLE_FILE: z.coerce.boolean().default(true)
    }).default({})
});

// Validate and parse configuration
const parseConfig = () => {
    try {
        const rawConfig = {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            DEBUG: process.env.DEBUG,
            
            CORS_ORIGINS: process.env.CORS_ORIGINS,
            
            DATABASE_URL: process.env.DATABASE_URL,
            DATABASE_MAX_CONNECTIONS: process.env.DATABASE_MAX_CONNECTIONS,
            DATABASE_IDLE_TIMEOUT: process.env.DATABASE_IDLE_TIMEOUT,
            DATABASE_CONNECTION_TIMEOUT: process.env.DATABASE_CONNECTION_TIMEOUT,
            
            REDIS_URL: process.env.REDIS_URL,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD,
            REDIS_DB: process.env.REDIS_DB,
            REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
            
            KAFKA_BROKERS: process.env.KAFKA_BROKERS,
            KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
            KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID,
            KAFKA_USERNAME: process.env.KAFKA_USERNAME,
            KAFKA_PASSWORD: process.env.KAFKA_PASSWORD,
            
            KAFKA_TOPICS: {
                TRADES: process.env.KAFKA_TOPIC_TRADES,
                POSITIONS: process.env.KAFKA_TOPIC_POSITIONS,
                ORDERS: process.env.KAFKA_TOPIC_ORDERS,
                MARKET_DATA: process.env.KAFKA_TOPIC_MARKET_DATA,
                RISK_ALERTS: process.env.KAFKA_TOPIC_RISK_ALERTS,
                COMPLIANCE_EVENTS: process.env.KAFKA_TOPIC_COMPLIANCE_EVENTS,
                AUDIT_TRAIL: process.env.KAFKA_TOPIC_AUDIT_TRAIL
            },
            
            TRADING_SERVICE_URL: process.env.TRADING_SERVICE_URL,
            USER_SERVICE_URL: process.env.USER_SERVICE_URL,
            ML_PIPELINE_SERVICE_URL: process.env.ML_PIPELINE_SERVICE_URL,
            MARKET_DATA_SERVICE_URL: process.env.MARKET_DATA_SERVICE_URL,
            
            RISK_CONFIG: {
                MAX_POSITION_SIZE: process.env.RISK_MAX_POSITION_SIZE,
                MAX_DAILY_LOSS: process.env.RISK_MAX_DAILY_LOSS,
                MAX_PORTFOLIO_VALUE: process.env.RISK_MAX_PORTFOLIO_VALUE,
                VAR_CONFIDENCE_LEVEL: process.env.RISK_VAR_CONFIDENCE_LEVEL,
                VAR_TIME_HORIZON: process.env.RISK_VAR_TIME_HORIZON,
                MARGIN_REQUIREMENT: process.env.RISK_MARGIN_REQUIREMENT,
                LEVERAGE_LIMIT: process.env.RISK_LEVERAGE_LIMIT,
                CONCENTRATION_LIMIT: process.env.RISK_CONCENTRATION_LIMIT
            },
            
            COMPLIANCE_CONFIG: {
                TRADE_REPORTING_ENABLED: process.env.COMPLIANCE_TRADE_REPORTING_ENABLED,
                REGULATORY_REPORTING_ENABLED: process.env.COMPLIANCE_REGULATORY_REPORTING_ENABLED,
                AML_MONITORING_ENABLED: process.env.COMPLIANCE_AML_MONITORING_ENABLED,
                POSITION_LIMIT_MONITORING: process.env.COMPLIANCE_POSITION_LIMIT_MONITORING,
                SUSPICIOUS_ACTIVITY_THRESHOLD: process.env.COMPLIANCE_SUSPICIOUS_ACTIVITY_THRESHOLD,
                LARGE_TRADE_THRESHOLD: process.env.COMPLIANCE_LARGE_TRADE_THRESHOLD,
                HIGH_FREQUENCY_THRESHOLD: process.env.COMPLIANCE_HIGH_FREQUENCY_THRESHOLD
            },
            
            MONITORING_CONFIG: {
                RISK_CHECK_INTERVAL: process.env.MONITORING_RISK_CHECK_INTERVAL,
                COMPLIANCE_CHECK_INTERVAL: process.env.MONITORING_COMPLIANCE_CHECK_INTERVAL,
                ALERT_COOLDOWN_PERIOD: process.env.MONITORING_ALERT_COOLDOWN_PERIOD,
                METRIC_RETENTION_DAYS: process.env.MONITORING_METRIC_RETENTION_DAYS,
                AUDIT_LOG_RETENTION_DAYS: process.env.MONITORING_AUDIT_LOG_RETENTION_DAYS
            },
            
            ALERT_CONFIG: {
                EMAIL_ENABLED: process.env.ALERT_EMAIL_ENABLED,
                SMS_ENABLED: process.env.ALERT_SMS_ENABLED,
                SLACK_ENABLED: process.env.ALERT_SLACK_ENABLED,
                WEBHOOK_ENABLED: process.env.ALERT_WEBHOOK_ENABLED,
                EMAIL_SMTP_HOST: process.env.ALERT_EMAIL_SMTP_HOST,
                EMAIL_SMTP_PORT: process.env.ALERT_EMAIL_SMTP_PORT,
                EMAIL_USERNAME: process.env.ALERT_EMAIL_USERNAME,
                EMAIL_PASSWORD: process.env.ALERT_EMAIL_PASSWORD,
                SLACK_WEBHOOK_URL: process.env.ALERT_SLACK_WEBHOOK_URL,
                ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL
            },
            
            RATE_LIMIT: {
                WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
                MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
                SKIP_FAILED_REQUESTS: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS,
                SKIP_SUCCESSFUL_REQUESTS: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS
            },
            
            AUTH_CONFIG: {
                JWT_SECRET: process.env.JWT_SECRET,
                JWT_EXPIRE_TIME: process.env.JWT_EXPIRE_TIME,
                API_KEY_HEADER: process.env.API_KEY_HEADER,
                REQUIRE_AUTH: process.env.REQUIRE_AUTH
            },
            
            LOG_CONFIG: {
                LEVEL: process.env.LOG_LEVEL,
                FORMAT: process.env.LOG_FORMAT,
                MAX_FILES: process.env.LOG_MAX_FILES,
                MAX_SIZE: process.env.LOG_MAX_SIZE,
                ENABLE_CONSOLE: process.env.LOG_ENABLE_CONSOLE,
                ENABLE_FILE: process.env.LOG_ENABLE_FILE
            }
        };
        
        return configSchema.parse(rawConfig);
    } catch (error) {
        console.error('❌ Configuration validation failed:', error);
        process.exit(1);
    }
};

export const config = parseConfig();

// Export types
export type Config = z.infer<typeof configSchema>;
export type RiskConfig = Config['RISK_CONFIG'];
export type ComplianceConfig = Config['COMPLIANCE_CONFIG'];
export type MonitoringConfig = Config['MONITORING_CONFIG'];
export type AlertConfig = Config['ALERT_CONFIG'];

// Utility functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';