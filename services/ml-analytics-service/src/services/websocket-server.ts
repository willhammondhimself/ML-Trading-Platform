/**
 * ML Analytics WebSocket Server
 * Main WebSocket server implementation with Socket.IO
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { wsLogger, logConnectionEvent, logMessageEvent } from '@/utils/logger';
import type { ConnectionPoolManager } from './connection-pool';
import type { MessageQueueService } from './message-queue';
import type { RateLimitService } from './rate-limiter';
import type { CircuitBreakerService } from './circuit-breaker';
import type { PerformanceMonitor } from './performance-monitor';
import type { KafkaIntegration } from './kafka-integration';
import type { RedisService } from './redis-service';
import type { DatabaseService } from './database';

export interface MLAnalyticsWebSocketServerOptions {
  io: SocketIOServer;
  connectionPool: ConnectionPoolManager;
  messageQueue: MessageQueueService;
  rateLimiter: RateLimitService;
  circuitBreaker: CircuitBreakerService;
  performanceMonitor: PerformanceMonitor;
  kafkaIntegration: KafkaIntegration;
  redisService: RedisService;
  databaseService: DatabaseService;
}

export class MLAnalyticsWebSocketServer extends EventEmitter {
  private connections = new Map<string, Socket>();
  private subscriptions = new Map<string, Set<string>>();
  private isInitialized = false;

  constructor(private options: MLAnalyticsWebSocketServerOptions) {
    super();
    wsLogger.info('WebSocket server initialized');
  }

  /**
   * Initialize the WebSocket server
   */
  async initialize(): Promise<void> {
    try {
      wsLogger.info('Initializing WebSocket server...');

      // Setup Socket.IO event handlers
      this.setupSocketHandlers();

      // Setup health monitoring
      this.setupHealthMonitoring();

      this.isInitialized = true;
      wsLogger.info('✅ WebSocket server initialized successfully');

    } catch (error) {
      wsLogger.error('Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  /**
   * Setup Socket.IO connection and message handlers
   */
  private setupSocketHandlers(): void {
    this.options.io.on('connection', async (socket: Socket) => {
      const connectionId = socket.id;
      const clientIp = socket.handshake.address;

      try {
        // Rate limiting check
        const isAllowed = await this.options.rateLimiter.isAllowed(clientIp);
        if (!isAllowed) {
          socket.emit('error', { 
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Please slow down.' 
          });
          socket.disconnect(true);
          return;
        }

        // Add connection to pool (this handles all connection management)
        await this.options.connectionPool.addConnection(socket);

        // Setup connection event handlers
        this.setupConnectionHandlers(socket);

        // Send connection confirmation to match frontend client expectations
        socket.emit('ml:connected', {
          connectionId,
          timestamp: Date.now(),
          message: 'Connected to ML Analytics WebSocket Service'
        });

        wsLogger.info(`Client connected: ${connectionId}`, { 
          clientIp,
          totalConnections: this.options.connectionPool.getConnectionCount()
        });

      } catch (error) {
        wsLogger.error(`Connection setup failed for ${connectionId}:`, error);
        socket.emit('error', { 
          code: 'CONNECTION_SETUP_FAILED',
          message: 'Failed to setup connection' 
        });
        socket.disconnect(true);
      }
    });
  }

  /**
   * Setup handlers for individual socket connections
   */
  private setupConnectionHandlers(socket: Socket): void {
    const connectionId = socket.id;

    // Handle disconnection (Connection Pool Manager handles cleanup automatically)
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(connectionId, reason);
    });

    // Handle ML subscription requests
    socket.on('ml:subscribe', async (data, callback) => {
      try {
        await this.handleSubscription(connectionId, data);
        
        // Optional callback acknowledgment for frontend
        if (callback && typeof callback === 'function') {
          callback({ success: true, timestamp: Date.now() });
        }
      } catch (error) {
        wsLogger.error(`Subscription error for ${connectionId}:`, error);
        if (callback && typeof callback === 'function') {
          callback({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Subscription failed',
            timestamp: Date.now() 
          });
        }
      }
    });

    // Handle ML unsubscribe requests
    socket.on('ml:unsubscribe', async (data, callback) => {
      try {
        await this.handleUnsubscription(connectionId, data);
        
        // Optional callback acknowledgment for frontend
        if (callback && typeof callback === 'function') {
          callback({ success: true, timestamp: Date.now() });
        }
      } catch (error) {
        wsLogger.error(`Unsubscription error for ${connectionId}:`, error);
        if (callback && typeof callback === 'function') {
          callback({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unsubscription failed',
            timestamp: Date.now() 
          });
        }
      }
    });

    // Handle ping requests for connection health (Connection Pool also handles this)
    socket.on('ping', (data) => {
      socket.emit('pong', { 
        timestamp: Date.now(),
        original: data?.timestamp || null
      });
      
      // Update connection activity in pool
      this.options.connectionPool.updateConnectionActivity(connectionId);
    });

    // Handle authentication (if enabled)
    socket.on('auth', async (credentials, callback) => {
      try {
        await this.handleAuthentication(connectionId, credentials);
        
        if (callback && typeof callback === 'function') {
          callback({ success: true, timestamp: Date.now() });
        }
      } catch (error) {
        wsLogger.error(`Authentication error for ${connectionId}:`, error);
        if (callback && typeof callback === 'function') {
          callback({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Authentication failed',
            timestamp: Date.now() 
          });
        }
      }
    });

    // Handle health ping from Connection Pool Manager
    socket.on('health:ping', (data, callback) => {
      if (callback && typeof callback === 'function') {
        callback({ 
          timestamp: Date.now(),
          status: 'healthy',
          original: data?.timestamp || null
        });
      }
    });

    // Handle generic error events
    socket.on('error', (error) => {
      wsLogger.error(`Socket error for ${connectionId}:`, error);
      this.options.performanceMonitor.recordMetric('websocket_errors', 1);
    });

    // Track all message activity for performance monitoring
    socket.onAny((eventName, ...args) => {
      // Update activity in connection pool
      this.options.connectionPool.updateConnectionActivity(connectionId);
      
      // Record message metrics
      this.options.performanceMonitor.recordMetric('websocket_messages_received', 1);
      
      wsLogger.debug(`Message received: ${eventName}`, {
        connectionId,
        eventName,
        argsCount: args.length
      });
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(connectionId: string, reason: string): void {
    try {
      // Connection Pool Manager automatically handles connection removal
      // Just clean up local subscriptions tracking
      this.subscriptions.delete(connectionId);

      // Remove from local connections map (kept for backward compatibility)
      this.connections.delete(connectionId);

      logConnectionEvent('disconnect', connectionId, { 
        reason,
        totalConnections: this.options.connectionPool.getConnectionCount()
      });

      wsLogger.info(`Client disconnected: ${connectionId}`, {
        reason,
        remainingConnections: this.options.connectionPool.getConnectionCount()
      });

    } catch (error) {
      wsLogger.error(`Error handling disconnection for ${connectionId}:`, error);
    }
  }

  /**
   * Handle ML data subscription
   */
  private async handleSubscription(connectionId: string, data: any): Promise<void> {
    try {
      // Get connection from pool
      const connectionInfo = this.options.connectionPool.getConnection(connectionId);
      if (!connectionInfo) {
        wsLogger.warn(`Subscription requested for unknown connection: ${connectionId}`);
        return;
      }

      const socket = connectionInfo.socket;
      const { channels = [], types = [], symbols = [] } = data;

      // Rate limiting check for subscription requests
      const isAllowed = await this.options.rateLimiter.isAllowed(connectionInfo.clientIp, 1);
      if (!isAllowed) {
        socket.emit('error', {
          code: 'SUBSCRIPTION_RATE_LIMITED',
          message: 'Too many subscription requests'
        });
        return;
      }

      // Initialize subscription set for this connection
      if (!this.subscriptions.has(connectionId)) {
        this.subscriptions.set(connectionId, new Set());
      }

      const connectionSubs = this.subscriptions.get(connectionId)!;
      const newSubscriptions: string[] = [];

      // Add channels to subscription
      for (const channel of channels) {
        if (!connectionSubs.has(channel)) {
          connectionSubs.add(channel);
          this.options.connectionPool.addSubscription(connectionId, channel);
          newSubscriptions.push(channel);
          wsLogger.debug(`Client ${connectionId} subscribed to channel: ${channel}`);
        }
      }

      // Add types to subscription
      for (const type of types) {
        const typeKey = `type:${type}`;
        if (!connectionSubs.has(typeKey)) {
          connectionSubs.add(typeKey);
          this.options.connectionPool.addSubscription(connectionId, typeKey);
          newSubscriptions.push(typeKey);
          wsLogger.debug(`Client ${connectionId} subscribed to type: ${type}`);
        }
      }

      // Add symbol subscriptions (for trading symbols)
      for (const symbol of symbols) {
        const symbolKey = `symbol:${symbol}`;
        if (!connectionSubs.has(symbolKey)) {
          connectionSubs.add(symbolKey);
          this.options.connectionPool.addSubscription(connectionId, symbolKey);
          newSubscriptions.push(symbolKey);
          wsLogger.debug(`Client ${connectionId} subscribed to symbol: ${symbol}`);
        }
      }

      // Send subscription confirmation to match frontend client expectations
      socket.emit('ml:subscribed', {
        channels,
        types,
        symbols,
        newSubscriptions,
        totalSubscriptions: connectionSubs.size,
        timestamp: Date.now()
      });

      // Record metrics
      this.options.performanceMonitor.recordMetric('websocket_subscriptions', newSubscriptions.length);

      logMessageEvent('processed', 'subscription', 'ml:subscribe', { 
        connectionId, 
        channels, 
        types,
        symbols,
        newCount: newSubscriptions.length,
        totalCount: connectionSubs.size
      });

      wsLogger.info(`Subscription processed for ${connectionId}`, {
        channels: channels.length,
        types: types.length,
        symbols: symbols.length,
        newSubscriptions: newSubscriptions.length,
        totalSubscriptions: connectionSubs.size
      });

    } catch (error) {
      wsLogger.error(`Subscription error for ${connectionId}:`, error);
      
      const connectionInfo = this.options.connectionPool.getConnection(connectionId);
      if (connectionInfo) {
        connectionInfo.socket.emit('error', {
          code: 'SUBSCRIPTION_FAILED',
          message: 'Failed to process subscription',
          timestamp: Date.now()
        });
      }
      
      // Record error metric
      this.options.performanceMonitor.recordMetric('websocket_subscription_errors', 1);
      throw error;
    }
  }

  /**
   * Handle ML data unsubscription
   */
  private async handleUnsubscription(connectionId: string, data: any): Promise<void> {
    try {
      // Get connection from pool
      const connectionInfo = this.options.connectionPool.getConnection(connectionId);
      if (!connectionInfo) {
        wsLogger.warn(`Unsubscription requested for unknown connection: ${connectionId}`);
        return;
      }

      const socket = connectionInfo.socket;
      const { channels = [], types = [], symbols = [] } = data;
      const connectionSubs = this.subscriptions.get(connectionId);

      if (!connectionSubs) {
        socket.emit('ml:unsubscribed', {
          channels,
          types,
          symbols,
          removedSubscriptions: [],
          totalSubscriptions: 0,
          timestamp: Date.now()
        });
        return;
      }

      const removedSubscriptions: string[] = [];

      // Remove channels from subscription
      for (const channel of channels) {
        if (connectionSubs.has(channel)) {
          connectionSubs.delete(channel);
          this.options.connectionPool.removeSubscription(connectionId, channel);
          removedSubscriptions.push(channel);
          wsLogger.debug(`Client ${connectionId} unsubscribed from channel: ${channel}`);
        }
      }

      // Remove types from subscription
      for (const type of types) {
        const typeKey = `type:${type}`;
        if (connectionSubs.has(typeKey)) {
          connectionSubs.delete(typeKey);
          this.options.connectionPool.removeSubscription(connectionId, typeKey);
          removedSubscriptions.push(typeKey);
          wsLogger.debug(`Client ${connectionId} unsubscribed from type: ${type}`);
        }
      }

      // Remove symbol subscriptions
      for (const symbol of symbols) {
        const symbolKey = `symbol:${symbol}`;
        if (connectionSubs.has(symbolKey)) {
          connectionSubs.delete(symbolKey);
          this.options.connectionPool.removeSubscription(connectionId, symbolKey);
          removedSubscriptions.push(symbolKey);
          wsLogger.debug(`Client ${connectionId} unsubscribed from symbol: ${symbol}`);
        }
      }

      // Send unsubscription confirmation to match frontend client expectations
      socket.emit('ml:unsubscribed', {
        channels,
        types,
        symbols,
        removedSubscriptions,
        totalSubscriptions: connectionSubs.size,
        timestamp: Date.now()
      });

      // Record metrics
      this.options.performanceMonitor.recordMetric('websocket_unsubscriptions', removedSubscriptions.length);

      logMessageEvent('processed', 'unsubscription', 'ml:unsubscribe', { 
        connectionId, 
        channels, 
        types,
        symbols,
        removedCount: removedSubscriptions.length,
        remainingCount: connectionSubs.size
      });

      wsLogger.info(`Unsubscription processed for ${connectionId}`, {
        channels: channels.length,
        types: types.length,
        symbols: symbols.length,
        removedSubscriptions: removedSubscriptions.length,
        remainingSubscriptions: connectionSubs.size
      });

    } catch (error) {
      wsLogger.error(`Unsubscription error for ${connectionId}:`, error);
      
      const connectionInfo = this.options.connectionPool.getConnection(connectionId);
      if (connectionInfo) {
        connectionInfo.socket.emit('error', {
          code: 'UNSUBSCRIPTION_FAILED',
          message: 'Failed to process unsubscription',
          timestamp: Date.now()
        });
      }
      
      // Record error metric
      this.options.performanceMonitor.recordMetric('websocket_unsubscription_errors', 1);
      throw error;
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuthentication(connectionId: string, credentials: any): Promise<void> {
    try {
      const socket = this.connections.get(connectionId);
      if (!socket) {
        return;
      }

      // TODO: Implement proper authentication logic
      // For now, just acknowledge the authentication
      socket.emit('auth:success', {
        authenticated: true,
        timestamp: Date.now()
      });

      wsLogger.debug(`Client ${connectionId} authenticated`);

    } catch (error) {
      wsLogger.error(`Authentication error for ${connectionId}:`, error);
      
      const socket = this.connections.get(connectionId);
      if (socket) {
        socket.emit('auth:failed', {
          error: 'Authentication failed',
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Broadcast ML prediction data to subscribed clients
   */
  async broadcastPrediction(prediction: any): Promise<void> {
    try {
      const message = {
        type: 'prediction:new',
        data: prediction,
        timestamp: Date.now(),
        messageId: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Execute through circuit breaker for fault tolerance
      await this.options.circuitBreaker.execute(async () => {
        // Queue message for reliable delivery
        await this.options.messageQueue.enqueue(message, 1); // High priority

        // Broadcast to relevant subscribers
        const sentCount = await this.broadcastToSubscribers(message, 'predictions');

        logMessageEvent('sent', message.messageId, 'prediction:new', {
          sentTo: sentCount,
          predictionId: prediction.id,
          symbol: prediction.symbol
        });

        // Record metrics
        this.options.performanceMonitor.recordMetric('predictions_broadcast', 1);
        this.options.performanceMonitor.recordMetric('predictions_sent_to_clients', sentCount);
      });

    } catch (error) {
      wsLogger.error('Failed to broadcast prediction:', error);
      this.options.performanceMonitor.recordMetric('prediction_broadcast_errors', 1);
      throw error;
    }
  }

  /**
   * Broadcast model metrics update
   */
  async broadcastModelMetrics(metrics: any): Promise<void> {
    try {
      const message = {
        type: 'model:metrics',
        data: metrics,
        timestamp: Date.now(),
        messageId: `metrics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Broadcast to model metrics subscribers
      const sentCount = await this.broadcastToSubscribers(message, 'model-metrics');

      logMessageEvent('sent', message.messageId, 'model:metrics', {
        sentTo: sentCount,
        metricsType: metrics.type
      });

    } catch (error) {
      wsLogger.error('Failed to broadcast model metrics:', error);
    }
  }

  /**
   * Broadcast feature importance update
   */
  async broadcastFeatureImportance(featureImportance: any): Promise<void> {
    try {
      const message = {
        type: 'feature:importance',
        data: featureImportance,
        timestamp: Date.now(),
        messageId: `features_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Broadcast to feature importance subscribers
      const sentCount = await this.broadcastToSubscribers(message, 'feature-importance');

      logMessageEvent('sent', message.messageId, 'feature:importance', {
        sentTo: sentCount,
        modelId: featureImportance.modelId
      });

    } catch (error) {
      wsLogger.error('Failed to broadcast feature importance:', error);
    }
  }

  /**
   * Broadcast message to subscribed clients
   */
  private async broadcastToSubscribers(message: any, channel: string): Promise<number> {
    let sentCount = 0;
    const failedSends: string[] = [];

    try {
      // Get connections subscribed to this channel from Connection Pool Manager
      const subscribedConnections = this.options.connectionPool.getConnectionsBySubscription(channel);
      
      // Also check for type-based subscriptions
      const typeSubscribedConnections = this.options.connectionPool.getConnectionsBySubscription(`type:${message.type}`);
      
      // Combine and deduplicate connections
      const allConnections = new Map<string, any>();
      
      for (const conn of subscribedConnections) {
        allConnections.set(conn.id, conn);
      }
      
      for (const conn of typeSubscribedConnections) {
        allConnections.set(conn.id, conn);
      }

      // Send message to all subscribed connections
      const sendPromises = Array.from(allConnections.values()).map(async (connectionInfo) => {
        try {
          const socket = connectionInfo.socket;
          
          // Check if connection is still healthy
          if (socket.disconnected) {
            failedSends.push(connectionInfo.id);
            return false;
          }

          // Send message based on type
          socket.emit(message.type, message.data, {
            messageId: message.messageId,
            timestamp: message.timestamp
          });

          // Record successful send
          this.options.performanceMonitor.recordMetric('websocket_messages_sent', 1);
          return true;

        } catch (error) {
          wsLogger.error(`Failed to send message to ${connectionInfo.id}:`, error);
          failedSends.push(connectionInfo.id);
          return false;
        }
      });

      // Wait for all sends to complete
      const results = await Promise.allSettled(sendPromises);
      sentCount = results.filter(result => 
        result.status === 'fulfilled' && result.value === true
      ).length;

      // Log failed sends for monitoring
      if (failedSends.length > 0) {
        wsLogger.warn(`Failed to send to ${failedSends.length} connections`, {
          channel,
          messageType: message.type,
          failedConnections: failedSends.slice(0, 5), // Log first 5 failed connections
          totalFailed: failedSends.length
        });

        this.options.performanceMonitor.recordMetric('websocket_send_failures', failedSends.length);
      }

      wsLogger.debug(`Broadcast completed`, {
        channel,
        messageType: message.type,
        sent: sentCount,
        failed: failedSends.length,
        total: allConnections.size
      });

      return sentCount;

    } catch (error) {
      wsLogger.error('Error during broadcast:', error);
      this.options.performanceMonitor.recordMetric('websocket_broadcast_errors', 1);
      return 0;
    }
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    // Periodic connection cleanup
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000); // Every minute

    // Performance metrics collection
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 30000); // Every 30 seconds
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnections(): void {
    const staleConnections: string[] = [];

    for (const [connectionId, socket] of this.connections.entries()) {
      if (socket.disconnected) {
        staleConnections.push(connectionId);
      }
    }

    for (const connectionId of staleConnections) {
      this.connections.delete(connectionId);
      this.subscriptions.delete(connectionId);
    }

    if (staleConnections.length > 0) {
      wsLogger.debug(`Cleaned up ${staleConnections.length} stale connections`);
    }
  }

  /**
   * Collect performance metrics
   */
  private collectPerformanceMetrics(): void {
    const metrics = {
      connections: this.connections.size,
      subscriptions: this.subscriptions.size,
      timestamp: Date.now()
    };

    this.options.performanceMonitor.recordMetric('websocket_connections', metrics.connections);
    this.options.performanceMonitor.recordMetric('websocket_subscriptions', metrics.subscriptions);

    wsLogger.debug('Performance metrics collected', metrics);
  }

  /**
   * Shutdown the WebSocket server
   */
  async shutdown(): Promise<void> {
    try {
      wsLogger.info('Shutting down WebSocket server...');

      // Disconnect all clients
      for (const [connectionId, socket] of this.connections.entries()) {
        socket.emit('server:shutdown', { 
          message: 'Server is shutting down',
          timestamp: Date.now()
        });
        socket.disconnect(true);
      }

      // Clear connections and subscriptions
      this.connections.clear();
      this.subscriptions.clear();

      this.isInitialized = false;
      wsLogger.info('✅ WebSocket server shutdown complete');

    } catch (error) {
      wsLogger.error('Error during WebSocket server shutdown:', error);
      throw error;
    }
  }

  /**
   * Get server status
   */
  getStatus(): any {
    const poolStats = this.options.connectionPool.getStats();
    
    return {
      initialized: this.isInitialized,
      connections: {
        total: this.options.connectionPool.getConnectionCount(),
        healthy: this.options.connectionPool.getHealthyConnectionCount(),
        peak: poolStats.peakConnections || 0
      },
      subscriptions: {
        total: Array.from(this.subscriptions.values())
          .reduce((sum, subs) => sum + subs.size, 0),
        uniqueChannels: new Set(
          Array.from(this.subscriptions.values())
            .flatMap(subs => Array.from(subs))
        ).size
      },
      performance: {
        messagesProcessed: poolStats.totalMessagesProcessed || 0,
        connectionsPerSecond: poolStats.connectionsPerSecond || 0
      },
      loadBalancing: poolStats.loadBalancing,
      timestamp: Date.now()
    };
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return (
      this.isInitialized &&
      this.options.connectionPool.isHealthy() &&
      this.options.redisService.isConnected() &&
      this.options.rateLimiter.isHealthy() &&
      this.options.circuitBreaker.isHealthy()
    );
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.options.connectionPool.getConnectionCount();
  }

  /**
   * Get healthy connection count
   */
  getHealthyConnectionCount(): number {
    return this.options.connectionPool.getHealthyConnectionCount();
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): any {
    const subscriptionsByChannel = new Map<string, number>();
    const subscriptionsByType = new Map<string, number>();
    
    for (const subscriptions of this.subscriptions.values()) {
      for (const subscription of subscriptions) {
        if (subscription.startsWith('type:')) {
          const type = subscription.substring(5);
          subscriptionsByType.set(type, (subscriptionsByType.get(type) || 0) + 1);
        } else if (subscription.startsWith('symbol:')) {
          const symbol = subscription.substring(7);
          subscriptionsByChannel.set(`symbol:${symbol}`, (subscriptionsByChannel.get(`symbol:${symbol}`) || 0) + 1);
        } else {
          subscriptionsByChannel.set(subscription, (subscriptionsByChannel.get(subscription) || 0) + 1);
        }
      }
    }

    return {
      totalSubscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, subs) => sum + subs.size, 0),
      uniqueChannels: subscriptionsByChannel.size + subscriptionsByType.size,
      byChannel: Object.fromEntries(subscriptionsByChannel),
      byType: Object.fromEntries(subscriptionsByType),
      connectionsWithSubscriptions: this.subscriptions.size
    };
  }

  /**
   * Send message to specific connection
   */
  async sendToConnection(connectionId: string, messageType: string, data: any): Promise<boolean> {
    try {
      const connectionInfo = this.options.connectionPool.getConnection(connectionId);
      if (!connectionInfo) {
        wsLogger.warn(`Attempt to send to unknown connection: ${connectionId}`);
        return false;
      }

      if (connectionInfo.socket.disconnected) {
        wsLogger.warn(`Attempt to send to disconnected connection: ${connectionId}`);
        return false;
      }

      connectionInfo.socket.emit(messageType, data, {
        timestamp: Date.now()
      });

      return true;

    } catch (error) {
      wsLogger.error(`Failed to send message to connection ${connectionId}:`, error);
      return false;
    }
  }
}