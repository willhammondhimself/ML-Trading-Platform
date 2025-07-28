import Decimal from 'decimal.js';

// Extended ML Analytics Types for comprehensive visualization and analysis

// Core analytics interfaces extending existing MLPrediction
export interface EnhancedMLPrediction {
  id: string;
  symbol: string;
  predictionType: 'price' | 'trend' | 'volatility' | 'volume' | 'sentiment';
  value: Decimal;
  confidence: number; // 0-1
  horizon: number; // minutes
  modelName: string;
  modelVersion: string;
  features: Record<string, number>;
  featureImportance: Record<string, number>;
  timestamp: number;
  expiryTime: number;
  
  // Performance tracking
  actualValue?: Decimal;
  accuracy?: number;
  absoluteError?: Decimal;
  percentageError?: number;
  isResolved: boolean;
  resolvedAt?: number;
  
  // Statistical data
  confidenceIntervals: {
    level50: { lower: Decimal; upper: Decimal };
    level80: { lower: Decimal; upper: Decimal };
    level95: { lower: Decimal; upper: Decimal };
  };
  
  // Metadata
  marketConditions: {
    volatility: number;
    volume: Decimal;
    trend: 'bullish' | 'bearish' | 'neutral';
    marketSession: 'pre-market' | 'market' | 'after-market' | 'closed';
  };
}

// Model performance metrics
export interface ModelMetrics {
  modelName: string;
  modelVersion: string;
  symbol?: string; // Optional for symbol-specific metrics
  timeframe: string; // e.g., '1h', '1d', '1w'
  
  // Accuracy metrics
  accuracy: number; // 0-1
  precision: number; // 0-1
  recall: number; // 0-1
  f1Score: number; // 0-1
  
  // Financial metrics
  roi: number; // Return on investment
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number; // 0-1
  profitFactor: number;
  
  // Statistical metrics
  meanAbsoluteError: number;
  meanSquaredError: number;
  rootMeanSquaredError: number;
  meanAbsolutePercentageError: number;
  
  // Prediction volume and reliability
  totalPredictions: number;
  resolvedPredictions: number;
  pendingPredictions: number;
  averageConfidence: number;
  
  // Time-based metrics
  calculatedAt: number;
  periodStart: number;
  periodEnd: number;
  lastPredictionAt: number;
  
  // Trend analysis
  performanceTrend: 'improving' | 'declining' | 'stable';
  trendConfidence: number;
}

// Feature importance data
export interface FeatureImportance {
  featureName: string;
  importance: number; // 0-1
  category: 'technical' | 'fundamental' | 'sentiment' | 'macro' | 'custom';
  description: string;
  
  // Statistical significance
  pValue?: number;
  confidence: number;
  
  // Temporal data
  historicalImportance: Array<{
    timestamp: number;
    importance: number;
  }>;
  
  // Correlation data
  correlationWithPrice: number;
  correlationWithVolume: number;
  
  // Feature metadata
  dataType: 'continuous' | 'categorical' | 'binary';
  source: string; // Data source identifier
  updateFrequency: number; // Update frequency in minutes
}

// Historical accuracy tracking
export interface AccuracyHistory {
  modelName: string;
  symbol: string;
  timeframe: string;
  
  // Time-series accuracy data
  accuracyPoints: Array<{
    timestamp: number;
    accuracy: number;
    predictions: number;
    sampleSize: number;
    confidence: number;
  }>;
  
  // Moving averages
  movingAverages: {
    ma7: number;
    ma30: number;
    ma90: number;
  };
  
  // Trend analysis
  trend: {
    direction: 'up' | 'down' | 'flat';
    strength: number; // 0-1
    significance: number; // p-value
  };
  
  // Anomaly detection
  anomalies: Array<{
    timestamp: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  
  // Benchmarks
  benchmarks: {
    randomBaseline: number;
    marketBaseline: number;
    previousModelVersion?: number;
  };
}

// Model comparison data
export interface ModelComparison {
  comparisonId: string;
  models: Array<{
    modelName: string;
    modelVersion: string;
    metrics: ModelMetrics;
    rank: number;
    tier: 'A' | 'B' | 'C' | 'D'; // Performance tier
  }>;
  
  // Comparison criteria
  criteria: {
    primaryMetric: keyof ModelMetrics;
    timeframe: string;
    symbol?: string;
    minPredictions: number;
  };
  
  // Statistical significance tests
  significanceTests: Array<{
    model1: string;
    model2: string;
    metric: keyof ModelMetrics;
    pValue: number;
    isSignificant: boolean;
  }>;
  
  // Recommendations
  recommendations: Array<{
    type: 'promote' | 'demote' | 'retrain' | 'retire';
    modelName: string;
    reason: string;
    confidence: number;
  }>;
  
  generatedAt: number;
  validUntil: number;
}

// Real-time prediction updates
export interface PredictionUpdate {
  type: 'new_prediction' | 'resolution' | 'correction' | 'expiry';
  prediction: EnhancedMLPrediction;
  previousValue?: EnhancedMLPrediction;
  trigger: string; // What caused the update
  timestamp: number;
}

// Feature correlation analysis
export interface FeatureCorrelation {
  feature1: string;
  feature2: string;
  correlation: number; // -1 to 1
  significance: number; // p-value
  sampleSize: number;
  timeframe: string;
  
  // Time-series correlation data
  historicalCorrelation: Array<{
    timestamp: number;
    correlation: number;
    rollingWindow: number; // days
  }>;
}

// ML model configuration and metadata
export interface MLModelConfig {
  modelName: string;
  modelVersion: string;
  modelType: 'neural_network' | 'random_forest' | 'svm' | 'ensemble' | 'transformer';
  architecture: string;
  
  // Training configuration
  trainingConfig: {
    features: string[];
    targetVariable: string;
    trainPeriod: { start: number; end: number };
    validationPeriod: { start: number; end: number };
    hyperparameters: Record<string, any>;
  };
  
  // Performance requirements
  requirements: {
    minAccuracy: number;
    maxLatency: number; // milliseconds
    updateFrequency: number; // minutes
  };
  
  // Status and lifecycle
  status: 'training' | 'active' | 'deprecated' | 'error';
  createdAt: number;
  lastTrainedAt: number;
  nextRetrainingAt?: number;
  retirementDate?: number;
}

// Prediction batch for bulk operations
export interface PredictionBatch {
  batchId: string;
  symbol: string;
  modelName: string;
  predictions: EnhancedMLPrediction[];
  
  // Batch metadata
  createdAt: number;
  completedAt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  // Batch statistics
  statistics: {
    totalPredictions: number;
    averageConfidence: number;
    confidenceDistribution: {
      low: number; // 0-0.6
      medium: number; // 0.6-0.8
      high: number; // 0.8-1.0
    };
  };
}

// Export configuration for data and visualizations
export interface ExportConfig {
  format: 'csv' | 'json' | 'png' | 'svg' | 'pdf';
  data: {
    predictions?: boolean;
    metrics?: boolean;
    features?: boolean;
    charts?: boolean;
  };
  
  // Filtering options
  filters: {
    dateRange: { start: number; end: number };
    symbols?: string[];
    models?: string[];
    confidenceThreshold?: number;
  };
  
  // Formatting options
  formatting: {
    timezone?: string;
    decimalPlaces?: number;
    includeHeaders?: boolean;
    includeMetadata?: boolean;
  };
}

// Aggregated analytics summary
export interface AnalyticsSummary {
  totalPredictions: number;
  activePredictions: number;
  resolvedPredictions: number;
  
  // Performance overview
  overallAccuracy: number;
  bestPerformingModel: string;
  worstPerformingModel: string;
  
  // Recent activity
  recentPredictions: EnhancedMLPrediction[];
  recentResolutions: EnhancedMLPrediction[];
  
  // Alerts and notifications
  alerts: Array<{
    type: 'accuracy_drop' | 'model_error' | 'feature_drift' | 'performance_improvement';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: number;
    acknowledged: boolean;
  }>;
  
  // Resource usage
  resourceUsage: {
    computeTime: number; // milliseconds
    memoryUsage: number; // MB
    apiCalls: number;
    dataPoints: number;
  };
  
  generatedAt: number;
  refreshInterval: number; // seconds
}