import { EventEmitter } from 'events';
import { WebSocketService } from '../websocket/WebSocketService';
import {
  MarketDataProvider,
  QuoteData,
  TradeData,
  OrderBookData,
  NewsData,
  MarketDataError,
  ProviderConfig
} from '@/types/market-data';
import { RateLimitStatus, ProviderMetrics, ProviderStatus, SubscriptionInfo } from './interfaces';
import { ConnectionState } from '@/types/websocket-service';

/**
 * WebSocket Feed Integration System
 * 
 * Features:
 * - Multi-provider WebSocket feed integration
 * - Automatic connection management with failover
 * - Real-time data normalization and validation
 * - Subscription management with pattern matching
 * - Connection pooling and load balancing
 * - Message deduplication and ordering
 * - Performance monitoring and metrics
 * - Backpressure handling and flow control
 * - Provider-specific protocol handling
 */

export interface WebSocketFeedConfig {
  provider: MarketDataProvider;
  wsUrl: string;
  apiKey: string;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  subscriptionTimeout: number;
  messageBufferSize: number;
  enableDeduplication: boolean;
  enableOrdering: boolean;
  compressionEnabled: boolean;
  batchProcessing: boolean;
  batchSize: number;
  batchDelay: number;
}

export interface FeedSubscription {
  id: string;
  provider: MarketDataProvider;
  type: 'quote' | 'trade' | 'orderbook' | 'news';
  symbols: string[];
  channels: string[];
  callback: (data: any) => void;
  createdAt: number;
  messageCount: number;
  lastMessage: number;
  active: boolean;
}

export interface MessageBuffer {
  messages: any[];
  lastFlush: number;
  size: number;
}

export interface ConnectionMetrics {
  messagesReceived: number;
  messagesProcessed: number;
  messagesPending: number;
  duplicatesFiltered: number;
  orderingCorrections: number;
  averageLatency: number;
  lastMessageTime: number;
  subscriptionCount: number;
}

export class WebSocketFeedClient extends EventEmitter {
  private config: WebSocketFeedConfig;
  private wsService: WebSocketService;
  private connectionState: ConnectionState = 'disconnected';
  private subscriptions: Map<string, FeedSubscription> = new Map();
  private messageBuffer: MessageBuffer = { messages: [], lastFlush: 0, size: 0 };
  private sequenceNumbers: Map<string, number> = new Map(); // For message ordering
  private messageHashes: Set<string> = new Set(); // For deduplication
  private metrics: ConnectionMetrics;
  private rateLimitStatus: RateLimitStatus;
  private heartbeatTimer?: NodeJS.Timeout;
  private bufferTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: WebSocketFeedConfig) {
    super();
    this.config = config;
    this.wsService = WebSocketService.getInstance();
    this.metrics = this.initializeMetrics();
    this.rateLimitStatus = this.initializeRateLimitStatus();
  }

  /**
   * Initialize the WebSocket feed connection
   */
  async initialize(): Promise<void> {
    try {
      // Configure WebSocket service for this provider
      await this.configureWebSocketService();
      
      // Connect to the feed
      await this.connect();
      
      // Start background tasks
      this.startHeartbeat();
      this.startBufferProcessing();
      this.startCleanupTasks();
      
      console.log(`📡 WebSocket feed initialized for ${this.config.provider}`);
      
    } catch (error) {
      console.error(`❌ Failed to initialize WebSocket feed for ${this.config.provider}:`, error);
      throw error;
    }
  }

  /**
   * Connect to the WebSocket feed
   */
  async connect(): Promise<void> {
    try {
      this.connectionState = 'connecting';
      this.emit('connection:state-changed', { state: 'connecting', provider: this.config.provider });
      
      // Establish WebSocket connection through the service
      await this.wsService.connect({
        connections: [{
          id: `${this.config.provider}_feed`,
          url: this.config.wsUrl,
          priority: 0,
          maxReconnectAttempts: this.config.maxReconnectAttempts,
          reconnectDelay: this.config.reconnectDelay,
          maxReconnectDelay: this.config.reconnectDelay * 10,
          reconnectDecayRate: 1.5,
          timeout: 30000,
          pingInterval: this.config.heartbeatInterval,
          pongTimeout: 5000,
          protocol: 'json',
          compression: 'none',
          auth: this.buildAuthConfig(),
          headers: this.buildHeaders()
        }]
      });

      // Subscribe to WebSocket events
      this.setupWebSocketEvents();
      
      // Perform provider-specific authentication
      await this.authenticate();
      
      this.connectionState = 'connected';
      this.emit('connection:state-changed', { state: 'connected', provider: this.config.provider });
      
    } catch (error) {
      this.connectionState = 'error';
      this.emit('connection:state-changed', { state: 'error', provider: this.config.provider });
      throw new MarketDataError({
        code: 'CONNECTION_FAILED',
        message: `Failed to connect to ${this.config.provider} WebSocket feed`,
        provider: this.config.provider,
        timestamp: Date.now(),
        retryable: true,
        details: { error }
      });
    }
  }

  /**
   * Subscribe to real-time quotes
   */
  async subscribeToQuotes(symbols: string[], callback: (data: QuoteData) => void): Promise<string> {
    const subscriptionId = this.generateSubscriptionId('quote');
    const channels = this.buildQuoteChannels(symbols);
    
    const subscription: FeedSubscription = {
      id: subscriptionId,
      provider: this.config.provider,
      type: 'quote',
      symbols,
      channels,
      callback,
      createdAt: Date.now(),
      messageCount: 0,
      lastMessage: 0,
      active: true
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    // Send subscription message to provider
    await this.sendSubscriptionMessage('subscribe', channels);
    
    this.emit('subscription:created', {
      subscriptionId,
      type: 'quote',
      symbols,
      provider: this.config.provider
    });
    
    console.log(`📈 Subscribed to quotes for ${symbols.length} symbols on ${this.config.provider}`);
    
    return subscriptionId;
  }

  /**
   * Subscribe to real-time trades
   */
  async subscribeToTrades(symbols: string[], callback: (data: TradeData) => void): Promise<string> {
    const subscriptionId = this.generateSubscriptionId('trade');
    const channels = this.buildTradeChannels(symbols);
    
    const subscription: FeedSubscription = {
      id: subscriptionId,
      provider: this.config.provider,
      type: 'trade',
      symbols,
      channels,
      callback,
      createdAt: Date.now(),
      messageCount: 0,
      lastMessage: 0,
      active: true
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    await this.sendSubscriptionMessage('subscribe', channels);
    
    this.emit('subscription:created', {
      subscriptionId,
      type: 'trade',
      symbols,
      provider: this.config.provider
    });
    
    return subscriptionId;
  }

  /**
   * Subscribe to order book updates
   */
  async subscribeToOrderBook(symbols: string[], callback: (data: OrderBookData) => void): Promise<string> {
    const subscriptionId = this.generateSubscriptionId('orderbook');
    const channels = this.buildOrderBookChannels(symbols);
    
    const subscription: FeedSubscription = {
      id: subscriptionId,
      provider: this.config.provider,
      type: 'orderbook',
      symbols,
      channels,
      callback,
      createdAt: Date.now(),
      messageCount: 0,
      lastMessage: 0,
      active: true
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    await this.sendSubscriptionMessage('subscribe', channels);
    
    this.emit('subscription:created', {
      subscriptionId,
      type: 'orderbook',
      symbols,
      provider: this.config.provider
    });
    
    return subscriptionId;
  }

  /**
   * Subscribe to real-time news
   */
  async subscribeToNews(symbols: string[], callback: (data: NewsData) => void): Promise<string> {
    const subscriptionId = this.generateSubscriptionId('news');
    const channels = this.buildNewsChannels(symbols);
    
    const subscription: FeedSubscription = {
      id: subscriptionId,
      provider: this.config.provider,
      type: 'news',
      symbols,
      channels,
      callback,
      createdAt: Date.now(),
      messageCount: 0,
      lastMessage: 0,
      active: true
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    await this.sendSubscriptionMessage('subscribe', channels);
    
    this.emit('subscription:created', {
      subscriptionId,
      type: 'news',
      symbols,
      provider: this.config.provider
    });
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from a feed
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    subscription.active = false;
    
    // Send unsubscribe message to provider
    await this.sendSubscriptionMessage('unsubscribe', subscription.channels);
    
    this.subscriptions.delete(subscriptionId);
    
    this.emit('subscription:removed', {
      subscriptionId,
      type: subscription.type,
      provider: this.config.provider
    });
    
    console.log(`📡 Unsubscribed from ${subscription.type} feed: ${subscriptionId}`);
  }

  /**
   * Unsubscribe from all feeds
   */
  async unsubscribeAll(): Promise<void> {
    const subscriptionIds = Array.from(this.subscriptions.keys());
    
    for (const subscriptionId of subscriptionIds) {
      await this.unsubscribe(subscriptionId);
    }
    
    console.log(`📡 Unsubscribed from all feeds for ${this.config.provider}`);
  }

  /**
   * Get connection status
   */
  getStatus(): ProviderStatus {
    return {
      name: this.config.provider,
      healthy: this.connectionState === 'connected',
      connected: this.connectionState === 'connected',
      lastActivity: this.metrics.lastMessageTime,
      errorCount: 0, // Simplified
      rateLimitStatus: this.rateLimitStatus,
      metrics: this.convertToProviderMetrics(),
      subscriptions: this.getSubscriptionInfo()
    };
  }

  /**
   * Get feed metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      this.connectionState = 'disconnected';
      
      // Unsubscribe from all feeds
      await this.unsubscribeAll();
      
      // Stop background tasks
      this.stopHeartbeat();
      this.stopBufferProcessing();
      this.stopCleanupTasks();
      
      // Disconnect WebSocket
      await this.wsService.disconnect();
      
      this.emit('connection:state-changed', { state: 'disconnected', provider: this.config.provider });
      
      console.log(`📡 Disconnected WebSocket feed for ${this.config.provider}`);
      
    } catch (error) {
      console.error(`❌ Error disconnecting WebSocket feed for ${this.config.provider}:`, error);
    }
  }

  /**
   * Check rate limit status
   */
  checkRateLimit(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  // Private methods

  private async configureWebSocketService(): Promise<void> {
    // Configure the shared WebSocket service for this provider's needs
    this.wsService.updateConfig({
      messageQueue: {
        maxQueueSize: this.config.messageBufferSize,
        batchSize: this.config.batchSize,
        batchTimeout: this.config.batchDelay,
        deduplication: this.config.enableDeduplication,
        orderingGuarantee: this.config.enableOrdering
      },
      compressionEnabled: this.config.compressionEnabled
    });
  }

  private setupWebSocketEvents(): void {
    // Subscribe to WebSocket service events
    this.wsService.on('message:received', (data) => {
      this.handleMessage(data.data);
    });

    this.wsService.on('connection:opened', (data) => {
      if (data.connectionId?.includes(this.config.provider)) {
        this.handleConnectionOpen();
      }
    });

    this.wsService.on('connection:closed', (data) => {
      if (data.connectionId?.includes(this.config.provider)) {
        this.handleConnectionClose(data.data?.reason);
      }
    });

    this.wsService.on('connection:error', (data) => {
      if (data.connectionId?.includes(this.config.provider)) {
        this.handleConnectionError(data.data?.error);
      }
    });
  }

  private handleMessage(message: any): void {
    const startTime = performance.now();
    
    try {
      // Update metrics
      this.metrics.messagesReceived++;
      this.metrics.lastMessageTime = Date.now();
      
      // Check for duplicates
      if (this.config.enableDeduplication && this.isDuplicate(message)) {
        this.metrics.duplicatesFiltered++;
        return;
      }
      
      // Check message ordering
      if (this.config.enableOrdering && !this.checkMessageOrder(message)) {
        this.metrics.orderingCorrections++;
        // Buffer out-of-order message
        this.bufferMessage(message);
        return;
      }
      
      // Process message based on type
      const normalizedData = this.normalizeMessage(message);
      if (normalizedData) {
        this.routeMessage(normalizedData);
        this.metrics.messagesProcessed++;
      }
      
      // Update latency metrics
      const latency = performance.now() - startTime;
      this.updateLatencyMetrics(latency);
      
    } catch (error) {
      console.error(`❌ Error processing message from ${this.config.provider}:`, error);
      this.emit('message:error', {
        provider: this.config.provider,
        error,
        message
      });
    }
  }

  private normalizeMessage(message: any): any | null {
    try {
      switch (this.config.provider) {
        case 'polygon':
          return this.normalizePolygonMessage(message);
        case 'alpha_vantage':
          return this.normalizeAlphaVantageMessage(message);
        case 'iex':
          return this.normalizeIexMessage(message);
        case 'finnhub':
          return this.normalizeFinnhubMessage(message);
        default:
          return this.normalizeGenericMessage(message);
      }
    } catch (error) {
      console.error(`❌ Failed to normalize message from ${this.config.provider}:`, error);
      return null;
    }
  }

  private normalizePolygonMessage(message: any): any | null {
    // Polygon.io WebSocket message normalization
    switch (message.ev) {
      case 'Q': // Quote
        return {
          type: 'quote',
          symbol: message.sym,
          timestamp: message.t,
          bid: message.b?.toString(),
          ask: message.a?.toString(),
          bidSize: message.bs,
          askSize: message.as,
          quality: 'real_time',
          provider: 'polygon'
        };
        
      case 'T': // Trade
        return {
          type: 'trade',
          symbol: message.sym,
          timestamp: message.t,
          price: message.p?.toString(),
          size: message.s,
          exchange: message.x,
          conditions: message.c,
          tradeId: message.i?.toString(),
          quality: 'real_time',
          provider: 'polygon'
        };
        
      case 'AM': // Aggregate Minute
        return {
          type: 'price',
          symbol: message.sym,
          timestamp: message.s, // start timestamp
          open: message.o?.toString(),
          high: message.h?.toString(),
          low: message.l?.toString(),
          close: message.c?.toString(),
          volume: message.v,
          vwap: message.vw?.toString(),
          trades: message.n,
          quality: 'real_time',
          provider: 'polygon'
        };
        
      default:
        return null;
    }
  }

  private normalizeAlphaVantageMessage(message: any): any | null {
    // Alpha Vantage normalization (they don't have WebSocket, but for completeness)
    return null;
  }

  private normalizeIexMessage(message: any): any | null {
    // IEX Cloud WebSocket message normalization
    if (message.data) {
      const data = message.data;
      return {
        type: message.messageType?.toLowerCase(),
        symbol: data.symbol,
        timestamp: Date.now(), // IEX doesn't always provide timestamp
        ...data,
        quality: 'real_time',
        provider: 'iex'
      };
    }
    return null;
  }

  private normalizeFinnhubMessage(message: any): any | null {
    // Finnhub WebSocket message normalization
    if (message.type === 'trade' && message.data) {
      return message.data.map((trade: any) => ({
        type: 'trade',
        symbol: trade.s,
        timestamp: trade.t,
        price: trade.p?.toString(),
        size: trade.v,
        quality: 'real_time',
        provider: 'finnhub'
      }));
    }
    return null;
  }

  private normalizeGenericMessage(message: any): any | null {
    // Generic normalization for unknown providers
    return {
      type: message.type || 'unknown',
      ...message,
      provider: this.config.provider,
      quality: 'real_time'
    };
  }

  private routeMessage(data: any): void {
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;
      
      // Check if message matches subscription
      if (this.messageMatchesSubscription(data, subscription)) {
        try {
          subscription.callback(data);
          subscription.messageCount++;
          subscription.lastMessage = Date.now();
        } catch (error) {
          console.error(`❌ Error in subscription callback ${subscription.id}:`, error);
          this.emit('subscription:error', {
            subscriptionId: subscription.id,
            error,
            provider: this.config.provider
          });
        }
      }
    }
  }

  private messageMatchesSubscription(data: any, subscription: FeedSubscription): boolean {
    // Check if data type matches subscription type
    if (data.type !== subscription.type) return false;
    
    // Check if symbol is in subscription symbols
    if (subscription.symbols.length > 0 && !subscription.symbols.includes(data.symbol)) {
      return false;
    }
    
    return true;
  }

  private isDuplicate(message: any): boolean {
    const hash = this.generateMessageHash(message);
    
    if (this.messageHashes.has(hash)) {
      return true;
    }
    
    this.messageHashes.add(hash);
    
    // Clean up old hashes periodically
    if (this.messageHashes.size > 10000) {
      const hashes = Array.from(this.messageHashes);
      this.messageHashes = new Set(hashes.slice(-5000));
    }
    
    return false;
  }

  private checkMessageOrder(message: any): boolean {
    if (!message.sequence && !message.timestamp) return true;
    
    const key = `${message.symbol || 'global'}:${message.type || 'unknown'}`;
    const currentSequence = this.sequenceNumbers.get(key) || 0;
    const messageSequence = message.sequence || message.timestamp;
    
    if (messageSequence > currentSequence) {
      this.sequenceNumbers.set(key, messageSequence);
      return true;
    }
    
    return false;
  }

  private bufferMessage(message: any): void {
    if (this.config.batchProcessing) {
      this.messageBuffer.messages.push(message);
      this.messageBuffer.size++;
      
      if (this.messageBuffer.size >= this.config.batchSize) {
        this.flushMessageBuffer();
      }
    }
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.messages.length === 0) return;
    
    // Sort messages by timestamp/sequence
    const sortedMessages = this.messageBuffer.messages.sort((a, b) => {
      const aKey = a.timestamp || a.sequence || 0;
      const bKey = b.timestamp || b.sequence || 0;
      return aKey - bKey;
    });
    
    // Process sorted messages
    for (const message of sortedMessages) {
      const normalizedData = this.normalizeMessage(message);
      if (normalizedData) {
        this.routeMessage(normalizedData);
        this.metrics.messagesProcessed++;
      }
    }
    
    // Clear buffer
    this.messageBuffer.messages = [];
    this.messageBuffer.size = 0;
    this.messageBuffer.lastFlush = Date.now();
    
    this.emit('buffer:flushed', {
      provider: this.config.provider,
      messageCount: sortedMessages.length
    });
  }

  private generateMessageHash(message: any): string {
    // Create a hash based on message content for deduplication
    const key = `${message.symbol || ''}:${message.type || ''}:${message.timestamp || ''}:${message.price || ''}`;
    
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(36);
  }

  private async authenticate(): Promise<void> {
    // Provider-specific authentication
    switch (this.config.provider) {
      case 'polygon':
        await this.authenticatePolygon();
        break;
      case 'finnhub':
        await this.authenticateFinnhub();
        break;
      case 'iex':
        await this.authenticateIex();
        break;
      default:
        // Generic authentication
        break;
    }
  }

  private async authenticatePolygon(): Promise<void> {
    const authMessage = {
      action: 'auth',
      params: this.config.apiKey
    };
    
    await this.wsService.send({
      type: 'system',
      data: authMessage,
      timestamp: Date.now()
    }, 'high');
  }

  private async authenticateFinnhub(): Promise<void> {
    const authMessage = {
      type: 'subscribe',
      symbol: 'AAPL' // Finnhub requires subscribing to authenticate
    };
    
    await this.wsService.send({
      type: 'system',
      data: authMessage,
      timestamp: Date.now()
    }, 'high');
  }

  private async authenticateIex(): Promise<void> {
    // IEX authentication is usually token-based in the URL
    // No additional authentication message needed
  }

  private async sendSubscriptionMessage(action: 'subscribe' | 'unsubscribe', channels: string[]): Promise<void> {
    const message = this.buildSubscriptionMessage(action, channels);
    
    await this.wsService.send({
      type: 'system',
      data: message,
      timestamp: Date.now()
    }, 'high');
    
    // Add small delay to prevent overwhelming the provider
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private buildSubscriptionMessage(action: 'subscribe' | 'unsubscribe', channels: string[]): any {
    switch (this.config.provider) {
      case 'polygon':
        return {
          action,
          params: channels.join(',')
        };
      case 'finnhub':
        return channels.map(channel => ({
          type: action,
          symbol: channel
        }));
      case 'iex':
        return {
          [action]: channels
        };
      default:
        return {
          action,
          channels
        };
    }
  }

  private buildQuoteChannels(symbols: string[]): string[] {
    switch (this.config.provider) {
      case 'polygon':
        return symbols.map(symbol => `Q.${symbol}`);
      case 'finnhub':
        return symbols; // Finnhub uses symbols directly
      case 'iex':
        return symbols.map(symbol => `quote-${symbol}`);
      default:
        return symbols.map(symbol => `quotes.${symbol}`);
    }
  }

  private buildTradeChannels(symbols: string[]): string[] {
    switch (this.config.provider) {
      case 'polygon':
        return symbols.map(symbol => `T.${symbol}`);
      case 'finnhub':
        return symbols;
      case 'iex':
        return symbols.map(symbol => `trade-${symbol}`);
      default:
        return symbols.map(symbol => `trades.${symbol}`);
    }
  }

  private buildOrderBookChannels(symbols: string[]): string[] {
    switch (this.config.provider) {
      case 'polygon':
        return symbols.map(symbol => `L2.${symbol}`);
      case 'iex':
        return symbols.map(symbol => `book-${symbol}`);
      default:
        return symbols.map(symbol => `orderbook.${symbol}`);
    }
  }

  private buildNewsChannels(symbols: string[]): string[] {
    switch (this.config.provider) {
      case 'polygon':
        return ['news']; // Polygon news is global
      case 'iex':
        return ['news'];
      default:
        return symbols.map(symbol => `news.${symbol}`);
    }
  }

  private buildAuthConfig(): any {
    return {
      token: this.config.apiKey
    };
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }

  private handleConnectionOpen(): void {
    this.connectionState = 'connected';
    this.emit('connected');
  }

  private handleConnectionClose(reason?: string): void {
    this.connectionState = 'disconnected';
    this.emit('disconnected', reason);
  }

  private handleConnectionError(error: any): void {
    this.connectionState = 'error';
    this.emit('error', error);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === 'connected') {
        this.sendHeartbeat();
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.wsService.send({
        type: 'system',
        data: { action: 'ping' },
        timestamp: Date.now()
      }, 'low');
    } catch (error) {
      console.warn(`⚠️ Failed to send heartbeat to ${this.config.provider}:`, error);
    }
  }

  private startBufferProcessing(): void {
    if (!this.config.batchProcessing) return;
    
    this.bufferTimer = setInterval(() => {
      if (this.messageBuffer.messages.length > 0) {
        const timeSinceLastFlush = Date.now() - this.messageBuffer.lastFlush;
        if (timeSinceLastFlush >= this.config.batchDelay) {
          this.flushMessageBuffer();
        }
      }
    }, this.config.batchDelay / 2);
  }

  private stopBufferProcessing(): void {
    if (this.bufferTimer) {
      clearInterval(this.bufferTimer);
      this.bufferTimer = undefined;
    }
    
    // Flush any remaining messages
    this.flushMessageBuffer();
  }

  private startCleanupTasks(): void {
    this.cleanupTimer = setInterval(() => {
      // Clean up old sequence numbers
      const cutoff = Date.now() - 3600000; // 1 hour
      for (const [key, timestamp] of this.sequenceNumbers.entries()) {
        if (timestamp < cutoff) {
          this.sequenceNumbers.delete(key);
        }
      }
      
      // Clean up message hashes
      if (this.messageHashes.size > 10000) {
        const hashes = Array.from(this.messageHashes);
        this.messageHashes = new Set(hashes.slice(-5000));
      }
    }, 300000); // Every 5 minutes
  }

  private stopCleanupTasks(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private updateLatencyMetrics(latency: number): void {
    this.metrics.averageLatency = this.metrics.averageLatency === 0
      ? latency
      : (this.metrics.averageLatency * 0.9) + (latency * 0.1);
  }

  private generateSubscriptionId(type: string): string {
    return `${this.config.provider}_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private convertToProviderMetrics(): ProviderMetrics {
    return {
      requestCount: this.metrics.messagesReceived,
      errorCount: 0, // Simplified
      averageResponseTime: this.metrics.averageLatency,
      successRate: this.metrics.messagesReceived > 0 
        ? (this.metrics.messagesProcessed / this.metrics.messagesReceived) * 100 
        : 100,
      dataPointsReceived: this.metrics.messagesProcessed,
      lastRequestTime: this.metrics.lastMessageTime,
      uptime: Date.now() - (this.metrics.lastMessageTime || Date.now())
    };
  }

  private getSubscriptionInfo(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).map(sub => ({
      id: sub.id,
      type: sub.type,
      symbols: sub.symbols,
      createdAt: sub.createdAt,
      messageCount: sub.messageCount,
      lastMessage: sub.lastMessage
    }));
  }

  private initializeMetrics(): ConnectionMetrics {
    return {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesPending: 0,
      duplicatesFiltered: 0,
      orderingCorrections: 0,
      averageLatency: 0,
      lastMessageTime: 0,
      subscriptionCount: 0
    };
  }

  private initializeRateLimitStatus(): RateLimitStatus {
    return {
      remaining: 1000,
      limit: 1000,
      resetTime: Date.now() / 1000 + 3600,
      resetIn: 3600,
      blocked: false
    };
  }
}