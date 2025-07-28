/**
 * Logging Utility
 * Structured logging with Winston for ML Analytics WebSocket Service
 */

import winston from 'winston';
import { config } from '../config';

// Define log levels and colors
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(LOG_COLORS);

/**
 * Custom log format for development
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * Custom log format for production
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logObject = {
      timestamp,
      level,
      message,
      service: 'ml-analytics-websocket',
      environment: config.nodeEnv,
      ...meta
    };

    if (stack) {
      logObject.stack = stack;
    }

    return JSON.stringify(logObject);
  })
);

/**
 * Create transports based on environment
 */
const createTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Console transport
  transports.push(
    new winston.transports.Console({
      level: config.logLevel,
      format: config.nodeEnv === 'production' ? productionFormat : developmentFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transports for production
  if (config.nodeEnv === 'production') {
    // Error log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: productionFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true
      })
    );

    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: productionFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        tailable: true
      })
    );
  }

  return transports;
};

/**
 * Create the main logger instance
 */
export const logger = winston.createLogger({
  levels: LOG_LEVELS,
  level: config.logLevel,
  format: productionFormat,
  defaultMeta: {
    service: 'ml-analytics-websocket',
    environment: config.nodeEnv,
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: createTransports(),
  exitOnError: false
});

/**
 * Create child logger with specific context
 */
export const createLogger = (context: string, metadata: Record<string, any> = {}) => {
  return logger.child({
    context,
    ...metadata
  });
};

/**
 * Performance logger for metrics
 */
export const performanceLogger = createLogger('performance');

/**
 * WebSocket specific logger
 */
export const wsLogger = createLogger('websocket');

/**
 * Database logger
 */
export const dbLogger = createLogger('database');

/**
 * Kafka logger
 */
export const kafkaLogger = createLogger('kafka');

/**
 * Redis logger
 */
export const redisLogger = createLogger('redis');

/**
 * HTTP request logger middleware
 */
export const httpLogger = createLogger('http');

/**
 * Error logger utility
 */
export const logError = (error: Error, context?: string, metadata?: Record<string, any>) => {
  const loggerInstance = context ? createLogger(context) : logger;
  
  loggerInstance.error(error.message, {
    error: error.name,
    stack: error.stack,
    ...metadata
  });
};

/**
 * Performance timing utility
 */
export class PerformanceTimer {
  private startTime: number;
  private context: string;
  private metadata: Record<string, any>;

  constructor(context: string, metadata: Record<string, any> = {}) {
    this.context = context;
    this.metadata = metadata;
    this.startTime = performance.now();
  }

  /**
   * End timing and log the result
   */
  end(additionalMetadata?: Record<string, any>): number {
    const duration = performance.now() - this.startTime;
    
    performanceLogger.info(`Operation completed: ${this.context}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...this.metadata,
      ...additionalMetadata
    });

    return duration;
  }
}

/**
 * Create a performance timer
 */
export const createPerformanceTimer = (context: string, metadata?: Record<string, any>) => {
  return new PerformanceTimer(context, metadata);
};

/**
 * Log WebSocket connection events
 */
export const logConnectionEvent = (
  event: 'connect' | 'disconnect' | 'error' | 'reconnect',
  connectionId: string,
  metadata?: Record<string, any>
) => {
  wsLogger.info(`WebSocket ${event}`, {
    connectionId,
    event,
    ...metadata
  });
};

/**
 * Log message processing events
 */
export const logMessageEvent = (
  event: 'sent' | 'received' | 'queued' | 'processed' | 'failed',
  messageId: string,
  messageType?: string,
  metadata?: Record<string, any>
) => {
  wsLogger.info(`Message ${event}`, {
    messageId,
    messageType,
    event,
    ...metadata
  });
};

/**
 * Log rate limiting events
 */
export const logRateLimitEvent = (
  event: 'allowed' | 'blocked' | 'throttled',
  clientId: string,
  metadata?: Record<string, any>
) => {
  logger.warn(`Rate limit ${event}`, {
    clientId,
    event,
    ...metadata
  });
};

/**
 * Log circuit breaker events
 */
export const logCircuitBreakerEvent = (
  event: 'opened' | 'closed' | 'half-open',
  service: string,
  metadata?: Record<string, any>
) => {
  logger.warn(`Circuit breaker ${event}`, {
    service,
    event,
    ...metadata
  });
};

// Handle uncaught exceptions and rejections
if (config.nodeEnv === 'production') {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack,
      fatal: true
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
      fatal: true
    });
    process.exit(1);
  });
}

export default logger;