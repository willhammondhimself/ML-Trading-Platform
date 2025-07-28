/**
 * Configuration Management for WebSocket Service
 * 
 * Centralized configuration with environment variable validation,
 * WebSocket settings, Kafka and Redis configurations.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const configSchema = z.object({
    // Basic service configuration
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(8081),
    WS_PORT: z.coerce.number().default(8082),
    DEBUG: z.coerce.boolean().default(false),
    
    // WebSocket configuration
    WEBSOCKET: z.object({
        MAX_CONNECTIONS: z.coerce.number().default(10000),
        HEARTBEAT_INTERVAL: z.coerce.number().default(30000), // 30 seconds
        MAX_MESSAGE_SIZE: z.coerce.number().default(1024000), // 1MB
        CONNECTION_TIMEOUT: z.coerce.number().default(60000), // 1 minute
        COMPRESSION_ENABLED: z.coerce.boolean().default(true),
        PER_IP_LIMIT: z.coerce.number().default(10),
        RATE_LIMIT_WINDOW: z.coerce.number().default(60000), // 1 minute
        RATE_LIMIT_MAX: z.coerce.number().default(100)
    }).default({}),
    
    // Authentication
    JWT_SECRET: z.string().default('websocket-service-secret-key'),
    JWT_ISSUER: z.string().default('ml-trading-platform'),
    JWT_AUDIENCE: z.string().default('websocket-service'),
    
    // Redis configuration
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(1),
    REDIS_KEY_PREFIX: z.string().default('ws:'),
    REDIS_CLUSTER_MODE: z.coerce.boolean().default(false),
    
    // Kafka configuration
    KAFKA: z.object({
        BROKERS: z.string().default('localhost:9092').transform(brokers => 
            brokers.split(',').map(broker => broker.trim())
        ),
        CLIENT_ID: z.string().default('websocket-service'),
        GROUP_ID: z.string().default('websocket-consumers'),
        SESSION_TIMEOUT: z.coerce.number().default(30000),
        HEARTBEAT_INTERVAL: z.coerce.number().default(3000),
        MAX_BYTES_PER_PARTITION: z.coerce.number().default(1048576), // 1MB
        ENABLE_AUTO_COMMIT: z.coerce.boolean().default(true),
        AUTO_COMMIT_INTERVAL: z.coerce.number().default(5000),
        RETRY_ATTEMPTS: z.coerce.number().default(5),
        RETRY_DELAY: z.coerce.number().default(100)
    }).default({}),
    
    // Topic configurations
    KAFKA_TOPICS: z.object({
        MARKET_DATA: z.string().default('market-data-stream'),
        TRADE_EXECUTIONS: z.string().default('trade-executions'),
        PORTFOLIO_UPDATES: z.string().default('portfolio-updates'),
        ML_PREDICTIONS: z.string().default('ml-predictions'),
        RISK_ALERTS: z.string().default('risk-alerts'),
        SYSTEM_EVENTS: z.string().default('system-events'),
        USER_NOTIFICATIONS: z.string().default('user-notifications'),
        ORDER_UPDATES: z.string().default('order-updates'),
        POSITION_UPDATES: z.string().default('position-updates'),
        COMPLIANCE_EVENTS: z.string().default('compliance-events')
    }).default({}),
    
    // Channel configurations
    WS_CHANNELS: z.object({
        MARKET_DATA: z.string().default('market_data'),
        PORTFOLIO: z.string().default('portfolio'),
        TRADING: z.string().default('trading'),
        ML_ANALYTICS: z.string().default('ml_analytics'),
        NOTIFICATIONS: z.string().default('notifications'),
        RISK_MANAGEMENT: z.string().default('risk_management'),
        SYSTEM_STATUS: z.string().default('system_status')
    }).default({}),
    
    // Subscription limits by tier
    SUBSCRIPTION_LIMITS: z.object({
        FREE: z.object({
            MAX_CHANNELS: z.coerce.number().default(3),
            MAX_SYMBOLS: z.coerce.number().default(10),
            RATE_LIMIT: z.coerce.number().default(10) // messages per second
        }).default({}),
        BASIC: z.object({
            MAX_CHANNELS: z.coerce.number().default(10),
            MAX_SYMBOLS: z.coerce.number().default(50),
            RATE_LIMIT: z.coerce.number().default(50)
        }).default({}),
        PREMIUM: z.object({
            MAX_CHANNELS: z.coerce.number().default(25),
            MAX_SYMBOLS: z.coerce.number().default(200),
            RATE_LIMIT: z.coerce.number().default(200)
        }).default({}),
        ENTERPRISE: z.object({
            MAX_CHANNELS: z.coerce.number().default(100),
            MAX_SYMBOLS: z.coerce.number().default(1000),
            RATE_LIMIT: z.coerce.number().default(1000)
        }).default({})
    }).default({}),
    
    // Security configuration
    SECURITY: z.object({
        ENABLE_AUTH: z.coerce.boolean().default(true),
        ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
        ENABLE_IP_WHITELIST: z.coerce.boolean().default(false),
        IP_WHITELIST: z.string().default('').transform(ips =>
            ips ? ips.split(',').map(ip => ip.trim()) : []
        ),
        MAX_PAYLOAD_SIZE: z.coerce.number().default(1024000), // 1MB
        COMPRESSION_THRESHOLD: z.coerce.number().default(1024) // 1KB
    }).default({}),
    
    // Monitoring configuration
    MONITORING: z.object({
        ENABLE_METRICS: z.coerce.boolean().default(true),
        METRICS_INTERVAL: z.coerce.number().default(30000), // 30 seconds
        ENABLE_HEALTH_CHECK: z.coerce.boolean().default(true),
        HEALTH_CHECK_INTERVAL: z.coerce.number().default(10000), // 10 seconds
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
    }).default({}),
    
    // Performance tuning
    PERFORMANCE: z.object({
        ENABLE_CLUSTERING: z.coerce.boolean().default(false),
        WORKER_PROCESSES: z.coerce.number().default(0), // 0 = auto-detect CPUs
        MEMORY_LIMIT: z.coerce.number().default(512), // MB
        GC_INTERVAL: z.coerce.number().default(300000), // 5 minutes
        CONNECTION_POOL_SIZE: z.coerce.number().default(100)
    }).default({}),
    
    // External service URLs
    SERVICES: z.object({
        API_GATEWAY_URL: z.string().default('http://localhost:8080'),
        USER_SERVICE_URL: z.string().default('http://localhost:3000'),
        TRADING_SERVICE_URL: z.string().default('http://localhost:3001'),
        MARKET_DATA_SERVICE_URL: z.string().default('http://localhost:3002'),
        ML_ANALYTICS_SERVICE_URL: z.string().default('http://localhost:3003'),
        RISK_SERVICE_URL: z.string().default('http://localhost:3004')
    }).default({})
});

// Validate and parse configuration
const parseConfig = () => {
    try {
        const rawConfig = {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            WS_PORT: process.env.WS_PORT,
            DEBUG: process.env.DEBUG,
            
            WEBSOCKET: {
                MAX_CONNECTIONS: process.env.WS_MAX_CONNECTIONS,
                HEARTBEAT_INTERVAL: process.env.WS_HEARTBEAT_INTERVAL,
                MAX_MESSAGE_SIZE: process.env.WS_MAX_MESSAGE_SIZE,
                CONNECTION_TIMEOUT: process.env.WS_CONNECTION_TIMEOUT,
                COMPRESSION_ENABLED: process.env.WS_COMPRESSION_ENABLED,
                PER_IP_LIMIT: process.env.WS_PER_IP_LIMIT,
                RATE_LIMIT_WINDOW: process.env.WS_RATE_LIMIT_WINDOW,
                RATE_LIMIT_MAX: process.env.WS_RATE_LIMIT_MAX
            },
            
            JWT_SECRET: process.env.JWT_SECRET,
            JWT_ISSUER: process.env.JWT_ISSUER,
            JWT_AUDIENCE: process.env.JWT_AUDIENCE,
            
            REDIS_URL: process.env.REDIS_URL,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD,
            REDIS_DB: process.env.REDIS_DB,
            REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
            REDIS_CLUSTER_MODE: process.env.REDIS_CLUSTER_MODE,
            
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
                RETRY_DELAY: process.env.KAFKA_RETRY_DELAY
            },
            
            KAFKA_TOPICS: {
                MARKET_DATA: process.env.KAFKA_TOPIC_MARKET_DATA,
                TRADE_EXECUTIONS: process.env.KAFKA_TOPIC_TRADE_EXECUTIONS,
                PORTFOLIO_UPDATES: process.env.KAFKA_TOPIC_PORTFOLIO_UPDATES,
                ML_PREDICTIONS: process.env.KAFKA_TOPIC_ML_PREDICTIONS,
                RISK_ALERTS: process.env.KAFKA_TOPIC_RISK_ALERTS,
                SYSTEM_EVENTS: process.env.KAFKA_TOPIC_SYSTEM_EVENTS,
                USER_NOTIFICATIONS: process.env.KAFKA_TOPIC_USER_NOTIFICATIONS,
                ORDER_UPDATES: process.env.KAFKA_TOPIC_ORDER_UPDATES,
                POSITION_UPDATES: process.env.KAFKA_TOPIC_POSITION_UPDATES,
                COMPLIANCE_EVENTS: process.env.KAFKA_TOPIC_COMPLIANCE_EVENTS
            },
            
            WS_CHANNELS: {
                MARKET_DATA: process.env.WS_CHANNEL_MARKET_DATA,
                PORTFOLIO: process.env.WS_CHANNEL_PORTFOLIO,
                TRADING: process.env.WS_CHANNEL_TRADING,
                ML_ANALYTICS: process.env.WS_CHANNEL_ML_ANALYTICS,
                NOTIFICATIONS: process.env.WS_CHANNEL_NOTIFICATIONS,
                RISK_MANAGEMENT: process.env.WS_CHANNEL_RISK_MANAGEMENT,
                SYSTEM_STATUS: process.env.WS_CHANNEL_SYSTEM_STATUS
            },
            
            SUBSCRIPTION_LIMITS: {
                FREE: {
                    MAX_CHANNELS: process.env.SUBSCRIPTION_FREE_MAX_CHANNELS,
                    MAX_SYMBOLS: process.env.SUBSCRIPTION_FREE_MAX_SYMBOLS,
                    RATE_LIMIT: process.env.SUBSCRIPTION_FREE_RATE_LIMIT
                },
                BASIC: {
                    MAX_CHANNELS: process.env.SUBSCRIPTION_BASIC_MAX_CHANNELS,
                    MAX_SYMBOLS: process.env.SUBSCRIPTION_BASIC_MAX_SYMBOLS,
                    RATE_LIMIT: process.env.SUBSCRIPTION_BASIC_RATE_LIMIT
                },
                PREMIUM: {
                    MAX_CHANNELS: process.env.SUBSCRIPTION_PREMIUM_MAX_CHANNELS,
                    MAX_SYMBOLS: process.env.SUBSCRIPTION_PREMIUM_MAX_SYMBOLS,
                    RATE_LIMIT: process.env.SUBSCRIPTION_PREMIUM_RATE_LIMIT
                },
                ENTERPRISE: {
                    MAX_CHANNELS: process.env.SUBSCRIPTION_ENTERPRISE_MAX_CHANNELS,
                    MAX_SYMBOLS: process.env.SUBSCRIPTION_ENTERPRISE_MAX_SYMBOLS,
                    RATE_LIMIT: process.env.SUBSCRIPTION_ENTERPRISE_RATE_LIMIT
                }
            },
            
            SECURITY: {
                ENABLE_AUTH: process.env.SECURITY_ENABLE_AUTH,
                ENABLE_RATE_LIMITING: process.env.SECURITY_ENABLE_RATE_LIMITING,
                ENABLE_IP_WHITELIST: process.env.SECURITY_ENABLE_IP_WHITELIST,
                IP_WHITELIST: process.env.SECURITY_IP_WHITELIST,
                MAX_PAYLOAD_SIZE: process.env.SECURITY_MAX_PAYLOAD_SIZE,
                COMPRESSION_THRESHOLD: process.env.SECURITY_COMPRESSION_THRESHOLD
            },
            
            MONITORING: {
                ENABLE_METRICS: process.env.MONITORING_ENABLE_METRICS,
                METRICS_INTERVAL: process.env.MONITORING_METRICS_INTERVAL,
                ENABLE_HEALTH_CHECK: process.env.MONITORING_ENABLE_HEALTH_CHECK,
                HEALTH_CHECK_INTERVAL: process.env.MONITORING_HEALTH_CHECK_INTERVAL,
                LOG_LEVEL: process.env.MONITORING_LOG_LEVEL
            },
            
            PERFORMANCE: {
                ENABLE_CLUSTERING: process.env.PERFORMANCE_ENABLE_CLUSTERING,
                WORKER_PROCESSES: process.env.PERFORMANCE_WORKER_PROCESSES,
                MEMORY_LIMIT: process.env.PERFORMANCE_MEMORY_LIMIT,
                GC_INTERVAL: process.env.PERFORMANCE_GC_INTERVAL,
                CONNECTION_POOL_SIZE: process.env.PERFORMANCE_CONNECTION_POOL_SIZE
            },
            
            SERVICES: {
                API_GATEWAY_URL: process.env.API_GATEWAY_URL,
                USER_SERVICE_URL: process.env.USER_SERVICE_URL,
                TRADING_SERVICE_URL: process.env.TRADING_SERVICE_URL,
                MARKET_DATA_SERVICE_URL: process.env.MARKET_DATA_SERVICE_URL,
                ML_ANALYTICS_SERVICE_URL: process.env.ML_ANALYTICS_SERVICE_URL,
                RISK_SERVICE_URL: process.env.RISK_SERVICE_URL
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
export type WebSocketConfig = Config['WEBSOCKET'];
export type KafkaConfig = Config['KAFKA'];
export type SecurityConfig = Config['SECURITY'];

// Utility functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';