/**
 * WebSocket Service Entry Point
 * 
 * Enterprise-grade WebSocket service for real-time data streaming
 * featuring Kafka integration, Redis pub/sub, connection management,
 * and comprehensive monitoring for the ML Trading Platform.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger, wsLogger, logHealthCheck } from './utils/logger';
import { initializeRedis, closeRedis, redisService } from './services/redis-service';
import { initializeKafka, closeKafka, kafkaService } from './services/kafka-service';
import { initializeWebSocketServer, stopWebSocketServer, wsManager } from './services/websocket-manager';

class WebSocketService {
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
            contentSecurityPolicy: false, // Disable for WebSocket connections
            crossOriginEmbedderPolicy: false
        }));
        
        // CORS for HTTP endpoints
        this.app.use(cors({
            origin: ['http://localhost:3000', 'http://localhost:8080'],
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        // JSON parsing
        this.app.use(express.json({ limit: '1mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger.info('HTTP request completed', {
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration_ms: duration,
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
            const healthStatus = {
                timestamp: new Date().toISOString(),
                status: 'healthy',
                version: '1.0.0',
                uptime: process.uptime(),
                checks: {
                    webSocket: false,
                    redis: false,
                    kafka: false
                }
            };
            
            try {
                // Check WebSocket server
                healthStatus.checks.webSocket = await wsManager.healthCheck();
                logHealthCheck('websocket', healthStatus.checks.webSocket ? 'healthy' : 'unhealthy', {
                    connections: wsManager.getConnectionCount(),
                    running: wsManager.running
                });
                
                // Check Redis
                healthStatus.checks.redis = await redisService.healthCheck();
                logHealthCheck('redis', healthStatus.checks.redis ? 'healthy' : 'unhealthy', {
                    connected: redisService.connected
                });
                
                // Check Kafka
                healthStatus.checks.kafka = await kafkaService.healthCheck();
                logHealthCheck('kafka', healthStatus.checks.kafka ? 'healthy' : 'unhealthy', {
                    connected: kafkaService.connected
                });
                
                // Determine overall status
                const allHealthy = Object.values(healthStatus.checks).every(check => check);
                healthStatus.status = allHealthy ? 'healthy' : 'degraded';
                
                const statusCode = allHealthy ? 200 : 503;
                res.status(statusCode).json(healthStatus);
                
            } catch (error) {
                logger.error('Health check failed:', error);
                
                healthStatus.status = 'unhealthy';
                res.status(503).json({
                    ...healthStatus,
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
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage()
                    },
                    webSocket: wsManager.getMetrics(),
                    kafka: kafkaService.getMetrics(),
                    redis: {
                        connected: redisService.connected,
                        clients: Object.keys(redisService.clients).length
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
        
        // WebSocket connection info endpoint
        this.app.get('/connections', (req, res) => {
            try {
                const connectionInfo = {
                    totalConnections: wsManager.getConnectionCount(),
                    channels: Object.entries(config.WS_CHANNELS).map(([key, channel]) => ({
                        name: channel,
                        subscribers: wsManager.getChannelSubscriberCount(channel)
                    })),
                    metrics: wsManager.getMetrics()
                };
                
                res.json(connectionInfo);
            } catch (error) {
                logger.error('Failed to get connection info:', error);
                res.status(500).json({
                    error: 'Failed to get connection info',
                    code: 'CONNECTION_INFO_ERROR'
                });
            }
        });
        
        // Service status endpoint
        this.app.get('/status', (req, res) => {
            res.json({
                service: 'websocket-service',
                version: '1.0.0',
                environment: config.NODE_ENV,
                timestamp: new Date().toISOString(),
                configuration: {
                    maxConnections: config.WEBSOCKET.MAX_CONNECTIONS,
                    heartbeatInterval: config.WEBSOCKET.HEARTBEAT_INTERVAL,
                    rateLimitEnabled: config.SECURITY.ENABLE_RATE_LIMITING,
                    authEnabled: config.SECURITY.ENABLE_AUTH,
                    channels: Object.values(config.WS_CHANNELS),
                    kafkaTopics: Object.values(config.KAFKA_TOPICS)
                }
            });
        });
        
        // Kafka topic publishing endpoint (for testing)
        this.app.post('/publish/:topic', async (req, res) => {
            try {
                const { topic } = req.params;
                const { eventType, userId, data } = req.body;
                
                const streamEvent = {
                    eventId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    eventType: eventType || 'test_event',
                    source: 'websocket-service-api',
                    userId,
                    data,
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                };
                
                await kafkaService.publish(topic, streamEvent);
                
                res.json({
                    success: true,
                    message: 'Event published successfully',
                    eventId: streamEvent.eventId
                });
                
            } catch (error) {
                logger.error('Failed to publish event:', error);
                res.status(500).json({
                    error: 'Failed to publish event',
                    code: 'PUBLISH_ERROR'
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
                    connections: '/connections',
                    status: '/status',
                    publish: '/publish/:topic (POST)'
                }
            });
        });
        
        // Global error handler
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            const statusCode = err.status || err.statusCode || 500;
            const message = err.message || 'Internal server error';
            
            logger.error('HTTP request error', {
                error: message,
                statusCode,
                stack: config.NODE_ENV === 'development' ? err.stack : undefined,
                url: req.url,
                method: req.method
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
            logger.info('🚀 Starting WebSocket service...');
            
            // Initialize Redis connection
            logger.info('🔴 Initializing Redis connection...');
            await initializeRedis();
            
            // Initialize Kafka connection
            logger.info('📡 Initializing Kafka connection...');
            await initializeKafka();
            
            // Start WebSocket server
            logger.info('🔌 Starting WebSocket server...');
            await initializeWebSocketServer();
            
            // Start HTTP server
            this.server = this.app.listen(config.PORT, () => {
                logger.info('✅ WebSocket service started successfully', {
                    httpPort: config.PORT,
                    wsPort: config.WS_PORT,
                    environment: config.NODE_ENV,
                    pid: process.pid,
                    nodeVersion: process.version
                });
                
                logger.info(`🌐 HTTP Health check: http://localhost:${config.PORT}/health`);
                logger.info(`📊 HTTP Metrics: http://localhost:${config.PORT}/metrics`);
                logger.info(`🔌 WebSocket: ws://localhost:${config.WS_PORT}`);
                
                // Log configuration
                wsLogger.connection('service', 'started', {
                    maxConnections: config.WEBSOCKET.MAX_CONNECTIONS,
                    channels: Object.values(config.WS_CHANNELS),
                    kafkaTopics: Object.values(config.KAFKA_TOPICS),
                    authEnabled: config.SECURITY.ENABLE_AUTH,
                    rateLimitEnabled: config.SECURITY.ENABLE_RATE_LIMITING
                });
            });
            
            // Handle server errors
            this.server.on('error', (error: Error) => {
                logger.error('❌ HTTP server error:', error);
            });
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            logger.error('❌ Failed to start WebSocket service:', error);
            process.exit(1);
        }
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
                                logger.error('❌ Error closing HTTP server:', err);
                                reject(err);
                            } else {
                                logger.info('✅ HTTP server closed');
                                resolve();
                            }
                        });
                    });
                }
                
                // Stop WebSocket server
                logger.info('🔌 Stopping WebSocket server...');
                await stopWebSocketServer();
                
                // Close Kafka connection
                logger.info('📡 Closing Kafka connection...');
                await closeKafka();
                
                // Close Redis connection
                logger.info('🔴 Closing Redis connection...');
                await closeRedis();
                
                logger.info('✅ WebSocket service shutdown completed');
                process.exit(0);
                
            } catch (error) {
                logger.error('❌ Error during graceful shutdown:', error);
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
    logger.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('🔥 Unhandled Rejection:', { reason, promise });
    process.exit(1);
});

// Start the service
const service = new WebSocketService();
service.start().catch((error) => {
    logger.error('❌ Failed to start WebSocket service:', error);
    process.exit(1);
});

export { WebSocketService };