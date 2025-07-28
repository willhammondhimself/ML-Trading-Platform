/**
 * Notification Service Entry Point
 * 
 * Multi-channel notification service for the ML Trading Platform
 * supporting email, SMS, push notifications, and webhook delivery
 * with comprehensive tracking, templating, and queue management.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger, healthLogger, logError } from './utils/logger';
import { notificationKafkaService } from './services/kafka-service';
import { emailService } from './services/email-service';
import { smsService } from './services/sms-service';

class NotificationService {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // Compression
    this.app.use(compression());

    // CORS
    this.app.use(cors({
      origin: config.SECURITY.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('HTTP request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const startTime = Date.now();
      
      try {
        const healthStatus = {
          timestamp: new Date().toISOString(),
          status: 'healthy',
          version: config.VERSION,
          uptime: process.uptime(),
          checks: {
            kafka: false,
            email: false,
            sms: false,
            database: false
          }
        };

        // Check Kafka connection
        try {
          healthStatus.checks.kafka = await notificationKafkaService.healthCheck();
          healthLogger.check('kafka', healthStatus.checks.kafka ? 'healthy' : 'unhealthy', Date.now() - startTime);
        } catch (error) {
          healthStatus.checks.kafka = false;
          healthLogger.check('kafka', 'unhealthy', Date.now() - startTime, { error: (error as Error).message });
        }

        // Check Email service
        try {
          healthStatus.checks.email = await emailService.healthCheck();
          healthLogger.check('email', healthStatus.checks.email ? 'healthy' : 'unhealthy', Date.now() - startTime);
        } catch (error) {
          healthStatus.checks.email = false;
          healthLogger.check('email', 'unhealthy', Date.now() - startTime, { error: (error as Error).message });
        }

        // Check SMS service
        try {
          healthStatus.checks.sms = await smsService.healthCheck();
          healthLogger.check('sms', healthStatus.checks.sms ? 'healthy' : 'unhealthy', Date.now() - startTime);
        } catch (error) {
          healthStatus.checks.sms = false;
          healthLogger.check('sms', 'unhealthy', Date.now() - startTime, { error: (error as Error).message });
        }

        // Determine overall status
        const allHealthy = Object.values(healthStatus.checks).every(check => check);
        healthStatus.status = allHealthy ? 'healthy' : 'degraded';

        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json(healthStatus);

      } catch (error) {
        logError(error as Error, { operation: 'health_check' });
        
        res.status(503).json({
          timestamp: new Date().toISOString(),
          status: 'unhealthy',
          version: config.VERSION,
          error: 'Health check failed'
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      try {
        const metrics = {
          timestamp: new Date().toISOString(),
          service: {
            name: config.SERVICE_NAME,
            version: config.VERSION,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          },
          kafka: notificationKafkaService.getMetrics(),
          email: emailService.metrics,
          sms: smsService.metrics,
          configuration: {
            emailEnabled: config.EMAIL.ENABLED,
            smsEnabled: config.SMS.ENABLED,
            pushEnabled: config.PUSH.ENABLED,
            channels: {
              email: {
                provider: 'smtp',
                rateLimit: config.EMAIL.RATE_LIMIT
              },
              sms: {
                provider: config.SMS.PROVIDER,
                rateLimit: config.SMS.RATE_LIMIT
              }
            }
          }
        };

        res.json(metrics);
      } catch (error) {
        logError(error as Error, { operation: 'get_metrics' });
        res.status(500).json({
          error: 'Failed to gather metrics',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Service status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        service: config.SERVICE_NAME,
        version: config.VERSION,
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        configuration: {
          channels: {
            email: config.EMAIL.ENABLED,
            sms: config.SMS.ENABLED,
            push: config.PUSH.ENABLED
          },
          providers: {
            email: 'smtp',
            sms: config.SMS.PROVIDER
          },
          kafka: {
            enabled: true,
            topics: Object.values(config.KAFKA_TOPICS)
          }
        }
      });
    });

    // Webhook endpoints for delivery status updates
    this.app.post('/webhooks/email/status', (req, res) => {
      try {
        // Handle email delivery status webhooks (e.g., from SendGrid, Mailgun)
        logger.info('Email webhook received', {
          headers: req.headers,
          body: req.body
        });

        // Process webhook data here
        res.status(200).json({ status: 'received' });
      } catch (error) {
        logError(error as Error, { operation: 'email_webhook' });
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });

    this.app.post('/webhooks/sms/status', async (req, res) => {
      try {
        logger.info('SMS webhook received', {
          headers: req.headers,
          body: req.body
        });

        // Process SMS delivery status webhook
        await smsService.processWebhook(req.body);
        
        res.status(200).json({ status: 'received' });
      } catch (error) {
        logError(error as Error, { operation: 'sms_webhook' });
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });

    // Test endpoints for development
    if (config.NODE_ENV === 'development') {
      this.app.post('/test/email', async (req, res) => {
        try {
          const { to, subject, message } = req.body;
          
          // This would normally be handled by the notification queue
          logger.info('Test email requested', { to, subject });
          
          res.json({
            success: true,
            message: 'Test email queued',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          logError(error as Error, { operation: 'test_email' });
          res.status(500).json({ error: 'Failed to send test email' });
        }
      });

      this.app.post('/test/sms', async (req, res) => {
        try {
          const { to, message } = req.body;
          
          logger.info('Test SMS requested', { to: smsService.constructor.formatPhoneForDisplay(to) });
          
          res.json({
            success: true,
            message: 'Test SMS queued',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          logError(error as Error, { operation: 'test_sms' });
          res.status(500).json({ error: 'Failed to send test SMS' });
        }
      });
    }

    // Kafka event publishing endpoint (for testing)
    this.app.post('/events/publish', async (req, res) => {
      try {
        const { eventType, userId, data } = req.body;
        
        const event = {
          eventId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          eventType: eventType || 'test_notification',
          source: 'notification-service-api',
          userId,
          data,
          timestamp: new Date().toISOString(),
          version: '1.0'
        };

        await notificationKafkaService.publishNotificationStatus(event);

        res.json({
          success: true,
          message: 'Event published successfully',
          eventId: event.eventId
        });

      } catch (error) {
        logError(error as Error, { operation: 'publish_event' });
        res.status(500).json({
          error: 'Failed to publish event',
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The requested route ${req.method} ${req.path} was not found`,
        availableRoutes: {
          health: '/health',
          metrics: '/metrics',
          status: '/status',
          webhooks: {
            email: '/webhooks/email/status',
            sms: '/webhooks/sms/status'
          },
          events: '/events/publish (POST)'
        }
      });
    });

    // Global error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const statusCode = err.status || err.statusCode || 500;
      const message = err.message || 'Internal server error';

      logError(err, {
        url: req.url,
        method: req.method,
        statusCode
      });

      res.status(statusCode).json({
        error: statusCode >= 500 && config.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : message,
        code: err.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Notification Service...');

      // Initialize Kafka connection
      logger.info('📡 Initializing Kafka connection...');
      await notificationKafkaService.connect();

      // Initialize Email service
      if (config.EMAIL.ENABLED) {
        logger.info('📧 Initializing Email service...');
        await emailService.initialize();
      }

      // Initialize SMS service
      if (config.SMS.ENABLED) {
        logger.info('📱 Initializing SMS service...');
        await smsService.initialize();
      }

      // Setup Kafka event handlers
      this.setupKafkaEventHandlers();

      // Start HTTP server
      this.server = this.app.listen(config.PORT, () => {
        logger.info('✅ Notification Service started successfully', {
          port: config.PORT,
          environment: config.NODE_ENV,
          pid: process.pid,
          nodeVersion: process.version
        });

        logger.info(`🌐 HTTP Health check: http://localhost:${config.PORT}/health`);
        logger.info(`📊 HTTP Metrics: http://localhost:${config.PORT}/metrics`);

        logger.info('📋 Service configuration', {
          emailEnabled: config.EMAIL.ENABLED,
          smsEnabled: config.SMS.ENABLED,
          pushEnabled: config.PUSH.ENABLED,
          kafkaTopics: Object.values(config.KAFKA_TOPICS),
          providers: {
            email: 'smtp',
            sms: config.SMS.PROVIDER
          }
        });
      });

      // Handle server errors
      this.server.on('error', (error: Error) => {
        logError(error, { component: 'http_server' });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logError(error as Error, { operation: 'service_start' });
      process.exit(1);
    }
  }

  private setupKafkaEventHandlers(): void {
    // Handle notification events from Kafka
    notificationKafkaService.on('notificationEvent', async ({ topic, event, metadata }) => {
      try {
        logger.info('Notification event received', {
          topic,
          eventType: event.eventType,
          eventId: event.eventId,
          userId: event.userId
        });

        // Here you would process the notification event
        // This would typically involve:
        // 1. Creating notification records
        // 2. Queuing them for delivery
        // 3. Processing through appropriate channels
        
      } catch (error) {
        logError(error as Error, {
          operation: 'process_notification_event',
          topic,
          eventId: event.eventId
        });
      }
    });

    // Handle processing errors
    notificationKafkaService.on('processingError', ({ topic, partition, offset, error }) => {
      logError(error, {
        operation: 'kafka_message_processing',
        topic,
        partition,
        offset
      });
    });

    // Handle Kafka errors
    notificationKafkaService.on('error', (error) => {
      logError(error, { component: 'kafka_service' });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        if (this.server) {
          await new Promise<void>((resolve, reject) => {
            this.server.close((err?: Error) => {
              if (err) {
                logError(err, { operation: 'http_server_close' });
                reject(err);
              } else {
                logger.info('✅ HTTP server closed');
                resolve();
              }
            });
          });
        }

        // Disconnect from Kafka
        logger.info('📡 Closing Kafka connection...');
        await notificationKafkaService.disconnect();

        logger.info('✅ Notification Service shutdown completed');
        process.exit(0);

      } catch (error) {
        logError(error as Error, { operation: 'graceful_shutdown' });
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
  }
}

// Global exception handlers
process.on('uncaughtException', (error) => {
  logError(error, { type: 'uncaught_exception' });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(new Error(`Unhandled Rejection: ${reason}`), { 
    type: 'unhandled_rejection',
    promise: promise.toString()
  });
  process.exit(1);
});

// Start the service
const service = new NotificationService();
service.start().catch((error) => {
  logError(error, { operation: 'service_startup' });
  process.exit(1);
});

export { NotificationService };