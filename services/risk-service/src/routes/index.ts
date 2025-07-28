/**
 * Routes Configuration
 * Main routing setup for Risk Management Service
 */

import { Application } from 'express';
import { healthRouter } from './health';
import { riskRouter } from './risk';
import { complianceRouter } from './compliance';
import { auditRouter } from './audit';
import { alertRouter } from './alerts';
import { metricsRouter } from './metrics';

/**
 * Setup all routes for the application
 */
export const setupRoutes = (app: Application): void => {
    // Health and monitoring routes
    app.use('/health', healthRouter);
    app.use('/metrics', metricsRouter);

    // API routes
    app.use('/api/v1/risk', riskRouter);
    app.use('/api/v1/compliance', complianceRouter);
    app.use('/api/v1/audit', auditRouter);
    app.use('/api/v1/alerts', alertRouter);

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            service: 'Risk Management Service',
            version: '1.0.0',
            status: 'running',
            timestamp: new Date().toISOString(),
            endpoints: {
                health: '/health',
                metrics: '/metrics',
                risk: '/api/v1/risk',
                compliance: '/api/v1/compliance',
                audit: '/api/v1/audit',
                alerts: '/api/v1/alerts'
            }
        });
    });

    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.originalUrl} not found`,
            service: 'risk-management-service'
        });
    });
};