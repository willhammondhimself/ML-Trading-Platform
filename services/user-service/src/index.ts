import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import dotenv from 'dotenv';

// Import routes and middleware
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { healthRoutes } from './routes/health';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { rateLimitMiddleware } from './middleware/rate-limiter';
import { securityMiddleware } from './middleware/security';
import { validateEnvironment } from './config/environment';
import { initializeDatabase } from './database/connection';
import { initializeRedis } from './services/redis-service';
import { initializeKafka } from './services/kafka-service';
import { logger } from './utils/logger';
import { metricsRegistry } from './utils/metrics';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnvironment();

const app: Express = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// Trust proxy for production deployments behind load balancers
app.set('trust proxy', 1);

// Core middleware
app.use(helmet()); // Security headers
app.use(compression()); // Gzip compression
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging and monitoring
app.use(requestLogger);

// Rate limiting (global)
app.use(rateLimitMiddleware.global);

// Security middleware
app.use(securityMiddleware);

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await metricsRegistry.metrics();
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', error);
    res.status(500).send('Failed to generate metrics');
  }
});

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  server.close(async (err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }

    try {
      // Close database connections
      logger.info('Closing database connections...');
      // Database close logic will be implemented in connection.ts
      
      // Close Redis connections
      logger.info('Closing Redis connections...');
      // Redis close logic will be implemented in redis-service.ts
      
      // Close Kafka connections
      logger.info('Closing Kafka connections...');
      // Kafka close logic will be implemented in kafka-service.ts
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

// Shutdown signal handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Initialize services and start server
const startServer = async () => {
  try {
    // Initialize database
    logger.info('Initializing database connection...');
    await initializeDatabase();

    // Initialize Redis
    logger.info('Initializing Redis connection...');
    await initializeRedis();

    // Initialize Kafka
    logger.info('Initializing Kafka connection...');
    await initializeKafka();

    // Start server
    server.listen(PORT, () => {
      logger.info(`User Service started on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Process ID: ${process.pid}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export { app, server };