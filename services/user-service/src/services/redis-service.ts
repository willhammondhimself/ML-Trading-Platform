import { createClient, RedisClientType } from 'redis';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';

let redisClient: RedisClientType;

/**
 * Initialize Redis connection
 */
export const initializeRedis = async (): Promise<RedisClientType> => {
  try {
    const env = getEnvironment();
    
    redisClient = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        keepAlive: true,
        reconnectStrategy: (retries) => {
          if (retries >= 10) {
            logger.error('Redis max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        }
      },
      database: 0
    });

    // Error handling
    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();

    // Test the connection
    await redisClient.ping();
    logger.info('Redis connection established successfully');

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
};

/**
 * Get Redis client instance
 */
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

/**
 * Close Redis connection
 */
export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

/**
 * Check Redis health
 */
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

/**
 * Cache service class for common operations
 */
export class CacheService {
  private static readonly DEFAULT_TTL = 3600; // 1 hour

  /**
   * Set a value in cache with optional TTL
   */
  static async set(key: string, value: any, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);
      
      if (ttl > 0) {
        await client.setEx(key, ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Cache set error:', { key, error });
      throw error;
    }
  }

  /**
   * Get a value from cache
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error:', { key, error });
      return null;
    }
  }

  /**
   * Delete a value from cache
   */
  static async del(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', { key, error });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error('Cache exists error:', { key, error });
      return false;
    }
  }

  /**
   * Set expiration on existing key
   */
  static async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.expire(key, ttl);
      return result;
    } catch (error) {
      logger.error('Cache expire error:', { key, ttl, error });
      return false;
    }
  }

  /**
   * Get multiple values
   */
  static async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const client = getRedisClient();
      const values = await client.mGet(keys);
      
      return values.map(value => value ? JSON.parse(value) as T : null);
    } catch (error) {
      logger.error('Cache mget error:', { keys, error });
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * Increment a counter
   */
  static async incr(key: string, amount: number = 1): Promise<number> {
    try {
      const client = getRedisClient();
      
      if (amount === 1) {
        return await client.incr(key);
      } else {
        return await client.incrBy(key, amount);
      }
    } catch (error) {
      logger.error('Cache incr error:', { key, amount, error });
      throw error;
    }
  }

  /**
   * Set if not exists
   */
  static async setnx(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        const result = await client.set(key, serializedValue, {
          NX: true,
          EX: ttl
        });
        return result === 'OK';
      } else {
        return await client.setNX(key, serializedValue);
      }
    } catch (error) {
      logger.error('Cache setnx error:', { key, error });
      return false;
    }
  }

  /**
   * Get and delete (atomic operation)
   */
  static async getdel<T = any>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.getDel(key);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache getdel error:', { key, error });
      return null;
    }
  }

  /**
   * Hash operations
   */
  static async hset(key: string, field: string, value: any): Promise<void> {
    try {
      const client = getRedisClient();
      await client.hSet(key, field, JSON.stringify(value));
    } catch (error) {
      logger.error('Cache hset error:', { key, field, error });
      throw error;
    }
  }

  static async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.hGet(key, field);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache hget error:', { key, field, error });
      return null;
    }
  }

  static async hdel(key: string, field: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.hDel(key, field);
      return result > 0;
    } catch (error) {
      logger.error('Cache hdel error:', { key, field, error });
      return false;
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  static async flush(): Promise<void> {
    try {
      const client = getRedisClient();
      await client.flushDb();
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Cache flush error:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{ keys: number; memory: string; hits: string; misses: string }> {
    try {
      const client = getRedisClient();
      const info = await client.info();
      
      const keyCount = await client.dbSize();
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      
      return {
        keys: keyCount,
        memory: memoryMatch?.[1] || 'unknown',
        hits: hitsMatch?.[1] || '0',
        misses: missesMatch?.[1] || '0'
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      throw error;
    }
  }
}