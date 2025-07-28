#!/usr/bin/env node

/**
 * ML Analytics WebSocket Service
 * Enterprise-grade WebSocket server for real-time ML prediction streaming
 * 
 * Features:
 * - Connection pooling and load balancing
 * - Message queuing with Redis persistence
 * - Rate limiting and throttling
 * - Circuit breaker pattern
 * - Binary protocol support (Protocol Buffers)
 * - Channel-based subscriptions
 * - Performance monitoring and metrics
 * - Kafka integration for ML events
 * - Automatic reconnection with exponential backoff
 */

import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config';
import { logger } from './utils/logger';
import { gracefulShutdown } from './utils/graceful-shutdown';
import { healthRouter } from './routes/health';
import { metricsRouter } from './routes/metrics';

// Core services
import { MLAnalyticsWebSocketServer } from './services/websocket-server';
import { ConnectionPoolManager } from './services/connection-pool';
import { MessageQueueService } from './services/message-queue';
import { RateLimitService } from './services/rate-limiter';
import { CircuitBreakerService } from './services/circuit-breaker';
import { PerformanceMonitor } from './services/performance-monitor';
import { KafkaIntegration } from './services/kafka-integration';
import { RedisService } from './services/redis-service';
import { DatabaseService } from './services/database';

/**
 * Main application class
 */
class MLAnalyticsService {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private wsServer: MLAnalyticsWebSocketServer;
  
  // Core services
  private redisService: RedisService;
  private databaseService: DatabaseService;
  private messageQueue: MessageQueueService;
  private connectionPool: ConnectionPoolManager;
  private rateLimiter: RateLimitService;
  private circuitBreaker: CircuitBreakerService;
  private performanceMonitor: PerformanceMonitor;
  private kafkaIntegration: KafkaIntegration;
  
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.setupExpress();
    this.initializeServices();
  }

  /**
   * Configure Express application
   */
  private setupExpress(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow WebSocket connections
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration for WebSocket connections
    this.app.use(cors({
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });
      next();
    });

    // API routes
    this.app.use('/health', healthRouter);
    this.app.use('/metrics', metricsRouter);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        service: 'ml-analytics-websocket'
      });
    });

    // Error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Express error:', err);
      
      if (res.headersSent) {
        return next(err);
      }

      res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: config.nodeEnv === 'development' ? err.message : 'Something went wrong',
        service: 'ml-analytics-websocket'
      });
    });
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      logger.info('🚀 Initializing ML Analytics WebSocket Service...');

      // Initialize Redis connection
      this.redisService = new RedisService(config.redis);
      await this.redisService.connect();
      logger.info('✅ Redis service connected');

      // Initialize database connection
      this.databaseService = new DatabaseService(config.database);
      await this.databaseService.connect();
      logger.info('✅ Database service connected');

      // Initialize performance monitoring
      this.performanceMonitor = new PerformanceMonitor({
        ...config.monitoring,
        redisService: this.redisService
      });
      await this.performanceMonitor.start();
      logger.info('✅ Performance monitor started');

      // Initialize message queue
      this.messageQueue = new MessageQueueService({
        ...config.messageQueue,
        redisService: this.redisService,
        performanceMonitor: this.performanceMonitor
      });
      await this.messageQueue.initialize();
      logger.info('✅ Message queue initialized');

      // Initialize connection pool
      this.connectionPool = new ConnectionPoolManager({
        ...config.connectionPool,
        redisService: this.redisService,
        performanceMonitor: this.performanceMonitor
      });
      await this.connectionPool.initialize();
      logger.info('✅ Connection pool initialized');

      // Initialize rate limiter
      this.rateLimiter = new RateLimitService({
        ...config.rateLimiting,
        redisService: this.redisService
      });
      await this.rateLimiter.initialize();
      logger.info('✅ Rate limiter initialized');

      // Initialize circuit breaker
      this.circuitBreaker = new CircuitBreakerService({
        ...config.circuitBreaker,
        performanceMonitor: this.performanceMonitor
      });
      logger.info('✅ Circuit breaker initialized');

      // Initialize Kafka integration
      this.kafkaIntegration = new KafkaIntegration({
        ...config.kafka,
        messageQueue: this.messageQueue
      });
      await this.kafkaIntegration.connect();
      logger.info('✅ Kafka integration connected');

      logger.info('🎉 All services initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Create HTTP server
      this.httpServer = createServer(this.app);

      // Initialize Socket.IO server
      this.io = new SocketIOServer(this.httpServer, {
        cors: {
          origin: config.cors.origins,
          methods: ['GET', 'POST'],
          credentials: true
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 10000,
        maxHttpBufferSize: 1e6 // 1MB
      });

      // Initialize WebSocket server
      this.wsServer = new MLAnalyticsWebSocketServer({
        io: this.io,
        connectionPool: this.connectionPool,
        messageQueue: this.messageQueue,
        rateLimiter: this.rateLimiter,
        circuitBreaker: this.circuitBreaker,
        performanceMonitor: this.performanceMonitor,
        kafkaIntegration: this.kafkaIntegration,
        redisService: this.redisService,
        databaseService: this.databaseService
      });

      await this.wsServer.initialize();
      logger.info('✅ WebSocket server initialized');

      // Start HTTP server
      await new Promise<void>((resolve) => {
        this.httpServer.listen(config.port, () => {
          logger.info(`🌟 ML Analytics Service started successfully`);
          logger.info(`📡 WebSocket server listening on port ${config.port}`);
          logger.info(`📊 Metrics server available on port ${config.metricsPort}`);
          logger.info(`🏥 Health checks available at /health`);
          logger.info(`🎯 Environment: ${config.nodeEnv}`);
          resolve();
        });
      });

      // Setup graceful shutdown
      gracefulShutdown.setup([
        {
          name: 'WebSocket Server',
          cleanup: () => this.wsServer.shutdown()
        },
        {
          name: 'Kafka Integration',
          cleanup: () => this.kafkaIntegration.disconnect()
        },
        {
          name: 'Connection Pool',
          cleanup: () => this.connectionPool.shutdown()
        },
        {
          name: 'Message Queue',
          cleanup: () => this.messageQueue.shutdown()
        },
        {
          name: 'Performance Monitor',
          cleanup: () => this.performanceMonitor.stop()
        },
        {
          name: 'Redis Service',
          cleanup: () => this.redisService.disconnect()
        },
        {
          name: 'Database Service',
          cleanup: () => this.databaseService.disconnect()
        },
        {
          name: 'HTTP Server',
          cleanup: () => new Promise<void>((resolve) => {
            this.httpServer.close(() => resolve());
          })
        }
      ]);

    } catch (error) {
      logger.error('❌ Failed to start ML Analytics Service:', error);
      process.exit(1);
    }
  }

  /**
   * Get service health status
   */
  getHealth(): any {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        redis: this.redisService?.isConnected() || false,
        database: this.databaseService?.isConnected() || false,
        kafka: this.kafkaIntegration?.isConnected() || false,
        webSocket: this.wsServer?.isHealthy() || false
      },
      metrics: this.performanceMonitor?.getMetrics() || {}
    };
  }
}

// Start the service if this is the main module
if (require.main === module) {
  const service = new MLAnalyticsService();
  
  // Handle uncaught exceptions and rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the service
  service.start().catch((error) => {
    logger.error('Failed to start service:', error);
    process.exit(1);
  });
}

export { MLAnalyticsService };