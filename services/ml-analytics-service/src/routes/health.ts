/**
 * Health Check Routes
 * Provides health status for the ML Analytics WebSocket Service
 */

import { Router as ExpressRouter, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

const router: ExpressRouter = ExpressRouter();

/**
 * Basic health check endpoint
 */
router.get('/', (req: Request, res: Response) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    service: 'ml-analytics-websocket',
    environment: config.nodeEnv,
    memory: process.memoryUsage(),
    pid: process.pid
  };

  res.status(200).json(healthStatus);
});

/**
 * Detailed health check with service status
 */
router.get('/detailed', (req: Request, res: Response) => {
  try {
    // Note: Service dependencies will be injected when the full service is running
    // For now, provide basic health information
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      service: 'ml-analytics-websocket',
      environment: config.nodeEnv,
      
      // System information
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },
      
      // Service dependencies (will be populated by main service)
      services: {
        redis: false, // Will be updated when Redis service is available
        database: false, // Will be updated when Database service is available
        kafka: false, // Will be updated when Kafka service is available
        webSocket: false // Will be updated when WebSocket server is available
      },
      
      // Configuration status
      configuration: {
        loaded: true,
        environment: config.nodeEnv,
        port: config.port,
        metricsPort: config.metricsPort,
        logLevel: config.logLevel
      }
    };

    res.status(200).json(detailedHealth);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Liveness probe endpoint (for Kubernetes)
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    service: 'ml-analytics-websocket'
  });
});

/**
 * Readiness probe endpoint (for Kubernetes)
 */
router.get('/ready', (req: Request, res: Response) => {
  try {
    // Check if all critical services are ready
    // For now, just check if the process is running
    const isReady = process.uptime() > 5; // Simple readiness check

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        service: 'ml-analytics-websocket',
        uptime: process.uptime()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        service: 'ml-analytics-websocket',
        reason: 'Service still starting up'
      });
    }

  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'ml-analytics-websocket',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Startup probe endpoint (for Kubernetes)
 */
router.get('/startup', (req: Request, res: Response) => {
  try {
    const hasStarted = process.uptime() > 10; // Allow 10 seconds for startup

    if (hasStarted) {
      res.status(200).json({
        status: 'started',
        timestamp: new Date().toISOString(),
        service: 'ml-analytics-websocket',
        uptime: process.uptime()
      });
    } else {
      res.status(503).json({
        status: 'starting',
        timestamp: new Date().toISOString(),
        service: 'ml-analytics-websocket',
        uptime: process.uptime()
      });
    }

  } catch (error) {
    logger.error('Startup check failed:', error);
    
    res.status(503).json({
      status: 'startup_failed',
      timestamp: new Date().toISOString(),
      service: 'ml-analytics-websocket',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const healthRouter: ExpressRouter = router;