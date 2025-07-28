import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  
  // Database configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis configuration
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  
  // Kafka configuration
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),
  KAFKA_CLIENT_ID: z.string().default('trading-service'),
  KAFKA_GROUP_ID: z.string().default('trading-service-group'),
  
  // External service URLs
  USER_SERVICE_URL: z.string().default('http://localhost:3003'),
  MARKET_DATA_SERVICE_URL: z.string().default('http://localhost:3002'),
  RISK_SERVICE_URL: z.string().default('http://localhost:3004'),
  
  // JWT configuration (for validating tokens from User Service)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  
  // Security configuration
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // Rate limiting configuration
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000'), // Higher limit for trading
  
  // Trading configuration
  MAX_ORDER_QUANTITY: z.string().default('1000000'), // Maximum order quantity
  MAX_POSITION_SIZE: z.string().default('10000000'), // Maximum position size
  ORDER_PROCESSING_INTERVAL_MS: z.string().default('100'), // Order processing frequency
  POSITION_UPDATE_INTERVAL_MS: z.string().default('1000'), // Position update frequency
  
  // Risk limits
  DEFAULT_DAILY_LOSS_LIMIT: z.string().default('50000'), // Daily loss limit in USD
  DEFAULT_POSITION_LIMIT: z.string().default('1000000'), // Position limit in USD
  
  // Monitoring configuration
  SENTRY_DSN: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
  PROMETHEUS_ENABLED: z.string().default('true'),
});

export type Environment = z.infer<typeof envSchema>;

let validatedEnv: Environment;

export const validateEnvironment = (): Environment => {
  try {
    validatedEnv = envSchema.parse(process.env);
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      throw new Error(
        `Environment validation failed:\n${errorMessages.join('\n')}`
      );
    }
    throw error;
  }
};

export const getEnvironment = (): Environment => {
  if (!validatedEnv) {
    throw new Error('Environment not validated. Call validateEnvironment() first.');
  }
  return validatedEnv;
};

// Helper functions for type-safe environment access
export const isDevelopment = (): boolean => getEnvironment().NODE_ENV === 'development';
export const isProduction = (): boolean => getEnvironment().NODE_ENV === 'production';
export const isTest = (): boolean => getEnvironment().NODE_ENV === 'test';