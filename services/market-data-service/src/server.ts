/**
 * Market Data Service Server
 * Main server application integrating REST API and WebSocket feeds
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';

import { config } from './config';
import { ProviderManager } from './services/provider-manager';
import { CacheService } from './services/cache-service';
import { WebSocketFeedManager } from './services/websocket-feed-manager';
import { createMarketDataRouter } from './routes/market-data';
import { 
  serverLogger, 
  logError, 
  logServerEvent,
  requestLoggingMiddleware 
} from './utils/logger';

class MarketDataServer {
  private app: express.Application;
  private httpServer: any;
  private providerManager?: ProviderManager;
  private cacheService?: CacheService;
  private wsManager?: WebSocketFeedManager;
  private isRunning = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  // === Server Setup ===

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.service.corsOrigins || ['http://localhost:3000', 'http://localhost:8080'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLoggingMiddleware);

    // Health check endpoint (before authentication)
    this.app.get('/health', (req, res) => {
      const healthStatus = {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          cache: this.cacheService?.isConnected() || false,
          websocket: this.wsManager ? true : false,
          providers: this.providerManager?.getProviderStats() || {}
        }
      };

      res.json(healthStatus);
    });
  }

  private setupRoutes(): void {
    // API versioning
    const apiV1 = express.Router();
    
    // Market data routes will be added after services are initialized
    // This is set up in the start() method
    
    this.app.use('/api/v1', apiV1);
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'ML Trading Platform - Market Data Service',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Real-time and historical market data API',
        endpoints: {
          health: '/health',
          api: '/api/v1',
          websocket: `/ws (port ${config.service.wsPort})`
        },
        timestamp: Date.now()
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${req.method} ${req.originalUrl} not found`
        }
      });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logError(error, 'server', {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body
      });

      const statusCode = error.statusCode || error.status || 500;
      const message = statusCode === 500 ? 'Internal server error' : error.message;

      res.status(statusCode).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message,
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logError(error, 'server', { event: 'uncaughtException' });
      this.gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logError(new Error(`Unhandled Rejection: ${reason}`), 'server', { 
        event: 'unhandledRejection',
        promise: promise.toString()
      });
      this.gracefulShutdown('unhandledRejection');
    });

    // Handle SIGTERM and SIGINT for graceful shutdown
    process.on('SIGTERM', () => {
      serverLogger.info('Received SIGTERM signal, starting graceful shutdown...');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      serverLogger.info('Received SIGINT signal, starting graceful shutdown...');
      this.gracefulShutdown('SIGINT');
    });
  }

  // === Service Initialization ===

  private async initializeServices(): Promise<void> {
    try {
      serverLogger.info('Initializing market data services...');

      // 1. Initialize Cache Service
      serverLogger.info('Connecting to Redis cache...');
      this.cacheService = new CacheService(config.cache, config.redis);
      await this.cacheService.connect();
      serverLogger.info('Cache service connected');

      // 2. Initialize Provider Manager
      serverLogger.info('Initializing data providers...');
      this.providerManager = new ProviderManager(config.providers);
      await this.providerManager.connectAll();
      serverLogger.info('Provider manager initialized');

      // 3. Setup REST API routes
      const marketDataRouter = createMarketDataRouter(this.providerManager, this.cacheService);
      this.app.use('/api/v1/market-data', marketDataRouter);
      serverLogger.info('REST API routes configured');

      // 4. Initialize WebSocket Feed Manager
      if (config.service.enableWebSocket) {
        serverLogger.info('Starting WebSocket feed manager...');
        this.wsManager = new WebSocketFeedManager(
          {
            port: config.service.wsPort,
            maxConnections: config.service.maxWebSocketConnections,
            pingTimeout: 60000,
            pingInterval: 25000,
            compression: true,
            cors: {
              origin: config.service.corsOrigins || ['http://localhost:3000'],
              credentials: true
            },
            rateLimits: {
              connectionsPerMinute: 100,
              messagesPerMinute: 1000,
              subscriptionsPerClient: 100
            }
          },
          this.providerManager,
          this.cacheService
        );

        await this.wsManager.start();
        serverLogger.info(`WebSocket feed manager started on port ${config.service.wsPort}`);

        // Setup WebSocket event monitoring
        this.setupWebSocketMonitoring();
      }

      serverLogger.info('All services initialized successfully');

    } catch (error) {
      logError(error as Error, 'server', { operation: 'initializeServices' });
      throw error;
    }
  }

  private setupWebSocketMonitoring(): void {
    if (!this.wsManager) return;

    // Monitor WebSocket statistics
    this.wsManager.on('stats_updated', (stats) => {
      if (stats.connectionCount > 0) {
        serverLogger.debug('WebSocket stats', stats);
      }
    });

    // Log significant WebSocket events
    this.wsManager.on('high_load', (data) => {
      serverLogger.warn('High WebSocket load detected', data);
    });

    this.wsManager.on('connection_limit_reached', (data) => {
      serverLogger.warn('WebSocket connection limit reached', data);
    });
  }

  // === Server Lifecycle ===

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        throw new Error('Server is already running');
      }

      serverLogger.info('Starting market data service...', {
        port: config.service.port,
        environment: config.service.environment
      });

      // Initialize all services
      await this.initializeServices();

      // Create HTTP server
      this.httpServer = createServer(this.app);

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(config.service.port, config.service.host, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;

      logServerEvent('server_started', {
        port: config.service.port,
        host: config.service.host,
        environment: config.service.environment,
        websocket: config.service.enableWebSocket,
        wsPort: config.service.wsPort,
        providers: config.providers.length
      });

      serverLogger.info('Market data service started successfully', {
        httpPort: config.service.port,
        wsPort: config.service.wsPort,
        environment: config.service.environment
      });

    } catch (error) {
      logError(error as Error, 'server', { operation: 'start' });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        return;
      }

      serverLogger.info('Stopping market data service...');

      // Stop WebSocket manager
      if (this.wsManager) {
        await this.wsManager.stop();
        serverLogger.info('WebSocket feed manager stopped');
      }

      // Disconnect providers
      if (this.providerManager) {
        await this.providerManager.disconnectAll();
        serverLogger.info('Data providers disconnected');
      }

      // Disconnect cache
      if (this.cacheService) {
        await this.cacheService.disconnect();
        serverLogger.info('Cache service disconnected');
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          this.httpServer.close((error?: Error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }

      this.isRunning = false;

      logServerEvent('server_stopped', {
        uptime: process.uptime(),
        timestamp: Date.now()
      });

      serverLogger.info('Market data service stopped successfully');

    } catch (error) {
      logError(error as Error, 'server', { operation: 'stop' });
      throw error;
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    serverLogger.info(`Graceful shutdown initiated by ${signal}`);
    
    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      logError(error as Error, 'server', { operation: 'gracefulShutdown', signal });
      process.exit(1);
    }
  }

  // === Public Interface ===

  getApp(): express.Application {
    return this.app;
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getServiceStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: this.wsManager?.getStats() || {},
      cache: this.cacheService?.getStats() || {},
      providers: this.providerManager?.getProviderStats() || {}
    };
  }
}

// Create and start server if this file is run directly
if (require.main === module) {
  const server = new MarketDataServer();
  
  server.start().catch((error) => {
    logError(error, 'server', { operation: 'startup' });
    process.exit(1);
  });
}

export default MarketDataServer;
export { MarketDataServer };