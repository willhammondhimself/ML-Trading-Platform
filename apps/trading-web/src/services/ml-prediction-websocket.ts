'use client';

import { io, Socket } from 'socket.io-client';
import Decimal from 'decimal.js';
import { 
  EnhancedMLPrediction, 
  PredictionUpdate, 
  ModelMetrics,
  FeatureImportance,
  AccuracyHistory,
  AnalyticsSummary
} from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';

// Simple logger for development
const logger = {
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[ML-WebSocket] ${message}`, data || '');
    }
  },
  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[ML-WebSocket] ${message}`, data || '');
    }
  },
  warn: (message: string, data?: any) => {
    console.warn(`[ML-WebSocket] ${message}`, data || '');
  },
  error: (message: string, data?: any) => {
    console.error(`[ML-WebSocket] ${message}`, data || '');
  }
};

// WebSocket connection configuration
interface WebSocketConfig {
  url: string;
  path?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

// Connection status types
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// WebSocket event types
interface MLWebSocketEvents {
  // Prediction events
  'prediction:new': (data: any) => void;
  'prediction:update': (data: any) => void;
  'prediction:resolve': (data: any) => void;
  'prediction:expire': (data: any) => void;
  'prediction:batch': (data: any) => void;

  // Model events  
  'model:metrics': (data: any) => void;
  'model:feature_importance': (data: any) => void;
  'model:accuracy_history': (data: any) => void;

  // System events
  'analytics:summary': (data: any) => void;
  'system:health': (data: any) => void;
  
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  reconnect: (attempt: number) => void;
  reconnect_attempt: (attempt: number) => void;
  reconnect_failed: () => void;
}

// Health monitoring data
interface HealthMetrics {
  latency: number;
  messageCount: number;
  errorCount: number;
  reconnectCount: number;
  lastMessageAt: number;
  uptime: number;
}

/**
 * ML Prediction WebSocket Service
 * Provides real-time streaming of ML predictions, model metrics, and analytics data
 */
export class MLPredictionWebSocketService {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private status: ConnectionStatus = 'disconnected';
  private healthMetrics: HealthMetrics;
  private statusCallbacks: Set<(status: ConnectionStatus) => void> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionStartTime: number = 0;
  private reconnectAttempt = 0;

  constructor(config: WebSocketConfig) {
    this.config = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
      path: '/socket.io/',
      ...config,
    };

    this.healthMetrics = {
      latency: 0,
      messageCount: 0,
      errorCount: 0,
      reconnectCount: 0,
      lastMessageAt: 0,
      uptime: 0,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.socket?.connected) {
      console.warn('ML WebSocket: Already connected');
      return;
    }

    this.setStatus('connecting');
    this.connectionStartTime = Date.now();

    this.socket = io(this.config.url, {
      path: this.config.path,
      autoConnect: false,
      reconnection: this.config.reconnection,
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      timeout: this.config.timeout,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.socket.connect();
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Get current connection status
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get health metrics
   */
  public getHealthMetrics(): HealthMetrics {
    return {
      ...this.healthMetrics,
      uptime: Date.now() - this.connectionStartTime,
    };
  }

  /**
   * Subscribe to status changes
   */
  public onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Send subscription request for specific symbols/models
   */
  public subscribe(options: {
    symbols?: string[];
    models?: string[];
    predictionTypes?: string[];
    enableMetrics?: boolean;
    enableFeatures?: boolean;
  }): void {
    if (!this.socket?.connected) {
      console.warn('ML WebSocket: Not connected, cannot subscribe');
      return;
    }

    this.socket.emit('ml:subscribe', {
      symbols: options.symbols || [],
      models: options.models || [],
      predictionTypes: options.predictionTypes || ['price', 'trend', 'volatility', 'volume', 'sentiment'],
      enableMetrics: options.enableMetrics ?? true,
      enableFeatures: options.enableFeatures ?? true,
      timestamp: Date.now(),
    });

    logger.debug('Subscription sent', options);
  }

  /**
   * Unsubscribe from updates
   */
  public unsubscribe(): void {
    if (!this.socket?.connected) return;

    this.socket.emit('ml:unsubscribe', {
      timestamp: Date.now(),
    });

    logger.debug('Unsubscribed from updates');
  }

  /**
   * Set up all WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      logger.info('Connected');
      this.setStatus('connected');
      this.reconnectAttempt = 0;
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      logger.info('Disconnected', { reason });
      this.setStatus('disconnected');
      this.stopHeartbeat();
    });

    this.socket.on('connect_error', (error) => {
      console.error('ML WebSocket: Connection error', error);
      this.healthMetrics.errorCount++;
      this.setStatus('error');
    });

    this.socket.on('reconnect', (attempt) => {
      console.log('ML WebSocket: Reconnected after', attempt, 'attempts');
      this.healthMetrics.reconnectCount++;
      this.setStatus('connected');
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log('ML WebSocket: Reconnection attempt', attempt);
      this.reconnectAttempt = attempt;
      this.setStatus('reconnecting');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('ML WebSocket: Reconnection failed');
      this.setStatus('error');
    });

    // ML Prediction events
    this.socket.on('prediction:new', (data) => {
      this.handlePredictionUpdate('new_prediction', data);
    });

    this.socket.on('prediction:update', (data) => {
      this.handlePredictionUpdate('correction', data);
    });

    this.socket.on('prediction:resolve', (data) => {
      this.handlePredictionUpdate('resolution', data);
    });

    this.socket.on('prediction:expire', (data) => {
      this.handlePredictionUpdate('expiry', data);
    });

    this.socket.on('prediction:batch', (data) => {
      this.handleBatchUpdate(data);
    });

    // Model metrics events
    this.socket.on('model:metrics', (data) => {
      this.handleModelMetricsUpdate(data);
    });

    this.socket.on('model:feature_importance', (data) => {
      this.handleFeatureImportanceUpdate(data);
    });

    this.socket.on('model:accuracy_history', (data) => {
      this.handleAccuracyHistoryUpdate(data);
    });

    // Analytics events
    this.socket.on('analytics:summary', (data) => {
      this.handleAnalyticsSummaryUpdate(data);
    });

    // Health monitoring
    this.socket.on('system:health', (data) => {
      this.updateHealthMetrics(data);
    });

    // Pong response for latency measurement
    this.socket.on('pong', (timestamp: number) => {
      this.healthMetrics.latency = Date.now() - timestamp;
    });
  }

  /**
   * Handle individual prediction updates
   */
  private handlePredictionUpdate(
    type: PredictionUpdate['type'], 
    data: any
  ): void {
    try {
      const prediction = this.transformPredictionData(data);
      
      const update: PredictionUpdate = {
        type,
        prediction,
        previousValue: data.previousValue ? this.transformPredictionData(data.previousValue) : undefined,
        trigger: data.trigger || 'websocket_update',
        timestamp: Date.now(),
      };

      // Update store
      const { handleRealtimeUpdate } = useMLAnalyticsStore.getState();
      handleRealtimeUpdate(update);

      this.healthMetrics.messageCount++;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Prediction update processed', { type, id: prediction.id });
    } catch (error) {
      console.error('ML WebSocket: Error handling prediction update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Handle batch prediction updates
   */
  private handleBatchUpdate(data: any): void {
    try {
      if (!data.predictions || !Array.isArray(data.predictions)) {
        throw new Error('Invalid batch data format');
      }

      const predictions = data.predictions.map((pred: any) => 
        this.transformPredictionData(pred)
      );

      // Update store with batch
      const { addPredictions } = useMLAnalyticsStore.getState();
      addPredictions(predictions);

      this.healthMetrics.messageCount += predictions.length;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Batch update processed', { count: predictions.length });
    } catch (error) {
      console.error('ML WebSocket: Error handling batch update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Handle model metrics updates
   */
  private handleModelMetricsUpdate(data: any): void {
    try {
      const metrics = this.transformModelMetricsData(data);
      
      const { updateModelMetrics } = useMLAnalyticsStore.getState();
      updateModelMetrics(metrics);

      this.healthMetrics.messageCount++;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Model metrics updated', { model: metrics.modelName });
    } catch (error) {
      console.error('ML WebSocket: Error handling model metrics update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Handle feature importance updates
   */
  private handleFeatureImportanceUpdate(data: any): void {
    try {
      const { modelName, features } = data;
      const transformedFeatures = features.map((f: any) => this.transformFeatureImportanceData(f));
      
      const { setFeatureImportance } = useMLAnalyticsStore.getState();
      setFeatureImportance(modelName, transformedFeatures);

      this.healthMetrics.messageCount++;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Feature importance updated', { model: modelName });
    } catch (error) {
      console.error('ML WebSocket: Error handling feature importance update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Handle accuracy history updates
   */
  private handleAccuracyHistoryUpdate(data: any): void {
    try {
      const history = this.transformAccuracyHistoryData(data);
      
      const { updateAccuracyHistory } = useMLAnalyticsStore.getState();
      updateAccuracyHistory(history);

      this.healthMetrics.messageCount++;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Accuracy history updated', { 
        model: history.modelName, 
        symbol: history.symbol 
      });
    } catch (error) {
      console.error('ML WebSocket: Error handling accuracy history update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Handle analytics summary updates
   */
  private handleAnalyticsSummaryUpdate(data: any): void {
    try {
      const summary = this.transformAnalyticsSummaryData(data);
      
      const { setSummary } = useMLAnalyticsStore.getState();
      setSummary(summary);

      this.healthMetrics.messageCount++;
      this.healthMetrics.lastMessageAt = Date.now();

      console.log('ML WebSocket: Analytics summary updated');
    } catch (error) {
      console.error('ML WebSocket: Error handling analytics summary update', error);
      this.healthMetrics.errorCount++;
    }
  }

  /**
   * Transform raw prediction data to EnhancedMLPrediction
   */
  private transformPredictionData(data: any): EnhancedMLPrediction {
    return {
      id: data.id,
      symbol: data.symbol,
      predictionType: data.predictionType || 'price',
      value: new Decimal(data.value),
      confidence: data.confidence,
      horizon: data.horizon,
      modelName: data.modelName,
      modelVersion: data.modelVersion || '1.0',
      features: data.features || {},
      featureImportance: data.featureImportance || {},
      timestamp: data.timestamp,
      expiryTime: data.expiryTime,
      
      // Performance tracking
      actualValue: data.actualValue ? new Decimal(data.actualValue) : undefined,
      accuracy: data.accuracy,
      absoluteError: data.absoluteError ? new Decimal(data.absoluteError) : undefined,
      percentageError: data.percentageError,
      isResolved: data.isResolved || false,
      resolvedAt: data.resolvedAt,
      
      // Confidence intervals
      confidenceIntervals: {
        level50: {
          lower: new Decimal(data.confidenceIntervals?.level50?.lower || data.value * 0.98),
          upper: new Decimal(data.confidenceIntervals?.level50?.upper || data.value * 1.02),
        },
        level80: {
          lower: new Decimal(data.confidenceIntervals?.level80?.lower || data.value * 0.95),
          upper: new Decimal(data.confidenceIntervals?.level80?.upper || data.value * 1.05),
        },
        level95: {
          lower: new Decimal(data.confidenceIntervals?.level95?.lower || data.value * 0.90),
          upper: new Decimal(data.confidenceIntervals?.level95?.upper || data.value * 1.10),
        },
      },
      
      // Market conditions
      marketConditions: {
        volatility: data.marketConditions?.volatility || 0.02,
        volume: new Decimal(data.marketConditions?.volume || 1000000),
        trend: data.marketConditions?.trend || 'neutral',
        marketSession: data.marketConditions?.marketSession || 'market',
      },
    };
  }

  /**
   * Transform raw model metrics data
   */
  private transformModelMetricsData(data: any): ModelMetrics {
    return {
      modelName: data.modelName,
      modelVersion: data.modelVersion || '1.0',
      symbol: data.symbol,
      timeframe: data.timeframe || '1h',
      
      // Accuracy metrics
      accuracy: data.accuracy || 0,
      precision: data.precision || 0,
      recall: data.recall || 0,
      f1Score: data.f1Score || 0,
      
      // Financial metrics
      roi: data.roi || 0,
      sharpeRatio: data.sharpeRatio || 0,
      maxDrawdown: data.maxDrawdown || 0,
      winRate: data.winRate || 0,
      profitFactor: data.profitFactor || 1,
      
      // Statistical metrics
      meanAbsoluteError: data.meanAbsoluteError || 0,
      meanSquaredError: data.meanSquaredError || 0,
      rootMeanSquaredError: data.rootMeanSquaredError || 0,
      meanAbsolutePercentageError: data.meanAbsolutePercentageError || 0,
      
      // Prediction volume
      totalPredictions: data.totalPredictions || 0,
      resolvedPredictions: data.resolvedPredictions || 0,
      pendingPredictions: data.pendingPredictions || 0,
      averageConfidence: data.averageConfidence || 0,
      
      // Time-based metrics
      calculatedAt: data.calculatedAt || Date.now(),
      periodStart: data.periodStart || Date.now() - 24 * 60 * 60 * 1000,
      periodEnd: data.periodEnd || Date.now(),
      lastPredictionAt: data.lastPredictionAt || Date.now(),
      
      // Trend analysis
      performanceTrend: data.performanceTrend || 'stable',
      trendConfidence: data.trendConfidence || 0.5,
    };
  }

  /**
   * Transform raw feature importance data
   */
  private transformFeatureImportanceData(data: any): FeatureImportance {
    return {
      featureName: data.featureName,
      importance: data.importance,
      category: data.category || 'technical',
      description: data.description || '',
      pValue: data.pValue,
      confidence: data.confidence || 0.5,
      historicalImportance: data.historicalImportance || [],
      correlationWithPrice: data.correlationWithPrice || 0,
      correlationWithVolume: data.correlationWithVolume || 0,
      dataType: data.dataType || 'continuous',
      source: data.source || 'unknown',
      updateFrequency: data.updateFrequency || 60,
    };
  }

  /**
   * Transform raw accuracy history data
   */
  private transformAccuracyHistoryData(data: any): AccuracyHistory {
    return {
      modelName: data.modelName,
      symbol: data.symbol,
      timeframe: data.timeframe,
      accuracyPoints: data.accuracyPoints || [],
      movingAverages: data.movingAverages || { ma7: 0, ma30: 0, ma90: 0 },
      trend: data.trend || { direction: 'flat', strength: 0, significance: 1 },
      anomalies: data.anomalies || [],
      benchmarks: data.benchmarks || { 
        randomBaseline: 0.5, 
        marketBaseline: 0.6 
      },
    };
  }

  /**
   * Transform raw analytics summary data
   */
  private transformAnalyticsSummaryData(data: any): AnalyticsSummary {
    return {
      totalPredictions: data.totalPredictions || 0,
      activePredictions: data.activePredictions || 0,
      resolvedPredictions: data.resolvedPredictions || 0,
      overallAccuracy: data.overallAccuracy || 0,
      bestPerformingModel: data.bestPerformingModel || '',
      worstPerformingModel: data.worstPerformingModel || '',
      recentPredictions: data.recentPredictions?.map((p: any) => this.transformPredictionData(p)) || [],
      recentResolutions: data.recentResolutions?.map((p: any) => this.transformPredictionData(p)) || [],
      alerts: data.alerts || [],
      resourceUsage: data.resourceUsage || {
        computeTime: 0,
        memoryUsage: 0,
        apiCalls: 0,
        dataPoints: 0,
      },
      generatedAt: data.generatedAt || Date.now(),
      refreshInterval: data.refreshInterval || 30,
    };
  }

  /**
   * Update health metrics from server
   */
  private updateHealthMetrics(data: any): void {
    // Server can send additional health data
    if (data.serverLoad) {
      console.log('ML WebSocket: Server health', data);
    }
  }

  /**
   * Start heartbeat for connection health
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', Date.now());
      }
    }, 30000); // 30 second heartbeat
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Set connection status and notify callbacks
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusCallbacks.forEach(callback => callback(status));
    }
  }
}

// Export singleton instance
let wsService: MLPredictionWebSocketService | null = null;

export const getMLWebSocketService = (config?: Partial<WebSocketConfig>): MLPredictionWebSocketService => {
  if (!wsService) {
    const defaultConfig: WebSocketConfig = {
      url: process.env.NEXT_PUBLIC_ML_WEBSOCKET_URL || 'ws://localhost:8001',
      path: '/socket.io/',
      autoConnect: false, // Don't auto-connect until needed
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    };

    wsService = new MLPredictionWebSocketService({ ...defaultConfig, ...config });
  }

  return wsService;
};

// Export utility hooks for React components
export const useMLWebSocket = () => {
  const service = getMLWebSocketService();
  
  return {
    connect: () => service.connect(),
    disconnect: () => service.disconnect(),
    subscribe: (options: Parameters<typeof service.subscribe>[0]) => service.subscribe(options),
    unsubscribe: () => service.unsubscribe(),
    getStatus: () => service.getStatus(),
    getHealthMetrics: () => service.getHealthMetrics(),
    onStatusChange: (callback: Parameters<typeof service.onStatusChange>[0]) => 
      service.onStatusChange(callback),
  };
};