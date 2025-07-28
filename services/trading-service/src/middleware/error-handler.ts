import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Error types
export class ValidationError extends Error {
  public statusCode: number = 400;
  public code: string = 'VALIDATION_ERROR';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ValidationError';
    if (code) this.code = code;
  }
}

export class AuthenticationError extends Error {
  public statusCode: number = 401;
  public code: string = 'AUTHENTICATION_ERROR';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthenticationError';
    if (code) this.code = code;
  }
}

export class AuthorizationError extends Error {
  public statusCode: number = 403;
  public code: string = 'AUTHORIZATION_ERROR';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthorizationError';
    if (code) this.code = code;
  }
}

export class NotFoundError extends Error {
  public statusCode: number = 404;
  public code: string = 'NOT_FOUND';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'NotFoundError';
    if (code) this.code = code;
  }
}

export class ConflictError extends Error {
  public statusCode: number = 409;
  public code: string = 'CONFLICT';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ConflictError';
    if (code) this.code = code;
  }
}

export class RateLimitError extends Error {
  public statusCode: number = 429;
  public code: string = 'RATE_LIMIT_EXCEEDED';
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number, code?: string) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    if (code) this.code = code;
  }
}

export class InternalServerError extends Error {
  public statusCode: number = 500;
  public code: string = 'INTERNAL_SERVER_ERROR';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'InternalServerError';
    if (code) this.code = code;
  }
}

// Custom error interface
interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  retryAfter?: number;
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error response
  let statusCode = error.statusCode || 500;
  let errorCode = error.code || 'INTERNAL_SERVER_ERROR';
  let message = error.message || 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  }

  // Log error for debugging (exclude sensitive information)
  const logError = {
    name: error.name,
    message: error.message,
    statusCode,
    errorCode,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };

  if (statusCode >= 500) {
    logger.error('Server error:', logError);
  } else {
    logger.warn('Client error:', logError);
  }

  // Prepare error response
  const errorResponse: any = {
    error: message,
    code: errorCode,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };

  // Add retry after header for rate limit errors
  if (error.retryAfter) {
    res.set('Retry-After', error.retryAfter.toString());
    errorResponse.retryAfter = error.retryAfter;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    errorResponse.stack = error.stack;
  }

  // Add request ID if available
  const requestId = req.headers['x-request-id'];
  if (requestId) {
    errorResponse.requestId = requestId;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
};

/**
 * Async error wrapper to catch async errors in route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Database error handler
 */
export const handleDatabaseError = (error: any): CustomError => {
  logger.error('Database error:', error);

  // Handle different database error types
  if (error.code === '23505') { // Unique violation
    return new ConflictError('Resource already exists', 'DUPLICATE_ENTRY');
  }

  if (error.code === '23503') { // Foreign key violation
    return new ValidationError('Referenced resource does not exist', 'INVALID_REFERENCE');
  }

  if (error.code === '23502') { // Not null violation
    return new ValidationError('Required field is missing', 'MISSING_REQUIRED_FIELD');
  }

  if (error.code === '22001') { // String too long
    return new ValidationError('Input value too long', 'VALUE_TOO_LONG');
  }

  if (error.code === 'ECONNREFUSED') {
    return new InternalServerError('Database connection failed', 'DATABASE_UNAVAILABLE');
  }

  // Generic database error
  return new InternalServerError('Database operation failed', 'DATABASE_ERROR');
};

/**
 * Redis error handler
 */
export const handleRedisError = (error: any): CustomError => {
  logger.error('Redis error:', error);

  if (error.code === 'ECONNREFUSED') {
    return new InternalServerError('Cache service unavailable', 'CACHE_UNAVAILABLE');
  }

  return new InternalServerError('Cache operation failed', 'CACHE_ERROR');
};

/**
 * Kafka error handler
 */
export const handleKafkaError = (error: any): CustomError => {
  logger.error('Kafka error:', error);

  return new InternalServerError('Message queue operation failed', 'QUEUE_ERROR');
};

/**
 * External API error handler
 */
export const handleExternalApiError = (error: any, service: string): CustomError => {
  logger.error(`External API error (${service}):`, error);

  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return new InternalServerError(`${service} service unavailable`, 'EXTERNAL_SERVICE_UNAVAILABLE');
  }

  return new InternalServerError(`${service} operation failed`, 'EXTERNAL_SERVICE_ERROR');
};