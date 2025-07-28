/**
 * Rate Limiter Service (Stub Implementation)
 * Token bucket rate limiting with Redis backend
 */

import { EventEmitter } from 'events';
import { wsLogger } from '@/utils/logger';
import type { RateLimitingConfig } from '@/config';
import type { RedisService } from './redis-service';

export interface RateLimitOptions extends RateLimitingConfig {
  redisService: RedisService;
}

export class RateLimitService extends EventEmitter {
  private isInitialized = false;

  constructor(private options: RateLimitOptions) {
    super();
    wsLogger.info('Rate limiter service initialized (stub)');
  }

  async initialize(): Promise<void> {
    wsLogger.info('Initializing rate limiter...');
    this.isInitialized = true;
    wsLogger.info('✅ Rate limiter initialized (stub)');
  }

  async isAllowed(clientId: string, tokens: number = 1): Promise<boolean> {
    return true; // Allow all requests in stub
  }

  async getRemainingTokens(clientId: string): Promise<number> {
    return this.options.burstSize || 200;
  }

  isHealthy(): boolean {
    return this.isInitialized;
  }
}