import { Router as ExpressRouter } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { checkDatabaseHealth } from '../database/connection';
import { checkRedisHealth } from '../services/redis-service';
import { checkKafkaHealth } from '../services/kafka-service';
import { logger } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
    };
    kafka: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
    };
  };
  memory: NodeJS.MemoryUsage;
  cpu: {
    loadAverage: number[];
    usage?: number;
  };
}

/**
 * GET /api/health
 * Basic health check endpoint
 */
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'user-service'
  });
}));

/**
 * GET /api/health/detailed
 * Detailed health check with service dependencies
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  // Check all services in parallel
  const [databaseHealth, redisHealth, kafkaHealth] = await Promise.allSettled([
    checkServiceHealth('database', checkDatabaseHealth),
    checkServiceHealth('redis', checkRedisHealth),
    checkServiceHealth('kafka', checkKafkaHealth)
  ]);

  const services = {
    database: getServiceResult(databaseHealth),
    redis: getServiceResult(redisHealth),
    kafka: getServiceResult(kafkaHealth)
  };

  // Determine overall status
  const unhealthyServices = Object.values(services).filter(s => s.status === 'unhealthy');
  const overallStatus = unhealthyServices.length === 0 ? 'healthy' : 
                       unhealthyServices.length === Object.keys(services).length ? 'unhealthy' : 'degraded';

  const healthCheck: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services,
    memory: process.memoryUsage(),
    cpu: {
      loadAverage: process.platform !== 'win32' ? process.loadavg() : [0, 0, 0]
    }
  };

  // Log health check results
  if (overallStatus !== 'healthy') {
    logger.warn('Health check failed', {
      status: overallStatus,
      unhealthyServices: unhealthyServices.length,
      services
    });
  }

  const statusCode = overallStatus === 'healthy' ? 200 : 
                    overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthCheck);
}));

/**
 * GET /api/health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check critical services for readiness
    const [databaseReady, redisReady] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);

    if (databaseReady && redisReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not-ready',
        timestamp: new Date().toISOString(),
        reasons: [
          !databaseReady && 'database-unavailable',
          !redisReady && 'redis-unavailable'
        ].filter(Boolean)
      });
    }
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not-ready',
      timestamp: new Date().toISOString(),
      error: 'readiness-check-failed'
    });
  }
}));

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
router.get('/live', asyncHandler(async (req, res) => {
  // Simple liveness check - just verify the process is running
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
}));

/**
 * GET /api/health/metrics
 * Health metrics for monitoring
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.status(200).json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    loadAverage: process.platform !== 'win32' ? process.loadavg() : [0, 0, 0],
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  });
}));

// Helper functions

async function checkServiceHealth(serviceName: string, healthCheck: () => Promise<boolean>) {
  const startTime = Date.now();
  try {
    const isHealthy = await healthCheck();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isHealthy ? 'healthy' as const : 'unhealthy' as const,
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error(`${serviceName} health check failed:`, error);
    
    return {
      status: 'unhealthy' as const,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function getServiceResult(settledResult: PromiseSettledResult<any>) {
  if (settledResult.status === 'fulfilled') {
    return settledResult.value;
  } else {
    return {
      status: 'unhealthy' as const,
      error: settledResult.reason?.message || 'Service check failed'
    };
  }
}

export { router as healthRoutes };