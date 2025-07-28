import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth-service';
import { rateLimitMiddleware } from '../middleware/rate-limiter';
import { asyncHandler } from '../middleware/error-handler';
import { authenticateToken, validateMfaCode, sanitizeUserForResponse } from '../middleware/auth-middleware';
import { inputSanitizer } from '../middleware/security';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { trackAuthentication, trackRegistration, trackMfaOperation, trackPasswordReset } from '../utils/metrics';
import { publishUserEvent, publishAuditEvent, UserEventTypes } from '../services/kafka-service';
import { AuditAction } from '../models/audit-log';

const router: ExpressRouter = ExpressRouter();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phoneNumber: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6, 'MFA code must be 6 digits').optional()
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
});

const setupMfaSchema = z.object({
  // No body required for setup
});

const verifyMfaSetupSchema = z.object({
  secret: z.string().min(1, 'Secret is required'),
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
  backupCodes: z.array(z.string()).length(10, 'Must provide exactly 10 backup codes')
});

const disableMfaSchema = z.object({
  password: z.string().min(1, 'Password is required')
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', 
  rateLimitMiddleware.registration,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate input
      const userData = registerSchema.parse(req.body);
      
      // Register user
      const result = await AuthService.register(userData, req.ip);
      
      // Track successful registration
      trackRegistration('success');
      
      // Publish user registered event
      await publishUserEvent(UserEventTypes.USER_REGISTERED, {
        userId: result.user.id,
        email: result.user.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      logger.info('User registration successful', {
        userId: result.user.id,
        email: result.user.email,
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please check your email for verification.',
        user: result.user,
        emailVerificationRequired: true
      });

    } catch (error) {
      trackRegistration('failure');
      throw error;
    }
  })
);

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post('/login',
  rateLimitMiddleware.auth,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate input
      const credentials = loginSchema.parse(req.body);
      
      // Device info
      const deviceInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Authenticate user
      const result = await AuthService.login(credentials, deviceInfo);
      
      if (result.requiresMfa) {
        // MFA required but not provided
        trackAuthentication('blocked', 'password', (Date.now() - startTime) / 1000);
        
        res.status(200).json({
          success: true,
          message: 'MFA code required',
          requiresMfa: true,
          user: result.user
        });
        return;
      }

      // Successful login
      const method = credentials.mfaCode ? 'mfa' : 'password';
      trackAuthentication('success', method, (Date.now() - startTime) / 1000);

      // Publish login event
      await publishUserEvent(UserEventTypes.USER_LOGIN, {
        userId: result.user.id,
        email: result.user.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        mfaUsed: result.user.mfaEnabled
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: result.user,
        tokens: result.tokens
      });

    } catch (error) {
      trackAuthentication('failure', 'password', (Date.now() - startTime) / 1000);
      throw error;
    }
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh',
  rateLimitMiddleware.auth,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate input
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      
      // Device info
      const deviceInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Refresh tokens
      const tokens = await AuthService.refreshToken(refreshToken, deviceInfo);
      
      trackAuthentication('success', 'refresh', (Date.now() - startTime) / 1000);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        tokens
      });

    } catch (error) {
      trackAuthentication('failure', 'refresh', (Date.now() - startTime) / 1000);
      throw error;
    }
  })
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate refresh token
 */
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const refreshToken = req.body.refreshToken;
      
      if (refreshToken) {
        await AuthService.logout(refreshToken, req.ip);
      }

      // Publish logout event
      await publishUserEvent(UserEventTypes.USER_LOGOUT, {
        userId: req.user!.id,
        email: req.user!.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });

    } catch (error) {
      // Don't throw errors for logout
      logger.error('Logout error:', error);
      res.status(200).json({
        success: true,
        message: 'Logout completed'
      });
    }
  })
);

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password',
  authenticateToken,
  rateLimitMiddleware.auth,
  validateMfaCode(),
  inputSanitizer,
  asyncHandler(async (req, res) => {
    try {
      // Validate input
      const passwordData = changePasswordSchema.parse(req.body);
      
      // Change password
      await AuthService.changePassword(req.user!.id, passwordData, req.ip);
      
      // Publish password change event
      await publishUserEvent(UserEventTypes.PASSWORD_CHANGED, {
        userId: req.user!.id,
        email: req.user!.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. All sessions have been invalidated.'
      });

    } catch (error) {
      throw error;
    }
  })
);

/**
 * POST /api/auth/mfa/setup
 * Setup MFA for user
 */
router.post('/mfa/setup',
  authenticateToken,
  rateLimitMiddleware.mfaSetup,
  asyncHandler(async (req, res) => {
    try {
      const mfaSetup = await AuthService.setupMfa(req.user!.id);
      
      res.status(200).json({
        success: true,
        message: 'MFA setup initiated. Scan the QR code with your authenticator app.',
        secret: mfaSetup.secret,
        qrCode: mfaSetup.qrCode,
        backupCodes: mfaSetup.backupCodes
      });

    } catch (error) {
      throw error;
    }
  })
);

/**
 * POST /api/auth/mfa/verify-setup
 * Verify and enable MFA
 */
router.post('/mfa/verify-setup',
  authenticateToken,
  rateLimitMiddleware.mfaSetup,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    try {
      // Validate input
      const { secret, verificationCode, backupCodes } = verifyMfaSetupSchema.parse(req.body);
      
      // Enable MFA
      await AuthService.enableMfa(req.user!.id, secret, verificationCode, backupCodes, req.ip);
      
      trackMfaOperation('setup', 'success');

      // Publish MFA enabled event
      await publishUserEvent(UserEventTypes.MFA_ENABLED, {
        userId: req.user!.id,
        email: req.user!.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(200).json({
        success: true,
        message: 'MFA enabled successfully. Store your backup codes in a safe place.'
      });

    } catch (error) {
      trackMfaOperation('setup', 'failure');
      throw error;
    }
  })
);

/**
 * POST /api/auth/mfa/disable
 * Disable MFA for user
 */
router.post('/mfa/disable',
  authenticateToken,
  rateLimitMiddleware.mfaSetup,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    try {
      // Validate input
      const { password } = disableMfaSchema.parse(req.body);
      
      // Disable MFA
      await AuthService.disableMfa(req.user!.id, password, req.ip);
      
      trackMfaOperation('disable', 'success');

      // Publish MFA disabled event
      await publishUserEvent(UserEventTypes.MFA_DISABLED, {
        userId: req.user!.id,
        email: req.user!.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully.'
      });

    } catch (error) {
      trackMfaOperation('disable', 'failure');
      throw error;
    }
  })
);

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      user: sanitizeUserForResponse(req.user!)
    });
  })
);

export { router as authRoutes };