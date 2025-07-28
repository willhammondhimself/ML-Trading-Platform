import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config/environment';

// Extend Request interface to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Request logging middleware
 * Logs incoming requests and their responses with timing information
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID
  req.requestId = uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.set('X-Request-ID', req.requestId);

  // Skip logging for health checks and metrics in production
  const skipPaths = ['/api/health', '/metrics', '/favicon.ico'];
  if (!isDevelopment() && skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Log incoming request
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    referer: req.get('Referer'),
    origin: req.get('Origin'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString()
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(obj: any) {
    // Log response (excluding sensitive data)
    logResponse(req, res, obj);
    return originalJson.call(this, obj);
  };

  // Override res.send to log response
  const originalSend = res.send;
  res.send = function(body: any) {
    // Only log if not already logged by res.json
    if (!res.headersSent || res.get('Content-Type')?.includes('application/json')) {
      logResponse(req, res, body);
    }
    return originalSend.call(this, body);
  };

  // Log when response finishes
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    logger.http('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      ip: req.ip,
      userId: (req as any).user?.id
    });

    // Log slow requests
    if (duration > 1000) { // Slower than 1 second
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode
      });
    }

    // Log error responses
    if (res.statusCode >= 400) {
      const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
      logger.log(logLevel, 'Error response', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userId: (req as any).user?.id
      });
    }
  });

  // Log when client disconnects
  req.on('close', () => {
    if (!res.headersSent) {
      logger.warn('Client disconnected', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        ip: req.ip
      });
    }
  });

  next();
};

/**
 * Log response with sanitized data
 */
const logResponse = (req: Request, res: Response, body: any): void => {
  if (res.headersSent) return;

  const duration = req.startTime ? Date.now() - req.startTime : 0;
  
  // Sanitize response body for logging (remove sensitive data)
  let sanitizedBody = sanitizeResponseBody(body, req.path);
  
  const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';
  
  // Only log response body in development or for errors
  if (isDevelopment() || res.statusCode >= 400) {
    logger.log(logLevel, 'Response sent', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      responseSize: JSON.stringify(sanitizedBody).length,
      body: sanitizedBody,
      headers: sanitizeHeaders(res.getHeaders())
    });
  }
};

/**
 * Sanitize response body to remove sensitive information
 */
const sanitizeResponseBody = (body: any, path: string): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  try {
    const sanitized = JSON.parse(JSON.stringify(body));
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'passwordHash', 
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'mfaSecret',
      'apiKey',
      'privateKey'
    ];

    const removeSensitiveFields = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(removeSensitiveFields);
      }
      
      if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => 
            key.toLowerCase().includes(field.toLowerCase())
          )) {
            cleaned[key] = '[REDACTED]';
          } else {
            cleaned[key] = removeSensitiveFields(value);
          }
        }
        return cleaned;
      }
      
      return obj;
    };

    return removeSensitiveFields(sanitized);
  } catch (error) {
    return '[UNPARSEABLE]';
  }
};

/**
 * Sanitize headers to remove sensitive information
 */
const sanitizeHeaders = (headers: any): any => {
  const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Performance monitoring middleware
 * Tracks endpoint performance metrics
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log performance metrics
    logger.info('Performance metric', {
      type: 'endpoint_performance',
      method: req.method,
      path: req.route?.path || req.path,
      statusCode: res.statusCode,
      duration,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
    
    // Alert on slow endpoints
    if (duration > 5000) { // Slower than 5 seconds
      logger.error('Very slow endpoint', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode,
        requestId: req.requestId
      });
    }
  });
  
  next();
};