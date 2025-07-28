/**
 * Compliance Monitoring Service
 * 
 * Real-time compliance monitoring for regulatory requirements,
 * trade surveillance, and automated reporting with comprehensive
 * rule engine and violation detection.
 */

import { Decimal } from 'decimal.js';
import { config } from '../config';
import { db } from '../database/connection';
import { redisService } from './redis-service';
import { kafkaService } from './kafka-service';
import { alertService } from './alert-service';
import { logger, riskLogger, performanceLogger } from '../utils/logger';
import { addShutdownHandler, trackResource } from '../utils/graceful-shutdown';

interface TradeData {
    tradeId: string;
    userId: string;
    symbol: string;
    quantity: number;
    price: number;
    value: number;
    side: 'BUY' | 'SELL';
    timestamp: string;
    orderId?: string;
}

interface ComplianceRule {
    ruleId: string;
    ruleName: string;
    ruleType: string;
    description: string;
    parameters: Record<string, any>;
    severity: 'INFO' | 'WARNING' | 'VIOLATION';
    isActive: boolean;
}

interface ComplianceEvent {
    eventId: string;
    userId: string;
    eventType: string;
    eventCategory: string;
    description: string;
    regulation?: string;
    severity: 'INFO' | 'WARNING' | 'VIOLATION';
    tradeId?: string;
    positionId?: string;
    orderId?: string;
    symbol?: string;
    tradeValue?: number;
    additionalData?: Record<string, any>;
    occurredAt: string;
}

interface UserTradingProfile {
    userId: string;
    accountType: string;
    riskTolerance: string;
    jurisdictions: string[];
    complianceLevel: string;
    kycStatus: string;
    amlStatus: string;
    isAccreditedInvestor: boolean;
    tradingLimits: Record<string, any>;
}

class ComplianceMonitoringService {
    private isRunning = false;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private complianceRules: Map<string, ComplianceRule> = new Map();
    private processingEvents = new Set<string>();
    
    constructor() {
        this.setupShutdownHandler();
        this.initializeComplianceRules();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ Compliance monitoring service is already running');
            return;
        }
        
        logger.info('📋 Starting compliance monitoring...');
        
        this.isRunning = true;
        
        // Load compliance rules from database
        await this.loadComplianceRules();
        
        // Start periodic compliance monitoring
        this.monitoringInterval = setInterval(
            () => this.performComplianceMonitoring(),
            config.MONITORING_CONFIG.COMPLIANCE_CHECK_INTERVAL
        );
        
        // Perform initial compliance check
        await this.performComplianceMonitoring();
        
        logger.info('✅ Compliance monitoring service started successfully');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping compliance monitoring service...');
        
        this.isRunning = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        // Wait for ongoing processing to complete
        while (this.processingEvents.size > 0) {
            logger.info(`⏳ Waiting for ${this.processingEvents.size} compliance events to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        logger.info('✅ Compliance monitoring service stopped');
    }
    
    private initializeComplianceRules(): void {
        // Define default compliance rules
        const defaultRules: ComplianceRule[] = [
            {
                ruleId: 'LARGE_TRADE_THRESHOLD',
                ruleName: 'Large Trade Reporting',
                ruleType: 'TRADE_SURVEILLANCE',
                description: 'Monitor trades exceeding large trade threshold',
                parameters: {
                    threshold: config.COMPLIANCE_CONFIG.LARGE_TRADE_THRESHOLD,
                    currencies: ['USD']
                },
                severity: 'WARNING',
                isActive: config.COMPLIANCE_CONFIG.TRADE_REPORTING_ENABLED
            },
            {
                ruleId: 'SUSPICIOUS_ACTIVITY',
                ruleName: 'Suspicious Activity Detection',
                ruleType: 'AML_MONITORING',
                description: 'Detect potentially suspicious trading patterns',
                parameters: {
                    threshold: config.COMPLIANCE_CONFIG.SUSPICIOUS_ACTIVITY_THRESHOLD,
                    timeWindow: 3600000, // 1 hour in milliseconds
                    maxTrades: 100
                },
                severity: 'VIOLATION',
                isActive: config.COMPLIANCE_CONFIG.AML_MONITORING_ENABLED
            },
            {
                ruleId: 'HIGH_FREQUENCY_TRADING',
                ruleName: 'High Frequency Trading Detection',
                ruleType: 'TRADE_SURVEILLANCE',
                description: 'Monitor high frequency trading patterns',
                parameters: {
                    threshold: config.COMPLIANCE_CONFIG.HIGH_FREQUENCY_THRESHOLD,
                    timeWindow: 3600000 // 1 hour
                },
                severity: 'INFO',
                isActive: true
            },
            {
                ruleId: 'POSITION_LIMIT_MONITORING',
                ruleName: 'Position Limit Compliance',
                ruleType: 'POSITION_LIMITS',
                description: 'Monitor compliance with position limits',
                parameters: {
                    enabled: config.COMPLIANCE_CONFIG.POSITION_LIMIT_MONITORING
                },
                severity: 'VIOLATION',
                isActive: config.COMPLIANCE_CONFIG.POSITION_LIMIT_MONITORING
            },
            {
                ruleId: 'WASH_TRADING_DETECTION',
                ruleName: 'Wash Trading Detection',
                ruleType: 'MARKET_MANIPULATION',
                description: 'Detect potential wash trading patterns',
                parameters: {
                    lookbackPeriod: 300000, // 5 minutes
                    priceTolerancePercent: 0.01 // 1%
                },
                severity: 'VIOLATION',
                isActive: true
            },
            {
                ruleId: 'FRONT_RUNNING_DETECTION',
                ruleName: 'Front Running Detection',
                ruleType: 'MARKET_MANIPULATION',
                description: 'Detect potential front running patterns',
                parameters: {
                    timeWindow: 60000, // 1 minute
                    volumeThreshold: 10000
                },
                severity: 'VIOLATION',
                isActive: true
            }
        ];
        
        // Load rules into memory
        for (const rule of defaultRules) {
            this.complianceRules.set(rule.ruleId, rule);
        }
    }
    
    private async loadComplianceRules(): Promise<void> {
        try {
            // In a real implementation, this would load custom rules from database
            logger.info(`📋 Loaded ${this.complianceRules.size} compliance rules`);
        } catch (error) {
            logger.error('❌ Error loading compliance rules:', error);
        }
    }
    
    private async performComplianceMonitoring(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        const timer = performanceLogger.time('compliance_monitoring_cycle');
        
        try {
            // Get recent trades for analysis
            const recentTrades = await this.getRecentTrades();
            
            // Get active users for monitoring
            const activeUsers = await this.getActiveUsers();
            
            logger.debug('🔍 Starting compliance monitoring cycle', {
                recentTradesCount: recentTrades.length,
                activeUserCount: activeUsers.length
            });
            
            // Process trades against compliance rules
            const tradePromises = recentTrades.map(trade => 
                this.analyzeTrade(trade).catch(error => {
                    logger.error(`❌ Error analyzing trade ${trade.tradeId}:`, error);
                })
            );
            
            // Process user compliance checks
            const userPromises = activeUsers.map(userId => 
                this.checkUserCompliance(userId).catch(error => {
                    logger.error(`❌ Error checking compliance for user ${userId}:`, error);
                })
            );
            
            await Promise.all([...tradePromises, ...userPromises]);
            
            riskLogger.monitoring('compliance_cycle', 'completed', {
                tradesAnalyzed: recentTrades.length,
                usersChecked: activeUsers.length,
                duration: timer.end()
            });
            
        } catch (error) {
            logger.error('❌ Error in compliance monitoring cycle:', error);
            timer.end();
        }
    }
    
    private async getRecentTrades(): Promise<TradeData[]> {
        try {
            // This would typically fetch from the trading service via API or database
            // For now, we'll simulate getting recent trades
            
            const cachedTrades = await redisService.lrange('recent_trades', 0, 100);
            
            return cachedTrades.map(tradeStr => {
                try {
                    return JSON.parse(tradeStr);
                } catch {
                    return null;
                }
            }).filter(Boolean);
            
        } catch (error) {
            logger.error('❌ Error getting recent trades:', error);
            return [];
        }
    }
    
    private async getActiveUsers(): Promise<string[]> {
        try {
            const query = `
                SELECT DISTINCT user_id
                FROM compliance_events
                WHERE occurred_at > NOW() - INTERVAL '1 hour'
                UNION
                SELECT DISTINCT user_id
                FROM risk_violations
                WHERE detected_at > NOW() - INTERVAL '1 hour'
            `;
            
            const result = await db.query<{ user_id: string }>(query);
            return result.map(row => row.user_id);
            
        } catch (error) {
            logger.error('❌ Error getting active users:', error);
            return [];
        }
    }
    
    private async analyzeTrade(trade: TradeData): Promise<void> {
        const eventId = `trade_analysis_${trade.tradeId}`;
        
        if (this.processingEvents.has(eventId)) {
            return;
        }
        
        const untrack = trackResource(`compliance_analysis:${eventId}`);
        this.processingEvents.add(eventId);
        
        try {
            // Get user trading profile
            const userProfile = await this.getUserTradingProfile(trade.userId);
            
            // Apply each compliance rule
            for (const rule of this.complianceRules.values()) {
                if (!rule.isActive) continue;
                
                await this.applyComplianceRule(rule, trade, userProfile);
            }
            
        } catch (error) {
            logger.error(`❌ Error analyzing trade ${trade.tradeId}:`, error);
        } finally {
            this.processingEvents.delete(eventId);
            untrack();
        }
    }
    
    private async applyComplianceRule(
        rule: ComplianceRule,
        trade: TradeData,
        userProfile: UserTradingProfile | null
    ): Promise<void> {
        try {
            let violation = false;
            let eventData: Partial<ComplianceEvent> = {};
            
            switch (rule.ruleId) {
                case 'LARGE_TRADE_THRESHOLD':
                    violation = trade.value >= rule.parameters.threshold;
                    if (violation) {
                        eventData = {
                            eventType: 'LARGE_TRADE',
                            eventCategory: 'TRADE_SURVEILLANCE',
                            description: `Large trade detected: ${trade.value} exceeds threshold ${rule.parameters.threshold}`,
                            regulation: 'MiFID II',
                            tradeValue: trade.value
                        };
                    }
                    break;
                    
                case 'SUSPICIOUS_ACTIVITY':
                    violation = await this.checkSuspiciousActivity(trade, rule.parameters);
                    if (violation) {
                        eventData = {
                            eventType: 'SUSPICIOUS_ACTIVITY',
                            eventCategory: 'AML_MONITORING',
                            description: 'Suspicious trading activity detected',
                            regulation: 'AML/CTF',
                            tradeValue: trade.value
                        };
                    }
                    break;
                    
                case 'HIGH_FREQUENCY_TRADING':
                    violation = await this.checkHighFrequencyTrading(trade, rule.parameters);
                    if (violation) {
                        eventData = {
                            eventType: 'HIGH_FREQUENCY_TRADING',
                            eventCategory: 'TRADE_SURVEILLANCE',
                            description: 'High frequency trading pattern detected',
                            tradeValue: trade.value
                        };
                    }
                    break;
                    
                case 'WASH_TRADING_DETECTION':
                    violation = await this.checkWashTrading(trade, rule.parameters);
                    if (violation) {
                        eventData = {
                            eventType: 'WASH_TRADING',
                            eventCategory: 'MARKET_MANIPULATION',
                            description: 'Potential wash trading detected',
                            regulation: 'Market Abuse Regulation',
                            tradeValue: trade.value
                        };
                    }
                    break;
                    
                case 'FRONT_RUNNING_DETECTION':
                    violation = await this.checkFrontRunning(trade, rule.parameters);
                    if (violation) {
                        eventData = {
                            eventType: 'FRONT_RUNNING',
                            eventCategory: 'MARKET_MANIPULATION',
                            description: 'Potential front running detected',
                            regulation: 'Market Abuse Regulation',
                            tradeValue: trade.value
                        };
                    }
                    break;
            }
            
            if (violation) {
                const complianceEvent: ComplianceEvent = {
                    eventId: `${rule.ruleId}_${trade.tradeId}_${Date.now()}`,
                    userId: trade.userId,
                    severity: rule.severity,
                    tradeId: trade.tradeId,
                    symbol: trade.symbol,
                    occurredAt: new Date().toISOString(),
                    additionalData: {
                        ruleId: rule.ruleId,
                        ruleName: rule.ruleName,
                        tradeData: trade
                    },
                    ...eventData
                } as ComplianceEvent;
                
                await this.processComplianceEvent(complianceEvent);
            }
            
        } catch (error) {
            logger.error(`❌ Error applying compliance rule ${rule.ruleId}:`, error);
        }
    }
    
    private async checkSuspiciousActivity(trade: TradeData, parameters: any): Promise<boolean> {
        try {
            // Check if user has made too many large trades in the time window
            const timeWindow = parameters.timeWindow;
            const threshold = parameters.threshold;
            const maxTrades = parameters.maxTrades;
            
            const recentTrades = await this.getUserRecentTrades(trade.userId, timeWindow);
            
            // Check for suspicious patterns
            const largeTrades = recentTrades.filter(t => t.value >= threshold);
            const totalValue = recentTrades.reduce((sum, t) => sum + t.value, 0);
            
            return largeTrades.length >= maxTrades || totalValue >= threshold * 5;
            
        } catch (error) {
            logger.error('❌ Error checking suspicious activity:', error);
            return false;
        }
    }
    
    private async checkHighFrequencyTrading(trade: TradeData, parameters: any): Promise<boolean> {
        try {
            const timeWindow = parameters.timeWindow;
            const threshold = parameters.threshold;
            
            const recentTrades = await this.getUserRecentTrades(trade.userId, timeWindow);
            
            return recentTrades.length >= threshold;
            
        } catch (error) {
            logger.error('❌ Error checking high frequency trading:', error);
            return false;
        }
    }
    
    private async checkWashTrading(trade: TradeData, parameters: any): Promise<boolean> {
        try {
            const lookbackPeriod = parameters.lookbackPeriod;
            const priceTolerancePercent = parameters.priceTolerancePercent;
            
            // Get recent opposite trades for the same symbol
            const recentTrades = await this.getUserRecentTrades(trade.userId, lookbackPeriod);
            const oppositeTrades = recentTrades.filter(t => 
                t.symbol === trade.symbol && 
                t.side !== trade.side &&
                Math.abs(t.quantity) === Math.abs(trade.quantity)
            );
            
            // Check if there are trades at similar prices
            return oppositeTrades.some(t => {
                const priceDiff = Math.abs(t.price - trade.price) / trade.price;
                return priceDiff <= priceTolerancePercent;
            });
            
        } catch (error) {
            logger.error('❌ Error checking wash trading:', error);
            return false;
        }
    }
    
    private async checkFrontRunning(trade: TradeData, parameters: any): Promise<boolean> {
        try {
            // This would implement sophisticated front running detection
            // For now, return false as a placeholder
            return false;
            
        } catch (error) {
            logger.error('❌ Error checking front running:', error);
            return false;
        }
    }
    
    private async getUserRecentTrades(userId: string, timeWindowMs: number): Promise<TradeData[]> {
        try {
            const cacheKey = `user_trades:${userId}:${Math.floor(Date.now() / timeWindowMs)}`;
            const cached = await redisService.getJSON<TradeData[]>(cacheKey);
            
            if (cached) {
                return cached;
            }
            
            // In a real implementation, this would query the trading database
            // For now, return empty array
            return [];
            
        } catch (error) {
            logger.error(`❌ Error getting recent trades for user ${userId}:`, error);
            return [];
        }
    }
    
    private async getUserTradingProfile(userId: string): Promise<UserTradingProfile | null> {
        try {
            const cacheKey = `user_profile:${userId}`;
            const cached = await redisService.getJSON<UserTradingProfile>(cacheKey);
            
            if (cached) {
                return cached;
            }
            
            // In a real implementation, this would query the user service
            // For now, return a default profile
            const defaultProfile: UserTradingProfile = {
                userId,
                accountType: 'INDIVIDUAL',
                riskTolerance: 'MODERATE',
                jurisdictions: ['US'],
                complianceLevel: 'RETAIL',
                kycStatus: 'APPROVED',
                amlStatus: 'CLEARED',
                isAccreditedInvestor: false,
                tradingLimits: {
                    dailyLimit: 100000,
                    positionLimit: 50000
                }
            };
            
            // Cache the profile
            await redisService.setJSON(cacheKey, defaultProfile, 3600);
            
            return defaultProfile;
            
        } catch (error) {
            logger.error(`❌ Error getting user trading profile for ${userId}:`, error);
            return null;
        }
    }
    
    private async checkUserCompliance(userId: string): Promise<void> {
        try {
            // Check user-specific compliance requirements
            const userProfile = await this.getUserTradingProfile(userId);
            if (!userProfile) return;
            
            // Check KYC/AML status
            if (userProfile.kycStatus !== 'APPROVED' || userProfile.amlStatus !== 'CLEARED') {
                const event: ComplianceEvent = {
                    eventId: `kyc_aml_check_${userId}_${Date.now()}`,
                    userId,
                    eventType: 'KYC_AML_STATUS',
                    eventCategory: 'IDENTITY_VERIFICATION',
                    description: 'User KYC/AML status requires attention',
                    severity: 'WARNING',
                    occurredAt: new Date().toISOString(),
                    additionalData: {
                        kycStatus: userProfile.kycStatus,
                        amlStatus: userProfile.amlStatus
                    }
                };
                
                await this.processComplianceEvent(event);
            }
            
        } catch (error) {
            logger.error(`❌ Error checking user compliance for ${userId}:`, error);
        }
    }
    
    private async processComplianceEvent(event: ComplianceEvent): Promise<void> {
        try {
            // Store event in database
            await this.storeComplianceEvent(event);
            
            // Publish to Kafka
            await kafkaService.publishComplianceEvent(
                event.userId,
                event.eventType,
                event
            );
            
            // Generate alert if necessary
            if (event.severity === 'VIOLATION') {
                await alertService.createComplianceAlert(
                    event.userId,
                    event.eventType,
                    event.severity,
                    event.description,
                    {
                        regulation: event.regulation,
                        tradeValue: event.tradeValue,
                        symbol: event.symbol,
                        additionalData: event.additionalData
                    }
                );
            }
            
            riskLogger.compliance(
                event.userId,
                event.eventType,
                {
                    severity: event.severity,
                    category: event.eventCategory,
                    regulation: event.regulation,
                    tradeValue: event.tradeValue
                }
            );
            
        } catch (error) {
            logger.error('❌ Error processing compliance event:', error);
        }
    }
    
    private async storeComplianceEvent(event: ComplianceEvent): Promise<void> {
        try {
            const query = `
                INSERT INTO compliance_events (
                    id,
                    user_id,
                    event_type,
                    event_category,
                    description,
                    regulation,
                    severity,
                    trade_id,
                    position_id,
                    order_id,
                    symbol,
                    trade_value,
                    additional_data,
                    occurred_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            `;
            
            await db.query(query, [
                event.eventId,
                event.userId,
                event.eventType,
                event.eventCategory,
                event.description,
                event.regulation,
                event.severity,
                event.tradeId,
                event.positionId,
                event.orderId,
                event.symbol,
                event.tradeValue,
                JSON.stringify(event.additionalData)
            ]);
            
        } catch (error) {
            logger.error('❌ Error storing compliance event:', error);
        }
    }
    
    // Public API methods
    async getComplianceEvents(
        userId: string,
        severity?: string,
        category?: string,
        limit: number = 100
    ): Promise<ComplianceEvent[]> {
        try {
            let query = `
                SELECT *
                FROM compliance_events
                WHERE user_id = $1
            `;
            const params: any[] = [userId];
            let paramIndex = 2;
            
            if (severity) {
                query += ` AND severity = $${paramIndex}`;
                params.push(severity);
                paramIndex++;
            }
            
            if (category) {
                query += ` AND event_category = $${paramIndex}`;
                params.push(category);
                paramIndex++;
            }
            
            query += ` ORDER BY occurred_at DESC LIMIT $${paramIndex}`;
            params.push(limit);
            
            const result = await db.query<any>(query, params);
            
            return result.map(row => ({
                eventId: row.id,
                userId: row.user_id,
                eventType: row.event_type,
                eventCategory: row.event_category,
                description: row.description,
                regulation: row.regulation,
                severity: row.severity,
                tradeId: row.trade_id,
                positionId: row.position_id,
                orderId: row.order_id,
                symbol: row.symbol,
                tradeValue: row.trade_value ? parseFloat(row.trade_value) : undefined,
                additionalData: row.additional_data,
                occurredAt: row.occurred_at
            }));
            
        } catch (error) {
            logger.error(`❌ Error getting compliance events for user ${userId}:`, error);
            return [];
        }
    }
    
    async getComplianceRules(): Promise<ComplianceRule[]> {
        return Array.from(this.complianceRules.values());
    }
    
    async updateComplianceRule(ruleId: string, updates: Partial<ComplianceRule>): Promise<boolean> {
        try {
            const rule = this.complianceRules.get(ruleId);
            if (!rule) {
                return false;
            }
            
            const updatedRule = { ...rule, ...updates };
            this.complianceRules.set(ruleId, updatedRule);
            
            logger.info(`📋 Updated compliance rule: ${ruleId}`, updates);
            
            return true;
            
        } catch (error) {
            logger.error(`❌ Error updating compliance rule ${ruleId}:`, error);
            return false;
        }
    }
    
    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.stop();
        });
    }
    
    get isMonitoring(): boolean {
        return this.isRunning;
    }
}

// Global compliance monitoring service instance
export const complianceMonitor = new ComplianceMonitoringService();