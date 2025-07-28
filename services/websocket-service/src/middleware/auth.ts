/**
 * Authentication Middleware for WebSocket Service
 * 
 * Handles JWT token validation and user context extraction
 * for WebSocket connections with caching and rate limiting.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redisService } from '../services/redis-service';
import { logger, wsLogger } from '../utils/logger';
import { AuthenticatedUser, ExtendedWebSocket, MessageType, AuthMessage, ErrorMessage } from '../types';

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

class WebSocketAuthService {
    private readonly jwtSecret = config.JWT_SECRET;
    private readonly jwtIssuer = config.JWT_ISSUER;
    private readonly jwtAudience = config.JWT_AUDIENCE;
    
    /**
     * Validate JWT token for WebSocket connection
     */
    async validateToken(token: string): Promise<AuthenticatedUser | null> {
        try {
            // Check if token is blacklisted in cache
            const blacklisted = await redisService.getCache(`blacklist:${this.getTokenId(token)}`);
            if (blacklisted) {
                wsLogger.security('blacklisted_token_used', 'high', undefined, undefined, {
                    tokenId: this.getTokenId(token)
                });
                return null;
            }
            
            // Verify JWT signature and claims
            const decoded = jwt.verify(token, this.jwtSecret, {
                issuer: this.jwtIssuer,
                audience: this.jwtAudience
            }) as JWTPayload;
            
            // Validate required fields
            if (!decoded.sub || !decoded.email || !decoded.role) {
                wsLogger.security('invalid_token_payload', 'medium', undefined, undefined, {
                    payload: { sub: !!decoded.sub, email: !!decoded.email, role: !!decoded.role }
                });
                return null;
            }
            
            // Check session validity if session-based
            if (decoded.sessionId) {
                const sessionKey = `session:${decoded.sessionId}`;
                const session = await redisService.getCache(sessionKey);
                
                if (!session || session.userId !== decoded.sub) {
                    wsLogger.security('invalid_session', 'medium', undefined, decoded.sub, {
                        sessionId: decoded.sessionId
                    });
                    return null;
                }
            }
            
            // Cache valid user info
            const user: AuthenticatedUser = {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
                tier: (decoded.tier as any) || 'FREE',
                permissions: decoded.permissions || [],
                sessionId: decoded.sessionId
            };
            
            // Cache user info for faster lookups
            await redisService.setCache(`user:${user.id}`, user, 300); // 5 minutes
            
            return user;
            
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                wsLogger.security('token_expired', 'low', undefined, undefined, {
                    expiredAt: error.expiredAt
                });
            } else if (error instanceof jwt.JsonWebTokenError) {
                wsLogger.security('invalid_token', 'medium', undefined, undefined, {
                    error: error.message
                });
            } else {
                logger.error('JWT validation error:', error);
            }
            
            return null;
        }
    }
    
    /**
     * Extract token ID from JWT for blacklist checking
     */
    private getTokenId(token: string): string | null {
        try {
            const decoded = jwt.decode(token, { complete: true });
            return decoded?.header?.kid || decoded?.payload?.jti || null;
        } catch {
            return null;
        }
    }
    
    /**
     * Authenticate WebSocket connection
     */
    async authenticateConnection(ws: ExtendedWebSocket, message: AuthMessage): Promise<void> {
        const connectionId = ws.connectionInfo.id;
        
        try {
            // Validate token
            const user = await this.validateToken(message.data.token);
            
            if (!user) {
                const errorMessage: ErrorMessage = {
                    id: message.id,
                    type: MessageType.AUTH_ERROR,
                    timestamp: new Date().toISOString(),
                    requestId: message.requestId,
                    data: {
                        code: 'INVALID_TOKEN',
                        message: 'Authentication failed: Invalid or expired token'
                    }
                };
                
                ws.send(JSON.stringify(errorMessage));
                
                wsLogger.connection(connectionId, 'error', {
                    reason: 'authentication_failed',
                    ip: ws.connectionInfo.ip
                });
                
                return;
            }
            
            // Update connection info with user data
            ws.connectionInfo.userId = user.id;
            ws.connectionInfo.user = user;
            
            // Store connection in Redis
            await redisService.storeConnection(ws.connectionInfo);
            
            // Send success response
            const successMessage = {
                id: message.id,
                type: MessageType.AUTH_SUCCESS,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    userId: user.id,
                    tier: user.tier,
                    permissions: user.permissions
                }
            };
            
            ws.send(JSON.stringify(successMessage));
            
            wsLogger.connection(connectionId, 'authenticated', {
                userId: user.id,
                tier: user.tier,
                email: user.email,
                role: user.role
            });
            
        } catch (error) {
            logger.error('Authentication error:', error);
            
            const errorMessage: ErrorMessage = {
                id: message.id,
                type: MessageType.AUTH_ERROR,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    code: 'AUTH_ERROR',
                    message: 'Authentication failed: Internal error'
                }
            };
            
            ws.send(JSON.stringify(errorMessage));
            
            wsLogger.connection(connectionId, 'error', {
                reason: 'authentication_error',
                error: (error as Error).message
            });
        }
    }
    
    /**
     * Check if user has required permission
     */
    hasPermission(user: AuthenticatedUser, permission: string): boolean {
        return user.permissions.includes(permission) || user.permissions.includes('*');
    }
    
    /**
     * Check if user has required tier level
     */
    hasTierLevel(user: AuthenticatedUser, requiredTier: string): boolean {
        const tierLevels: Record<string, number> = {
            'FREE': 0,
            'BASIC': 1,
            'PREMIUM': 2,
            'ENTERPRISE': 3
        };
        
        const userLevel = tierLevels[user.tier] || 0;
        const requiredLevel = tierLevels[requiredTier] || 0;
        
        return userLevel >= requiredLevel;
    }
    
    /**
     * Get subscription limits for user tier
     */
    getSubscriptionLimits(tier: string): {
        maxChannels: number;
        maxSymbols: number;
        rateLimit: number;
    } {
        const limits = config.SUBSCRIPTION_LIMITS[tier as keyof typeof config.SUBSCRIPTION_LIMITS] || 
                      config.SUBSCRIPTION_LIMITS.FREE;
        
        return {
            maxChannels: limits.MAX_CHANNELS,
            maxSymbols: limits.MAX_SYMBOLS,
            rateLimit: limits.RATE_LIMIT
        };
    }
    
    /**
     * Validate channel access for user
     */
    canAccessChannel(user: AuthenticatedUser, channel: string): {
        allowed: boolean;
        reason?: string;
    } {
        // Channel-specific access rules
        const channelRules: Record<string, {
            requiresAuth: boolean;
            requiredTier?: string;
            requiredPermissions?: string[];
        }> = {
            [config.WS_CHANNELS.MARKET_DATA]: {
                requiresAuth: false // Public market data
            },
            [config.WS_CHANNELS.PORTFOLIO]: {
                requiresAuth: true,
                requiredPermissions: ['portfolio:read']
            },
            [config.WS_CHANNELS.TRADING]: {
                requiresAuth: true,
                requiredTier: 'BASIC',
                requiredPermissions: ['trading:read']
            },
            [config.WS_CHANNELS.ML_ANALYTICS]: {
                requiresAuth: true,
                requiredTier: 'PREMIUM',
                requiredPermissions: ['ml:read']
            },
            [config.WS_CHANNELS.RISK_MANAGEMENT]: {
                requiresAuth: true,
                requiredPermissions: ['risk:read']
            },
            [config.WS_CHANNELS.NOTIFICATIONS]: {
                requiresAuth: true
            },
            [config.WS_CHANNELS.SYSTEM_STATUS]: {
                requiresAuth: false // Public system status
            }
        };
        
        const rule = channelRules[channel];
        if (!rule) {
            return { allowed: false, reason: 'Unknown channel' };
        }
        
        // Check tier requirement
        if (rule.requiredTier && !this.hasTierLevel(user, rule.requiredTier)) {
            return { 
                allowed: false, 
                reason: `Requires ${rule.requiredTier} tier or higher` 
            };
        }
        
        // Check permissions requirement
        if (rule.requiredPermissions) {
            const hasPermission = rule.requiredPermissions.some(permission =>
                this.hasPermission(user, permission)
            );
            
            if (!hasPermission) {
                return { 
                    allowed: false, 
                    reason: `Missing required permissions: ${rule.requiredPermissions.join(', ')}` 
                };
            }
        }
        
        return { allowed: true };
    }
    
    /**
     * Check if connection is within subscription limits
     */
    async checkSubscriptionLimits(ws: ExtendedWebSocket, channel: string): Promise<{
        allowed: boolean;
        reason?: string;
    }> {
        const user = ws.connectionInfo.user;
        if (!user) {
            return { allowed: false, reason: 'Not authenticated' };
        }
        
        const limits = this.getSubscriptionLimits(user.tier);
        const currentChannels = ws.connectionInfo.channels.size;
        const currentSubscriptions = ws.connectionInfo.subscriptions.size;
        
        // Check channel limit
        if (currentChannels >= limits.maxChannels && !ws.connectionInfo.channels.has(channel)) {
            return { 
                allowed: false, 
                reason: `Channel limit exceeded (${limits.maxChannels} max)` 
            };
        }
        
        // Additional subscription limits could be checked here
        
        return { allowed: true };
    }
    
    /**
     * Logout user and invalidate session
     */
    async logout(userId: string, sessionId?: string): Promise<void> {
        try {
            // Remove user from cache
            await redisService.setCache(`user:${userId}`, null, 1);
            
            // Invalidate session if provided
            if (sessionId) {
                await redisService.setCache(`session:${sessionId}`, null, 1);
            }
            
            // Get user connections and notify them
            const connectionIds = await redisService.getUserConnections(userId);
            
            for (const connectionId of connectionIds) {
                const connection = await redisService.getConnection(connectionId);
                if (connection) {
                    // Connection will be handled by the main WebSocket service
                    wsLogger.security('user_logged_out', 'low', connectionId, userId);
                }
            }
            
        } catch (error) {
            logger.error('Logout error:', error);
        }
    }
    
    /**
     * Blacklist token
     */
    async blacklistToken(token: string, expirationTime: Date): Promise<void> {
        try {
            const tokenId = this.getTokenId(token);
            if (!tokenId) return;
            
            const ttlSeconds = Math.max(0, Math.floor((expirationTime.getTime() - Date.now()) / 1000));
            if (ttlSeconds > 0) {
                await redisService.setCache(`blacklist:${tokenId}`, true, ttlSeconds);
                
                wsLogger.security('token_blacklisted', 'medium', undefined, undefined, {
                    tokenId,
                    ttlSeconds
                });
            }
        } catch (error) {
            logger.error('Token blacklist error:', error);
        }
    }
    
    /**
     * Get user info from cache or validate token
     */
    async getUserInfo(userId: string): Promise<AuthenticatedUser | null> {
        try {
            // Try cache first
            const cached = await redisService.getCache(`user:${userId}`);
            if (cached) {
                return cached;
            }
            
            // If not in cache, user needs to re-authenticate
            return null;
            
        } catch (error) {
            logger.error('Get user info error:', error);
            return null;
        }
    }
}

// Global authentication service instance
export const wsAuthService = new WebSocketAuthService();

// Export for middleware use
export { WebSocketAuthService };