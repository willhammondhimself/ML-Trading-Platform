import { getDatabase } from '../database/connection';

export enum AuditAction {
  REGISTRATION = 'registration',
  LOGIN = 'login',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  PROFILE_UPDATE = 'profile_update',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_REACTIVATED = 'account_reactivated',
  ACCOUNT_DELETED = 'account_deleted'
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: AuditAction;
  details: Record<string, any> | null;
  ipAddress: string;
  userAgent: string | null;
  result: 'success' | 'failure' | 'blocked';
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuditLogData {
  userId: string | null;
  action: AuditAction;
  details: Record<string, any> | null;
  ipAddress: string;
  userAgent: string | null;
  result: 'success' | 'failure' | 'blocked';
  failureReason?: string | null;
}

export class AuditLogModel {
  private static tableName = 'user_audit_logs';

  // Create new audit log entry
  static async create(logData: CreateAuditLogData): Promise<AuditLog> {
    const db = getDatabase();
    
    const [log] = await db(this.tableName)
      .insert({
        user_id: logData.userId,
        action: logData.action,
        details: logData.details ? JSON.stringify(logData.details) : null,
        ip_address: logData.ipAddress,
        user_agent: logData.userAgent,
        result: logData.result,
        failure_reason: logData.failureReason || null
      })
      .returning('*');

    return this.mapDatabaseLog(log);
  }

  // Find logs by user ID
  static async findByUserId(userId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const db = getDatabase();
    
    const logs = await db(this.tableName)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return logs.map(this.mapDatabaseLog);
  }

  // Find logs by action
  static async findByAction(action: AuditAction, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const db = getDatabase();
    
    const logs = await db(this.tableName)
      .where({ action })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return logs.map(this.mapDatabaseLog);
  }

  // Find failed login attempts by IP
  static async findFailedLoginsByIp(ipAddress: string, timeWindow: Date): Promise<AuditLog[]> {
    const db = getDatabase();
    
    const logs = await db(this.tableName)
      .where({
        action: AuditAction.LOGIN_FAILED,
        ip_address: ipAddress,
        result: 'failure'
      })
      .where('created_at', '>', timeWindow)
      .orderBy('created_at', 'desc');

    return logs.map(this.mapDatabaseLog);
  }

  // Find failed login attempts by user
  static async findFailedLoginsByUser(userId: string, timeWindow: Date): Promise<AuditLog[]> {
    const db = getDatabase();
    
    const logs = await db(this.tableName)
      .where({
        user_id: userId,
        action: AuditAction.LOGIN_FAILED,
        result: 'failure'
      })
      .where('created_at', '>', timeWindow)
      .orderBy('created_at', 'desc');

    return logs.map(this.mapDatabaseLog);
  }

  // Get security events for user
  static async getSecurityEvents(userId: string, limit: number = 50): Promise<AuditLog[]> {
    const db = getDatabase();
    
    const securityActions = [
      AuditAction.LOGIN,
      AuditAction.LOGIN_FAILED,
      AuditAction.PASSWORD_CHANGE,
      AuditAction.PASSWORD_RESET,
      AuditAction.MFA_ENABLED,
      AuditAction.MFA_DISABLED
    ];

    const logs = await db(this.tableName)
      .where({ user_id: userId })
      .whereIn('action', securityActions)
      .orderBy('created_at', 'desc')
      .limit(limit);

    return logs.map(this.mapDatabaseLog);
  }

  // Clean up old logs (for GDPR compliance)
  static async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const db = getDatabase();
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const deletedCount = await db(this.tableName)
      .where('created_at', '<', cutoffDate)
      .del();

    return deletedCount;
  }

  // Get audit statistics
  static async getStatistics(startDate: Date, endDate: Date): Promise<{
    totalEvents: number;
    successfulLogins: number;
    failedLogins: number;
    registrations: number;
    passwordResets: number;
  }> {
    const db = getDatabase();
    
    const [stats] = await db(this.tableName)
      .select([
        db.raw('COUNT(*) as total_events'),
        db.raw(`COUNT(CASE WHEN action = '${AuditAction.LOGIN}' AND result = 'success' THEN 1 END) as successful_logins`),
        db.raw(`COUNT(CASE WHEN action = '${AuditAction.LOGIN_FAILED}' AND result = 'failure' THEN 1 END) as failed_logins`),
        db.raw(`COUNT(CASE WHEN action = '${AuditAction.REGISTRATION}' AND result = 'success' THEN 1 END) as registrations`),
        db.raw(`COUNT(CASE WHEN action = '${AuditAction.PASSWORD_RESET}' AND result = 'success' THEN 1 END) as password_resets`)
      ])
      .whereBetween('created_at', [startDate, endDate]);

    return {
      totalEvents: parseInt(stats.total_events),
      successfulLogins: parseInt(stats.successful_logins),
      failedLogins: parseInt(stats.failed_logins),
      registrations: parseInt(stats.registrations),
      passwordResets: parseInt(stats.password_resets)
    };
  }

  // Map database row to AuditLog interface
  private static mapDatabaseLog(dbLog: any): AuditLog {
    return {
      id: dbLog.id,
      userId: dbLog.user_id,
      action: dbLog.action as AuditAction,
      details: dbLog.details ? JSON.parse(dbLog.details) : null,
      ipAddress: dbLog.ip_address,
      userAgent: dbLog.user_agent,
      result: dbLog.result as 'success' | 'failure' | 'blocked',
      failureReason: dbLog.failure_reason,
      createdAt: dbLog.created_at,
      updatedAt: dbLog.updated_at
    };
  }
}