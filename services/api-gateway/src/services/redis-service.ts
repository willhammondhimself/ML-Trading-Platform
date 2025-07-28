/**
 * Redis Service for API Gateway
 * 
 * Handles caching, session storage, rate limiting, and service discovery
 * data with connection pooling, retry logic, and health monitoring.
 */

import { createClient, RedisClientType } from 'redis';
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
    
    // Rate limiting operations
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
    
    async getRateLimitInfo(key: string): Promise<{ count: number; ttl: number }> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const rateLimitKey = this.getKey(`rate_limit:${key}`);
            const multi = this.client.multi();
            
            multi.get(rateLimitKey);
            multi.ttl(rateLimitKey);
            
            const results = await multi.exec();
            const count = parseInt(results?.[0] as string || '0');
            const ttl = results?.[1] as number || 0;
            
            return { count, ttl };
        } catch (error) {
            logError(error as Error, { operation: 'redis_get_rate_limit_info', key });
            return { count: 0, ttl: 0 };
        }
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
    
    async extendSession(sessionId: string, ttlSeconds: number = 86400): Promise<boolean> {
        return await this.expire(`session:${sessionId}`, ttlSeconds);
    }
    
    // Cache operations with TTL
    async cacheResponse(key: string, data: any, ttlSeconds: number): Promise<void> {
        await this.setJSON(`cache:${key}`, {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds
        }, ttlSeconds);
    }
    
    async getCachedResponse(key: string): Promise<any> {
        const cached = await this.getJSON(`cache:${key}`);
        
        if (!cached) {
            return null;
        }
        
        // Check if still valid
        const age = (Date.now() - cached.timestamp) / 1000;
        if (age > cached.ttl) {
            await this.del(`cache:${key}`);
            return null;
        }
        
        return cached.data;
    }
    
    // Service discovery cache
    async cacheServiceHealth(serviceName: string, instanceId: string, healthData: any, ttlSeconds: number = 300): Promise<void> {
        await this.setJSON(`service_health:${serviceName}:${instanceId}`, healthData, ttlSeconds);
    }
    
    async getServiceHealth(serviceName: string, instanceId: string): Promise<any> {
        return await this.getJSON(`service_health:${serviceName}:${instanceId}`);
    }
    
    // API key validation cache
    async cacheAPIKeyValidation(apiKey: string, validationResult: any, ttlSeconds: number = 300): Promise<void> {
        const hashedKey = require('crypto').createHash('sha256').update(apiKey).digest('hex');
        await this.setJSON(`api_key:${hashedKey}`, validationResult, ttlSeconds);
    }
    
    async getAPIKeyValidation(apiKey: string): Promise<any> {
        const hashedKey = require('crypto').createHash('sha256').update(apiKey).digest('hex');
        return await this.getJSON(`api_key:${hashedKey}`);
    }
    
    // JWT blacklist
    async blacklistToken(tokenId: string, expirationTime: Date): Promise<void> {
        const ttlSeconds = Math.max(0, Math.floor((expirationTime.getTime() - Date.now()) / 1000));
        if (ttlSeconds > 0) {
            await this.set(`blacklist:${tokenId}`, '1', ttlSeconds);
        }
    }
    
    async isTokenBlacklisted(tokenId: string): Promise<boolean> {
        return await this.exists(`blacklist:${tokenId}`);
    }
    
    // Circuit breaker state
    async setCircuitBreakerState(serviceName: string, state: any, ttlSeconds: number = 300): Promise<void> {
        await this.setJSON(`circuit_breaker:${serviceName}`, state, ttlSeconds);
    }
    
    async getCircuitBreakerState(serviceName: string): Promise<any> {
        return await this.getJSON(`circuit_breaker:${serviceName}`);
    }
    
    // Load balancer counters
    async incrementLoadBalancerCounter(serviceName: string): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const counterKey = this.getKey(`lb_counter:${serviceName}`);
            return await this.client.incr(counterKey);
        } catch (error) {
            logError(error as Error, { operation: 'redis_increment_lb_counter', serviceName });
            return 0;
        }
    }
    
    async getLoadBalancerCounter(serviceName: string): Promise<number> {
        try {
            const value = await this.get(`lb_counter:${serviceName}`);
            return value ? parseInt(value) : 0;
        } catch (error) {
            logError(error as Error, { operation: 'redis_get_lb_counter', serviceName });
            return 0;
        }
    }
    
    // Request correlation and tracking
    async trackRequest(requestId: string, requestData: any, ttlSeconds: number = 3600): Promise<void> {
        await this.setJSON(`request:${requestId}`, {
            ...requestData,
            timestamp: Date.now()
        }, ttlSeconds);
    }
    
    async getRequestInfo(requestId: string): Promise<any> {
        return await this.getJSON(`request:${requestId}`);
    }
    
    // Metrics and monitoring
    async incrementMetric(metricName: string, value: number = 1): Promise<number> {
        try {
            if (!this.client) throw new Error('Redis client not initialized');
            
            const metricKey = this.getKey(`metric:${metricName}`);
            return await this.client.incrBy(metricKey, value);
        } catch (error) {
            logError(error as Error, { operation: 'redis_increment_metric', metricName, value });
            return 0;
        }
    }
    
    async getMetric(metricName: string): Promise<number> {
        try {
            const value = await this.get(`metric:${metricName}`);
            return value ? parseInt(value) : 0;
        } catch (error) {
            logError(error as Error, { operation: 'redis_get_metric', metricName });
            return 0;
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