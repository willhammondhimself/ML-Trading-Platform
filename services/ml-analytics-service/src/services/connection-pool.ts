/**
 * Connection Pool Manager
 * Advanced WebSocket connection pool with load balancing and health monitoring
 */

import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import { wsLogger, logConnectionEvent, createPerformanceTimer } from '@/utils/logger';
import type { ConnectionPoolConfig } from '@/config';
import type { RedisService } from './redis-service';
import type { PerformanceMonitor } from './performance-monitor';

export interface ConnectionPoolOptions extends ConnectionPoolConfig {
  redisService: RedisService;
  performanceMonitor: PerformanceMonitor;
}

export interface ConnectionInfo {
  socket: Socket;
  id: string;
  connectedAt: number;
  lastActivityAt: number;
  messageCount: number;
  subscriptions: Set<string>;
  clientIp: string;
  userAgent?: string;
  authenticated: boolean;
  health: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    lastPing: number;
    pingCount: number;
    avgResponseTime: number;
  };
}

export type LoadBalancingStrategy = 'round-robin' | 'least-connections' | 'weighted' | 'random';

export class ConnectionPoolManager extends EventEmitter {
  private connections = new Map<string, ConnectionInfo>();
  private healthyConnections = new Set<string>();
  private unhealthyConnections = new Set<string>();
  private connectionsByIp = new Map<string, Set<string>>();
  
  private isInitialized = false;
  private currentRoundRobinIndex = 0;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  
  // Connection statistics
  private stats = {
    totalConnections: 0,
    peakConnections: 0,
    totalMessagesProcessed: 0,
    connectionsPerSecond: 0,
    lastStatsUpdate: Date.now()
  };

  constructor(private options: ConnectionPoolOptions) {
    super();
    wsLogger.info('Connection pool manager initialized', {
      maxConnections: options.maxConnections,
      minConnections: options.minConnections,
      loadBalancing: options.loadBalancing
    });
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    try {
      wsLogger.info('Initializing connection pool...');

      // Start health monitoring
      this.startHealthMonitoring();

      // Start metrics collection
      this.startMetricsCollection();

      // Setup Redis connection state persistence
      await this.setupRedisPersistence();

      this.isInitialized = true;
      wsLogger.info('✅ Connection pool initialized successfully');

    } catch (error) {
      wsLogger.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }

  /**
   * Add a connection to the pool
   */
  async addConnection(socket: Socket): Promise<void> {
    const timer = createPerformanceTimer('connection-pool-add');
    
    try {
      const connectionId = socket.id;
      const clientIp = socket.handshake.address;
      const userAgent = socket.handshake.headers['user-agent'];

      // Check connection limits
      if (this.connections.size >= this.options.maxConnections) {
        wsLogger.warn('Connection pool at maximum capacity', {
          current: this.connections.size,
          max: this.options.maxConnections,
          clientIp
        });
        
        socket.emit('error', {
          code: 'POOL_FULL',
          message: 'Connection pool is at maximum capacity'
        });
        socket.disconnect(true);
        return;
      }

      // Check per-IP connection limits (prevent DoS)
      const ipConnections = this.connectionsByIp.get(clientIp) || new Set();
      const maxPerIp = Math.max(10, Math.floor(this.options.maxConnections / 100));
      
      if (ipConnections.size >= maxPerIp) {
        wsLogger.warn('Too many connections from single IP', {
          clientIp,
          current: ipConnections.size,
          max: maxPerIp
        });
        
        socket.emit('error', {
          code: 'TOO_MANY_CONNECTIONS',
          message: 'Too many connections from your IP address'
        });
        socket.disconnect(true);
        return;
      }

      // Create connection info
      const connectionInfo: ConnectionInfo = {
        socket,
        id: connectionId,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
        messageCount: 0,
        subscriptions: new Set(),
        clientIp,
        userAgent,
        authenticated: false,
        health: {
          status: 'healthy',
          lastPing: Date.now(),
          pingCount: 0,
          avgResponseTime: 0
        }
      };

      // Add to pool
      this.connections.set(connectionId, connectionInfo);
      this.healthyConnections.add(connectionId);

      // Track IP connections
      if (!this.connectionsByIp.has(clientIp)) {
        this.connectionsByIp.set(clientIp, new Set());
      }
      this.connectionsByIp.get(clientIp)!.add(connectionId);

      // Setup socket event handlers
      this.setupSocketHandlers(socket, connectionInfo);

      // Update statistics
      this.stats.totalConnections++;
      this.stats.peakConnections = Math.max(
        this.stats.peakConnections,
        this.connections.size
      );

      // Persist to Redis
      await this.persistConnectionState(connectionId, connectionInfo);

      logConnectionEvent('connect', connectionId, {
        clientIp,
        userAgent,
        poolSize: this.connections.size
      });

      this.emit('connection:added', connectionInfo);

    } catch (error) {
      wsLogger.error('Failed to add connection to pool:', error);
      throw error;
    } finally {
      timer.end();
    }
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection(connectionId: string, reason?: string): Promise<void> {
    const timer = createPerformanceTimer('connection-pool-remove');

    try {
      const connectionInfo = this.connections.get(connectionId);
      
      if (!connectionInfo) {
        return;
      }

      // Clean up tracking sets
      this.connections.delete(connectionId);
      this.healthyConnections.delete(connectionId);
      this.unhealthyConnections.delete(connectionId);

      // Clean up IP tracking
      const ipConnections = this.connectionsByIp.get(connectionInfo.clientIp);
      if (ipConnections) {
        ipConnections.delete(connectionId);
        if (ipConnections.size === 0) {
          this.connectionsByIp.delete(connectionInfo.clientIp);
        }
      }

      // Remove from Redis
      await this.removeConnectionState(connectionId);

      logConnectionEvent('disconnect', connectionId, {
        reason,
        clientIp: connectionInfo.clientIp,
        duration: Date.now() - connectionInfo.connectedAt,
        messageCount: connectionInfo.messageCount,
        poolSize: this.connections.size
      });

      this.emit('connection:removed', connectionInfo, reason);

    } catch (error) {
      wsLogger.error('Failed to remove connection from pool:', error);
    } finally {
      timer.end();
    }
  }

  /**
   * Get next connection using load balancing strategy
   */
  getNextConnection(excludeIds?: string[]): ConnectionInfo | null {
    const healthyIds = Array.from(this.healthyConnections)
      .filter(id => !excludeIds?.includes(id));

    if (healthyIds.length === 0) {
      return null;
    }

    let selectedId: string;

    switch (this.options.loadBalancing) {
      case 'round-robin':
        selectedId = this.getRoundRobinConnection(healthyIds);
        break;
      
      case 'least-connections':
        selectedId = this.getLeastConnectionsConnection(healthyIds);
        break;
      
      case 'weighted':
        selectedId = this.getWeightedConnection(healthyIds);
        break;
      
      case 'random':
        selectedId = healthyIds[Math.floor(Math.random() * healthyIds.length)];
        break;
      
      default:
        selectedId = this.getRoundRobinConnection(healthyIds);
    }

    return this.connections.get(selectedId) || null;
  }

  /**
   * Get connections by subscription channel
   */
  getConnectionsBySubscription(channel: string): ConnectionInfo[] {
    return Array.from(this.connections.values())
      .filter(conn => 
        this.healthyConnections.has(conn.id) && 
        conn.subscriptions.has(channel)
      );
  }

  /**
   * Update connection activity
   */
  updateConnectionActivity(connectionId: string): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo) {
      connectionInfo.lastActivityAt = Date.now();
      connectionInfo.messageCount++;
      this.stats.totalMessagesProcessed++;
    }
  }

  /**
   * Add subscription to connection
   */
  addSubscription(connectionId: string, channel: string): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo) {
      connectionInfo.subscriptions.add(channel);
      wsLogger.debug(`Connection ${connectionId} subscribed to ${channel}`);
    }
  }

  /**
   * Remove subscription from connection
   */
  removeSubscription(connectionId: string, channel: string): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo) {
      connectionInfo.subscriptions.delete(channel);
      wsLogger.debug(`Connection ${connectionId} unsubscribed from ${channel}`);
    }
  }

  /**
   * Set connection authentication status
   */
  setConnectionAuth(connectionId: string, authenticated: boolean): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo) {
      connectionInfo.authenticated = authenticated;
      wsLogger.debug(`Connection ${connectionId} auth status: ${authenticated}`);
    }
  }

  /**
   * Setup socket event handlers for connection monitoring
   */
  private setupSocketHandlers(socket: Socket, connectionInfo: ConnectionInfo): void {
    const connectionId = socket.id;

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.removeConnection(connectionId, reason);
    });

    // Handle ping for health monitoring
    socket.on('ping', () => {
      const pingTime = Date.now();
      connectionInfo.health.lastPing = pingTime;
      connectionInfo.health.pingCount++;
      
      socket.emit('pong', { timestamp: pingTime });
    });

    // Monitor socket errors
    socket.on('error', (error) => {
      wsLogger.error(`Socket error for connection ${connectionId}:`, error);
      this.markConnectionUnhealthy(connectionId, 'socket_error');
    });

    // Track message activity
    socket.onAny(() => {
      this.updateConnectionActivity(connectionId);
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);

    wsLogger.info('Health monitoring started', {
      interval: this.options.healthCheckInterval
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds

    wsLogger.debug('Metrics collection started');
  }

  /**
   * Perform health check on all connections
   */
  private performHealthCheck(): void {
    const now = Date.now();
    const idleTimeout = this.options.idleTimeout;
    const unhealthyConnections: string[] = [];

    for (const [connectionId, connectionInfo] of this.connections.entries()) {
      // Check for idle connections
      if (now - connectionInfo.lastActivityAt > idleTimeout) {
        unhealthyConnections.push(connectionId);
        continue;
      }

      // Check socket connection status
      if (connectionInfo.socket.disconnected) {
        unhealthyConnections.push(connectionId);
        continue;
      }

      // Perform ping health check
      this.performConnectionPing(connectionId, connectionInfo);
    }

    // Mark unhealthy connections
    for (const connectionId of unhealthyConnections) {
      this.markConnectionUnhealthy(connectionId, 'health_check_failed');
    }

    wsLogger.debug('Health check completed', {
      total: this.connections.size,
      healthy: this.healthyConnections.size,
      unhealthy: this.unhealthyConnections.size,
      markedUnhealthy: unhealthyConnections.length
    });
  }

  /**
   * Perform ping health check on specific connection
   */
  private performConnectionPing(connectionId: string, connectionInfo: ConnectionInfo): void {
    const pingStart = Date.now();
    
    connectionInfo.socket.timeout(5000).emit('health:ping', { timestamp: pingStart }, (response) => {
      const pingDuration = Date.now() - pingStart;
      
      // Update health metrics
      const health = connectionInfo.health;
      health.avgResponseTime = health.pingCount > 0 
        ? (health.avgResponseTime + pingDuration) / 2 
        : pingDuration;

      // Mark as healthy if response time is acceptable
      if (pingDuration < 5000) { // 5 second timeout
        this.markConnectionHealthy(connectionId);
      } else {
        this.markConnectionUnhealthy(connectionId, 'slow_response');
      }
    });
  }

  /**
   * Mark connection as healthy
   */
  private markConnectionHealthy(connectionId: string): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo && connectionInfo.health.status !== 'healthy') {
      connectionInfo.health.status = 'healthy';
      this.healthyConnections.add(connectionId);
      this.unhealthyConnections.delete(connectionId);
      
      wsLogger.debug(`Connection ${connectionId} marked as healthy`);
      this.emit('connection:healthy', connectionInfo);
    }
  }

  /**
   * Mark connection as unhealthy
   */
  private markConnectionUnhealthy(connectionId: string, reason: string): void {
    const connectionInfo = this.connections.get(connectionId);
    if (connectionInfo && connectionInfo.health.status !== 'unhealthy') {
      connectionInfo.health.status = 'unhealthy';
      this.healthyConnections.delete(connectionId);
      this.unhealthyConnections.add(connectionId);
      
      wsLogger.warn(`Connection ${connectionId} marked as unhealthy: ${reason}`);
      this.emit('connection:unhealthy', connectionInfo, reason);

      // Disconnect unhealthy connections after grace period
      setTimeout(() => {
        if (this.unhealthyConnections.has(connectionId)) {
          const conn = this.connections.get(connectionId);
          if (conn) {
            conn.socket.disconnect(true);
          }
        }
      }, 30000); // 30 second grace period
    }
  }

  /**
   * Load balancing strategies
   */
  private getRoundRobinConnection(healthyIds: string[]): string {
    const selectedId = healthyIds[this.currentRoundRobinIndex % healthyIds.length];
    this.currentRoundRobinIndex++;
    return selectedId;
  }

  private getLeastConnectionsConnection(healthyIds: string[]): string {
    return healthyIds.reduce((leastBusyId, currentId) => {
      const current = this.connections.get(currentId);
      const leastBusy = this.connections.get(leastBusyId);
      
      if (!current) return leastBusyId;
      if (!leastBusy) return currentId;
      
      return current.subscriptions.size < leastBusy.subscriptions.size 
        ? currentId 
        : leastBusyId;
    });
  }

  private getWeightedConnection(healthyIds: string[]): string {
    // Weight based on inverse of response time and subscription count
    const weights = healthyIds.map(id => {
      const conn = this.connections.get(id);
      if (!conn) return 0;
      
      const responseWeight = 1 / Math.max(conn.health.avgResponseTime, 1);
      const subscriptionWeight = 1 / Math.max(conn.subscriptions.size, 1);
      
      return responseWeight * subscriptionWeight;
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const randomValue = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (let i = 0; i < healthyIds.length; i++) {
      currentWeight += weights[i];
      if (randomValue <= currentWeight) {
        return healthyIds[i];
      }
    }
    
    return healthyIds[healthyIds.length - 1];
  }

  /**
   * Setup Redis persistence for connection state
   */
  private async setupRedisPersistence(): Promise<void> {
    if (!this.options.redisService.isConnected()) {
      wsLogger.warn('Redis not connected, skipping connection state persistence');
      return;
    }

    wsLogger.debug('Connection state persistence setup complete');
  }

  /**
   * Persist connection state to Redis
   */
  private async persistConnectionState(connectionId: string, connectionInfo: ConnectionInfo): Promise<void> {
    try {
      if (!this.options.redisService.isConnected()) {
        return;
      }

      const stateData = {
        id: connectionInfo.id,
        connectedAt: connectionInfo.connectedAt,
        clientIp: connectionInfo.clientIp,
        subscriptions: Array.from(connectionInfo.subscriptions),
        authenticated: connectionInfo.authenticated
      };

      await this.options.redisService.set(
        `connection:${connectionId}`, 
        stateData, 
        3600 // 1 hour TTL
      );

    } catch (error) {
      wsLogger.error('Failed to persist connection state:', error);
    }
  }

  /**
   * Remove connection state from Redis
   */
  private async removeConnectionState(connectionId: string): Promise<void> {
    try {
      if (!this.options.redisService.isConnected()) {
        return;
      }

      await this.options.redisService.del(`connection:${connectionId}`);

    } catch (error) {
      wsLogger.error('Failed to remove connection state:', error);
    }
  }

  /**
   * Collect and report metrics
   */
  private collectMetrics(): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.stats.lastStatsUpdate;
    
    // Calculate connections per second
    this.stats.connectionsPerSecond = this.stats.totalConnections / (timeSinceLastUpdate / 1000);
    this.stats.lastStatsUpdate = now;

    // Record metrics
    this.options.performanceMonitor.recordMetric('pool_total_connections', this.connections.size);
    this.options.performanceMonitor.recordMetric('pool_healthy_connections', this.healthyConnections.size);
    this.options.performanceMonitor.recordMetric('pool_unhealthy_connections', this.unhealthyConnections.size);
    this.options.performanceMonitor.recordMetric('pool_peak_connections', this.stats.peakConnections);
    this.options.performanceMonitor.recordMetric('pool_messages_processed', this.stats.totalMessagesProcessed);

    wsLogger.debug('Connection pool metrics collected', {
      total: this.connections.size,
      healthy: this.healthyConnections.size,
      peak: this.stats.peakConnections,
      messagesProcessed: this.stats.totalMessagesProcessed
    });
  }

  /**
   * Shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    try {
      wsLogger.info('Shutting down connection pool...');

      // Clear intervals
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Disconnect all connections gracefully
      const disconnectPromises = Array.from(this.connections.values()).map(
        async (connectionInfo) => {
          try {
            connectionInfo.socket.emit('server:shutdown', {
              message: 'Server is shutting down gracefully',
              timestamp: Date.now()
            });
            connectionInfo.socket.disconnect(true);
          } catch (error) {
            wsLogger.error(`Error disconnecting ${connectionInfo.id}:`, error);
          }
        }
      );

      await Promise.allSettled(disconnectPromises);

      // Clear all tracking
      this.connections.clear();
      this.healthyConnections.clear();
      this.unhealthyConnections.clear();
      this.connectionsByIp.clear();

      this.isInitialized = false;
      wsLogger.info('✅ Connection pool shutdown complete');

    } catch (error) {
      wsLogger.error('Error during connection pool shutdown:', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): any {
    return {
      ...this.stats,
      current: {
        total: this.connections.size,
        healthy: this.healthyConnections.size,
        unhealthy: this.unhealthyConnections.size
      },
      loadBalancing: this.options.loadBalancing,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get healthy connection count
   */
  getHealthyConnectionCount(): number {
    return this.healthyConnections.size;
  }

  /**
   * Check if pool is healthy
   */
  isHealthy(): boolean {
    return this.isInitialized && this.healthyConnections.size > 0;
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ConnectionInfo | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all healthy connections
   */
  getHealthyConnections(): ConnectionInfo[] {
    return Array.from(this.healthyConnections)
      .map(id => this.connections.get(id))
      .filter(conn => conn !== undefined) as ConnectionInfo[];
  }
}