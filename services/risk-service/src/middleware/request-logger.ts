/**
 * Request Logger Middleware
 * Logs HTTP requests with performance timing and security information
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface RequestTiming {
  start: number;
  end?: number;
  duration?: number;
}

// Extend Request interface to include timing
declare global {
  namespace Express {
    interface Request {
      startTime: number;
      requestId: string;
    }
  }
}

/**
 * Generate unique request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get client IP address (handles proxies)
 */
const getClientIP = (req: Request): string => {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

/**
 * Sanitize sensitive headers for logging
 */
const sanitizeHeaders = (headers: any): any => {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const sanitized = { ...headers };
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

/**
 * Log request start
 */
const logRequestStart = (req: Request): void => {
  const logData = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: getClientIP(req),
    headers: config.DEBUG ? sanitizeHeaders(req.headers) : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    timestamp: new Date().toISOString()
  };

  logger.info('Request started', logData);
};

/**
 * Log request completion
 */
const logRequestEnd = (req: Request, res: Response): void => {
  const duration = Date.now() - req.startTime;
  const responseSize = res.get('Content-Length') || '0';
  
  const logData = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    responseSize: `${responseSize} bytes`,
    ip: getClientIP(req),
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  // Log level based on status code and duration
  if (res.statusCode >= 500) {
    logger.error('Request completed with error', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('Request completed with client error', logData);
  } else if (duration > 5000) { // Slow request (>5s)
    logger.warn('Slow request completed', logData);
  } else {
    logger.info('Request completed', logData);
  }
};

/**
 * Main request logger middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Skip logging for health checks in production
  if (config.NODE_ENV === 'production' && req.path.startsWith('/health')) {
    return next();
  }

  // Initialize request tracking
  req.startTime = Date.now();
  req.requestId = generateRequestId();

  // Add request ID to response headers for tracking
  res.setHeader('X-Request-ID', req.requestId);

  // Log request start
  logRequestStart(req);

  // Capture the original end method
  const originalEnd = res.end;

  // Override res.end to log when response is sent
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    // Log request completion
    logRequestEnd(req, res);

    // Call the original end method
    originalEnd.call(res, chunk, encoding, cb);
  };

  next();
};

/**
 * Security logging middleware
 * Logs potentially suspicious activities
 */
export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /\.\.\//,           // Path traversal
    /<script/i,         // XSS attempts
    /union.*select/i,   // SQL injection
    /javascript:/i,     // JavaScript protocol
    /data:.*base64/i    // Data URI with base64
  ];

  const url = req.originalUrl;
  const userAgent = req.get('User-Agent') || '';
  const body = JSON.stringify(req.body);

  // Check for suspicious patterns
  const suspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(userAgent) || pattern.test(body)
  );

  if (suspicious) {
    logger.warn('Suspicious request detected', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      ip: getClientIP(req),
      userAgent: req.get('User-Agent'),
      body: req.body,
      headers: sanitizeHeaders(req.headers),
      timestamp: new Date().toISOString(),
      severity: 'SECURITY_ALERT'
    });
  }

  // Check for rate limiting violations
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  if (forwardedFor && forwardedFor.split(',').length > 5) {
    logger.warn('Potential proxy chain manipulation', {
      requestId: req.requestId,
      xForwardedFor: forwardedFor,
      ip: getClientIP(req),
      timestamp: new Date().toISOString(),
      severity: 'SECURITY_ALERT'
    });
  }

  next();
};

/**
 * Performance monitoring middleware
 * Tracks and alerts on slow requests
 */
export const performanceLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startHrTime = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startHrTime);
    const duration = seconds * 1000 + nanoseconds / 1e6; // Convert to milliseconds

    // Alert on slow requests (>2 seconds)
    if (duration > 2000) {
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration: `${duration.toFixed(2)}ms`,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        severity: 'PERFORMANCE_ALERT'
      });
    }

    // Track memory usage for resource-intensive requests
    if (duration > 1000) {
      const memUsage = process.memoryUsage();
      logger.info('Resource usage for slow request', {
        requestId: req.requestId,
        duration: `${duration.toFixed(2)}ms`,
        memory: {
          rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
};