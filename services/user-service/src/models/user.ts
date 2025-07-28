import { z } from 'zod';
import { getDatabase } from '../database/connection';

// User status enum
export enum UserStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated'
}

// User role enum
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  TRADER = 'trader',
  ANALYST = 'analyst'
}

// Validation schemas
export const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username must not exceed 50 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name must not exceed 100 characters'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name must not exceed 100 characters'),
  phoneNumber: z.string().optional()
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name must not exceed 100 characters').optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name must not exceed 100 characters').optional(),
  phoneNumber: z.string().optional(),
  preferences: z.record(z.any()).optional()
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6, 'MFA code must be 6 digits').optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
});

// User interface
export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  status: UserStatus;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string[] | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  preferences: Record<string, any> | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// User session interface
export interface UserSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceInfo: string | null;
  ipAddress: string;
  userAgent: string | null;
  expiresAt: Date;
  lastUsedAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Password reset token interface
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  isUsed: boolean;
  ipAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

// User model class
export class UserModel {
  private static tableName = 'users';

  // Create new user
  static async create(userData: z.infer<typeof createUserSchema>, passwordHash: string): Promise<User> {
    const db = getDatabase();
    
    const [user] = await db(this.tableName)
      .insert({
        email: userData.email.toLowerCase(),
        username: userData.username,
        password_hash: passwordHash,
        first_name: userData.firstName,
        last_name: userData.lastName,
        phone_number: userData.phoneNumber || null,
        status: UserStatus.PENDING_VERIFICATION,
        role: UserRole.USER
      })
      .returning('*');

    return this.mapDatabaseUser(user);
  }

  // Find user by ID
  static async findById(id: string): Promise<User | null> {
    const db = getDatabase();
    
    const user = await db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .first();

    return user ? this.mapDatabaseUser(user) : null;
  }

  // Find user by email
  static async findByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    
    const user = await db(this.tableName)
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    return user ? this.mapDatabaseUser(user) : null;
  }

  // Find user by username
  static async findByUsername(username: string): Promise<User | null> {
    const db = getDatabase();
    
    const user = await db(this.tableName)
      .where({ username })
      .whereNull('deleted_at')
      .first();

    return user ? this.mapDatabaseUser(user) : null;
  }

  // Update user
  static async update(id: string, updates: Partial<User>): Promise<User | null> {
    const db = getDatabase();
    
    const [user] = await db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...this.mapUserToDatabase(updates),
        updated_at: new Date()
      })
      .returning('*');

    return user ? this.mapDatabaseUser(user) : null;
  }

  // Update last login
  static async updateLastLogin(id: string, ipAddress: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        last_login_at: new Date(),
        last_login_ip: ipAddress,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date()
      });
  }

  // Increment failed login attempts
  static async incrementFailedLoginAttempts(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .increment('failed_login_attempts', 1)
      .update({ updated_at: new Date() });
  }

  // Lock user account
  static async lockUser(id: string, lockDuration: number): Promise<void> {
    const db = getDatabase();
    const lockedUntil = new Date(Date.now() + lockDuration);
    
    await db(this.tableName)
      .where({ id })
      .update({
        locked_until: lockedUntil,
        updated_at: new Date()
      });
  }

  // Check if user is locked
  static async isUserLocked(id: string): Promise<boolean> {
    const db = getDatabase();
    
    const user = await db(this.tableName)
      .select('locked_until')
      .where({ id })
      .first();

    if (!user || !user.locked_until) {
      return false;
    }

    return new Date() < new Date(user.locked_until);
  }

  // Verify email
  static async verifyEmail(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        email_verified: true,
        email_verified_at: new Date(),
        status: UserStatus.ACTIVE,
        updated_at: new Date()
      });
  }

  // Enable MFA
  static async enableMfa(id: string, secret: string, backupCodes: string[]): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        mfa_enabled: true,
        mfa_secret: secret,
        mfa_backup_codes: JSON.stringify(backupCodes),
        updated_at: new Date()
      });
  }

  // Disable MFA
  static async disableMfa(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        mfa_enabled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        updated_at: new Date()
      });
  }

  // Soft delete user
  static async softDelete(id: string): Promise<void> {
    const db = getDatabase();
    
    await db(this.tableName)
      .where({ id })
      .update({
        status: UserStatus.DEACTIVATED,
        deleted_at: new Date(),
        updated_at: new Date()
      });
  }

  // Map database row to User interface
  private static mapDatabaseUser(dbUser: any): User {
    return {
      id: dbUser.id,
      email: dbUser.email,
      username: dbUser.username,
      passwordHash: dbUser.password_hash,
      firstName: dbUser.first_name,
      lastName: dbUser.last_name,
      phoneNumber: dbUser.phone_number,
      status: dbUser.status as UserStatus,
      role: dbUser.role as UserRole,
      emailVerified: dbUser.email_verified,
      phoneVerified: dbUser.phone_verified,
      mfaEnabled: dbUser.mfa_enabled,
      mfaSecret: dbUser.mfa_secret,
      mfaBackupCodes: dbUser.mfa_backup_codes ? JSON.parse(dbUser.mfa_backup_codes) : null,
      emailVerifiedAt: dbUser.email_verified_at,
      phoneVerifiedAt: dbUser.phone_verified_at,
      lastLoginAt: dbUser.last_login_at,
      lastLoginIp: dbUser.last_login_ip,
      failedLoginAttempts: dbUser.failed_login_attempts,
      lockedUntil: dbUser.locked_until,
      preferences: dbUser.preferences,
      metadata: dbUser.metadata,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
      deletedAt: dbUser.deleted_at
    };
  }

  // Map User interface to database format
  private static mapUserToDatabase(user: Partial<User>): any {
    const dbUser: any = {};
    
    if (user.email) dbUser.email = user.email.toLowerCase();
    if (user.username) dbUser.username = user.username;
    if (user.passwordHash) dbUser.password_hash = user.passwordHash;
    if (user.firstName) dbUser.first_name = user.firstName;
    if (user.lastName) dbUser.last_name = user.lastName;
    if (user.phoneNumber !== undefined) dbUser.phone_number = user.phoneNumber;
    if (user.status) dbUser.status = user.status;
    if (user.role) dbUser.role = user.role;
    if (user.emailVerified !== undefined) dbUser.email_verified = user.emailVerified;
    if (user.phoneVerified !== undefined) dbUser.phone_verified = user.phoneVerified;
    if (user.mfaEnabled !== undefined) dbUser.mfa_enabled = user.mfaEnabled;
    if (user.mfaSecret !== undefined) dbUser.mfa_secret = user.mfaSecret;
    if (user.mfaBackupCodes !== undefined) {
      dbUser.mfa_backup_codes = user.mfaBackupCodes ? JSON.stringify(user.mfaBackupCodes) : null;
    }
    if (user.preferences !== undefined) dbUser.preferences = user.preferences;
    if (user.metadata !== undefined) dbUser.metadata = user.metadata;
    
    return dbUser;
  }
}