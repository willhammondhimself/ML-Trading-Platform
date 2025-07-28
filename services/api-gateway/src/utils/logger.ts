/**
 * Structured Logging Configuration for API Gateway
 * 
 * Winston-based logging with JSON formatting, request correlation,
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
            filename: 'logs/api-gateway.log',
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
            filename: 'logs/api-gateway-error.log',
            level: 'error',
            format: structuredFormat,
            maxsize: parseInt(config.LOG_CONFIG.MAX_SIZE) * 1024 * 1024,
            maxFiles: config.LOG_CONFIG.MAX_FILES,
            handleExceptions: true,
            handleRejections: true
        })
    );
    
    // Access log file for requests
    transports.push(
        new winston.transports.File({
            filename: 'logs/api-gateway-access.log',
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format((info) => {
                    // Only log access-related entries
                    return info.category === 'http_request' ? info : false;
                })()
            ),
            maxsize: parseInt(config.LOG_CONFIG.MAX_SIZE) * 1024 * 1024,
            maxFiles: config.LOG_CONFIG.MAX_FILES
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
        service: 'api-gateway',
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

// API Gateway specific logging methods
export const gatewayLogger = {
    request: (
        method: string, 
        url: string, 
        statusCode: number, 
        duration: number, 
        userId?: string,
        requestId?: string,
        serviceRoute?: string
    ) => {
        logger.info('HTTP request processed', {
            category: 'http_request',
            method,
            url,
            statusCode,
            duration_ms: duration,
            userId,
            requestId,
            serviceRoute,
            success: statusCode < 400
        });
    },
    
    serviceCall: (
        serviceName: string,
        method: string,
        path: string,
        statusCode: number,
        duration: number,
        requestId?: string
    ) => {
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        
        logger.log(level, 'Service call completed', {
            category: 'service_call',
            serviceName,
            method,
            path,
            statusCode,
            duration_ms: duration,
            requestId,
            success: statusCode < 400
        });
    },
    
    auth: (
        event: string,
        userId?: string,
        requestId?: string,
        details?: Record<string, any>
    ) => {
        logger.info('Authentication event', {
            category: 'authentication',
            event,
            userId,
            requestId,
            ...details
        });
    },
    
    rateLimit: (
        identifier: string,
        limit: number,
        remaining: number,
        resetTime: number,
        requestId?: string
    ) => {
        logger.warn('Rate limit event', {
            category: 'rate_limit',
            identifier,
            limit,
            remaining,
            resetTime,
            requestId,
            blocked: remaining <= 0
        });
    },
    
    circuitBreaker: (
        serviceName: string,
        state: string,
        errorCount?: number,
        requestId?: string
    ) => {
        logger.warn('Circuit breaker state change', {
            category: 'circuit_breaker',
            serviceName,
            state,
            errorCount,
            requestId
        });
    },
    
    loadBalancer: (
        serviceName: string,
        selectedInstance: string,
        strategy: string,
        healthyInstances: number,
        totalInstances: number
    ) => {
        logger.debug('Load balancer selection', {
            category: 'load_balancer',
            serviceName,
            selectedInstance,
            strategy,
            healthyInstances,
            totalInstances
        });
    },
    
    cache: (
        operation: string,
        key: string,
        hit: boolean,
        ttl?: number,
        requestId?: string
    ) => {
        logger.debug('Cache operation', {
            category: 'cache',
            operation,
            key,
            hit,
            ttl,
            requestId
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

// Request correlation middleware helper
export const addRequestId = (req: any, res: any, next: any) => {
    const requestId = req.headers['x-request-id'] || 
                     req.headers['x-correlation-id'] || 
                     require('uuid').v4();
    
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    // Add request ID to all subsequent logs
    req.logger = createContextLogger({ requestId });
    
    next();
};

// Health check logging
export const logHealthCheck = (
    component: string, 
    status: 'healthy' | 'unhealthy', 
    details?: Record<string, any>,
    requestId?: string
) => {
    const level = status === 'healthy' ? 'info' : 'error';
    
    logger.log(level, `Health check: ${component}`, {
        category: 'health_check',
        component,
        status,
        requestId,
        ...details
    });
};

// Security event logging
export const logSecurityEvent = (
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    requestId?: string
) => {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    
    logger.log(level, `Security event: ${event}`, {
        category: 'security',
        event,
        severity,
        requestId,
        ...details
    });
};

// Export default logger
export default logger;