'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
  ScatterChart,
  Scatter,
} from 'recharts';
import { format, subDays, subWeeks, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { AccuracyHistory } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle,
  Target,
  Zap,
  Calendar,
  Filter,
  Download,
  Settings,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';

interface AccuracyTrendChartProps {
  modelName?: string;
  symbol?: string;
  timeframe?: string;
  height?: number;
  showBenchmarks?: boolean;
  showAnomalies?: boolean;
  showMovingAverages?: boolean;
  enableZoom?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface TrendDataPoint {
  timestamp: number;
  date: string;
  accuracy: number;
  ma7?: number;
  ma30?: number;
  ma90?: number;
  predictions: number;
  sampleSize: number;
  confidence: number;
  isAnomaly: boolean;
  anomalySeverity?: 'low' | 'medium' | 'high';
  benchmark?: number;
}

interface ChartSettings {
  showMA7: boolean;
  showMA30: boolean;
  showMA90: boolean;
  showConfidenceBands: boolean;
  showPredictionVolume: boolean;
  showBenchmark: boolean;
  highlightAnomalies: boolean;
}

const DEFAULT_SETTINGS: ChartSettings = {
  showMA7: true,
  showMA30: true,
  showMA90: false,
  showConfidenceBands: true,
  showPredictionVolume: false,
  showBenchmark: true,
  highlightAnomalies: true,
};

export function AccuracyTrendChart({
  modelName,
  symbol,
  timeframe = '1h',
  height = 400,
  showBenchmarks = true,
  showAnomalies = true,
  showMovingAverages = true,
  enableZoom = true,
  enableExport = true,
  className,
}: AccuracyTrendChartProps) {
  const { accuracyHistory } = useMLAnalyticsStore();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [chartSettings, setChartSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<TrendDataPoint | null>(null);

  // Process accuracy history data
  const trendData = useMemo(() => {
    if (!modelName) return [];
    
    const key = `${modelName}-${symbol || 'global'}-${timeframe}`;
    const history = accuracyHistory.get(key);
    
    if (!history) {
      // Generate mock data for demonstration
      const now = Date.now();
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
      const points = Math.min(days * 2, 100); // Up to 100 data points
      
      const mockData: TrendDataPoint[] = [];
      let baseAccuracy = 0.75;
      
      for (let i = points - 1; i >= 0; i--) {
        const timestamp = now - (i * (days * 24 * 60 * 60 * 1000) / points);
        
        // Generate realistic trending data with some volatility
        const trend = Math.sin(i * 0.1) * 0.05; // Long-term trend
        const noise = (Math.random() - 0.5) * 0.1; // Short-term noise
        const accuracy = Math.max(0.3, Math.min(0.95, baseAccuracy + trend + noise));
        
        // Detect anomalies (significant deviations)
        const isAnomaly = Math.random() < 0.05; // 5% chance of anomaly
        const anomalySeverity = isAnomaly 
          ? accuracy < 0.5 ? 'high' : accuracy < 0.6 ? 'medium' : 'low'
          : undefined;
        
        mockData.push({
          timestamp,
          date: format(new Date(timestamp), 'MMM dd'),
          accuracy: accuracy * 100,
          predictions: Math.floor(50 + Math.random() * 100),
          sampleSize: Math.floor(100 + Math.random() * 200),
          confidence: Math.random() * 0.3 + 0.7,
          isAnomaly,
          anomalySeverity,
          benchmark: 75, // 75% benchmark
        });
      }
      
      // Calculate moving averages
      for (let i = 0; i < mockData.length; i++) {
        if (i >= 6) { // 7-day MA
          const sum7 = mockData.slice(i - 6, i + 1).reduce((sum, d) => sum + d.accuracy, 0);
          mockData[i].ma7 = sum7 / 7;
        }
        
        if (i >= 29) { // 30-day MA
          const sum30 = mockData.slice(i - 29, i + 1).reduce((sum, d) => sum + d.accuracy, 0);
          mockData[i].ma30 = sum30 / 30;
        }
        
        if (i >= 89) { // 90-day MA
          const sum90 = mockData.slice(i - 89, i + 1).reduce((sum, d) => sum + d.accuracy, 0);
          mockData[i].ma90 = sum90 / 90;
        }
      }
      
      return mockData;
    }

    // Process real accuracy history
    return history.accuracyPoints.map((point, index): TrendDataPoint => {
      const anomaly = history.anomalies.find(a => 
        Math.abs(a.timestamp - point.timestamp) < 60 * 60 * 1000 // Within 1 hour
      );
      
      return {
        timestamp: point.timestamp,
        date: format(new Date(point.timestamp), 'MMM dd HH:mm'),
        accuracy: point.accuracy * 100,
        ma7: history.movingAverages.ma7 * 100,
        ma30: history.movingAverages.ma30 * 100,
        ma90: history.movingAverages.ma90 * 100,
        predictions: point.predictions,
        sampleSize: point.sampleSize,
        confidence: point.confidence,
        isAnomaly: !!anomaly,
        anomalySeverity: anomaly?.severity,
        benchmark: history.benchmarks.marketBaseline * 100,
      };
    });
  }, [accuracyHistory, modelName, symbol, timeframe, timeRange]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (trendData.length === 0) return null;

    const accuracies = trendData.map(d => d.accuracy);
    const current = accuracies[accuracies.length - 1];
    const previous = accuracies[accuracies.length - 2];
    const change = previous ? current - previous : 0;
    
    const average = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    const max = Math.max(...accuracies);
    const min = Math.min(...accuracies);
    
    const anomalies = trendData.filter(d => d.isAnomaly);
    const highSeverityAnomalies = anomalies.filter(a => a.anomalySeverity === 'high');
    
    // Calculate trend
    const firstHalf = accuracies.slice(0, Math.floor(accuracies.length / 2));
    const secondHalf = accuracies.slice(Math.floor(accuracies.length / 2));
    const firstAvg = firstHalf.reduce((sum, acc) => sum + acc, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, acc) => sum + acc, 0) / secondHalf.length;
    const trend = secondAvg > firstAvg ? 'improving' : secondAvg < firstAvg ? 'declining' : 'stable';
    
    return {
      current,
      change,
      average,
      max,
      min,
      trend,
      anomaliesCount: anomalies.length,
      highSeverityAnomalies: highSeverityAnomalies.length,
      totalPredictions: trendData.reduce((sum, d) => sum + d.predictions, 0),
    };
  }, [trendData]);

  const handleExport = useCallback(() => {
    if (!enableExport) return;
    
    const csvContent = [
      'timestamp,date,accuracy,ma7,ma30,predictions,sampleSize,confidence,isAnomaly,benchmark',
      ...trendData.map(d => 
        `${d.timestamp},"${d.date}",${d.accuracy},${d.ma7 || ''},${d.ma30 || ''},${d.predictions},${d.sampleSize},${d.confidence},${d.isAnomaly},${d.benchmark || ''}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accuracy-trend-${modelName}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [trendData, modelName, enableExport]);

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload as TrendDataPoint;
    
    return (
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 shadow-lg">
        <div className="text-sm font-medium text-trading-text-primary mb-2">
          {label}
        </div>
        
        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-trading-text-secondary">Accuracy:</span>
            <span className={cn(
              "font-medium",
              data.accuracy > 80 ? "text-trading-success" :
              data.accuracy > 60 ? "text-trading-warning" : "text-trading-error"
            )}>
              {data.accuracy.toFixed(1)}%
            </span>
          </div>
          
          {data.ma7 && chartSettings.showMA7 && (
            <div className="flex justify-between items-center">
              <span className="text-trading-text-secondary">7-day MA:</span>
              <span className="font-medium">{data.ma7.toFixed(1)}%</span>
            </div>
          )}
          
          {data.ma30 && chartSettings.showMA30 && (
            <div className="flex justify-between items-center">
              <span className="text-trading-text-secondary">30-day MA:</span>
              <span className="font-medium">{data.ma30.toFixed(1)}%</span>
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <span className="text-trading-text-secondary">Predictions:</span>
            <span className="font-medium">{data.predictions}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-trading-text-secondary">Sample Size:</span>
            <span className="font-medium">{data.sampleSize}</span>
          </div>
          
          {data.isAnomaly && (
            <div className="pt-2 border-t border-trading-neutral-700">
              <div className={cn(
                "text-xs font-medium",
                data.anomalySeverity === 'high' ? "text-trading-error" :
                data.anomalySeverity === 'medium' ? "text-trading-warning" : "text-trading-info"
              )}>
                ⚠️ Anomaly detected ({data.anomalySeverity})
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, [chartSettings]);

  if (trendData.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )} style={{ height }}>
        <Activity className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Accuracy Data</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          No accuracy history available for the selected model and timeframe.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Accuracy Trend
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {modelName || 'All Models'} • {symbol || 'All Symbols'} • {timeframe}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
          >
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
            <option value="1y">1 Year</option>
          </select>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 rounded transition-colors",
              showSettings ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Chart Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {enableExport && (
            <button
              onClick={handleExport}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Export Data"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showMA7}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showMA7: e.target.checked }))}
                className="rounded"
              />
              <span>7-day MA</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showMA30}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showMA30: e.target.checked }))}
                className="rounded"
              />
              <span>30-day MA</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showBenchmark}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showBenchmark: e.target.checked }))}
                className="rounded"
              />
              <span>Benchmark</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.highlightAnomalies}
                onChange={(e) => setChartSettings(prev => ({ ...prev, highlightAnomalies: e.target.checked }))}
                className="rounded"
              />
              <span>Anomalies</span>
            </label>
          </div>
        </div>
      )}

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className={cn(
              "text-2xl font-bold",
              statistics.current > 80 ? "text-trading-success" :
              statistics.current > 60 ? "text-trading-warning" : "text-trading-error"
            )}>
              {statistics.current.toFixed(1)}%
            </div>
            <div className="text-xs text-trading-text-secondary">Current</div>
          </div>
          
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className={cn(
              "text-2xl font-bold flex items-center justify-center gap-1",
              statistics.change > 0 ? "text-trading-success" :
              statistics.change < 0 ? "text-trading-error" : "text-trading-text-primary"
            )}>
              {statistics.change > 0 ? <TrendingUp className="w-4 h-4" /> :
               statistics.change < 0 ? <TrendingDown className="w-4 h-4" /> :
               <Activity className="w-4 h-4" />}
              {Math.abs(statistics.change).toFixed(1)}%
            </div>
            <div className="text-xs text-trading-text-secondary">Change</div>
          </div>
          
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-trading-text-primary">
              {statistics.average.toFixed(1)}%
            </div>
            <div className="text-xs text-trading-text-secondary">Average</div>
          </div>
          
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-trading-accent-blue">
              {statistics.totalPredictions.toLocaleString()}
            </div>
            <div className="text-xs text-trading-text-secondary">Predictions</div>
          </div>
          
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className={cn(
              "text-2xl font-bold",
              statistics.anomaliesCount === 0 ? "text-trading-success" : "text-trading-warning"
            )}>
              {statistics.anomaliesCount}
            </div>
            <div className="text-xs text-trading-text-secondary">Anomalies</div>
          </div>
          
          <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 text-center">
            <div className={cn(
              "text-2xl font-bold",
              statistics.trend === 'improving' ? "text-trading-success" :
              statistics.trend === 'declining' ? "text-trading-error" : "text-trading-text-primary"
            )}>
              {statistics.trend === 'improving' ? <TrendingUp className="w-6 h-6 mx-auto" /> :
               statistics.trend === 'declining' ? <TrendingDown className="w-6 h-6 mx-auto" /> :
               <Activity className="w-6 h-6 mx-auto" />}
            </div>
            <div className="text-xs text-trading-text-secondary capitalize">{statistics.trend}</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              fontSize={12}
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={12}
              domain={['dataMin - 5', 'dataMax + 5']}
              tick={{ fill: '#94a3b8' }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <Tooltip content={CustomTooltip} />
            <Legend />
            
            {/* Benchmark line */}
            {chartSettings.showBenchmark && trendData[0]?.benchmark && (
              <ReferenceLine
                y={trendData[0].benchmark}
                stroke="#6b7280"
                strokeDasharray="5 5"
                label={{ value: "Benchmark", position: "right" }}
              />
            )}
            
            {/* Main accuracy line */}
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={(props: any) => {
                const { payload } = props;
                if (chartSettings.highlightAnomalies && payload.isAnomaly) {
                  const color = 
                    payload.anomalySeverity === 'high' ? '#ef4444' :
                    payload.anomalySeverity === 'medium' ? '#f59e0b' : '#3b82f6';
                  return <circle {...props} fill={color} stroke={color} strokeWidth={2} r={4} />;
                }
                return false;
              }}
              activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2 }}
              name="Accuracy"
            />
            
            {/* Moving averages */}
            {chartSettings.showMA7 && (
              <Line
                type="monotone"
                dataKey="ma7"
                stroke="#10b981"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="7-day MA"
              />
            )}
            
            {chartSettings.showMA30 && (
              <Line
                type="monotone"
                dataKey="ma30"
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="30-day MA"
              />
            )}
            
            {enableZoom && <Brush dataKey="date" height={30} stroke="#3b82f6" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}