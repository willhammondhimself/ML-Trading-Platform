import { getDatabase } from '../database/connection';
import { UserSession } from './user';

export class SessionModel {
  private static tableName = 'user_sessions';

  // Create new session
  static async create(sessionData: Omit<UserSession, 'createdAt' | 'updatedAt' | 'lastUsedAt'>): Promise<UserSession> {
    const db = getDatabase();
    
    const [session] = await db(this.tableName)
      .insert({
        id: sessionData.id,
        user_id: sessionData.userId,
        refresh_token_hash: sessionData.refreshTokenHash,
        device_info: sessionData.deviceInfo,
        ip_address: sessionData.ipAddress,
        user_agent: sessionData.userAgent,
        expires_at: sessionData.expiresAt,
        last_used_at: new Date(),
        is_revoked: false
      })
      .returning('*');

    return this.mapDatabaseSession(session);
  }

  // Find session by ID
  static async findById(id: string): Promise<UserSession | null> {
    const db = getDatabase();
    
    const session = await db(this.tableName)
      .where({ id })
      .first();

    return session ? this.mapDatabaseSession(session) : null;
  }

  // Update last used timestamp
  static async updateLastUsed(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        last_used_at: new Date(),
        updated_at: new Date()
      });
  }

  // Revoke session
  static async revoke(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        is_revoked: true,
        updated_at: new Date()
      });
  }

  // Revoke all user sessions
  static async revokeAllUserSessions(userId: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ user_id: userId })
      .update({
        is_revoked: true,
        updated_at: new Date()
      });
  }

  // Clean up expired sessions
  static async cleanupExpiredSessions(): Promise<number> {
    const db = getDatabase();
    
    const deletedCount = await db(this.tableName)
      .where('expires_at', '<', new Date())
      .orWhere('is_revoked', true)
      .del();

    return deletedCount;
  }

  // Get active sessions for user
  static async getActiveUserSessions(userId: string): Promise<UserSession[]> {
    const db = getDatabase();
    
    const sessions = await db(this.tableName)
      .where({
        user_id: userId,
        is_revoked: false
      })
      .where('expires_at', '>', new Date())
      .orderBy('last_used_at', 'desc');

    return sessions.map(this.mapDatabaseSession);
  }

  // Map database row to UserSession interface
  private static mapDatabaseSession(dbSession: any): UserSession {
    return {
      id: dbSession.id,
      userId: dbSession.user_id,
      refreshTokenHash: dbSession.refresh_token_hash,
      deviceInfo: dbSession.device_info,
      ipAddress: dbSession.ip_address,
      userAgent: dbSession.user_agent,
      expiresAt: dbSession.expires_at,
      lastUsedAt: dbSession.last_used_at,
      isRevoked: dbSession.is_revoked,
      createdAt: dbSession.created_at,
      updatedAt: dbSession.updated_at
    };
  }
}