/**
 * Structured Logging Configuration for WebSocket Service
 * 
 * Winston-based logging with JSON formatting, connection tracking,
 * and structured metadata for production observability.
 */

import winston from 'winston';
import { config } from '../config';

// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

// Define log colors for console output
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue'
};

winston.addColors(logColors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        
        // Add stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }
        
        return log;
    })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport
transports.push(
    new winston.transports.Console({
        level: config.MONITORING.LOG_LEVEL,
        format: config.NODE_ENV === 'production' ? structuredFormat : consoleFormat,
        handleExceptions: true,
        handleRejections: true
    })
);

// File transports for production
if (config.NODE_ENV === 'production') {
    // Combined log file
    transports.push(
        new winston.transports.File({
            filename: 'logs/websocket-service.log',
            level: config.MONITORING.LOG_LEVEL,
            format: structuredFormat,
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            handleExceptions: true,
            handleRejections: true
        })
    );
    
    // Error-only log file
    transports.push(
        new winston.transports.File({
            filename: 'logs/websocket-service-error.log',
            level: 'error',
            format: structuredFormat,
            maxsize: 20 * 1024 * 1024,
            maxFiles: 5,
            handleExceptions: true,
            handleRejections: true
        })
    );
    
    // WebSocket activity log
    transports.push(
        new winston.transports.File({
            filename: 'logs/websocket-activity.log',
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format((info) => {
                    // Only log WebSocket-related entries
                    return info.category?.startsWith('ws_') ? info : false;
                })()
            ),
            maxsize: 50 * 1024 * 1024, // 50MB
            maxFiles: 10
        })
    );
}

// Create logger instance
export const logger = winston.createLogger({
    levels: logLevels,
    level: config.MONITORING.LOG_LEVEL,
    format: structuredFormat,
    transports,
    exitOnError: false,
    defaultMeta: {
        service: 'websocket-service',
        environment: config.NODE_ENV,
        version: '1.0.0',
        hostname: process.env.HOSTNAME || 'unknown'
    }
});

// Enhanced logging methods with structured data
export const createContextLogger = (context: Record<string, any>) => {
    return {
        error: (message: string, meta?: Record<string, any>) => {
            logger.error(message, { ...context, ...meta });
        },
        warn: (message: string, meta?: Record<string, any>) => {
            logger.warn(message, { ...context, ...meta });
        },
        info: (message: string, meta?: Record<string, any>) => {
            logger.info(message, { ...context, ...meta });
        },
        debug: (message: string, meta?: Record<string, any>) => {
            logger.debug(message, { ...context, ...meta });
        }
    };
};

// WebSocket specific logging methods
export const wsLogger = {
    connection: (
        connectionId: string,
        event: 'connected' | 'disconnected' | 'authenticated' | 'error',
        details?: Record<string, any>
    ) => {
        logger.info('WebSocket connection event', {
            category: 'ws_connection',
            connectionId,
            event,
            ...details
        });
    },
    
    message: (
        connectionId: string,
        direction: 'inbound' | 'outbound',
        messageType: string,
        size: number,
        userId?: string,
        channel?: string
    ) => {
        logger.debug('WebSocket message', {
            category: 'ws_message',
            connectionId,
            direction,
            messageType,
            size,
            userId,
            channel
        });
    },
    
    subscription: (
        connectionId: string,
        action: 'subscribe' | 'unsubscribe',
        channel: string,
        symbols: string[],
        userId?: string
    ) => {
        logger.info('WebSocket subscription', {
            category: 'ws_subscription',
            connectionId,
            action,
            channel,
            symbolCount: symbols.length,
            symbols: symbols.slice(0, 10), // Log first 10 symbols
            userId
        });
    },
    
    rateLimit: (
        connectionId: string,
        limitType: string,
        current: number,
        limit: number,
        userId?: string
    ) => {
        logger.warn('WebSocket rate limit', {
            category: 'ws_rate_limit',
            connectionId,
            limitType,
            current,
            limit,
            userId
        });
    },
    
    broadcast: (
        channel: string,
        messageType: string,
        recipientCount: number,
        dataSize: number,
        latency?: number
    ) => {
        logger.debug('WebSocket broadcast', {
            category: 'ws_broadcast',
            channel,
            messageType,
            recipientCount,
            dataSize,
            latency
        });
    },
    
    kafka: (
        event: 'message_received' | 'message_processed' | 'error' | 'connection_status',
        topic: string,
        details?: Record<string, any>
    ) => {
        const level = event === 'error' ? 'error' : 'debug';
        logger.log(level, 'Kafka event', {
            category: 'ws_kafka',
            event,
            topic,
            ...details
        });
    },
    
    redis: (
        operation: string,
        key: string,
        success: boolean,
        latency?: number,
        error?: string
    ) => {
        const level = success ? 'debug' : 'error';
        logger.log(level, 'Redis operation', {
            category: 'ws_redis',
            operation,
            key,
            success,
            latency,
            error
        });
    },
    
    performance: (
        metric: string,
        value: number,
        unit: string,
        tags?: Record<string, any>
    ) => {
        logger.info('Performance metric', {
            category: 'ws_performance',
            metric,
            value,
            unit,
            ...tags
        });
    },
    
    security: (
        event: string,
        severity: 'low' | 'medium' | 'high' | 'critical',
        connectionId?: string,
        userId?: string,
        details?: Record<string, any>
    ) => {
        const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
        logger.log(level, 'Security event', {
            category: 'ws_security',
            event,
            severity,
            connectionId,
            userId,
            ...details
        });
    }
};

// Performance logging utility
export const performanceLogger = {
    time: (operation: string, context?: Record<string, any>) => {
        const startTime = process.hrtime.bigint();
        
        return {
            end: (additionalContext?: Record<string, any>) => {
                const endTime = process.hrtime.bigint();
                const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
                
                logger.debug('Performance measurement', {
                    category: 'ws_performance',
                    operation,
                    duration_ms: duration,
                    ...context,
                    ...additionalContext
                });
                
                return duration;
            }
        };
    }
};

// Error logging utility
export const logError = (error: Error, context?: Record<string, any>) => {
    logger.error('Application error', {
        category: 'ws_error',
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...context
    });
};

// Health check logging
export const logHealthCheck = (
    component: string, 
    status: 'healthy' | 'unhealthy' | 'degraded', 
    details?: Record<string, any>
) => {
    const level = status === 'healthy' ? 'info' : 'error';
    
    logger.log(level, `Health check: ${component}`, {
        category: 'ws_health',
        component,
        status,
        ...details
    });
};

// Metrics aggregation logging
export const logMetrics = (metrics: Record<string, any>) => {
    logger.info('Service metrics', {
        category: 'ws_metrics',
        timestamp: new Date().toISOString(),
        ...metrics
    });
};

// Request correlation helper
export const addConnectionId = (connectionId: string) => {
    return createContextLogger({ connectionId });
};

// Export default logger
export default logger;