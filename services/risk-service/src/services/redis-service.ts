/**
 * Redis Service for Risk Management
 * 
 * Handles caching, session storage, and real-time data management
 * with connection pooling, retry logic, and health monitoring.
 */

import { createClient, RedisClientType, RedisClusterType } from 'redis';
import { config } from '../config';
import { logger, logError } from '../utils/logger';
import { addShutdownHandler } from '../utils/graceful-shutdown';

class RedisService {
    private client: RedisClientType | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 5000; // 5 seconds
    
    constructor() {
        this.setupShutdownHandler();
    }
    
    async connect(): Promise<void> {
        try {
            logger.info('🔴 Connecting to Redis...');
            
            this.client = createClient({
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
            });
            
            // Setup event handlers
            this.client.on('error', (error) => {
                logger.error('❌ Redis error:', error);
                this.isConnected = false;
            });
            
            this.client.on('connect', () => {
                logger.info('🔴 Redis connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            });
            
            this.client.on('ready', () => {
                logger.info('✅ Redis ready for operations');
            });
            
            this.client.on('reconnecting', () => {
                logger.warn('🔄 Redis reconnecting...');
                this.reconnectAttempts++;
                this.isConnected = false;
            });
            
            this.client.on('end', () => {
                logger.warn('🔌 Redis connection ended');
                this.isConnected = false;
            });
            
            // Connect to Redis
            await this.client.connect();
            
            // Test connection
            await this.client.ping();
            logger.info('✅ Redis connection established successfully');
            
        } catch (error) {
            logger.error('❌ Redis connection failed:', error);
            throw error;
        }
    }
    
    async disconnect(): Promise<void> {
        if (this.client) {
            logger.info('🔌 Disconnecting from Redis...');
            try {
                await this.client.quit();
                this.client = null;
                this.isConnected = false;
                logger.info('✅ Redis disconnected successfully');
            } catch (error) {
                logger.error('❌ Error disconnecting from Redis:', error);
            }
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
            logger.error('❌ Redis health check failed:', error);
            return false;
        }
    }
    
    // Key management
    private getKey(key: string): string {
        return `${config.REDIS_KEY_PREFIX}${key}`;
    }
    
    // Basic operations
    async get(key: string): Promise<string | null> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.get(this.getKey(key));
        } catch (error) {
            logError(error as Error, { operation: 'redis_get', key });
            throw error;
        }
    }
    
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            if (ttlSeconds) {
                await this.client.setEx(this.getKey(key), ttlSeconds, value);
            } else {
                await this.client.set(this.getKey(key), value);
            }
        } catch (error) {
            logError(error as Error, { operation: 'redis_set', key, ttlSeconds });
            throw error;
        }
    }
    
    async del(key: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.del(this.getKey(key));
        } catch (error) {
            logError(error as Error, { operation: 'redis_del', key });
            throw error;
        }
    }
    
    async exists(key: string): Promise<boolean> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            const result = await this.client.exists(this.getKey(key));
            return result === 1;
        } catch (error) {
            logError(error as Error, { operation: 'redis_exists', key });
            throw error;
        }
    }
    
    async expire(key: string, ttlSeconds: number): Promise<boolean> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            const result = await this.client.expire(this.getKey(key), ttlSeconds);
            return result === 1;
        } catch (error) {
            logError(error as Error, { operation: 'redis_expire', key, ttlSeconds });
            throw error;
        }
    }
    
    // JSON operations
    async getJSON<T>(key: string): Promise<T | null> {
        try {
            const value = await this.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logError(error as Error, { operation: 'redis_get_json', key });
            throw error;
        }
    }
    
    async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        try {
            await this.set(key, JSON.stringify(value), ttlSeconds);
        } catch (error) {
            logError(error as Error, { operation: 'redis_set_json', key, ttlSeconds });
            throw error;
        }
    }
    
    // Hash operations
    async hget(key: string, field: string): Promise<string | null> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.hGet(this.getKey(key), field);
        } catch (error) {
            logError(error as Error, { operation: 'redis_hget', key, field });
            throw error;
        }
    }
    
    async hset(key: string, field: string, value: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.hSet(this.getKey(key), field, value);
        } catch (error) {
            logError(error as Error, { operation: 'redis_hset', key, field });
            throw error;
        }
    }
    
    async hgetall(key: string): Promise<Record<string, string>> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.hGetAll(this.getKey(key));
        } catch (error) {
            logError(error as Error, { operation: 'redis_hgetall', key });
            throw error;
        }
    }
    
    async hdel(key: string, field: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.hDel(this.getKey(key), field);
        } catch (error) {
            logError(error as Error, { operation: 'redis_hdel', key, field });
            throw error;
        }
    }
    
    // List operations
    async lpush(key: string, ...values: string[]): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.lPush(this.getKey(key), values);
        } catch (error) {
            logError(error as Error, { operation: 'redis_lpush', key, count: values.length });
            throw error;
        }
    }
    
    async rpush(key: string, ...values: string[]): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.rPush(this.getKey(key), values);
        } catch (error) {
            logError(error as Error, { operation: 'redis_rpush', key, count: values.length });
            throw error;
        }
    }
    
    async lpop(key: string): Promise<string | null> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.lPop(this.getKey(key));
        } catch (error) {
            logError(error as Error, { operation: 'redis_lpop', key });
            throw error;
        }
    }
    
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.lRange(this.getKey(key), start, stop);
        } catch (error) {
            logError(error as Error, { operation: 'redis_lrange', key, start, stop });
            throw error;
        }
    }
    
    async ltrim(key: string, start: number, stop: number): Promise<void> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            await this.client.lTrim(this.getKey(key), start, stop);
        } catch (error) {
            logError(error as Error, { operation: 'redis_ltrim', key, start, stop });
            throw error;
        }
    }
    
    // Set operations
    async sadd(key: string, ...members: string[]): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.sAdd(this.getKey(key), members);
        } catch (error) {
            logError(error as Error, { operation: 'redis_sadd', key, count: members.length });
            throw error;
        }
    }
    
    async smembers(key: string): Promise<string[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.sMembers(this.getKey(key));
        } catch (error) {
            logError(error as Error, { operation: 'redis_smembers', key });
            throw error;
        }
    }
    
    async srem(key: string, ...members: string[]): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.sRem(this.getKey(key), members);
        } catch (error) {
            logError(error as Error, { operation: 'redis_srem', key, count: members.length });
            throw error;
        }
    }
    
    // Sorted set operations
    async zadd(key: string, score: number, member: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.zAdd(this.getKey(key), { score, value: member });
        } catch (error) {
            logError(error as Error, { operation: 'redis_zadd', key, score, member });
            throw error;
        }
    }
    
    async zrange(key: string, start: number, stop: number): Promise<string[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.zRange(this.getKey(key), start, stop);
        } catch (error) {
            logError(error as Error, { operation: 'redis_zrange', key, start, stop });
            throw error;
        }
    }
    
    async zrem(key: string, member: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            return await this.client.zRem(this.getKey(key), member);
        } catch (error) {
            logError(error as Error, { operation: 'redis_zrem', key, member });
            throw error;
        }
    }
    
    // Advanced operations
    async multi(): Promise<any> {
        if (!this.client) throw new Error('Redis client not initialized');
        return this.client.multi();
    }
    
    async pipeline(commands: Array<[string, ...any[]]>): Promise<any[]> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const multi = this.client.multi();
            
            for (const [command, ...args] of commands) {
                // Map commands to prefixed keys where applicable
                const prefixedArgs = args.map(arg => 
                    typeof arg === 'string' && !arg.startsWith(config.REDIS_KEY_PREFIX) 
                        ? this.getKey(arg) 
                        : arg
                );
                (multi as any)[command](...prefixedArgs);
            }
            
            return await multi.exec();
        } catch (error) {
            logError(error as Error, { operation: 'redis_pipeline', commandCount: commands.length });
            throw error;
        }
    }
    
    // Risk-specific cache methods
    async cacheRiskMetrics(userId: string, metrics: any, ttlSeconds: number = 300): Promise<void> {
        await this.setJSON(`risk_metrics:${userId}`, metrics, ttlSeconds);
    }
    
    async getRiskMetrics(userId: string): Promise<any> {
        return await this.getJSON(`risk_metrics:${userId}`);
    }
    
    async cachePortfolioData(userId: string, data: any, ttlSeconds: number = 60): Promise<void> {
        await this.setJSON(`portfolio:${userId}`, data, ttlSeconds);
    }
    
    async getPortfolioData(userId: string): Promise<any> {
        return await this.getJSON(`portfolio:${userId}`);
    }
    
    async trackActiveAlert(alertId: string, ttlSeconds: number = 3600): Promise<void> {
        await this.set(`active_alert:${alertId}`, '1', ttlSeconds);
    }
    
    async isAlertActive(alertId: string): Promise<boolean> {
        return await this.exists(`active_alert:${alertId}`);
    }
    
    async removeActiveAlert(alertId: string): Promise<void> {
        await this.del(`active_alert:${alertId}`);
    }
    
    // Session management
    async storeSession(sessionId: string, sessionData: any, ttlSeconds: number = 86400): Promise<void> {
        await this.setJSON(`session:${sessionId}`, sessionData, ttlSeconds);
    }
    
    async getSession(sessionId: string): Promise<any> {
        return await this.getJSON(`session:${sessionId}`);
    }
    
    async deleteSession(sessionId: string): Promise<void> {
        await this.del(`session:${sessionId}`);
    }
    
    // Rate limiting
    async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const rateLimitKey = this.getKey(`rate_limit:${key}`);
            const multi = this.client.multi();
            
            multi.incr(rateLimitKey);
            multi.expire(rateLimitKey, windowSeconds);
            
            const results = await multi.exec();
            return results?.[0] as number || 0;
        } catch (error) {
            logError(error as Error, { operation: 'redis_rate_limit', key, windowSeconds });
            throw error;
        }
    }
    
    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.disconnect();
        });
    }
    
    // Connection status
    get connected(): boolean {
        return this.isConnected;
    }
    
    // Client instance (for advanced operations)
    get redisClient(): RedisClientType | null {
        return this.client;
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