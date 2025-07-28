/**
 * WebSocket Connection Manager
 * 
 * Manages WebSocket connections, subscriptions, message routing,
 * and real-time data broadcasting with connection pooling and metrics.
 */

import WebSocket, { WebSocketServer } from 'ws';
import { createServer, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { redisService } from './redis-service';
import { kafkaService } from './kafka-service';
import { wsAuthService } from '../middleware/auth';
import { logger, wsLogger, performanceLogger } from '../utils/logger';
import {
    ExtendedWebSocket,
    ConnectionInfo,
    WSMessage,
    MessageType,
    AuthMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    DataMessage,
    ErrorMessage,
    Subscription,
    StreamEvent,
    ChannelType,
    ConnectionMetrics,
    RateLimitState
} from '../types';
import EventEmitter from 'eventemitter3';

class WebSocketManager extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private httpServer: Server | null = null;
    private connections = new Map<string, ExtendedWebSocket>();
    private subscriptions = new Map<string, Subscription>();
    private channelSubscribers = new Map<string, Set<string>>();
    private rateLimitStates = new Map<string, RateLimitState>();
    private isRunning = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private metricsInterval: NodeJS.Timeout | null = null;
    private connectionMetrics: ConnectionMetrics = {
        totalConnections: 0,
        authenticatedConnections: 0,
        connectionsPerTier: {},
        totalSubscriptions: 0,
        subscriptionsPerChannel: {},
        messagesPerSecond: 0,
        bytesPerSecond: 0,
        averageLatency: 0,
        errorRate: 0
    };
    
    constructor() {
        super();
        this.setupShutdownHandler();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ WebSocket manager is already running');
            return;
        }
        
        try {
            logger.info('🔌 Starting WebSocket server...');
            
            // Create HTTP server
            this.httpServer = createServer();
            
            // Create WebSocket server
            this.wss = new WebSocketServer({
                server: this.httpServer,
                maxPayload: config.WEBSOCKET.MAX_MESSAGE_SIZE,
                skipUTF8Validation: false,
                perMessageDeflate: config.WEBSOCKET.COMPRESSION_ENABLED ? {
                    threshold: config.SECURITY.COMPRESSION_THRESHOLD,
                    concurrencyLimit: 10,
                    memLevel: 7
                } : false
            });
            
            // Setup WebSocket event handlers
            this.setupWebSocketHandlers();
            
            // Setup Kafka event handlers
            this.setupKafkaHandlers();
            
            // Start HTTP server
            await new Promise<void>((resolve, reject) => {
                this.httpServer!.listen(config.WS_PORT, (error?: Error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            
            // Start periodic tasks
            this.startHeartbeat();
            this.startMetricsCollection();
            
            this.isRunning = true;
            logger.info(`✅ WebSocket server started on port ${config.WS_PORT}`);
            
        } catch (error) {
            logger.error('❌ Failed to start WebSocket server:', error);
            throw error;
        }
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping WebSocket server...');
        
        try {
            this.isRunning = false;
            
            // Stop periodic tasks
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
                this.metricsInterval = null;
            }
            
            // Close all connections
            await this.closeAllConnections();
            
            // Close WebSocket server
            if (this.wss) {
                await new Promise<void>((resolve) => {
                    this.wss!.close(() => {
                        logger.info('✅ WebSocket server closed');
                        resolve();
                    });
                });
            }
            
            // Close HTTP server
            if (this.httpServer) {
                await new Promise<void>((resolve) => {
                    this.httpServer!.close(() => {
                        logger.info('✅ HTTP server closed');
                        resolve();
                    });
                });
            }
            
            logger.info('✅ WebSocket server stopped');
            
        } catch (error) {
            logger.error('❌ Error stopping WebSocket server:', error);
        }
    }
    
    private setupWebSocketHandlers(): void {
        if (!this.wss) return;
        
        this.wss.on('connection', (ws: WebSocket, request) => {
            this.handleNewConnection(ws as ExtendedWebSocket, request);
        });
        
        this.wss.on('error', (error) => {
            logger.error('WebSocket server error:', error);
        });
        
        this.wss.on('listening', () => {
            logger.info('🔌 WebSocket server listening for connections');
        });
    }
    
    private handleNewConnection(ws: ExtendedWebSocket, request: any): void {
        const connectionId = uuidv4();
        const ip = request.socket.remoteAddress || 'unknown';
        const userAgent = request.headers['user-agent'] || 'unknown';
        
        // Check connection limits
        if (this.connections.size >= config.WEBSOCKET.MAX_CONNECTIONS) {
            ws.close(1013, 'Connection limit exceeded');
            wsLogger.security('connection_limit_exceeded', 'medium', connectionId, undefined, {
                currentConnections: this.connections.size,
                maxConnections: config.WEBSOCKET.MAX_CONNECTIONS,
                ip
            });
            return;
        }
        
        // Check IP-based connection limits
        if (!this.checkIPConnectionLimit(ip)) {
            ws.close(1013, 'IP connection limit exceeded');
            wsLogger.security('ip_connection_limit_exceeded', 'medium', connectionId, undefined, { ip });
            return;
        }
        
        // Initialize connection info
        ws.connectionInfo = {
            id: connectionId,
            ip,
            userAgent,
            connectedAt: new Date(),
            lastPing: new Date(),
            subscriptions: new Set(),
            channels: new Set(),
            messageCount: 0,
            rateLimitTokens: config.WEBSOCKET.RATE_LIMIT_MAX,
            rateLimitLastRefill: new Date()
        };
        
        ws.isAlive = true;
        
        // Setup connection event handlers
        this.setupConnectionHandlers(ws);
        
        // Add to connections map
        this.connections.set(connectionId, ws);
        
        // Update metrics
        this.connectionMetrics.totalConnections++;
        
        wsLogger.connection(connectionId, 'connected', {
            ip,
            userAgent,
            totalConnections: this.connections.size
        });
    }
    
    private setupConnectionHandlers(ws: ExtendedWebSocket): void {
        const connectionId = ws.connectionInfo.id;
        
        // Message handler
        ws.on('message', async (data: Buffer) => {
            await this.handleMessage(ws, data);
        });
        
        // Pong handler for heartbeat
        ws.on('pong', () => {
            ws.isAlive = true;
            ws.connectionInfo.lastPing = new Date();
        });
        
        // Close handler
        ws.on('close', (code: number, reason: Buffer) => {
            this.handleConnectionClose(ws, code, reason.toString());
        });
        
        // Error handler
        ws.on('error', (error: Error) => {
            wsLogger.connection(connectionId, 'error', {
                error: error.message,
                ip: ws.connectionInfo.ip
            });
        });
        
        // Set connection timeout
        setTimeout(() => {
            if (!ws.connectionInfo.userId) {
                ws.close(1000, 'Authentication timeout');
                wsLogger.security('authentication_timeout', 'low', connectionId, undefined, {
                    timeout: config.WEBSOCKET.CONNECTION_TIMEOUT
                });
            }
        }, config.WEBSOCKET.CONNECTION_TIMEOUT);
    }
    
    private async handleMessage(ws: ExtendedWebSocket, data: Buffer): Promise<void> {
        const connectionId = ws.connectionInfo.id;
        const timer = performanceLogger.time('message_processing', { connectionId });
        
        try {
            // Check rate limiting
            if (!this.checkRateLimit(ws)) {
                const rateLimitMessage: ErrorMessage = {
                    type: MessageType.RATE_LIMIT_EXCEEDED,
                    timestamp: new Date().toISOString(),
                    data: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Rate limit exceeded. Please slow down your requests.'
                    }
                };
                
                ws.send(JSON.stringify(rateLimitMessage));
                return;
            }
            
            // Parse message
            let message: WSMessage;
            try {
                message = JSON.parse(data.toString());
            } catch (parseError) {
                const errorMessage: ErrorMessage = {
                    type: MessageType.ERROR,
                    timestamp: new Date().toISOString(),
                    data: {
                        code: 'INVALID_MESSAGE',
                        message: 'Invalid JSON format'
                    }
                };
                
                ws.send(JSON.stringify(errorMessage));
                return;
            }
            
            // Update connection stats
            ws.connectionInfo.messageCount++;
            
            // Log message
            wsLogger.message(
                connectionId,
                'inbound',
                message.type,
                data.length,
                ws.connectionInfo.userId,
                message.channel
            );
            
            // Route message based on type
            await this.routeMessage(ws, message);
            
            timer.end();
            
        } catch (error) {
            timer.end({ error: (error as Error).message });
            
            const errorMessage: ErrorMessage = {
                type: MessageType.ERROR,
                timestamp: new Date().toISOString(),
                data: {
                    code: 'MESSAGE_PROCESSING_ERROR',
                    message: 'Error processing message'
                }
            };
            
            ws.send(JSON.stringify(errorMessage));
            
            wsLogger.connection(connectionId, 'error', {
                error: (error as Error).message,
                messageType: 'unknown'
            });
        }
    }
    
    private async routeMessage(ws: ExtendedWebSocket, message: WSMessage): Promise<void> {
        switch (message.type) {
            case MessageType.PING:
                await this.handlePing(ws, message);
                break;
                
            case MessageType.AUTH:
                await this.handleAuth(ws, message as AuthMessage);
                break;
                
            case MessageType.SUBSCRIBE:
                await this.handleSubscribe(ws, message as SubscribeMessage);
                break;
                
            case MessageType.UNSUBSCRIBE:
                await this.handleUnsubscribe(ws, message as UnsubscribeMessage);
                break;
                
            default:
                const errorMessage: ErrorMessage = {
                    id: message.id,
                    type: MessageType.ERROR,
                    timestamp: new Date().toISOString(),
                    requestId: message.requestId,
                    data: {
                        code: 'UNKNOWN_MESSAGE_TYPE',
                        message: `Unknown message type: ${message.type}`
                    }
                };
                
                ws.send(JSON.stringify(errorMessage));
        }
    }
    
    private async handlePing(ws: ExtendedWebSocket, message: WSMessage): Promise<void> {
        const pongMessage = {
            id: message.id,
            type: MessageType.PONG,
            timestamp: new Date().toISOString(),
            requestId: message.requestId
        };
        
        ws.send(JSON.stringify(pongMessage));
    }
    
    private async handleAuth(ws: ExtendedWebSocket, message: AuthMessage): Promise<void> {
        await wsAuthService.authenticateConnection(ws, message);
        
        // Update metrics if authenticated
        if (ws.connectionInfo.userId) {
            this.connectionMetrics.authenticatedConnections++;
            
            const tier = ws.connectionInfo.user?.tier || 'FREE';
            this.connectionMetrics.connectionsPerTier[tier] = 
                (this.connectionMetrics.connectionsPerTier[tier] || 0) + 1;
        }
    }
    
    private async handleSubscribe(ws: ExtendedWebSocket, message: SubscribeMessage): Promise<void> {
        const connectionId = ws.connectionInfo.id;
        const { channel, symbols = [], filters = {} } = message.data;
        
        try {
            // Check authentication if required
            if (config.SECURITY.ENABLE_AUTH && !ws.connectionInfo.userId) {
                const errorMessage: ErrorMessage = {
                    id: message.id,
                    type: MessageType.SUBSCRIPTION_ERROR,
                    timestamp: new Date().toISOString(),
                    requestId: message.requestId,
                    data: {
                        code: 'AUTHENTICATION_REQUIRED',
                        message: 'Authentication required for subscriptions'
                    }
                };
                
                ws.send(JSON.stringify(errorMessage));
                return;
            }
            
            // Check channel access
            if (ws.connectionInfo.user) {
                const accessCheck = wsAuthService.canAccessChannel(ws.connectionInfo.user, channel);
                if (!accessCheck.allowed) {
                    const errorMessage: ErrorMessage = {
                        id: message.id,
                        type: MessageType.SUBSCRIPTION_ERROR,
                        timestamp: new Date().toISOString(),
                        requestId: message.requestId,
                        data: {
                            code: 'ACCESS_DENIED',
                            message: accessCheck.reason || 'Access denied to channel'
                        }
                    };
                    
                    ws.send(JSON.stringify(errorMessage));
                    return;
                }
            }
            
            // Check subscription limits
            const limitCheck = await wsAuthService.checkSubscriptionLimits(ws, channel);
            if (!limitCheck.allowed) {
                const errorMessage: ErrorMessage = {
                    id: message.id,
                    type: MessageType.SUBSCRIPTION_LIMIT_EXCEEDED,
                    timestamp: new Date().toISOString(),
                    requestId: message.requestId,
                    data: {
                        code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
                        message: limitCheck.reason || 'Subscription limit exceeded'
                    }
                };
                
                ws.send(JSON.stringify(errorMessage));
                return;
            }
            
            // Create subscription
            const subscriptionId = uuidv4();
            const subscription: Subscription = {
                id: subscriptionId,
                connectionId,
                userId: ws.connectionInfo.userId,
                channel,
                symbols,
                filters,
                createdAt: new Date(),
                lastActivity: new Date()
            };
            
            // Store subscription
            this.subscriptions.set(subscriptionId, subscription);
            ws.connectionInfo.subscriptions.add(subscriptionId);
            ws.connectionInfo.channels.add(channel);
            
            // Add to channel subscribers
            if (!this.channelSubscribers.has(channel)) {
                this.channelSubscribers.set(channel, new Set());
            }
            this.channelSubscribers.get(channel)!.add(connectionId);
            
            // Store in Redis
            await redisService.storeSubscription(subscription);
            
            // Update metrics
            this.connectionMetrics.totalSubscriptions++;
            this.connectionMetrics.subscriptionsPerChannel[channel] = 
                (this.connectionMetrics.subscriptionsPerChannel[channel] || 0) + 1;
            
            // Send success response
            const successMessage = {
                id: message.id,
                type: MessageType.SUBSCRIPTION_SUCCESS,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    subscriptionId,
                    channel,
                    symbols,
                    filters
                }
            };
            
            ws.send(JSON.stringify(successMessage));
            
            wsLogger.subscription(connectionId, 'subscribe', channel, symbols, ws.connectionInfo.userId);
            
        } catch (error) {
            const errorMessage: ErrorMessage = {
                id: message.id,
                type: MessageType.SUBSCRIPTION_ERROR,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    code: 'SUBSCRIPTION_ERROR',
                    message: 'Failed to create subscription'
                }
            };
            
            ws.send(JSON.stringify(errorMessage));
            
            wsLogger.connection(connectionId, 'error', {
                error: (error as Error).message,
                operation: 'subscribe'
            });
        }
    }
    
    private async handleUnsubscribe(ws: ExtendedWebSocket, message: UnsubscribeMessage): Promise<void> {
        const connectionId = ws.connectionInfo.id;
        const { channel, symbols = [] } = message.data;
        
        try {
            // Find and remove subscriptions
            const toRemove: string[] = [];
            
            for (const subscriptionId of ws.connectionInfo.subscriptions) {
                const subscription = this.subscriptions.get(subscriptionId);
                if (subscription && subscription.channel === channel) {
                    if (symbols.length === 0 || symbols.some(symbol => subscription.symbols.includes(symbol))) {
                        toRemove.push(subscriptionId);
                    }
                }
            }
            
            // Remove subscriptions
            for (const subscriptionId of toRemove) {
                const subscription = this.subscriptions.get(subscriptionId);
                if (subscription) {
                    this.subscriptions.delete(subscriptionId);
                    ws.connectionInfo.subscriptions.delete(subscriptionId);
                    
                    // Remove from Redis
                    await redisService.removeSubscription(subscriptionId);
                }
            }
            
            // Remove from channel if no more subscriptions
            if (!Array.from(ws.connectionInfo.subscriptions).some(id => {
                const sub = this.subscriptions.get(id);
                return sub && sub.channel === channel;
            })) {
                ws.connectionInfo.channels.delete(channel);
                this.channelSubscribers.get(channel)?.delete(connectionId);
            }
            
            // Update metrics
            this.connectionMetrics.totalSubscriptions -= toRemove.length;
            this.connectionMetrics.subscriptionsPerChannel[channel] = 
                Math.max(0, (this.connectionMetrics.subscriptionsPerChannel[channel] || 0) - toRemove.length);
            
            // Send success response
            const successMessage = {
                id: message.id,
                type: MessageType.SUBSCRIPTION_SUCCESS,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    channel,
                    symbols,
                    unsubscribed: toRemove.length
                }
            };
            
            ws.send(JSON.stringify(successMessage));
            
            wsLogger.subscription(connectionId, 'unsubscribe', channel, symbols, ws.connectionInfo.userId);
            
        } catch (error) {
            const errorMessage: ErrorMessage = {
                id: message.id,
                type: MessageType.SUBSCRIPTION_ERROR,
                timestamp: new Date().toISOString(),
                requestId: message.requestId,
                data: {
                    code: 'UNSUBSCRIBE_ERROR',
                    message: 'Failed to unsubscribe'
                }
            };
            
            ws.send(JSON.stringify(errorMessage));
            
            wsLogger.connection(connectionId, 'error', {
                error: (error as Error).message,
                operation: 'unsubscribe'
            });
        }
    }
    
    private handleConnectionClose(ws: ExtendedWebSocket, code: number, reason: string): void {
        const connectionId = ws.connectionInfo.id;
        
        try {
            // Clean up subscriptions
            for (const subscriptionId of ws.connectionInfo.subscriptions) {
                const subscription = this.subscriptions.get(subscriptionId);
                if (subscription) {
                    this.subscriptions.delete(subscriptionId);
                    this.channelSubscribers.get(subscription.channel)?.delete(connectionId);
                    
                    // Remove from Redis (async, don't wait)
                    redisService.removeSubscription(subscriptionId).catch(error => {
                        logger.error('Failed to remove subscription from Redis:', error);
                    });
                }
            }
            
            // Remove connection
            this.connections.delete(connectionId);
            
            // Clean up Redis connection data
            redisService.removeConnection(connectionId).catch(error => {
                logger.error('Failed to remove connection from Redis:', error);
            });
            
            // Update metrics
            this.connectionMetrics.totalConnections--;
            if (ws.connectionInfo.userId) {
                this.connectionMetrics.authenticatedConnections--;
                
                const tier = ws.connectionInfo.user?.tier || 'FREE';
                this.connectionMetrics.connectionsPerTier[tier] = 
                    Math.max(0, (this.connectionMetrics.connectionsPerTier[tier] || 0) - 1);
            }
            this.connectionMetrics.totalSubscriptions -= ws.connectionInfo.subscriptions.size;
            
            wsLogger.connection(connectionId, 'disconnected', {
                code,
                reason,
                userId: ws.connectionInfo.userId,
                duration: Date.now() - ws.connectionInfo.connectedAt.getTime(),
                messageCount: ws.connectionInfo.messageCount
            });
            
        } catch (error) {
            logger.error('Error handling connection close:', error);
        }
    }
    
    // Kafka event handlers
    private setupKafkaHandlers(): void {
        // Market data events
        kafkaService.subscribe(config.KAFKA_TOPICS.MARKET_DATA, async (event: StreamEvent) => {
            await this.broadcastToChannel(config.WS_CHANNELS.MARKET_DATA, {
                type: MessageType.MARKET_DATA,
                timestamp: event.timestamp,
                data: event.data,
                symbol: event.data.symbol,
                exchange: event.data.exchange
            });
        });
        
        // Trading events
        kafkaService.subscribe(config.KAFKA_TOPICS.TRADE_EXECUTIONS, async (event: StreamEvent) => {
            if (event.userId) {
                await this.broadcastToUser(event.userId, {
                    type: MessageType.TRADE_EXECUTION,
                    timestamp: event.timestamp,
                    data: event.data
                });
            }
        });
        
        // Portfolio updates
        kafkaService.subscribe(config.KAFKA_TOPICS.PORTFOLIO_UPDATES, async (event: StreamEvent) => {
            if (event.userId) {
                await this.broadcastToUser(event.userId, {
                    type: MessageType.PORTFOLIO_UPDATE,
                    timestamp: event.timestamp,
                    data: event.data
                });
            }
        });
        
        // ML predictions
        kafkaService.subscribe(config.KAFKA_TOPICS.ML_PREDICTIONS, async (event: StreamEvent) => {
            await this.broadcastToChannel(config.WS_CHANNELS.ML_ANALYTICS, {
                type: MessageType.ML_PREDICTION,
                timestamp: event.timestamp,
                data: event.data,
                symbol: event.data.symbol
            });
        });
        
        // Risk alerts
        kafkaService.subscribe(config.KAFKA_TOPICS.RISK_ALERTS, async (event: StreamEvent) => {
            if (event.userId) {
                await this.broadcastToUser(event.userId, {
                    type: MessageType.RISK_ALERT,
                    timestamp: event.timestamp,
                    data: event.data
                });
            }
        });
        
        // User notifications
        kafkaService.subscribe(config.KAFKA_TOPICS.USER_NOTIFICATIONS, async (event: StreamEvent) => {
            if (event.userId) {
                await this.broadcastToUser(event.userId, {
                    type: MessageType.NOTIFICATION,
                    timestamp: event.timestamp,
                    data: event.data
                });
            }
        });
        
        // System events
        kafkaService.subscribe(config.KAFKA_TOPICS.SYSTEM_EVENTS, async (event: StreamEvent) => {
            await this.broadcastToChannel(config.WS_CHANNELS.SYSTEM_STATUS, {
                type: MessageType.SYSTEM_STATUS,
                timestamp: event.timestamp,
                data: event.data
            });
        });
    }
    
    // Broadcasting methods
    async broadcastToChannel(channel: string, message: Partial<DataMessage>): Promise<void> {
        const subscribers = this.channelSubscribers.get(channel);
        if (!subscribers || subscribers.size === 0) {
            return;
        }
        
        const fullMessage: DataMessage = {
            id: uuidv4(),
            type: message.type || MessageType.MARKET_DATA,
            timestamp: message.timestamp || new Date().toISOString(),
            channel,
            data: message.data,
            symbol: message.symbol,
            exchange: message.exchange,
            userId: message.userId
        };
        
        const messageStr = JSON.stringify(fullMessage);
        const messageSize = Buffer.byteLength(messageStr);
        let sentCount = 0;
        const startTime = Date.now();
        
        for (const connectionId of subscribers) {
            const ws = this.connections.get(connectionId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Check if user can receive this specific message
                if (this.canReceiveMessage(ws, fullMessage)) {
                    ws.send(messageStr);
                    sentCount++;
                    
                    wsLogger.message(
                        connectionId,
                        'outbound',
                        fullMessage.type,
                        messageSize,
                        ws.connectionInfo.userId,
                        channel
                    );
                }
            }
        }
        
        const latency = Date.now() - startTime;
        
        wsLogger.broadcast(channel, fullMessage.type, sentCount, messageSize, latency);
    }
    
    async broadcastToUser(userId: string, message: Partial<DataMessage>): Promise<void> {
        const userConnections = await redisService.getUserConnections(userId);
        if (userConnections.length === 0) {
            return;
        }
        
        const fullMessage: DataMessage = {
            id: uuidv4(),
            type: message.type || MessageType.NOTIFICATION,
            timestamp: message.timestamp || new Date().toISOString(),
            data: message.data,
            userId
        };
        
        const messageStr = JSON.stringify(fullMessage);
        const messageSize = Buffer.byteLength(messageStr);
        let sentCount = 0;
        
        for (const connectionId of userConnections) {
            const ws = this.connections.get(connectionId);
            if (ws && ws.readyState === WebSocket.OPEN && ws.connectionInfo.userId === userId) {
                ws.send(messageStr);
                sentCount++;
                
                wsLogger.message(
                    connectionId,
                    'outbound',
                    fullMessage.type,
                    messageSize,
                    userId
                );
            }
        }
        
        if (sentCount > 0) {
            wsLogger.broadcast('user', fullMessage.type, sentCount, messageSize);
        }
    }
    
    private canReceiveMessage(ws: ExtendedWebSocket, message: DataMessage): boolean {
        // Check if user has subscriptions to this channel
        if (!ws.connectionInfo.channels.has(message.channel || '')) {
            return false;
        }
        
        // Check symbol filtering if applicable
        if (message.symbol) {
            const hasSymbolSubscription = Array.from(ws.connectionInfo.subscriptions).some(subId => {
                const subscription = this.subscriptions.get(subId);
                return subscription && 
                       subscription.channel === message.channel &&
                       (subscription.symbols.length === 0 || subscription.symbols.includes(message.symbol!));
            });
            
            if (!hasSymbolSubscription) {
                return false;
            }
        }
        
        return true;
    }
    
    // Utility methods
    private checkIPConnectionLimit(ip: string): boolean {
        if (!config.WEBSOCKET.PER_IP_LIMIT) return true;
        
        let ipConnectionCount = 0;
        for (const ws of this.connections.values()) {
            if (ws.connectionInfo.ip === ip) {
                ipConnectionCount++;
            }
        }
        
        return ipConnectionCount < config.WEBSOCKET.PER_IP_LIMIT;
    }
    
    private checkRateLimit(ws: ExtendedWebSocket): boolean {
        if (!config.SECURITY.ENABLE_RATE_LIMITING) return true;
        
        const now = new Date();
        const timeDiff = now.getTime() - ws.connectionInfo.rateLimitLastRefill.getTime();
        
        // Refill tokens based on time passed
        if (timeDiff >= config.WEBSOCKET.RATE_LIMIT_WINDOW) {
            ws.connectionInfo.rateLimitTokens = config.WEBSOCKET.RATE_LIMIT_MAX;
            ws.connectionInfo.rateLimitLastRefill = now;
        }
        
        // Check if tokens available
        if (ws.connectionInfo.rateLimitTokens <= 0) {
            wsLogger.rateLimit(
                ws.connectionInfo.id,
                'message_rate_limit',
                0,
                config.WEBSOCKET.RATE_LIMIT_MAX,
                ws.connectionInfo.userId
            );
            return false;
        }
        
        // Consume token
        ws.connectionInfo.rateLimitTokens--;
        return true;
    }
    
    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            for (const [connectionId, ws] of this.connections) {
                if (!ws.isAlive) {
                    wsLogger.connection(connectionId, 'disconnected', {
                        reason: 'heartbeat_timeout'
                    });
                    ws.terminate();
                    continue;
                }
                
                ws.isAlive = false;
                ws.ping();
            }
        }, config.WEBSOCKET.HEARTBEAT_INTERVAL);
    }
    
    private startMetricsCollection(): void {
        this.metricsInterval = setInterval(() => {
            this.updateMetrics();
            
            // Log metrics
            wsLogger.performance(
                'connection_metrics',
                this.connectionMetrics.totalConnections,
                'connections',
                {
                    authenticated: this.connectionMetrics.authenticatedConnections,
                    subscriptions: this.connectionMetrics.totalSubscriptions,
                    messagesPerSecond: this.connectionMetrics.messagesPerSecond
                }
            );
        }, config.MONITORING.METRICS_INTERVAL);
    }
    
    private updateMetrics(): void {
        // Update basic counts
        this.connectionMetrics.totalConnections = this.connections.size;
        this.connectionMetrics.totalSubscriptions = this.subscriptions.size;
        
        // Calculate connections per tier
        const tierCounts: Record<string, number> = {};
        let authenticatedCount = 0;
        
        for (const ws of this.connections.values()) {
            if (ws.connectionInfo.userId) {
                authenticatedCount++;
                const tier = ws.connectionInfo.user?.tier || 'FREE';
                tierCounts[tier] = (tierCounts[tier] || 0) + 1;
            }
        }
        
        this.connectionMetrics.authenticatedConnections = authenticatedCount;
        this.connectionMetrics.connectionsPerTier = tierCounts;
        
        // Calculate subscriptions per channel
        const channelCounts: Record<string, number> = {};
        for (const subscription of this.subscriptions.values()) {
            channelCounts[subscription.channel] = (channelCounts[subscription.channel] || 0) + 1;
        }
        this.connectionMetrics.subscriptionsPerChannel = channelCounts;
    }
    
    private async closeAllConnections(): Promise<void> {
        const closePromises: Promise<void>[] = [];
        
        for (const [connectionId, ws] of this.connections) {
            closePromises.push(
                new Promise<void>((resolve) => {
                    ws.close(1001, 'Server shutdown');
                    setTimeout(resolve, 100); // Give some time for graceful close
                })
            );
        }
        
        await Promise.all(closePromises);
        this.connections.clear();
    }
    
    private setupShutdownHandler(): void {
        process.on('SIGTERM', () => this.stop());
        process.on('SIGINT', () => this.stop());
    }
    
    // Public API
    getMetrics(): ConnectionMetrics {
        return { ...this.connectionMetrics };
    }
    
    getConnectionCount(): number {
        return this.connections.size;
    }
    
    getChannelSubscriberCount(channel: string): number {
        return this.channelSubscribers.get(channel)?.size || 0;
    }
    
    async healthCheck(): Promise<boolean> {
        return this.isRunning && this.wss !== null;
    }
    
    get running(): boolean {
        return this.isRunning;
    }
}

// Global WebSocket manager instance
export const wsManager = new WebSocketManager();

// Initialize WebSocket server
export const initializeWebSocketServer = async (): Promise<void> => {
    await wsManager.start();
};

// Stop WebSocket server
export const stopWebSocketServer = async (): Promise<void> => {
    await wsManager.stop();
};