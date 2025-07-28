/**
 * Health Check Routes
 * Provides health status for the Risk Management Service
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
    service: 'risk-management-service',
    environment: config.NODE_ENV,
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
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      service: 'risk-management-service',
      environment: config.NODE_ENV,
      
      // System information
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },
      
      // Service dependencies
      services: {
        redis: false, // Will be updated when Redis service is available
        database: false, // Will be updated when Database service is available
        kafka: false, // Will be updated when Kafka service is available
        riskMonitor: false, // Will be updated when Risk Monitor is available
        complianceMonitor: false, // Will be updated when Compliance Monitor is available
        auditTrail: false, // Will be updated when Audit Trail is available
        alertService: false // Will be updated when Alert Service is available
      },
      
      // Configuration status
      configuration: {
        loaded: true,
        environment: config.NODE_ENV,
        port: config.PORT,
        logLevel: config.LOG_LEVEL,
        debug: config.DEBUG
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
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    service: 'risk-management-service'
  });
});

/**
 * Readiness probe endpoint (for Kubernetes)
 */
router.get('/ready', (req: Request, res: Response) => {
  try {
    const isReady = process.uptime() > 5; // Simple readiness check

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        service: 'risk-management-service',
        uptime: process.uptime()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        service: 'risk-management-service',
        reason: 'Service still starting up'
      });
    }

  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'risk-management-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const healthRouter: ExpressRouter = router;