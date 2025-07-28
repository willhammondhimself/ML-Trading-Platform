import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { UserModel, User, UserStatus, createUserSchema, loginSchema, changePasswordSchema } from '../models/user';
import { SessionModel } from '../models/session';
import { AuditLogModel, AuditAction } from '../models/audit-log';
import { getEnvironment } from '../config/environment';
import { AppError, ValidationError, AuthenticationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { z } from 'zod';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface LoginResult {
  user: Omit<User, 'passwordHash' | 'mfaSecret'>;
  tokens: TokenPair;
  requiresMfa: boolean;
}

export class AuthService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCK_DURATION = 30 * 60 * 1000; // 30 minutes
  private static readonly MFA_WINDOW = 1; // Allow 1 step before/after current time

  /**
   * Register a new user
   */
  static async register(userData: z.infer<typeof createUserSchema>, ipAddress: string): Promise<{ user: Omit<User, 'passwordHash' | 'mfaSecret'>, emailVerificationToken: string }> {
    try {
      // Validate input
      const validatedData = createUserSchema.parse(userData);

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(validatedData.email);
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      const existingUsername = await UserModel.findByUsername(validatedData.username);
      if (existingUsername) {
        throw new ValidationError('Username is already taken');
      }

      // Hash password
      const env = getEnvironment();
      const saltRounds = parseInt(env.BCRYPT_ROUNDS);
      const passwordHash = await bcrypt.hash(validatedData.password, saltRounds);

      // Create user
      const user = await UserModel.create(validatedData, passwordHash);

      // Generate email verification token
      const emailVerificationToken = await this.generateEmailVerificationToken(user.id);

      // Log registration
      await AuditLogModel.create({
        userId: user.id,
        action: AuditAction.REGISTRATION,
        details: { email: user.email, username: user.username },
        ipAddress,
        userAgent: null,
        result: 'success'
      });

      logger.info(`User registered successfully: ${user.email}`);

      return {
        user: this.sanitizeUser(user),
        emailVerificationToken
      };
    } catch (error) {
      logger.error('Registration failed:', error);
      
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid input data', error.errors);
      }
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new AppError('Registration failed', 500);
    }
  }

  /**
   * Login user with email and password
   */
  static async login(credentials: z.infer<typeof loginSchema>, deviceInfo: { ipAddress: string; userAgent?: string }): Promise<LoginResult> {
    try {
      // Validate input
      const validatedCredentials = loginSchema.parse(credentials);

      // Find user
      const user = await UserModel.findByEmail(validatedCredentials.email);
      if (!user) {
        await this.logFailedLogin(null, validatedCredentials.email, 'User not found', deviceInfo);
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if user is locked
      const isLocked = await UserModel.isUserLocked(user.id);
      if (isLocked) {
        await this.logFailedLogin(user.id, validatedCredentials.email, 'Account locked', deviceInfo);
        throw new AuthenticationError('Account is temporarily locked due to multiple failed attempts');
      }

      // Check account status
      if (user.status === UserStatus.SUSPENDED) {
        await this.logFailedLogin(user.id, validatedCredentials.email, 'Account suspended', deviceInfo);
        throw new AuthenticationError('Account is suspended');
      }

      if (user.status === UserStatus.DEACTIVATED) {
        await this.logFailedLogin(user.id, validatedCredentials.email, 'Account deactivated', deviceInfo);
        throw new AuthenticationError('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(validatedCredentials.password, user.passwordHash);
      if (!isPasswordValid) {
        await UserModel.incrementFailedLoginAttempts(user.id);
        
        // Lock account after max attempts
        if (user.failedLoginAttempts + 1 >= this.MAX_FAILED_ATTEMPTS) {
          await UserModel.lockUser(user.id, this.LOCK_DURATION);
          await this.logFailedLogin(user.id, validatedCredentials.email, 'Max attempts reached - account locked', deviceInfo);
          throw new AuthenticationError('Account has been locked due to multiple failed attempts');
        }

        await this.logFailedLogin(user.id, validatedCredentials.email, 'Invalid password', deviceInfo);
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if MFA is required
      if (user.mfaEnabled) {
        if (!validatedCredentials.mfaCode) {
          return {
            user: this.sanitizeUser(user),
            tokens: { accessToken: '', refreshToken: '' },
            requiresMfa: true
          };
        }

        // Verify MFA code
        const isMfaValid = this.verifyMfaCode(user.mfaSecret!, validatedCredentials.mfaCode);
        if (!isMfaValid) {
          // Check backup codes
          const isBackupCodeValid = await this.verifyBackupCode(user.id, validatedCredentials.mfaCode);
          if (!isBackupCodeValid) {
            await this.logFailedLogin(user.id, validatedCredentials.email, 'Invalid MFA code', deviceInfo);
            throw new AuthenticationError('Invalid MFA code');
          }
        }
      }

      // Generate tokens
      const tokens = await this.generateTokens(user, deviceInfo);

      // Update last login
      await UserModel.updateLastLogin(user.id, deviceInfo.ipAddress);

      // Log successful login
      await AuditLogModel.create({
        userId: user.id,
        action: AuditAction.LOGIN,
        details: { mfaUsed: user.mfaEnabled },
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent || null,
        result: 'success'
      });

      logger.info(`User logged in successfully: ${user.email}`);

      return {
        user: this.sanitizeUser(user),
        tokens,
        requiresMfa: false
      };
    } catch (error) {
      logger.error('Login failed:', error);
      
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid input data', error.errors);
      }
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      throw new AppError('Login failed', 500);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string, deviceInfo: { ipAddress: string; userAgent?: string }): Promise<TokenPair> {
    try {
      const env = getEnvironment();
      
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;
      
      // Find session
      const sessionId = decoded.sessionId;
      const session = await SessionModel.findById(sessionId);
      
      if (!session || session.isRevoked || new Date() > session.expiresAt) {
        throw new AuthenticationError('Invalid or expired refresh token');
      }

      // Verify token hash
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      if (tokenHash !== session.refreshTokenHash) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Find user
      const user = await UserModel.findById(session.userId);
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Update session last used
      await SessionModel.updateLastUsed(sessionId);

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      logger.info(`Token refreshed for user: ${user.email}`);

      return {
        accessToken,
        refreshToken // Keep the same refresh token
      };
    } catch (error) {
      logger.error('Token refresh failed:', error);
      
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      throw new AppError('Token refresh failed', 500);
    }
  }

  /**
   * Logout user
   */
  static async logout(refreshToken: string, ipAddress: string): Promise<void> {
    try {
      const env = getEnvironment();
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;
      const sessionId = decoded.sessionId;
      
      // Revoke session
      await SessionModel.revoke(sessionId);

      // Log logout
      await AuditLogModel.create({
        userId: decoded.userId,
        action: AuditAction.LOGOUT,
        details: {},
        ipAddress,
        userAgent: null,
        result: 'success'
      });

      logger.info(`User logged out: ${decoded.userId}`);
    } catch (error) {
      logger.error('Logout failed:', error);
      // Don't throw error for logout failures
    }
  }

  /**
   * Change user password
   */
  static async changePassword(userId: string, passwordData: z.infer<typeof changePasswordSchema>, ipAddress: string): Promise<void> {
    try {
      // Validate input
      const validatedData = changePasswordSchema.parse(passwordData);

      // Find user
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(validatedData.currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password
      const env = getEnvironment();
      const saltRounds = parseInt(env.BCRYPT_ROUNDS);
      const newPasswordHash = await bcrypt.hash(validatedData.newPassword, saltRounds);

      // Update password
      await UserModel.update(userId, { passwordHash: newPasswordHash });

      // Revoke all user sessions
      await SessionModel.revokeAllUserSessions(userId);

      // Log password change
      await AuditLogModel.create({
        userId,
        action: AuditAction.PASSWORD_CHANGE,
        details: {},
        ipAddress,
        userAgent: null,
        result: 'success'
      });

      logger.info(`Password changed for user: ${userId}`);
    } catch (error) {
      logger.error('Password change failed:', error);
      
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid input data', error.errors);
      }
      
      if (error instanceof AuthenticationError || error instanceof AppError) {
        throw error;
      }
      
      throw new AppError('Password change failed', 500);
    }
  }

  /**
   * Setup MFA for user
   */
  static async setupMfa(userId: string): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (user.mfaEnabled) {
        throw new ValidationError('MFA is already enabled for this user');
      }

      const env = getEnvironment();
      const secret = authenticator.generateSecret();
      const qrCode = authenticator.keyuri(user.email, env.MFA_ISSUER_NAME, secret);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      logger.info(`MFA setup initiated for user: ${userId}`);

      return { secret, qrCode, backupCodes };
    } catch (error) {
      logger.error('MFA setup failed:', error);
      
      if (error instanceof AppError || error instanceof ValidationError) {
        throw error;
      }
      
      throw new AppError('MFA setup failed', 500);
    }
  }

  /**
   * Enable MFA for user
   */
  static async enableMfa(userId: string, secret: string, verificationCode: string, backupCodes: string[], ipAddress: string): Promise<void> {
    try {
      // Verify the MFA code
      const isValid = this.verifyMfaCode(secret, verificationCode);
      if (!isValid) {
        throw new AuthenticationError('Invalid verification code');
      }

      // Enable MFA for user
      await UserModel.enableMfa(userId, secret, backupCodes);

      // Log MFA enabled
      await AuditLogModel.create({
        userId,
        action: AuditAction.MFA_ENABLED,
        details: {},
        ipAddress,
        userAgent: null,
        result: 'success'
      });

      logger.info(`MFA enabled for user: ${userId}`);
    } catch (error) {
      logger.error('MFA enable failed:', error);
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      throw new AppError('Failed to enable MFA', 500);
    }
  }

  /**
   * Disable MFA for user
   */
  static async disableMfa(userId: string, password: string, ipAddress: string): Promise<void> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }

      // Disable MFA
      await UserModel.disableMfa(userId);

      // Log MFA disabled
      await AuditLogModel.create({
        userId,
        action: AuditAction.MFA_DISABLED,
        details: {},
        ipAddress,
        userAgent: null,
        result: 'success'
      });

      logger.info(`MFA disabled for user: ${userId}`);
    } catch (error) {
      logger.error('MFA disable failed:', error);
      
      if (error instanceof AuthenticationError || error instanceof AppError) {
        throw error;
      }
      
      throw new AppError('Failed to disable MFA', 500);
    }
  }

  /**
   * Private helper methods
   */

  private static async generateTokens(user: User, deviceInfo: { ipAddress: string; userAgent?: string }): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, deviceInfo);
    
    return { accessToken, refreshToken };
  }

  private static generateAccessToken(user: User): string {
    const env = getEnvironment();
    
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: 'ml-trading-platform',
      audience: 'ml-trading-users'
    });
  }

  private static async generateRefreshToken(user: User, deviceInfo: { ipAddress: string; userAgent?: string }): Promise<string> {
    const env = getEnvironment();
    const sessionId = uuidv4();
    const refreshToken = uuidv4();
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Create session
    await SessionModel.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: tokenHash,
      deviceInfo: deviceInfo.userAgent || null,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Create JWT with session reference
    const payload = {
      userId: user.id,
      sessionId,
      type: 'refresh'
    };

    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: 'ml-trading-platform',
      audience: 'ml-trading-users'
    });
  }

  private static async generateEmailVerificationToken(userId: string): Promise<string> {
    // This would integrate with the email verification system
    // For now, return a placeholder token
    return crypto.randomBytes(32).toString('hex');
  }

  private static verifyMfaCode(secret: string, code: string): boolean {
    return authenticator.verify({
      token: code,
      secret,
      window: this.MFA_WINDOW
    });
  }

  private static async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await UserModel.findById(userId);
    if (!user || !user.mfaBackupCodes) {
      return false;
    }

    const backupCodes = user.mfaBackupCodes;
    const index = backupCodes.indexOf(code);
    
    if (index === -1) {
      return false;
    }

    // Remove used backup code
    backupCodes.splice(index, 1);
    await UserModel.update(userId, { mfaBackupCodes: backupCodes });

    return true;
  }

  private static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  private static async logFailedLogin(userId: string | null, email: string, reason: string, deviceInfo: { ipAddress: string; userAgent?: string }): Promise<void> {
    await AuditLogModel.create({
      userId,
      action: AuditAction.LOGIN_FAILED,
      details: { email, reason },
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent || null,
      result: 'failure',
      failureReason: reason
    });
  }

  private static sanitizeUser(user: User): Omit<User, 'passwordHash' | 'mfaSecret'> {
    const { passwordHash, mfaSecret, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}