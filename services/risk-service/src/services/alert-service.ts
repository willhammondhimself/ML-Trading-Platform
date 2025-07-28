/**
 * Alert Service for Risk Management
 * 
 * Manages alert generation, delivery, and lifecycle with multiple
 * notification channels and intelligent alert deduplication.
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { db } from '../database/connection';
import { redisService } from './redis-service';
import { kafkaService } from './kafka-service';
import { logger, riskLogger, performanceLogger } from '../utils/logger';
import { addShutdownHandler, trackResource } from '../utils/graceful-shutdown';

interface Alert {
    id: string;
    userId?: string;
    alertType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    message: string;
    source: string;
    symbol?: string;
    thresholdValue?: number;
    actualValue?: number;
    additionalData?: Record<string, any>;
    isAcknowledged: boolean;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
    isResolved: boolean;
    resolvedAt?: string;
    resolvedBy?: string;
    resolutionNotes?: string;
    expiresAt?: string;
    createdAt: string;
}

interface AlertRule {
    ruleId: string;
    alertType: string;
    enabled: boolean;
    cooldownPeriod: number; // milliseconds
    severityThresholds: Record<string, number>;
    notificationChannels: string[];
    autoResolve: boolean;
    autoResolveTimeout: number; // milliseconds
}

interface NotificationChannel {
    channelId: string;
    channelType: 'EMAIL' | 'SMS' | 'SLACK' | 'WEBHOOK';
    enabled: boolean;
    configuration: Record<string, any>;
    severityFilter: string[];
}

class AlertService {
    private isRunning = false;
    private processingQueue: Alert[] = [];
    private processingTimer: NodeJS.Timeout | null = null;
    private alertRules: Map<string, AlertRule> = new Map();
    private notificationChannels: Map<string, NotificationChannel> = new Map();
    private alertCooldowns: Map<string, number> = new Map();
    
    constructor() {
        this.setupShutdownHandler();
        this.initializeAlertRules();
        this.initializeNotificationChannels();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ Alert service is already running');
            return;
        }
        
        logger.info('🚨 Starting alert service...');
        
        this.isRunning = true;
        
        // Start processing timer
        this.startProcessingTimer();
        
        // Start auto-resolution timer
        this.startAutoResolutionTimer();
        
        logger.info('✅ Alert service started successfully');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping alert service...');
        
        this.isRunning = false;
        
        // Stop timers
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
        
        // Process remaining alerts in queue
        if (this.processingQueue.length > 0) {
            logger.info(`🚨 Processing remaining ${this.processingQueue.length} alerts...`);
            await this.processAlertQueue();
        }
        
        logger.info('✅ Alert service stopped');
    }
    
    private initializeAlertRules(): void {
        const defaultRules: AlertRule[] = [
            {
                ruleId: 'RISK_VIOLATION',
                alertType: 'RISK_VIOLATION',
                enabled: true,
                cooldownPeriod: config.MONITORING_CONFIG.ALERT_COOLDOWN_PERIOD,
                severityThresholds: {
                    LOW: 1,
                    MEDIUM: 1,
                    HIGH: 1,
                    CRITICAL: 1
                },
                notificationChannels: ['email', 'webhook'],
                autoResolve: false,
                autoResolveTimeout: 0
            },
            {
                ruleId: 'COMPLIANCE_VIOLATION',
                alertType: 'COMPLIANCE_VIOLATION',
                enabled: true,
                cooldownPeriod: 0, // No cooldown for compliance violations
                severityThresholds: {
                    WARNING: 1,
                    VIOLATION: 1
                },
                notificationChannels: ['email', 'webhook', 'slack'],
                autoResolve: false,
                autoResolveTimeout: 0
            },
            {
                ruleId: 'SYSTEM_HEALTH',
                alertType: 'SYSTEM_HEALTH',
                enabled: true,
                cooldownPeriod: 300000, // 5 minutes
                severityThresholds: {
                    LOW: 5,
                    MEDIUM: 3,
                    HIGH: 1,
                    CRITICAL: 1
                },
                notificationChannels: ['email', 'slack'],
                autoResolve: true,
                autoResolveTimeout: 1800000 // 30 minutes
            },
            {
                ruleId: 'POSITION_LIMIT',
                alertType: 'POSITION_LIMIT',
                enabled: true,
                cooldownPeriod: 60000, // 1 minute
                severityThresholds: {
                    MEDIUM: 1,
                    HIGH: 1,
                    CRITICAL: 1
                },
                notificationChannels: ['email', 'webhook'],
                autoResolve: true,
                autoResolveTimeout: 300000 // 5 minutes
            }
        ];
        
        for (const rule of defaultRules) {
            this.alertRules.set(rule.ruleId, rule);
        }
    }
    
    private initializeNotificationChannels(): void {
        const defaultChannels: NotificationChannel[] = [
            {
                channelId: 'email',
                channelType: 'EMAIL',
                enabled: config.ALERT_CONFIG.EMAIL_ENABLED,
                configuration: {
                    smtpHost: config.ALERT_CONFIG.EMAIL_SMTP_HOST,
                    smtpPort: config.ALERT_CONFIG.EMAIL_SMTP_PORT,
                    username: config.ALERT_CONFIG.EMAIL_USERNAME,
                    password: config.ALERT_CONFIG.EMAIL_PASSWORD
                },
                severityFilter: ['MEDIUM', 'HIGH', 'CRITICAL']
            },
            {
                channelId: 'slack',
                channelType: 'SLACK',
                enabled: config.ALERT_CONFIG.SLACK_ENABLED,
                configuration: {
                    webhookUrl: config.ALERT_CONFIG.SLACK_WEBHOOK_URL
                },
                severityFilter: ['HIGH', 'CRITICAL']
            },
            {
                channelId: 'webhook',
                channelType: 'WEBHOOK',
                enabled: config.ALERT_CONFIG.WEBHOOK_ENABLED,
                configuration: {
                    url: config.ALERT_CONFIG.ALERT_WEBHOOK_URL
                },
                severityFilter: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
            }
        ];
        
        for (const channel of defaultChannels) {
            this.notificationChannels.set(channel.channelId, channel);
        }
    }
    
    async createAlert(
        alertType: string,
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        title: string,
        message: string,
        options: {
            userId?: string;
            symbol?: string;
            thresholdValue?: number;
            actualValue?: number;
            additionalData?: Record<string, any>;
            expiresIn?: number; // milliseconds
        } = {}
    ): Promise<string> {
        try {
            const alertId = uuidv4();
            const now = new Date();
            
            const alert: Alert = {
                id: alertId,
                userId: options.userId,
                alertType,
                severity,
                title,
                message,
                source: 'risk-service',
                symbol: options.symbol,
                thresholdValue: options.thresholdValue,
                actualValue: options.actualValue,
                additionalData: options.additionalData,
                isAcknowledged: false,
                isResolved: false,
                expiresAt: options.expiresIn ? 
                    new Date(now.getTime() + options.expiresIn).toISOString() : 
                    undefined,
                createdAt: now.toISOString()
            };
            
            // Check cooldown period
            if (await this.isInCooldown(alertType, options.userId)) {
                logger.debug('🔄 Alert suppressed due to cooldown', {
                    alertType,
                    userId: options.userId,
                    severity
                });
                return alertId;
            }
            
            // Add to processing queue
            this.processingQueue.push(alert);
            
            // Update cooldown
            await this.updateCooldown(alertType, options.userId);
            
            logger.info('🚨 Alert created', {
                alertId: alert.id,
                alertType,
                severity,
                userId: options.userId,
                symbol: options.symbol
            });
            
            return alertId;
            
        } catch (error) {
            logger.error('❌ Error creating alert:', error);
            throw error;
        }
    }
    
    async createRiskAlert(
        userId: string,
        alertType: string,
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        message: string,
        details: Record<string, any>
    ): Promise<string> {
        return await this.createAlert(
            'RISK_VIOLATION',
            severity,
            `Risk Alert: ${alertType}`,
            message,
            {
                userId,
                symbol: details.symbol,
                thresholdValue: details.thresholdValue,
                actualValue: details.actualValue,
                additionalData: {
                    alertType,
                    ...details
                }
            }
        );
    }
    
    async createComplianceAlert(
        userId: string,
        alertType: string,
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        message: string,
        details: Record<string, any>
    ): Promise<string> {
        return await this.createAlert(
            'COMPLIANCE_VIOLATION',
            severity,
            `Compliance Alert: ${alertType}`,
            message,
            {
                userId,
                symbol: details.symbol,
                additionalData: {
                    alertType,
                    regulation: details.regulation,
                    tradeValue: details.tradeValue,
                    ...details
                }
            }
        );
    }
    
    async createSystemAlert(
        alertType: string,
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        message: string,
        details: Record<string, any>
    ): Promise<string> {
        return await this.createAlert(
            'SYSTEM_HEALTH',
            severity,
            `System Alert: ${alertType}`,
            message,
            {
                additionalData: {
                    alertType,
                    ...details
                }
            }
        );
    }
    
    private async isInCooldown(alertType: string, userId?: string): Promise<boolean> {
        try {
            const rule = this.alertRules.get(alertType);
            if (!rule || rule.cooldownPeriod === 0) {
                return false;
            }
            
            const cooldownKey = `${alertType}:${userId || 'system'}`;
            const lastAlertTime = this.alertCooldowns.get(cooldownKey);
            
            if (!lastAlertTime) {
                return false;
            }
            
            const now = Date.now();
            return (now - lastAlertTime) < rule.cooldownPeriod;
            
        } catch (error) {
            logger.error('❌ Error checking alert cooldown:', error);
            return false;
        }
    }
    
    private async updateCooldown(alertType: string, userId?: string): Promise<void> {
        try {
            const cooldownKey = `${alertType}:${userId || 'system'}`;
            this.alertCooldowns.set(cooldownKey, Date.now());
            
            // Also store in Redis for persistence across restarts
            await redisService.set(
                `alert_cooldown:${cooldownKey}`,
                Date.now().toString(),
                Math.floor(config.MONITORING_CONFIG.ALERT_COOLDOWN_PERIOD / 1000)
            );
            
        } catch (error) {
            logger.error('❌ Error updating alert cooldown:', error);
        }
    }
    
    private startProcessingTimer(): void {
        this.processingTimer = setTimeout(async () => {
            if (this.isRunning && this.processingQueue.length > 0) {
                await this.processAlertQueue();
            }
            
            if (this.isRunning) {
                this.startProcessingTimer();
            }
        }, 1000); // Process every second
    }
    
    private async processAlertQueue(): Promise<void> {
        if (this.processingQueue.length === 0) {
            return;
        }
        
        const untrack = trackResource('alert_processing');
        
        try {
            const timer = performanceLogger.time('alert_processing');
            const alertsToProcess = this.processingQueue.splice(0, 10); // Process up to 10 alerts at once
            
            // Process alerts in parallel
            const promises = alertsToProcess.map(alert => this.processAlert(alert));
            await Promise.allSettled(promises);
            
            timer.end();
            
            logger.debug('🚨 Processed alert batch', {
                alertsProcessed: alertsToProcess.length,
                remainingInQueue: this.processingQueue.length
            });
            
        } catch (error) {
            logger.error('❌ Error processing alert queue:', error);
        } finally {
            untrack();
        }
    }
    
    private async processAlert(alert: Alert): Promise<void> {
        try {
            // Store alert in database
            await this.storeAlert(alert);
            
            // Cache active alert
            await redisService.trackActiveAlert(alert.id);
            
            // Send notifications
            await this.sendNotifications(alert);
            
            // Publish to Kafka
            await kafkaService.publishRiskAlert(
                alert.userId || 'system',
                alert.alertType,
                alert.severity,
                alert
            );
            
            riskLogger.alert(alert.alertType, alert.severity, {
                alertId: alert.id,
                userId: alert.userId,
                symbol: alert.symbol,
                thresholdValue: alert.thresholdValue,
                actualValue: alert.actualValue
            });
            
        } catch (error) {
            logger.error(`❌ Error processing alert ${alert.id}:`, error);
        }
    }
    
    private async storeAlert(alert: Alert): Promise<void> {
        try {
            const query = `
                INSERT INTO risk_alerts (
                    id,
                    user_id,
                    alert_type,
                    severity,
                    title,
                    message,
                    source,
                    symbol,
                    threshold_value,
                    actual_value,
                    additional_data,
                    expires_at,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `;
            
            await db.query(query, [
                alert.id,
                alert.userId,
                alert.alertType,
                alert.severity,
                alert.title,
                alert.message,
                alert.source,
                alert.symbol,
                alert.thresholdValue,
                alert.actualValue,
                alert.additionalData ? JSON.stringify(alert.additionalData) : null,
                alert.expiresAt,
                alert.createdAt
            ]);
            
        } catch (error) {
            logger.error('❌ Error storing alert:', error);
            throw error;
        }
    }
    
    private async sendNotifications(alert: Alert): Promise<void> {
        try {
            const rule = this.alertRules.get(alert.alertType);
            if (!rule || !rule.enabled) {
                return;
            }
            
            // Get applicable notification channels
            const channels = rule.notificationChannels
                .map(channelId => this.notificationChannels.get(channelId))
                .filter(channel => 
                    channel && 
                    channel.enabled && 
                    channel.severityFilter.includes(alert.severity)
                );
            
            // Send notifications to each channel
            const promises = channels.map(channel => 
                this.sendNotification(channel!, alert).catch(error => {
                    logger.error(`❌ Error sending notification via ${channel!.channelType}:`, error);
                })
            );
            
            await Promise.allSettled(promises);
            
        } catch (error) {
            logger.error('❌ Error sending notifications:', error);
        }
    }
    
    private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
        try {
            switch (channel.channelType) {
                case 'EMAIL':
                    await this.sendEmailNotification(channel, alert);
                    break;
                case 'SLACK':
                    await this.sendSlackNotification(channel, alert);
                    break;
                case 'WEBHOOK':
                    await this.sendWebhookNotification(channel, alert);
                    break;
                case 'SMS':
                    await this.sendSMSNotification(channel, alert);
                    break;
            }
            
            logger.debug(`📧 Notification sent via ${channel.channelType}`, {
                alertId: alert.id,
                channelId: channel.channelId,
                severity: alert.severity
            });
            
        } catch (error) {
            logger.error(`❌ Error sending ${channel.channelType} notification:`, error);
        }
    }
    
    private async sendEmailNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
        // Email notification implementation would go here
        // For now, just log the notification
        logger.info('📧 Email notification (mock)', {
            alertId: alert.id,
            title: alert.title,
            severity: alert.severity
        });
    }
    
    private async sendSlackNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
        // Slack notification implementation would go here
        // For now, just log the notification
        logger.info('💬 Slack notification (mock)', {
            alertId: alert.id,
            title: alert.title,
            severity: alert.severity
        });
    }
    
    private async sendWebhookNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
        // Webhook notification implementation would go here
        // For now, just log the notification
        logger.info('🔗 Webhook notification (mock)', {
            alertId: alert.id,
            title: alert.title,
            severity: alert.severity,
            webhookUrl: channel.configuration.url
        });
    }
    
    private async sendSMSNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
        // SMS notification implementation would go here
        // For now, just log the notification
        logger.info('📱 SMS notification (mock)', {
            alertId: alert.id,
            title: alert.title,
            severity: alert.severity
        });
    }
    
    private startAutoResolutionTimer(): void {
        setInterval(async () => {
            if (this.isRunning) {
                await this.autoResolveAlerts();
            }
        }, 60000); // Check every minute
    }
    
    private async autoResolveAlerts(): Promise<void> {
        try {
            const query = `
                UPDATE risk_alerts
                SET is_resolved = true, resolved_at = NOW(), resolved_by = 'system'
                WHERE is_resolved = false
                AND expires_at IS NOT NULL
                AND expires_at < NOW()
            `;
            
            const result = await db.query(query);
            
            if (result.length > 0) {
                logger.info(`🔄 Auto-resolved ${result.length} expired alerts`);
            }
            
        } catch (error) {
            logger.error('❌ Error auto-resolving alerts:', error);
        }
    }
    
    // Public API methods
    async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
        try {
            const query = `
                UPDATE risk_alerts
                SET is_acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
                WHERE id = $1 AND is_acknowledged = false
            `;
            
            const result = await db.query(query, [alertId, acknowledgedBy]);
            
            if (result.length > 0) {
                logger.info('✅ Alert acknowledged', {
                    alertId,
                    acknowledgedBy
                });
                return true;
            }
            
            return false;
            
        } catch (error) {
            logger.error(`❌ Error acknowledging alert ${alertId}:`, error);
            return false;
        }
    }
    
    async resolveAlert(alertId: string, resolvedBy: string, resolutionNotes?: string): Promise<boolean> {
        try {
            const query = `
                UPDATE risk_alerts
                SET is_resolved = true, resolved_at = NOW(), resolved_by = $2, resolution_notes = $3
                WHERE id = $1 AND is_resolved = false
            `;
            
            const result = await db.query(query, [alertId, resolvedBy, resolutionNotes]);
            
            if (result.length > 0) {
                // Remove from active alerts cache
                await redisService.removeActiveAlert(alertId);
                
                logger.info('✅ Alert resolved', {
                    alertId,
                    resolvedBy,
                    resolutionNotes
                });
                return true;
            }
            
            return false;
            
        } catch (error) {
            logger.error(`❌ Error resolving alert ${alertId}:`, error);
            return false;
        }
    }
    
    async getAlerts(
        userId?: string,
        severity?: string,
        resolved?: boolean,
        limit: number = 100
    ): Promise<Alert[]> {
        try {
            let query = 'SELECT * FROM risk_alerts WHERE 1=1';
            const params: any[] = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND user_id = $${paramIndex}`;
                params.push(userId);
                paramIndex++;
            }
            
            if (severity) {
                query += ` AND severity = $${paramIndex}`;
                params.push(severity);
                paramIndex++;
            }
            
            if (resolved !== undefined) {
                query += ` AND is_resolved = $${paramIndex}`;
                params.push(resolved);
                paramIndex++;
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
            params.push(limit);
            
            const result = await db.query<any>(query, params);
            
            return result.map(row => ({
                id: row.id,
                userId: row.user_id,
                alertType: row.alert_type,
                severity: row.severity,
                title: row.title,
                message: row.message,
                source: row.source,
                symbol: row.symbol,
                thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : undefined,
                actualValue: row.actual_value ? parseFloat(row.actual_value) : undefined,
                additionalData: row.additional_data ? JSON.parse(row.additional_data) : undefined,
                isAcknowledged: row.is_acknowledged,
                acknowledgedAt: row.acknowledged_at,
                acknowledgedBy: row.acknowledged_by,
                isResolved: row.is_resolved,
                resolvedAt: row.resolved_at,
                resolvedBy: row.resolved_by,
                resolutionNotes: row.resolution_notes,
                expiresAt: row.expires_at,
                createdAt: row.created_at
            }));
            
        } catch (error) {
            logger.error('❌ Error getting alerts:', error);
            return [];
        }
    }
    
    async getAlert(alertId: string): Promise<Alert | null> {
        try {
            const alerts = await this.getAlerts(undefined, undefined, undefined, 1);
            return alerts.find(alert => alert.id === alertId) || null;
            
        } catch (error) {
            logger.error(`❌ Error getting alert ${alertId}:`, error);
            return null;
        }
    }
    
    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.stop();
        });
    }
    
    get isActive(): boolean {
        return this.isRunning;
    }
    
    get queueSize(): number {
        return this.processingQueue.length;
    }
}

// Global alert service instance
export const alertService = new AlertService();