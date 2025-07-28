import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnvironment } from '../config/environment';
import { UserSessionCache } from '../services/redis-service';
import { logger } from '../utils/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        sessionId?: string;
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
      return;
    }

    const env = getEnvironment();
    
    // Verify JWT token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    
    // Check if session is still valid in cache
    if (decoded.sessionId) {
      const sessionData = await UserSessionCache.getUserSession(decoded.userId);
      
      if (!sessionData || sessionData.sessionId !== decoded.sessionId) {
        res.status(401).json({
          error: 'Invalid or expired session',
          code: 'SESSION_INVALID'
        });
        return;
      }

      // Update session last activity
      await UserSessionCache.setUserSession(decoded.userId, {
        ...sessionData,
        lastActivity: new Date().toISOString()
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId
    };

    next();

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
        return;
      }
      
      res.status(401).json({
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
      return;
    }

    logger.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware to check user roles
 */
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole: user.role
      });
      return;
    }

    next();
  };
};

/**
 * Middleware for admin-only routes
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware for trader-level access (traders and admins)
 */
export const requireTrader = requireRole(['trader', 'admin']);

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const env = getEnvironment();
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        sessionId: decoded.sessionId
      };
    }

    next();

  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

/**
 * Rate limiting by user ID
 */
export const rateLimitByUser = (maxRequests: number, windowMs: number) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.id;
    
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const userKey = userId;
    const userLimit = requestCounts.get(userKey);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize counter
      requestCounts.set(userKey, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (userLimit.count >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
      return;
    }

    userLimit.count++;
    next();
  };
};

/**
 * Validate API key for system-to-system communication
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const env = getEnvironment();

  if (!apiKey) {
    res.status(401).json({
      error: 'API key required',
      code: 'API_KEY_MISSING'
    });
    return;
  }

  if (apiKey !== env.INTERNAL_API_KEY) {
    res.status(401).json({
      error: 'Invalid API key',
      code: 'API_KEY_INVALID'
    });
    return;
  }

  next();
};