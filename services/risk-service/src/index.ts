/**
 * Risk Management Service
 * 
 * Enterprise-grade risk management service for ML trading platform featuring:
 * - Real-time position and portfolio risk monitoring
 * - Compliance tracking and regulatory reporting
 * - Risk limits and alert management
 * - Audit trails for all trading activities
 * - Advanced risk metrics calculation (VaR, drawdown, exposure)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase } from './database/connection';
import { initializeRedis } from './services/redis-service';
import { initializeKafka } from './services/kafka-service';
import { setupRoutes } from './routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { riskMonitor } from './services/risk-monitor';
import { complianceMonitor } from './services/compliance-monitor';
import { auditTrailService } from './services/audit-trail-service';
import { alertService } from './services/alert-service';
import { gracefulShutdown } from './utils/graceful-shutdown';

class RiskManagementServer {
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
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));
        
        // CORS configuration
        this.app.use(cors({
            origin: config.CORS_ORIGINS,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        
        // Compression and parsing
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Request logging
        this.app.use(requestLogger);
    }
    
    private setupRoutes(): void {
        setupRoutes(this.app);
    }
    
    private setupErrorHandling(): void {
        this.app.use(errorHandler);
    }
    
    async start(): Promise<void> {
        try {
            logger.info('🚀 Starting Risk Management Service...');
            
            // Initialize database connection
            logger.info('📊 Connecting to database...');
            await connectDatabase();
            
            // Initialize Redis connection
            logger.info('🔴 Initializing Redis...');
            await initializeRedis();
            
            // Initialize Kafka connection
            logger.info('📨 Initializing Kafka...');
            await initializeKafka();
            
            // Start real-time monitoring services
            logger.info('📈 Starting risk monitoring...');
            await riskMonitor.start();
            
            logger.info('📋 Starting compliance monitoring...');
            await complianceMonitor.start();
            
            logger.info('📝 Starting audit trail service...');
            await auditTrailService.start();
            
            logger.info('🚨 Starting alert service...');
            await alertService.start();
            
            // Start HTTP server
            this.server = createServer(this.app);
            
            this.server.listen(config.PORT, () => {
                logger.info(`✅ Risk Management Service running on port ${config.PORT}`);
                logger.info(`🌐 Environment: ${config.NODE_ENV}`);
                logger.info(`🔧 Debug mode: ${config.DEBUG}`);
                logger.info(`📖 API Documentation: http://localhost:${config.PORT}/docs`);
            });
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            logger.error('❌ Failed to start Risk Management Service:', error);
            process.exit(1);
        }
    }
    
    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
            
            try {
                // Stop accepting new connections
                this.server.close(() => {
                    logger.info('🔌 HTTP server closed');
                });
                
                // Stop monitoring services
                await riskMonitor.stop();
                await complianceMonitor.stop();
                await auditTrailService.stop();
                await alertService.stop();
                
                logger.info('✅ Risk Management Service shutdown complete');
                process.exit(0);
            } catch (error) {
                logger.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };
        
        gracefulShutdown(shutdown);
    }
}

// Start the server
const server = new RiskManagementServer();
server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});

export { RiskManagementServer };