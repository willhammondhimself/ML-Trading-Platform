/**
 * Redis Service for WebSocket Service
 * 
 * Handles connection state, subscriptions, pub/sub messaging,
 * and caching with connection pooling and health monitoring.
 */

import { createClient, RedisClientType, RedisClusterType } from 'redis';
import { config } from '../config';
import { logger, wsLogger, logError } from '../utils/logger';
import { ConnectionInfo, Subscription, WSMessage } from '../types';

class RedisService {
    private client: RedisClientType | RedisClusterType | null = null;
    private subscriber: RedisClientType | RedisClusterType | null = null;
    private publisher: RedisClientType | RedisClusterType | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 5000;
    private messageHandlers = new Map<string, (channel: string, message: string) => void>();
    
    constructor() {
        this.setupShutdownHandler();
    }
    
    async connect(): Promise<void> {
        try {
            logger.info('🔴 Connecting to Redis...');
            
            const clientConfig = {
                url: config.REDIS_URL,
                password: config.REDIS_PASSWORD,
                database: config.REDIS_DB,
                socket: {
                    connectTimeout: 10000,
                    lazyConnect: true,
                    reconnectStrategy: (retries: number) => {
                        if (retries >= this.maxReconnectAttempts) {
                            logger.error('❌ Redis max reconnection attempts exceeded');
                            return false;
                        }
                        const delay = Math.min(retries * 1000, 5000);
                        logger.warn(`⚠️ Redis reconnecting in ${delay}ms (attempt ${retries + 1}/${this.maxReconnectAttempts})`);
                        return delay;
                    }
                }
            };

            // Create main client
            this.client = createClient(clientConfig);
            
            // Create dedicated pub/sub clients
            this.subscriber = createClient(clientConfig);
            this.publisher = createClient(clientConfig);
            
            // Setup event handlers for main client
            this.setupEventHandlers(this.client as RedisClientType, 'main');
            this.setupEventHandlers(this.subscriber as RedisClientType, 'subscriber');
            this.setupEventHandlers(this.publisher as RedisClientType, 'publisher');
            
            // Connect all clients
            await Promise.all([
                this.client.connect(),
                this.subscriber.connect(),
                this.publisher.connect()
            ]);
            
            // Test connections
            await Promise.all([
                this.client.ping(),
                this.subscriber.ping(),
                this.publisher.ping()
            ]);
            
            this.isConnected = true;
            logger.info('✅ Redis connections established successfully');
            
            // Setup pub/sub message handling
            this.setupPubSubHandling();
            
        } catch (error) {
            logger.error('❌ Redis connection failed:', error);
            throw error;
        }
    }
    
    private setupEventHandlers(client: RedisClientType, clientType: string): void {
        client.on('error', (error) => {
            wsLogger.redis('connection_error', clientType, false, undefined, error.message);
            this.isConnected = false;
        });
        
        client.on('connect', () => {
            logger.info(`🔴 Redis ${clientType} client connected`);
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });
        
        client.on('ready', () => {
            logger.info(`✅ Redis ${clientType} client ready`);
        });
        
        client.on('reconnecting', () => {
            logger.warn(`🔄 Redis ${clientType} client reconnecting...`);
            this.reconnectAttempts++;
            this.isConnected = false;
        });
        
        client.on('end', () => {
            logger.warn(`🔌 Redis ${clientType} client connection ended`);
            this.isConnected = false;
        });
    }
    
    private setupPubSubHandling(): void {
        if (!this.subscriber) return;
        
        // Handle incoming pub/sub messages
        (this.subscriber as RedisClientType).on('message', (channel: string, message: string) => {
            const handler = this.messageHandlers.get(channel);
            if (handler) {
                try {
                    handler(channel, message);
                } catch (error) {
                    logError(error as Error, { 
                        operation: 'pubsub_message_handling',
                        channel 
                    });
                }
            }
        });
    }
    
    async disconnect(): Promise<void> {
        logger.info('🔌 Disconnecting from Redis...');
        
        try {
            const disconnectPromises = [];
            
            if (this.client) {
                disconnectPromises.push(this.client.quit());
            }
            
            if (this.subscriber) {
                disconnectPromises.push(this.subscriber.quit());
            }
            
            if (this.publisher) {
                disconnectPromises.push(this.publisher.quit());
            }
            
            await Promise.all(disconnectPromises);
            
            this.client = null;
            this.subscriber = null;
            this.publisher = null;
            this.isConnected = false;
            
            logger.info('✅ Redis disconnected successfully');
        } catch (error) {
            logger.error('❌ Error disconnecting from Redis:', error);
        }
    }
    
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.client || !this.isConnected) {
                return false;
            }
            
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            wsLogger.redis('health_check', 'ping', false, undefined, (error as Error).message);
            return false;
        }
    }
    
    // Key management
    private getKey(key: string): string {
        return `${config.REDIS_KEY_PREFIX}${key}`;
    }
    
    // Connection management
    async storeConnection(connectionInfo: ConnectionInfo): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`connection:${connectionInfo.id}`);
            const data = {
                id: connectionInfo.id,
                userId: connectionInfo.userId,
                ip: connectionInfo.ip,
                userAgent: connectionInfo.userAgent,
                connectedAt: connectionInfo.connectedAt.toISOString(),
                lastPing: connectionInfo.lastPing.toISOString(),
                subscriptions: Array.from(connectionInfo.subscriptions),
                channels: Array.from(connectionInfo.channels),
                messageCount: connectionInfo.messageCount,
                rateLimitTokens: connectionInfo.rateLimitTokens,
                rateLimitLastRefill: connectionInfo.rateLimitLastRefill.toISOString()
            };
            
            await this.client.setEx(key, 3600, JSON.stringify(data)); // 1 hour TTL
            
            // Add to connection index
            if (connectionInfo.userId) {
                await this.client.sAdd(
                    this.getKey(`user_connections:${connectionInfo.userId}`),
                    connectionInfo.id
                );
            }
            
            const latency = Date.now() - startTime;
            wsLogger.redis('store_connection', key, true, latency);
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('store_connection', `connection:${connectionInfo.id}`, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    async getConnection(connectionId: string): Promise<ConnectionInfo | null> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`connection:${connectionId}`);
            const data = await this.client.get(key);
            
            const latency = Date.now() - startTime;
            
            if (!data) {
                wsLogger.redis('get_connection', key, true, latency);
                return null;
            }
            
            const parsed = JSON.parse(data);
            const connectionInfo: ConnectionInfo = {
                id: parsed.id,
                userId: parsed.userId,
                ip: parsed.ip,
                userAgent: parsed.userAgent,
                connectedAt: new Date(parsed.connectedAt),
                lastPing: new Date(parsed.lastPing),
                subscriptions: new Set(parsed.subscriptions),
                channels: new Set(parsed.channels),
                messageCount: parsed.messageCount,
                rateLimitTokens: parsed.rateLimitTokens,
                rateLimitLastRefill: new Date(parsed.rateLimitLastRefill)
            };
            
            wsLogger.redis('get_connection', key, true, latency);
            return connectionInfo;
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('get_connection', `connection:${connectionId}`, false, latency, (error as Error).message);
            return null;
        }
    }
    
    async removeConnection(connectionId: string): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            // Get connection info first to clean up user index
            const connectionInfo = await this.getConnection(connectionId);
            
            const key = this.getKey(`connection:${connectionId}`);
            await this.client.del(key);
            
            // Remove from user connections index
            if (connectionInfo?.userId) {
                await this.client.sRem(
                    this.getKey(`user_connections:${connectionInfo.userId}`),
                    connectionId
                );
            }
            
            const latency = Date.now() - startTime;
            wsLogger.redis('remove_connection', key, true, latency);
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('remove_connection', `connection:${connectionId}`, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    async getUserConnections(userId: string): Promise<string[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`user_connections:${userId}`);
            return await this.client.sMembers(key);
            
        } catch (error) {
            wsLogger.redis('get_user_connections', `user_connections:${userId}`, false, undefined, (error as Error).message);
            return [];
        }
    }
    
    // Subscription management
    async storeSubscription(subscription: Subscription): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`subscription:${subscription.id}`);
            const data = {
                ...subscription,
                createdAt: subscription.createdAt.toISOString(),
                lastActivity: subscription.lastActivity.toISOString()
            };
            
            await this.client.setEx(key, 3600, JSON.stringify(data)); // 1 hour TTL
            
            // Add to channel subscribers index
            await this.client.sAdd(
                this.getKey(`channel_subscribers:${subscription.channel}`),
                subscription.id
            );
            
            // Add to user subscriptions index
            if (subscription.userId) {
                await this.client.sAdd(
                    this.getKey(`user_subscriptions:${subscription.userId}`),
                    subscription.id
                );
            }
            
            const latency = Date.now() - startTime;
            wsLogger.redis('store_subscription', key, true, latency);
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('store_subscription', `subscription:${subscription.id}`, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    async removeSubscription(subscriptionId: string): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            // Get subscription info first
            const key = this.getKey(`subscription:${subscriptionId}`);
            const data = await this.client.get(key);
            
            if (data) {
                const subscription = JSON.parse(data);
                
                // Remove from channel subscribers index
                await this.client.sRem(
                    this.getKey(`channel_subscribers:${subscription.channel}`),
                    subscriptionId
                );
                
                // Remove from user subscriptions index
                if (subscription.userId) {
                    await this.client.sRem(
                        this.getKey(`user_subscriptions:${subscription.userId}`),
                        subscriptionId
                    );
                }
            }
            
            // Remove subscription
            await this.client.del(key);
            
            const latency = Date.now() - startTime;
            wsLogger.redis('remove_subscription', key, true, latency);
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('remove_subscription', `subscription:${subscriptionId}`, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    async getChannelSubscribers(channel: string): Promise<string[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`channel_subscribers:${channel}`);
            return await this.client.sMembers(key);
            
        } catch (error) {
            wsLogger.redis('get_channel_subscribers', `channel_subscribers:${channel}`, false, undefined, (error as Error).message);
            return [];
        }
    }
    
    // Pub/Sub operations
    async subscribe(channel: string, handler: (channel: string, message: string) => void): Promise<void> {
        try {
            if (!this.subscriber) throw new Error('Redis subscriber not initialized');
            
            this.messageHandlers.set(channel, handler);
            await (this.subscriber as RedisClientType).subscribe(channel);
            
            logger.debug('Subscribed to Redis channel', { channel });
            
        } catch (error) {
            wsLogger.redis('subscribe', channel, false, undefined, (error as Error).message);
            throw error;
        }
    }
    
    async unsubscribe(channel: string): Promise<void> {
        try {
            if (!this.subscriber) throw new Error('Redis subscriber not initialized');
            
            await (this.subscriber as RedisClientType).unsubscribe(channel);
            this.messageHandlers.delete(channel);
            
            logger.debug('Unsubscribed from Redis channel', { channel });
            
        } catch (error) {
            wsLogger.redis('unsubscribe', channel, false, undefined, (error as Error).message);
            throw error;
        }
    }
    
    async publish(channel: string, message: WSMessage): Promise<number> {
        const startTime = Date.now();
        
        try {
            if (!this.publisher) throw new Error('Redis publisher not initialized');
            
            const messageStr = JSON.stringify(message);
            const recipients = await (this.publisher as RedisClientType).publish(channel, messageStr);
            
            const latency = Date.now() - startTime;
            wsLogger.redis('publish', channel, true, latency);
            
            return recipients;
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('publish', channel, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    // Caching operations
    async setCache(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const cacheKey = this.getKey(`cache:${key}`);
            await this.client.setEx(cacheKey, ttlSeconds, JSON.stringify(value));
            
            const latency = Date.now() - startTime;
            wsLogger.redis('set_cache', cacheKey, true, latency);
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('set_cache', `cache:${key}`, false, latency, (error as Error).message);
            throw error;
        }
    }
    
    async getCache<T>(key: string): Promise<T | null> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const cacheKey = this.getKey(`cache:${key}`);
            const data = await this.client.get(cacheKey);
            
            const latency = Date.now() - startTime;
            wsLogger.redis('get_cache', cacheKey, true, latency);
            
            return data ? JSON.parse(data) : null;
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('get_cache', `cache:${key}`, false, latency, (error as Error).message);
            return null;
        }
    }
    
    // Rate limiting operations
    async checkRateLimit(identifier: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const startTime = Date.now();
        
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const key = this.getKey(`rate_limit:${identifier}`);
            const multi = this.client.multi();
            
            multi.incr(key);
            multi.expire(key, windowSeconds);
            
            const results = await multi.exec();
            const current = results?.[0] as number || 0;
            
            const allowed = current <= limit;
            const remaining = Math.max(0, limit - current);
            const resetTime = Date.now() + (windowSeconds * 1000);
            
            const latency = Date.now() - startTime;
            wsLogger.redis('check_rate_limit', key, true, latency);
            
            return { allowed, remaining, resetTime };
            
        } catch (error) {
            const latency = Date.now() - startTime;
            wsLogger.redis('check_rate_limit', `rate_limit:${identifier}`, false, latency, (error as Error).message);
            
            // Default to allow on error to avoid blocking
            return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
        }
    }
    
    // Metrics operations
    async incrementMetric(metric: string, value: number = 1, tags?: Record<string, string>): Promise<void> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const timestamp = Math.floor(Date.now() / 1000);
            const minute = Math.floor(timestamp / 60) * 60;
            
            let key = `metric:${metric}:${minute}`;
            if (tags && Object.keys(tags).length > 0) {
                const tagStr = Object.entries(tags)
                    .map(([k, v]) => `${k}=${v}`)
                    .sort()
                    .join(',');
                key += `:${tagStr}`;
            }
            
            await this.client.incrBy(this.getKey(key), value);
            await this.client.expire(this.getKey(key), 3600); // 1 hour TTL
            
        } catch (error) {
            wsLogger.redis('increment_metric', metric, false, undefined, (error as Error).message);
        }
    }
    
    async getMetrics(metric: string, minutes: number = 60): Promise<Record<string, number>> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const now = Math.floor(Date.now() / 1000);
            const endMinute = Math.floor(now / 60) * 60;
            const startMinute = endMinute - (minutes * 60);
            
            const keys = [];
            for (let minute = startMinute; minute <= endMinute; minute += 60) {
                keys.push(this.getKey(`metric:${metric}:${minute}`));
            }
            
            const values = await this.client.mGet(keys);
            const result: Record<string, number> = {};
            
            for (let i = 0; i < keys.length; i++) {
                const minute = startMinute + (i * 60);
                result[minute.toString()] = parseInt(values[i] || '0');
            }
            
            return result;
            
        } catch (error) {
            wsLogger.redis('get_metrics', metric, false, undefined, (error as Error).message);
            return {};
        }
    }
    
    private setupShutdownHandler(): void {
        process.on('SIGTERM', () => this.disconnect());
        process.on('SIGINT', () => this.disconnect());
    }
    
    get connected(): boolean {
        return this.isConnected;
    }
    
    get clients() {
        return {
            main: this.client,
            subscriber: this.subscriber,
            publisher: this.publisher
        };
    }
}

// Global Redis service instance
export const redisService = new RedisService();

// Initialize Redis connection
export const initializeRedis = async (): Promise<void> => {
    await redisService.connect();
};

// Close Redis connection
export const closeRedis = async (): Promise<void> => {
    await redisService.disconnect();
};