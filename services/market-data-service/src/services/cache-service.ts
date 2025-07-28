/**
 * Market Data Cache Service
 * Redis-based caching with intelligent TTL and compression
 */

import Redis from 'ioredis';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { EventEmitter } from 'events';

import { 
  IDataCache, 
  ICacheStats, 
  CacheKey,
  CacheConfig
} from '../types';
import { 
  generateCacheKey,
  generateCachePattern,
  CacheTTL
} from '../utils/cache-key';
import { cacheLogger, logError, createPerformanceTimer } from '../utils/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class CacheService extends EventEmitter implements IDataCache {
  private redis: Redis;
  private config: CacheConfig;
  private stats: ICacheStats;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig, redisConfig: any) {
    super();

    this.config = config;
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      memoryUsage: 0,
      keyCount: 0,
      evictions: 0
    };

    // Initialize Redis client
    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.database,
      keyPrefix: config.keyPrefix || 'cache:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      enableReadyCheck: true,
      maxMemoryPolicy: 'allkeys-lru'
    });

    this.setupRedisEventHandlers();
    this.startPeriodicCleanup();
  }

  // === Public Interface ===

  async get<T>(key: CacheKey): Promise<T | null> {
    const timer = createPerformanceTimer('cache-get');
    const cacheKey = generateCacheKey(key);

    try {
      const cachedData = await this.redis.get(cacheKey);
      
      if (cachedData === null) {
        this.stats.misses++;
        this.updateHitRate();
        
        cacheLogger.debug(`Cache miss: ${cacheKey}`);
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      // Decompress if needed
      const data = await this.deserializeValue<T>(cachedData, key);
      
      cacheLogger.debug(`Cache hit: ${cacheKey}`, {
        compressed: this.shouldCompress(cachedData),
        dataType: key.dataType
      });

      return data;

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'get',
        key: cacheKey 
      });
      return null;
    } finally {
      timer.end({ operation: 'get', key: cacheKey });
    }
  }

  async set<T>(key: CacheKey, value: T, ttl?: number): Promise<void> {
    const timer = createPerformanceTimer('cache-set');
    const cacheKey = generateCacheKey(key);

    try {
      // Serialize and potentially compress the value
      const serializedValue = await this.serializeValue(value, key);
      
      // Determine TTL
      const effectiveTTL = ttl || this.getTTLForKey(key);
      
      // Store in Redis
      if (effectiveTTL > 0) {
        await this.redis.setex(cacheKey, effectiveTTL, serializedValue);
      } else {
        await this.redis.set(cacheKey, serializedValue);
      }

      cacheLogger.debug(`Cache set: ${cacheKey}`, {
        ttl: effectiveTTL,
        compressed: await this.shouldCompressValue(value),
        dataType: key.dataType,
        size: serializedValue.length
      });

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'set',
        key: cacheKey,
        ttl 
      });
      throw error;
    } finally {
      timer.end({ operation: 'set', key: cacheKey });
    }
  }

  async del(key: CacheKey): Promise<void> {
    const timer = createPerformanceTimer('cache-del');
    const cacheKey = generateCacheKey(key);

    try {
      const deleted = await this.redis.del(cacheKey);
      
      if (deleted > 0) {
        cacheLogger.debug(`Cache deleted: ${cacheKey}`);
      }

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'del',
        key: cacheKey 
      });
      throw error;
    } finally {
      timer.end({ operation: 'del', key: cacheKey });
    }
  }

  async invalidate(pattern: string): Promise<void> {
    const timer = createPerformanceTimer('cache-invalidate');

    try {
      // Get all keys matching the pattern
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        // Delete all matching keys in batches
        const batchSize = 1000;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await this.redis.del(...batch);
        }

        cacheLogger.info(`Cache invalidated: ${keys.length} keys`, { pattern });
      }

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'invalidate',
        pattern 
      });
      throw error;
    } finally {
      timer.end({ operation: 'invalidate', pattern });
    }
  }

  getStats(): ICacheStats {
    return { ...this.stats };
  }

  // === Cache-specific Methods ===

  /**
   * Get multiple cache entries at once
   */
  async mget<T>(keys: CacheKey[]): Promise<(T | null)[]> {
    const timer = createPerformanceTimer('cache-mget');
    const cacheKeys = keys.map(generateCacheKey);

    try {
      const results = await this.redis.mget(...cacheKeys);
      
      const deserializedResults = await Promise.all(
        results.map(async (result, index) => {
          if (result === null) {
            this.stats.misses++;
            return null;
          }
          
          this.stats.hits++;
          return await this.deserializeValue<T>(result, keys[index]);
        })
      );

      this.updateHitRate();
      
      cacheLogger.debug(`Cache mget: ${cacheKeys.length} keys`, {
        hits: deserializedResults.filter(r => r !== null).length,
        misses: deserializedResults.filter(r => r === null).length
      });

      return deserializedResults;

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'mget',
        keyCount: keys.length 
      });
      return keys.map(() => null);
    } finally {
      timer.end({ operation: 'mget', keyCount: keys.length });
    }
  }

  /**
   * Set multiple cache entries at once
   */
  async mset<T>(entries: Array<{ key: CacheKey; value: T; ttl?: number }>): Promise<void> {
    const timer = createPerformanceTimer('cache-mset');

    try {
      // Process entries in parallel
      await Promise.all(
        entries.map(async ({ key, value, ttl }) => {
          await this.set(key, value, ttl);
        })
      );

      cacheLogger.debug(`Cache mset: ${entries.length} entries`);

    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'mset',
        entryCount: entries.length 
      });
      throw error;
    } finally {
      timer.end({ operation: 'mset', entryCount: entries.length });
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: CacheKey): Promise<boolean> {
    const cacheKey = generateCacheKey(key);
    
    try {
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'exists',
        key: cacheKey 
      });
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: CacheKey): Promise<number> {
    const cacheKey = generateCacheKey(key);
    
    try {
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'ttl',
        key: cacheKey 
      });
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  async extend(key: CacheKey, additionalSeconds: number): Promise<void> {
    const cacheKey = generateCacheKey(key);
    
    try {
      const currentTTL = await this.redis.ttl(cacheKey);
      if (currentTTL > 0) {
        await this.redis.expire(cacheKey, currentTTL + additionalSeconds);
      }
    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'extend',
        key: cacheKey,
        additionalSeconds 
      });
      throw error;
    }
  }

  /**
   * Flush all cache data
   */
  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
      this.resetStats();
      cacheLogger.info('Cache flushed');
    } catch (error) {
      logError(error as Error, 'cache-service', { operation: 'flush' });
      throw error;
    }
  }

  /**
   * Get cache memory info
   */
  async getMemoryInfo(): Promise<any> {
    try {
      const info = await this.redis.memory('usage');
      return {
        used: info,
        maxMemory: this.config.maxMemoryUsage,
        usagePercentage: (info / this.config.maxMemoryUsage) * 100
      };
    } catch (error) {
      logError(error as Error, 'cache-service', { operation: 'getMemoryInfo' });
      return null;
    }
  }

  // === Private Methods ===

  private async serializeValue<T>(value: T, key: CacheKey): Promise<string> {
    try {
      const jsonString = JSON.stringify(value);
      
      // Compress if value is large enough and compression is enabled
      if (await this.shouldCompressValue(value)) {
        const compressed = await gzipAsync(Buffer.from(jsonString, 'utf8'));
        return `gzip:${compressed.toString('base64')}`;
      }
      
      return jsonString;
    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'serialize',
        dataType: key.dataType 
      });
      throw error;
    }
  }

  private async deserializeValue<T>(serializedValue: string, key: CacheKey): Promise<T> {
    try {
      // Check if value is compressed
      if (serializedValue.startsWith('gzip:')) {
        const compressedData = Buffer.from(serializedValue.slice(5), 'base64');
        const decompressed = await gunzipAsync(compressedData);
        return JSON.parse(decompressed.toString('utf8'));
      }
      
      return JSON.parse(serializedValue);
    } catch (error) {
      logError(error as Error, 'cache-service', { 
        operation: 'deserialize',
        dataType: key.dataType 
      });
      throw error;
    }
  }

  private async shouldCompressValue<T>(value: T): Promise<boolean> {
    if (!this.config.compressionEnabled) {
      return false;
    }
    
    const jsonString = JSON.stringify(value);
    return jsonString.length > this.config.compressionThreshold;
  }

  private shouldCompress(serializedValue: string): boolean {
    return serializedValue.startsWith('gzip:');
  }

  private getTTLForKey(key: CacheKey): number {
    switch (key.dataType) {
      case 'quote':
        return this.config.realtimeTTL;
      case 'trade':
        return CacheTTL.TRADE;
      case 'orderbook':
        return CacheTTL.ORDER_BOOK;
      case 'ohlcv':
        if (key.period) {
          if (key.period.includes('m')) return CacheTTL.OHLCV_MINUTE;
          if (key.period.includes('h')) return CacheTTL.OHLCV_HOUR;
          if (key.period.includes('d')) return CacheTTL.OHLCV_DAY;
        }
        return this.config.historicalTTL;
      case 'news':
        return this.config.newsTTL;
      case 'social':
        return this.config.socialTTL || CacheTTL.SOCIAL;
      default:
        return this.config.defaultTTL;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      memoryUsage: 0,
      keyCount: 0,
      evictions: 0
    };
  }

  private setupRedisEventHandlers(): void {
    this.redis.on('connect', () => {
      cacheLogger.info('Redis cache connected');
      this.emit('connected');
    });

    this.redis.on('ready', () => {
      cacheLogger.info('Redis cache ready');
      this.emit('ready');
    });

    this.redis.on('error', (error) => {
      logError(error, 'cache-service', { event: 'redis_error' });
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      cacheLogger.warn('Redis cache connection closed');
      this.emit('disconnected');
    });

    this.redis.on('reconnecting', () => {
      cacheLogger.info('Redis cache reconnecting');
      this.emit('reconnecting');
    });
  }

  private startPeriodicCleanup(): void {
    if (!this.config.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logError(error as Error, 'cache-service', { operation: 'cleanup' });
      }
    }, this.config.cleanupInterval);

    cacheLogger.info('Periodic cache cleanup started', {
      interval: this.config.cleanupInterval
    });
  }

  private async performCleanup(): Promise<void> {
    const timer = createPerformanceTimer('cache-cleanup');

    try {
      // Update stats
      const info = await this.redis.info('memory');
      const keyspaceInfo = await this.redis.info('keyspace');
      
      // Parse memory usage
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      if (usedMemoryMatch) {
        this.stats.memoryUsage = parseInt(usedMemoryMatch[1]);
      }

      // Parse key count
      const keyCountMatch = keyspaceInfo.match(/keys=(\d+)/);
      if (keyCountMatch) {
        this.stats.keyCount = parseInt(keyCountMatch[1]);
      }

      // Check memory usage and trigger cleanup if needed
      const memoryInfo = await this.getMemoryInfo();
      if (memoryInfo && memoryInfo.usagePercentage > 80) {
        cacheLogger.warn('High cache memory usage detected', {
          usagePercentage: memoryInfo.usagePercentage,
          usedMemory: memoryInfo.used,
          maxMemory: memoryInfo.maxMemory
        });
        
        // Force garbage collection of expired keys
        await this.redis.eval('return redis.call("SCAN", 0, "COUNT", 1000)', 0);
      }

    } catch (error) {
      logError(error as Error, 'cache-service', { operation: 'performCleanup' });
    } finally {
      timer.end();
    }
  }

  // === Lifecycle Methods ===

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    await this.redis.quit();
    cacheLogger.info('Cache service disconnected');
  }

  isConnected(): boolean {
    return this.redis.status === 'ready';
  }
}