import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Security middleware for additional protection
 */
export const securityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Security headers (additional to helmet)
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  });

  // Remove server header
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Input sanitization middleware
 */
export const inputSanitizer = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Sanitize object recursively
 */
const sanitizeObject = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const cleanKey = sanitizeString(key);
      
      // Recursively sanitize value
      if (typeof value === 'string') {
        sanitized[cleanKey] = sanitizeString(value);
      } else {
        sanitized[cleanKey] = sanitizeObject(value);
      }
    }
    
    return sanitized;
  }

  return typeof obj === 'string' ? sanitizeString(obj) : obj;
};

/**
 * Sanitize string input
 */
const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    // Remove null bytes
    .replace(/\0/g, '')
    // Trim whitespace
    .trim()
    // Limit length (prevent DoS)
    .substring(0, 10000);
};

/**
 * Request size limiter
 */
export const requestSizeLimiter = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      logger.warn('Request size too large', {
        contentLength,
        maxSize,
        ip: req.ip,
        url: req.url
      });
      
      res.status(413).json({
        error: 'Payload Too Large',
        message: `Request size exceeds ${maxSize} bytes limit`,
        maxSize
      });
      return;
    }

    next();
  };
};

/**
 * Suspicious activity detector
 */
export const suspiciousActivityDetector = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    // SQL injection attempts
    /(\s*(union|select|insert|delete|update|drop|create|alter|exec|execute)\s+)/i,
    // XSS attempts
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    // Path traversal attempts
    /\.\.[\/\\]/,
    // Command injection attempts
    /(\||;|&|`|\$\(|\$\{)/,
    // NoSQL injection attempts
    /(\$where|\$ne|\$gt|\$lt|\$regex)/i,
  ];

  const checkString = (str: string, path: string): boolean => {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(str)) {
        logger.warn('Suspicious activity detected', {
          pattern: pattern.toString(),
          path,
          value: str.substring(0, 100), // Log first 100 chars
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url
        });
        return true;
      }
    }
    return false;
  };

  const checkObject = (obj: any, path: string = ''): boolean => {
    if (typeof obj === 'string') {
      return checkString(obj, path);
    }

    if (Array.isArray(obj)) {
      return obj.some((item, index) => checkObject(item, `${path}[${index}]`));
    }

    if (obj && typeof obj === 'object') {
      return Object.entries(obj).some(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        return checkString(key, newPath) || checkObject(value, newPath);
      });
    }

    return false;
  };

  // Check various parts of the request
  let suspicious = false;

  // Check URL
  if (checkString(req.url, 'url')) {
    suspicious = true;
  }

  // Check headers
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string' && checkString(value, `header.${name}`)) {
      suspicious = true;
    }
  }

  // Check body
  if (req.body && checkObject(req.body, 'body')) {
    suspicious = true;
  }

  // Check query parameters
  if (req.query && checkObject(req.query, 'query')) {
    suspicious = true;
  }

  if (suspicious) {
    // Log security event
    logger.error('Security threat detected', {
      type: 'suspicious_activity',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // Could implement blocking here, but for now just log
    // In production, might want to block or require additional verification
  }

  next();
};

/**
 * IP whitelist/blacklist middleware
 */
export const createIPFilter = (options: {
  whitelist?: string[];
  blacklist?: string[];
  trustProxy?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = options.trustProxy ? 
      (req.get('X-Forwarded-For') || req.get('X-Real-IP') || req.ip) :
      req.ip;

    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(clientIP)) {
      logger.warn('Blocked IP attempted access', {
        ip: clientIP,
        url: req.url,
        userAgent: req.get('User-Agent')
      });

      res.status(403).json({
        error: 'Access Denied',
        message: 'Your IP address has been blocked'
      });
      return;
    }

    // Check whitelist if configured
    if (options.whitelist && !options.whitelist.includes(clientIP)) {
      logger.warn('Non-whitelisted IP attempted access', {
        ip: clientIP,
        url: req.url,
        userAgent: req.get('User-Agent')
      });

      res.status(403).json({
        error: 'Access Denied',
        message: 'Your IP address is not authorized'
      });
      return;
    }

    next();
  };
};