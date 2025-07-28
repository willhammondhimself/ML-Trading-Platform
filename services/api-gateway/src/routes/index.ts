/**
 * Main Routes for API Gateway
 * 
 * Defines all API routes with proper middleware chain:
 * authentication → rate limiting → service proxying
 */

import { Router as ExpressRouter, Request, Response } from 'express';
import { config } from '../config';
import { database } from '../database/connection';
import { redisService } from '../services/redis-service';
import { serviceDiscovery } from '../services/service-discovery';
import { 
    requireAuth, 
    optionalAuth, 
    requireTier,
    requirePermission,
    hasPermission 
} from '../middleware/auth';
import { 
    rateLimit, 
    hourlyRateLimit, 
    strictRateLimit,
    getRateLimitStatus 
} from '../middleware/rate-limit';
import {
    userServiceProxy,
    tradingServiceProxy,
    marketDataServiceProxy,
    mlAnalyticsServiceProxy,
    riskServiceProxy,
    mlPipelineServiceProxy,
    notificationServiceProxy,
    reportingServiceProxy,
    altDataServiceProxy,
    getProxyMetrics
} from '../middleware/proxy';
import { logger, gatewayLogger, logHealthCheck } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

// Health check endpoint (no auth required)
router.get('/health', async (req: Request, res: Response) => {
    const healthChecks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        checks: {
            database: false,
            redis: false,
            services: {} as Record<string, any>
        }
    };

    try {
        // Check database
        healthChecks.checks.database = await database.healthCheck();
        logHealthCheck('database', healthChecks.checks.database ? 'healthy' : 'unhealthy', {
            connected: database.connected,
            poolInfo: database.poolInfo
        }, req.requestId);

        // Check Redis
        healthChecks.checks.redis = await redisService.healthCheck();
        logHealthCheck('redis', healthChecks.checks.redis ? 'healthy' : 'unhealthy', {
            connected: redisService.connected
        }, req.requestId);

        // Check downstream services
        const services = serviceDiscovery.getAllServices();
        for (const [serviceName, serviceInfo] of Object.entries(services)) {
            healthChecks.checks.services[serviceName] = {
                healthy: serviceInfo.healthyCount > 0,
                healthyInstances: serviceInfo.healthyCount,
                totalInstances: serviceInfo.totalCount,
                circuitBreakerState: serviceInfo.circuitBreaker?.state || 'CLOSED'
            };
        }

        // Determine overall status
        const allHealthy = healthChecks.checks.database && 
                          healthChecks.checks.redis &&
                          Object.values(healthChecks.checks.services).every((service: any) => service.healthy);

        healthChecks.status = allHealthy ? 'healthy' : 'degraded';

        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json(healthChecks);

    } catch (error) {
        logger.error('Health check failed:', error);
        
        healthChecks.status = 'unhealthy';
        res.status(503).json({
            ...healthChecks,
            error: 'Health check failed'
        });
    }
});

// Metrics endpoint (requires auth)
router.get('/metrics', requireAuth, async (req: Request, res: Response) => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            gateway: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            services: serviceDiscovery.getAllServices(),
            proxy: getProxyMetrics(),
            database: {
                connected: database.connected,
                pool: database.poolInfo
            },
            redis: {
                connected: redisService.connected
            }
        };

        res.json(metrics);
    } catch (error) {
        logger.error('Failed to gather metrics:', error);
        res.status(500).json({
            error: 'Failed to gather metrics',
            code: 'METRICS_ERROR'
        });
    }
});

// Rate limit status endpoint
router.get('/rate-limit-status', requireAuth, async (req: Request, res: Response) => {
    try {
        const status = await getRateLimitStatus(req);
        res.json(status);
    } catch (error) {
        logger.error('Failed to get rate limit status:', error);
        res.status(500).json({
            error: 'Failed to get rate limit status',
            code: 'RATE_LIMIT_STATUS_ERROR'
        });
    }
});

// User authentication and profile routes
router.use('/api/v1/auth', rateLimit, userServiceProxy);
router.use('/api/v1/users', requireAuth, rateLimit, userServiceProxy);

// Trading routes (requires authentication and basic tier)
router.use('/api/v1/trading/orders', requireAuth, requireTier('BASIC'), rateLimit, tradingServiceProxy);
router.use('/api/v1/trading/portfolio', requireAuth, rateLimit, tradingServiceProxy);
router.use('/api/v1/trading/positions', requireAuth, rateLimit, tradingServiceProxy);
router.use('/api/v1/trading/history', requireAuth, hourlyRateLimit, tradingServiceProxy);

// Market data routes (optional auth for public data)
router.use('/api/v1/market-data/public', optionalAuth, rateLimit, marketDataServiceProxy);
router.use('/api/v1/market-data/real-time', requireAuth, requireTier('PREMIUM'), rateLimit, marketDataServiceProxy);
router.use('/api/v1/market-data/historical', requireAuth, hourlyRateLimit, marketDataServiceProxy);

// ML Analytics routes (requires premium tier)
router.use('/api/v1/ml-analytics/predictions', requireAuth, requireTier('PREMIUM'), rateLimit, mlAnalyticsServiceProxy);
router.use('/api/v1/ml-analytics/signals', requireAuth, requireTier('PREMIUM'), rateLimit, mlAnalyticsServiceProxy);
router.use('/api/v1/ml-analytics/backtesting', requireAuth, requireTier('PREMIUM'), hourlyRateLimit, mlAnalyticsServiceProxy);

// Risk management routes (requires authentication)
router.use('/api/v1/risk/monitoring', requireAuth, rateLimit, riskServiceProxy);
router.use('/api/v1/risk/limits', requireAuth, requirePermission('risk:manage'), rateLimit, riskServiceProxy);
router.use('/api/v1/risk/compliance', requireAuth, requirePermission('compliance:view'), rateLimit, riskServiceProxy);
router.use('/api/v1/risk/alerts', requireAuth, rateLimit, riskServiceProxy);

// ML Pipeline routes (requires admin permissions)
router.use('/api/v1/ml-pipeline/models', requireAuth, requirePermission('ml:models'), rateLimit, mlPipelineServiceProxy);
router.use('/api/v1/ml-pipeline/training', requireAuth, requirePermission('ml:train'), hourlyRateLimit, mlPipelineServiceProxy);
router.use('/api/v1/ml-pipeline/inference', requireAuth, requireTier('PREMIUM'), rateLimit, mlPipelineServiceProxy);

// Notification routes (requires authentication)
router.use('/api/v1/notifications', requireAuth, rateLimit, notificationServiceProxy);

// Reporting routes (requires authentication and appropriate permissions)
router.use('/api/v1/reports/personal', requireAuth, hourlyRateLimit, reportingServiceProxy);
router.use('/api/v1/reports/admin', requireAuth, requirePermission('reports:admin'), strictRateLimit, reportingServiceProxy);

// Alternative data routes (requires premium tier)
router.use('/api/v1/alt-data/sentiment', requireAuth, requireTier('PREMIUM'), rateLimit, altDataServiceProxy);
router.use('/api/v1/alt-data/news', requireAuth, requireTier('BASIC'), rateLimit, altDataServiceProxy);
router.use('/api/v1/alt-data/social', requireAuth, requireTier('PREMIUM'), rateLimit, altDataServiceProxy);

// WebSocket upgrade endpoint (will be handled by WebSocket service)
router.get('/ws', (req: Request, res: Response) => {
    res.status(426).json({
        error: 'Upgrade Required',
        code: 'UPGRADE_REQUIRED',
        message: 'WebSocket connection required. Use ws:// or wss:// protocol.'
    });
});

// Admin routes (requires admin permissions)
router.use('/api/v1/admin', requireAuth, requirePermission('admin'), strictRateLimit);

// Admin: Service management
router.get('/api/v1/admin/services', requireAuth, requirePermission('admin'), (req: Request, res: Response) => {
    try {
        const services = serviceDiscovery.getAllServices();
        res.json({
            services,
            summary: {
                total: Object.keys(services).length,
                healthy: Object.values(services).filter((service: any) => service.healthyCount > 0).length,
                unhealthy: Object.values(services).filter((service: any) => service.healthyCount === 0).length
            }
        });
    } catch (error) {
        logger.error('Failed to get services info:', error);
        res.status(500).json({
            error: 'Failed to get services information',
            code: 'SERVICES_INFO_ERROR'
        });
    }
});

// Admin: Rate limiting configuration
router.get('/api/v1/admin/rate-limits/:identifier?', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
    try {
        const { identifier } = req.params;
        
        if (identifier) {
            // Get specific rate limit info
            const info = await redisService.getRateLimitInfo(identifier);
            res.json({ identifier, ...info });
        } else {
            // This would require additional implementation to list all rate limits
            res.json({
                message: 'Rate limit overview not implemented',
                note: 'Use specific identifier to get rate limit info'
            });
        }
    } catch (error) {
        logger.error('Failed to get rate limit info:', error);
        res.status(500).json({
            error: 'Failed to get rate limit information',
            code: 'RATE_LIMIT_INFO_ERROR'
        });
    }
});

// Admin: Clear cache
router.delete('/api/v1/admin/cache/:pattern?', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
    try {
        const { pattern } = req.params;
        
        if (pattern) {
            // This would require Redis SCAN implementation
            res.json({
                message: 'Cache pattern clearing not implemented',
                note: 'Manual cache key deletion required'
            });
        } else {
            res.json({
                message: 'Bulk cache clearing not implemented for safety',
                note: 'Use specific cache keys'
            });
        }
    } catch (error) {
        logger.error('Failed to clear cache:', error);
        res.status(500).json({
            error: 'Failed to clear cache',
            code: 'CACHE_CLEAR_ERROR'
        });
    }
});

// Error handling for undefined routes
router.use('*', (req: Request, res: Response) => {
    logger.warn('Route not found', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId
    });

    res.status(404).json({
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND',
        message: `The requested route ${req.method} ${req.path} was not found`,
        availableRoutes: {
            auth: '/api/v1/auth',
            users: '/api/v1/users',
            trading: '/api/v1/trading',
            marketData: '/api/v1/market-data',
            mlAnalytics: '/api/v1/ml-analytics',
            risk: '/api/v1/risk',
            mlPipeline: '/api/v1/ml-pipeline',
            notifications: '/api/v1/notifications',
            reports: '/api/v1/reports',
            altData: '/api/v1/alt-data',
            health: '/health',
            metrics: '/metrics (auth required)',
            admin: '/api/v1/admin (admin required)'
        }
    });
});

export default router;