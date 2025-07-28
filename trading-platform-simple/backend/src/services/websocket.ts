import { Server as SocketIOServer, Socket } from 'socket.io';
import { MarketDataService } from './marketData';
import { RealMarketDataService } from './realMarketData';
import { logger } from '../utils/logger';

export class WebSocketService {
  private subscriptions: Map<string, Set<string>> = new Map(); // socketId -> symbols
  private symbolSubscribers: Map<string, Set<string>> = new Map(); // symbol -> socketIds

  constructor(
    private io: SocketIOServer,
    private marketDataService: MarketDataService,
    private realMarketDataService?: RealMarketDataService
  ) {
    this.setupEventHandlers();
    this.setupMarketDataForwarding();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      // Initialize empty subscription set
      this.subscriptions.set(socket.id, new Set());

      // Handle subscription requests
      socket.on('subscribe', (data: { symbols: string[], types: string[] }) => {
        this.handleSubscribe(socket, data);
      });

      // Handle unsubscription requests
      socket.on('unsubscribe', (data: { symbols: string[] }) => {
        this.handleUnsubscribe(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Send initial market status
      socket.emit('market-status', this.marketDataService.getMarketStatus());
    });
  }

  private setupMarketDataForwarding(): void {
    // Forward simulated market data events to subscribed clients
    this.marketDataService.on('quote', (quote) => {
      const subscribedSockets = this.symbolSubscribers.get(quote.symbol);
      if (subscribedSockets) {
        subscribedSockets.forEach(socketId => {
          this.io.to(socketId).emit('quote', quote);
        });
      }
    });

    // Forward real market data events if available
    if (this.realMarketDataService) {
      this.realMarketDataService.on('quote', (quote) => {
        const subscribedSockets = this.symbolSubscribers.get(quote.symbol);
        if (subscribedSockets) {
          subscribedSockets.forEach(socketId => {
            this.io.to(socketId).emit('quote', quote);
          });
        }
      });
    }

    // Periodically send market status updates
    setInterval(() => {
      const marketStatus = this.marketDataService.getMarketStatus();
      this.io.emit('market-status', marketStatus);
    }, 30000); // Every 30 seconds
  }

  private handleSubscribe(socket: Socket, data: { symbols: string[], types: string[] }): void {
    const { symbols, types } = data;
    logger.info(`Client ${socket.id} subscribing to:`, { symbols, types });

    const socketSubscriptions = this.subscriptions.get(socket.id);
    if (!socketSubscriptions) return;

    symbols.forEach(symbol => {
      // Add symbol to socket's subscriptions
      socketSubscriptions.add(symbol);

      // Add socket to symbol's subscribers
      if (!this.symbolSubscribers.has(symbol)) {
        this.symbolSubscribers.set(symbol, new Set());
      }
      this.symbolSubscribers.get(symbol)!.add(socket.id);

      // Send current quote immediately
      const currentQuote = this.marketDataService.getQuote(symbol);
      if (currentQuote) {
        socket.emit('quote', currentQuote);
      }

      // Send order book if requested
      if (types.includes('orderbook')) {
        try {
          const orderBook = this.marketDataService.generateOrderBook(symbol);
          socket.emit('orderbook', orderBook);
        } catch (error) {
          logger.error(`Error generating order book for ${symbol}:`, error);
        }
      }
    });

    // Confirm subscription
    socket.emit('subscribed', { symbols, types });
  }

  private handleUnsubscribe(socket: Socket, data: { symbols: string[] }): void {
    const { symbols } = data;
    logger.info(`Client ${socket.id} unsubscribing from:`, { symbols });

    const socketSubscriptions = this.subscriptions.get(socket.id);
    if (!socketSubscriptions) return;

    symbols.forEach(symbol => {
      // Remove symbol from socket's subscriptions
      socketSubscriptions.delete(symbol);

      // Remove socket from symbol's subscribers
      const symbolSubs = this.symbolSubscribers.get(symbol);
      if (symbolSubs) {
        symbolSubs.delete(socket.id);
        
        // Clean up empty symbol subscriber sets
        if (symbolSubs.size === 0) {
          this.symbolSubscribers.delete(symbol);
        }
      }
    });

    // Confirm unsubscription
    socket.emit('unsubscribed', { symbols });
  }

  private handleDisconnect(socket: Socket): void {
    logger.info(`Client disconnected: ${socket.id}`);

    const socketSubscriptions = this.subscriptions.get(socket.id);
    if (socketSubscriptions) {
      // Remove socket from all symbol subscriber sets
      socketSubscriptions.forEach(symbol => {
        const symbolSubs = this.symbolSubscribers.get(symbol);
        if (symbolSubs) {
          symbolSubs.delete(socket.id);
          
          // Clean up empty symbol subscriber sets
          if (symbolSubs.size === 0) {
            this.symbolSubscribers.delete(symbol);
          }
        }
      });

      // Remove socket's subscription set
      this.subscriptions.delete(socket.id);
    }
  }

  // Admin methods for monitoring
  getConnectionStats() {
    return {
      totalConnections: this.subscriptions.size,
      totalSymbolSubscriptions: this.symbolSubscribers.size,
      subscriptionDetails: Array.from(this.symbolSubscribers.entries()).map(([symbol, sockets]) => ({
        symbol,
        subscriberCount: sockets.size
      }))
    };
  }

  broadcastAlert(alert: any): void {
    this.io.emit('alert', alert);
  }

  broadcastMLPrediction(prediction: any): void {
    this.io.emit('ml-prediction', prediction);
  }
}