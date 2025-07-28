/**
 * Database Migration: Create Risk Management Tables
 * 
 * Creates all necessary tables for risk management, compliance monitoring,
 * audit trails, and alert management with proper indexes and constraints.
 */

import { logger } from '../../utils/logger';
import type { DatabaseManager } from '../connection';

export async function createRiskTables(db: DatabaseManager): Promise<void> {
    logger.info('🗄️ Creating risk management tables...');
    
    // Enable UUID extension
    await db.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);
    
    // Risk profiles table
    await db.query(`
        CREATE TABLE IF NOT EXISTS risk_profiles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            profile_name VARCHAR(255) NOT NULL,
            max_position_size DECIMAL(20,2) NOT NULL DEFAULT 1000000,
            max_daily_loss DECIMAL(20,2) NOT NULL DEFAULT 50000,
            max_portfolio_value DECIMAL(20,2) NOT NULL DEFAULT 10000000,
            var_confidence_level DECIMAL(5,4) NOT NULL DEFAULT 0.95,
            var_time_horizon INTEGER NOT NULL DEFAULT 1,
            margin_requirement DECIMAL(5,4) NOT NULL DEFAULT 0.30,
            leverage_limit DECIMAL(10,2) NOT NULL DEFAULT 4.00,
            concentration_limit DECIMAL(5,4) NOT NULL DEFAULT 0.20,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by UUID,
            updated_by UUID
        );
    `);
    
    // Position risk metrics table
    await db.query(`
        CREATE TABLE IF NOT EXISTS position_risk_metrics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            symbol VARCHAR(50) NOT NULL,
            position_size DECIMAL(20,2) NOT NULL,
            market_value DECIMAL(20,2) NOT NULL,
            unrealized_pnl DECIMAL(20,2) NOT NULL DEFAULT 0,
            daily_pnl DECIMAL(20,2) NOT NULL DEFAULT 0,
            var_1day DECIMAL(20,2),
            var_5day DECIMAL(20,2),
            beta DECIMAL(10,6),
            delta DECIMAL(20,2),
            gamma DECIMAL(20,2),
            theta DECIMAL(20,2),
            vega DECIMAL(20,2),
            exposure_percentage DECIMAL(5,4),
            concentration_risk DECIMAL(5,4),
            liquidity_risk_score DECIMAL(3,2),
            calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    
    // Portfolio risk metrics table
    await db.query(`
        CREATE TABLE IF NOT EXISTS portfolio_risk_metrics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            total_value DECIMAL(20,2) NOT NULL,
            total_cash DECIMAL(20,2) NOT NULL DEFAULT 0,
            total_positions DECIMAL(20,2) NOT NULL DEFAULT 0,
            unrealized_pnl DECIMAL(20,2) NOT NULL DEFAULT 0,
            daily_pnl DECIMAL(20,2) NOT NULL DEFAULT 0,
            portfolio_var DECIMAL(20,2),
            portfolio_beta DECIMAL(10,6),
            max_drawdown DECIMAL(20,2),
            sharpe_ratio DECIMAL(10,6),
            sortino_ratio DECIMAL(10,6),
            diversification_ratio DECIMAL(5,4),
            leverage_ratio DECIMAL(10,2),
            margin_utilization DECIMAL(5,4),
            calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    
    // Risk violations table
    await db.query(`
        CREATE TABLE IF NOT EXISTS risk_violations (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            violation_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            description TEXT NOT NULL,
            threshold_value DECIMAL(20,2),
            actual_value DECIMAL(20,2),
            symbol VARCHAR(50),
            position_id UUID,
            trade_id UUID,
            is_resolved BOOLEAN NOT NULL DEFAULT false,
            resolved_at TIMESTAMP WITH TIME ZONE,
            resolved_by UUID,
            resolution_notes TEXT,
            detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    
    // Compliance events table
    await db.query(`
        CREATE TABLE IF NOT EXISTS compliance_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_category VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            regulation VARCHAR(100),
            severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'VIOLATION')),
            trade_id UUID,
            position_id UUID,
            order_id UUID,
            symbol VARCHAR(50),
            trade_value DECIMAL(20,2),
            additional_data JSONB,
            is_reported BOOLEAN NOT NULL DEFAULT false,
            reported_at TIMESTAMP WITH TIME ZONE,
            reported_to VARCHAR(255),
            occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    
    // Audit trail table
    await db.query(`
        CREATE TABLE IF NOT EXISTS audit_trail (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID,
            entity_type VARCHAR(100) NOT NULL,
            entity_id UUID,
            action VARCHAR(100) NOT NULL,
            old_values JSONB,
            new_values JSONB,
            ip_address INET,
            user_agent TEXT,
            session_id UUID,
            request_id UUID,
            source_service VARCHAR(100),
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by UUID
        );
    `);
    
    // Risk alerts table
    await db.query(`
        CREATE TABLE IF NOT EXISTS risk_alerts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID,
            alert_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            source VARCHAR(100) NOT NULL,
            symbol VARCHAR(50),
            threshold_value DECIMAL(20,2),
            actual_value DECIMAL(20,2),
            additional_data JSONB,
            is_acknowledged BOOLEAN NOT NULL DEFAULT false,
            acknowledged_at TIMESTAMP WITH TIME ZONE,
            acknowledged_by UUID,
            is_resolved BOOLEAN NOT NULL DEFAULT false,
            resolved_at TIMESTAMP WITH TIME ZONE,
            resolved_by UUID,
            resolution_notes TEXT,
            expires_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    
    // Risk limit overrides table
    await db.query(`
        CREATE TABLE IF NOT EXISTS risk_limit_overrides (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            limit_type VARCHAR(100) NOT NULL,
            original_value DECIMAL(20,2) NOT NULL,
            override_value DECIMAL(20,2) NOT NULL,
            reason TEXT NOT NULL,
            approved_by UUID NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by UUID NOT NULL
        );
    `);
    
    // Market risk scenarios table
    await db.query(`
        CREATE TABLE IF NOT EXISTS market_risk_scenarios (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            scenario_name VARCHAR(255) NOT NULL,
            description TEXT,
            scenario_type VARCHAR(50) NOT NULL,
            market_shocks JSONB NOT NULL,
            stress_test_results JSONB,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by UUID
        );
    `);
    
    // Create indexes for performance
    await createIndexes(db);
    
    logger.info('✅ Risk management tables created successfully');
}

async function createIndexes(db: DatabaseManager): Promise<void> {
    logger.info('🔍 Creating database indexes...');
    
    const indexes = [
        // Risk profiles indexes
        'CREATE INDEX IF NOT EXISTS idx_risk_profiles_user_id ON risk_profiles(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_profiles_active ON risk_profiles(is_active)',
        
        // Position risk metrics indexes
        'CREATE INDEX IF NOT EXISTS idx_position_risk_user_id ON position_risk_metrics(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_position_risk_symbol ON position_risk_metrics(symbol)',
        'CREATE INDEX IF NOT EXISTS idx_position_risk_calculated_at ON position_risk_metrics(calculated_at)',
        'CREATE INDEX IF NOT EXISTS idx_position_risk_user_symbol ON position_risk_metrics(user_id, symbol)',
        
        // Portfolio risk metrics indexes
        'CREATE INDEX IF NOT EXISTS idx_portfolio_risk_user_id ON portfolio_risk_metrics(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_portfolio_risk_calculated_at ON portfolio_risk_metrics(calculated_at)',
        
        // Risk violations indexes
        'CREATE INDEX IF NOT EXISTS idx_risk_violations_user_id ON risk_violations(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_violations_type ON risk_violations(violation_type)',
        'CREATE INDEX IF NOT EXISTS idx_risk_violations_severity ON risk_violations(severity)',
        'CREATE INDEX IF NOT EXISTS idx_risk_violations_resolved ON risk_violations(is_resolved)',
        'CREATE INDEX IF NOT EXISTS idx_risk_violations_detected_at ON risk_violations(detected_at)',
        
        // Compliance events indexes
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_user_id ON compliance_events(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_type ON compliance_events(event_type)',
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_category ON compliance_events(event_category)',
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_severity ON compliance_events(severity)',
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_occurred_at ON compliance_events(occurred_at)',
        'CREATE INDEX IF NOT EXISTS idx_compliance_events_reported ON compliance_events(is_reported)',
        
        // Audit trail indexes
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_type ON audit_trail(entity_type)',
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_id ON audit_trail(entity_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action)',
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_audit_trail_source_service ON audit_trail(source_service)',
        
        // Risk alerts indexes
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_user_id ON risk_alerts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_type ON risk_alerts(alert_type)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_severity ON risk_alerts(severity)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_acknowledged ON risk_alerts(is_acknowledged)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_resolved ON risk_alerts(is_resolved)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_created_at ON risk_alerts(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_risk_alerts_expires_at ON risk_alerts(expires_at)',
        
        // Risk limit overrides indexes
        'CREATE INDEX IF NOT EXISTS idx_risk_overrides_user_id ON risk_limit_overrides(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_overrides_limit_type ON risk_limit_overrides(limit_type)',
        'CREATE INDEX IF NOT EXISTS idx_risk_overrides_active ON risk_limit_overrides(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_risk_overrides_expires_at ON risk_limit_overrides(expires_at)',
        
        // Market risk scenarios indexes
        'CREATE INDEX IF NOT EXISTS idx_market_scenarios_type ON market_risk_scenarios(scenario_type)',
        'CREATE INDEX IF NOT EXISTS idx_market_scenarios_active ON market_risk_scenarios(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_market_scenarios_created_at ON market_risk_scenarios(created_at)'
    ];
    
    // Execute index creation queries
    for (const indexQuery of indexes) {
        try {
            await db.query(indexQuery);
        } catch (error) {
            logger.warn(`⚠️ Failed to create index: ${indexQuery}`, error);
        }
    }
    
    logger.info('✅ Database indexes created successfully');
}