/**
 * Authentication Middleware for API Gateway
 * 
 * Handles JWT token validation, API key authentication, and user context
 * extraction with caching and rate limiting integration.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { database } from '../database/connection';
import { redisService } from '../services/redis-service';
import { logger, gatewayLogger, logSecurityEvent } from '../utils/logger';

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
            apiKey?: ApiKeyInfo;
            auth?: AuthContext;
            requestId?: string;
        }
    }
}

interface AuthenticatedUser {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    tier?: string;
    sessionId?: string;
}

interface ApiKeyInfo {
    id: string;
    userId: string;
    name: string;
    tier: string;
    scopes: string[];
    rateLimitOverride?: any;
    lastUsedAt?: Date;
}

interface AuthContext {
    type: 'jwt' | 'api_key' | 'anonymous';
    userId?: string;
    tier: string;
    permissions: string[];
    rateLimitKey: string;
}

interface JWTPayload {
    sub: string;
    email: string;
    role: string;
    permissions: string[];
    tier?: string;
    sessionId?: string;
    iat: number;
    exp: number;
    iss: string;
    aud: string;
}

class AuthenticationService {
    private readonly jwtSecret = config.JWT_SECRET;
    private readonly apiKeyHeader = config.API_KEY_HEADER;

    async validateJWTToken(token: string): Promise<AuthenticatedUser | null> {
        try {
            // Check if token is blacklisted
            const tokenId = this.extractTokenId(token);
            if (tokenId && await redisService.isTokenBlacklisted(tokenId)) {
                logSecurityEvent('jwt_blacklisted_token_used', 'high', { tokenId });
                return null;
            }

            // Verify JWT
            const decoded = jwt.verify(token, this.jwtSecret, {
                issuer: config.JWT_ISSUER,
                audience: config.JWT_AUDIENCE
            }) as JWTPayload;

            // Validate required fields
            if (!decoded.sub || !decoded.email || !decoded.role) {
                logSecurityEvent('jwt_invalid_payload', 'medium', { payload: decoded });
                return null;
            }

            // Check if session is still valid (if session-based)
            if (decoded.sessionId) {
                const session = await redisService.getSession(decoded.sessionId);
                if (!session || session.userId !== decoded.sub) {
                    logSecurityEvent('jwt_invalid_session', 'medium', { 
                        sessionId: decoded.sessionId,
                        userId: decoded.sub 
                    });
                    return null;
                }
            }

            return {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
                permissions: decoded.permissions || [],
                tier: decoded.tier || 'FREE',
                sessionId: decoded.sessionId
            };

        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                logger.debug('JWT token expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                logSecurityEvent('jwt_invalid_token', 'medium', { error: error.message });
            } else {
                logger.error('JWT validation error:', error);
            }
            return null;
        }
    }

    async validateApiKey(apiKey: string): Promise<ApiKeyInfo | null> {
        try {
            // Check cache first
            const cached = await redisService.getAPIKeyValidation(apiKey);
            if (cached) {
                logger.debug('API key validation cache hit');
                return cached;
            }

            // Hash the API key for database lookup
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

            // Query database
            const result = await database.query(`
                SELECT 
                    id, user_id, name, tier, is_active, 
                    scopes, rate_limit_override, expires_at,
                    last_used_at
                FROM gateway.api_keys 
                WHERE key_hash = $1 AND is_active = true
            `, [keyHash]);

            if (result.rows.length === 0) {
                logSecurityEvent('api_key_not_found', 'medium', { keyHash: keyHash.substring(0, 8) });
                return null;
            }

            const keyInfo = result.rows[0];

            // Check if key is expired
            if (keyInfo.expires_at && new Date(keyInfo.expires_at) < new Date()) {
                logSecurityEvent('api_key_expired', 'medium', { 
                    keyId: keyInfo.id,
                    expiresAt: keyInfo.expires_at 
                });
                return null;
            }

            const apiKeyInfo: ApiKeyInfo = {
                id: keyInfo.id,
                userId: keyInfo.user_id,
                name: keyInfo.name,
                tier: keyInfo.tier,
                scopes: keyInfo.scopes || [],
                rateLimitOverride: keyInfo.rate_limit_override,
                lastUsedAt: keyInfo.last_used_at
            };

            // Cache the validation result
            await redisService.cacheAPIKeyValidation(apiKey, apiKeyInfo, 300); // 5 minutes

            // Update last used timestamp (async, don't wait)
            this.updateApiKeyLastUsed(keyInfo.id).catch(err => 
                logger.error('Failed to update API key last used:', err)
            );

            return apiKeyInfo;

        } catch (error) {
            logger.error('API key validation error:', error);
            return null;
        }
    }

    private async updateApiKeyLastUsed(keyId: string): Promise<void> {
        try {
            await database.query(`
                UPDATE gateway.api_keys 
                SET last_used_at = NOW() 
                WHERE id = $1
            `, [keyId]);
        } catch (error) {
            logger.error('Failed to update API key last used timestamp:', error);
        }
    }

    private extractTokenId(token: string): string | null {
        try {
            const decoded = jwt.decode(token, { complete: true });
            return decoded?.header?.kid || decoded?.payload?.jti || null;
        } catch {
            return null;
        }
    }

    private generateRateLimitKey(authContext: AuthContext, ip: string): string {
        switch (authContext.type) {
            case 'jwt':
                return `user:${authContext.userId}`;
            case 'api_key':
                return `api_key:${authContext.userId}`;
            case 'anonymous':
            default:
                return `ip:${ip}`;
        }
    }

    createAuthContext(user?: AuthenticatedUser, apiKey?: ApiKeyInfo, ip?: string): AuthContext {
        if (user) {
            return {
                type: 'jwt',
                userId: user.id,
                tier: user.tier || 'FREE',
                permissions: user.permissions,
                rateLimitKey: this.generateRateLimitKey({ type: 'jwt', userId: user.id } as AuthContext, ip || '')
            };
        }

        if (apiKey) {
            return {
                type: 'api_key',
                userId: apiKey.userId,
                tier: apiKey.tier,
                permissions: apiKey.scopes,
                rateLimitKey: this.generateRateLimitKey({ type: 'api_key', userId: apiKey.userId } as AuthContext, ip || '')
            };
        }

        return {
            type: 'anonymous',
            tier: 'FREE',
            permissions: [],
            rateLimitKey: this.generateRateLimitKey({ type: 'anonymous' } as AuthContext, ip || '')
        };
    }
}

const authService = new AuthenticationService();

// Main authentication middleware
export const authenticate = (options: {
    required?: boolean;
    allowApiKey?: boolean;
    requiredPermissions?: string[];
    requiredTier?: string;
} = {}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const requestId = req.requestId || 'unknown';
        const ip = req.ip || req.connection.remoteAddress || 'unknown';

        try {
            let user: AuthenticatedUser | null = null;
            let apiKey: ApiKeyInfo | null = null;

            // Try JWT authentication first
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                user = await authService.validateJWTToken(token);
                
                if (user) {
                    gatewayLogger.auth('jwt_validated', user.id, requestId, {
                        email: user.email,
                        role: user.role,
                        tier: user.tier
                    });
                } else {
                    gatewayLogger.auth('jwt_invalid', undefined, requestId);
                }
            }

            // Try API key authentication if JWT failed and API keys are allowed
            if (!user && options.allowApiKey !== false) {
                const apiKeyValue = req.headers[config.API_KEY_HEADER.toLowerCase()] as string;
                if (apiKeyValue) {
                    apiKey = await authService.validateApiKey(apiKeyValue);
                    
                    if (apiKey) {
                        gatewayLogger.auth('api_key_validated', apiKey.userId, requestId, {
                            keyId: apiKey.id,
                            name: apiKey.name,
                            tier: apiKey.tier
                        });
                    } else {
                        gatewayLogger.auth('api_key_invalid', undefined, requestId);
                    }
                }
            }

            // Check if authentication is required
            if (options.required && !user && !apiKey) {
                logSecurityEvent('authentication_required', 'medium', { 
                    path: req.path,
                    method: req.method,
                    ip,
                    userAgent: req.headers['user-agent']
                }, requestId);

                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED',
                    message: 'This endpoint requires authentication. Provide a valid JWT token or API key.'
                });
            }

            // Create auth context
            const authContext = authService.createAuthContext(user, apiKey, ip);

            // Check required permissions
            if (options.requiredPermissions && options.requiredPermissions.length > 0) {
                const hasPermission = options.requiredPermissions.some(permission =>
                    authContext.permissions.includes(permission) || authContext.permissions.includes('*')
                );

                if (!hasPermission) {
                    logSecurityEvent('insufficient_permissions', 'medium', {
                        userId: authContext.userId,
                        requiredPermissions: options.requiredPermissions,
                        userPermissions: authContext.permissions,
                        path: req.path,
                        method: req.method
                    }, requestId);

                    return res.status(403).json({
                        error: 'Insufficient permissions',
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: `This endpoint requires one of: ${options.requiredPermissions.join(', ')}`
                    });
                }
            }

            // Check required tier
            if (options.requiredTier) {
                const tierLevels: Record<string, number> = {
                    'FREE': 0,
                    'BASIC': 1,
                    'PREMIUM': 2,
                    'ENTERPRISE': 3
                };

                const userTierLevel = tierLevels[authContext.tier] || 0;
                const requiredTierLevel = tierLevels[options.requiredTier] || 0;

                if (userTierLevel < requiredTierLevel) {
                    logSecurityEvent('insufficient_tier', 'low', {
                        userId: authContext.userId,
                        userTier: authContext.tier,
                        requiredTier: options.requiredTier,
                        path: req.path,
                        method: req.method
                    }, requestId);

                    return res.status(402).json({
                        error: 'Insufficient tier',
                        code: 'INSUFFICIENT_TIER',
                        message: `This endpoint requires ${options.requiredTier} tier or higher`
                    });
                }
            }

            // Attach to request
            req.user = user || undefined;
            req.apiKey = apiKey || undefined;
            req.auth = authContext;

            const duration = Date.now() - startTime;
            logger.debug('Authentication completed', {
                duration_ms: duration,
                authType: authContext.type,
                userId: authContext.userId,
                tier: authContext.tier,
                requestId
            });

            next();

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Authentication middleware error:', error);
            
            logSecurityEvent('authentication_error', 'high', {
                error: error instanceof Error ? error.message : 'Unknown error',
                duration_ms: duration,
                path: req.path,
                method: req.method,
                ip
            }, requestId);

            res.status(500).json({
                error: 'Authentication error',
                code: 'AUTH_ERROR',
                message: 'An error occurred during authentication'
            });
        }
    };
};

// Shorthand middleware functions
export const requireAuth = authenticate({ required: true });
export const requireApiKey = authenticate({ required: true, allowApiKey: true });
export const optionalAuth = authenticate({ required: false });

// Permission-based middleware
export const requirePermission = (permission: string) => 
    authenticate({ required: true, requiredPermissions: [permission] });

export const requirePermissions = (permissions: string[]) => 
    authenticate({ required: true, requiredPermissions: permissions });

// Tier-based middleware
export const requireTier = (tier: string) => 
    authenticate({ required: true, requiredTier: tier });

// Combined middleware
export const requireAuthAndPermission = (permission: string) => 
    authenticate({ required: true, requiredPermissions: [permission] });

export const requireAuthAndTier = (tier: string) => 
    authenticate({ required: true, requiredTier: tier });

// Utility function to check if user has permission
export const hasPermission = (req: Request, permission: string): boolean => {
    if (!req.auth) return false;
    return req.auth.permissions.includes(permission) || req.auth.permissions.includes('*');
};

// Utility function to check if user has tier
export const hasTier = (req: Request, requiredTier: string): boolean => {
    if (!req.auth) return false;
    
    const tierLevels: Record<string, number> = {
        'FREE': 0,
        'BASIC': 1,
        'PREMIUM': 2,
        'ENTERPRISE': 3
    };

    const userTierLevel = tierLevels[req.auth.tier] || 0;
    const requiredTierLevel = tierLevels[requiredTier] || 0;

    return userTierLevel >= requiredTierLevel;
};