import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { UserModel, updateUserSchema, UserRole } from '../models/user';
import { AuditLogModel } from '../models/audit-log';
import { SessionModel } from '../models/session';
import { authenticateToken, requireRole, requireOwnership, sanitizeUserForResponse } from '../middleware/auth-middleware';
import { rateLimitMiddleware } from '../middleware/rate-limiter';
import { asyncHandler } from '../middleware/error-handler';
import { inputSanitizer } from '../middleware/security';
import { NotFoundError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { publishUserEvent, UserEventTypes } from '../services/kafka-service';

const router: ExpressRouter = ExpressRouter();

// Validation schemas
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().optional(),
  preferences: z.record(z.any()).optional()
});

const getUsersQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  search: z.string().optional(),
  status: z.enum(['pending_verification', 'active', 'suspended', 'deactivated']).optional(),
  role: z.enum(['user', 'admin', 'trader', 'analyst']).optional(),
  sortBy: z.enum(['created_at', 'last_login_at', 'email', 'username']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user!.id);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.status(200).json({
      success: true,
      user: sanitizeUserForResponse(user)
    });
  })
);

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile',
  authenticateToken,
  rateLimitMiddleware.profileUpdate,
  inputSanitizer,
  asyncHandler(async (req, res) => {
    try {
      // Validate input
      const updates = updateProfileSchema.parse(req.body);
      
      // Update user
      const updatedUser = await UserModel.update(req.user!.id, updates);
      
      if (!updatedUser) {
        throw new NotFoundError('User not found');
      }

      // Publish user updated event
      await publishUserEvent(UserEventTypes.USER_UPDATED, {
        userId: req.user!.id,
        email: req.user!.email,
        changes: Object.keys(updates),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      logger.info('User profile updated', {
        userId: req.user!.id,
        updatedFields: Object.keys(updates)
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: sanitizeUserForResponse(updatedUser)
      });

    } catch (error) {
      throw error;
    }
  })
);

/**
 * GET /api/users/:userId
 * Get user by ID (admin only or self)
 */
router.get('/:userId',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.status(200).json({
      success: true,
      user: sanitizeUserForResponse(user)
    });
  })
);

/**
 * GET /api/users
 * List users (admin only)
 */
router.get('/',
  authenticateToken,
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      // Validate query parameters
      const query = getUsersQuerySchema.parse(req.query);
      
      // This would need to be implemented in UserModel
      // For now, returning a placeholder
      
      res.status(200).json({
        success: true,
        users: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 0
        }
      });

    } catch (error) {
      throw error;
    }
  })
);

/**
 * PUT /api/users/:userId/status
 * Update user status (admin only)
 */
router.put('/:userId/status',
  authenticateToken,
  requireRole(UserRole.ADMIN),
  inputSanitizer,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { status, reason } = req.body;

    if (!['pending_verification', 'active', 'suspended', 'deactivated'].includes(status)) {
      throw new Error('Invalid status');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update user status
    const updatedUser = await UserModel.update(userId, { status });

    if (!updatedUser) {
      throw new NotFoundError('Failed to update user');
    }

    // Log the action
    logger.info('User status updated by admin', {
      adminId: req.user!.id,
      targetUserId: userId,
      oldStatus: user.status,
      newStatus: status,
      reason
    });

    // Publish appropriate event
    let eventType = UserEventTypes.USER_UPDATED;
    if (status === 'suspended') {
      // Would revoke all user sessions here
      await SessionModel.revokeAllUserSessions(userId);
    } else if (status === 'active' && user.status === 'suspended') {
      eventType = UserEventTypes.ACCOUNT_UNLOCKED;
    }

    await publishUserEvent(eventType, {
      userId,
      email: user.email,
      oldStatus: user.status,
      newStatus: status,
      adminId: req.user!.id,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      user: sanitizeUserForResponse(updatedUser)
    });
  })
);

/**
 * DELETE /api/users/:userId
 * Soft delete user (admin only or self)
 */
router.delete('/:userId',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Soft delete user
    await UserModel.softDelete(userId);

    // Revoke all sessions
    await SessionModel.revokeAllUserSessions(userId);

    // Log the action
    logger.info('User account deleted', {
      deletedBy: req.user!.id,
      targetUserId: userId,
      selfDelete: req.user!.id === userId,
      reason
    });

    // Publish user deleted event
    await publishUserEvent(UserEventTypes.USER_DELETED, {
      userId,
      email: user.email,
      deletedBy: req.user!.id,
      selfDelete: req.user!.id === userId,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully'
    });
  })
);

/**
 * GET /api/users/:userId/sessions
 * Get user's active sessions
 */
router.get('/:userId/sessions',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const sessions = await SessionModel.getActiveUserSessions(userId);

    // Remove sensitive information
    const safeSessions = sessions.map(session => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt
    }));

    res.status(200).json({
      success: true,
      sessions: safeSessions
    });
  })
);

/**
 * DELETE /api/users/:userId/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/:userId/sessions/:sessionId',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId, sessionId } = req.params;

    const session = await SessionModel.findById(sessionId);
    
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session not found');
    }

    await SessionModel.revoke(sessionId);

    logger.info('Session revoked', {
      userId,
      sessionId,
      revokedBy: req.user!.id
    });

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully'
    });
  })
);

/**
 * DELETE /api/users/:userId/sessions
 * Revoke all user sessions (except current)
 */
router.delete('/:userId/sessions',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { exceptCurrent } = req.query;

    if (exceptCurrent === 'true') {
      // This would need logic to identify current session and exclude it
      // For now, revoke all sessions
    }

    await SessionModel.revokeAllUserSessions(userId);

    logger.info('All sessions revoked', {
      userId,
      revokedBy: req.user!.id,
      exceptCurrent: exceptCurrent === 'true'
    });

    res.status(200).json({
      success: true,
      message: 'All sessions revoked successfully'
    });
  })
);

/**
 * GET /api/users/:userId/audit-log
 * Get user's audit log
 */
router.get('/:userId/audit-log',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const auditLogs = await AuditLogModel.findByUserId(userId, limit, offset);

    res.status(200).json({
      success: true,
      auditLogs,
      pagination: {
        page,
        limit,
        hasMore: auditLogs.length === limit
      }
    });
  })
);

/**
 * GET /api/users/:userId/security-events
 * Get user's security events
 */
router.get('/:userId/security-events',
  authenticateToken,
  requireOwnership('userId'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const securityEvents = await AuditLogModel.getSecurityEvents(userId, limit);

    res.status(200).json({
      success: true,
      securityEvents
    });
  })
);

export { router as userRoutes };