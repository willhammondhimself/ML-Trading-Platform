import { WebSocketMessage } from './trading';
import Decimal from 'decimal.js';

// Core WebSocket Service Types
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error' | 'closed';
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';
export type ProtocolType = 'binary' | 'json';
export type CompressionType = 'none' | 'gzip' | 'brotli';

// Enhanced Connection Configuration
export interface ConnectionConfig {
  id: string;
  url: string;
  priority: number; // 0 = highest priority
  maxReconnectAttempts: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  reconnectDecayRate: number;
  timeout: number;
  pingInterval: number;
  pongTimeout: number;
  protocol: ProtocolType;
  compression: CompressionType;
  headers?: Record<string, string>;
  auth?: any;
}

// Connection Pool Configuration
export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  healthCheckInterval: number;
  loadBalancing: 'round-robin' | 'least-connections' | 'weighted' | 'random';
  failoverEnabled: boolean;
  failoverTimeout: number;
}

// Message Queue Configuration
export interface MessageQueueConfig {
  maxQueueSize: number;
  maxMemoryUsage: number; // bytes
  persistToDisk: boolean;
  diskPath?: string;
  retentionTime: number; // ms
  batchSize: number;
  batchTimeout: number;
  priorityLevels: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  deduplication: boolean;
  orderingGuarantee: boolean;
}

// Rate Limiting Configuration
export interface RateLimitConfig {
  enabled: boolean;
  tokensPerSecond: number;
  burstSize: number;
  windowSize: number; // ms for sliding window
  maxConcurrentRequests: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
  backoffMultiplier: number;
  maxBackoffDelay: number;
  perChannelLimits: Record<string, RateLimitChannelConfig>;
}

export interface RateLimitChannelConfig {
  tokensPerSecond: number;
  burstSize: number;
  enabled: boolean;
}

// Circuit Breaker Configuration
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  timeoutThreshold: number; // ms
  resetTimeout: number; // ms
  monitoringPeriod: number; // ms
  successThreshold: number; // for half-open -> closed
  healthCheckInterval: number; // ms
  healthCheckTimeout: number; // ms
  errorTypes: string[]; // which error types trigger the breaker
}

// Performance Monitoring Configuration
export interface PerformanceConfig {
  enabled: boolean;
  metricsRetentionTime: number; // ms
  alertThresholds: {
    latency: {
      p50: number;
      p95: number;
      p99: number;
    };
    throughput: {
      messagesPerSecond: number;
      bytesPerSecond: number;
    };
    errorRate: number; // percentage
    connectionFailureRate: number; // percentage
  };
  histogramBuckets: number[];
  flushInterval: number; // ms
}

// Enhanced WebSocket Service Configuration
export interface WebSocketServiceConfig {
  // Connection settings
  connections: ConnectionConfig[];
  connectionPool: ConnectionPoolConfig;
  
  // Message handling
  messageQueue: MessageQueueConfig;
  rateLimiting: RateLimitConfig;
  
  // Reliability
  circuitBreaker: CircuitBreakerConfig;
  
  // Monitoring
  performance: PerformanceConfig;
  
  // Protocol settings
  defaultProtocol: ProtocolType;
  compressionEnabled: boolean;
  defaultCompression: CompressionType;
  
  // Development settings
  debug: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

// Enhanced Message Types
export interface QueuedMessage {
  id: string;
  message: WebSocketMessage;
  priority: MessagePriority;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  channelId?: string;
  connectionId?: string;
  metadata?: Record<string, any>;
}

export interface ProcessedMessage extends QueuedMessage {
  processedAt: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

// Subscription Management
export interface ChannelSubscription {
  id: string;
  channelId: string;
  pattern: string; // supports wildcards like "market.*" or "trade.BTC-USD"
  callback: (message: WebSocketMessage) => void | Promise<void>;
  priority: MessagePriority;
  filters?: MessageFilter[];
  rateLimiting?: RateLimitChannelConfig;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

export interface MessageFilter {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'gt' | 'lt' | 'gte' | 'lte';
  value: any;
  caseSensitive?: boolean;
}

// Connection State Management
export interface EnhancedConnection {
  id: string;
  config: ConnectionConfig;
  socket: any; // WebSocket or Socket.IO instance
  state: ConnectionState;
  
  // Connection metrics
  connectedAt?: number;
  lastMessageAt: number;
  lastPingAt: number;
  lastPongAt: number;
  
  // Performance metrics
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  averageLatency: number;
  
  // Error tracking
  reconnectAttempts: number;
  lastError?: Error;
  errorCount: number;
  
  // Health status
  isHealthy: boolean;
  healthScore: number; // 0-100
  lastHealthCheck: number;
  
  // Subscriptions on this connection
  subscriptions: Set<string>;
  
  // Rate limiting state
  rateLimitState?: RateLimitState;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  windowStart: number;
  windowRequests: number;
  blocked: boolean;
  nextAllowedTime: number;
}

// Performance Metrics
export interface ConnectionMetrics {
  connectionId: string;
  
  // Latency metrics
  latency: {
    current: number;
    p50: number;
    p95: number;
    p99: number;
    average: number;
  };
  
  // Throughput metrics
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    currentLoad: number; // 0-1
  };
  
  // Error metrics
  errors: {
    rate: number; // errors per second
    total: number;
    recent: Error[];
  };
  
  // Connection health
  health: {
    score: number; // 0-100
    uptime: number; // percentage
    reliability: number; // 0-1
  };
  
  timestamp: number;
}

export interface AggregateMetrics {
  connections: {
    total: number;
    healthy: number;
    connecting: number;
    disconnected: number;
    error: number;
  };
  
  performance: {
    totalThroughput: number;
    averageLatency: number;
    errorRate: number;
    successRate: number;
  };
  
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    queueSize: number;
    activeSubscriptions: number;
  };
  
  timestamp: number;
}

// Event Types
export type WebSocketServiceEvent = 
  | 'connection:opened'
  | 'connection:closed'
  | 'connection:error'
  | 'connection:reconnecting'
  | 'message:received'
  | 'message:sent'
  | 'message:queued'
  | 'message:dropped'
  | 'subscription:added'
  | 'subscription:removed'
  | 'circuit-breaker:opened'
  | 'circuit-breaker:closed'
  | 'rate-limit:exceeded'
  | 'health:degraded'
  | 'health:recovered';

export interface WebSocketServiceEventData {
  event: WebSocketServiceEvent;
  connectionId?: string;
  subscriptionId?: string;
  messageId?: string;
  data?: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Error Types
export class WebSocketServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public connectionId?: string,
    public recoverable: boolean = true,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'WebSocketServiceError';
  }
}

export class ConnectionError extends WebSocketServiceError {
  constructor(message: string, connectionId: string, metadata?: Record<string, any>) {
    super(message, 'CONNECTION_ERROR', connectionId, true, metadata);
  }
}

export class RateLimitError extends WebSocketServiceError {
  constructor(message: string, connectionId?: string, metadata?: Record<string, any>) {
    super(message, 'RATE_LIMIT_ERROR', connectionId, true, metadata);
  }
}

export class CircuitBreakerError extends WebSocketServiceError {
  constructor(message: string, connectionId?: string, metadata?: Record<string, any>) {
    super(message, 'CIRCUIT_BREAKER_ERROR', connectionId, false, metadata);
  }
}

export class ProtocolError extends WebSocketServiceError {
  constructor(message: string, connectionId?: string, metadata?: Record<string, any>) {
    super(message, 'PROTOCOL_ERROR', connectionId, true, metadata);
  }
}

// Service Interface
export interface IWebSocketService {
  // Connection management
  connect(config?: Partial<WebSocketServiceConfig>): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(connectionId?: string): Promise<void>;
  
  // Subscription management
  subscribe(channelId: string, callback: (message: WebSocketMessage) => void, options?: Partial<ChannelSubscription>): string;
  unsubscribe(subscriptionId: string): void;
  
  // Message handling
  send(message: WebSocketMessage, priority?: MessagePriority): Promise<void>;
  sendToChannel(channelId: string, data: any, priority?: MessagePriority): Promise<void>;
  
  // State queries
  getConnectionState(connectionId?: string): ConnectionState;
  getMetrics(connectionId?: string): ConnectionMetrics | AggregateMetrics;
  getHealth(): { healthy: boolean; score: number; issues: string[] };
  
  // Configuration
  updateConfig(config: Partial<WebSocketServiceConfig>): void;
  getConfig(): WebSocketServiceConfig;
  
  // Events
  on(event: WebSocketServiceEvent, callback: (data: WebSocketServiceEventData) => void): void;
  off(event: WebSocketServiceEvent, callback?: (data: WebSocketServiceEventData) => void): void;
  
  // Utilities
  isConnected(): boolean;
  getActiveSubscriptions(): ChannelSubscription[];
  flushQueue(): Promise<void>;
  clearMetrics(): void;
}

// Default Configuration
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketServiceConfig = {
  connections: [{
    id: 'primary',
    url: 'ws://localhost:8080',
    priority: 0,
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    reconnectDecayRate: 1.5,
    timeout: 20000,
    pingInterval: 30000,
    pongTimeout: 5000,
    protocol: 'json' as ProtocolType,
    compression: 'none' as CompressionType,
  }],
  
  connectionPool: {
    maxConnections: 5,
    minConnections: 1,
    connectionTimeout: 10000,
    idleTimeout: 300000,
    healthCheckInterval: 60000,
    loadBalancing: 'round-robin',
    failoverEnabled: true,
    failoverTimeout: 5000,
  },
  
  messageQueue: {
    maxQueueSize: 10000,
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    persistToDisk: false,
    retentionTime: 3600000, // 1 hour
    batchSize: 100,
    batchTimeout: 16, // ~60fps
    priorityLevels: {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    },
    deduplication: true,
    orderingGuarantee: true,
  },
  
  rateLimiting: {
    enabled: true,
    tokensPerSecond: 1000,
    burstSize: 5000,
    windowSize: 1000,
    maxConcurrentRequests: 100,
    backoffStrategy: 'exponential',
    backoffMultiplier: 2,
    maxBackoffDelay: 30000,
    perChannelLimits: {},
  },
  
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    timeoutThreshold: 5000,
    resetTimeout: 60000,
    monitoringPeriod: 10000,
    successThreshold: 5,
    healthCheckInterval: 30000,
    healthCheckTimeout: 5000,
    errorTypes: ['CONNECTION_ERROR', 'TIMEOUT_ERROR'],
  },
  
  performance: {
    enabled: true,
    metricsRetentionTime: 3600000, // 1 hour
    alertThresholds: {
      latency: {
        p50: 10,
        p95: 50,
        p99: 100,
      },
      throughput: {
        messagesPerSecond: 10000,
        bytesPerSecond: 10 * 1024 * 1024, // 10MB/s
      },
      errorRate: 5, // 5%
      connectionFailureRate: 10, // 10%
    },
    histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    flushInterval: 5000,
  },
  
  defaultProtocol: 'json',
  compressionEnabled: false,
  defaultCompression: 'none',
  
  debug: false,
  logLevel: 'info',
};