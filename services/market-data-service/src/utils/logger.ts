/**
 * Market Data Service Logger
 * Structured logging with Winston following ml-analytics-service patterns
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
 * Development log format with colors
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
 * Production log format with structured JSON
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
      service: 'market-data-service',
      environment: config.service.nodeEnv,
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
      level: config.service.logLevel,
      format: config.service.nodeEnv === 'production' ? productionFormat : developmentFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transports for production
  if (config.service.nodeEnv === 'production') {
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
 * Main logger instance
 */
export const logger = winston.createLogger({
  levels: LOG_LEVELS,
  level: config.service.logLevel,
  format: productionFormat,
  defaultMeta: {
    service: 'market-data-service',
    environment: config.service.nodeEnv,
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

// Specialized loggers
export const serverLogger = createLogger('server');
export const apiLogger = createLogger('api');
export const providerLogger = createLogger('provider');
export const cacheLogger = createLogger('cache');
export const wsLogger = createLogger('websocket');
export const dbLogger = createLogger('database');
export const queueLogger = createLogger('queue');
export const metricsLogger = createLogger('metrics');
export const healthLogger = createLogger('health');

/**
 * Log provider events
 */
export const logProviderEvent = (
  event: 'connect' | 'disconnect' | 'error' | 'rate_limit' | 'data_received',
  provider: string,
  metadata?: Record<string, any>
) => {
  providerLogger.info(`Provider ${event}`, {
    provider,
    event,
    ...metadata
  });
};

/**
 * Log API requests
 */
export const logApiRequest = (
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  metadata?: Record<string, any>
) => {
  const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
  
  apiLogger[level](`${method} ${path} ${statusCode}`, {
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    ...metadata
  });
};

/**
 * Log cache operations
 */
export const logCacheOperation = (
  operation: 'get' | 'set' | 'del' | 'hit' | 'miss',
  key: string,
  metadata?: Record<string, any>
) => {
  cacheLogger.debug(`Cache ${operation}`, {
    operation,
    key,
    ...metadata
  });
};

/**
 * Log data quality events
 */
export const logDataQuality = (
  provider: string,
  symbol: string,
  score: number,
  metadata?: Record<string, any>
) => {
  const level = score < 0.5 ? 'warn' : score < 0.7 ? 'info' : 'debug';
  
  logger[level]('Data quality check', {
    provider,
    symbol,
    score,
    context: 'data-quality',
    ...metadata
  });
};

/**
 * Log WebSocket events
 */
export const logWebSocketEvent = (
  event: 'connection' | 'disconnection' | 'subscription' | 'message',
  clientId?: string,
  metadata?: Record<string, any>
) => {
  wsLogger.info(`WebSocket ${event}`, {
    event,
    clientId,
    ...metadata
  });
};

/**
 * Performance timer utility
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

  end(additionalMetadata?: Record<string, any>): number {
    const duration = performance.now() - this.startTime;
    
    metricsLogger.info(`Operation completed: ${this.context}`, {
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
 * Error logging utility
 */
export const logError = (error: Error, context?: string, metadata?: Record<string, any>) => {
  const loggerInstance = context ? createLogger(context) : logger;
  
  loggerInstance.error(error.message, {
    error: error.name,
    stack: error.stack,
    ...metadata
  });
};

// Handle uncaught exceptions and rejections
if (config.service.nodeEnv === 'production') {
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

/**
 * Log server events
 */
export const logServerEvent = (
  event: string,
  metadata?: Record<string, any>
) => {
  serverLogger.info(`Server event: ${event}`, metadata);
};

/**
 * Request logging middleware
 */
export const requestLoggingMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    apiLogger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};


export default logger;