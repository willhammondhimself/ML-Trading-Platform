/**
 * Database Connection Management for Risk Service
 * 
 * PostgreSQL connection pool with automatic reconnection,
 * health monitoring, and optimized configuration for risk management workloads.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createRiskTables } from './migrations/001_create_risk_tables';

class DatabaseManager {
    private pool: Pool | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 5000; // 5 seconds
    
    constructor() {
        this.setupEventHandlers();
    }
    
    async connect(): Promise<void> {
        try {
            logger.info('📊 Connecting to PostgreSQL database...');
            
            const poolConfig: PoolConfig = {
                connectionString: config.DATABASE_URL,
                max: config.DATABASE_MAX_CONNECTIONS,
                idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT,
                connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT,
                statement_timeout: 30000, // 30 seconds
                query_timeout: 30000, // 30 seconds
                application_name: 'risk-service',
                ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            };
            
            this.pool = new Pool(poolConfig);
            
            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            logger.info('✅ Database connected successfully');
            
            // Run migrations
            await this.runMigrations();
            
        } catch (error) {
            logger.error('❌ Database connection failed:', error);
            await this.handleConnectionError(error);
        }
    }
    
    async disconnect(): Promise<void> {
        if (this.pool) {
            logger.info('🔌 Closing database connection...');
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
            logger.info('✅ Database disconnected');
        }
    }
    
    async getClient(): Promise<PoolClient> {
        if (!this.pool || !this.isConnected) {
            throw new Error('Database not connected');
        }
        
        try {
            return await this.pool.connect();
        } catch (error) {
            logger.error('❌ Failed to get database client:', error);
            await this.handleConnectionError(error);
            throw error;
        }
    }
    
    async query<T = any>(text: string, params?: any[]): Promise<T[]> {
        const client = await this.getClient();
        
        try {
            const startTime = Date.now();
            const result = await client.query(text, params);
            const duration = Date.now() - startTime;
            
            logger.debug('🔍 Database query executed', {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                duration: `${duration}ms`,
                rowCount: result.rowCount
            });
            
            return result.rows;
        } catch (error) {
            logger.error('❌ Database query failed:', {
                query: text,
                params,
                error: error instanceof Error ? error.message : error
            });
            throw error;
        } finally {
            client.release();
        }
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
            logger.error('❌ Transaction failed, rolled back:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.pool || !this.isConnected) {
                return false;
            }
            
            const result = await this.query('SELECT 1 as health_check');
            return result.length > 0;
        } catch (error) {
            logger.error('❌ Database health check failed:', error);
            return false;
        }
    }
    
    private async handleConnectionError(error: any): Promise<void> {
        this.isConnected = false;
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            logger.warn(`⚠️ Database connection lost, attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(async () => {
                try {
                    await this.connect();
                } catch (reconnectError) {
                    logger.error('❌ Database reconnection failed:', reconnectError);
                }
            }, this.reconnectDelay);
        } else {
            logger.error('❌ Maximum database reconnection attempts exceeded');
            throw new Error('Database connection failed permanently');
        }
    }
    
    private setupEventHandlers(): void {
        process.on('SIGTERM', async () => {
            await this.disconnect();
        });
        
        process.on('SIGINT', async () => {
            await this.disconnect();
        });
    }
    
    private async runMigrations(): Promise<void> {
        try {
            logger.info('🚀 Running database migrations...');
            await createRiskTables(this);
            logger.info('✅ Database migrations completed');
        } catch (error) {
            logger.error('❌ Database migrations failed:', error);
            throw error;
        }
    }
    
    // Connection pool statistics
    getPoolStats() {
        if (!this.pool) {
            return null;
        }
        
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Global database manager instance
export const db = new DatabaseManager();

// Connection functions
export const connectDatabase = async (): Promise<void> => {
    await db.connect();
};

export const disconnectDatabase = async (): Promise<void> => {
    await db.disconnect();
};

// Export types
export type { PoolClient } from 'pg';