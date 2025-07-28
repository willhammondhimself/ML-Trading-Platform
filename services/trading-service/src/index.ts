import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import dotenv from 'dotenv';

// Import routes and middleware
import orderRoutes from './routes/orders';
import positionRoutes from './routes/positions';
import tradeRoutes from './routes/trades';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { validateEnvironment } from './config/environment';
import { initializeDatabase } from './database/connection';
import { initializeRedis } from './services/redis-service';
import { initializeKafka } from './services/kafka-service';
import { startOrderProcessor } from './services/order-processor';
import { startPositionUpdater, stopPositionUpdater } from './services/position-updater';
import { stopOrderProcessor } from './services/order-processor';
import { closeRedis } from './services/redis-service';
import { closeKafka } from './services/kafka-service';
import { closeDatabase } from './database/connection';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnvironment();

const app: Express = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

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

// Basic request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'trading-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/orders', orderRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/trades', tradeRoutes);

// 404 handler
app.use('*', notFoundHandler);

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
      // Stop background services
      logger.info('Stopping background services...');
      await stopOrderProcessor();
      await stopPositionUpdater();
      
      // Close database connections
      logger.info('Closing database connections...');
      await closeDatabase();
      
      // Close Redis connections
      logger.info('Closing Redis connections...');
      await closeRedis();
      
      // Close Kafka connections
      logger.info('Closing Kafka connections...');
      await closeKafka();
      
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

    // Start background services
    logger.info('Starting background services...');
    await startOrderProcessor();
    await startPositionUpdater();

    // Start server
    server.listen(PORT, () => {
      logger.info(`Trading Service started on port ${PORT}`);
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