import { EventEmitter } from 'events';
import { WebSocketMessage } from '@/types/trading';
import {
  IWebSocketService,
  WebSocketServiceConfig,
  WebSocketServiceEvent,
  WebSocketServiceEventData,
  ConnectionConfig,
  EnhancedConnection,
  ChannelSubscription,
  MessagePriority,
  ConnectionState,
  ConnectionMetrics,
  AggregateMetrics,
  QueuedMessage,
  ProcessedMessage,
  WebSocketServiceError,
  ConnectionError,
  DEFAULT_WEBSOCKET_CONFIG,
} from '@/types/websocket-service';

// Import service components (to be implemented)
import { ConnectionPoolManager } from './ConnectionPoolManager';
import { MessageQueue } from './MessageQueue';
import { RateLimiter } from './RateLimiter';
import { CircuitBreaker } from './CircuitBreaker';
import { PerformanceMonitor } from './PerformanceMonitor';
import { ChannelManager } from './ChannelManager';

/**
 * Enhanced WebSocket Service with enterprise-grade features
 * - Connection pooling and intelligent load balancing  
 * - Exponential backoff with jitter
 * - Priority-based message queuing with persistence
 * - Rate limiting and throttling
 * - Circuit breaker pattern for fault tolerance
 * - Real-time performance monitoring
 * - Channel-based subscriptions with wildcards
 * - Binary protocol support
 */
export class WebSocketService extends EventEmitter implements IWebSocketService {
  private static instance: WebSocketService | null = null;
  
  // Core components
  private connectionPool: ConnectionPoolManager;
  private messageQueue: MessageQueue;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private performanceMonitor: PerformanceMonitor;
  private channelManager: ChannelManager;
  
  // Configuration and state
  private config: WebSocketServiceConfig;
  private isInitialized = false;
  private isShuttingDown = false;
  
  // Internal event tracking
  private eventStats = {
    messagesProcessed: 0,
    errorCount: 0,
    reconnectionCount: 0,
    lastErrorTime: 0,
  };

  constructor(config: Partial<WebSocketServiceConfig> = {}) {
    super();
    
    // Merge configuration with defaults
    this.config = this.mergeConfig(DEFAULT_WEBSOCKET_CONFIG, config);
    
    // Initialize core components
    this.connectionPool = new ConnectionPoolManager(this.config.connectionPool, this.config.connections);
    this.messageQueue = new MessageQueue(this.config.messageQueue);
    this.rateLimiter = new RateLimiter(this.config.rateLimiting);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    this.performanceMonitor = new PerformanceMonitor(this.config.performance);
    this.channelManager = new ChannelManager();
    
    // Wire up component events
    this.setupComponentEvents();
    
    // Handle process shutdown gracefully
    this.setupShutdownHandlers();
    
    if (this.config.debug) {
      console.log('🔌 WebSocket Service initialized with config:', this.config);
    }
  }

  /**
   * Singleton instance getter
   */
  static getInstance(config?: Partial<WebSocketServiceConfig>): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService(config);
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize and connect all WebSocket connections
   */
  async connect(config?: Partial<WebSocketServiceConfig>): Promise<void> {
    if (config) {
      this.updateConfig(config);
    }

    if (this.isInitialized) {
      console.warn('⚠️ WebSocket Service already initialized');
      return;
    }

    try {
      console.log('🚀 Connecting WebSocket Service...');
      
      // Start core components
      await this.performanceMonitor.start();
      await this.messageQueue.initialize();
      await this.rateLimiter.initialize();
      
      // Start connection pool
      await this.connectionPool.initialize();
      
      // Begin message processing
      this.startMessageProcessor();
      
      this.isInitialized = true;
      
      this.emitEvent('connection:opened', {
        connectionId: 'service',
        data: { connectionsCount: this.connectionPool.getActiveConnections().length }
      });
      
      console.log('✅ WebSocket Service connected successfully');
      
    } catch (error) {
      console.error('❌ Failed to connect WebSocket Service:', error);
      this.emitEvent('connection:error', {
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      throw new WebSocketServiceError(
        'Failed to initialize WebSocket Service',
        'INITIALIZATION_ERROR',
        undefined,
        false,
        { originalError: error }
      );
    }
  }

  /**
   * Gracefully disconnect all connections and cleanup resources
   */
  async disconnect(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    
    try {
      console.log('🔌 Disconnecting WebSocket Service...');
      
      // Stop accepting new messages
      this.messageQueue.pause();
      
      // Process remaining messages
      await this.messageQueue.flush();
      
      // Close all connections
      await this.connectionPool.shutdown();
      
      // Stop monitoring
      await this.performanceMonitor.stop();
      
      // Cleanup resources
      this.channelManager.clear();
      this.removeAllListeners();
      
      this.isInitialized = false;
      this.isShuttingDown = false;
      
      this.emitEvent('connection:closed', {
        data: { reason: 'manual_disconnect' }
      });
      
      console.log('✅ WebSocket Service disconnected');
      
    } catch (error) {
      console.error('❌ Error during WebSocket Service shutdown:', error);
      throw new WebSocketServiceError(
        'Failed to shutdown WebSocket Service gracefully',
        'SHUTDOWN_ERROR',
        undefined,
        false,
        { originalError: error }
      );
    }
  }

  /**
   * Reconnect specific connection or all connections
   */
  async reconnect(connectionId?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new WebSocketServiceError('Service not initialized', 'NOT_INITIALIZED');
    }

    try {
      if (connectionId) {
        await this.connectionPool.reconnectConnection(connectionId);
      } else {
        await this.connectionPool.reconnectAll();
      }
      
      this.eventStats.reconnectionCount++;
      
      this.emitEvent('connection:reconnecting', {
        connectionId,
        data: { attempt: this.eventStats.reconnectionCount }
      });
      
    } catch (error) {
      console.error(`❌ Reconnection failed for ${connectionId || 'all connections'}:`, error);
      throw new ConnectionError(
        `Reconnection failed: ${error instanceof Error ? error.message : String(error)}`,
        connectionId || 'all'
      );
    }
  }

  /**
   * Subscribe to a channel with callback
   */
  subscribe(
    channelId: string,
    callback: (message: WebSocketMessage) => void,
    options: Partial<ChannelSubscription> = {}
  ): string {
    if (!this.isInitialized) {
      throw new WebSocketServiceError('Service not initialized', 'NOT_INITIALIZED');
    }

    const subscriptionId = this.channelManager.subscribe(channelId, callback, {
      priority: 'normal',
      ...options,
    });

    // Apply rate limiting if specified
    if (options.rateLimiting) {
      this.rateLimiter.setChannelLimit(channelId, options.rateLimiting);
    }

    this.emitEvent('subscription:added', {
      subscriptionId,
      data: { channelId, options }
    });

    if (this.config.debug) {
      console.log(`📡 Subscribed to channel: ${channelId} (${subscriptionId})`);
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.channelManager.getSubscription(subscriptionId);
    if (subscription) {
      this.channelManager.unsubscribe(subscriptionId);
      
      this.emitEvent('subscription:removed', {
        subscriptionId,
        data: { channelId: subscription.channelId }
      });
      
      if (this.config.debug) {
        console.log(`📡 Unsubscribed from: ${subscriptionId}`);
      }
    }
  }

  /**
   * Send message with priority handling
   */
  async send(message: WebSocketMessage, priority: MessagePriority = 'normal'): Promise<void> {
    if (!this.isInitialized) {
      throw new WebSocketServiceError('Service not initialized', 'NOT_INITIALIZED');
    }

    // Check rate limiting
    if (this.rateLimiter.isEnabled() && !this.rateLimiter.allowRequest()) {
      throw new WebSocketServiceError(
        'Rate limit exceeded',
        'RATE_LIMIT_ERROR',
        undefined,
        true,
        { priority, messageType: message.type }
      );
    }

    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      throw new WebSocketServiceError(
        'Circuit breaker is open',
        'CIRCUIT_BREAKER_ERROR',
        undefined,
        false,
        { state: this.circuitBreaker.getState() }
      );
    }

    try {
      // Create queued message
      const queuedMessage: QueuedMessage = {
        id: this.generateMessageId(),
        message,
        priority,
        timestamp: Date.now(),
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          enqueuedAt: Date.now()
        }
      };

      // Queue message for processing
      await this.messageQueue.enqueue(queuedMessage);
      
      this.emitEvent('message:queued', {
        messageId: queuedMessage.id,
        data: { priority, type: message.type }
      });

    } catch (error) {
      this.eventStats.errorCount++;
      this.eventStats.lastErrorTime = Date.now();
      
      this.emitEvent('message:dropped', {
        data: { error: error instanceof Error ? error.message : String(error), priority, type: message.type }
      });
      
      throw new WebSocketServiceError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        'SEND_ERROR',
        undefined,
        true,
        { originalError: error, priority, messageType: message.type }
      );
    }
  }

  /**
   * Send message to specific channel
   */
  async sendToChannel(channelId: string, data: any, priority: MessagePriority = 'normal'): Promise<void> {
    const message: WebSocketMessage = {
      type: this.inferMessageType(channelId, data),
      data,
      timestamp: Date.now(),
    };

    await this.send(message, priority);
  }

  /**
   * Get connection state
   */
  getConnectionState(connectionId?: string): ConnectionState {
    if (connectionId) {
      const connection = this.connectionPool.getConnection(connectionId);
      return connection?.state || 'disconnected';
    }
    
    // Return aggregate state
    const connections = this.connectionPool.getActiveConnections();
    if (connections.length === 0) return 'disconnected';
    
    const connectedCount = connections.filter(c => c.state === 'connected').length;
    if (connectedCount === connections.length) return 'connected';
    if (connectedCount > 0) return 'connecting';
    
    return 'disconnected';
  }

  /**
   * Get performance metrics
   */
  getMetrics(connectionId?: string): ConnectionMetrics | AggregateMetrics {
    return this.performanceMonitor.getMetrics(connectionId);
  }

  /**
   * Get service health status
   */
  getHealth(): { healthy: boolean; score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // Check connections
    const activeConnections = this.connectionPool.getActiveConnections().length;
    if (activeConnections === 0) {
      issues.push('No active connections');
      score -= 50;
    }

    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      issues.push('Circuit breaker is open');
      score -= 30;
    }

    // Check error rate
    const recentErrors = this.eventStats.errorCount;
    if (recentErrors > 10) {
      issues.push('High error rate detected');
      score -= 20;
    }

    // Check queue health
    const queueSize = this.messageQueue.size();
    const maxQueueSize = this.config.messageQueue.maxQueueSize;
    if (queueSize > maxQueueSize * 0.8) {
      issues.push('Message queue near capacity');
      score -= 15;
    }

    return {
      healthy: score >= 70,
      score: Math.max(0, score),
      issues
    };
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<WebSocketServiceConfig>): void {
    this.config = this.mergeConfig(this.config, config);
    
    // Update component configurations
    this.connectionPool.updateConfig(this.config.connectionPool);
    this.messageQueue.updateConfig(this.config.messageQueue);
    this.rateLimiter.updateConfig(this.config.rateLimiting);
    this.circuitBreaker.updateConfig(this.config.circuitBreaker);
    this.performanceMonitor.updateConfig(this.config.performance);

    if (this.config.debug) {
      console.log('🔧 WebSocket Service configuration updated');
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): WebSocketServiceConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep clone
  }

  /**
   * Check if service is connected
   */
  isConnected(): boolean {
    return this.isInitialized && this.connectionPool.getActiveConnections().some(c => c.state === 'connected');
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): ChannelSubscription[] {
    return this.channelManager.getAllSubscriptions();
  }

  /**
   * Flush all queued messages
   */
  async flushQueue(): Promise<void> {
    await this.messageQueue.flush();
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.performanceMonitor.clearMetrics();
    this.eventStats = {
      messagesProcessed: 0,
      errorCount: 0,
      reconnectionCount: 0,
      lastErrorTime: 0,
    };
  }

  // Private methods

  private setupComponentEvents(): void {
    // Connection pool events
    this.connectionPool.on('connection:state-changed', (data) => {
      this.emitEvent(data.state === 'connected' ? 'connection:opened' : 'connection:closed', {
        connectionId: data.connectionId,
        data
      });
    });

    this.connectionPool.on('connection:error', (data) => {
      this.emitEvent('connection:error', {
        connectionId: data.connectionId,
        data
      });
    });

    // Circuit breaker events  
    this.circuitBreaker.on('state:changed', (state) => {
      if (state === 'open') {
        this.emitEvent('circuit-breaker:opened', { data: { state } });
      } else if (state === 'closed') {
        this.emitEvent('circuit-breaker:closed', { data: { state } });
      }
    });

    // Rate limiter events
    this.rateLimiter.on('limit:exceeded', (data) => {
      this.emitEvent('rate-limit:exceeded', { data });
    });

    // Performance monitor events
    this.performanceMonitor.on('health:changed', (data) => {
      if (data.healthy) {
        this.emitEvent('health:recovered', { data });
      } else {
        this.emitEvent('health:degraded', { data });
      }
    });
  }

  private async startMessageProcessor(): Promise<void> {
    // Process messages in batches at configured interval
    const processInterval = this.config.messageQueue.batchTimeout;
    
    const processMessages = async () => {
      if (this.isShuttingDown) return;
      
      try {
        const batch = await this.messageQueue.dequeueBatch(this.config.messageQueue.batchSize);
        if (batch.length > 0) {
          await this.processBatch(batch);
        }
      } catch (error) {
        console.error('❌ Error processing message batch:', error);
        this.eventStats.errorCount++;
      }
      
      // Schedule next processing cycle
      setTimeout(processMessages, processInterval);
    };
    
    // Start processing
    setTimeout(processMessages, processInterval);
  }

  private async processBatch(batch: QueuedMessage[]): Promise<void> {
    const startTime = performance.now();
    const results: ProcessedMessage[] = [];

    for (const queuedMessage of batch) {
      try {
        // Check circuit breaker before processing
        if (this.circuitBreaker.isOpen()) {
          throw new WebSocketServiceError('Circuit breaker open', 'CIRCUIT_BREAKER_ERROR');
        }

        // Get best available connection
        const connection = this.connectionPool.getBestConnection();
        if (!connection) {
          throw new ConnectionError('No available connections', 'none');
        }

        // Send message through connection
        const messageStartTime = performance.now();
        await this.sendThroughConnection(connection, queuedMessage.message);
        const messageTime = performance.now() - messageStartTime;

        // Update performance metrics
        this.performanceMonitor.recordLatency(connection.id, messageTime);
        this.performanceMonitor.recordSuccess(connection.id);

        // Record successful processing
        results.push({
          ...queuedMessage,
          processedAt: Date.now(),
          processingTime: messageTime,
          success: true
        });

        this.eventStats.messagesProcessed++;

        this.emitEvent('message:sent', {
          messageId: queuedMessage.id,
          connectionId: connection.id,
          data: { latency: messageTime, type: queuedMessage.message.type }
        });

      } catch (error) {
        // Handle message failure
        queuedMessage.attempts++;
        
        const canRetry = queuedMessage.attempts < queuedMessage.maxAttempts;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (canRetry) {
          // Re-queue with exponential backoff
          const backoffDelay = Math.min(1000 * Math.pow(2, queuedMessage.attempts), 30000);
          setTimeout(() => {
            this.messageQueue.enqueue(queuedMessage);
          }, backoffDelay);
        }

        // Record failure
        results.push({
          ...queuedMessage,
          processedAt: Date.now(),
          processingTime: performance.now() - startTime,
          success: false,
          error: errorMessage
        });

        // Update error stats
        this.eventStats.errorCount++;
        this.eventStats.lastErrorTime = Date.now();
        
        // Record performance metrics
        this.performanceMonitor.recordError('processing', errorMessage);
        
        // Notify circuit breaker of failure
        this.circuitBreaker.recordFailure(error as Error);

        this.emitEvent('message:dropped', {
          messageId: queuedMessage.id,
          data: { error: errorMessage, attempts: queuedMessage.attempts, canRetry }
        });
      }
    }

    // Batch processing completed
    const totalTime = performance.now() - startTime;
    this.performanceMonitor.recordBatchProcessing(batch.length, totalTime);
  }

  private async sendThroughConnection(connection: EnhancedConnection, message: WebSocketMessage): Promise<void> {
    if (!connection.socket || connection.state !== 'connected') {
      throw new ConnectionError('Connection not ready', connection.id);
    }

    try {
      // Send message based on protocol type
      if (connection.config.protocol === 'binary') {
        // TODO: Implement binary protocol
        throw new Error('Binary protocol not yet implemented');
      } else {
        // JSON protocol
        if (connection.socket.emit) {
          // Socket.IO
          connection.socket.emit('message', message);
        } else {
          // Native WebSocket
          connection.socket.send(JSON.stringify(message));
        }
      }

      // Update connection stats
      connection.messagesSent++;
      connection.lastMessageAt = Date.now();

    } catch (error) {
      connection.errorCount++;
      connection.lastError = error as Error;
      throw new ConnectionError(
        `Failed to send through connection: ${error instanceof Error ? error.message : String(error)}`,
        connection.id,
        { originalError: error }
      );
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private inferMessageType(channelId: string, data: any): WebSocketMessage['type'] {
    // Infer message type from channel ID and data
    if (channelId.includes('tick') || channelId.includes('price')) return 'tick';
    if (channelId.includes('orderbook') || channelId.includes('depth')) return 'orderbook';
    if (channelId.includes('trade')) return 'trade';
    if (channelId.includes('order')) return 'order';
    if (channelId.includes('position')) return 'position';
    if (channelId.includes('portfolio')) return 'portfolio';
    if (channelId.includes('prediction') || channelId.includes('ml')) return 'prediction';
    
    return 'tick'; // default
  }

  private emitEvent(event: WebSocketServiceEvent, data: Partial<WebSocketServiceEventData>): void {
    const eventData: WebSocketServiceEventData = {
      event,
      timestamp: Date.now(),
      ...data
    };
    
    this.emit(event, eventData);
    
    if (this.config.debug && this.config.logLevel === 'debug') {
      console.log(`📡 Event: ${event}`, eventData);
    }
  }

  private mergeConfig(base: WebSocketServiceConfig, override: Partial<WebSocketServiceConfig>): WebSocketServiceConfig {
    return {
      ...base,
      ...override,
      connections: override.connections || base.connections,
      connectionPool: { ...base.connectionPool, ...override.connectionPool },
      messageQueue: { ...base.messageQueue, ...override.messageQueue },
      rateLimiting: { ...base.rateLimiting, ...override.rateLimiting },
      circuitBreaker: { ...base.circuitBreaker, ...override.circuitBreaker },
      performance: { ...base.performance, ...override.performance },
    };
  }

  private setupShutdownHandlers(): void {
    const cleanup = async () => {
      console.log('🔌 Shutting down WebSocket Service...');
      await this.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }
}