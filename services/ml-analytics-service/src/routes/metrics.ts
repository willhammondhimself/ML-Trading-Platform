/**
 * Metrics Routes
 * Provides performance and operational metrics for monitoring
 */

import { Router as ExpressRouter, Request, Response } from 'express';
import { logger } from '@/utils/logger';

const router: ExpressRouter = ExpressRouter();

// Track basic metrics
let requestCount = 0;
let connectionCount = 0;
let messagesSent = 0;
let messagesReceived = 0;
let errorsCount = 0;

// Performance tracking
const startTime = Date.now();
const performanceMetrics = {
  requestDurations: [] as number[],
  maxDuration: 0,
  minDuration: Infinity,
  avgDuration: 0
};

/**
 * Middleware to track request metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: Function) => {
  const startTime = Date.now();
  requestCount++;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Update performance metrics
    performanceMetrics.requestDurations.push(duration);
    if (performanceMetrics.requestDurations.length > 1000) {
      performanceMetrics.requestDurations.shift(); // Keep only last 1000 requests
    }
    
    performanceMetrics.maxDuration = Math.max(performanceMetrics.maxDuration, duration);
    performanceMetrics.minDuration = Math.min(performanceMetrics.minDuration, duration);
    performanceMetrics.avgDuration = performanceMetrics.requestDurations.reduce((a, b) => a + b, 0) / performanceMetrics.requestDurations.length;

    if (res.statusCode >= 400) {
      errorsCount++;
    }
  });

  next();
};

/**
 * Prometheus-style metrics endpoint
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const metrics = `# HELP ml_analytics_uptime_seconds Total uptime of the service in seconds
# TYPE ml_analytics_uptime_seconds gauge
ml_analytics_uptime_seconds ${uptime}

# HELP ml_analytics_requests_total Total number of HTTP requests
# TYPE ml_analytics_requests_total counter
ml_analytics_requests_total ${requestCount}

# HELP ml_analytics_websocket_connections Total number of WebSocket connections
# TYPE ml_analytics_websocket_connections gauge
ml_analytics_websocket_connections ${connectionCount}

# HELP ml_analytics_messages_sent_total Total number of messages sent
# TYPE ml_analytics_messages_sent_total counter
ml_analytics_messages_sent_total ${messagesSent}

# HELP ml_analytics_messages_received_total Total number of messages received
# TYPE ml_analytics_messages_received_total counter
ml_analytics_messages_received_total ${messagesReceived}

# HELP ml_analytics_errors_total Total number of errors
# TYPE ml_analytics_errors_total counter
ml_analytics_errors_total ${errorsCount}

# HELP ml_analytics_memory_usage_bytes Memory usage in bytes
# TYPE ml_analytics_memory_usage_bytes gauge
ml_analytics_memory_usage_bytes{type="rss"} ${memory.rss}
ml_analytics_memory_usage_bytes{type="heap_used"} ${memory.heapUsed}
ml_analytics_memory_usage_bytes{type="heap_total"} ${memory.heapTotal}
ml_analytics_memory_usage_bytes{type="external"} ${memory.external}

# HELP ml_analytics_cpu_usage_microseconds CPU usage in microseconds
# TYPE ml_analytics_cpu_usage_microseconds gauge
ml_analytics_cpu_usage_microseconds{type="user"} ${cpu.user}
ml_analytics_cpu_usage_microseconds{type="system"} ${cpu.system}

# HELP ml_analytics_request_duration_ms Request duration in milliseconds
# TYPE ml_analytics_request_duration_ms histogram
ml_analytics_request_duration_ms_max ${performanceMetrics.maxDuration}
ml_analytics_request_duration_ms_min ${performanceMetrics.minDuration}
ml_analytics_request_duration_ms_avg ${performanceMetrics.avgDuration}

# HELP ml_analytics_service_info Service information
# TYPE ml_analytics_service_info gauge
ml_analytics_service_info{version="${process.env.npm_package_version || '1.0.0'}",node_version="${process.version}",platform="${process.platform}"} 1
`;

    res.set('Content-Type', 'text/plain');
    res.status(200).send(metrics);

  } catch (error) {
    logger.error('Failed to generate metrics:', error);
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * JSON metrics endpoint
 */
router.get('/json', (req: Request, res: Response) => {
  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const jsonMetrics = {
      timestamp: new Date().toISOString(),
      service: 'ml-analytics-websocket',
      version: process.env.npm_package_version || '1.0.0',
      
      // System metrics
      system: {
        uptime,
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          external: memory.external,
          arrayBuffers: memory.arrayBuffers || 0
        },
        cpu: {
          user: cpu.user,
          system: cpu.system
        },
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },

      // Application metrics
      application: {
        requests: {
          total: requestCount,
          errors: errorsCount,
          errorRate: requestCount > 0 ? (errorsCount / requestCount) * 100 : 0
        },
        websocket: {
          connections: connectionCount,
          messagesSent,
          messagesReceived,
          throughput: {
            sent: messagesSent / uptime,
            received: messagesReceived / uptime
          }
        },
        performance: {
          requestDuration: {
            max: performanceMetrics.maxDuration,
            min: performanceMetrics.minDuration === Infinity ? 0 : performanceMetrics.minDuration,
            avg: performanceMetrics.avgDuration,
            samples: performanceMetrics.requestDurations.length
          }
        }
      },

      // Health indicators
      health: {
        status: 'healthy', // Will be updated by service health checks
        services: {
          redis: false, // Will be updated when services are available
          database: false,
          kafka: false,
          webSocket: false
        }
      }
    };

    res.status(200).json(jsonMetrics);

  } catch (error) {
    logger.error('Failed to generate JSON metrics:', error);
    res.status(500).json({
      error: 'Failed to generate JSON metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Performance metrics endpoint
 */
router.get('/performance', (req: Request, res: Response) => {
  try {
    const performanceData = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      
      // Request performance
      requests: {
        total: requestCount,
        averageDuration: performanceMetrics.avgDuration,
        maxDuration: performanceMetrics.maxDuration,
        minDuration: performanceMetrics.minDuration === Infinity ? 0 : performanceMetrics.minDuration,
        recentSamples: performanceMetrics.requestDurations.length
      },

      // System performance
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
        freeMemory: require('os').freemem(),
        totalMemory: require('os').totalmem()
      },

      // WebSocket performance
      websocket: {
        connections: connectionCount,
        messagesSent,
        messagesReceived,
        messagesPerSecond: {
          sent: messagesSent / process.uptime(),
          received: messagesReceived / process.uptime()
        }
      }
    };

    res.status(200).json(performanceData);

  } catch (error) {
    logger.error('Failed to generate performance metrics:', error);
    res.status(500).json({
      error: 'Failed to generate performance metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Reset metrics (for testing/debugging)
 */
router.post('/reset', (req: Request, res: Response) => {
  try {
    requestCount = 0;
    connectionCount = 0;
    messagesSent = 0;
    messagesReceived = 0;
    errorsCount = 0;
    
    performanceMetrics.requestDurations = [];
    performanceMetrics.maxDuration = 0;
    performanceMetrics.minDuration = Infinity;
    performanceMetrics.avgDuration = 0;

    logger.info('Metrics reset successfully');
    
    res.status(200).json({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to reset metrics:', error);
    res.status(500).json({
      error: 'Failed to reset metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export functions to update metrics from other parts of the application
export const updateMetrics = {
  incrementConnections: () => connectionCount++,
  decrementConnections: () => connectionCount--,
  incrementMessagesSent: () => messagesSent++,
  incrementMessagesReceived: () => messagesReceived++,
  incrementErrors: () => errorsCount++,
  
  getConnectionCount: () => connectionCount,
  getMessagesSent: () => messagesSent,
  getMessagesReceived: () => messagesReceived,
  getErrorsCount: () => errorsCount
};

export const metricsRouter: ExpressRouter = router;