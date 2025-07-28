import { Router } from 'express';
import { AdvancedMLService } from '../services/advancedML';
import { logger } from '../utils/logger';

const router = Router();
const mlService = new AdvancedMLService();

// Get predictions for a symbol
router.get('/predictions/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { models } = req.query;
    
    const modelTypes = models ? 
      (models as string).split(',').map(m => m.trim() as 'LSTM' | 'Transformer' | 'Ensemble') :
      ['LSTM', 'Transformer', 'Ensemble'];
    
    const predictions = await mlService.getPredictions(symbol.toUpperCase(), modelTypes);
    
    res.json({
      symbol: symbol.toUpperCase(),
      predictions,
      count: predictions.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching ML predictions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ensemble prediction for a symbol
router.get('/ensemble/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const prediction = await mlService.getEnsemblePrediction(symbol.toUpperCase());
    
    if (!prediction) {
      return res.status(404).json({ 
        error: 'Ensemble prediction not available - requires both LSTM and Transformer models' 
      });
    }
    
    res.json({
      symbol: symbol.toUpperCase(),
      prediction,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching ensemble prediction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get model metrics
router.get('/metrics', (req, res) => {
  try {
    const { symbol } = req.query;
    
    const metrics = mlService.getModelMetrics(symbol as string);
    
    res.json({
      metrics,
      count: metrics.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching model metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get model comparison for a symbol
router.get('/compare/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const comparison = await mlService.getModelComparison(symbol.toUpperCase());
    
    res.json({
      comparison,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching model comparison:', error);
    res.status(500).json({ 
      error: 'Model comparison failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get feature importance for a model
router.get('/features/:modelName', (req, res) => {
  try {
    const { modelName } = req.params;
    
    const featureImportance = mlService.getFeatureImportance(modelName);
    
    if (Object.keys(featureImportance).length === 0) {
      return res.status(404).json({ 
        error: `Model '${modelName}' not found or has no feature importance data` 
      });
    }
    
    // Sort features by importance
    const sortedFeatures = Object.entries(featureImportance)
      .sort(([, a], [, b]) => b - a)
      .map(([feature, importance]) => ({
        feature,
        importance,
        percentage: (importance * 100).toFixed(2)
      }));
    
    res.json({
      modelName,
      features: sortedFeatures,
      count: sortedFeatures.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching feature importance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Train a new model
router.post('/train', async (req, res) => {
  try {
    const {
      modelType,
      symbol,
      config = {}
    } = req.body;
    
    if (!modelType || !symbol) {
      return res.status(400).json({ 
        error: 'Model type and symbol are required' 
      });
    }
    
    if (!['LSTM', 'Transformer'].includes(modelType)) {
      return res.status(400).json({ 
        error: 'Model type must be either LSTM or Transformer' 
      });
    }
    
    logger.info(`Training request received: ${modelType} for ${symbol}`);
    
    const result = await mlService.trainModel(
      modelType as 'LSTM' | 'Transformer',
      symbol.toUpperCase(),
      config
    );
    
    res.json({
      success: true,
      result,
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Error training model:', error);
    res.status(500).json({ 
      error: 'Model training failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get available models
router.get('/models', (req, res) => {
  try {
    const models = mlService.getAvailableModels();
    
    // Group models by symbol for better organization
    const modelsBySymbol: Record<string, any[]> = {};
    models.forEach(model => {
      if (!modelsBySymbol[model.symbol]) {
        modelsBySymbol[model.symbol] = [];
      }
      modelsBySymbol[model.symbol].push({
        name: model.name,
        type: model.type,
        trained: model.trained,
        accuracy: (model.accuracy * 100).toFixed(1) + '%',
        lastTrained: new Date(model.lastTrained).toISOString()
      });
    });
    
    res.json({
      models: modelsBySymbol,
      totalModels: models.length,
      symbols: Object.keys(modelsBySymbol),
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching available models:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get predictions for multiple symbols
router.post('/batch-predictions', async (req, res) => {
  try {
    const {
      symbols = [],
      models = ['LSTM', 'Transformer', 'Ensemble']
    } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ 
        error: 'Symbols array is required and must not be empty' 
      });
    }
    
    if (symbols.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 symbols allowed per batch request' 
      });
    }
    
    const batchResults = await Promise.allSettled(
      symbols.map(async (symbol: string) => {
        const predictions = await mlService.getPredictions(
          symbol.toUpperCase(), 
          models as ('LSTM' | 'Transformer' | 'Ensemble')[]
        );
        return {
          symbol: symbol.toUpperCase(),
          predictions,
          count: predictions.length
        };
      })
    );
    
    const results = batchResults
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value);
    
    const errors = batchResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);
    
    res.json({
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalSymbols: symbols.length,
      successfulSymbols: results.length,
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Error processing batch predictions:', error);
    res.status(500).json({ 
      error: 'Batch prediction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Model performance dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { symbol } = req.query;
    const symbols = symbol ? [symbol as string] : ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
    
    const dashboardData = await Promise.allSettled(
      symbols.map(async (sym) => {
        const predictions = await mlService.getPredictions(sym.toUpperCase());
        const metrics = mlService.getModelMetrics(sym.toUpperCase());
        const comparison = await mlService.getModelComparison(sym.toUpperCase());
        
        return {
          symbol: sym.toUpperCase(),
          predictions: predictions.slice(0, 3), // Latest predictions only
          metrics,
          comparison,
          modelCount: metrics.length
        };
      })
    );
    
    const successfulData = dashboardData
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value);
    
    // Calculate aggregate statistics
    const aggregateStats = {
      totalModels: successfulData.reduce((sum, data) => sum + data.modelCount, 0),
      averageAccuracy: successfulData.reduce((sum, data) => {
        const avgAccuracy = data.metrics.reduce((acc: number, m: any) => acc + m.metrics.directional_accuracy, 0) / data.metrics.length;
        return sum + avgAccuracy;
      }, 0) / successfulData.length,
      bestPerformingSymbol: successfulData.reduce((best, current) => {
        const currentAvgAccuracy = current.metrics.reduce((acc: number, m: any) => acc + m.metrics.directional_accuracy, 0) / current.metrics.length;
        const bestAvgAccuracy = best.metrics.reduce((acc: number, m: any) => acc + m.metrics.directional_accuracy, 0) / best.metrics.length;
        return currentAvgAccuracy > bestAvgAccuracy ? current : best;
      }).symbol,
      modelTypes: {
        LSTM: successfulData.filter(d => d.metrics.some((m: any) => m.model_name.includes('LSTM'))).length,
        Transformer: successfulData.filter(d => d.metrics.some((m: any) => m.model_name.includes('Transformer'))).length
      }
    };
    
    res.json({
      dashboard: successfulData,
      aggregateStats,
      symbolCount: successfulData.length,
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Error generating ML dashboard:', error);
    res.status(500).json({ 
      error: 'Dashboard generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check for ML service
router.get('/health', (req, res) => {
  try {
    const models = mlService.getAvailableModels();
    const trainedModels = models.filter(m => m.trained);
    
    const health = {
      status: 'healthy',
      totalModels: models.length,
      trainedModels: trainedModels.length,
      modelTypes: {
        LSTM: models.filter(m => m.type === 'LSTM').length,
        Transformer: models.filter(m => m.type === 'Transformer').length
      },
      avgAccuracy: trainedModels.length > 0 ? 
        (trainedModels.reduce((sum, m) => sum + m.accuracy, 0) / trainedModels.length * 100).toFixed(1) + '%' : 
        'N/A',
      lastUpdate: Math.max(...trainedModels.map(m => m.lastTrained)),
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking ML service health:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

export { router as advancedMLRoutes };