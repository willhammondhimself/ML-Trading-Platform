import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, PieChart, Pie, Cell
} from 'recharts';
import { 
  Brain, Zap, TrendingUp, TrendingDown, Target, Clock, 
  Activity, BarChart3, Settings, Play, Cpu, Eye
} from 'lucide-react';

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
  signal_strength: number;
  risk_score: number;
  explanation: string;
}

interface ModelMetrics {
  model_name: string;
  symbol: string;
  metrics: {
    mse: number;
    mae: number;
    rmse: number;
    mape: number;
    directional_accuracy: number;
    sharpe_ratio: number;
    max_drawdown: number;
  };
  feature_importance: Record<string, number>;
  training_time: number;
  inference_time: number;
}

interface ModelComparison {
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
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const AdvancedMLDashboard: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [predictions, setPredictions] = useState<MLPrediction[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics[]>([]);
  const [modelComparison, setModelComparison] = useState<ModelComparison | null>(null);
  const [featureImportance, setFeatureImportance] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'LSTM' | 'Transformer' | 'Ensemble'>('Ensemble');
  const [dashboardData, setDashboardData] = useState<any>(null);

  const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'];

  useEffect(() => {
    fetchDashboardData();
    fetchPredictions();
    fetchModelComparison();
  }, [selectedSymbol]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`http://localhost:8001/api/advanced-ml/dashboard?symbol=${selectedSymbol}`);
      const data = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8001/api/advanced-ml/predictions/${selectedSymbol}`);
      const data = await response.json();
      setPredictions(data.predictions);
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModelComparison = async () => {
    try {
      const response = await fetch(`http://localhost:8001/api/advanced-ml/compare/${selectedSymbol}`);
      const data = await response.json();
      setModelComparison(data.comparison);
      
      // Fetch metrics for the symbol
      const metricsResponse = await fetch(`http://localhost:8001/api/advanced-ml/metrics?symbol=${selectedSymbol}`);
      const metricsData = await metricsResponse.json();
      setModelMetrics(metricsData.metrics);
      
      // Fetch feature importance for LSTM model
      const lstmFeatures = await fetch(`http://localhost:8001/api/advanced-ml/features/LSTM_${selectedSymbol}`);
      const lstmData = await lstmFeatures.json();
      
      const transformerFeatures = await fetch(`http://localhost:8001/api/advanced-ml/features/Transformer_${selectedSymbol}`);
      const transformerData = await transformerFeatures.json();
      
      setFeatureImportance({
        LSTM: lstmData.features || [],
        Transformer: transformerData.features || []
      });
    } catch (error) {
      console.error('Error fetching model comparison:', error);
    }
  };

  const trainModel = async (modelType: 'LSTM' | 'Transformer') => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/api/advanced-ml/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelType,
          symbol: selectedSymbol
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchModelComparison();
        await fetchPredictions();
      }
    } catch (error) {
      console.error('Error training model:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number, decimals = 2) => {
    return `${value.toFixed(decimals)}%`;
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
  };

  const getSignalColor = (signal: string) => {
    return signal === 'BUY' ? 'text-green-600' : signal === 'SELL' ? 'text-red-600' : 'text-gray-600';
  };

  const getSignalIcon = (signal: string) => {
    return signal === 'BUY' ? TrendingUp : signal === 'SELL' ? TrendingDown : Activity;
  };

  const selectedPrediction = predictions.find(p => p.model_type === selectedModel);

  // Transform predictions for chart
  const predictionChartData = selectedPrediction ? [
    { timeframe: '1H', prediction: selectedPrediction.predictions.price_1h, confidence: selectedPrediction.confidence_scores.price_1h * 100 },
    { timeframe: '4H', prediction: selectedPrediction.predictions.price_4h, confidence: selectedPrediction.confidence_scores.price_4h * 100 },
    { timeframe: '1D', prediction: selectedPrediction.predictions.price_1d, confidence: selectedPrediction.confidence_scores.price_1d * 100 },
    { timeframe: '7D', prediction: selectedPrediction.predictions.price_7d, confidence: selectedPrediction.confidence_scores.price_7d * 100 }
  ] : [];

  // Transform model metrics for radar chart
  const radarData = modelMetrics.length > 0 ? [
    {
      metric: 'Accuracy',
      LSTM: modelMetrics.find(m => m.model_name.includes('LSTM'))?.metrics.directional_accuracy || 0,
      Transformer: modelMetrics.find(m => m.model_name.includes('Transformer'))?.metrics.directional_accuracy || 0
    },
    {
      metric: 'Sharpe Ratio',
      LSTM: Math.max(0, (modelMetrics.find(m => m.model_name.includes('LSTM'))?.metrics.sharpe_ratio || 0) * 20),
      Transformer: Math.max(0, (modelMetrics.find(m => m.model_name.includes('Transformer'))?.metrics.sharpe_ratio || 0) * 20)
    },
    {
      metric: 'Low Error',
      LSTM: Math.max(0, 100 - (modelMetrics.find(m => m.model_name.includes('LSTM'))?.metrics.mape || 0) * 10),
      Transformer: Math.max(0, 100 - (modelMetrics.find(m => m.model_name.includes('Transformer'))?.metrics.mape || 0) * 10)
    },
    {
      metric: 'Stability',
      LSTM: Math.max(0, 100 + (modelMetrics.find(m => m.model_name.includes('LSTM'))?.metrics.max_drawdown || 0)),
      Transformer: Math.max(0, 100 + (modelMetrics.find(m => m.model_name.includes('Transformer'))?.metrics.max_drawdown || 0))
    }
  ] : [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            Advanced ML Models
          </h1>
          <p className="text-gray-600">LSTM and Transformer neural networks for price prediction</p>
        </div>
        <div className="flex gap-4">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {symbols.map(symbol => (
                <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={fetchPredictions} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Model Selection */}
      <div className="flex gap-2">
        {(['LSTM', 'Transformer', 'Ensemble'] as const).map(model => (
          <Button
            key={model}
            variant={selectedModel === model ? 'default' : 'outline'}
            onClick={() => setSelectedModel(model)}
            className="flex items-center gap-2"
          >
            {model === 'LSTM' && <Zap className="h-4 w-4" />}
            {model === 'Transformer' && <Eye className="h-4 w-4" />}
            {model === 'Ensemble' && <Target className="h-4 w-4" />}
            {model}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="predictions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
          <TabsTrigger value="models">Model Comparison</TabsTrigger>
          <TabsTrigger value="features">Feature Analysis</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value="predictions" className="space-y-6">
          {selectedPrediction && (
            <>
              {/* Current Prediction Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Signal</CardTitle>
                    {React.createElement(getSignalIcon(selectedPrediction.signal), { 
                      className: "h-4 w-4 text-muted-foreground" 
                    })}
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getSignalColor(selectedPrediction.signal)}`}>
                      {selectedPrediction.signal}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength: {formatPercent(selectedPrediction.signal_strength * 100)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">1H Prediction</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(selectedPrediction.predictions.price_1h)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confidence: {formatPercent(selectedPrediction.confidence_scores.price_1h * 100)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">1D Prediction</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(selectedPrediction.predictions.price_1d)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confidence: {formatPercent(selectedPrediction.confidence_scores.price_1d * 100)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {formatPercent(selectedPrediction.risk_score * 100)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedPrediction.risk_score < 0.3 ? 'Low Risk' : 
                       selectedPrediction.risk_score < 0.7 ? 'Medium Risk' : 'High Risk'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Prediction Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Price Predictions</CardTitle>
                    <CardDescription>
                      {selectedModel} model predictions with confidence scores
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={predictionChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timeframe" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip 
                          formatter={(value: number, name: string) => [
                            name === 'prediction' ? formatCurrency(value) : formatPercent(value),
                            name === 'prediction' ? 'Price' : 'Confidence'
                          ]}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="prediction" fill="#0088FE" name="Prediction" />
                        <Bar yAxisId="right" dataKey="confidence" fill="#00C49F" name="Confidence %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Model Explanation</CardTitle>
                    <CardDescription>Why the model made this prediction</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Prediction Reasoning</h4>
                      <p className="text-sm text-gray-600">
                        {selectedPrediction.explanation}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Confidence Breakdown</h4>
                      {Object.entries(selectedPrediction.confidence_scores).map(([timeframe, confidence]) => (
                        <div key={timeframe} className="flex items-center justify-between">
                          <span className="text-sm">{timeframe.replace('_', ' ').toUpperCase()}</span>
                          <div className="flex items-center gap-2 w-32">
                            <Progress value={confidence * 100} className="flex-1" />
                            <span className="text-xs w-12">{formatPercent(confidence * 100)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Model Type</h4>
                      <Badge variant="outline" className="text-sm">
                        {selectedModel} Neural Network
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* All Model Predictions Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Model Consensus</CardTitle>
                  <CardDescription>Compare predictions across all models</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {predictions.map((prediction, index) => (
                      <div key={prediction.model_type} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <Badge variant={prediction.model_type === selectedModel ? 'default' : 'outline'}>
                            {prediction.model_type}
                          </Badge>
                          <div className={`flex items-center gap-2 ${getSignalColor(prediction.signal)}`}>
                            {React.createElement(getSignalIcon(prediction.signal), { className: "h-4 w-4" })}
                            <span className="font-medium">{prediction.signal}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div>
                            <span className="text-gray-600">1H: </span>
                            <span className="font-medium">{formatCurrency(prediction.predictions.price_1h)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">1D: </span>
                            <span className="font-medium">{formatCurrency(prediction.predictions.price_1d)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Strength: </span>
                            <span className="font-medium">{formatPercent(prediction.signal_strength * 100)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="models" className="space-y-6">
          {modelComparison && (
            <>
              {/* Model Recommendation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Model Recommendation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="default" className="text-lg px-4 py-2">
                        {modelComparison.recommendation.bestModel}
                      </Badge>
                      <p className="text-sm text-gray-600 mt-2">
                        {modelComparison.recommendation.reason}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        {formatPercent(modelComparison.recommendation.confidence * 100)}
                      </div>
                      <p className="text-xs text-gray-600">Confidence</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Model Performance Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Radar</CardTitle>
                    <CardDescription>Multi-dimensional model comparison</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} />
                        <Radar
                          name="LSTM"
                          dataKey="LSTM"
                          stroke="#0088FE"
                          fill="#0088FE"
                          fillOpacity={0.3}
                        />
                        <Radar
                          name="Transformer"
                          dataKey="Transformer"
                          stroke="#00C49F"
                          fill="#00C49F"
                          fillOpacity={0.3}
                        />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Detailed Metrics</CardTitle>
                    <CardDescription>Performance statistics for both models</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {modelMetrics.map((metrics, index) => (
                        <div key={metrics.model_name} className="space-y-2">
                          <h4 className="font-medium flex items-center gap-2">
                            {metrics.model_name.includes('LSTM') ? (
                              <Zap className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Eye className="h-4 w-4 text-green-600" />
                            )}
                            {metrics.model_name.replace(`_${selectedSymbol}`, '')}
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Accuracy: </span>
                              <span className="font-medium">{formatPercent(metrics.metrics.directional_accuracy)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">MAPE: </span>
                              <span className="font-medium">{formatPercent(metrics.metrics.mape)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Sharpe: </span>
                              <span className="font-medium">{formatNumber(metrics.metrics.sharpe_ratio)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Inference: </span>
                              <span className="font-medium">{formatNumber(metrics.inference_time)}ms</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(featureImportance).map(([modelType, features]) => (
              <Card key={modelType}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {modelType === 'LSTM' ? (
                      <Zap className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-green-600" />
                    )}
                    {modelType} Feature Importance
                  </CardTitle>
                  <CardDescription>
                    Most influential features for prediction
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {features && features.length > 0 ? (
                    <div className="space-y-3">
                      {features.slice(0, 8).map((feature: any, index: number) => (
                        <div key={feature.feature} className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">
                            {feature.feature.replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-2 w-32">
                            <Progress value={parseFloat(feature.percentage)} className="flex-1" />
                            <span className="text-xs w-12">{feature.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No feature importance data available</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="training" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Train New Models
                </CardTitle>
                <CardDescription>
                  Retrain models with latest data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={() => trainModel('LSTM')}
                    disabled={loading}
                    className="flex-1 flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    {loading ? 'Training...' : 'Train LSTM'}
                  </Button>
                  <Button
                    onClick={() => trainModel('Transformer')}
                    disabled={loading}
                    className="flex-1 flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    {loading ? 'Training...' : 'Train Transformer'}
                  </Button>
                </div>
                
                {modelMetrics.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Last Training Times</h4>
                    {modelMetrics.map(metrics => (
                      <div key={metrics.model_name} className="flex justify-between text-sm">
                        <span>{metrics.model_name.replace(`_${selectedSymbol}`, '')}</span>
                        <span>{formatNumber(metrics.training_time / 1000)}s</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Training Configuration</CardTitle>
                <CardDescription>Model hyperparameters and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">LSTM Configuration</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Sequence Length: 60</div>
                      <div>Hidden Units: 128</div>
                      <div>Layers: 3</div>
                      <div>Dropout: 0.2</div>
                      <div>Learning Rate: 0.001</div>
                      <div>Epochs: 100</div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Transformer Configuration</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Sequence Length: 60</div>
                      <div>Model Dim: 256</div>
                      <div>Attention Heads: 8</div>
                      <div>Layers: 6</div>
                      <div>Learning Rate: 0.0001</div>
                      <div>Epochs: 50</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedMLDashboard;