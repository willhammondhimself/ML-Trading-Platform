import winston from 'winston';
import { getEnvironment, isDevelopment } from '../config/environment';

// Custom log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}${
      info.stack ? `\n${info.stack}` : ''
    }`
  )
);

// Custom format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports based on environment
const createTransports = () => {
  const transports: winston.transport[] = [];

  if (isDevelopment()) {
    // Console transport for development
    transports.push(
      new winston.transports.Console({
        format: developmentFormat
      })
    );
  } else {
    // Console transport for production (structured JSON)
    transports.push(
      new winston.transports.Console({
        format: productionFormat
      })
    );

    // File transports for production
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: productionFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5
      })
    );

    transports.push(
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: productionFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5
      })
    );
  }

  return transports;
};

// Create logger instance
const logger = winston.createLogger({
  level: isDevelopment() ? 'debug' : 'info',
  levels: logLevels,
  format: productionFormat,
  transports: createTransports(),
  // Don't exit on handled exceptions
  exitOnError: false
});

// Handle uncaught exceptions and rejections in production
if (!isDevelopment()) {
  logger.exceptions.handle(
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      format: productionFormat
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: 'logs/rejections.log',
      format: productionFormat
    })
  );
}

// Helper methods for structured logging
export const createLogger = (service: string) => {
  return {
    error: (message: string, error?: Error | any) => {
      logger.error(message, { 
        service,
        error: error?.message,
        stack: error?.stack,
        ...error?.details 
      });
    },
    
    warn: (message: string, meta?: any) => {
      logger.warn(message, { service, ...meta });
    },
    
    info: (message: string, meta?: any) => {
      logger.info(message, { service, ...meta });
    },
    
    http: (message: string, meta?: any) => {
      logger.http(message, { service, ...meta });
    },
    
    debug: (message: string, meta?: any) => {
      logger.debug(message, { service, ...meta });
    }
  };
};

// Security logging helpers
export const logSecurityEvent = (event: {
  action: string;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  details?: any;
}) => {
  logger.info('Security Event', {
    type: 'security',
    action: event.action,
    userId: event.userId,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    success: event.success,
    details: event.details,
    timestamp: new Date().toISOString()
  });
};

// Performance logging helpers
export const logPerformance = (operation: string, duration: number, meta?: any) => {
  logger.info('Performance Metric', {
    type: 'performance',
    operation,
    duration,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

// Database logging helpers
export const logDatabaseQuery = (query: string, duration: number, error?: Error) => {
  if (error) {
    logger.error('Database Query Failed', {
      type: 'database',
      query,
      duration,
      error: error.message,
      stack: error.stack
    });
  } else if (isDevelopment()) {
    logger.debug('Database Query', {
      type: 'database',
      query,
      duration
    });
  }
};

// HTTP request logging
export const logHttpRequest = (req: any, res: any, duration: number) => {
  const level = res.statusCode >= 400 ? 'error' : 'http';
  
  logger.log(level, 'HTTP Request', {
    type: 'http',
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
};

export { logger };
export default logger;