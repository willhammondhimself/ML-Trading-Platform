/**
 * Structured Logging Configuration for Risk Service
 * 
 * Winston-based logging with JSON formatting, multiple transports,
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
if (config.LOG_CONFIG.ENABLE_CONSOLE) {
    transports.push(
        new winston.transports.Console({
            level: config.LOG_CONFIG.LEVEL,
            format: config.LOG_CONFIG.FORMAT === 'json' ? structuredFormat : consoleFormat,
            handleExceptions: true,
            handleRejections: true
        })
    );
}

// File transports
if (config.LOG_CONFIG.ENABLE_FILE) {
    // Combined log file
    transports.push(
        new winston.transports.File({
            filename: 'logs/risk-service.log',
            level: config.LOG_CONFIG.LEVEL,
            format: structuredFormat,
            maxsize: parseInt(config.LOG_CONFIG.MAX_SIZE) * 1024 * 1024, // Convert MB to bytes
            maxFiles: config.LOG_CONFIG.MAX_FILES,
            handleExceptions: true,
            handleRejections: true
        })
    );
    
    // Error-only log file
    transports.push(
        new winston.transports.File({
            filename: 'logs/risk-service-error.log',
            level: 'error',
            format: structuredFormat,
            maxsize: parseInt(config.LOG_CONFIG.MAX_SIZE) * 1024 * 1024,
            maxFiles: config.LOG_CONFIG.MAX_FILES,
            handleExceptions: true,
            handleRejections: true
        })
    );
}

// Create logger instance
export const logger = winston.createLogger({
    levels: logLevels,
    level: config.LOG_CONFIG.LEVEL,
    format: structuredFormat,
    transports,
    exitOnError: false,
    defaultMeta: {
        service: 'risk-service',
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

// Risk-specific logging methods
export const riskLogger = {
    violation: (userId: string, violationType: string, details: Record<string, any>) => {
        logger.warn('Risk violation detected', {
            category: 'risk_violation',
            userId,
            violationType,
            ...details
        });
    },
    
    compliance: (userId: string, eventType: string, details: Record<string, any>) => {
        logger.info('Compliance event recorded', {
            category: 'compliance_event',
            userId,
            eventType,
            ...details
        });
    },
    
    alert: (alertType: string, severity: string, details: Record<string, any>) => {
        logger.warn('Risk alert generated', {
            category: 'risk_alert',
            alertType,
            severity,
            ...details
        });
    },
    
    audit: (userId: string, action: string, entityType: string, details: Record<string, any>) => {
        logger.info('Audit event logged', {
            category: 'audit_trail',
            userId,
            action,
            entityType,
            ...details
        });
    },
    
    metrics: (userId: string, metricType: string, values: Record<string, any>) => {
        logger.debug('Risk metrics calculated', {
            category: 'risk_metrics',
            userId,
            metricType,
            ...values
        });
    },
    
    monitoring: (monitorType: string, status: string, details: Record<string, any>) => {
        logger.info('Monitoring event', {
            category: 'monitoring',
            monitorType,
            status,
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
                    category: 'performance',
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
        category: 'error',
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...context
    });
};

// Request logging utility
export const logRequest = (method: string, url: string, statusCode: number, duration: number, meta?: Record<string, any>) => {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    logger.log(level, 'HTTP request completed', {
        category: 'http_request',
        method,
        url,
        statusCode,
        duration_ms: duration,
        ...meta
    });
};

// Database logging utility
export const logDatabaseQuery = (query: string, duration: number, rowCount?: number, error?: Error) => {
    if (error) {
        logger.error('Database query failed', {
            category: 'database_error',
            query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
            duration_ms: duration,
            error: error.message
        });
    } else {
        logger.debug('Database query executed', {
            category: 'database_query',
            query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
            duration_ms: duration,
            rowCount
        });
    }
};

// Kafka logging utility
export const logKafkaEvent = (topic: string, action: string, messageCount?: number, error?: Error) => {
    if (error) {
        logger.error('Kafka operation failed', {
            category: 'kafka_error',
            topic,
            action,
            error: error.message
        });
    } else {
        logger.info('Kafka operation completed', {
            category: 'kafka_event',
            topic,
            action,
            messageCount
        });
    }
};

// Health check logging
export const logHealthCheck = (component: string, status: 'healthy' | 'unhealthy', details?: Record<string, any>) => {
    const level = status === 'healthy' ? 'info' : 'error';
    
    logger.log(level, `Health check: ${component}`, {
        category: 'health_check',
        component,
        status,
        ...details
    });
};

// Export default logger
export default logger;