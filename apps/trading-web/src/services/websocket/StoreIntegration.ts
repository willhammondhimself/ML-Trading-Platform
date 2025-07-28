import { WebSocketMessage } from '@/types/trading';
import { WebSocketService } from './WebSocketService';
import { 
  WebSocketServiceConfig, 
  MessagePriority, 
  ConnectionState,
  AggregateMetrics
} from '@/types/websocket-service';

/**
 * Store Integration Layer for WebSocket Service
 * 
 * Features:
 * - Seamless integration with Zustand stores
 * - Real-time data synchronization
 * - Connection state management
 * - Intelligent message routing
 * - Error state synchronization
 * - Performance-optimized updates
 * - Reconnection state handling
 * - Configuration bridge
 */

export interface StoreIntegrationConfig {
  enableRealtimeSync: boolean;
  batchUpdates: boolean;
  batchDelay: number; // ms
  maxBatchSize: number;
  enableStateRecovery: boolean;
  persistConnectionState: boolean;
  errorRetryAttempts: number;
  healthCheckInterval: number;
  storeUpdateDebounce: number;
}

export interface StoreUpdateBatch {
  timestamp: number;
  updates: StoreUpdate[];
}

export interface StoreUpdate {
  storeType: 'price' | 'ml-analytics' | 'connection' | 'error';
  action: string;
  data: any;
  priority: MessagePriority;
  timestamp: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  isConnected: boolean;
  lastConnected: number;
  reconnectAttempts: number;
  health: {
    score: number;
    issues: string[];
  };
  metrics: {
    latency: number;
    throughput: number;
    errorRate: number;
  };
}

// Type definitions for store integration
export interface PriceStoreIntegration {
  updateTick: (symbol: string, price: string, volume: string, timestamp: number) => void;
  updateOrderBook: (symbol: string, bids: any[], asks: any[], timestamp: number) => void;
  updateTrade: (symbol: string, trade: any) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearData: () => void;
}

export interface MLAnalyticsStoreIntegration {
  updatePrediction: (prediction: any) => void;
  updateModelPerformance: (metrics: any) => void;
  updateConfidenceInterval: (interval: any) => void;
  updateFeatureImportance: (features: any) => void;
  setProcessingState: (processing: boolean) => void;
  setError: (error: string | null) => void;
}

export interface ErrorStoreIntegration {
  addError: (error: Error, context?: any) => void;
  clearErrors: () => void;
  updateConnectionError: (error: Error | null) => void;
  updateServiceHealth: (health: any) => void;
}

export class WebSocketStoreIntegration {
  private wsService: WebSocketService;
  private config: StoreIntegrationConfig;
  private isInitialized = false;
  
  // Store references
  private priceStore: PriceStoreIntegration | null = null;
  private mlStore: MLAnalyticsStoreIntegration | null = null;
  private errorStore: ErrorStoreIntegration | null = null;
  
  // State management
  private connectionStatus: ConnectionStatus;
  private subscriptionIds: string[] = [];
  
  // Batch processing
  private updateBatch: StoreUpdate[] = [];
  private batchTimer?: NodeJS.Timeout;
  private lastBatchFlush = 0;
  
  // Health monitoring
  private healthTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private lastErrorTime = 0;
  
  // Performance optimization
  private updateDebounce: Map<string, NodeJS.Timeout> = new Map();
  private pendingUpdates: Map<string, StoreUpdate> = new Map();

  constructor(
    wsService: WebSocketService, 
    config: Partial<StoreIntegrationConfig> = {}
  ) {
    this.wsService = wsService;
    this.config = {
      enableRealtimeSync: true,
      batchUpdates: true,
      batchDelay: 16, // ~60fps
      maxBatchSize: 100,
      enableStateRecovery: true,
      persistConnectionState: true,
      errorRetryAttempts: 3,
      healthCheckInterval: 30000, // 30 seconds
      storeUpdateDebounce: 10, // 10ms
      ...config
    };

    this.connectionStatus = this.createInitialConnectionStatus();
    this.setupEventListeners();
  }

  /**
   * Initialize store integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Setup core subscriptions
      await this.setupCoreSubscriptions();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Start batch processing
      this.startBatchProcessing();
      
      this.isInitialized = true;
      console.log('🔗 WebSocket store integration initialized');

    } catch (error) {
      console.error('❌ Failed to initialize store integration:', error);
      throw error;
    }
  }

  /**
   * Register price store
   */
  registerPriceStore(store: PriceStoreIntegration): void {
    this.priceStore = store;
    this.setupPriceSubscriptions();
    console.log('💰 Price store registered');
  }

  /**
   * Register ML analytics store
   */
  registerMLStore(store: MLAnalyticsStoreIntegration): void {
    this.mlStore = store;
    this.setupMLSubscriptions();
    console.log('🧠 ML analytics store registered');
  }

  /**
   * Register error store
   */
  registerErrorStore(store: ErrorStoreIntegration): void {
    this.errorStore = store;
    console.log('🚨 Error store registered');
  }

  /**
   * Subscribe to specific trading symbols
   */
  async subscribeToSymbol(symbol: string, dataTypes: ('tick' | 'orderbook' | 'trade')[] = ['tick']): Promise<void> {
    const subscriptions: Promise<string>[] = [];

    for (const dataType of dataTypes) {
      const channelId = `${dataType}.${symbol}`;
      const subscriptionId = this.wsService.subscribe(
        channelId,
        (message) => this.handleMarketDataMessage(message, symbol, dataType),
        { priority: 'high' }
      );
      subscriptions.push(Promise.resolve(subscriptionId));
    }

    const ids = await Promise.all(subscriptions);
    this.subscriptionIds.push(...ids);
    
    console.log(`📡 Subscribed to ${symbol} for data types: ${dataTypes.join(', ')}`);
  }

  /**
   * Subscribe to ML predictions
   */
  async subscribeToMLPredictions(models: string[] = ['*']): Promise<void> {
    const subscriptions: Promise<string>[] = [];

    for (const model of models) {
      const channels = [
        `prediction.${model}`,
        `model-performance.${model}`,
        `confidence-interval.${model}`,
        `feature-importance.${model}`
      ];

      for (const channel of channels) {
        const subscriptionId = this.wsService.subscribe(
          channel,
          (message) => this.handleMLMessage(message, model),
          { priority: 'normal' }
        );
        subscriptions.push(Promise.resolve(subscriptionId));
      }
    }

    const ids = await Promise.all(subscriptions);
    this.subscriptionIds.push(...ids);
    
    console.log(`🧠 Subscribed to ML predictions for models: ${models.join(', ')}`);
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll(): Promise<void> {
    for (const subscriptionId of this.subscriptionIds) {
      this.wsService.unsubscribe(subscriptionId);
    }
    this.subscriptionIds = [];
    console.log('📡 Unsubscribed from all channels');
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Manual reconnection trigger
   */
  async reconnect(): Promise<void> {
    try {
      this.connectionStatus.reconnectAttempts++;
      await this.wsService.reconnect();
      
      // Re-establish subscriptions
      await this.setupCoreSubscriptions();
      
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Update store integration configuration
   */
  updateConfig(newConfig: Partial<StoreIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart batch processing if batch settings changed
    if (newConfig.batchUpdates !== undefined || newConfig.batchDelay !== undefined) {
      this.stopBatchProcessing();
      this.startBatchProcessing();
    }
  }

  /**
   * Shutdown store integration
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    
    // Unsubscribe from all channels
    await this.unsubscribeAll();
    
    // Stop timers
    this.stopHealthMonitoring();
    this.stopBatchProcessing();
    this.clearDebounceTimers();
    
    // Clear references
    this.priceStore = null;
    this.mlStore = null;
    this.errorStore = null;
    
    console.log('🔗 WebSocket store integration shutdown complete');
  }

  // Private methods

  private setupEventListeners(): void {
    // WebSocket service events
    this.wsService.on('connection:opened', (data) => {
      this.updateConnectionStatus('connected');
      this.reconnectAttempts = 0;
    });

    this.wsService.on('connection:closed', (data) => {
      this.updateConnectionStatus('disconnected');
    });

    this.wsService.on('connection:error', (data) => {
      this.handleConnectionError(data.data?.error);
      this.updateConnectionStatus('error');
    });

    this.wsService.on('connection:reconnecting', (data) => {
      this.updateConnectionStatus('reconnecting');
      this.reconnectAttempts++;
    });

    this.wsService.on('health:degraded', (data) => {
      this.updateHealthStatus(data.data);
    });

    this.wsService.on('health:recovered', (data) => {
      this.updateHealthStatus(data.data);
    });

    this.wsService.on('message:dropped', (data) => {
      this.handleMessageError(data.data?.error, data);
    });
  }

  private async setupCoreSubscriptions(): Promise<void> {
    // Subscribe to system messages
    const systemChannels = [
      'system.*',
      'error.*',
      'health.*'
    ];

    for (const channel of systemChannels) {
      const subscriptionId = this.wsService.subscribe(
        channel,
        (message) => this.handleSystemMessage(message),
        { priority: 'high' }
      );
      this.subscriptionIds.push(subscriptionId);
    }
  }

  private async setupPriceSubscriptions(): Promise<void> {
    if (!this.priceStore) return;

    // Default price data subscriptions
    const priceChannels = [
      'tick.*',
      'orderbook.*',
      'trade.*'
    ];

    for (const channel of priceChannels) {
      const subscriptionId = this.wsService.subscribe(
        channel,
        (message) => this.routePriceMessage(message),
        { priority: 'high' }
      );
      this.subscriptionIds.push(subscriptionId);
    }
  }

  private async setupMLSubscriptions(): Promise<void> {
    if (!this.mlStore) return;

    // Default ML data subscriptions
    const mlChannels = [
      'prediction.*',
      'model-performance.*',
      'confidence-interval.*',
      'feature-importance.*'
    ];

    for (const channel of mlChannels) {
      const subscriptionId = this.wsService.subscribe(
        channel,
        (message) => this.routeMLMessage(message),
        { priority: 'normal' }
      );
      this.subscriptionIds.push(subscriptionId);
    }
  }

  private handleMarketDataMessage(message: WebSocketMessage, symbol: string, dataType: string): void {
    if (!this.config.enableRealtimeSync) return;

    const update: StoreUpdate = {
      storeType: 'price',
      action: `update_${dataType}`,
      data: { ...message.data, symbol },
      priority: 'high',
      timestamp: Date.now()
    };

    this.queueStoreUpdate(update);
  }

  private handleMLMessage(message: WebSocketMessage, model: string): void {
    if (!this.config.enableRealtimeSync) return;

    const update: StoreUpdate = {
      storeType: 'ml-analytics',
      action: this.getMLActionFromMessageType(message.type),
      data: { ...message.data, model },
      priority: 'normal',
      timestamp: Date.now()
    };

    this.queueStoreUpdate(update);
  }

  private handleSystemMessage(message: WebSocketMessage): void {
    // Handle system-level messages (health, errors, status)
    if (message.type === 'system') {
      this.processSystemMessage(message);
    } else if (message.type === 'error') {
      this.handleServiceError(message.data);
    }
  }

  private routePriceMessage(message: WebSocketMessage): void {
    if (!this.priceStore) return;

    // Extract symbol from message or channel context
    const symbol = message.data?.symbol || 'UNKNOWN';

    switch (message.type) {
      case 'tick':
        this.priceStore.updateTick(
          symbol,
          message.data.price,
          message.data.volume,
          message.timestamp
        );
        break;

      case 'orderbook':
        this.priceStore.updateOrderBook(
          symbol,
          message.data.bids || [],
          message.data.asks || [],
          message.timestamp
        );
        break;

      case 'trade':
        this.priceStore.updateTrade(symbol, message.data);
        break;
    }
  }

  private routeMLMessage(message: WebSocketMessage): void {
    if (!this.mlStore) return;

    switch (message.type) {
      case 'prediction':
        this.mlStore.updatePrediction(message.data);
        break;

      case 'model-performance':
        this.mlStore.updateModelPerformance(message.data);
        break;

      case 'confidence-interval':
        this.mlStore.updateConfidenceInterval(message.data);
        break;

      case 'feature-importance':
        this.mlStore.updateFeatureImportance(message.data);
        break;
    }
  }

  private queueStoreUpdate(update: StoreUpdate): void {
    if (this.config.batchUpdates) {
      this.updateBatch.push(update);
      
      if (this.updateBatch.length >= this.config.maxBatchSize) {
        this.flushBatch();
      }
    } else {
      this.applyStoreUpdate(update);
    }
  }

  private applyStoreUpdate(update: StoreUpdate): void {
    if (this.config.storeUpdateDebounce > 0) {
      this.applyDebouncedUpdate(update);
    } else {
      this.executeStoreUpdate(update);
    }
  }

  private applyDebouncedUpdate(update: StoreUpdate): void {
    const key = `${update.storeType}_${update.action}`;
    
    // Clear existing debounce timer
    const existingTimer = this.updateDebounce.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Store latest update
    this.pendingUpdates.set(key, update);
    
    // Set new debounce timer
    const timer = setTimeout(() => {
      const pendingUpdate = this.pendingUpdates.get(key);
      if (pendingUpdate) {
        this.executeStoreUpdate(pendingUpdate);
        this.pendingUpdates.delete(key);
        this.updateDebounce.delete(key);
      }
    }, this.config.storeUpdateDebounce);
    
    this.updateDebounce.set(key, timer);
  }

  private executeStoreUpdate(update: StoreUpdate): void {
    try {
      switch (update.storeType) {
        case 'price':
          this.executePriceUpdate(update);
          break;
        case 'ml-analytics':
          this.executeMLUpdate(update);
          break;
        case 'connection':
          this.executeConnectionUpdate(update);
          break;
        case 'error':
          this.executeErrorUpdate(update);
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to execute store update:`, error, update);
      this.handleUpdateError(error as Error, update);
    }
  }

  private executePriceUpdate(update: StoreUpdate): void {
    if (!this.priceStore) return;

    switch (update.action) {
      case 'update_tick':
        this.priceStore.updateTick(
          update.data.symbol,
          update.data.price,
          update.data.volume,
          update.timestamp
        );
        break;
      case 'update_orderbook':
        this.priceStore.updateOrderBook(
          update.data.symbol,
          update.data.bids,
          update.data.asks,
          update.timestamp
        );
        break;
      case 'update_trade':
        this.priceStore.updateTrade(update.data.symbol, update.data);
        break;
      case 'clear_data':
        this.priceStore.clearData();
        break;
    }
  }

  private executeMLUpdate(update: StoreUpdate): void {
    if (!this.mlStore) return;

    switch (update.action) {
      case 'update_prediction':
        this.mlStore.updatePrediction(update.data);
        break;
      case 'update_model_performance':
        this.mlStore.updateModelPerformance(update.data);
        break;
      case 'update_confidence_interval':
        this.mlStore.updateConfidenceInterval(update.data);
        break;
      case 'update_feature_importance':
        this.mlStore.updateFeatureImportance(update.data);
        break;
      case 'set_processing':
        this.mlStore.setProcessingState(update.data.processing);
        break;
      case 'set_error':
        this.mlStore.setError(update.data.error);
        break;
    }
  }

  private executeConnectionUpdate(update: StoreUpdate): void {
    if (this.priceStore && update.action === 'set_status') {
      this.priceStore.setConnectionStatus(update.data);
    }
  }

  private executeErrorUpdate(update: StoreUpdate): void {
    if (!this.errorStore) return;

    switch (update.action) {
      case 'add_error':
        this.errorStore.addError(update.data.error, update.data.context);
        break;
      case 'clear_errors':
        this.errorStore.clearErrors();
        break;
      case 'update_connection_error':
        this.errorStore.updateConnectionError(update.data.error);
        break;
      case 'update_service_health':
        this.errorStore.updateServiceHealth(update.data.health);
        break;
    }
  }

  private updateConnectionStatus(state: ConnectionState): void {
    const previousState = this.connectionStatus.state;
    
    this.connectionStatus = {
      ...this.connectionStatus,
      state,
      isConnected: state === 'connected',
      lastConnected: state === 'connected' ? Date.now() : this.connectionStatus.lastConnected
    };

    // Queue connection status update
    const update: StoreUpdate = {
      storeType: 'connection',
      action: 'set_status',
      data: this.connectionStatus,
      priority: 'critical',
      timestamp: Date.now()
    };

    this.queueStoreUpdate(update);

    console.log(`🔗 Connection status: ${previousState} → ${state}`);
  }

  private updateHealthStatus(healthData: any): void {
    this.connectionStatus.health = {
      score: healthData.score || 0,
      issues: healthData.issues || []
    };

    // Update metrics if available
    const metrics = this.wsService.getMetrics() as AggregateMetrics;
    this.connectionStatus.metrics = {
      latency: metrics.performance?.averageLatency || 0,
      throughput: metrics.performance?.totalThroughput || 0,
      errorRate: metrics.performance?.errorRate || 0
    };
  }

  private handleConnectionError(error: any): void {
    this.lastErrorTime = Date.now();
    
    if (this.errorStore) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.errorStore.updateConnectionError(errorObj);
    }
    
    console.error('🔗 Connection error:', error);
  }

  private handleServiceError(errorData: any): void {
    if (this.errorStore) {
      this.errorStore.addError(new Error(errorData.message || 'Service error'), errorData);
    }
  }

  private handleMessageError(error: any, context: any): void {
    console.warn('📡 Message error:', error, context);
    // Could implement retry logic here
  }

  private handleUpdateError(error: Error, update: StoreUpdate): void {
    console.error('🔄 Store update error:', error, update);
    
    if (this.errorStore) {
      this.errorStore.addError(error, { update });
    }
  }

  private getMLActionFromMessageType(messageType: string): string {
    const actionMap: Record<string, string> = {
      'prediction': 'update_prediction',
      'model-performance': 'update_model_performance',
      'confidence-interval': 'update_confidence_interval',
      'feature-importance': 'update_feature_importance'
    };
    
    return actionMap[messageType] || 'unknown_action';
  }

  private processSystemMessage(message: WebSocketMessage): void {
    // Handle system-level messages like health updates, configuration changes
    if (message.data?.type === 'health_update') {
      this.updateHealthStatus(message.data);
    }
  }

  private startBatchProcessing(): void {
    if (!this.config.batchUpdates) return;

    this.batchTimer = setInterval(() => {
      if (this.updateBatch.length > 0) {
        this.flushBatch();
      }
    }, this.config.batchDelay);
  }

  private stopBatchProcessing(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // Flush any remaining updates
    if (this.updateBatch.length > 0) {
      this.flushBatch();
    }
  }

  private flushBatch(): void {
    if (this.updateBatch.length === 0) return;

    const batch = [...this.updateBatch];
    this.updateBatch = [];
    this.lastBatchFlush = Date.now();

    // Process batch in priority order
    batch.sort((a, b) => this.getPriorityValue(a.priority) - this.getPriorityValue(b.priority));

    for (const update of batch) {
      this.applyStoreUpdate(update);
    }
  }

  private getPriorityValue(priority: MessagePriority): number {
    const priorityMap: Record<MessagePriority, number> = {
      'critical': 0, 'high': 1, 'normal': 2, 'low': 3
    };
    return priorityMap[priority] || 2;
  }

  private startHealthMonitoring(): void {
    this.healthTimer = setInterval(() => {
      this.updateHealthMetrics();
    }, this.config.healthCheckInterval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  private updateHealthMetrics(): void {
    try {
      const serviceHealth = this.wsService.getHealth();
      const metrics = this.wsService.getMetrics() as AggregateMetrics;

      this.connectionStatus.health = {
        score: serviceHealth.score,
        issues: serviceHealth.issues
      };

      this.connectionStatus.metrics = {
        latency: metrics.performance?.averageLatency || 0,
        throughput: metrics.performance?.totalThroughput || 0,
        errorRate: metrics.performance?.errorRate || 0
      };

      // Update error store with health data
      if (this.errorStore) {
        this.errorStore.updateServiceHealth({
          score: serviceHealth.score,
          issues: serviceHealth.issues,
          metrics: this.connectionStatus.metrics
        });
      }

    } catch (error) {
      console.error('❌ Failed to update health metrics:', error);
    }
  }

  private clearDebounceTimers(): void {
    for (const timer of this.updateDebounce.values()) {
      clearTimeout(timer);
    }
    this.updateDebounce.clear();
    this.pendingUpdates.clear();
  }

  private createInitialConnectionStatus(): ConnectionStatus {
    return {
      state: 'disconnected',
      isConnected: false,
      lastConnected: 0,
      reconnectAttempts: 0,
      health: {
        score: 0,
        issues: []
      },
      metrics: {
        latency: 0,
        throughput: 0,
        errorRate: 0
      }
    };
  }
}