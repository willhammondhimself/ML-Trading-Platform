/**
 * Real-time Risk Monitoring Service
 * 
 * Continuous monitoring of portfolio risk metrics, position limits,
 * and real-time risk calculations with automated alert generation.
 */

import { Decimal } from 'decimal.js';
import { config } from '../config';
import { db } from '../database/connection';
import { redisService } from './redis-service';
import { kafkaService } from './kafka-service';
import { alertService } from './alert-service';
import { logger, riskLogger, performanceLogger } from '../utils/logger';
import { addShutdownHandler, trackResource } from '../utils/graceful-shutdown';

interface PositionData {
    userId: string;
    symbol: string;
    quantity: number;
    marketValue: number;
    unrealizedPnL: number;
    averageCost: number;
    currentPrice: number;
    lastUpdated: string;
}

interface PortfolioData {
    userId: string;
    totalValue: number;
    totalCash: number;
    totalPositions: number;
    unrealizedPnL: number;
    dailyPnL: number;
    positions: PositionData[];
}

interface RiskMetrics {
    userId: string;
    totalValue: number;
    var1Day: number;
    var5Day: number;
    portfolioBeta: number;
    maxDrawdown: number;
    leverageRatio: number;
    marginUtilization: number;
    concentrationRisk: number;
    diversificationRatio: number;
    calculatedAt: string;
}

interface RiskViolation {
    userId: string;
    violationType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    thresholdValue?: number;
    actualValue?: number;
    symbol?: string;
    detectedAt: string;
}

class RiskMonitoringService {
    private isRunning = false;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private processingUsers = new Set<string>();
    
    constructor() {
        this.setupShutdownHandler();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ Risk monitoring service is already running');
            return;
        }
        
        logger.info('📈 Starting real-time risk monitoring...');
        
        this.isRunning = true;
        
        // Start periodic risk monitoring
        this.monitoringInterval = setInterval(
            () => this.performRiskMonitoring(),
            config.MONITORING_CONFIG.RISK_CHECK_INTERVAL
        );
        
        // Perform initial risk check
        await this.performRiskMonitoring();
        
        logger.info('✅ Risk monitoring service started successfully');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping risk monitoring service...');
        
        this.isRunning = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        // Wait for ongoing processing to complete
        while (this.processingUsers.size > 0) {
            logger.info(`⏳ Waiting for ${this.processingUsers.size} user risk calculations to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        logger.info('✅ Risk monitoring service stopped');
    }
    
    private async performRiskMonitoring(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        const timer = performanceLogger.time('risk_monitoring_cycle');
        
        try {
            // Get list of active users with positions
            const activeUsers = await this.getActiveUsers();
            
            logger.debug('🔍 Starting risk monitoring cycle', {
                activeUserCount: activeUsers.length
            });
            
            // Process each user's risk profile
            const promises = activeUsers.map(userId => 
                this.processUserRisk(userId).catch(error => {
                    logger.error(`❌ Error processing risk for user ${userId}:`, error);
                })
            );
            
            await Promise.all(promises);
            
            riskLogger.monitoring('risk_cycle', 'completed', {
                userCount: activeUsers.length,
                duration: timer.end()
            });
            
        } catch (error) {
            logger.error('❌ Error in risk monitoring cycle:', error);
            timer.end();
        }
    }
    
    private async processUserRisk(userId: string): Promise<void> {
        if (this.processingUsers.has(userId)) {
            return; // Already processing this user
        }
        
        const untrack = trackResource(`risk_monitoring:${userId}`);
        this.processingUsers.add(userId);
        
        try {
            const timer = performanceLogger.time('user_risk_calculation', { userId });
            
            // Get user's portfolio data
            const portfolioData = await this.getPortfolioData(userId);
            if (!portfolioData) {
                return;
            }
            
            // Get user's risk profile
            const riskProfile = await this.getUserRiskProfile(userId);
            if (!riskProfile) {
                return;
            }
            
            // Calculate risk metrics
            const riskMetrics = await this.calculateRiskMetrics(portfolioData, riskProfile);
            
            // Check for risk violations
            const violations = await this.checkRiskViolations(riskMetrics, riskProfile);
            
            // Store risk metrics
            await this.storeRiskMetrics(riskMetrics);
            
            // Cache metrics for quick access
            await redisService.cacheRiskMetrics(userId, riskMetrics);
            
            // Process violations
            if (violations.length > 0) {
                await this.processRiskViolations(violations);
            }
            
            timer.end();
            
            riskLogger.metrics(userId, 'portfolio_risk', {
                totalValue: riskMetrics.totalValue,
                var1Day: riskMetrics.var1Day,
                leverageRatio: riskMetrics.leverageRatio,
                violationCount: violations.length
            });
            
        } catch (error) {
            logger.error(`❌ Error processing risk for user ${userId}:`, error);
        } finally {
            this.processingUsers.delete(userId);
            untrack();
        }
    }
    
    private async getActiveUsers(): Promise<string[]> {
        try {
            const query = `
                SELECT DISTINCT user_id
                FROM portfolio_risk_metrics
                WHERE calculated_at > NOW() - INTERVAL '1 hour'
                UNION
                SELECT DISTINCT user_id
                FROM position_risk_metrics
                WHERE calculated_at > NOW() - INTERVAL '1 hour'
            `;
            
            const result = await db.query<{ user_id: string }>(query);
            return result.map(row => row.user_id);
            
        } catch (error) {
            logger.error('❌ Error getting active users:', error);
            return [];
        }
    }
    
    private async getPortfolioData(userId: string): Promise<PortfolioData | null> {
        try {
            // Try to get from cache first
            const cachedData = await redisService.getPortfolioData(userId);
            if (cachedData) {
                return cachedData;
            }
            
            // Fetch from database
            const portfolioQuery = `
                SELECT 
                    user_id,
                    total_value,
                    total_cash,
                    total_positions,
                    unrealized_pnl,
                    daily_pnl
                FROM portfolio_risk_metrics
                WHERE user_id = $1
                ORDER BY calculated_at DESC
                LIMIT 1
            `;
            
            const positionsQuery = `
                SELECT 
                    user_id,
                    symbol,
                    position_size as quantity,
                    market_value,
                    unrealized_pnl,
                    calculated_at as last_updated
                FROM position_risk_metrics
                WHERE user_id = $1
                AND calculated_at > NOW() - INTERVAL '1 hour'
            `;
            
            const [portfolioResult, positionsResult] = await Promise.all([
                db.query<any>(portfolioQuery, [userId]),
                db.query<any>(positionsQuery, [userId])
            ]);
            
            if (portfolioResult.length === 0) {
                return null;
            }
            
            const portfolio = portfolioResult[0];
            const positions = positionsResult.map(pos => ({
                userId: pos.user_id,
                symbol: pos.symbol,
                quantity: parseFloat(pos.quantity),
                marketValue: parseFloat(pos.market_value),
                unrealizedPnL: parseFloat(pos.unrealized_pnl),
                averageCost: pos.market_value / pos.quantity,
                currentPrice: 0, // Would be fetched from market data
                lastUpdated: pos.last_updated
            }));
            
            const portfolioData: PortfolioData = {
                userId: portfolio.user_id,
                totalValue: parseFloat(portfolio.total_value),
                totalCash: parseFloat(portfolio.total_cash),
                totalPositions: parseFloat(portfolio.total_positions),
                unrealizedPnL: parseFloat(portfolio.unrealized_pnl),
                dailyPnL: parseFloat(portfolio.daily_pnl),
                positions
            };
            
            // Cache for future use
            await redisService.cachePortfolioData(userId, portfolioData);
            
            return portfolioData;
            
        } catch (error) {
            logger.error(`❌ Error getting portfolio data for user ${userId}:`, error);
            return null;
        }
    }
    
    private async getUserRiskProfile(userId: string): Promise<any> {
        try {
            const query = `
                SELECT *
                FROM risk_profiles
                WHERE user_id = $1
                AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            const result = await db.query<any>(query, [userId]);
            
            if (result.length === 0) {
                // Return default risk profile
                return {
                    user_id: userId,
                    max_position_size: config.RISK_CONFIG.MAX_POSITION_SIZE,
                    max_daily_loss: config.RISK_CONFIG.MAX_DAILY_LOSS,
                    max_portfolio_value: config.RISK_CONFIG.MAX_PORTFOLIO_VALUE,
                    var_confidence_level: config.RISK_CONFIG.VAR_CONFIDENCE_LEVEL,
                    margin_requirement: config.RISK_CONFIG.MARGIN_REQUIREMENT,
                    leverage_limit: config.RISK_CONFIG.LEVERAGE_LIMIT,
                    concentration_limit: config.RISK_CONFIG.CONCENTRATION_LIMIT
                };
            }
            
            return result[0];
            
        } catch (error) {
            logger.error(`❌ Error getting risk profile for user ${userId}:`, error);
            return null;
        }
    }
    
    private async calculateRiskMetrics(portfolioData: PortfolioData, riskProfile: any): Promise<RiskMetrics> {
        const decimal = (value: number) => new Decimal(value);
        
        try {
            // Calculate basic metrics
            const totalValue = decimal(portfolioData.totalValue);
            const totalCash = decimal(portfolioData.totalCash);
            const totalPositions = decimal(portfolioData.totalPositions);
            
            // Calculate leverage ratio
            const leverageRatio = totalPositions.div(totalValue.add(totalCash));
            
            // Calculate concentration risk (max position as % of portfolio)
            let maxPositionValue = decimal(0);
            for (const position of portfolioData.positions) {
                const positionValue = decimal(Math.abs(position.marketValue));
                if (positionValue.gt(maxPositionValue)) {
                    maxPositionValue = positionValue;
                }
            }
            const concentrationRisk = maxPositionValue.div(totalValue);
            
            // Calculate margin utilization
            const marginRequirement = decimal(riskProfile.margin_requirement);
            const marginUtilization = totalPositions.mul(marginRequirement).div(totalValue);
            
            // Simple VaR calculation (this would be more sophisticated in production)
            const portfolioVolatility = decimal(0.02); // 2% daily volatility assumption
            const confidenceLevel = decimal(riskProfile.var_confidence_level);
            const zScore = decimal(1.645); // 95% confidence z-score
            const var1Day = totalValue.mul(portfolioVolatility).mul(zScore);
            const var5Day = var1Day.mul(decimal(Math.sqrt(5)));
            
            // Portfolio beta (simplified calculation)
            const portfolioBeta = decimal(1.0); // Would calculate based on position betas
            
            // Max drawdown (simplified - would use historical data)
            const maxDrawdown = decimal(Math.abs(portfolioData.dailyPnL)).div(totalValue);
            
            // Diversification ratio (simplified)
            const diversificationRatio = decimal(portfolioData.positions.length).div(decimal(10));
            
            return {
                userId: portfolioData.userId,
                totalValue: totalValue.toNumber(),
                var1Day: var1Day.toNumber(),
                var5Day: var5Day.toNumber(),
                portfolioBeta: portfolioBeta.toNumber(),
                maxDrawdown: maxDrawdown.toNumber(),
                leverageRatio: leverageRatio.toNumber(),
                marginUtilization: marginUtilization.toNumber(),
                concentrationRisk: concentrationRisk.toNumber(),
                diversificationRatio: Math.min(diversificationRatio.toNumber(), 1.0),
                calculatedAt: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error('❌ Error calculating risk metrics:', error);
            throw error;
        }
    }
    
    private async checkRiskViolations(riskMetrics: RiskMetrics, riskProfile: any): Promise<RiskViolation[]> {
        const violations: RiskViolation[] = [];
        
        try {
            // Check portfolio value limit
            if (riskMetrics.totalValue > riskProfile.max_portfolio_value) {
                violations.push({
                    userId: riskMetrics.userId,
                    violationType: 'MAX_PORTFOLIO_VALUE',
                    severity: 'HIGH',
                    description: 'Portfolio value exceeds maximum limit',
                    thresholdValue: riskProfile.max_portfolio_value,
                    actualValue: riskMetrics.totalValue,
                    detectedAt: new Date().toISOString()
                });
            }
            
            // Check leverage limit
            if (riskMetrics.leverageRatio > riskProfile.leverage_limit) {
                violations.push({
                    userId: riskMetrics.userId,
                    violationType: 'LEVERAGE_LIMIT',
                    severity: 'CRITICAL',
                    description: 'Leverage ratio exceeds maximum limit',
                    thresholdValue: riskProfile.leverage_limit,
                    actualValue: riskMetrics.leverageRatio,
                    detectedAt: new Date().toISOString()
                });
            }
            
            // Check concentration risk
            if (riskMetrics.concentrationRisk > riskProfile.concentration_limit) {
                violations.push({
                    userId: riskMetrics.userId,
                    violationType: 'CONCENTRATION_RISK',
                    severity: 'MEDIUM',
                    description: 'Position concentration exceeds limit',
                    thresholdValue: riskProfile.concentration_limit,
                    actualValue: riskMetrics.concentrationRisk,
                    detectedAt: new Date().toISOString()
                });
            }
            
            // Check margin utilization
            if (riskMetrics.marginUtilization > 0.8) { // 80% margin utilization threshold
                violations.push({
                    userId: riskMetrics.userId,
                    violationType: 'MARGIN_UTILIZATION',
                    severity: 'HIGH',
                    description: 'Margin utilization is too high',
                    thresholdValue: 0.8,
                    actualValue: riskMetrics.marginUtilization,
                    detectedAt: new Date().toISOString()
                });
            }
            
            // Check VaR limits
            const varLimit = riskMetrics.totalValue * 0.05; // 5% of portfolio value
            if (riskMetrics.var1Day > varLimit) {
                violations.push({
                    userId: riskMetrics.userId,
                    violationType: 'VAR_LIMIT',
                    severity: 'MEDIUM',
                    description: '1-day VaR exceeds acceptable limit',
                    thresholdValue: varLimit,
                    actualValue: riskMetrics.var1Day,
                    detectedAt: new Date().toISOString()
                });
            }
            
            return violations;
            
        } catch (error) {
            logger.error('❌ Error checking risk violations:', error);
            return [];
        }
    }
    
    private async storeRiskMetrics(riskMetrics: RiskMetrics): Promise<void> {
        try {
            const query = `
                INSERT INTO portfolio_risk_metrics (
                    user_id,
                    total_value,
                    portfolio_var,
                    portfolio_beta,
                    max_drawdown,
                    leverage_ratio,
                    margin_utilization,
                    diversification_ratio,
                    calculated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `;
            
            await db.query(query, [
                riskMetrics.userId,
                riskMetrics.totalValue,
                riskMetrics.var1Day,
                riskMetrics.portfolioBeta,
                riskMetrics.maxDrawdown,
                riskMetrics.leverageRatio,
                riskMetrics.marginUtilization,
                riskMetrics.diversificationRatio
            ]);
            
        } catch (error) {
            logger.error('❌ Error storing risk metrics:', error);
        }
    }
    
    private async processRiskViolations(violations: RiskViolation[]): Promise<void> {
        for (const violation of violations) {
            try {
                // Store violation in database
                await this.storeRiskViolation(violation);
                
                // Publish to Kafka
                await kafkaService.publishRiskViolation(
                    violation.userId,
                    violation.violationType,
                    violation
                );
                
                // Generate alert
                await alertService.createRiskAlert(
                    violation.userId,
                    violation.violationType,
                    violation.severity,
                    violation.description,
                    {
                        thresholdValue: violation.thresholdValue,
                        actualValue: violation.actualValue,
                        symbol: violation.symbol
                    }
                );
                
                riskLogger.violation(
                    violation.userId,
                    violation.violationType,
                    {
                        severity: violation.severity,
                        thresholdValue: violation.thresholdValue,
                        actualValue: violation.actualValue
                    }
                );
                
            } catch (error) {
                logger.error('❌ Error processing risk violation:', error);
            }
        }
    }
    
    private async storeRiskViolation(violation: RiskViolation): Promise<void> {
        try {
            const query = `
                INSERT INTO risk_violations (
                    user_id,
                    violation_type,
                    severity,
                    description,
                    threshold_value,
                    actual_value,
                    symbol,
                    detected_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `;
            
            await db.query(query, [
                violation.userId,
                violation.violationType,
                violation.severity,
                violation.description,
                violation.thresholdValue,
                violation.actualValue,
                violation.symbol
            ]);
            
        } catch (error) {
            logger.error('❌ Error storing risk violation:', error);
        }
    }
    
    // Public API methods
    async getUserRiskMetrics(userId: string): Promise<RiskMetrics | null> {
        try {
            // Try cache first
            const cached = await redisService.getRiskMetrics(userId);
            if (cached) {
                return cached;
            }
            
            // Get from database
            const query = `
                SELECT *
                FROM portfolio_risk_metrics
                WHERE user_id = $1
                ORDER BY calculated_at DESC
                LIMIT 1
            `;
            
            const result = await db.query<any>(query, [userId]);
            
            if (result.length === 0) {
                return null;
            }
            
            const metrics = result[0];
            return {
                userId: metrics.user_id,
                totalValue: parseFloat(metrics.total_value),
                var1Day: parseFloat(metrics.portfolio_var),
                var5Day: parseFloat(metrics.portfolio_var) * Math.sqrt(5),
                portfolioBeta: parseFloat(metrics.portfolio_beta),
                maxDrawdown: parseFloat(metrics.max_drawdown),
                leverageRatio: parseFloat(metrics.leverage_ratio),
                marginUtilization: parseFloat(metrics.margin_utilization),
                concentrationRisk: 0, // Would calculate from position data
                diversificationRatio: parseFloat(metrics.diversification_ratio),
                calculatedAt: metrics.calculated_at
            };
            
        } catch (error) {
            logger.error(`❌ Error getting risk metrics for user ${userId}:`, error);
            return null;
        }
    }
    
    async getUserViolations(userId: string, limit: number = 50): Promise<RiskViolation[]> {
        try {
            const query = `
                SELECT *
                FROM risk_violations
                WHERE user_id = $1
                ORDER BY detected_at DESC
                LIMIT $2
            `;
            
            const result = await db.query<any>(query, [userId, limit]);
            
            return result.map(row => ({
                userId: row.user_id,
                violationType: row.violation_type,
                severity: row.severity,
                description: row.description,
                thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : undefined,
                actualValue: row.actual_value ? parseFloat(row.actual_value) : undefined,
                symbol: row.symbol,
                detectedAt: row.detected_at
            }));
            
        } catch (error) {
            logger.error(`❌ Error getting violations for user ${userId}:`, error);
            return [];
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

// Global risk monitoring service instance
export const riskMonitor = new RiskMonitoringService();