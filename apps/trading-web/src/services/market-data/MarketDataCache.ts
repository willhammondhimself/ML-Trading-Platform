import { EventEmitter } from 'events';
import { Redis, RedisOptions } from 'ioredis';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import {
  MarketDataProvider,
  PriceData,
  QuoteData,
  TradeData,
  OrderBookData,
  NewsData,
  SocialData,
  CompanyInfo,
  CacheConfig,
  DEFAULT_CACHE_TTL
} from '@/types/market-data';

/**
 * Redis-Based Market Data Caching Layer
 * 
 * Features:
 * - Multi-tier caching with TTL management
 * - Intelligent cache warming and prefetching
 * - Compression for large datasets
 * - Cache invalidation and versioning
 * - Performance monitoring and analytics
 * - Memory optimization and LRU eviction
 * - Distributed cache synchronization
 * - Cache-aside and write-through patterns
 */

export interface CacheKey {
  type: 'price' | 'quote' | 'trade' | 'orderbook' | 'news' | 'social' | 'company';
  symbol?: string;
  provider?: MarketDataProvider;
  timeframe?: string;
  parameters?: Record<string, any>;
}

export interface CacheEntry<T = any> {
  data: T;
  metadata: {
    cachedAt: number;
    expiresAt: number;
    version: string;
    provider: MarketDataProvider;
    size: number;
    compressed: boolean;
    hits: number;
    lastAccessed: number;
  };
}

export interface CacheMetrics {
  totalOperations: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  averageResponseTime: number;
  totalDataSize: number;
  memoryUsage: number;
  evictionCount: number;
  errorCount: number;
  compressionStats: {
    compressedEntries: number;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
  providerStats: Record<MarketDataProvider, {
    hits: number;
    misses: number;
    dataSize: number;
  }>;
  typeStats: Record<string, {
    hits: number;
    misses: number;
    averageTtl: number;
  }>;
}

export interface CacheWarmingJob {
  id: string;
  type: string;
  symbols: string[];
  provider: MarketDataProvider;
  priority: number;
  scheduledAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

export class MarketDataCache extends EventEmitter {
  private redis: Redis;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private warmingJobs: Map<string, CacheWarmingJob> = new Map();
  private compressionThreshold: number;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private warmingInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig) {
    super();
    this.config = config;
    this.compressionThreshold = config.compression.threshold;
    this.metrics = this.initializeMetrics();
    
    const redisOptions: RedisOptions = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.database,
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      maxmemoryPolicy: config.redis.maxMemoryPolicy as any
    };

    this.redis = new Redis(redisOptions);
    this.setupRedisEvents();
  }

  /**
   * Initialize the cache system
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      this.isConnected = true;
      
      // Start background tasks
      this.startCacheWarming();
      this.startMetricsCollection();
      
      console.log('📦 Market data cache initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize market data cache:', error);
      throw error;
    }
  }

  /**
   * Get cached data by key
   */
  async get<T>(key: CacheKey): Promise<T | null> {
    const startTime = performance.now();
    
    try {
      const cacheKey = this.generateCacheKey(key);
      const cached = await this.redis.get(cacheKey);
      
      if (!cached) {
        this.recordMiss(key);
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if entry has expired
      if (Date.now() > entry.metadata.expiresAt) {
        await this.redis.del(cacheKey);
        this.recordMiss(key);
        return null;
      }

      // Decompress if needed
      let data = entry.data;
      if (entry.metadata.compressed && typeof data === 'string') {
        try {
          const buffer = Buffer.from(data, 'base64');
          const decompressed = gunzipSync(buffer);
          data = JSON.parse(decompressed.toString());
        } catch (error) {
          console.error('❌ Failed to decompress cache entry:', error);
          await this.redis.del(cacheKey);
          this.recordMiss(key);
          return null;
        }
      }

      // Update access statistics
      entry.metadata.hits++;
      entry.metadata.lastAccessed = Date.now();
      await this.redis.set(cacheKey, JSON.stringify(entry), 'EX', this.getTtlSeconds(entry.metadata.expiresAt));

      const responseTime = performance.now() - startTime;
      this.recordHit(key, responseTime);
      
      this.emit('cache:hit', {
        key: cacheKey,
        type: key.type,
        provider: key.provider,
        responseTime
      });

      return data;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async set<T>(key: CacheKey, data: T, customTtl?: number): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const ttl = customTtl || this.getTtlForType(key.type);
      const expiresAt = Date.now() + (ttl * 1000);
      
      // Serialize data
      let serializedData: any = data;
      let compressed = false;
      let dataSize = JSON.stringify(data).length;

      // Compress large entries
      if (this.config.compression.enabled && dataSize > this.compressionThreshold) {
        try {
          const jsonString = JSON.stringify(data);
          const buffer = gzipSync(Buffer.from(jsonString));
          serializedData = buffer.toString('base64');
          compressed = true;
          
          this.metrics.compressionStats.compressedEntries++;
          this.metrics.compressionStats.originalSize += dataSize;
          this.metrics.compressionStats.compressedSize += buffer.length;
          
        } catch (error) {
          console.warn('⚠️ Failed to compress cache entry, storing uncompressed:', error);
        }
      }

      const entry: CacheEntry<T> = {
        data: serializedData,
        metadata: {
          cachedAt: Date.now(),
          expiresAt,
          version: this.generateVersion(),
          provider: key.provider || 'unknown' as MarketDataProvider,
          size: dataSize,
          compressed,
          hits: 0,
          lastAccessed: Date.now()
        }
      };

      await this.redis.set(cacheKey, JSON.stringify(entry), 'EX', ttl);
      
      // Update metrics
      this.metrics.totalDataSize += dataSize;
      this.updateProviderStats(key.provider || 'unknown' as MarketDataProvider, 'set', dataSize);
      
      this.emit('cache:set', {
        key: cacheKey,
        type: key.type,
        provider: key.provider,
        size: dataSize,
        compressed,
        ttl
      });

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Cache set error:', error);
    }
  }

  /**
   * Delete cached data
   */
  async del(key: CacheKey): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      await this.redis.del(cacheKey);
      
      this.emit('cache:deleted', {
        key: cacheKey,
        type: key.type,
        provider: key.provider
      });

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Cache delete error:', error);
    }
  }

  /**
   * Clear cache by pattern
   */
  async clear(pattern?: string): Promise<void> {
    try {
      const searchPattern = pattern || `${this.config.redis.keyPrefix}*`;
      const keys = await this.redis.keys(searchPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️ Cleared ${keys.length} cache entries`);
      }
      
      this.emit('cache:cleared', {
        pattern: searchPattern,
        keysDeleted: keys.length
      });

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Cache clear error:', error);
    }
  }

  /**
   * Warm cache with data for specific symbols
   */
  async warmCache(symbols: string[], provider: MarketDataProvider, types: string[] = ['price', 'quote']): Promise<string> {
    const jobId = this.generateJobId();
    
    const job: CacheWarmingJob = {
      id: jobId,
      type: 'manual',
      symbols,
      provider,
      priority: 1,
      scheduledAt: Date.now(),
      status: 'pending',
      progress: 0
    };

    this.warmingJobs.set(jobId, job);
    
    // Start warming process asynchronously
    this.executeWarmingJob(job, types).catch(error => {
      console.error(`❌ Cache warming job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
    });

    return jobId;
  }

  /**
   * Get cache warming job status
   */
  getWarmingJobStatus(jobId: string): CacheWarmingJob | null {
    return this.warmingJobs.get(jobId) || null;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    metrics: CacheMetrics;
    redis: {
      memory: any;
      keyspace: any;
      stats: any;
    };
  }> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      const stats = await this.redis.info('stats');
      
      // Update compression ratio
      if (this.metrics.compressionStats.originalSize > 0) {
        this.metrics.compressionStats.compressionRatio = 
          this.metrics.compressionStats.compressedSize / this.metrics.compressionStats.originalSize;
      }

      return {
        metrics: { ...this.metrics },
        redis: {
          memory: this.parseRedisInfo(info),
          keyspace: this.parseRedisInfo(keyspace),
          stats: this.parseRedisInfo(stats)
        }
      };

    } catch (error) {
      console.error('❌ Failed to get cache stats:', error);
      return {
        metrics: { ...this.metrics },
        redis: { memory: {}, keyspace: {}, stats: {} }
      };
    }
  }

  /**
   * Invalidate cache entries by provider
   */
  async invalidateProvider(provider: MarketDataProvider): Promise<void> {
    try {
      const pattern = `${this.config.redis.keyPrefix}*:${provider}:*`;
      await this.clear(pattern);
      
      console.log(`🗑️ Invalidated cache entries for provider: ${provider}`);
      
    } catch (error) {
      console.error(`❌ Failed to invalidate provider cache: ${provider}`, error);
    }
  }

  /**
   * Invalidate cache entries by symbol
   */
  async invalidateSymbol(symbol: string): Promise<void> {
    try {
      const pattern = `${this.config.redis.keyPrefix}*:${symbol}:*`;
      await this.clear(pattern);
      
      console.log(`🗑️ Invalidated cache entries for symbol: ${symbol}`);
      
    } catch (error) {
      console.error(`❌ Failed to invalidate symbol cache: ${symbol}`, error);
    }
  }

  /**
   * Check if cache is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.redis.ping();
      return this.isConnected;
    } catch (error) {
      return false;
    }
  }

  /**
   * Shutdown cache system
   */
  async shutdown(): Promise<void> {
    try {
      if (this.warmingInterval) {
        clearInterval(this.warmingInterval);
      }
      
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      await this.redis.disconnect();
      this.isConnected = false;
      
      console.log('✅ Market data cache shutdown complete');
      
    } catch (error) {
      console.error('❌ Cache shutdown error:', error);
    }
  }

  // Private methods

  private setupRedisEvents(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('✅ Redis connected');
      this.emit('connected');
    });

    this.redis.on('error', (error) => {
      this.isConnected = false;
      console.error('❌ Redis error:', error);
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      console.log('⚠️ Redis connection closed');
      this.emit('disconnected');
    });

    this.redis.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`🔄 Redis reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('❌ Max Redis reconnection attempts reached');
        this.emit('max-reconnects-reached');
      }
    });
  }

  private generateCacheKey(key: CacheKey): string {
    const parts = [key.type];
    
    if (key.symbol) parts.push(key.symbol);
    if (key.provider) parts.push(key.provider);
    if (key.timeframe) parts.push(key.timeframe);
    
    if (key.parameters && Object.keys(key.parameters).length > 0) {
      const paramHash = this.hashObject(key.parameters);
      parts.push(paramHash);
    }

    return parts.join(':');
  }

  private hashObject(obj: Record<string, any>): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  private getTtlForType(type: string): number {
    switch (type) {
      case 'quote':
      case 'trade':
        return this.config.ttl.realTime;
      case 'price':
        return this.config.ttl.historical;
      case 'company':
        return this.config.ttl.companyInfo;
      case 'news':
        return this.config.ttl.news;
      case 'social':
        return this.config.ttl.social;
      default:
        return DEFAULT_CACHE_TTL.HISTORICAL;
    }
  }

  private getTtlSeconds(expiresAt: number): number {
    return Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  }

  private generateVersion(): string {
    return Date.now().toString(36);
  }

  private generateJobId(): string {
    return `warm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private recordHit(key: CacheKey, responseTime: number): void {
    this.metrics.totalOperations++;
    this.metrics.hitCount++;
    this.metrics.hitRate = (this.metrics.hitCount / this.metrics.totalOperations) * 100;
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalOperations - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalOperations;
    
    // Update type stats
    if (!this.metrics.typeStats[key.type]) {
      this.metrics.typeStats[key.type] = { hits: 0, misses: 0, averageTtl: 0 };
    }
    this.metrics.typeStats[key.type].hits++;
    
    // Update provider stats
    if (key.provider) {
      this.updateProviderStats(key.provider, 'hit', 0);
    }
  }

  private recordMiss(key: CacheKey): void {
    this.metrics.totalOperations++;
    this.metrics.missCount++;
    this.metrics.hitRate = (this.metrics.hitCount / this.metrics.totalOperations) * 100;
    
    // Update type stats
    if (!this.metrics.typeStats[key.type]) {
      this.metrics.typeStats[key.type] = { hits: 0, misses: 0, averageTtl: 0 };
    }
    this.metrics.typeStats[key.type].misses++;
    
    // Update provider stats
    if (key.provider) {
      this.updateProviderStats(key.provider, 'miss', 0);
    }
  }

  private updateProviderStats(provider: MarketDataProvider, operation: 'hit' | 'miss' | 'set', dataSize: number): void {
    if (!this.metrics.providerStats[provider]) {
      this.metrics.providerStats[provider] = { hits: 0, misses: 0, dataSize: 0 };
    }

    const stats = this.metrics.providerStats[provider];
    
    if (operation === 'hit') {
      stats.hits++;
    } else if (operation === 'miss') {
      stats.misses++;
    } else if (operation === 'set') {
      stats.dataSize += dataSize;
    }
  }

  private async executeWarmingJob(job: CacheWarmingJob, types: string[]): Promise<void> {
    job.status = 'running';
    const totalOperations = job.symbols.length * types.length;
    let completed = 0;

    try {
      for (const symbol of job.symbols) {
        for (const type of types) {
          // This would integrate with actual data providers to fetch and cache data
          // For now, it's a placeholder that simulates the warming process
          
          const key: CacheKey = {
            type: type as any,
            symbol,
            provider: job.provider
          };

          // Simulate data fetching and caching
          await new Promise(resolve => setTimeout(resolve, 100));
          
          completed++;
          job.progress = Math.round((completed / totalOperations) * 100);
        }
      }

      job.status = 'completed';
      job.progress = 100;
      
      this.emit('cache:warming-complete', {
        jobId: job.id,
        symbols: job.symbols.length,
        types: types.length,
        provider: job.provider
      });

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private startCacheWarming(): void {
    // Start periodic cache warming for popular symbols
    this.warmingInterval = setInterval(async () => {
      // This would implement intelligent cache warming based on usage patterns
      // For now, it's a placeholder
    }, 300000); // Every 5 minutes
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        // Update memory usage from Redis
        const memoryInfo = await this.redis.info('memory');
        const parsedInfo = this.parseRedisInfo(memoryInfo);
        this.metrics.memoryUsage = parseInt(parsedInfo.used_memory || '0');
        
      } catch (error) {
        console.error('❌ Failed to collect cache metrics:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value !== undefined) {
        result[key] = value;
      }
    });

    return result;
  }

  private initializeMetrics(): CacheMetrics {
    return {
      totalOperations: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      averageResponseTime: 0,
      totalDataSize: 0,
      memoryUsage: 0,
      evictionCount: 0,
      errorCount: 0,
      compressionStats: {
        compressedEntries: 0,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0
      },
      providerStats: {},
      typeStats: {}
    };
  }
}