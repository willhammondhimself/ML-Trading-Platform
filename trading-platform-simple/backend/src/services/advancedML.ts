import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

interface MarketDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
}

interface TechnicalIndicators {
  sma_10: number;
  sma_20: number;
  sma_50: number;
  ema_12: number;
  ema_26: number;
  rsi_14: number;
  macd: number;
  macd_signal: number;
  bb_upper: number;
  bb_lower: number;
  bb_middle: number;
  volume_sma: number;
  price_change: number;
  volatility: number;
}

interface MLFeatures {
  timestamp: number;
  symbol: string;
  price_data: number[]; // [open, high, low, close, volume]
  technical_indicators: TechnicalIndicators;
  market_regime: 'trending' | 'sideways' | 'volatile';
  time_features: {
    hour: number;
    day_of_week: number;
    month: number;
    quarter: number;
  };
}

interface MLPrediction {
  timestamp: number;
  symbol: string;
  model_type: 'LSTM' | 'Transformer' | 'Ensemble';
  predictions: {
    price_1h: number;
    price_4h: number;
    price_1d: number;
    price_7d: number;
  };
  confidence_scores: {
    price_1h: number;
    price_4h: number;
    price_1d: number;
    price_7d: number;
  };
  signal: 'BUY' | 'SELL' | 'HOLD';
  signal_strength: number; // 0-1
  risk_score: number; // 0-1
  explanation: string;
}

interface ModelMetrics {
  model_name: string;
  symbol: string;
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  metrics: {
    mse: number;
    mae: number;
    rmse: number;
    mape: number; // Mean Absolute Percentage Error
    directional_accuracy: number; // % of correct direction predictions
    sharpe_ratio: number;
    max_drawdown: number;
  };
  feature_importance: Record<string, number>;
  training_time: number; // milliseconds
  inference_time: number; // milliseconds per prediction
}

interface LSTMConfig {
  sequence_length: number;
  hidden_units: number;
  layers: number;
  dropout: number;
  learning_rate: number;
  epochs: number;
  batch_size: number;
}

interface TransformerConfig {
  sequence_length: number;
  d_model: number;
  num_heads: number;
  num_layers: number;
  d_ff: number;
  dropout: number;
  learning_rate: number;
  epochs: number;
  batch_size: number;
}

export class AdvancedMLService extends EventEmitter {
  private models: Map<string, any> = new Map();
  private modelMetrics: Map<string, ModelMetrics> = new Map();
  private featureCache: Map<string, MLFeatures[]> = new Map();
  private predictionCache: Map<string, MLPrediction[]> = new Map();

  // Model configurations
  private readonly lstmConfig: LSTMConfig = {
    sequence_length: 60, // 60 time steps
    hidden_units: 128,
    layers: 3,
    dropout: 0.2,
    learning_rate: 0.001,
    epochs: 100,
    batch_size: 32
  };

  private readonly transformerConfig: TransformerConfig = {
    sequence_length: 60,
    d_model: 256,
    num_heads: 8,
    num_layers: 6,
    d_ff: 1024,
    dropout: 0.1,
    learning_rate: 0.0001,
    epochs: 50,
    batch_size: 16
  };

  constructor() {
    super();
    this.initializeMockModels();
    logger.info('Advanced ML service initialized with LSTM and Transformer models');
  }

  /**
   * Initialize mock models for demonstration
   */
  private initializeMockModels(): void {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'];
    
    symbols.forEach(symbol => {
      // Mock LSTM model
      this.models.set(`LSTM_${symbol}`, {
        type: 'LSTM',
        symbol,
        trained: true,
        accuracy: 0.72 + Math.random() * 0.15,
        lastTrained: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000 // Within last week
      });

      // Mock Transformer model
      this.models.set(`Transformer_${symbol}`, {
        type: 'Transformer',
        symbol,
        trained: true,
        accuracy: 0.68 + Math.random() * 0.18,
        lastTrained: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000
      });

      // Generate mock metrics
      this.generateMockMetrics(symbol);
      
      // Generate mock features and predictions
      this.generateMockFeatures(symbol);
      this.generateMockPredictions(symbol);
    });
  }

  /**
   * Generate mock model metrics
   */
  private generateMockMetrics(symbol: string): void {
    const baseMetrics = {
      mse: 0.1 + Math.random() * 0.2,
      mae: 0.05 + Math.random() * 0.1,
      rmse: 0.15 + Math.random() * 0.15,
      mape: 2 + Math.random() * 3, // 2-5%
      directional_accuracy: 55 + Math.random() * 20, // 55-75%
      sharpe_ratio: 0.8 + Math.random() * 1.2,
      max_drawdown: -(5 + Math.random() * 10) // -5% to -15%
    };

    // LSTM metrics
    this.modelMetrics.set(`LSTM_${symbol}`, {
      model_name: `LSTM_${symbol}`,
      symbol,
      train_start: '2022-01-01',
      train_end: '2023-06-30',
      test_start: '2023-07-01',
      test_end: '2024-01-01',
      metrics: {
        ...baseMetrics,
        directional_accuracy: baseMetrics.directional_accuracy + 2 // LSTM slightly better at direction
      },
      feature_importance: {
        'close_price': 0.25,
        'volume': 0.15,
        'rsi_14': 0.12,
        'macd': 0.11,
        'sma_20': 0.10,
        'volatility': 0.08,
        'bb_position': 0.07,
        'ema_12': 0.06,
        'price_change': 0.06
      },
      training_time: 180000 + Math.random() * 120000, // 3-5 minutes
      inference_time: 15 + Math.random() * 10 // 15-25ms
    });

    // Transformer metrics
    this.modelMetrics.set(`Transformer_${symbol}`, {
      model_name: `Transformer_${symbol}`,
      symbol,
      train_start: '2022-01-01',
      train_end: '2023-06-30',
      test_start: '2023-07-01',
      test_end: '2024-01-01',
      metrics: {
        ...baseMetrics,
        mse: baseMetrics.mse * 0.95, // Transformer slightly better at MSE
        mae: baseMetrics.mae * 0.93,
        rmse: baseMetrics.rmse * 0.94
      },
      feature_importance: {
        'attention_close': 0.22,
        'attention_volume': 0.18,
        'attention_volatility': 0.14,
        'cross_attention_rsi': 0.13,
        'temporal_pattern': 0.11,
        'attention_macd': 0.09,
        'market_regime': 0.08,
        'time_embedding': 0.05
      },
      training_time: 300000 + Math.random() * 180000, // 5-8 minutes
      inference_time: 25 + Math.random() * 15 // 25-40ms
    });
  }

  /**
   * Generate mock features for a symbol
   */
  private generateMockFeatures(symbol: string): void {
    const features: MLFeatures[] = [];
    const now = Date.now();
    
    // Generate 100 historical feature points
    for (let i = 100; i >= 0; i--) {
      const timestamp = now - (i * 60 * 60 * 1000); // Hourly data
      const basePrice = 100 + Math.random() * 200;
      const volatility = 0.02 + Math.random() * 0.03;
      
      const date = new Date(timestamp);
      
      features.push({
        timestamp,
        symbol,
        price_data: [
          basePrice * (1 + (Math.random() - 0.5) * volatility),
          basePrice * (1 + Math.random() * volatility),
          basePrice * (1 - Math.random() * volatility),
          basePrice * (1 + (Math.random() - 0.5) * volatility),
          Math.floor(1000000 + Math.random() * 5000000)
        ],
        technical_indicators: {
          sma_10: basePrice * (1 + (Math.random() - 0.5) * 0.05),
          sma_20: basePrice * (1 + (Math.random() - 0.5) * 0.08),
          sma_50: basePrice * (1 + (Math.random() - 0.5) * 0.12),
          ema_12: basePrice * (1 + (Math.random() - 0.5) * 0.04),
          ema_26: basePrice * (1 + (Math.random() - 0.5) * 0.07),
          rsi_14: 30 + Math.random() * 40,
          macd: (Math.random() - 0.5) * 2,
          macd_signal: (Math.random() - 0.5) * 1.8,
          bb_upper: basePrice * 1.05,
          bb_lower: basePrice * 0.95,
          bb_middle: basePrice,
          volume_sma: 2000000 + Math.random() * 3000000,
          price_change: (Math.random() - 0.5) * 0.1,
          volatility: volatility
        },
        market_regime: Math.random() < 0.4 ? 'trending' : Math.random() < 0.7 ? 'sideways' : 'volatile',
        time_features: {
          hour: date.getHours(),
          day_of_week: date.getDay(),
          month: date.getMonth(),
          quarter: Math.floor(date.getMonth() / 3)
        }
      });
    }
    
    this.featureCache.set(symbol, features);
  }

  /**
   * Generate mock predictions for a symbol
   */
  private generateMockPredictions(symbol: string): void {
    const predictions: MLPrediction[] = [];
    const now = Date.now();
    const currentPrice = 100 + Math.random() * 200;
    
    // Generate predictions for different models
    const modelTypes: ('LSTM' | 'Transformer' | 'Ensemble')[] = ['LSTM', 'Transformer', 'Ensemble'];
    
    modelTypes.forEach(modelType => {
      const baseAccuracy = modelType === 'LSTM' ? 0.72 : 
                          modelType === 'Transformer' ? 0.68 : 0.75;
      
      const volatility = 0.02 + Math.random() * 0.02;
      const trend = (Math.random() - 0.5) * 0.1;
      
      const prediction: MLPrediction = {
        timestamp: now,
        symbol,
        model_type: modelType,
        predictions: {
          price_1h: currentPrice * (1 + trend * 0.1 + (Math.random() - 0.5) * volatility * 0.5),
          price_4h: currentPrice * (1 + trend * 0.3 + (Math.random() - 0.5) * volatility * 1),
          price_1d: currentPrice * (1 + trend * 0.7 + (Math.random() - 0.5) * volatility * 2),
          price_7d: currentPrice * (1 + trend * 2 + (Math.random() - 0.5) * volatility * 5)
        },
        confidence_scores: {
          price_1h: baseAccuracy + Math.random() * 0.1,
          price_4h: baseAccuracy - 0.05 + Math.random() * 0.1,
          price_1d: baseAccuracy - 0.1 + Math.random() * 0.1,
          price_7d: baseAccuracy - 0.2 + Math.random() * 0.1
        },
        signal: trend > 0.02 ? 'BUY' : trend < -0.02 ? 'SELL' : 'HOLD',
        signal_strength: Math.min(0.95, Math.abs(trend) * 10 + baseAccuracy),
        risk_score: Math.min(0.9, volatility * 15 + (1 - baseAccuracy)),
        explanation: this.generatePredictionExplanation(modelType, trend, volatility)
      };
      
      predictions.push(prediction);
    });
    
    this.predictionCache.set(symbol, predictions);
  }

  /**
   * Generate explanation for prediction
   */
  private generatePredictionExplanation(
    modelType: string, 
    trend: number, 
    volatility: number
  ): string {
    const direction = trend > 0 ? 'upward' : trend < 0 ? 'downward' : 'neutral';
    const volLevel = volatility > 0.03 ? 'high' : volatility > 0.02 ? 'moderate' : 'low';
    
    const explanations = {
      'LSTM': [
        `Sequential pattern analysis indicates ${direction} momentum with ${volLevel} volatility`,
        `LSTM detected ${direction} price trends in recent 60-period sequence`,
        `Memory cells captured ${direction} pattern with ${volLevel} confidence intervals`
      ],
      'Transformer': [
        `Attention mechanism identified ${direction} market signals across timeframes`,
        `Multi-head attention focused on ${direction} price dynamics`,
        `Transformer model weighted ${direction} patterns with ${volLevel} uncertainty`
      ],
      'Ensemble': [
        `Combined LSTM and Transformer models predict ${direction} movement`,
        `Ensemble consensus indicates ${direction} price action with ${volLevel} risk`,
        `Multi-model agreement suggests ${direction} trend with ${volLevel} volatility`
      ]
    };
    
    const options = explanations[modelType as keyof typeof explanations];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Get predictions for a symbol
   */
  async getPredictions(
    symbol: string, 
    modelTypes: ('LSTM' | 'Transformer' | 'Ensemble')[] = ['LSTM', 'Transformer', 'Ensemble']
  ): Promise<MLPrediction[]> {
    const predictions = this.predictionCache.get(symbol) || [];
    return predictions.filter(p => modelTypes.includes(p.model_type));
  }

  /**
   * Get model metrics
   */
  getModelMetrics(symbol?: string): ModelMetrics[] {
    if (symbol) {
      const metrics = [];
      const lstmMetrics = this.modelMetrics.get(`LSTM_${symbol}`);
      const transformerMetrics = this.modelMetrics.get(`Transformer_${symbol}`);
      
      if (lstmMetrics) metrics.push(lstmMetrics);
      if (transformerMetrics) metrics.push(transformerMetrics);
      
      return metrics;
    }
    
    return Array.from(this.modelMetrics.values());
  }

  /**
   * Get feature importance for a model
   */
  getFeatureImportance(modelName: string): Record<string, number> {
    const metrics = this.modelMetrics.get(modelName);
    return metrics?.feature_importance || {};
  }

  /**
   * Train a new model (mock implementation)
   */
  async trainModel(
    modelType: 'LSTM' | 'Transformer',
    symbol: string,
    config?: Partial<LSTMConfig & TransformerConfig>
  ): Promise<{
    success: boolean;
    modelName: string;
    trainingTime: number;
    metrics: ModelMetrics;
  }> {
    const startTime = Date.now();
    const modelName = `${modelType}_${symbol}`;
    
    logger.info(`Starting ${modelType} training for ${symbol}`);
    
    // Simulate training time
    const trainingTime = modelType === 'LSTM' ? 
      180000 + Math.random() * 120000 : // 3-5 minutes for LSTM
      300000 + Math.random() * 180000;  // 5-8 minutes for Transformer
    
    // Mock training delay (in real implementation, this would be actual training)
    await new Promise(resolve => setTimeout(resolve, Math.min(5000, trainingTime / 60))); // Max 5s demo
    
    // Generate new metrics
    this.generateMockMetrics(symbol);
    const metrics = this.modelMetrics.get(modelName)!;
    
    // Update model
    this.models.set(modelName, {
      type: modelType,
      symbol,
      trained: true,
      accuracy: metrics.metrics.directional_accuracy / 100,
      lastTrained: Date.now(),
      config: config || (modelType === 'LSTM' ? this.lstmConfig : this.transformerConfig)
    });
    
    // Generate new predictions
    this.generateMockPredictions(symbol);
    
    const actualTrainingTime = Date.now() - startTime;
    logger.info(`${modelType} training completed for ${symbol} in ${actualTrainingTime}ms`);
    
    this.emit('model-trained', {
      modelType,
      symbol,
      metrics,
      trainingTime: actualTrainingTime
    });
    
    return {
      success: true,
      modelName,
      trainingTime: actualTrainingTime,
      metrics
    };
  }

  /**
   * Get ensemble prediction combining LSTM and Transformer
   */
  async getEnsemblePrediction(symbol: string): Promise<MLPrediction | null> {
    const predictions = await this.getPredictions(symbol, ['LSTM', 'Transformer']);
    
    if (predictions.length < 2) {
      return null;
    }
    
    const lstmPred = predictions.find(p => p.model_type === 'LSTM');
    const transformerPred = predictions.find(p => p.model_type === 'Transformer');
    
    if (!lstmPred || !transformerPred) {
      return null;
    }
    
    // Weighted ensemble based on historical accuracy
    const lstmWeight = 0.6; // LSTM typically better at direction
    const transformerWeight = 0.4; // Transformer better at magnitude
    
    const ensemblePrediction: MLPrediction = {
      timestamp: Date.now(),
      symbol,
      model_type: 'Ensemble',
      predictions: {
        price_1h: lstmPred.predictions.price_1h * lstmWeight + transformerPred.predictions.price_1h * transformerWeight,
        price_4h: lstmPred.predictions.price_4h * lstmWeight + transformerPred.predictions.price_4h * transformerWeight,
        price_1d: lstmPred.predictions.price_1d * lstmWeight + transformerPred.predictions.price_1d * transformerWeight,
        price_7d: lstmPred.predictions.price_7d * lstmWeight + transformerPred.predictions.price_7d * transformerWeight
      },
      confidence_scores: {
        price_1h: Math.min(0.95, lstmPred.confidence_scores.price_1h * lstmWeight + transformerPred.confidence_scores.price_1h * transformerWeight + 0.05),
        price_4h: Math.min(0.95, lstmPred.confidence_scores.price_4h * lstmWeight + transformerPred.confidence_scores.price_4h * transformerWeight + 0.03),
        price_1d: Math.min(0.95, lstmPred.confidence_scores.price_1d * lstmWeight + transformerPred.confidence_scores.price_1d * transformerWeight + 0.02),
        price_7d: Math.min(0.95, lstmPred.confidence_scores.price_7d * lstmWeight + transformerPred.confidence_scores.price_7d * transformerWeight)
      },
      signal: this.determineEnsembleSignal(lstmPred, transformerPred),
      signal_strength: Math.min(0.95, (lstmPred.signal_strength * lstmWeight + transformerPred.signal_strength * transformerWeight) * 1.1),
      risk_score: lstmPred.risk_score * lstmWeight + transformerPred.risk_score * transformerWeight,
      explanation: `Ensemble of LSTM (${(lstmWeight * 100).toFixed(0)}%) and Transformer (${(transformerWeight * 100).toFixed(0)}%) models`
    };
    
    return ensemblePrediction;
  }

  /**
   * Determine ensemble signal from individual model signals
   */
  private determineEnsembleSignal(
    lstmPred: MLPrediction, 
    transformerPred: MLPrediction
  ): 'BUY' | 'SELL' | 'HOLD' {
    if (lstmPred.signal === transformerPred.signal) {
      return lstmPred.signal;
    }
    
    // If signals disagree, use the one with higher confidence
    const lstmConfidence = (lstmPred.confidence_scores.price_1h + lstmPred.confidence_scores.price_4h) / 2;
    const transformerConfidence = (transformerPred.confidence_scores.price_1h + transformerPred.confidence_scores.price_4h) / 2;
    
    return lstmConfidence > transformerConfidence ? lstmPred.signal : transformerPred.signal;
  }

  /**
   * Get model comparison analysis
   */
  async getModelComparison(symbol: string): Promise<{
    symbol: string;
    models: {
      LSTM: { accuracy: number; metrics: ModelMetrics };
      Transformer: { accuracy: number; metrics: ModelMetrics };
    };
    recommendation: {
      bestModel: 'LSTM' | 'Transformer' | 'Ensemble';
      reason: string;
      confidence: number;
    };
  }> {
    const lstmMetrics = this.modelMetrics.get(`LSTM_${symbol}`);
    const transformerMetrics = this.modelMetrics.get(`Transformer_${symbol}`);
    
    if (!lstmMetrics || !transformerMetrics) {
      throw new Error(`Models not found for symbol ${symbol}`);
    }
    
    const lstmScore = (
      lstmMetrics.metrics.directional_accuracy * 0.4 +
      (100 - Math.abs(lstmMetrics.metrics.mape)) * 0.3 +
      Math.min(100, lstmMetrics.metrics.sharpe_ratio * 20) * 0.3
    );
    
    const transformerScore = (
      transformerMetrics.metrics.directional_accuracy * 0.4 +
      (100 - Math.abs(transformerMetrics.metrics.mape)) * 0.3 +
      Math.min(100, transformerMetrics.metrics.sharpe_ratio * 20) * 0.3
    );
    
    let bestModel: 'LSTM' | 'Transformer' | 'Ensemble';
    let reason: string;
    let confidence: number;
    
    const scoreDiff = Math.abs(lstmScore - transformerScore);
    
    if (scoreDiff < 5) {
      bestModel = 'Ensemble';
      reason = 'Models perform similarly - ensemble provides better diversification';
      confidence = 0.85;
    } else if (lstmScore > transformerScore) {
      bestModel = 'LSTM';
      reason = `LSTM shows ${scoreDiff.toFixed(1)}% better performance with stronger directional accuracy`;
      confidence = Math.min(0.95, 0.7 + scoreDiff / 100);
    } else {
      bestModel = 'Transformer';
      reason = `Transformer shows ${scoreDiff.toFixed(1)}% better performance with lower prediction error`;
      confidence = Math.min(0.95, 0.7 + scoreDiff / 100);
    }
    
    return {
      symbol,
      models: {
        LSTM: { accuracy: lstmMetrics.metrics.directional_accuracy, metrics: lstmMetrics },
        Transformer: { accuracy: transformerMetrics.metrics.directional_accuracy, metrics: transformerMetrics }
      },
      recommendation: {
        bestModel,
        reason,
        confidence
      }
    };
  }

  /**
   * Get available models
   */
  getAvailableModels(): Array<{
    name: string;
    type: string;
    symbol: string;
    trained: boolean;
    accuracy: number;
    lastTrained: number;
  }> {
    return Array.from(this.models.entries()).map(([name, model]) => ({
      name,
      type: model.type,
      symbol: model.symbol,
      trained: model.trained,
      accuracy: model.accuracy,
      lastTrained: model.lastTrained
    }));
  }

  /**
   * Start real-time prediction updates
   */
  startRealTimePredictions(symbols: string[], intervalMs: number = 60000): void {
    logger.info(`Starting real-time ML predictions for ${symbols.length} symbols`);
    
    const updatePredictions = async () => {
      for (const symbol of symbols) {
        try {
          // Regenerate predictions to simulate real-time updates
          this.generateMockPredictions(symbol);
          const predictions = await this.getPredictions(symbol);
          
          this.emit('predictions-updated', {
            symbol,
            predictions,
            timestamp: Date.now()
          });
        } catch (error) {
          logger.error(`Error updating predictions for ${symbol}:`, error);
        }
      }
    };
    
    // Initial update
    updatePredictions();
    
    // Set up interval
    setInterval(updatePredictions, intervalMs);
  }
}