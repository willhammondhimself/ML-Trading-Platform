import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, User, UserRole } from '../models/user';
import { getEnvironment } from '../config/environment';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  mfaEnabled: boolean;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
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
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    // Verify JWT token
    const env = getEnvironment();
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Find user in database
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new AuthenticationError('Account is not active');
    }

    // Attach user to request
    req.user = user;
    
    logger.debug('Token authenticated successfully', {
      userId: user.id,
      email: user.email,
      role: user.role
    });

    next();
  } catch (error) {
    logger.warn('Token authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid access token'));
    } else if (error instanceof AuthenticationError) {
      next(error);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
};

/**
 * Optional authentication middleware - doesn't throw if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (token) {
      const env = getEnvironment();
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await UserModel.findById(decoded.userId);
      
      if (user && user.status === 'active') {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

/**
 * Authorization middleware factory
 */
export const requireRole = (roles: UserRole | UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Authorization failed - insufficient role', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: allowedRoles
        });
        
        throw new AuthorizationError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user owns the resource
 */
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const requestedUserId = req.params[userIdParam];
      
      // Admin users can access any resource
      if (req.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      // Check if user is accessing their own resource
      if (req.user.id !== requestedUserId) {
        logger.warn('Authorization failed - not resource owner', {
          userId: req.user.id,
          requestedUserId
        });
        
        throw new AuthorizationError('Can only access your own resources');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has verified email
 */
export const requireEmailVerification = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!req.user.emailVerified) {
      throw new AuthorizationError('Email verification required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has MFA enabled (for sensitive operations)
 */
export const requireMfa = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!req.user.mfaEnabled) {
      throw new AuthorizationError('Multi-factor authentication required for this operation');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate MFA code in request body
 */
export const validateMfaCode = (codeField: string = 'mfaCode') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!req.user.mfaEnabled) {
        next();
        return;
      }

      const mfaCode = req.body[codeField];
      if (!mfaCode || typeof mfaCode !== 'string' || mfaCode.length !== 6) {
        throw new AuthenticationError('Valid MFA code required');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check account status
 */
export const requireActiveAccount = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (req.user.status !== 'active') {
      throw new AuthorizationError('Account is not active');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Create user info object for responses (without sensitive data)
 */
export const sanitizeUserForResponse = (user: User) => {
  const { passwordHash, mfaSecret, ...sanitizedUser } = user;
  return sanitizedUser;
};