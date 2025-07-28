/**
 * API Gateway Service
 * 
 * Enterprise-grade API gateway for ML trading platform featuring:
 * - Centralized routing and service discovery
 * - JWT authentication and authorization
 * - Advanced rate limiting and DDoS protection
 * - Request/response transformation
 * - Load balancing and circuit breaker patterns
 * - Comprehensive monitoring and observability
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger, addRequestId, gatewayLogger } from './utils/logger';
import { gracefulShutdown } from './utils/graceful-shutdown';
import { initializeDatabase, closeDatabase } from './database/connection';
import { initializeRedis, closeRedis } from './services/redis-service';
import { serviceDiscovery } from './services/service-discovery';
import routes from './routes';

class APIGatewayServer {
    private app: express.Application;
    private server: any;
    
    constructor() {
        this.app = express();
        this.setupCoreMiddleware();
        this.setupCustomMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    private setupCoreMiddleware(): void {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:"],
                }
            },
            hsts: config.SECURITY.ENABLE_HSTS ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            } : false,
            crossOriginEmbedderPolicy: false // Allow WebSocket connections
        }));
        
        // CORS configuration
        this.app.use(cors({
            origin: config.CORS_ORIGINS,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
                'X-API-Key',
                'X-Request-ID',
                'X-Correlation-ID'
            ],
            exposedHeaders: [
                'X-Request-ID',
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset',
                'X-RateLimit-Window'
            ]
        }));
        
        // Request parsing middleware
        this.app.use(express.json({ 
            limit: config.SECURITY.BODY_PARSER_LIMIT,
            strict: true,
            verify: (req: any, res, buf) => {
                req.rawBody = buf;
            }
        }));
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: config.SECURITY.BODY_PARSER_LIMIT 
        }));
        
        // Compression
        this.app.use(compression({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            },
            threshold: 1024 // Only compress responses > 1KB
        }));
        
        // Request ID and logging middleware
        this.app.use(addRequestId);
        
        // Trust proxy for accurate IP addresses
        if (config.SECURITY.TRUSTED_PROXIES.length > 0) {
            this.app.set('trust proxy', config.SECURITY.TRUSTED_PROXIES);
        }
    }
    
    private setupCustomMiddleware(): void {
        // Request timeout
        this.app.use((req, res, next) => {
            req.setTimeout(config.SECURITY.REQUEST_TIMEOUT, () => {
                const error = new Error('Request timeout');
                (error as any).status = 408;
                next(error);
            });
            next();
        });
        
        // Request/Response logging and performance tracking
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            
            // Log request start
            logger.debug('Request started', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            });
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                
                // Log request completion using gateway logger
                gatewayLogger.request(
                    req.method,
                    req.url,
                    res.statusCode,
                    duration,
                    req.auth?.userId,
                    req.requestId
                );
                
                // Set response time header
                res.set('X-Response-Time', `${duration}ms`);
            });
            
            next();
        });
    }
    
    private setupRoutes(): void {
        // Use main routes
        this.app.use('/', routes);
    }
    
    private setupErrorHandling(): void {
        // Global error handler
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            const statusCode = err.status || err.statusCode || 500;
            const message = err.message || 'Internal server error';
            
            logger.error('Request error', {
                error: message,
                statusCode,
                stack: config.NODE_ENV === 'development' ? err.stack : undefined,
                url: req.url,
                method: req.method,
                requestId: req.requestId,
                userId: req.auth?.userId
            });
            
            // Don't expose internal errors in production
            const responseMessage = statusCode >= 500 && config.NODE_ENV === 'production' 
                ? 'Internal server error' 
                : message;
            
            res.status(statusCode).json({
                error: responseMessage,
                code: err.code || 'INTERNAL_ERROR',
                timestamp: new Date().toISOString(),
                requestId: req.requestId
            });
        });
    }
    
    async start(): Promise<void> {
        try {
            logger.info('🚀 Starting API Gateway server...');
            
            // Initialize database connection
            logger.info('📊 Initializing database connection...');
            await initializeDatabase();
            
            // Initialize Redis connection
            logger.info('🔴 Initializing Redis connection...');
            await initializeRedis();
            
            // Start service discovery
            logger.info('🔍 Starting service discovery...');
            await serviceDiscovery.start();
            
            // Start HTTP server
            this.server = this.app.listen(config.PORT, () => {
                logger.info('✅ API Gateway server started successfully', {
                    port: config.PORT,
                    environment: config.NODE_ENV,
                    pid: process.pid,
                    nodeVersion: process.version
                });
                
                logger.info(`🌐 Health check: http://localhost:${config.PORT}/health`);
                logger.info(`📊 Metrics: http://localhost:${config.PORT}/metrics`);
                logger.info(`📋 API Documentation: http://localhost:${config.PORT}/api/v1`);
            });
            
            // Handle server errors
            this.server.on('error', (error: Error) => {
                logger.error('❌ Server error:', error);
            });
            
            // Setup graceful shutdown
            gracefulShutdown(async (signal) => {
                logger.info(`🛑 Shutting down API Gateway server (${signal})...`);
                
                // Stop accepting new connections
                if (this.server) {
                    await new Promise<void>((resolve, reject) => {
                        this.server.close((err?: Error) => {
                            if (err) {
                                logger.error('❌ Error closing server:', err);
                                reject(err);
                            } else {
                                logger.info('✅ HTTP server closed');
                                resolve();
                            }
                        });
                    });
                }
                
                // Stop service discovery
                logger.info('🛑 Stopping service discovery...');
                await serviceDiscovery.stop();
                
                // Close Redis connection
                logger.info('🔌 Closing Redis connection...');
                await closeRedis();
                
                // Close database connection
                logger.info('🔌 Closing database connection...');
                await closeDatabase();
                
                logger.info('✅ API Gateway shutdown completed');
            });
            
        } catch (error) {
            logger.error('❌ Failed to start API Gateway server:', error);
            process.exit(1);
        }
    }
}

// Global exception handlers (last resort)
process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('🔥 Unhandled Rejection:', { reason, promise });
    process.exit(1);
});

// Start the server
const gateway = new APIGatewayServer();
gateway.start().catch((error) => {
    logger.error('❌ Failed to start API Gateway:', error);
    process.exit(1);
});

export { APIGatewayServer };