import { io, Socket } from 'socket.io-client';
import { WebSocketMessage, WebSocketConnection, TradingError } from '@/types/trading';

type MessagePriority = 'critical' | 'high' | 'normal' | 'low';
type SubscriptionCallback = (message: WebSocketMessage) => void;

interface QueuedMessage {
  message: WebSocketMessage;
  priority: MessagePriority;
  timestamp: number;
}

interface Subscription {
  id: string;
  channel: string;
  callback: SubscriptionCallback;
  priority: MessagePriority;
}

export class WebSocketManager {
  private static instance: WebSocketManager;
  private connections: Map<string, Socket> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private subscriptions: Map<string, Subscription[]> = new Map();
  private batchQueue: Map<string, WebSocketMessage[]> = new Map();
  private isProcessing = false;
  private batchInterval = 16; // 60fps = 16.67ms
  private maxBatchSize = 100;
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private performanceMetrics = {
    messagesPerSecond: 0,
    averageLatency: 0,
    totalMessages: 0,
    lastResetTime: Date.now(),
  };

  private constructor() {
    this.startBatchProcessor();
    this.startPerformanceMonitoring();
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Connect to a WebSocket endpoint with automatic reconnection
   */
  async connect(
    connectionId: string,
    url: string,
    options: {
      namespace?: string;
      auth?: any;
      transports?: string[];
    } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socket = io(url, {
          transports: options.transports || ['websocket', 'polling'],
          auth: options.auth,
          autoConnect: true,
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          maxReconnectionAttempts: this.maxReconnectAttempts,
          timeout: 20000,
          forceNew: true,
        });

        // Connection event handlers
        socket.on('connect', () => {
          console.log(`✅ WebSocket connected: ${connectionId}`);
          this.reconnectAttempts.set(connectionId, 0);
          this.startHeartbeat(connectionId, socket);
          resolve();
        });

        socket.on('disconnect', (reason) => {
          console.warn(`⚠️ WebSocket disconnected: ${connectionId}, reason: ${reason}`);
          this.stopHeartbeat(connectionId);
          
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, attempt to reconnect
            setTimeout(() => socket.connect(), 1000);
          }
        });

        socket.on('connect_error', (error) => {
          console.error(`❌ WebSocket connection error: ${connectionId}`, error);
          const attempts = (this.reconnectAttempts.get(connectionId) || 0) + 1;
          this.reconnectAttempts.set(connectionId, attempts);
          
          if (attempts >= this.maxReconnectAttempts) {
            reject(new Error(`Failed to connect after ${attempts} attempts: ${error.message}`));
          }
        });

        // Message handler with prioritization
        socket.onAny((event: string, data: any) => {
          const message: WebSocketMessage = {
            type: this.getMessageType(event),
            data,
            timestamp: Date.now(),
            sequence: data.sequence,
          };

          const priority = this.getMessagePriority(message.type);
          this.queueMessage(message, priority);
        });

        this.connections.set(connectionId, socket);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a specific data channel with callback
   */
  subscribe(
    connectionId: string,
    channel: string,
    callback: SubscriptionCallback,
    priority: MessagePriority = 'normal'
  ): string {
    const subscriptionId = `${connectionId}:${channel}:${Date.now()}`;
    const subscription: Subscription = {
      id: subscriptionId,
      channel,
      callback,
      priority,
    };

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    this.subscriptions.get(channel)!.push(subscription);

    // Subscribe to the channel on the socket
    const socket = this.connections.get(connectionId);
    if (socket) {
      socket.emit('subscribe', { channel, priority });
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(subscriptionId: string): void {
    const [connectionId, channel] = subscriptionId.split(':');
    const subscriptions = this.subscriptions.get(channel);
    
    if (subscriptions) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        
        // If no more subscriptions for this channel, unsubscribe from socket
        if (subscriptions.length === 0) {
          const socket = this.connections.get(connectionId);
          if (socket) {
            socket.emit('unsubscribe', { channel });
          }
          this.subscriptions.delete(channel);
        }
      }
    }
  }

  /**
   * Send a message through a specific connection
   */
  send(connectionId: string, event: string, data: any): void {
    const socket = this.connections.get(connectionId);
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot send message: connection ${connectionId} not available`);
    }
  }

  /**
   * Disconnect a specific connection
   */
  disconnect(connectionId: string): void {
    const socket = this.connections.get(connectionId);
    if (socket) {
      this.stopHeartbeat(connectionId);
      socket.disconnect();
      this.connections.delete(connectionId);
    }
  }

  /**
   * Disconnect all connections
   */
  disconnectAll(): void {
    this.connections.forEach((socket, connectionId) => {
      this.disconnect(connectionId);
    });
    this.connections.clear();
    this.subscriptions.clear();
    this.messageQueue = [];
    this.batchQueue.clear();
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: string): WebSocketConnection['status'] {
    const socket = this.connections.get(connectionId);
    if (!socket) return 'disconnected';
    
    if (socket.connected) return 'connected';
    if (socket.connecting) return 'connecting';
    return 'disconnected';
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Queue message with priority handling
   */
  private queueMessage(message: WebSocketMessage, priority: MessagePriority): void {
    const queuedMessage: QueuedMessage = {
      message,
      priority,
      timestamp: Date.now(),
    };

    // Insert message based on priority
    if (priority === 'critical') {
      this.messageQueue.unshift(queuedMessage);
    } else {
      this.messageQueue.push(queuedMessage);
    }

    // Update performance metrics
    this.performanceMetrics.totalMessages++;
    
    // Trigger immediate processing for critical messages
    if (priority === 'critical' && !this.isProcessing) {
      this.processMessages();
    }
  }

  /**
   * Batch processor that runs at 60fps
   */
  private startBatchProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing && this.messageQueue.length > 0) {
        this.processMessages();
      }
    }, this.batchInterval);
  }

  /**
   * Process queued messages in batches
   */
  private async processMessages(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const batch = this.messageQueue.splice(0, this.maxBatchSize);
      const startTime = performance.now();

      // Group messages by channel for batch processing
      const channelGroups: Map<string, QueuedMessage[]> = new Map();
      
      batch.forEach(queuedMessage => {
        const channel = this.getChannelFromMessage(queuedMessage.message);
        if (!channelGroups.has(channel)) {
          channelGroups.set(channel, []);
        }
        channelGroups.get(channel)!.push(queuedMessage);
      });

      // Process each channel group
      const promises = Array.from(channelGroups.entries()).map(([channel, messages]) => 
        this.processChannelMessages(channel, messages)
      );

      await Promise.all(promises);

      // Update performance metrics
      const endTime = performance.now();
      const latency = endTime - startTime;
      this.updateLatencyMetrics(latency);

    } catch (error) {
      console.error('❌ Error processing message batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process messages for a specific channel
   */
  private async processChannelMessages(channel: string, messages: QueuedMessage[]): Promise<void> {
    const subscriptions = this.subscriptions.get(channel);
    if (!subscriptions) return;

    // Sort subscriptions by priority
    const sortedSubscriptions = subscriptions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Process messages for each subscription
    for (const subscription of sortedSubscriptions) {
      for (const queuedMessage of messages) {
        try {
          await subscription.callback(queuedMessage.message);
        } catch (error) {
          console.error(`❌ Error in subscription callback ${subscription.id}:`, error);
        }
      }
    }
  }

  /**
   * Start heartbeat monitoring for a connection
   */
  private startHeartbeat(connectionId: string, socket: Socket): void {
    const timer = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping', { timestamp: Date.now() });
      } else {
        this.stopHeartbeat(connectionId);
      }
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(connectionId, timer);
  }

  /**
   * Stop heartbeat monitoring for a connection
   */
  private stopHeartbeat(connectionId: string): void {
    const timer = this.heartbeatTimers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(connectionId);
    }
  }

  /**
   * Determine message type from event name
   */
  private getMessageType(event: string): WebSocketMessage['type'] {
    if (event.includes('tick') || event.includes('price')) return 'tick';
    if (event.includes('orderbook') || event.includes('depth')) return 'orderbook';
    if (event.includes('trade')) return 'trade';
    if (event.includes('order')) return 'order';
    if (event.includes('position')) return 'position';
    if (event.includes('portfolio')) return 'portfolio';
    if (event.includes('prediction')) return 'prediction';
    if (event.includes('ping') || event.includes('pong')) return 'heartbeat';
    return 'tick'; // default
  }

  /**
   * Determine message priority based on type
   */
  private getMessagePriority(type: WebSocketMessage['type']): MessagePriority {
    switch (type) {
      case 'trade':
      case 'order':
        return 'critical';
      case 'tick':
      case 'orderbook':
        return 'high';
      case 'position':
      case 'portfolio':
        return 'normal';
      case 'prediction':
      case 'heartbeat':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Extract channel from message
   */
  private getChannelFromMessage(message: WebSocketMessage): string {
    if (message.data?.symbol) {
      return `${message.type}:${message.data.symbol}`;
    }
    return message.type;
  }

  /**
   * Update latency performance metrics
   */
  private updateLatencyMetrics(latency: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.performanceMetrics.averageLatency = 
      this.performanceMetrics.averageLatency * (1 - alpha) + latency * alpha;
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const timeDiff = now - this.performanceMetrics.lastResetTime;
      
      this.performanceMetrics.messagesPerSecond = 
        (this.performanceMetrics.totalMessages / timeDiff) * 1000;
      
      // Reset counters
      this.performanceMetrics.totalMessages = 0;
      this.performanceMetrics.lastResetTime = now;
    }, 1000);
  }
}

export default WebSocketManager;