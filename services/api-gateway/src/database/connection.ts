/**
 * Database Connection for API Gateway
 * 
 * PostgreSQL connection with connection pooling, health monitoring,
 * and graceful shutdown handling for API Gateway metadata.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { config, isProduction } from '../config';
import { logger, logError } from '../utils/logger';
import { addShutdownHandler } from '../utils/graceful-shutdown';

class DatabaseConnection {
    private pool: Pool | null = null;
    private isConnected = false;

    constructor() {
        this.setupShutdownHandler();
    }

    async connect(): Promise<void> {
        try {
            logger.info('🗄️ Connecting to PostgreSQL database...');

            const poolConfig: PoolConfig = {
                connectionString: config.DATABASE_URL,
                max: config.DATABASE_MAX_CONNECTIONS,
                idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT,
                connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT,
                statement_timeout: 30000, // 30 seconds
                query_timeout: 30000,
                application_name: 'api-gateway',
                ssl: isProduction() ? { rejectUnauthorized: false } : false
            };

            this.pool = new Pool(poolConfig);

            // Set up event handlers
            this.pool.on('connect', (client: PoolClient) => {
                logger.debug('🔌 New database client connected');
            });

            this.pool.on('acquire', (client: PoolClient) => {
                logger.debug('🎯 Database client acquired from pool');
            });

            this.pool.on('release', (err: Error | undefined, client: PoolClient) => {
                if (err) {
                    logger.error('❌ Database client released with error:', err);
                } else {
                    logger.debug('↩️ Database client released back to pool');
                }
            });

            this.pool.on('remove', (client: PoolClient) => {
                logger.debug('🗑️ Database client removed from pool');
            });

            this.pool.on('error', (err: Error, client: PoolClient) => {
                logger.error('❌ Database pool error:', err);
                this.isConnected = false;
            });

            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            logger.info('✅ Database connection established successfully');

            // Run initial schema setup
            await this.initializeSchema();

        } catch (error) {
            logger.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            logger.info('🔌 Disconnecting from database...');
            try {
                await this.pool.end();
                this.pool = null;
                this.isConnected = false;
                logger.info('✅ Database disconnected successfully');
            } catch (error) {
                logger.error('❌ Error disconnecting from database:', error);
            }
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.pool || !this.isConnected) {
                return false;
            }

            const client = await this.pool.connect();
            const result = await client.query('SELECT 1 as health_check');
            client.release();

            return result.rows.length > 0 && result.rows[0].health_check === 1;
        } catch (error) {
            logger.error('❌ Database health check failed:', error);
            return false;
        }
    }

    async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[], rowCount: number }> {
        if (!this.pool) {
            throw new Error('Database not connected');
        }

        const start = Date.now();
        
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            logger.debug('Database query executed', {
                query: text.substring(0, 100),
                duration_ms: duration,
                rowCount: result.rowCount
            });

            return {
                rows: result.rows,
                rowCount: result.rowCount || 0
            };
        } catch (error) {
            const duration = Date.now() - start;
            logError(error as Error, {
                operation: 'database_query',
                query: text.substring(0, 100),
                duration_ms: duration,
                params: params ? params.length : 0
            });
            throw error;
        }
    }

    async getClient(): Promise<PoolClient> {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        return await this.pool.connect();
    }

    async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.getClient();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async initializeSchema(): Promise<void> {
        try {
            logger.info('🔧 Initializing database schema...');

            // Create schema for API Gateway tables
            await this.query(`
                CREATE SCHEMA IF NOT EXISTS gateway;
            `);

            // API Keys table
            await this.query(`
                CREATE TABLE IF NOT EXISTS gateway.api_keys (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    key_hash VARCHAR(64) NOT NULL UNIQUE,
                    user_id UUID NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    tier VARCHAR(50) NOT NULL DEFAULT 'FREE',
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    rate_limit_override JSONB,
                    scopes TEXT[] DEFAULT '{}',
                    last_used_at TIMESTAMP WITH TIME ZONE,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);

            // Rate limit tracking table
            await this.query(`
                CREATE TABLE IF NOT EXISTS gateway.rate_limit_counters (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    identifier VARCHAR(255) NOT NULL,
                    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
                    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
                    request_count INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(identifier, window_start)
                );
            `);

            // Request logs table
            await this.query(`
                CREATE TABLE IF NOT EXISTS gateway.request_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    request_id VARCHAR(255) NOT NULL,
                    method VARCHAR(10) NOT NULL,
                    path VARCHAR(500) NOT NULL,
                    status_code INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    user_id UUID,
                    api_key_id UUID,
                    service_name VARCHAR(100),
                    ip_address INET,
                    user_agent TEXT,
                    request_size INTEGER,
                    response_size INTEGER,
                    error_message TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);

            // Service health table
            await this.query(`
                CREATE TABLE IF NOT EXISTS gateway.service_health (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    service_name VARCHAR(100) NOT NULL,
                    instance_id VARCHAR(255) NOT NULL,
                    is_healthy BOOLEAN NOT NULL,
                    response_time_ms INTEGER,
                    last_check_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    error_message TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(service_name, instance_id)
                );
            `);

            // Circuit breaker state table
            await this.query(`
                CREATE TABLE IF NOT EXISTS gateway.circuit_breaker_state (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    service_name VARCHAR(100) NOT NULL UNIQUE,
                    state VARCHAR(20) NOT NULL DEFAULT 'CLOSED',
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    last_failure_at TIMESTAMP WITH TIME ZONE,
                    next_attempt_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);

            // Create indexes for performance
            await this.query(`
                CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON gateway.api_keys(key_hash);
                CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON gateway.api_keys(user_id);
                CREATE INDEX IF NOT EXISTS idx_api_keys_active ON gateway.api_keys(is_active);
                
                CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON gateway.rate_limit_counters(identifier);
                CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON gateway.rate_limit_counters(window_start, window_end);
                
                CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON gateway.request_logs(created_at);
                CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON gateway.request_logs(user_id);
                CREATE INDEX IF NOT EXISTS idx_request_logs_status ON gateway.request_logs(status_code);
                
                CREATE INDEX IF NOT EXISTS idx_service_health_service ON gateway.service_health(service_name);
                CREATE INDEX IF NOT EXISTS idx_service_health_healthy ON gateway.service_health(is_healthy);
                
                CREATE INDEX IF NOT EXISTS idx_circuit_breaker_service ON gateway.circuit_breaker_state(service_name);
            `);

            // Create updated_at trigger function
            await this.query(`
                CREATE OR REPLACE FUNCTION gateway.update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            `);

            // Add triggers for updated_at
            await this.query(`
                DROP TRIGGER IF EXISTS update_api_keys_updated_at ON gateway.api_keys;
                CREATE TRIGGER update_api_keys_updated_at 
                    BEFORE UPDATE ON gateway.api_keys 
                    FOR EACH ROW EXECUTE FUNCTION gateway.update_updated_at_column();
                    
                DROP TRIGGER IF EXISTS update_circuit_breaker_updated_at ON gateway.circuit_breaker_state;
                CREATE TRIGGER update_circuit_breaker_updated_at 
                    BEFORE UPDATE ON gateway.circuit_breaker_state 
                    FOR EACH ROW EXECUTE FUNCTION gateway.update_updated_at_column();
            `);

            logger.info('✅ Database schema initialized successfully');

        } catch (error) {
            logger.error('❌ Failed to initialize database schema:', error);
            throw error;
        }
    }

    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.disconnect();
        });
    }

    get connected(): boolean {
        return this.isConnected;
    }

    get poolInfo() {
        if (!this.pool) {
            return null;
        }

        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
        };
    }
}

// Global database instance
export const database = new DatabaseConnection();

// Initialize database connection
export const initializeDatabase = async (): Promise<void> => {
    await database.connect();
};

// Close database connection
export const closeDatabase = async (): Promise<void> => {
    await database.disconnect();
};