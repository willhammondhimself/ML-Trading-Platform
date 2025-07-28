import { EventEmitter } from 'events';
import { io, Socket as SocketIOClient } from 'socket.io-client';
import {
  ConnectionConfig,
  ConnectionPoolConfig,
  EnhancedConnection,
  ConnectionState,
  WebSocketServiceError,
  ConnectionError
} from '@/types/websocket-service';
import { ExponentialBackoff } from './ExponentialBackoff';

/**
 * Connection Pool Manager
 * 
 * Manages multiple WebSocket connections with:
 * - Intelligent load balancing (round-robin, least-connections, weighted)
 * - Automatic failover and health monitoring
 * - Connection lifecycle management
 * - Performance metrics and monitoring
 * - Exponential backoff for reconnections
 */

type LoadBalancingStrategy = 'round-robin' | 'least-connections' | 'weighted' | 'random';

export interface ConnectionPoolEvents {
  'connection:state-changed': (data: { connectionId: string; state: ConnectionState; previousState: ConnectionState }) => void;
  'connection:error': (data: { connectionId: string; error: Error; recoverable: boolean }) => void;
  'pool:health-changed': (data: { healthy: boolean; healthyConnections: number; totalConnections: number }) => void;
  'pool:failover': (data: { from: string; to: string; reason: string }) => void;
}

export interface ConnectionHealth {
  connectionId: string;
  isHealthy: boolean;
  score: number; // 0-100
  latency: number;
  uptime: number;
  errorRate: number;
  lastCheck: number;
  issues: string[];
}

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  healthyConnections: number;
  averageLatency: number;
  totalThroughput: number;
  failoverCount: number;
  lastFailover: number;
  loadDistribution: Record<string, number>;
}

export class ConnectionPoolManager extends EventEmitter {
  private connections: Map<string, EnhancedConnection> = new Map();
  private backoffManagers: Map<string, ExponentialBackoff> = new Map();
  private poolConfig: ConnectionPoolConfig;
  private connectionConfigs: ConnectionConfig[];
  
  // Load balancing
  private loadBalancingIndex = 0;
  private connectionWeights: Map<string, number> = new Map();
  private connectionLoads: Map<string, number> = new Map();
  
  // Health monitoring
  private healthCheckInterval?: NodeJS.Timeout;
  private healthStats: Map<string, ConnectionHealth> = new Map();
  
  // Pool metrics
  private metrics: PoolMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    healthyConnections: 0,
    averageLatency: 0,
    totalThroughput: 0,
    failoverCount: 0,
    lastFailover: 0,
    loadDistribution: {}
  };

  constructor(poolConfig: ConnectionPoolConfig, connectionConfigs: ConnectionConfig[]) {
    super();
    
    this.poolConfig = poolConfig;
    this.connectionConfigs = connectionConfigs;
    
    // Initialize connection weights (higher priority = higher weight)
    this.connectionConfigs.forEach(config => {
      const weight = Math.max(1, 10 - config.priority); // Priority 0 = weight 10, Priority 9 = weight 1
      this.connectionWeights.set(config.id, weight);
      this.connectionLoads.set(config.id, 0);
    });
  }

  /**
   * Initialize connection pool
   */
  async initialize(): Promise<void> {
    console.log('🏊 Initializing connection pool...');
    
    try {
      // Create minimum required connections
      const connectPromises = this.connectionConfigs
        .slice(0, this.poolConfig.minConnections)
        .map(config => this.createConnection(config));
      
      const results = await Promise.allSettled(connectPromises);
      
      // Check if minimum connections were established
      const successfulConnections = results.filter(r => r.status === 'fulfilled').length;
      
      if (successfulConnections < this.poolConfig.minConnections) {
        throw new Error(`Failed to establish minimum connections: ${successfulConnections}/${this.poolConfig.minConnections}`);
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Update metrics
      this.updateMetrics();
      
      console.log(`✅ Connection pool initialized with ${successfulConnections} connections`);
      
    } catch (error) {
      console.error('❌ Failed to initialize connection pool:', error);
      throw new WebSocketServiceError(
        'Connection pool initialization failed',
        'POOL_INIT_ERROR',
        undefined,
        false,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Create and configure a new connection
   */
  async createConnection(config: ConnectionConfig): Promise<EnhancedConnection> {
    const connection: EnhancedConnection = {
      id: config.id,
      config,
      socket: null,
      state: 'connecting',
      lastMessageAt: 0,
      lastPingAt: 0,
      lastPongAt: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      averageLatency: 0,
      reconnectAttempts: 0,
      errorCount: 0,
      isHealthy: false,
      healthScore: 0,
      lastHealthCheck: 0,
      subscriptions: new Set(),
    };

    // Create exponential backoff manager for this connection
    const backoff = new ExponentialBackoff({
      strategy: 'exponential',
      initialDelay: config.reconnectDelay,
      maxDelay: config.maxReconnectDelay,
      maxAttempts: config.maxReconnectAttempts,
      multiplier: config.reconnectDecayRate,
      jitterType: 'equal',
      resetAfter: 60000, // Reset after 1 minute of stability
    });

    this.backoffManagers.set(config.id, backoff);
    this.connections.set(config.id, connection);

    // Connect with retry logic
    try {
      await this.connectWithBackoff(connection);
      return connection;
    } catch (error) {
      console.error(`❌ Failed to create connection ${config.id}:`, error);
      throw new ConnectionError(`Connection creation failed: ${error instanceof Error ? error.message : String(error)}`, config.id);
    }
  }

  /**
   * Connect with exponential backoff retry logic
   */
  private async connectWithBackoff(connection: EnhancedConnection): Promise<void> {
    const backoff = this.backoffManagers.get(connection.id)!;
    
    await backoff.execute(async () => {
      await this.establishConnection(connection);
    }, (attempt, delay) => {
      console.log(`🔄 Connection ${connection.id} attempt ${attempt} in ${delay}ms`);
      connection.state = 'reconnecting';
      this.emitConnectionStateChange(connection.id, 'reconnecting');
    });
  }

  /**
   * Establish actual WebSocket connection
   */
  private async establishConnection(connection: EnhancedConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const { config } = connection;
      
      // Create Socket.IO client
      const socket = io(config.url, {
        transports: ['websocket', 'polling'],
        auth: config.auth,
        timeout: config.timeout,
        autoConnect: false,
        reconnection: false, // We handle reconnection manually
        extraHeaders: config.headers,
      });

      // Connection success
      socket.on('connect', () => {
        connection.socket = socket;
        connection.state = 'connected';
        connection.connectedAt = Date.now();
        connection.isHealthy = true;
        connection.healthScore = 100;
        connection.reconnectAttempts = 0;
        
        console.log(`✅ Connection ${connection.id} established`);
        
        this.emitConnectionStateChange(connection.id, 'connected');
        this.updateMetrics();
        this.startConnectionPing(connection);
        
        resolve();
      });

      // Connection error
      socket.on('connect_error', (error) => {
        connection.errorCount++;
        connection.lastError = error;
        connection.isHealthy = false;
        
        console.error(`❌ Connection ${connection.id} failed:`, error.message);
        
        this.emit('connection:error', {
          connectionId: connection.id,
          error,
          recoverable: true
        });
        
        reject(error);
      });

      // Disconnection
      socket.on('disconnect', (reason) => {
        const previousState = connection.state;
        connection.state = 'disconnected';
        connection.socket = null;
        connection.isHealthy = false;
        connection.healthScore = 0;
        
        console.warn(`⚠️ Connection ${connection.id} disconnected: ${reason}`);
        
        this.emitConnectionStateChange(connection.id, 'disconnected', previousState);
        this.updateMetrics();
        
        // Auto-reconnect if not manual disconnect
        if (reason !== 'io client disconnect' && reason !== 'client namespace disconnect') {
          this.scheduleReconnection(connection);
        }
      });

      // Message handling
      socket.onAny((event, data) => {
        connection.messagesReceived++;
        connection.lastMessageAt = Date.now();
        
        if (data && typeof data === 'string') {
          connection.bytesReceived += data.length;
        } else if (data) {
          connection.bytesReceived += JSON.stringify(data).length;
        }
        
        this.updateConnectionLoad(connection.id);
      });

      // Pong response for latency measurement
      socket.on('pong', () => {
        const latency = Date.now() - connection.lastPingAt;
        connection.averageLatency = connection.averageLatency === 0 
          ? latency 
          : (connection.averageLatency * 0.9) + (latency * 0.1); // Exponential moving average
        connection.lastPongAt = Date.now();
      });

      // Start connection
      socket.connect();
    });
  }

  /**
   * Get the best available connection based on load balancing strategy
   */
  getBestConnection(): EnhancedConnection | null {
    const healthyConnections = Array.from(this.connections.values())
      .filter(conn => conn.state === 'connected' && conn.isHealthy);
    
    if (healthyConnections.length === 0) {
      return null;
    }

    return this.selectConnectionByStrategy(healthyConnections);
  }

  /**
   * Select connection based on configured load balancing strategy
   */
  private selectConnectionByStrategy(connections: EnhancedConnection[]): EnhancedConnection {
    const strategy = this.poolConfig.loadBalancing;
    
    switch (strategy) {
      case 'round-robin':
        return this.selectRoundRobin(connections);
      
      case 'least-connections':
        return this.selectLeastConnections(connections);
      
      case 'weighted':
        return this.selectWeighted(connections);
      
      case 'random':
        return connections[Math.floor(Math.random() * connections.length)];
      
      default:
        return this.selectRoundRobin(connections);
    }
  }

  private selectRoundRobin(connections: EnhancedConnection[]): EnhancedConnection {
    const connection = connections[this.loadBalancingIndex % connections.length];
    this.loadBalancingIndex = (this.loadBalancingIndex + 1) % connections.length;
    return connection;
  }

  private selectLeastConnections(connections: EnhancedConnection[]): EnhancedConnection {
    return connections.reduce((best, current) => {
      const currentLoad = this.connectionLoads.get(current.id) || 0;
      const bestLoad = this.connectionLoads.get(best.id) || 0;
      return currentLoad < bestLoad ? current : best;
    });
  }

  private selectWeighted(connections: EnhancedConnection[]): EnhancedConnection {
    const totalWeight = connections.reduce((sum, conn) => {
      const weight = this.connectionWeights.get(conn.id) || 1;
      const load = this.connectionLoads.get(conn.id) || 0;
      return sum + Math.max(1, weight - load); // Reduce weight by current load
    }, 0);
    
    let random = Math.random() * totalWeight;
    
    for (const connection of connections) {
      const weight = this.connectionWeights.get(connection.id) || 1;
      const load = this.connectionLoads.get(connection.id) || 0;
      const adjustedWeight = Math.max(1, weight - load);
      
      random -= adjustedWeight;
      if (random <= 0) {
        return connection;
      }
    }
    
    return connections[0]; // Fallback
  }

  /**
   * Get specific connection by ID
   */
  getConnection(connectionId: string): EnhancedConnection | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): EnhancedConnection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.state === 'connected' || conn.state === 'connecting');
  }

  /**
   * Reconnect specific connection
   */
  async reconnectConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new ConnectionError('Connection not found', connectionId);
    }

    try {
      // Disconnect if currently connected
      if (connection.socket && connection.state === 'connected') {
        connection.socket.disconnect();
      }

      // Reset backoff if manual reconnection
      const backoff = this.backoffManagers.get(connectionId);
      if (backoff) {
        backoff.reset();
      }

      // Reconnect
      await this.connectWithBackoff(connection);
      
    } catch (error) {
      throw new ConnectionError(
        `Manual reconnection failed: ${error instanceof Error ? error.message : String(error)}`,
        connectionId
      );
    }
  }

  /**
   * Reconnect all connections
   */
  async reconnectAll(): Promise<void> {
    const reconnectPromises = Array.from(this.connections.keys())
      .map(id => this.reconnectConnection(id).catch(error => ({ id, error })));
    
    const results = await Promise.allSettled(reconnectPromises);
    
    const failures = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason);
    
    if (failures.length > 0) {
      console.error('❌ Some connections failed to reconnect:', failures);
    }
  }

  /**
   * Shutdown connection pool
   */
  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down connection pool...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Disconnect all connections
    const disconnectPromises = Array.from(this.connections.values()).map(connection => {
      if (connection.socket) {
        connection.socket.disconnect();
      }
      return Promise.resolve();
    });

    await Promise.all(disconnectPromises);
    
    // Clear state
    this.connections.clear();
    this.backoffManagers.clear();
    this.healthStats.clear();
    
    console.log('✅ Connection pool shutdown complete');
  }

  /**
   * Update pool configuration
   */
  updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    this.poolConfig = { ...this.poolConfig, ...newConfig };
  }

  /**
   * Get pool metrics
   */
  getMetrics(): PoolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(connectionId: string): ConnectionHealth | null {
    return this.healthStats.get(connectionId) || null;
  }

  /**
   * Get pool health status
   */
  getPoolHealth(): { healthy: boolean; score: number; connections: ConnectionHealth[] } {
    const connections = Array.from(this.healthStats.values());
    const healthyCount = connections.filter(h => h.isHealthy).length;
    const totalCount = connections.length;
    
    const averageScore = totalCount > 0 
      ? connections.reduce((sum, h) => sum + h.score, 0) / totalCount 
      : 0;
    
    return {
      healthy: healthyCount >= this.poolConfig.minConnections,
      score: averageScore,
      connections
    };
  }

  // Private methods

  private scheduleReconnection(connection: EnhancedConnection): void {
    console.log(`🔄 Scheduling reconnection for ${connection.id}`);
    
    // Use exponential backoff for automatic reconnection
    setTimeout(async () => {
      try {
        await this.connectWithBackoff(connection);
      } catch (error) {
        console.error(`❌ Auto-reconnection failed for ${connection.id}:`, error);
        
        // If this was a failover candidate, try other connections
        if (this.poolConfig.failoverEnabled) {
          this.handleFailover(connection.id, error as Error);
        }
      }
    }, 1000);
  }

  private handleFailover(failedConnectionId: string, error: Error): void {
    const healthyConnections = this.getActiveConnections()
      .filter(conn => conn.id !== failedConnectionId && conn.isHealthy);
    
    if (healthyConnections.length > 0) {
      const targetConnection = healthyConnections[0];
      
      console.log(`🔀 Failing over from ${failedConnectionId} to ${targetConnection.id}`);
      
      this.metrics.failoverCount++;
      this.metrics.lastFailover = Date.now();
      
      this.emit('pool:failover', {
        from: failedConnectionId,
        to: targetConnection.id,
        reason: error.message
      });
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.poolConfig.healthCheckInterval);
  }

  private performHealthCheck(): void {
    this.connections.forEach((connection) => {
      const health = this.calculateConnectionHealth(connection);
      this.healthStats.set(connection.id, health);
      
      // Update connection health status
      const wasHealthy = connection.isHealthy;
      connection.isHealthy = health.isHealthy;
      connection.healthScore = health.score;
      connection.lastHealthCheck = Date.now();
      
      // Emit health change event if status changed
      if (wasHealthy !== connection.isHealthy) {
        console.log(`🏥 Connection ${connection.id} health changed: ${connection.isHealthy ? 'healthy' : 'unhealthy'} (${health.score})`);
      }
    });
    
    this.updateMetrics();
  }

  private calculateConnectionHealth(connection: EnhancedConnection): ConnectionHealth {
    let score = 100;
    const issues: string[] = [];
    
    // Connection state check
    if (connection.state !== 'connected') {
      score -= 50;
      issues.push('Not connected');
    }
    
    // Latency check
    if (connection.averageLatency > 1000) {
      score -= 20;
      issues.push('High latency');
    }
    
    // Error rate check
    const errorRate = connection.errorCount / Math.max(1, connection.messagesSent + connection.messagesReceived);
    if (errorRate > 0.05) { // 5% error rate
      score -= 15;
      issues.push('High error rate');
    }
    
    // Ping/pong check
    const timeSinceLastPong = Date.now() - connection.lastPongAt;
    if (timeSinceLastPong > connection.config.pongTimeout * 2) {
      score -= 15;
      issues.push('Unresponsive to ping');
    }
    
    // Uptime calculation
    const uptime = connection.connectedAt ? Date.now() - connection.connectedAt : 0;
    
    return {
      connectionId: connection.id,
      isHealthy: score >= 70,
      score: Math.max(0, score),
      latency: connection.averageLatency,
      uptime,
      errorRate,
      lastCheck: Date.now(),
      issues
    };
  }

  private startConnectionPing(connection: EnhancedConnection): void {
    const pingInterval = setInterval(() => {
      if (connection.state === 'connected' && connection.socket) {
        connection.lastPingAt = Date.now();
        connection.socket.emit('ping');
      } else {
        clearInterval(pingInterval);
      }
    }, connection.config.pingInterval);
  }

  private updateConnectionLoad(connectionId: string): void {
    const currentLoad = this.connectionLoads.get(connectionId) || 0;
    this.connectionLoads.set(connectionId, currentLoad + 1);
    
    // Decay load over time
    setTimeout(() => {
      const load = this.connectionLoads.get(connectionId) || 0;
      this.connectionLoads.set(connectionId, Math.max(0, load - 1));
    }, 1000);
  }

  private updateMetrics(): void {
    const connections = Array.from(this.connections.values());
    
    this.metrics.totalConnections = connections.length;
    this.metrics.activeConnections = connections.filter(c => c.state === 'connected').length;
    this.metrics.healthyConnections = connections.filter(c => c.isHealthy).length;
    
    // Calculate average latency
    const connectedConnections = connections.filter(c => c.state === 'connected');
    this.metrics.averageLatency = connectedConnections.length > 0
      ? connectedConnections.reduce((sum, c) => sum + c.averageLatency, 0) / connectedConnections.length
      : 0;
    
    // Calculate total throughput
    this.metrics.totalThroughput = connections.reduce((sum, c) => sum + c.messagesReceived, 0);
    
    // Update load distribution
    this.metrics.loadDistribution = {};
    this.connectionLoads.forEach((load, connectionId) => {
      this.metrics.loadDistribution[connectionId] = load;
    });
  }

  private emitConnectionStateChange(connectionId: string, newState: ConnectionState, previousState?: ConnectionState): void {
    this.emit('connection:state-changed', {
      connectionId,
      state: newState,
      previousState: previousState || 'disconnected'
    });
  }
}