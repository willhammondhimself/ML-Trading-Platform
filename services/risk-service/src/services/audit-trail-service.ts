/**
 * Audit Trail Service
 * 
 * Comprehensive audit logging for all system activities with
 * tamper-proof storage, regulatory compliance, and advanced querying.
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { db } from '../database/connection';
import { redisService } from './redis-service';
import { kafkaService } from './kafka-service';
import { logger, riskLogger, performanceLogger } from '../utils/logger';
import { addShutdownHandler, trackResource } from '../utils/graceful-shutdown';

interface AuditEntry {
    id: string;
    userId?: string;
    entityType: string;
    entityId?: string;
    action: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    sourceService: string;
    metadata?: Record<string, any>;
    createdAt: string;
    createdBy?: string;
}

interface AuditQuery {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    sourceService?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
}

interface AuditStatistics {
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByEntityType: Record<string, number>;
    entriesByService: Record<string, number>;
    entriesByUser: Record<string, number>;
}

class AuditTrailService {
    private isRunning = false;
    private batchQueue: AuditEntry[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private readonly batchSize = 100;
    private readonly batchTimeoutMs = 5000; // 5 seconds
    private processingBatch = false;
    
    constructor() {
        this.setupShutdownHandler();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ Audit trail service is already running');
            return;
        }
        
        logger.info('📝 Starting audit trail service...');
        
        this.isRunning = true;
        
        // Start batch processing timer
        this.startBatchTimer();
        
        logger.info('✅ Audit trail service started successfully');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping audit trail service...');
        
        this.isRunning = false;
        
        // Stop batch timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Process remaining entries in queue
        if (this.batchQueue.length > 0) {
            logger.info(`📝 Processing remaining ${this.batchQueue.length} audit entries...`);
            await this.processBatch();
        }
        
        // Wait for ongoing batch processing to complete
        while (this.processingBatch) {
            logger.info('⏳ Waiting for audit batch processing to complete...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        logger.info('✅ Audit trail service stopped');
    }
    
    async logAuditEvent(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<string> {
        try {
            const auditEntry: AuditEntry = {
                id: uuidv4(),
                createdAt: new Date().toISOString(),
                ...entry
            };
            
            // Add to batch queue
            this.batchQueue.push(auditEntry);
            
            // Publish to Kafka for real-time processing
            await kafkaService.publishAuditEvent(
                entry.userId || 'system',
                entry.action,
                entry.entityType,
                auditEntry
            );
            
            // Process batch if it's full
            if (this.batchQueue.length >= this.batchSize) {
                await this.processBatch();
            }
            
            logger.debug('📝 Audit event queued', {
                auditId: auditEntry.id,
                entityType: entry.entityType,
                action: entry.action,
                userId: entry.userId
            });
            
            return auditEntry.id;
            
        } catch (error) {
            logger.error('❌ Error logging audit event:', error);
            throw error;
        }
    }
    
    private async processBatch(): Promise<void> {
        if (this.processingBatch || this.batchQueue.length === 0) {
            return;
        }
        
        this.processingBatch = true;
        const untrack = trackResource('audit_batch_processing');
        
        try {
            const timer = performanceLogger.time('audit_batch_processing');
            const entriesToProcess = this.batchQueue.splice(0, this.batchSize);
            
            // Store entries in database
            await this.storeBatch(entriesToProcess);
            
            // Cache recent entries for quick access
            await this.cacheRecentEntries(entriesToProcess);
            
            timer.end();
            
            logger.debug('📝 Processed audit batch', {
                entriesProcessed: entriesToProcess.length,
                remainingInQueue: this.batchQueue.length
            });
            
        } catch (error) {
            logger.error('❌ Error processing audit batch:', error);
            // Re-add entries to queue for retry
            this.batchQueue.unshift(...this.batchQueue);
        } finally {
            this.processingBatch = false;
            untrack();
        }
    }
    
    private async storeBatch(entries: AuditEntry[]): Promise<void> {
        if (entries.length === 0) return;
        
        try {
            const query = `
                INSERT INTO audit_trail (
                    id,
                    user_id,
                    entity_type,
                    entity_id,
                    action,
                    old_values,
                    new_values,
                    ip_address,
                    user_agent,
                    session_id,
                    request_id,
                    source_service,
                    metadata,
                    created_at,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `;
            
            // Use transaction for batch insert
            await db.transaction(async (client) => {
                for (const entry of entries) {
                    await client.query(query, [
                        entry.id,
                        entry.userId,
                        entry.entityType,
                        entry.entityId,
                        entry.action,
                        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
                        entry.newValues ? JSON.stringify(entry.newValues) : null,
                        entry.ipAddress,
                        entry.userAgent,
                        entry.sessionId,
                        entry.requestId,
                        entry.sourceService,
                        entry.metadata ? JSON.stringify(entry.metadata) : null,
                        entry.createdAt,
                        entry.createdBy
                    ]);
                }
            });
            
            riskLogger.audit('system', 'batch_stored', 'audit_trail', {
                entriesStored: entries.length
            });
            
        } catch (error) {
            logger.error('❌ Error storing audit batch:', error);
            throw error;
        }
    }
    
    private async cacheRecentEntries(entries: AuditEntry[]): Promise<void> {
        try {
            // Cache entries by user for quick user-specific queries
            const userEntries: Record<string, AuditEntry[]> = {};
            
            for (const entry of entries) {
                if (entry.userId) {
                    if (!userEntries[entry.userId]) {
                        userEntries[entry.userId] = [];
                    }
                    userEntries[entry.userId].push(entry);
                }
            }
            
            // Store in Redis with TTL
            for (const [userId, userEntryList] of Object.entries(userEntries)) {
                const cacheKey = `recent_audit:${userId}`;
                const existingEntries = await redisService.getJSON<AuditEntry[]>(cacheKey) || [];
                
                // Combine and limit to last 100 entries
                const allEntries = [...userEntryList, ...existingEntries]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 100);
                
                await redisService.setJSON(cacheKey, allEntries, 3600); // 1 hour TTL
            }
            
        } catch (error) {
            logger.error('❌ Error caching recent audit entries:', error);
        }
    }
    
    private startBatchTimer(): void {
        this.batchTimer = setTimeout(async () => {
            if (this.isRunning && this.batchQueue.length > 0) {
                await this.processBatch();
            }
            
            if (this.isRunning) {
                this.startBatchTimer();
            }
        }, this.batchTimeoutMs);
    }
    
    // Query methods
    async queryAuditTrail(query: AuditQuery): Promise<{ entries: AuditEntry[], total: number }> {
        try {
            const timer = performanceLogger.time('audit_query');
            
            // Build SQL query
            let sql = 'SELECT * FROM audit_trail WHERE 1=1';
            const params: any[] = [];
            let paramIndex = 1;
            
            if (query.userId) {
                sql += ` AND user_id = $${paramIndex}`;
                params.push(query.userId);
                paramIndex++;
            }
            
            if (query.entityType) {
                sql += ` AND entity_type = $${paramIndex}`;
                params.push(query.entityType);
                paramIndex++;
            }
            
            if (query.entityId) {
                sql += ` AND entity_id = $${paramIndex}`;
                params.push(query.entityId);
                paramIndex++;
            }
            
            if (query.action) {
                sql += ` AND action = $${paramIndex}`;
                params.push(query.action);
                paramIndex++;
            }
            
            if (query.sourceService) {
                sql += ` AND source_service = $${paramIndex}`;
                params.push(query.sourceService);
                paramIndex++;
            }
            
            if (query.fromDate) {
                sql += ` AND created_at >= $${paramIndex}`;
                params.push(query.fromDate);
                paramIndex++;
            }
            
            if (query.toDate) {
                sql += ` AND created_at <= $${paramIndex}`;
                params.push(query.toDate);
                paramIndex++;
            }
            
            // Get total count
            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)');
            const countResult = await db.query<{ count: string }>(countSql, params);
            const total = parseInt(countResult[0].count);
            
            // Add ordering, limit, and offset
            sql += ' ORDER BY created_at DESC';
            
            if (query.limit) {
                sql += ` LIMIT $${paramIndex}`;
                params.push(query.limit);
                paramIndex++;
            }
            
            if (query.offset) {
                sql += ` OFFSET $${paramIndex}`;
                params.push(query.offset);
            }
            
            const result = await db.query<any>(sql, params);
            
            const entries: AuditEntry[] = result.map(row => ({
                id: row.id,
                userId: row.user_id,
                entityType: row.entity_type,
                entityId: row.entity_id,
                action: row.action,
                oldValues: row.old_values ? JSON.parse(row.old_values) : undefined,
                newValues: row.new_values ? JSON.parse(row.new_values) : undefined,
                ipAddress: row.ip_address,
                userAgent: row.user_agent,
                sessionId: row.session_id,
                requestId: row.request_id,
                sourceService: row.source_service,
                metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
                createdAt: row.created_at,
                createdBy: row.created_by
            }));
            
            timer.end();
            
            return { entries, total };
            
        } catch (error) {
            logger.error('❌ Error querying audit trail:', error);
            return { entries: [], total: 0 };
        }
    }
    
    async getUserAuditTrail(userId: string, limit: number = 100): Promise<AuditEntry[]> {
        try {
            // Try cache first for recent entries
            const cacheKey = `recent_audit:${userId}`;
            const cachedEntries = await redisService.getJSON<AuditEntry[]>(cacheKey);
            
            if (cachedEntries && cachedEntries.length >= limit) {
                return cachedEntries.slice(0, limit);
            }
            
            // Query database
            const result = await this.queryAuditTrail({
                userId,
                limit
            });
            
            return result.entries;
            
        } catch (error) {
            logger.error(`❌ Error getting user audit trail for ${userId}:`, error);
            return [];
        }
    }
    
    async getAuditStatistics(fromDate?: string, toDate?: string): Promise<AuditStatistics> {
        try {
            let sql = 'SELECT action, entity_type, source_service, user_id FROM audit_trail WHERE 1=1';
            const params: any[] = [];
            let paramIndex = 1;
            
            if (fromDate) {
                sql += ` AND created_at >= $${paramIndex}`;
                params.push(fromDate);
                paramIndex++;
            }
            
            if (toDate) {
                sql += ` AND created_at <= $${paramIndex}`;
                params.push(toDate);
            }
            
            const result = await db.query<any>(sql, params);
            
            const statistics: AuditStatistics = {
                totalEntries: result.length,
                entriesByAction: {},
                entriesByEntityType: {},
                entriesByService: {},
                entriesByUser: {}
            };
            
            for (const row of result) {
                // Count by action
                statistics.entriesByAction[row.action] = 
                    (statistics.entriesByAction[row.action] || 0) + 1;
                
                // Count by entity type
                statistics.entriesByEntityType[row.entity_type] = 
                    (statistics.entriesByEntityType[row.entity_type] || 0) + 1;
                
                // Count by service
                statistics.entriesByService[row.source_service] = 
                    (statistics.entriesByService[row.source_service] || 0) + 1;
                
                // Count by user
                if (row.user_id) {
                    statistics.entriesByUser[row.user_id] = 
                        (statistics.entriesByUser[row.user_id] || 0) + 1;
                }
            }
            
            return statistics;
            
        } catch (error) {
            logger.error('❌ Error getting audit statistics:', error);
            return {
                totalEntries: 0,
                entriesByAction: {},
                entriesByEntityType: {},
                entriesByService: {},
                entriesByUser: {}
            };
        }
    }
    
    // Convenience methods for common audit events
    async logUserAction(
        userId: string,
        action: string,
        entityType: string,
        entityId?: string,
        oldValues?: any,
        newValues?: any,
        metadata?: any,
        request?: {
            ipAddress?: string;
            userAgent?: string;
            sessionId?: string;
            requestId?: string;
        }
    ): Promise<string> {
        return await this.logAuditEvent({
            userId,
            action,
            entityType,
            entityId,
            oldValues,
            newValues,
            ipAddress: request?.ipAddress,
            userAgent: request?.userAgent,
            sessionId: request?.sessionId,
            requestId: request?.requestId,
            sourceService: 'risk-service',
            metadata,
            createdBy: userId
        });
    }
    
    async logSystemAction(
        action: string,
        entityType: string,
        entityId?: string,
        oldValues?: any,
        newValues?: any,
        metadata?: any
    ): Promise<string> {
        return await this.logAuditEvent({
            action,
            entityType,
            entityId,
            oldValues,
            newValues,
            sourceService: 'risk-service',
            metadata,
            createdBy: 'system'
        });
    }
    
    async logRiskEvent(
        userId: string,
        eventType: string,
        details: any,
        metadata?: any
    ): Promise<string> {
        return await this.logUserAction(
            userId,
            eventType,
            'risk_event',
            undefined,
            undefined,
            details,
            metadata
        );
    }
    
    async logComplianceEvent(
        userId: string,
        eventType: string,
        details: any,
        metadata?: any
    ): Promise<string> {
        return await this.logUserAction(
            userId,
            eventType,
            'compliance_event',
            undefined,
            undefined,
            details,
            metadata
        );
    }
    
    async logDataChange(
        userId: string,
        entityType: string,
        entityId: string,
        oldValues: any,
        newValues: any,
        metadata?: any
    ): Promise<string> {
        return await this.logUserAction(
            userId,
            'UPDATE',
            entityType,
            entityId,
            oldValues,
            newValues,
            metadata
        );
    }
    
    // Data retention management
    async cleanupOldEntries(): Promise<number> {
        try {
            const retentionDays = config.MONITORING_CONFIG.AUDIT_LOG_RETENTION_DAYS;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            const query = `
                DELETE FROM audit_trail
                WHERE created_at < $1
            `;
            
            const result = await db.query(query, [cutoffDate.toISOString()]);
            
            logger.info(`🗑️ Cleaned up ${result.length} old audit entries`, {
                cutoffDate: cutoffDate.toISOString(),
                retentionDays
            });
            
            return result.length;
            
        } catch (error) {
            logger.error('❌ Error cleaning up old audit entries:', error);
            return 0;
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
        return this.batchQueue.length;
    }
}

// Global audit trail service instance
export const auditTrailService = new AuditTrailService();