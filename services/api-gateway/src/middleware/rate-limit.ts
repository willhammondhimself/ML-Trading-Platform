/**
 * Rate Limiting Middleware for API Gateway
 * 
 * Tier-based rate limiting with Redis backend, sliding window,
 * and burst protection for different user tiers.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { redisService } from '../services/redis-service';
import { database } from '../database/connection';
import { logger, gatewayLogger, logSecurityEvent } from '../utils/logger';

interface RateLimitConfig {
    windowMs: number;
    max: number;
    burstLimit?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (req: Request) => string;
    onLimitReached?: (req: Request, res: Response) => void;
}

interface RateLimitInfo {
    limit: number;
    current: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}

class RateLimitingService {
    private readonly defaultConfig = config.RATE_LIMITING;

    /**
     * Get rate limit configuration for a specific tier
     */
    private getTierConfig(tier: string, window: 'hour' | 'day' = 'hour'): RateLimitConfig {
        const tierConfig = this.defaultConfig.TIERS[tier as keyof typeof this.defaultConfig.TIERS] || 
                          this.defaultConfig.TIERS.FREE;

        const windowMs = window === 'hour' ? 3600000 : 86400000; // 1 hour or 24 hours
        const max = window === 'hour' ? tierConfig.REQUESTS_PER_HOUR : tierConfig.REQUESTS_PER_DAY;

        return {
            windowMs,
            max,
            burstLimit: tierConfig.BURST_LIMIT,
            skipSuccessfulRequests: this.defaultConfig.SKIP_SUCCESSFUL_REQUESTS,
            skipFailedRequests: this.defaultConfig.SKIP_FAILED_REQUESTS
        };
    }

    /**
     * Generate rate limit key based on auth context
     */
    private getRateLimitKey(req: Request, window: string): string {
        const baseKey = req.auth?.rateLimitKey || `ip:${req.ip}`;
        return `rate_limit:${window}:${baseKey}`;
    }

    /**
     * Check and increment rate limit counter
     */
    async checkRateLimit(
        req: Request, 
        rateLimitConfig: RateLimitConfig, 
        window: string
    ): Promise<RateLimitInfo> {
        const key = this.getRateLimitKey(req, window);
        const windowSeconds = Math.floor(rateLimitConfig.windowMs / 1000);
        
        try {
            // Get current count and increment
            const currentCount = await redisService.incrementRateLimit(key, windowSeconds);
            
            // Get TTL for reset time calculation
            const rateLimitInfo = await redisService.getRateLimitInfo(key.replace('rate_limit:', ''));
            const resetTime = Date.now() + (rateLimitInfo.ttl * 1000);
            
            const info: RateLimitInfo = {
                limit: rateLimitConfig.max,
                current: currentCount,
                remaining: Math.max(0, rateLimitConfig.max - currentCount),
                resetTime,
                retryAfter: rateLimitInfo.ttl
            };

            // Log rate limit event if approaching limit
            if (currentCount >= rateLimitConfig.max * 0.8) {
                gatewayLogger.rateLimit(
                    req.auth?.rateLimitKey || req.ip || 'unknown',
                    rateLimitConfig.max,
                    info.remaining,
                    resetTime,
                    req.requestId
                );
            }

            return info;

        } catch (error) {
            logger.error('Rate limit check failed:', error);
            
            // Return permissive info on error to avoid blocking
            return {
                limit: rateLimitConfig.max,
                current: 0,
                remaining: rateLimitConfig.max,
                resetTime: Date.now() + rateLimitConfig.windowMs
            };
        }
    }

    /**
     * Check burst limit (short-term rate limiting)
     */
    async checkBurstLimit(req: Request, burstLimit: number): Promise<RateLimitInfo | null> {
        if (!burstLimit) return null;

        const burstConfig: RateLimitConfig = {
            windowMs: 60000, // 1 minute window
            max: burstLimit
        };

        return await this.checkRateLimit(req, burstConfig, 'burst');
    }

    /**
     * Log rate limit violation to database
     */
    private async logRateLimitViolation(
        req: Request, 
        rateLimitInfo: RateLimitInfo, 
        window: string
    ): Promise<void> {
        try {
            await database.query(`
                INSERT INTO gateway.request_logs (
                    request_id, method, path, status_code, duration_ms,
                    user_id, ip_address, user_agent, error_message,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            `, [
                req.requestId || 'unknown',
                req.method,
                req.path,
                429,
                0,
                req.auth?.userId || null,
                req.ip || null,
                req.headers['user-agent'] || null,
                `Rate limit exceeded: ${rateLimitInfo.current}/${rateLimitInfo.limit} requests in ${window} window`
            ]);
        } catch (error) {
            logger.error('Failed to log rate limit violation:', error);
        }
    }

    /**
     * Create rate limiting middleware
     */
    createRateLimitMiddleware(options: {
        window?: 'hour' | 'day';
        enableBurstProtection?: boolean;
        customConfig?: Partial<RateLimitConfig>;
    } = {}) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const startTime = Date.now();
            const requestId = req.requestId || 'unknown';

            try {
                // Skip if rate limiting is disabled
                if (!this.defaultConfig.ENABLED) {
                    return next();
                }

                // Get tier from auth context
                const tier = req.auth?.tier || 'FREE';
                const window = options.window || 'hour';

                // Get rate limit configuration
                const rateLimitConfig = {
                    ...this.getTierConfig(tier, window),
                    ...options.customConfig
                };

                // Check main rate limit
                const rateLimitInfo = await this.checkRateLimit(req, rateLimitConfig, window);

                // Check burst limit if enabled
                let burstLimitInfo: RateLimitInfo | null = null;
                if (options.enableBurstProtection && rateLimitConfig.burstLimit) {
                    burstLimitInfo = await this.checkBurstLimit(req, rateLimitConfig.burstLimit);
                }

                // Determine if request should be blocked
                const mainLimitExceeded = rateLimitInfo.current > rateLimitInfo.limit;
                const burstLimitExceeded = burstLimitInfo && burstLimitInfo.current > burstLimitInfo.limit;

                // Set rate limit headers
                res.set({
                    'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
                    'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
                    'X-RateLimit-Reset': Math.ceil(rateLimitInfo.resetTime / 1000).toString(),
                    'X-RateLimit-Window': rateLimitConfig.windowMs.toString()
                });

                if (rateLimitConfig.burstLimit) {
                    res.set({
                        'X-RateLimit-Burst-Limit': rateLimitConfig.burstLimit.toString(),
                        'X-RateLimit-Burst-Remaining': burstLimitInfo ? 
                            burstLimitInfo.remaining.toString() : rateLimitConfig.burstLimit.toString()
                    });
                }

                // Block request if limits exceeded
                if (mainLimitExceeded || burstLimitExceeded) {
                    const blockedInfo = burstLimitExceeded ? burstLimitInfo! : rateLimitInfo;
                    const limitType = burstLimitExceeded ? 'burst' : window;

                    // Set retry-after header
                    if (blockedInfo.retryAfter) {
                        res.set('Retry-After', blockedInfo.retryAfter.toString());
                    }

                    // Log security event for rate limit violation
                    logSecurityEvent('rate_limit_exceeded', 'medium', {
                        userId: req.auth?.userId,
                        tier,
                        limitType,
                        current: blockedInfo.current,
                        limit: blockedInfo.limit,
                        path: req.path,
                        method: req.method,
                        ip: req.ip,
                        userAgent: req.headers['user-agent']
                    }, requestId);

                    // Log to database
                    await this.logRateLimitViolation(req, blockedInfo, limitType);

                    // Log to application logs
                    gatewayLogger.rateLimit(
                        req.auth?.rateLimitKey || req.ip || 'unknown',
                        blockedInfo.limit,
                        0, // remaining is 0 since limit exceeded
                        blockedInfo.resetTime,
                        requestId
                    );

                    const duration = Date.now() - startTime;
                    logger.debug('Rate limit middleware blocked request', {
                        duration_ms: duration,
                        tier,
                        limitType,
                        current: blockedInfo.current,
                        limit: blockedInfo.limit,
                        requestId
                    });

                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: `Too many requests. Limit: ${blockedInfo.limit} requests per ${limitType}`,
                        retryAfter: blockedInfo.retryAfter,
                        resetTime: blockedInfo.resetTime
                    });
                }

                const duration = Date.now() - startTime;
                logger.debug('Rate limit middleware passed', {
                    duration_ms: duration,
                    tier,
                    current: rateLimitInfo.current,
                    limit: rateLimitInfo.limit,
                    remaining: rateLimitInfo.remaining,
                    requestId
                });

                next();

            } catch (error) {
                const duration = Date.now() - startTime;
                logger.error('Rate limiting middleware error:', error);

                logSecurityEvent('rate_limit_error', 'high', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    duration_ms: duration,
                    path: req.path,
                    method: req.method
                }, requestId);

                // On error, allow request to continue to avoid blocking
                next();
            }
        };
    }

    /**
     * Get current rate limit status for a request
     */
    async getRateLimitStatus(req: Request): Promise<{
        hourly: RateLimitInfo;
        daily: RateLimitInfo;
        burst?: RateLimitInfo;
    }> {
        const tier = req.auth?.tier || 'FREE';
        
        const hourlyConfig = this.getTierConfig(tier, 'hour');
        const dailyConfig = this.getTierConfig(tier, 'day');

        const [hourly, daily, burst] = await Promise.all([
            this.checkRateLimit(req, hourlyConfig, 'hour'),
            this.checkRateLimit(req, dailyConfig, 'day'),
            hourlyConfig.burstLimit ? 
                this.checkBurstLimit(req, hourlyConfig.burstLimit) : 
                Promise.resolve(null)
        ]);

        const result: any = { hourly, daily };
        if (burst) result.burst = burst;
        
        return result;
    }
}

const rateLimitingService = new RateLimitingService();

// Main rate limiting middleware
export const rateLimit = rateLimitingService.createRateLimitMiddleware();

// Hourly rate limiting
export const hourlyRateLimit = rateLimitingService.createRateLimitMiddleware({
    window: 'hour',
    enableBurstProtection: true
});

// Daily rate limiting
export const dailyRateLimit = rateLimitingService.createRateLimitMiddleware({
    window: 'day',
    enableBurstProtection: false
});

// Strict rate limiting for sensitive endpoints
export const strictRateLimit = rateLimitingService.createRateLimitMiddleware({
    window: 'hour',
    enableBurstProtection: true,
    customConfig: {
        max: 100, // Override with stricter limit
        burstLimit: 10
    }
});

// Custom rate limiting
export const customRateLimit = (options: {
    window?: 'hour' | 'day';
    enableBurstProtection?: boolean;
    customConfig?: Partial<RateLimitConfig>;
}) => rateLimitingService.createRateLimitMiddleware(options);

// Rate limit status endpoint helper
export const getRateLimitStatus = async (req: Request) => {
    return await rateLimitingService.getRateLimitStatus(req);
};