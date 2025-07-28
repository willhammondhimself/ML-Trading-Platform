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
      database: 1 // Use database 1 for trading service
    });

    // Error handling
    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Trading Service Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Trading Service Redis client ready');
    });

    redisClient.on('end', () => {
      logger.warn('Trading Service Redis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Trading Service Redis client reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();

    // Test the connection
    await redisClient.ping();
    logger.info('Trading Service Redis connection established successfully');

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
    logger.info('Trading Service Redis connection closed');
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
 * Market Data Cache Service
 * Caches real-time market prices and related data
 */
export class MarketDataCache {
  private static readonly PRICE_KEY_PREFIX = 'price:';
  private static readonly ORDER_BOOK_KEY_PREFIX = 'orderbook:';
  private static readonly MARKET_STATUS_KEY_PREFIX = 'market_status:';
  private static readonly DEFAULT_TTL = 60; // 1 minute for market data

  /**
   * Cache current price for a symbol
   */
  static async setPrice(symbol: string, price: string, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.PRICE_KEY_PREFIX + symbol.toUpperCase();
      
      await client.setEx(key, ttl, JSON.stringify({
        price,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to cache price:', { symbol, error });
    }
  }

  /**
   * Get cached price for a symbol
   */
  static async getPrice(symbol: string): Promise<{ price: string; timestamp: number } | null> {
    try {
      const client = getRedisClient();
      const key = this.PRICE_KEY_PREFIX + symbol.toUpperCase();
      
      const value = await client.get(key);
      if (!value) return null;
      
      return JSON.parse(value);
    } catch (error) {
      logger.error('Failed to get cached price:', { symbol, error });
      return null;
    }
  }

  /**
   * Cache multiple prices at once
   */
  static async setPrices(
    prices: Array<{ symbol: string; price: string }>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const client = getRedisClient();
      const pipeline = client.multi();
      
      for (const { symbol, price } of prices) {
        const key = this.PRICE_KEY_PREFIX + symbol.toUpperCase();
        const value = JSON.stringify({ price, timestamp: Date.now() });
        pipeline.setEx(key, ttl, value);
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.error('Failed to cache multiple prices:', { error });
    }
  }

  /**
   * Get multiple cached prices
   */
  static async getPrices(symbols: string[]): Promise<{ [symbol: string]: { price: string; timestamp: number } | null }> {
    try {
      const client = getRedisClient();
      const keys = symbols.map(symbol => this.PRICE_KEY_PREFIX + symbol.toUpperCase());
      
      const values = await client.mGet(keys);
      const result: { [symbol: string]: { price: string; timestamp: number } | null } = {};
      
      symbols.forEach((symbol, index) => {
        const value = values[index];
        result[symbol.toUpperCase()] = value ? JSON.parse(value) : null;
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to get multiple cached prices:', { symbols, error });
      return symbols.reduce((acc, symbol) => ({ ...acc, [symbol]: null }), {});
    }
  }

  /**
   * Cache order book data
   */
  static async setOrderBook(symbol: string, orderBook: any, ttl: number = 30): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.ORDER_BOOK_KEY_PREFIX + symbol.toUpperCase();
      
      await client.setEx(key, ttl, JSON.stringify({
        ...orderBook,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to cache order book:', { symbol, error });
    }
  }

  /**
   * Get cached order book
   */
  static async getOrderBook(symbol: string): Promise<any | null> {
    try {
      const client = getRedisClient();
      const key = this.ORDER_BOOK_KEY_PREFIX + symbol.toUpperCase();
      
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Failed to get cached order book:', { symbol, error });
      return null;
    }
  }

  /**
   * Set market status (open/closed)
   */
  static async setMarketStatus(status: 'open' | 'closed' | 'pre_market' | 'after_hours'): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.MARKET_STATUS_KEY_PREFIX + 'global';
      
      await client.setEx(key, 300, JSON.stringify({ // 5 minute TTL
        status,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to cache market status:', { error });
    }
  }

  /**
   * Get market status
   */
  static async getMarketStatus(): Promise<{ status: string; timestamp: number } | null> {
    try {
      const client = getRedisClient();
      const key = this.MARKET_STATUS_KEY_PREFIX + 'global';
      
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Failed to get market status:', { error });
      return null;
    }
  }

  /**
   * Subscribe to price updates
   */
  static async subscribeToPrice(symbol: string, callback: (price: string, timestamp: number) => void): Promise<void> {
    try {
      const client = getRedisClient();
      const channel = `price_updates:${symbol.toUpperCase()}`;
      
      await client.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          callback(data.price, data.timestamp);
        } catch (error) {
          logger.error('Error parsing price update message:', { error });
        }
      });
    } catch (error) {
      logger.error('Failed to subscribe to price updates:', { symbol, error });
    }
  }

  /**
   * Publish price update
   */
  static async publishPriceUpdate(symbol: string, price: string): Promise<void> {
    try {
      const client = getRedisClient();
      const channel = `price_updates:${symbol.toUpperCase()}`;
      
      await client.publish(channel, JSON.stringify({
        price,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to publish price update:', { symbol, error });
    }
  }
}

/**
 * Order Processing Lock Service
 * Prevents race conditions in order processing
 */
export class OrderLockService {
  private static readonly LOCK_KEY_PREFIX = 'order_lock:';
  private static readonly DEFAULT_LOCK_TTL = 30; // 30 seconds

  /**
   * Acquire lock for order processing
   */
  static async acquireLock(orderId: string, processId: string, ttl: number = this.DEFAULT_LOCK_TTL): Promise<boolean> {
    try {
      const client = getRedisClient();
      const key = this.LOCK_KEY_PREFIX + orderId;
      
      const result = await client.set(key, processId, {
        NX: true,
        EX: ttl
      });
      
      return result === 'OK';
    } catch (error) {
      logger.error('Failed to acquire order lock:', { orderId, error });
      return false;
    }
  }

  /**
   * Release lock for order processing
   */
  static async releaseLock(orderId: string, processId: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const key = this.LOCK_KEY_PREFIX + orderId;
      
      // Lua script to ensure we only release our own lock
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await client.eval(luaScript, {
        keys: [key],
        arguments: [processId]
      });
      
      return result === 1;
    } catch (error) {
      logger.error('Failed to release order lock:', { orderId, error });
      return false;
    }
  }

  /**
   * Check if order is locked
   */
  static async isLocked(orderId: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const key = this.LOCK_KEY_PREFIX + orderId;
      
      const value = await client.get(key);
      return value !== null;
    } catch (error) {
      logger.error('Failed to check order lock:', { orderId, error });
      return false;
    }
  }
}

/**
 * User Session Cache Service
 * Caches user session data for quick access
 */
export class UserSessionCache {
  private static readonly SESSION_KEY_PREFIX = 'user_session:';
  private static readonly DEFAULT_TTL = 900; // 15 minutes

  /**
   * Cache user session data
   */
  static async setUserSession(
    userId: string, 
    sessionData: any, 
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.SESSION_KEY_PREFIX + userId;
      
      await client.setEx(key, ttl, JSON.stringify(sessionData));
    } catch (error) {
      logger.error('Failed to cache user session:', { userId, error });
    }
  }

  /**
   * Get cached user session
   */
  static async getUserSession(userId: string): Promise<any | null> {
    try {
      const client = getRedisClient();
      const key = this.SESSION_KEY_PREFIX + userId;
      
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Failed to get user session:', { userId, error });
      return null;
    }
  }

  /**
   * Remove user session from cache
   */
  static async removeUserSession(userId: string): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.SESSION_KEY_PREFIX + userId;
      
      await client.del(key);
    } catch (error) {
      logger.error('Failed to remove user session:', { userId, error });
    }
  }
}