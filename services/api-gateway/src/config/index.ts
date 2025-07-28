/**
 * Configuration Management for API Gateway
 * 
 * Centralized configuration with environment variable validation,
 * service discovery settings, and security configurations.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const configSchema = z.object({
    // Basic service configuration
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(8080),
    DEBUG: z.coerce.boolean().default(false),
    
    // CORS settings
    CORS_ORIGINS: z.string().default('*').transform(origins => 
        origins === '*' ? ['*'] : origins.split(',').map(origin => origin.trim())
    ),
    
    // Database configuration
    DATABASE_URL: z.string().default('postgres://gateway_user:gateway_pass@localhost:5432/gateway_db'),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().default(20),
    DATABASE_IDLE_TIMEOUT: z.coerce.number().default(30000),
    DATABASE_CONNECTION_TIMEOUT: z.coerce.number().default(60000),
    
    // Redis configuration
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(0),
    REDIS_KEY_PREFIX: z.string().default('gateway:'),
    
    // JWT Configuration
    JWT_SECRET: z.string().default('api-gateway-secret-key'),
    JWT_EXPIRE_TIME: z.string().default('24h'),
    JWT_REFRESH_EXPIRE_TIME: z.string().default('7d'),
    JWT_ISSUER: z.string().default('ml-trading-platform'),
    JWT_AUDIENCE: z.string().default('ml-trading-api'),
    
    // API Key Configuration
    API_KEY_HEADER: z.string().default('X-API-Key'),
    API_KEY_REQUIRE: z.coerce.boolean().default(false),
    
    // Service Discovery
    SERVICE_DISCOVERY: z.object({
        ENABLED: z.coerce.boolean().default(true),
        HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000), // 30 seconds
        SERVICE_TIMEOUT: z.coerce.number().default(10000), // 10 seconds
        MAX_RETRIES: z.coerce.number().default(3),
        CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(5),
        CIRCUIT_BREAKER_TIMEOUT: z.coerce.number().default(60000) // 1 minute
    }).default({}),
    
    // Downstream services
    SERVICES: z.object({
        USER_SERVICE: z.object({
            NAME: z.string().default('user-service'),
            URL: z.string().default('http://localhost:3000'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(10000),
            RETRIES: z.coerce.number().default(3)
        }).default({}),
        TRADING_SERVICE: z.object({
            NAME: z.string().default('trading-service'),
            URL: z.string().default('http://localhost:3001'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(10000),
            RETRIES: z.coerce.number().default(3)
        }).default({}),
        MARKET_DATA_SERVICE: z.object({
            NAME: z.string().default('market-data-service'),
            URL: z.string().default('http://localhost:3002'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(5000),
            RETRIES: z.coerce.number().default(2)
        }).default({}),
        ML_ANALYTICS_SERVICE: z.object({
            NAME: z.string().default('ml-analytics-service'),
            URL: z.string().default('http://localhost:3003'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(15000),
            RETRIES: z.coerce.number().default(2)
        }).default({}),
        RISK_SERVICE: z.object({
            NAME: z.string().default('risk-service'),
            URL: z.string().default('http://localhost:3004'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(10000),
            RETRIES: z.coerce.number().default(3)
        }).default({}),
        ML_PIPELINE_SERVICE: z.object({
            NAME: z.string().default('ml-pipeline-service'),
            URL: z.string().default('http://localhost:8002'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(30000),
            RETRIES: z.coerce.number().default(2)
        }).default({}),
        NOTIFICATION_SERVICE: z.object({
            NAME: z.string().default('notification-service'),
            URL: z.string().default('http://localhost:3005'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(5000),
            RETRIES: z.coerce.number().default(2)
        }).default({}),
        REPORTING_SERVICE: z.object({
            NAME: z.string().default('reporting-service'),
            URL: z.string().default('http://localhost:3006'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(20000),
            RETRIES: z.coerce.number().default(2)
        }).default({}),
        ALT_DATA_SERVICE: z.object({
            NAME: z.string().default('alt-data-service'),
            URL: z.string().default('http://localhost:3007'),
            HEALTH_PATH: z.string().default('/health'),
            TIMEOUT: z.coerce.number().default(10000),
            RETRIES: z.coerce.number().default(2)
        }).default({})
    }).default({}),
    
    // Rate limiting configuration
    RATE_LIMITING: z.object({
        ENABLED: z.coerce.boolean().default(true),
        WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
        MAX_REQUESTS: z.coerce.number().default(1000),
        SKIP_FAILED_REQUESTS: z.coerce.boolean().default(false),
        SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),
        
        // Tier-based limits
        TIERS: z.object({
            FREE: z.object({
                REQUESTS_PER_HOUR: z.coerce.number().default(100),
                REQUESTS_PER_DAY: z.coerce.number().default(1000),
                BURST_LIMIT: z.coerce.number().default(10)
            }).default({}),
            BASIC: z.object({
                REQUESTS_PER_HOUR: z.coerce.number().default(1000),
                REQUESTS_PER_DAY: z.coerce.number().default(10000),
                BURST_LIMIT: z.coerce.number().default(50)
            }).default({}),
            PREMIUM: z.object({
                REQUESTS_PER_HOUR: z.coerce.number().default(10000),
                REQUESTS_PER_DAY: z.coerce.number().default(100000),
                BURST_LIMIT: z.coerce.number().default(200)
            }).default({}),
            ENTERPRISE: z.object({
                REQUESTS_PER_HOUR: z.coerce.number().default(100000),
                REQUESTS_PER_DAY: z.coerce.number().default(1000000),
                BURST_LIMIT: z.coerce.number().default(1000)
            }).default({})
        }).default({})
    }).default({}),
    
    // Security configuration
    SECURITY: z.object({
        ENABLE_HTTPS: z.coerce.boolean().default(false),
        SSL_KEY_PATH: z.string().optional(),
        SSL_CERT_PATH: z.string().optional(),
        ENABLE_HSTS: z.coerce.boolean().default(true),
        ENABLE_CSRF_PROTECTION: z.coerce.boolean().default(true),
        TRUSTED_PROXIES: z.string().default('').transform(proxies =>
            proxies ? proxies.split(',').map(proxy => proxy.trim()) : []
        ),
        MAX_REQUEST_SIZE: z.string().default('10mb'),
        REQUEST_TIMEOUT: z.coerce.number().default(30000),
        BODY_PARSER_LIMIT: z.string().default('10mb')
    }).default({}),
    
    // Load balancing configuration
    LOAD_BALANCING: z.object({
        STRATEGY: z.enum(['round-robin', 'least-connections', 'weighted', 'ip-hash']).default('round-robin'),
        HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
        HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000),
        UNHEALTHY_THRESHOLD: z.coerce.number().default(3),
        HEALTHY_THRESHOLD: z.coerce.number().default(2)
    }).default({}),
    
    // Caching configuration
    CACHING: z.object({
        ENABLED: z.coerce.boolean().default(true),
        DEFAULT_TTL: z.coerce.number().default(300), // 5 minutes
        MAX_CACHE_SIZE: z.coerce.number().default(100), // MB
        CACHE_STRATEGIES: z.object({
            MARKET_DATA: z.coerce.number().default(10), // 10 seconds
            USER_PROFILE: z.coerce.number().default(300), // 5 minutes
            PORTFOLIO_DATA: z.coerce.number().default(60), // 1 minute
            STATIC_DATA: z.coerce.number().default(3600) // 1 hour
        }).default({})
    }).default({}),
    
    // Monitoring configuration
    MONITORING: z.object({
        ENABLE_METRICS: z.coerce.boolean().default(true),
        METRICS_PATH: z.string().default('/metrics'),
        ENABLE_TRACING: z.coerce.boolean().default(true),
        TRACE_SAMPLE_RATE: z.coerce.number().default(0.1),
        ENABLE_LOGGING: z.coerce.boolean().default(true),
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
    }).default({}),
    
    // WebSocket configuration
    WEBSOCKET: z.object({
        ENABLED: z.coerce.boolean().default(true),
        MAX_CONNECTIONS: z.coerce.number().default(10000),
        HEARTBEAT_INTERVAL: z.coerce.number().default(30000),
        MAX_MESSAGE_SIZE: z.coerce.number().default(1024000) // 1MB
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
            
            JWT_SECRET: process.env.JWT_SECRET,
            JWT_EXPIRE_TIME: process.env.JWT_EXPIRE_TIME,
            JWT_REFRESH_EXPIRE_TIME: process.env.JWT_REFRESH_EXPIRE_TIME,
            JWT_ISSUER: process.env.JWT_ISSUER,
            JWT_AUDIENCE: process.env.JWT_AUDIENCE,
            
            API_KEY_HEADER: process.env.API_KEY_HEADER,
            API_KEY_REQUIRE: process.env.API_KEY_REQUIRE,
            
            SERVICE_DISCOVERY: {
                ENABLED: process.env.SERVICE_DISCOVERY_ENABLED,
                HEALTH_CHECK_INTERVAL: process.env.SERVICE_DISCOVERY_HEALTH_CHECK_INTERVAL,
                SERVICE_TIMEOUT: process.env.SERVICE_DISCOVERY_TIMEOUT,
                MAX_RETRIES: process.env.SERVICE_DISCOVERY_MAX_RETRIES,
                CIRCUIT_BREAKER_THRESHOLD: process.env.SERVICE_DISCOVERY_CIRCUIT_BREAKER_THRESHOLD,
                CIRCUIT_BREAKER_TIMEOUT: process.env.SERVICE_DISCOVERY_CIRCUIT_BREAKER_TIMEOUT
            },
            
            SERVICES: {
                USER_SERVICE: {
                    NAME: process.env.USER_SERVICE_NAME,
                    URL: process.env.USER_SERVICE_URL,
                    HEALTH_PATH: process.env.USER_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.USER_SERVICE_TIMEOUT,
                    RETRIES: process.env.USER_SERVICE_RETRIES
                },
                TRADING_SERVICE: {
                    NAME: process.env.TRADING_SERVICE_NAME,
                    URL: process.env.TRADING_SERVICE_URL,
                    HEALTH_PATH: process.env.TRADING_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.TRADING_SERVICE_TIMEOUT,
                    RETRIES: process.env.TRADING_SERVICE_RETRIES
                },
                MARKET_DATA_SERVICE: {
                    NAME: process.env.MARKET_DATA_SERVICE_NAME,
                    URL: process.env.MARKET_DATA_SERVICE_URL,
                    HEALTH_PATH: process.env.MARKET_DATA_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.MARKET_DATA_SERVICE_TIMEOUT,
                    RETRIES: process.env.MARKET_DATA_SERVICE_RETRIES
                },
                ML_ANALYTICS_SERVICE: {
                    NAME: process.env.ML_ANALYTICS_SERVICE_NAME,
                    URL: process.env.ML_ANALYTICS_SERVICE_URL,
                    HEALTH_PATH: process.env.ML_ANALYTICS_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.ML_ANALYTICS_SERVICE_TIMEOUT,
                    RETRIES: process.env.ML_ANALYTICS_SERVICE_RETRIES
                },
                RISK_SERVICE: {
                    NAME: process.env.RISK_SERVICE_NAME,
                    URL: process.env.RISK_SERVICE_URL,
                    HEALTH_PATH: process.env.RISK_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.RISK_SERVICE_TIMEOUT,
                    RETRIES: process.env.RISK_SERVICE_RETRIES
                },
                ML_PIPELINE_SERVICE: {
                    NAME: process.env.ML_PIPELINE_SERVICE_NAME,
                    URL: process.env.ML_PIPELINE_SERVICE_URL,
                    HEALTH_PATH: process.env.ML_PIPELINE_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.ML_PIPELINE_SERVICE_TIMEOUT,
                    RETRIES: process.env.ML_PIPELINE_SERVICE_RETRIES
                },
                NOTIFICATION_SERVICE: {
                    NAME: process.env.NOTIFICATION_SERVICE_NAME,
                    URL: process.env.NOTIFICATION_SERVICE_URL,
                    HEALTH_PATH: process.env.NOTIFICATION_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.NOTIFICATION_SERVICE_TIMEOUT,
                    RETRIES: process.env.NOTIFICATION_SERVICE_RETRIES
                },
                REPORTING_SERVICE: {
                    NAME: process.env.REPORTING_SERVICE_NAME,
                    URL: process.env.REPORTING_SERVICE_URL,
                    HEALTH_PATH: process.env.REPORTING_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.REPORTING_SERVICE_TIMEOUT,
                    RETRIES: process.env.REPORTING_SERVICE_RETRIES
                },
                ALT_DATA_SERVICE: {
                    NAME: process.env.ALT_DATA_SERVICE_NAME,
                    URL: process.env.ALT_DATA_SERVICE_URL,
                    HEALTH_PATH: process.env.ALT_DATA_SERVICE_HEALTH_PATH,
                    TIMEOUT: process.env.ALT_DATA_SERVICE_TIMEOUT,
                    RETRIES: process.env.ALT_DATA_SERVICE_RETRIES
                }
            },
            
            RATE_LIMITING: {
                ENABLED: process.env.RATE_LIMITING_ENABLED,
                WINDOW_MS: process.env.RATE_LIMITING_WINDOW_MS,
                MAX_REQUESTS: process.env.RATE_LIMITING_MAX_REQUESTS,
                SKIP_FAILED_REQUESTS: process.env.RATE_LIMITING_SKIP_FAILED_REQUESTS,
                SKIP_SUCCESSFUL_REQUESTS: process.env.RATE_LIMITING_SKIP_SUCCESSFUL_REQUESTS,
                
                TIERS: {
                    FREE: {
                        REQUESTS_PER_HOUR: process.env.RATE_LIMITING_FREE_REQUESTS_PER_HOUR,
                        REQUESTS_PER_DAY: process.env.RATE_LIMITING_FREE_REQUESTS_PER_DAY,
                        BURST_LIMIT: process.env.RATE_LIMITING_FREE_BURST_LIMIT
                    },
                    BASIC: {
                        REQUESTS_PER_HOUR: process.env.RATE_LIMITING_BASIC_REQUESTS_PER_HOUR,
                        REQUESTS_PER_DAY: process.env.RATE_LIMITING_BASIC_REQUESTS_PER_DAY,
                        BURST_LIMIT: process.env.RATE_LIMITING_BASIC_BURST_LIMIT
                    },
                    PREMIUM: {
                        REQUESTS_PER_HOUR: process.env.RATE_LIMITING_PREMIUM_REQUESTS_PER_HOUR,
                        REQUESTS_PER_DAY: process.env.RATE_LIMITING_PREMIUM_REQUESTS_PER_DAY,
                        BURST_LIMIT: process.env.RATE_LIMITING_PREMIUM_BURST_LIMIT
                    },
                    ENTERPRISE: {
                        REQUESTS_PER_HOUR: process.env.RATE_LIMITING_ENTERPRISE_REQUESTS_PER_HOUR,
                        REQUESTS_PER_DAY: process.env.RATE_LIMITING_ENTERPRISE_REQUESTS_PER_DAY,
                        BURST_LIMIT: process.env.RATE_LIMITING_ENTERPRISE_BURST_LIMIT
                    }
                }
            },
            
            SECURITY: {
                ENABLE_HTTPS: process.env.SECURITY_ENABLE_HTTPS,
                SSL_KEY_PATH: process.env.SECURITY_SSL_KEY_PATH,
                SSL_CERT_PATH: process.env.SECURITY_SSL_CERT_PATH,
                ENABLE_HSTS: process.env.SECURITY_ENABLE_HSTS,
                ENABLE_CSRF_PROTECTION: process.env.SECURITY_ENABLE_CSRF_PROTECTION,
                TRUSTED_PROXIES: process.env.SECURITY_TRUSTED_PROXIES,
                MAX_REQUEST_SIZE: process.env.SECURITY_MAX_REQUEST_SIZE,
                REQUEST_TIMEOUT: process.env.SECURITY_REQUEST_TIMEOUT,
                BODY_PARSER_LIMIT: process.env.SECURITY_BODY_PARSER_LIMIT
            },
            
            LOAD_BALANCING: {
                STRATEGY: process.env.LOAD_BALANCING_STRATEGY,
                HEALTH_CHECK_ENABLED: process.env.LOAD_BALANCING_HEALTH_CHECK_ENABLED,
                HEALTH_CHECK_INTERVAL: process.env.LOAD_BALANCING_HEALTH_CHECK_INTERVAL,
                UNHEALTHY_THRESHOLD: process.env.LOAD_BALANCING_UNHEALTHY_THRESHOLD,
                HEALTHY_THRESHOLD: process.env.LOAD_BALANCING_HEALTHY_THRESHOLD
            },
            
            CACHING: {
                ENABLED: process.env.CACHING_ENABLED,
                DEFAULT_TTL: process.env.CACHING_DEFAULT_TTL,
                MAX_CACHE_SIZE: process.env.CACHING_MAX_CACHE_SIZE,
                CACHE_STRATEGIES: {
                    MARKET_DATA: process.env.CACHING_MARKET_DATA_TTL,
                    USER_PROFILE: process.env.CACHING_USER_PROFILE_TTL,
                    PORTFOLIO_DATA: process.env.CACHING_PORTFOLIO_DATA_TTL,
                    STATIC_DATA: process.env.CACHING_STATIC_DATA_TTL
                }
            },
            
            MONITORING: {
                ENABLE_METRICS: process.env.MONITORING_ENABLE_METRICS,
                METRICS_PATH: process.env.MONITORING_METRICS_PATH,
                ENABLE_TRACING: process.env.MONITORING_ENABLE_TRACING,
                TRACE_SAMPLE_RATE: process.env.MONITORING_TRACE_SAMPLE_RATE,
                ENABLE_LOGGING: process.env.MONITORING_ENABLE_LOGGING,
                LOG_LEVEL: process.env.MONITORING_LOG_LEVEL
            },
            
            WEBSOCKET: {
                ENABLED: process.env.WEBSOCKET_ENABLED,
                MAX_CONNECTIONS: process.env.WEBSOCKET_MAX_CONNECTIONS,
                HEARTBEAT_INTERVAL: process.env.WEBSOCKET_HEARTBEAT_INTERVAL,
                MAX_MESSAGE_SIZE: process.env.WEBSOCKET_MAX_MESSAGE_SIZE
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
export type ServiceConfig = Config['SERVICES'][keyof Config['SERVICES']];
export type RateLimitingConfig = Config['RATE_LIMITING'];
export type SecurityConfig = Config['SECURITY'];

// Utility functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';