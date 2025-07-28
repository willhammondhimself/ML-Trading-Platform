import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * Middleware to validate request data using Zod schemas
 */
export const validateRequest = (
  schema: ZodSchema,
  property: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate the specified property of the request
      const validatedData = schema.parse(req[property]);
      
      // Replace the original data with validated data
      req[property] = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: err.code === 'invalid_type' ? (err as any).received : undefined
        }));

        logger.warn('Request validation failed', {
          property,
          errors: validationErrors,
          requestData: req[property]
        });

        res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validationErrors
        });
        return;
      }

      logger.error('Unexpected validation error:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Middleware to validate multiple parts of the request
 */
export const validateMultiple = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: Array<{ property: string; field: string; message: string; code: string }> = [];

      // Validate each specified schema
      Object.entries(schemas).forEach(([property, schema]) => {
        if (schema) {
          try {
            req[property as keyof Request] = schema.parse(req[property as keyof Request]);
          } catch (error) {
            if (error instanceof ZodError) {
              error.errors.forEach(err => {
                errors.push({
                  property,
                  field: err.path.join('.'),
                  message: err.message,
                  code: err.code
                });
              });
            }
          }
        }
      });

      if (errors.length > 0) {
        logger.warn('Multi-part request validation failed', {
          errors,
          requestData: {
            body: req.body,
            query: req.query,
            params: req.params
          }
        });

        res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Unexpected multi-validation error:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Middleware to sanitize and validate common request parameters
 */
export const sanitizeCommonParams = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize pagination parameters
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string);
    req.query.limit = Math.min(Math.max(limit || 50, 1), 100).toString();
  }

  if (req.query.offset) {
    const offset = parseInt(req.query.offset as string);
    req.query.offset = Math.max(offset || 0, 0).toString();
  }

  // Uppercase symbol parameters
  if (req.query.symbol) {
    req.query.symbol = (req.query.symbol as string).toUpperCase();
  }

  if (req.params.symbol) {
    req.params.symbol = req.params.symbol.toUpperCase();
  }

  if (req.body.symbol) {
    req.body.symbol = req.body.symbol.toUpperCase();
  }

  // Sanitize date parameters
  ['startDate', 'endDate'].forEach(dateParam => {
    if (req.query[dateParam]) {
      const date = new Date(req.query[dateParam] as string);
      if (isNaN(date.getTime())) {
        res.status(400).json({
          error: 'Invalid date format',
          code: 'INVALID_DATE',
          field: dateParam,
          message: `${dateParam} must be a valid ISO date string`
        });
        return;
      }
      req.query[dateParam] = date.toISOString();
    }
  });

  next();
};

/**
 * Middleware to validate UUID parameters
 */
export const validateUuidParams = (paramNames: string[]) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return (req: Request, res: Response, next: NextFunction): void => {
    const invalidParams: string[] = [];

    paramNames.forEach(paramName => {
      const value = req.params[paramName];
      if (value && !uuidRegex.test(value)) {
        invalidParams.push(paramName);
      }
    });

    if (invalidParams.length > 0) {
      res.status(400).json({
        error: 'Invalid UUID format',
        code: 'INVALID_UUID',
        fields: invalidParams,
        message: `The following parameters must be valid UUIDs: ${invalidParams.join(', ')}`
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to validate price and quantity formats
 */
export const validateTradingParams = (req: Request, res: Response, next: NextFunction): void => {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate quantity
  if (req.body.quantity !== undefined) {
    const quantity = parseFloat(req.body.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({
        field: 'quantity',
        message: 'Quantity must be a positive number'
      });
    }
    if (quantity > 1000000) {
      errors.push({
        field: 'quantity',
        message: 'Quantity cannot exceed 1,000,000'
      });
    }
  }

  // Validate price
  if (req.body.price !== undefined) {
    const price = parseFloat(req.body.price);
    if (isNaN(price) || price <= 0) {
      errors.push({
        field: 'price',
        message: 'Price must be a positive number'
      });
    }
    if (price > 10000000) {
      errors.push({
        field: 'price',
        message: 'Price cannot exceed 10,000,000'
      });
    }
  }

  // Validate stop price
  if (req.body.stopPrice !== undefined) {
    const stopPrice = parseFloat(req.body.stopPrice);
    if (isNaN(stopPrice) || stopPrice <= 0) {
      errors.push({
        field: 'stopPrice',
        message: 'Stop price must be a positive number'
      });
    }
    if (stopPrice > 10000000) {
      errors.push({
        field: 'stopPrice',
        message: 'Stop price cannot exceed 10,000,000'
      });
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: 'Invalid trading parameters',
      code: 'INVALID_TRADING_PARAMS',
      details: errors
    });
    return;
  }

  next();
};