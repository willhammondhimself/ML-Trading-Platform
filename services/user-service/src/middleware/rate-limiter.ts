import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getRedisClient } from '../services/redis-service';
import { getEnvironment } from '../config/environment';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

// Rate limiter configurations
const rateLimitConfigs = {
  // Global rate limiting
  global: {
    keyGenerator: (req: Request) => req.ip,
    points: 1000, // Number of requests
    duration: 900, // Per 15 minutes
    blockDuration: 900, // Block for 15 minutes
  },
  
  // Authentication endpoints
  auth: {
    keyGenerator: (req: Request) => `auth:${req.ip}`,
    points: 10, // 10 attempts
    duration: 900, // Per 15 minutes
    blockDuration: 1800, // Block for 30 minutes
  },
  
  // Password reset
  passwordReset: {
    keyGenerator: (req: Request) => `pwd-reset:${req.ip}`,
    points: 3, // 3 attempts
    duration: 3600, // Per hour
    blockDuration: 3600, // Block for 1 hour
  },
  
  // Registration
  registration: {
    keyGenerator: (req: Request) => `register:${req.ip}`,
    points: 5, // 5 registrations
    duration: 3600, // Per hour
    blockDuration: 3600, // Block for 1 hour
  },
  
  // MFA setup
  mfaSetup: {
    keyGenerator: (req: Request) => {
      const user = (req as any).user;
      return user ? `mfa:${user.id}` : `mfa:${req.ip}`;
    },
    points: 5, // 5 attempts
    duration: 900, // Per 15 minutes
    blockDuration: 900, // Block for 15 minutes
  },
  
  // Profile updates
  profileUpdate: {
    keyGenerator: (req: Request) => {
      const user = (req as any).user;
      return user ? `profile:${user.id}` : `profile:${req.ip}`;
    },
    points: 20, // 20 updates
    duration: 3600, // Per hour
    blockDuration: 600, // Block for 10 minutes
  }
};

class RateLimiterService {
  private limiters: Map<string, RateLimiterRedis | RateLimiterMemory> = new Map();

  constructor() {
    this.initializeLimiters();
  }

  private async initializeLimiters() {
    try {
      const redisClient = await getRedisClient();
      
      // Create Redis-based rate limiters
      for (const [name, config] of Object.entries(rateLimitConfigs)) {
        const limiter = new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: `rl:${name}`,
          points: config.points,
          duration: config.duration,
          blockDuration: config.blockDuration,
          execEvenly: true, // Distribute requests evenly across duration
        });
        
        this.limiters.set(name, limiter);
      }
      
      logger.info('Rate limiters initialized with Redis');
    } catch (error) {
      logger.warn('Redis not available, using memory-based rate limiters', { error });
      
      // Fallback to memory-based rate limiters
      for (const [name, config] of Object.entries(rateLimitConfigs)) {
        const limiter = new RateLimiterMemory({
          keyPrefix: `rl:${name}`,
          points: config.points,
          duration: config.duration,
          blockDuration: config.blockDuration,
          execEvenly: true,
        });
        
        this.limiters.set(name, limiter);
      }
    }
  }

  async checkRateLimit(limiterName: string, req: Request): Promise<void> {
    const limiter = this.limiters.get(limiterName);
    if (!limiter) {
      logger.error(`Rate limiter ${limiterName} not found`);
      return;
    }

    const config = rateLimitConfigs[limiterName as keyof typeof rateLimitConfigs];
    if (!config) {
      logger.error(`Rate limiter config ${limiterName} not found`);
      return;
    }

    const key = config.keyGenerator(req);
    
    try {
      const result = await limiter.consume(key);
      
      // Add rate limit headers
      const response = req.res as Response;
      if (response) {
        response.set({
          'X-RateLimit-Limit': config.points.toString(),
          'X-RateLimit-Remaining': result.remainingPoints?.toString() || '0',
          'X-RateLimit-Reset': new Date(Date.now() + result.msBeforeNext).toISOString()
        });
      }
    } catch (rejectedResult: any) {
      const retryAfter = Math.round(rejectedResult.msBeforeNext / 1000);
      
      // Log rate limit exceeded
      logger.warn('Rate limit exceeded', {
        limiter: limiterName,
        key,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        retryAfter
      });
      
      throw new RateLimitError(
        `Too many requests. Try again in ${retryAfter} seconds.`,
        retryAfter
      );
    }
  }

  // Get rate limit info without consuming
  async getRateLimitInfo(limiterName: string, req: Request) {
    const limiter = this.limiters.get(limiterName);
    const config = rateLimitConfigs[limiterName as keyof typeof rateLimitConfigs];
    
    if (!limiter || !config) {
      return null;
    }

    const key = config.keyGenerator(req);
    
    try {
      const result = await limiter.get(key);
      
      return {
        limit: config.points,
        remaining: result?.remainingPoints || config.points,
        reset: result ? new Date(Date.now() + result.msBeforeNext) : null
      };
    } catch (error) {
      logger.error('Error getting rate limit info', { error, limiter: limiterName, key });
      return null;
    }
  }
}

// Create singleton instance
const rateLimiterService = new RateLimiterService();

// Middleware factory
const createRateLimitMiddleware = (limiterName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rateLimiterService.checkRateLimit(limiterName, req);
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Export specific middleware
export const rateLimitMiddleware = {
  global: createRateLimitMiddleware('global'),
  auth: createRateLimitMiddleware('auth'),
  passwordReset: createRateLimitMiddleware('passwordReset'),
  registration: createRateLimitMiddleware('registration'),
  mfaSetup: createRateLimitMiddleware('mfaSetup'),
  profileUpdate: createRateLimitMiddleware('profileUpdate')
};

// Export service for direct use
export { rateLimiterService };