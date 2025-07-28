/**
 * Redis Service
 * Manages Redis connection and provides caching/pub-sub functionality
 */

import Redis, { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';
import { redisLogger, logError } from '@/utils/logger';
import type { RedisConfig } from '@/config';

export interface RedisServiceOptions extends RedisConfig {
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

export class RedisService extends EventEmitter {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;

  constructor(private options: RedisServiceOptions) {
    super();
    this.maxReconnectAttempts = options.maxRetryAttempts || 3;
    this.setupRedisClients();
  }

  /**
   * Setup Redis clients (main, subscriber, publisher)
   */
  private setupRedisClients(): void {
    const redisConfig: RedisOptions = {
      host: this.options.host,
      port: this.options.port,
      password: this.options.password,
      db: this.options.database,
      keyPrefix: this.options.keyPrefix,
      retryDelayOnFailover: this.options.retryDelayOnFailover || 100,
      maxRetriesPerRequest: this.options.maxRetriesPerRequest || 3,
      enableReadyCheck: this.options.enableReadyCheck !== false,
      lazyConnect: this.options.lazyConnect !== false,
      
      // Connection timeout and retry logic
      connectTimeout: 10000,
      lazyConnect: true,
      
      // Retry strategy
      retryDelayOnClusterDown: 300,
      enableOfflineQueue: false,
      
      // Keep alive
      keepAlive: 30000,
      
      // Reconnect on error
      reconnectOnError: (err) => {
        redisLogger.warn('Redis reconnect on error:', err.message);
        return true;
      }
    };

    // Main client for general operations
    this.client = new Redis(redisConfig);
    this.setupClientEventHandlers(this.client, 'main');

    // Subscriber client for pub/sub
    this.subscriber = new Redis({
      ...redisConfig,
      lazyConnect: true
    });
    this.setupClientEventHandlers(this.subscriber, 'subscriber');

    // Publisher client for pub/sub
    this.publisher = new Redis({
      ...redisConfig,
      lazyConnect: true
    });
    this.setupClientEventHandlers(this.publisher, 'publisher');
  }

  /**
   * Setup event handlers for Redis clients
   */
  private setupClientEventHandlers(client: Redis, clientType: string): void {
    client.on('connect', () => {
      redisLogger.info(`Redis ${clientType} client connected`);
      this.reconnectAttempts = 0;
      
      if (clientType === 'main') {
        this.isConnected = true;
        this.emit('connected');
      }
    });

    client.on('ready', () => {
      redisLogger.info(`Redis ${clientType} client ready`);
    });

    client.on('error', (error) => {
      logError(error, `redis-${clientType}`, { clientType });
      
      if (clientType === 'main') {
        this.isConnected = false;
        this.emit('error', error);
      }
    });

    client.on('close', () => {
      redisLogger.warn(`Redis ${clientType} client connection closed`);
      
      if (clientType === 'main') {
        this.isConnected = false;
        this.emit('disconnected');
      }
    });

    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      redisLogger.info(`Redis ${clientType} client reconnecting (attempt ${this.reconnectAttempts})`);
      
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        redisLogger.error(`Redis ${clientType} client max reconnect attempts exceeded`);
        this.emit('reconnect_failed');
      }
    });

    client.on('end', () => {
      redisLogger.info(`Redis ${clientType} client connection ended`);
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      redisLogger.info('Connecting to Redis...');
      
      await this.client.connect();
      await this.subscriber.connect();
      await this.publisher.connect();
      
      redisLogger.info('✅ Redis service connected successfully');
      
    } catch (error) {
      logError(error as Error, 'redis-connect');
      throw new Error(`Failed to connect to Redis: ${error}`);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      redisLogger.info('Disconnecting from Redis...');
      
      await Promise.all([
        this.client.disconnect(),
        this.subscriber.disconnect(),
        this.publisher.disconnect()
      ]);
      
      this.isConnected = false;
      redisLogger.info('✅ Redis service disconnected successfully');
      
    } catch (error) {
      logError(error as Error, 'redis-disconnect');
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Get Redis client for direct operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get subscriber client
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get publisher client
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  // === Cache Operations ===

  /**
   * Set a key-value pair with optional TTL
   */
  async set(key: string, value: string | number | Record<string, unknown>, ttl?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      redisLogger.debug(`Set key: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
    } catch (error) {
      logError(error as Error, 'redis-set', { key, ttl });
      throw error;
    }
  }

  /**
   * Get a value by key
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }
      
      redisLogger.debug(`Get key: ${key}`);
      return JSON.parse(value) as T;
      
    } catch (error) {
      logError(error as Error, 'redis-get', { key });
      throw error;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      redisLogger.debug(`Deleted key: ${key}`);
    } catch (error) {
      logError(error as Error, 'redis-del', { key });
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logError(error as Error, 'redis-exists', { key });
      throw error;
    }
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
      redisLogger.debug(`Set expiration for key: ${key} (${seconds}s)`);
    } catch (error) {
      logError(error as Error, 'redis-expire', { key, seconds });
      throw error;
    }
  }

  // === Pub/Sub Operations ===

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: Record<string, unknown> | string): Promise<void> {
    try {
      const serializedMessage = JSON.stringify(message);
      await this.publisher.publish(channel, serializedMessage);
      
      redisLogger.debug(`Published to channel: ${channel}`);
    } catch (error) {
      logError(error as Error, 'redis-publish', { channel });
      throw error;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, handler: (message: Record<string, unknown>) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            handler(parsedMessage);
            redisLogger.debug(`Message received on channel: ${channel}`);
          } catch (error) {
            logError(error as Error, 'redis-message-parse', { channel, message });
          }
        }
      });
      
      redisLogger.info(`Subscribed to channel: ${channel}`);
    } catch (error) {
      logError(error as Error, 'redis-subscribe', { channel });
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
      redisLogger.info(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      logError(error as Error, 'redis-unsubscribe', { channel });
      throw error;
    }
  }

  // === List Operations ===

  /**
   * Push to the left of a list
   */
  async lpush(key: string, value: string | Record<string, unknown>): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      await this.client.lpush(key, serializedValue);
      redisLogger.debug(`Pushed to list: ${key}`);
    } catch (error) {
      logError(error as Error, 'redis-lpush', { key });
      throw error;
    }
  }

  /**
   * Pop from the right of a list
   */
  async rpop<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.rpop(key);
      
      if (value === null) {
        return null;
      }
      
      redisLogger.debug(`Popped from list: ${key}`);
      return JSON.parse(value) as T;
      
    } catch (error) {
      logError(error as Error, 'redis-rpop', { key });
      throw error;
    }
  }

  /**
   * Get list length
   */
  async llen(key: string): Promise<number> {
    try {
      const length = await this.client.llen(key);
      return length;
    } catch (error) {
      logError(error as Error, 'redis-llen', { key });
      throw error;
    }
  }

  // === Health Check ===

  /**
   * Perform health check
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      logError(error as Error, 'redis-health-check');
      return {
        status: 'unhealthy',
        latency: -1
      };
    }
  }
}