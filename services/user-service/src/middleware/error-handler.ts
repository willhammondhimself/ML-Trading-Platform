import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError,
  RateLimitError,
  isOperationalError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { isProduction } from '../config/environment';

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  details?: any;
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });

  let errorResponse: ErrorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    statusCode: 500,
    timestamp: new Date().toISOString(),
    path: req.url
  };

  // Handle different error types
  if (error instanceof ValidationError) {
    errorResponse = {
      error: 'Validation Error',
      message: error.message,
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: req.url,
      details: error.validationErrors
    };
  } else if (error instanceof AuthenticationError) {
    errorResponse = {
      error: 'Authentication Error',
      message: error.message,
      statusCode: 401,
      timestamp: new Date().toISOString(),
      path: req.url
    };
  } else if (error instanceof AuthorizationError) {
    errorResponse = {
      error: 'Authorization Error',
      message: error.message,
      statusCode: 403,
      timestamp: new Date().toISOString(),
      path: req.url
    };
  } else if (error instanceof RateLimitError) {
    errorResponse = {
      error: 'Rate Limit Exceeded',
      message: error.message,
      statusCode: 429,
      timestamp: new Date().toISOString(),
      path: req.url
    };
    
    // Add retry-after header
    if (error.retryAfter) {
      res.set('Retry-After', error.retryAfter.toString());
    }
  } else if (error instanceof ZodError) {
    errorResponse = {
      error: 'Validation Error',
      message: 'Request validation failed',
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: req.url,
      details: error.errors
    };
  } else if (isOperationalError(error)) {
    // Handle known operational errors
    errorResponse = {
      error: error.constructor.name,
      message: error.message,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
      path: req.url,
      details: error.details
    };
  } else {
    // Handle unknown errors
    errorResponse = {
      error: 'Internal Server Error',
      message: isProduction() ? 'An unexpected error occurred' : error.message,
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: req.url
    };

    // In development, include stack trace
    if (!isProduction()) {
      errorResponse.details = { stack: error.stack };
    }
  }

  // Send error response
  res.status(errorResponse.statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  const errorResponse: ErrorResponse = {
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.url
  };

  res.status(404).json(errorResponse);
};