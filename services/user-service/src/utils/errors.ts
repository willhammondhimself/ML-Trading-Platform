import { ZodError, ZodIssue } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly validationErrors?: ZodIssue[];

  constructor(message: string = 'Validation failed', validationErrors?: ZodIssue[]) {
    super(message, 400, validationErrors);
    this.validationErrors = validationErrors;
  }

  static fromZodError(error: ZodError): ValidationError {
    const message = 'Validation failed';
    return new ValidationError(message, error.errors);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429);
    this.retryAfter = retryAfter;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', originalError?: Error) {
    super(message, 500, originalError);
  }
}

export class ExternalServiceError extends AppError {
  public readonly service?: string;

  constructor(message: string = 'External service error', service?: string) {
    super(message, 502);
    this.service = service;
  }
}

// Error type guards
export const isOperationalError = (error: Error): error is AppError => {
  return error instanceof AppError && error.isOperational;
};

export const isValidationError = (error: Error): error is ValidationError => {
  return error instanceof ValidationError;
};

export const isAuthenticationError = (error: Error): error is AuthenticationError => {
  return error instanceof AuthenticationError;
};

export const isAuthorizationError = (error: Error): error is AuthorizationError => {
  return error instanceof AuthorizationError;
};

export const isRateLimitError = (error: Error): error is RateLimitError => {
  return error instanceof RateLimitError;
};