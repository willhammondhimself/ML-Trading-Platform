import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3003'),
  
  // Database configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis configuration
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  
  // Kafka configuration
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),
  KAFKA_CLIENT_ID: z.string().default('user-service'),
  KAFKA_GROUP_ID: z.string().default('user-service-group'),
  
  // JWT configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Security configuration
  BCRYPT_ROUNDS: z.string().default('12'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // Rate limiting configuration
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  
  // Email service configuration (for password reset, verification)
  EMAIL_SERVICE_URL: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  
  // MFA configuration
  MFA_ISSUER_NAME: z.string().default('ML Trading Platform'),
  
  // Monitoring configuration
  SENTRY_DSN: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
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