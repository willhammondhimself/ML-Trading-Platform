import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import Decimal from 'decimal.js';
import {
  EnhancedMLPrediction,
  ModelMetrics,
  FeatureImportance,
  AccuracyHistory,
  ModelComparison,
  PredictionUpdate,
  FeatureCorrelation,
  MLModelConfig,
  PredictionBatch,
  AnalyticsSummary,
  ExportConfig,
} from '@/types/ml-analytics';
import { 
  MLPredictionWebSocketService, 
  ConnectionStatus, 
  getMLWebSocketService 
} from '@/services/ml-prediction-websocket';

// Filters and sorting options
export interface MLAnalyticsFilters {
  dateRange: { start: number; end: number };
  symbols: string[];
  models: string[];
  confidenceThreshold: number;
  predictionTypes: string[];
  onlyResolved: boolean;
}

export interface MLAnalyticsSorting {
  field: keyof EnhancedMLPrediction | keyof ModelMetrics;
  direction: 'asc' | 'desc';
}

// Store state interface
interface MLAnalyticsState {
  // Core data
  predictions: Map<string, EnhancedMLPrediction>;
  modelMetrics: Map<string, ModelMetrics>;
  featureImportance: Map<string, FeatureImportance[]>;
  accuracyHistory: Map<string, AccuracyHistory>;
  modelComparisons: ModelComparison[];
  modelConfigs: Map<string, MLModelConfig>;
  
  // Real-time data
  realtimeUpdates: PredictionUpdate[];
  summary: AnalyticsSummary | null;
  
  // WebSocket connection state
  connectionStatus: ConnectionStatus;
  wsService: MLPredictionWebSocketService | null;
  connectionHealth: {
    latency: number;
    messageCount: number;
    errorCount: number;
    reconnectCount: number;
    lastMessageAt: number;
    uptime: number;
  };
  subscriptionActive: boolean;
  subscriptionFilters: {
    symbols: string[];
    models: string[];
    predictionTypes: string[];
    enableMetrics: boolean;
    enableFeatures: boolean;
  };
  
  // UI state
  filters: MLAnalyticsFilters;
  sorting: MLAnalyticsSorting;
  selectedSymbol: string | null;
  selectedModel: string | null;
  selectedTimeframe: string;
  viewMode: 'overview' | 'detailed' | 'comparison';
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
  
  // Export state
  exportProgress: {
    isExporting: boolean;
    progress: number;
    currentStep: string;
  };
}

// Actions interface
interface MLAnalyticsActions {
  // Data management
  addPredictions: (predictions: EnhancedMLPrediction[]) => void;
  updatePrediction: (prediction: EnhancedMLPrediction) => void;
  resolvePrediction: (id: string, actualValue: Decimal) => void;
  
  updateModelMetrics: (metrics: ModelMetrics) => void;
  setFeatureImportance: (modelName: string, features: FeatureImportance[]) => void;
  updateAccuracyHistory: (history: AccuracyHistory) => void;
  setModelComparisons: (comparisons: ModelComparison[]) => void;
  
  // Real-time updates
  handleRealtimeUpdate: (update: PredictionUpdate) => void;
  setSummary: (summary: AnalyticsSummary) => void;
  
  // WebSocket management
  initializeWebSocket: (config?: Partial<{url: string; autoConnect: boolean}>) => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  subscribeToUpdates: (options: {
    symbols?: string[];
    models?: string[];
    predictionTypes?: string[];
    enableMetrics?: boolean;
    enableFeatures?: boolean;
  }) => void;
  unsubscribeFromUpdates: () => void;
  updateConnectionStatus: (status: ConnectionStatus) => void;
  updateConnectionHealth: () => void;
  
  // Filtering and sorting
  setFilters: (filters: Partial<MLAnalyticsFilters>) => void;
  setSorting: (sorting: MLAnalyticsSorting) => void;
  resetFilters: () => void;
  
  // UI state management
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedModel: (model: string | null) => void;
  setSelectedTimeframe: (timeframe: string) => void;
  setViewMode: (mode: MLAnalyticsState['viewMode']) => void;
  
  // Data retrieval with filtering
  getFilteredPredictions: () => EnhancedMLPrediction[];
  getModelMetricsForSymbol: (symbol: string) => ModelMetrics[];
  getTopFeatures: (modelName: string, limit?: number) => FeatureImportance[];
  getBestPerformingModels: (limit?: number) => ModelMetrics[];
  
  // Analytics calculations
  calculateModelAccuracy: (modelName: string, symbol?: string) => number;
  calculatePortfolioMetrics: (symbol?: string) => {
    totalPredictions: number;
    accuracy: number;
    roi: number;
    sharpeRatio: number;
  };
  
  // Export functionality
  exportData: (config: ExportConfig) => Promise<Blob>;
  setExportProgress: (progress: number, step: string) => void;
  
  // Utility functions
  clearData: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Default filters
const defaultFilters: MLAnalyticsFilters = {
  dateRange: {
    start: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
    end: Date.now(),
  },
  symbols: [],
  models: [],
  confidenceThreshold: 0.0,
  predictionTypes: [],
  onlyResolved: false,
};

// Default sorting
const defaultSorting: MLAnalyticsSorting = {
  field: 'timestamp',
  direction: 'desc',
};

// Create the store
export const useMLAnalyticsStore = create<MLAnalyticsState & MLAnalyticsActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      predictions: new Map(),
      modelMetrics: new Map(),
      featureImportance: new Map(),
      accuracyHistory: new Map(),
      modelComparisons: [],
      modelConfigs: new Map(),
      realtimeUpdates: [],
      summary: null,
      
      // WebSocket state
      connectionStatus: 'disconnected' as ConnectionStatus,
      wsService: null,
      connectionHealth: {
        latency: 0,
        messageCount: 0,
        errorCount: 0,
        reconnectCount: 0,
        lastMessageAt: 0,
        uptime: 0,
      },
      subscriptionActive: false,
      subscriptionFilters: {
        symbols: [],
        models: [],
        predictionTypes: ['price', 'trend', 'volatility', 'volume', 'sentiment'],
        enableMetrics: true,
        enableFeatures: true,
      },
      
      filters: defaultFilters,
      sorting: defaultSorting,
      selectedSymbol: null,
      selectedModel: null,
      selectedTimeframe: '1h',
      viewMode: 'overview',
      
      isLoading: false,
      error: null,
      lastUpdated: 0,
      
      exportProgress: {
        isExporting: false,
        progress: 0,
        currentStep: '',
      },

      // Actions
      addPredictions: (predictions) =>
        set((state) => {
          predictions.forEach((prediction) => {
            state.predictions.set(prediction.id, prediction);
          });
          state.lastUpdated = Date.now();
        }),

      updatePrediction: (prediction) =>
        set((state) => {
          state.predictions.set(prediction.id, prediction);
          state.lastUpdated = Date.now();
        }),

      resolvePrediction: (id, actualValue) =>
        set((state) => {
          const prediction = state.predictions.get(id);
          if (prediction) {
            const updatedPrediction = {
              ...prediction,
              actualValue,
              isResolved: true,
              resolvedAt: Date.now(),
              accuracy: 1 - Math.abs(actualValue.sub(prediction.value).div(prediction.value).toNumber()),
              absoluteError: actualValue.sub(prediction.value).abs(),
              percentageError: actualValue.sub(prediction.value).div(prediction.value).mul(100).toNumber(),
            };
            state.predictions.set(id, updatedPrediction);
            state.lastUpdated = Date.now();
          }
        }),

      updateModelMetrics: (metrics) =>
        set((state) => {
          const key = `${metrics.modelName}-${metrics.symbol || 'global'}-${metrics.timeframe}`;
          state.modelMetrics.set(key, metrics);
          state.lastUpdated = Date.now();
        }),

      setFeatureImportance: (modelName, features) =>
        set((state) => {
          state.featureImportance.set(modelName, features);
          state.lastUpdated = Date.now();
        }),

      updateAccuracyHistory: (history) =>
        set((state) => {
          const key = `${history.modelName}-${history.symbol}-${history.timeframe}`;
          state.accuracyHistory.set(key, history);
          state.lastUpdated = Date.now();
        }),

      setModelComparisons: (comparisons) =>
        set((state) => {
          state.modelComparisons = comparisons;
          state.lastUpdated = Date.now();
        }),

      handleRealtimeUpdate: (update) =>
        set((state) => {
          // Add to updates queue (keep last 100)
          state.realtimeUpdates.unshift(update);
          if (state.realtimeUpdates.length > 100) {
            state.realtimeUpdates = state.realtimeUpdates.slice(0, 100);
          }

          // Update the actual prediction
          switch (update.type) {
            case 'new_prediction':
              state.predictions.set(update.prediction.id, update.prediction);
              break;
            case 'resolution':
              if (update.prediction.isResolved) {
                state.predictions.set(update.prediction.id, update.prediction);
              }
              break;
            case 'correction':
              state.predictions.set(update.prediction.id, update.prediction);
              break;
            case 'expiry':
              state.predictions.delete(update.prediction.id);
              break;
          }
          
          state.lastUpdated = Date.now();
        }),

      setSummary: (summary) =>
        set((state) => {
          state.summary = summary;
          state.lastUpdated = Date.now();
        }),

      // WebSocket management actions
      initializeWebSocket: (config = {}) =>
        set((state) => {
          if (state.wsService) {
            console.warn('WebSocket service already initialized');
            return;
          }

          const service = getMLWebSocketService(config);
          state.wsService = service;

          // Set up status change listener
          service.onStatusChange((status) => {
            set((state) => {
              state.connectionStatus = status;
              if (status === 'connected') {
                state.error = null;
                // Auto-subscribe if subscription was active
                if (state.subscriptionActive) {
                  service.subscribe(state.subscriptionFilters);
                }
              } else if (status === 'error') {
                state.error = 'WebSocket connection failed';
              }
            });
          });

          console.log('WebSocket service initialized');
        }),

      connectWebSocket: () =>
        set((state) => {
          if (!state.wsService) {
            // Initialize with default config if not already done
            get().initializeWebSocket();
          }
          
          if (state.wsService && state.connectionStatus === 'disconnected') {
            state.wsService.connect();
          }
        }),

      disconnectWebSocket: () =>
        set((state) => {
          if (state.wsService) {
            state.wsService.disconnect();
            state.subscriptionActive = false;
          }
        }),

      subscribeToUpdates: (options) =>
        set((state) => {
          // Update subscription filters
          state.subscriptionFilters = {
            symbols: options.symbols || state.subscriptionFilters.symbols,
            models: options.models || state.subscriptionFilters.models,
            predictionTypes: options.predictionTypes || state.subscriptionFilters.predictionTypes,
            enableMetrics: options.enableMetrics ?? state.subscriptionFilters.enableMetrics,
            enableFeatures: options.enableFeatures ?? state.subscriptionFilters.enableFeatures,
          };

          // Subscribe if connected
          if (state.wsService && state.connectionStatus === 'connected') {
            state.wsService.subscribe(state.subscriptionFilters);
            state.subscriptionActive = true;
          } else {
            // Mark for subscription when connected
            state.subscriptionActive = true;
          }

          console.log('WebSocket subscription updated', state.subscriptionFilters);
        }),

      unsubscribeFromUpdates: () =>
        set((state) => {
          if (state.wsService) {
            state.wsService.unsubscribe();
          }
          state.subscriptionActive = false;
        }),

      updateConnectionStatus: (status) =>
        set((state) => {
          state.connectionStatus = status;
        }),

      updateConnectionHealth: () =>
        set((state) => {
          if (state.wsService) {
            const health = state.wsService.getHealthMetrics();
            state.connectionHealth = health;
          }
        }),

      setFilters: (newFilters) =>
        set((state) => {
          state.filters = { ...state.filters, ...newFilters };
        }),

      setSorting: (sorting) =>
        set((state) => {
          state.sorting = sorting;
        }),

      resetFilters: () =>
        set((state) => {
          state.filters = defaultFilters;
        }),

      setSelectedSymbol: (symbol) =>
        set((state) => {
          state.selectedSymbol = symbol;
        }),

      setSelectedModel: (model) =>
        set((state) => {
          state.selectedModel = model;
        }),

      setSelectedTimeframe: (timeframe) =>
        set((state) => {
          state.selectedTimeframe = timeframe;
        }),

      setViewMode: (mode) =>
        set((state) => {
          state.viewMode = mode;
        }),

      // Data retrieval with filtering
      getFilteredPredictions: () => {
        const { predictions, filters, sorting } = get();
        const predictionArray = Array.from(predictions.values());
        
        // Apply filters
        let filtered = predictionArray.filter((prediction) => {
          // Date range filter
          if (prediction.timestamp < filters.dateRange.start || 
              prediction.timestamp > filters.dateRange.end) {
            return false;
          }
          
          // Symbol filter
          if (filters.symbols.length > 0 && !filters.symbols.includes(prediction.symbol)) {
            return false;
          }
          
          // Model filter
          if (filters.models.length > 0 && !filters.models.includes(prediction.modelName)) {
            return false;
          }
          
          // Confidence threshold
          if (prediction.confidence < filters.confidenceThreshold) {
            return false;
          }
          
          // Prediction type filter
          if (filters.predictionTypes.length > 0 && 
              !filters.predictionTypes.includes(prediction.predictionType)) {
            return false;
          }
          
          // Only resolved filter
          if (filters.onlyResolved && !prediction.isResolved) {
            return false;
          }
          
          return true;
        });
        
        // Apply sorting
        filtered.sort((a, b) => {
          const aValue = a[sorting.field as keyof EnhancedMLPrediction];
          const bValue = b[sorting.field as keyof EnhancedMLPrediction];
          
          if (aValue === undefined || bValue === undefined) return 0;
          
          let comparison = 0;
          if (aValue < bValue) comparison = -1;
          if (aValue > bValue) comparison = 1;
          
          return sorting.direction === 'desc' ? -comparison : comparison;
        });
        
        return filtered;
      },

      getModelMetricsForSymbol: (symbol) => {
        const { modelMetrics } = get();
        return Array.from(modelMetrics.values()).filter(
          (metrics) => metrics.symbol === symbol || !metrics.symbol
        );
      },

      getTopFeatures: (modelName, limit = 10) => {
        const { featureImportance } = get();
        const features = featureImportance.get(modelName) || [];
        return features
          .sort((a, b) => b.importance - a.importance)
          .slice(0, limit);
      },

      getBestPerformingModels: (limit = 5) => {
        const { modelMetrics } = get();
        return Array.from(modelMetrics.values())
          .sort((a, b) => b.accuracy - a.accuracy)
          .slice(0, limit);
      },

      calculateModelAccuracy: (modelName, symbol) => {
        const predictions = get().getFilteredPredictions();
        const modelPredictions = predictions.filter((p) => 
          p.modelName === modelName && 
          p.isResolved &&
          (!symbol || p.symbol === symbol)
        );
        
        if (modelPredictions.length === 0) return 0;
        
        const totalAccuracy = modelPredictions.reduce((sum, p) => 
          sum + (p.accuracy || 0), 0
        );
        
        return totalAccuracy / modelPredictions.length;
      },

      calculatePortfolioMetrics: (symbol) => {
        const predictions = get().getFilteredPredictions();
        const filteredPredictions = symbol 
          ? predictions.filter(p => p.symbol === symbol)
          : predictions;
        
        const resolvedPredictions = filteredPredictions.filter(p => p.isResolved);
        
        if (resolvedPredictions.length === 0) {
          return {
            totalPredictions: 0,
            accuracy: 0,
            roi: 0,
            sharpeRatio: 0,
          };
        }
        
        const totalAccuracy = resolvedPredictions.reduce((sum, p) => 
          sum + (p.accuracy || 0), 0
        ) / resolvedPredictions.length;
        
        // Calculate simple ROI based on prediction accuracy
        const correctPredictions = resolvedPredictions.filter(p => (p.accuracy || 0) > 0.5);
        const roi = (correctPredictions.length / resolvedPredictions.length) * 100 - 50; // Baseline 50%
        
        // Simple Sharpe ratio approximation
        const returns = resolvedPredictions.map(p => (p.accuracy || 0) - 0.5);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const stdDev = Math.sqrt(
          returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        );
        const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
        
        return {
          totalPredictions: filteredPredictions.length,
          accuracy: totalAccuracy,
          roi,
          sharpeRatio,
        };
      },

      exportData: async (config) => {
        set((state) => {
          state.exportProgress.isExporting = true;
          state.exportProgress.progress = 0;
        });
        
        try {
          // This would integrate with actual export utilities
          // For now, return a placeholder blob
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          set((state) => {
            state.exportProgress.progress = 100;
            state.exportProgress.currentStep = 'Complete';
          });
          
          const data = JSON.stringify({
            predictions: config.data.predictions ? get().getFilteredPredictions() : [],
            metrics: config.data.metrics ? Array.from(get().modelMetrics.values()) : [],
            features: config.data.features ? Array.from(get().featureImportance.values()) : [],
          });
          
          return new Blob([data], { type: 'application/json' });
        } finally {
          set((state) => {
            state.exportProgress.isExporting = false;
          });
        }
      },

      setExportProgress: (progress, step) =>
        set((state) => {
          state.exportProgress.progress = progress;
          state.exportProgress.currentStep = step;
        }),

      clearData: () =>
        set((state) => {
          state.predictions.clear();
          state.modelMetrics.clear();
          state.featureImportance.clear();
          state.accuracyHistory.clear();
          state.modelComparisons = [];
          state.modelConfigs.clear();
          state.realtimeUpdates = [];
          state.summary = null;
          state.lastUpdated = Date.now();
        }),

      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
        }),

      setError: (error) =>
        set((state) => {
          state.error = error;
        }),
    }))
  )
);

// Export useful selectors
export const selectFilteredPredictions = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.getFilteredPredictions();

export const selectModelPerformance = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.getBestPerformingModels();

export const selectTopFeatures = (modelName: string) => 
  (state: MLAnalyticsState & MLAnalyticsActions) => 
    state.getTopFeatures(modelName);

export const selectPortfolioMetrics = (symbol?: string) =>
  (state: MLAnalyticsState & MLAnalyticsActions) =>
    state.calculatePortfolioMetrics(symbol);

// WebSocket selectors
export const selectConnectionStatus = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.connectionStatus;

export const selectConnectionHealth = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.connectionHealth;

export const selectSubscriptionState = (state: MLAnalyticsState & MLAnalyticsActions) => ({
  active: state.subscriptionActive,
  filters: state.subscriptionFilters,
});

export const selectIsConnected = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.connectionStatus === 'connected';

export const selectRealtimeUpdates = (state: MLAnalyticsState & MLAnalyticsActions) =>
  state.realtimeUpdates;