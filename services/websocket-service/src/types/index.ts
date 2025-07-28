/**
 * Type Definitions for WebSocket Service
 * 
 * Comprehensive type system for WebSocket connections, messages,
 * channels, subscriptions, and event handling.
 */

import { WebSocket } from 'ws';

// Connection and Authentication Types
export interface AuthenticatedUser {
    id: string;
    email: string;
    role: string;
    tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
    permissions: string[];
    sessionId?: string;
}

export interface ConnectionInfo {
    id: string;
    userId?: string;
    user?: AuthenticatedUser;
    ip: string;
    userAgent: string;
    connectedAt: Date;
    lastPing: Date;
    subscriptions: Set<string>;
    channels: Set<string>;
    messageCount: number;
    rateLimitTokens: number;
    rateLimitLastRefill: Date;
}

export interface ExtendedWebSocket extends WebSocket {
    connectionInfo: ConnectionInfo;
    isAlive: boolean;
}

// Message Types
export enum MessageType {
    // Connection management
    PING = 'ping',
    PONG = 'pong',
    AUTH = 'auth',
    AUTH_SUCCESS = 'auth_success',
    AUTH_ERROR = 'auth_error',
    
    // Subscription management
    SUBSCRIBE = 'subscribe',
    UNSUBSCRIBE = 'unsubscribe',
    SUBSCRIPTION_SUCCESS = 'subscription_success',
    SUBSCRIPTION_ERROR = 'subscription_error',
    
    // Data streaming
    MARKET_DATA = 'market_data',
    TRADE_EXECUTION = 'trade_execution',
    PORTFOLIO_UPDATE = 'portfolio_update',
    POSITION_UPDATE = 'position_update',
    ORDER_UPDATE = 'order_update',
    
    // ML and Analytics
    ML_PREDICTION = 'ml_prediction',
    ML_SIGNAL = 'ml_signal',
    BACKTEST_RESULT = 'backtest_result',
    
    // Risk and Compliance
    RISK_ALERT = 'risk_alert',
    COMPLIANCE_EVENT = 'compliance_event',
    LIMIT_BREACH = 'limit_breach',
    
    // Notifications
    NOTIFICATION = 'notification',
    SYSTEM_ALERT = 'system_alert',
    USER_MESSAGE = 'user_message',
    
    // System events
    SYSTEM_STATUS = 'system_status',
    SERVICE_UPDATE = 'service_update',
    MAINTENANCE_NOTICE = 'maintenance_notice',
    
    // Error handling
    ERROR = 'error',
    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
    SUBSCRIPTION_LIMIT_EXCEEDED = 'subscription_limit_exceeded'
}

export interface BaseMessage {
    id?: string;
    type: MessageType;
    timestamp: string;
    channel?: string;
    requestId?: string;
}

export interface AuthMessage extends BaseMessage {
    type: MessageType.AUTH;
    data: {
        token: string;
        apiKey?: string;
    };
}

export interface SubscribeMessage extends BaseMessage {
    type: MessageType.SUBSCRIBE;
    data: {
        channel: string;
        symbols?: string[];
        filters?: Record<string, any>;
    };
}

export interface UnsubscribeMessage extends BaseMessage {
    type: MessageType.UNSUBSCRIBE;
    data: {
        channel: string;
        symbols?: string[];
    };
}

export interface DataMessage extends BaseMessage {
    data: any;
    symbol?: string;
    exchange?: string;
    userId?: string;
}

export interface ErrorMessage extends BaseMessage {
    type: MessageType.ERROR;
    data: {
        code: string;
        message: string;
        details?: any;
    };
}

export type WSMessage = 
    | AuthMessage 
    | SubscribeMessage 
    | UnsubscribeMessage 
    | DataMessage 
    | ErrorMessage 
    | BaseMessage;

// Channel and Subscription Types
export enum ChannelType {
    MARKET_DATA = 'market_data',
    PORTFOLIO = 'portfolio',
    TRADING = 'trading',
    ML_ANALYTICS = 'ml_analytics',
    NOTIFICATIONS = 'notifications',
    RISK_MANAGEMENT = 'risk_management',
    SYSTEM_STATUS = 'system_status'
}

export interface ChannelConfig {
    name: string;
    type: ChannelType;
    requiresAuth: boolean;
    requiredPermissions?: string[];
    requiredTier?: string;
    rateLimitPerSecond: number;
    maxSymbols: number;
    allowedFilters?: string[];
}

export interface Subscription {
    id: string;
    connectionId: string;
    userId?: string;
    channel: string;
    symbols: string[];
    filters: Record<string, any>;
    createdAt: Date;
    lastActivity: Date;
}

// Market Data Types
export interface MarketPrice {
    symbol: string;
    exchange: string;
    price: number;
    volume: number;
    timestamp: string;
    change: number;
    changePercent: number;
    bid?: number;
    ask?: number;
    high?: number;
    low?: number;
    open?: number;
    close?: number;
}

export interface OrderBookEntry {
    price: number;
    size: number;
    count?: number;
}

export interface OrderBook {
    symbol: string;
    exchange: string;
    timestamp: string;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    sequence?: number;
}

export interface Trade {
    symbol: string;
    exchange: string;
    tradeId: string;
    price: number;
    size: number;
    side: 'buy' | 'sell';
    timestamp: string;
    conditions?: string[];
}

// Trading Types
export interface Order {
    id: string;
    userId: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop' | 'stop_limit';
    quantity: number;
    price?: number;
    stopPrice?: number;
    status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
    filledQuantity: number;
    averagePrice?: number;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
}

export interface Position {
    userId: string;
    symbol: string;
    quantity: number;
    averagePrice: number;
    marketValue: number;
    unrealizedPnL: number;
    realizedPnL: number;
    lastUpdated: string;
}

export interface Portfolio {
    userId: string;
    totalValue: number;
    cash: number;
    marginUsed: number;
    marginAvailable: number;
    dayPnL: number;
    totalPnL: number;
    positions: Position[];
    lastUpdated: string;
}

// ML Analytics Types
export interface MLPrediction {
    modelId: string;
    modelVersion: string;
    symbol: string;
    prediction: {
        direction: 'up' | 'down' | 'neutral';
        confidence: number;
        targetPrice?: number;
        timeHorizon: string;
        probability: number;
    };
    features: Record<string, number>;
    timestamp: string;
    expiresAt: string;
}

export interface MLSignal {
    signalId: string;
    strategy: string;
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    strength: number;
    confidence: number;
    reasoning: string[];
    metadata: Record<string, any>;
    timestamp: string;
}

// Risk Management Types
export interface RiskAlert {
    alertId: string;
    userId: string;
    type: 'position_limit' | 'loss_limit' | 'exposure_limit' | 'margin_call' | 'volatility';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    currentValue: number;
    threshold: number;
    symbol?: string;
    timestamp: string;
    acknowledged: boolean;
}

export interface ComplianceEvent {
    eventId: string;
    userId: string;
    type: 'trade_validation' | 'position_check' | 'limit_monitoring' | 'regulatory_report';
    status: 'pass' | 'fail' | 'warning';
    details: string;
    metadata: Record<string, any>;
    timestamp: string;
}

// Notification Types
export interface Notification {
    id: string;
    userId: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    category: 'trading' | 'portfolio' | 'system' | 'ml' | 'risk';
    priority: number;
    read: boolean;
    createdAt: string;
    expiresAt?: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
}

// System Status Types
export interface SystemStatus {
    timestamp: string;
    overall: 'operational' | 'degraded' | 'outage';
    services: {
        [serviceName: string]: {
            status: 'operational' | 'degraded' | 'outage';
            latency?: number;
            uptime?: number;
            lastCheck: string;
        };
    };
    markets: {
        [market: string]: {
            status: 'open' | 'closed' | 'pre_market' | 'after_hours';
            nextOpen?: string;
            nextClose?: string;
            delays?: number;
        };
    };
}

// Kafka Event Types
export interface KafkaMessage<T = any> {
    topic: string;
    partition: number;
    offset: string;
    key?: string;
    value: T;
    timestamp: string;
    headers?: Record<string, string>;
}

export interface StreamEvent {
    eventId: string;
    eventType: string;
    source: string;
    userId?: string;
    data: any;
    timestamp: string;
    correlationId?: string;
    version: string;
}

// Connection Management Types
export interface ConnectionMetrics {
    totalConnections: number;
    authenticatedConnections: number;
    connectionsPerTier: Record<string, number>;
    totalSubscriptions: number;
    subscriptionsPerChannel: Record<string, number>;
    messagesPerSecond: number;
    bytesPerSecond: number;
    averageLatency: number;
    errorRate: number;
}

export interface ChannelMetrics {
    channel: string;
    subscribers: number;
    messagesPerSecond: number;
    avgMessageSize: number;
    errorRate: number;
    lastActivity: string;
}

// Rate Limiting Types
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    burstAllowance: number;
    penaltyMs: number;
}

export interface RateLimitState {
    tokens: number;
    lastRefill: Date;
    penaltyUntil?: Date;
    violations: number;
}

// Health Check Types
export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: string;
    uptime: number;
    connections: {
        active: number;
        total: number;
    };
    memory: {
        used: number;
        total: number;
    };
    kafka: {
        connected: boolean;
        lag?: number;
    };
    redis: {
        connected: boolean;
        latency?: number;
    };
    services: Record<string, boolean>;
}

// Event Emitter Types
export interface WSEvents {
    connection: (ws: ExtendedWebSocket) => void;
    disconnect: (connectionId: string, reason: string) => void;
    message: (connectionId: string, message: WSMessage) => void;
    error: (connectionId: string, error: Error) => void;
    subscribe: (connectionId: string, channel: string, symbols: string[]) => void;
    unsubscribe: (connectionId: string, channel: string, symbols: string[]) => void;
    auth: (connectionId: string, user: AuthenticatedUser) => void;
    rate_limit: (connectionId: string, limit: string) => void;
}