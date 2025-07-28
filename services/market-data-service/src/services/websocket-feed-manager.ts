/**
 * WebSocket Feed Manager
 * Manages real-time market data feeds with subscription management and connection pooling
 */

import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import {
  MarketDataType,
  DataProvider,
  Quote,
  Trade,
  OrderBook,
  NewsItem,
  Symbol
} from '../types';
import { ProviderManager } from './provider-manager';
import { CacheService } from './cache-service';
import { 
  wsLogger, 
  logError, 
  createPerformanceTimer,
  logWebSocketEvent 
} from '../utils/logger';

// === Subscription Schemas ===

const SubscriptionSchema = z.object({
  symbols: z.array(z.string().min(1).max(20)),
  dataTypes: z.array(z.nativeEnum(MarketDataType)),
  provider: z.nativeEnum(DataProvider).optional()
});

const UnsubscriptionSchema = z.object({
  symbols: z.array(z.string().min(1).max(20)),
  dataTypes: z.array(z.nativeEnum(MarketDataType))
});

// === Interfaces ===

interface ClientSubscription {
  clientId: string;
  symbols: Set<string>;
  dataTypes: Set<MarketDataType>;
  provider?: DataProvider;
  subscriptionTime: number;
  lastActivity: number;
}

interface SubscriptionStats {
  totalClients: number;
  totalSubscriptions: number;
  messagesPerSecond: number;
  connectionCount: number;
  subscriptionsByType: Record<MarketDataType, number>;
  subscriptionsByProvider: Record<DataProvider, number>;
}

interface WebSocketConfig {
  port: number;
  maxConnections: number;
  pingTimeout: number;
  pingInterval: number;
  rateLimits: {
    connectionsPerMinute: number;
    messagesPerMinute: number;
    subscriptionsPerClient: number;
  };
  compression: boolean;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

export class WebSocketFeedManager extends EventEmitter {
  private io?: Server;
  private httpServer: any;
  private config: WebSocketConfig;
  private providerManager: ProviderManager;
  private cacheService: CacheService;

  // Subscription management
  private clientSubscriptions = new Map<string, ClientSubscription>();
  private symbolSubscriptions = new Map<string, Set<string>>(); // symbol -> clientIds
  private activeSubscriptions = new Map<string, Set<MarketDataType>>(); // symbol -> dataTypes
  
  // Statistics and monitoring
  private stats: SubscriptionStats = {
    totalClients: 0,
    totalSubscriptions: 0,
    messagesPerSecond: 0,
    connectionCount: 0,
    subscriptionsByType: {} as Record<MarketDataType, number>,
    subscriptionsByProvider: {} as Record<DataProvider, number>
  };
  
  private messageCount = 0;
  private statsUpdateInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  // Rate limiting
  private connectionRateLimit: any;
  private messageRateLimits = new Map<string, { count: number; resetTime: number }>();

  constructor(
    config: WebSocketConfig,
    providerManager: ProviderManager,
    cacheService: CacheService
  ) {
    super();
    
    this.config = config;
    this.providerManager = providerManager;
    this.cacheService = cacheService;
    
    this.setupRateLimiting();
    this.initializeStats();
  }

  // === Lifecycle Management ===

  async start(): Promise<void> {
    try {
      // Create HTTP server for Socket.IO
      this.httpServer = createServer();
      
      // Initialize Socket.IO server
      this.io = new Server(this.httpServer, {
        cors: this.config.cors,
        pingTimeout: this.config.pingTimeout,
        pingInterval: this.config.pingInterval,
        compression: this.config.compression,
        transports: ['websocket', 'polling'],
        allowEIO3: true
      });

      // Setup middleware and event handlers
      this.setupMiddleware();
      this.setupEventHandlers();
      this.setupProviderEventHandlers();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(this.config.port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Start background tasks
      this.startStatsUpdates();
      this.startPeriodicCleanup();

      wsLogger.info('WebSocket feed manager started', {
        port: this.config.port,
        maxConnections: this.config.maxConnections
      });

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { operation: 'start' });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      // Stop background tasks
      if (this.statsUpdateInterval) {
        clearInterval(this.statsUpdateInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Disconnect all clients
      if (this.io) {
        this.io.emit('server_shutdown', { reason: 'Server maintenance' });
        await new Promise<void>((resolve) => {
          this.io!.close(resolve);
        });
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          this.httpServer.close((error?: Error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }

      // Clear subscriptions
      this.clientSubscriptions.clear();
      this.symbolSubscriptions.clear();
      this.activeSubscriptions.clear();

      wsLogger.info('WebSocket feed manager stopped');

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { operation: 'stop' });
      throw error;
    }
  }

  // === Connection Management ===

  private setupMiddleware(): void {
    if (!this.io) return;

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const clientIp = socket.handshake.address;
      
      if (!this.checkConnectionRateLimit(clientIp)) {
        logWebSocketEvent('rate_limit_exceeded', socket.id, { 
          clientIp,
          type: 'connection' 
        });
        return next(new Error('Connection rate limit exceeded'));
      }
      
      next();
    });

    // Connection limit middleware
    this.io.use((socket, next) => {
      if (this.stats.connectionCount >= this.config.maxConnections) {
        logWebSocketEvent('connection_rejected', socket.id, { 
          reason: 'max_connections',
          current: this.stats.connectionCount,
          max: this.config.maxConnections
        });
        return next(new Error('Maximum connections reached'));
      }
      
      next();
    });

    // Authentication middleware (if needed)
    this.io.use((socket, next) => {
      // Add authentication logic here if required
      // For now, allow all connections
      next();
    });
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleClientConnection(socket);
    });

    this.io.on('error', (error: Error) => {
      logError(error, 'websocket-feed-manager', { event: 'server_error' });
    });
  }

  private handleClientConnection(socket: Socket): void {
    const timer = createPerformanceTimer('websocket-connection');
    
    try {
      this.stats.connectionCount++;
      this.stats.totalClients++;
      
      // Initialize client subscription
      const clientSubscription: ClientSubscription = {
        clientId: socket.id,
        symbols: new Set(),
        dataTypes: new Set(),
        subscriptionTime: Date.now(),
        lastActivity: Date.now()
      };
      
      this.clientSubscriptions.set(socket.id, clientSubscription);

      logWebSocketEvent('client_connected', socket.id, {
        clientIp: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        totalConnections: this.stats.connectionCount
      });

      // Setup client event handlers
      this.setupClientEventHandlers(socket);

      // Send welcome message with server capabilities
      socket.emit('welcome', {
        serverTime: Date.now(),
        supportedDataTypes: Object.values(MarketDataType),
        supportedProviders: Object.values(DataProvider),
        rateLimits: this.config.rateLimits
      });

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { 
        operation: 'handleConnection',
        socketId: socket.id 
      });
    } finally {
      timer.end({ socketId: socket.id });
    }
  }

  private setupClientEventHandlers(socket: Socket): void {
    // Handle subscription requests
    socket.on('subscribe', async (data, callback) => {
      await this.handleSubscription(socket, data, callback);
    });

    // Handle unsubscription requests
    socket.on('unsubscribe', async (data, callback) => {
      await this.handleUnsubscription(socket, data, callback);
    });

    // Handle ping/pong for connection health
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback({ serverTime: Date.now() });
      }
      this.updateClientActivity(socket.id);
    });

    // Handle client disconnect
    socket.on('disconnect', (reason) => {
      this.handleClientDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logError(error, 'websocket-feed-manager', { 
        event: 'client_error',
        socketId: socket.id 
      });
    });

    // Rate limit client messages
    socket.use((packet, next) => {
      if (!this.checkMessageRateLimit(socket.id)) {
        logWebSocketEvent('rate_limit_exceeded', socket.id, { 
          type: 'message',
          event: packet[0] 
        });
        return next(new Error('Message rate limit exceeded'));
      }
      next();
    });
  }

  // === Subscription Management ===

  private async handleSubscription(socket: Socket, data: any, callback?: Function): Promise<void> {
    const timer = createPerformanceTimer('websocket-subscribe');
    
    try {
      // Validate subscription request
      const subscription = SubscriptionSchema.parse(data);
      const clientSubscription = this.clientSubscriptions.get(socket.id);
      
      if (!clientSubscription) {
        throw new Error('Client subscription not found');
      }

      // Check subscription limits
      const totalSymbols = clientSubscription.symbols.size + subscription.symbols.length;
      if (totalSymbols > this.config.rateLimits.subscriptionsPerClient) {
        throw new Error(`Subscription limit exceeded. Max: ${this.config.rateLimits.subscriptionsPerClient}`);
      }

      // Update client subscription
      subscription.symbols.forEach(symbol => clientSubscription.symbols.add(symbol.toUpperCase()));
      subscription.dataTypes.forEach(dataType => clientSubscription.dataTypes.add(dataType));
      if (subscription.provider) {
        clientSubscription.provider = subscription.provider;
      }
      clientSubscription.lastActivity = Date.now();

      // Update global subscription tracking
      for (const symbol of subscription.symbols) {
        const upperSymbol = symbol.toUpperCase();
        
        // Add client to symbol subscriptions
        if (!this.symbolSubscriptions.has(upperSymbol)) {
          this.symbolSubscriptions.set(upperSymbol, new Set());
        }
        this.symbolSubscriptions.get(upperSymbol)!.add(socket.id);

        // Update active subscriptions for the symbol
        if (!this.activeSubscriptions.has(upperSymbol)) {
          this.activeSubscriptions.set(upperSymbol, new Set());
        }
        subscription.dataTypes.forEach(dataType => {
          this.activeSubscriptions.get(upperSymbol)!.add(dataType);
        });
      }

      // Subscribe to provider feeds
      await this.providerManager.subscribeToSymbols(
        subscription.symbols.map(s => s.toUpperCase()),
        subscription.dataTypes
      );

      // Update statistics
      this.updateSubscriptionStats();

      // Send confirmation to client
      if (callback) {
        callback({
          success: true,
          subscribed: {
            symbols: subscription.symbols,
            dataTypes: subscription.dataTypes,
            provider: subscription.provider || 'default'
          },
          totalSubscriptions: clientSubscription.symbols.size
        });
      }

      logWebSocketEvent('subscription_added', socket.id, {
        symbols: subscription.symbols.length,
        dataTypes: subscription.dataTypes,
        provider: subscription.provider,
        totalSymbols: clientSubscription.symbols.size
      });

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { 
        operation: 'handleSubscription',
        socketId: socket.id,
        data
      });

      if (callback) {
        callback({
          success: false,
          error: (error as Error).message
        });
      }
    } finally {
      timer.end({ socketId: socket.id });
    }
  }

  private async handleUnsubscription(socket: Socket, data: any, callback?: Function): Promise<void> {
    const timer = createPerformanceTimer('websocket-unsubscribe');
    
    try {
      const unsubscription = UnsubscriptionSchema.parse(data);
      const clientSubscription = this.clientSubscriptions.get(socket.id);
      
      if (!clientSubscription) {
        throw new Error('Client subscription not found');
      }

      // Update client subscription
      unsubscription.symbols.forEach(symbol => {
        const upperSymbol = symbol.toUpperCase();
        clientSubscription.symbols.delete(upperSymbol);
        
        // Remove client from symbol subscriptions
        const symbolClients = this.symbolSubscriptions.get(upperSymbol);
        if (symbolClients) {
          symbolClients.delete(socket.id);
          
          // If no clients are subscribed to this symbol, remove it completely
          if (symbolClients.size === 0) {
            this.symbolSubscriptions.delete(upperSymbol);
            this.activeSubscriptions.delete(upperSymbol);
            
            // Unsubscribe from provider
            this.providerManager.unsubscribeFromSymbols(
              [upperSymbol],
              unsubscription.dataTypes
            ).catch(error => {
              logError(error as Error, 'websocket-feed-manager', {
                operation: 'providerUnsubscribe',
                symbol: upperSymbol
              });
            });
          }
        }
      });

      unsubscription.dataTypes.forEach(dataType => {
        clientSubscription.dataTypes.delete(dataType);
      });

      clientSubscription.lastActivity = Date.now();

      // Update statistics
      this.updateSubscriptionStats();

      // Send confirmation to client
      if (callback) {
        callback({
          success: true,
          unsubscribed: {
            symbols: unsubscription.symbols,
            dataTypes: unsubscription.dataTypes
          },
          remainingSubscriptions: clientSubscription.symbols.size
        });
      }

      logWebSocketEvent('subscription_removed', socket.id, {
        symbols: unsubscription.symbols.length,
        dataTypes: unsubscription.dataTypes,
        remainingSymbols: clientSubscription.symbols.size
      });

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { 
        operation: 'handleUnsubscription',
        socketId: socket.id,
        data
      });

      if (callback) {
        callback({
          success: false,
          error: (error as Error).message
        });
      }
    } finally {
      timer.end({ socketId: socket.id });
    }
  }

  private handleClientDisconnection(socket: Socket, reason: string): void {
    const timer = createPerformanceTimer('websocket-disconnect');
    
    try {
      const clientSubscription = this.clientSubscriptions.get(socket.id);
      
      if (clientSubscription) {
        // Remove client from all symbol subscriptions
        for (const symbol of clientSubscription.symbols) {
          const symbolClients = this.symbolSubscriptions.get(symbol);
          if (symbolClients) {
            symbolClients.delete(socket.id);
            
            // If no clients are subscribed to this symbol, clean up
            if (symbolClients.size === 0) {
              this.symbolSubscriptions.delete(symbol);
              this.activeSubscriptions.delete(symbol);
              
              // Unsubscribe from provider
              this.providerManager.unsubscribeFromSymbols(
                [symbol],
                Array.from(clientSubscription.dataTypes)
              ).catch(error => {
                logError(error as Error, 'websocket-feed-manager', {
                  operation: 'providerUnsubscribe',
                  symbol,
                  reason: 'client_disconnect'
                });
              });
            }
          }
        }
        
        // Remove client subscription
        this.clientSubscriptions.delete(socket.id);
      }

      // Update statistics
      this.stats.connectionCount--;
      this.updateSubscriptionStats();

      logWebSocketEvent('client_disconnected', socket.id, {
        reason,
        subscriptions: clientSubscription?.symbols.size || 0,
        connectionDuration: clientSubscription ? Date.now() - clientSubscription.subscriptionTime : 0,
        remainingConnections: this.stats.connectionCount
      });

    } catch (error) {
      logError(error as Error, 'websocket-feed-manager', { 
        operation: 'handleDisconnection',
        socketId: socket.id,
        reason
      });
    } finally {
      timer.end({ socketId: socket.id, reason });
    }
  }

  // === Provider Event Handlers ===

  private setupProviderEventHandlers(): void {
    // Handle real-time quotes
    this.providerManager.on('quote', (quote: Quote) => {
      this.broadcastToSubscribers(quote.symbol.symbol, 'quote', quote);
    });

    // Handle real-time trades
    this.providerManager.on('trade', (trade: Trade) => {
      this.broadcastToSubscribers(trade.symbol.symbol, 'trade', trade);
    });

    // Handle order book updates
    this.providerManager.on('orderbook', (orderbook: OrderBook) => {
      this.broadcastToSubscribers(orderbook.symbol.symbol, 'orderbook', orderbook);
    });

    // Handle news updates
    this.providerManager.on('news', (news: NewsItem) => {
      // News can be for multiple symbols
      for (const symbol of news.symbols) {
        this.broadcastToSubscribers(symbol, 'news', news);
      }
    });

    // Handle provider errors
    this.providerManager.on('error', (error: Error) => {
      this.io?.emit('provider_error', {
        message: 'Data provider encountered an error',
        timestamp: Date.now()
      });
    });

    // Handle provider switches
    this.providerManager.on('provider_switched', (event: any) => {
      this.io?.emit('provider_switch', {
        dataType: event.dataType,
        from: event.from,
        to: event.to,
        reason: event.reason,
        timestamp: Date.now()
      });
    });
  }

  private broadcastToSubscribers(symbol: string, dataType: string, data: any): void {
    const upperSymbol = symbol.toUpperCase();
    const subscribedClients = this.symbolSubscriptions.get(upperSymbol);
    
    if (!subscribedClients || subscribedClients.size === 0) {
      return;
    }

    const message = {
      type: dataType,
      symbol: upperSymbol,
      data,
      timestamp: Date.now()
    };

    // Broadcast to all subscribed clients
    for (const clientId of subscribedClients) {
      const clientSubscription = this.clientSubscriptions.get(clientId);
      
      // Check if client is subscribed to this data type
      if (clientSubscription && clientSubscription.dataTypes.has(dataType as MarketDataType)) {
        this.io?.to(clientId).emit('market_data', message);
        this.messageCount++;
      }
    }

    // Cache the data for new subscribers
    this.cacheRealtimeData(symbol, dataType, data);
  }

  // === Utility Methods ===

  private setupRateLimiting(): void {
    // Connection rate limiting setup is handled in middleware
  }

  private checkConnectionRateLimit(clientIp: string): boolean {
    // Simple rate limiting - in production, use Redis for distributed rate limiting
    const now = Date.now();
    const key = `conn:${clientIp}`;
    const limit = this.messageRateLimits.get(key);
    
    if (!limit || now > limit.resetTime) {
      this.messageRateLimits.set(key, {
        count: 1,
        resetTime: now + 60000 // 1 minute
      });
      return true;
    }
    
    if (limit.count >= this.config.rateLimits.connectionsPerMinute) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  private checkMessageRateLimit(clientId: string): boolean {
    const now = Date.now();
    const key = `msg:${clientId}`;
    const limit = this.messageRateLimits.get(key);
    
    if (!limit || now > limit.resetTime) {
      this.messageRateLimits.set(key, {
        count: 1,
        resetTime: now + 60000 // 1 minute
      });
      return true;
    }
    
    if (limit.count >= this.config.rateLimits.messagesPerMinute) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  private updateClientActivity(clientId: string): void {
    const clientSubscription = this.clientSubscriptions.get(clientId);
    if (clientSubscription) {
      clientSubscription.lastActivity = Date.now();
    }
  }

  private updateSubscriptionStats(): void {
    this.stats.totalSubscriptions = this.clientSubscriptions.size;
    
    // Reset counters
    this.stats.subscriptionsByType = {} as Record<MarketDataType, number>;
    this.stats.subscriptionsByProvider = {} as Record<DataProvider, number>;
    
    // Count subscriptions by type and provider
    for (const subscription of this.clientSubscriptions.values()) {
      for (const dataType of subscription.dataTypes) {
        this.stats.subscriptionsByType[dataType] = (this.stats.subscriptionsByType[dataType] || 0) + 1;
      }
      
      if (subscription.provider) {
        this.stats.subscriptionsByProvider[subscription.provider] = 
          (this.stats.subscriptionsByProvider[subscription.provider] || 0) + 1;
      }
    }
  }

  private async cacheRealtimeData(symbol: string, dataType: string, data: any): Promise<void> {
    try {
      // Cache real-time data with short TTL for new subscribers
      await this.cacheService.set(
        {
          provider: DataProvider.IEX_CLOUD, // Default provider for caching
          dataType: dataType as any,
          symbol: symbol
        },
        data,
        30 // 30 second TTL for real-time data
      );
    } catch (error) {
      // Non-critical error, just log it
      logError(error as Error, 'websocket-feed-manager', { 
        operation: 'cacheRealtimeData',
        symbol,
        dataType
      });
    }
  }

  private initializeStats(): void {
    this.stats = {
      totalClients: 0,
      totalSubscriptions: 0,
      messagesPerSecond: 0,
      connectionCount: 0,
      subscriptionsByType: {} as Record<MarketDataType, number>,
      subscriptionsByProvider: {} as Record<DataProvider, number>
    };
  }

  private startStatsUpdates(): void {
    let lastMessageCount = 0;
    
    this.statsUpdateInterval = setInterval(() => {
      // Calculate messages per second
      const currentMessageCount = this.messageCount;
      this.stats.messagesPerSecond = currentMessageCount - lastMessageCount;
      lastMessageCount = currentMessageCount;
      
      // Emit stats to monitoring
      this.emit('stats_updated', this.stats);
      
      // Log stats periodically
      if (this.stats.connectionCount > 0) {
        wsLogger.debug('WebSocket stats updated', {
          connections: this.stats.connectionCount,
          subscriptions: this.stats.totalSubscriptions,
          messagesPerSecond: this.stats.messagesPerSecond
        });
      }
    }, 1000);
  }

  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveClients();
      this.cleanupRateLimitData();
    }, 300000); // Every 5 minutes
  }

  private cleanupInactiveClients(): void {
    const now = Date.now();
    const inactivityThreshold = 10 * 60 * 1000; // 10 minutes
    
    for (const [clientId, subscription] of this.clientSubscriptions.entries()) {
      if (now - subscription.lastActivity > inactivityThreshold) {
        // Client is inactive, check if socket still exists
        const socket = this.io?.sockets.sockets.get(clientId);
        if (!socket) {
          // Socket no longer exists, clean up subscription
          this.handleClientDisconnection(socket as any, 'inactive_cleanup');
        }
      }
    }
  }

  private cleanupRateLimitData(): void {
    const now = Date.now();
    
    for (const [key, limit] of this.messageRateLimits.entries()) {
      if (now > limit.resetTime) {
        this.messageRateLimits.delete(key);
      }
    }
  }

  // === Public Interface ===

  getStats(): SubscriptionStats {
    return { ...this.stats };
  }

  getActiveSubscriptions(): Array<{ symbol: string; clients: number; dataTypes: MarketDataType[] }> {
    const result: Array<{ symbol: string; clients: number; dataTypes: MarketDataType[] }> = [];
    
    for (const [symbol, clients] of this.symbolSubscriptions.entries()) {
      const dataTypes = Array.from(this.activeSubscriptions.get(symbol) || []);
      result.push({
        symbol,
        clients: clients.size,
        dataTypes
      });
    }
    
    return result;
  }

  getClientInfo(clientId: string): ClientSubscription | null {
    return this.clientSubscriptions.get(clientId) || null;
  }

  async forceDisconnectClient(clientId: string, reason: string): Promise<void> {
    const socket = this.io?.sockets.sockets.get(clientId);
    if (socket) {
      socket.emit('force_disconnect', { reason });
      socket.disconnect(true);
    }
  }
}