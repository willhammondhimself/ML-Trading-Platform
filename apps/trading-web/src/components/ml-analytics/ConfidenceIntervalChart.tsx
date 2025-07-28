'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { EnhancedMLPrediction } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import { BarChart3, TrendingUp, AlertTriangle, Info, Download, Settings } from 'lucide-react';

interface ConfidenceIntervalChartProps {
  symbol?: string;
  modelName?: string;
  height?: number;
  showActualValues?: boolean;
  enableZoom?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface ChartDataPoint {
  timestamp: number;
  time: string;
  predicted: number;
  actual?: number;
  confidence: number;
  
  // Confidence intervals
  ci95_lower: number;
  ci95_upper: number;
  ci80_lower: number;
  ci80_upper: number;
  ci50_lower: number;
  ci50_upper: number;
  
  // Metadata for tooltips
  modelName: string;
  accuracy?: number;
  isResolved: boolean;
}

interface ChartSettings {
  showCI95: boolean;
  showCI80: boolean;
  showCI50: boolean;
  showActualLine: boolean;
  showPredictionLine: boolean;
  smoothing: boolean;
}

export function ConfidenceIntervalChart({
  symbol,
  modelName,
  height = 400,
  showActualValues = true,
  enableZoom = true,
  enableExport = true,
  className,
}: ConfidenceIntervalChartProps) {
  const { getFilteredPredictions } = useMLAnalyticsStore();
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    showCI95: true,
    showCI80: true,
    showCI50: false,
    showActualLine: true,
    showPredictionLine: true,
    smoothing: false,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Process predictions into chart data
  const chartData = useMemo(() => {
    const predictions = getFilteredPredictions();
    
    const filtered = predictions.filter((prediction) => {
      if (symbol && prediction.symbol !== symbol) return false;
      if (modelName && prediction.modelName !== modelName) return false;
      return prediction.predictionType === 'price'; // Only price predictions for confidence intervals
    });

    const dataPoints: ChartDataPoint[] = filtered.map((prediction) => {
      const baseValue = prediction.value.toNumber();
      const confidence = prediction.confidence;
      
      // Calculate confidence intervals based on prediction confidence and historical volatility
      const volatilityFactor = 0.02; // 2% base volatility
      const adjustedVolatility = volatilityFactor * (1 - confidence + 0.1); // Lower confidence = higher volatility
      
      return {
        timestamp: prediction.timestamp,
        time: format(new Date(prediction.timestamp), 'MMM dd HH:mm'),
        predicted: baseValue,
        actual: prediction.actualValue?.toNumber(),
        confidence: confidence * 100,
        
        // Confidence intervals (wider bands for lower confidence)
        ci95_lower: baseValue * (1 - adjustedVolatility * 1.96),
        ci95_upper: baseValue * (1 + adjustedVolatility * 1.96),
        ci80_lower: baseValue * (1 - adjustedVolatility * 1.28),
        ci80_upper: baseValue * (1 + adjustedVolatility * 1.28),
        ci50_lower: baseValue * (1 - adjustedVolatility * 0.67),
        ci50_upper: baseValue * (1 + adjustedVolatility * 0.67),
        
        modelName: prediction.modelName,
        accuracy: prediction.accuracy,
        isResolved: prediction.isResolved,
      };
    });

    return dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }, [getFilteredPredictions, symbol, modelName]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (chartData.length === 0) return null;

    const resolvedPredictions = chartData.filter(d => d.isResolved && d.actual !== undefined);
    const totalPredictions = chartData.length;
    const averageConfidence = chartData.reduce((sum, d) => sum + d.confidence, 0) / totalPredictions;
    
    let accuracy = 0;
    let withinCI95 = 0;
    let withinCI80 = 0;
    let withinCI50 = 0;

    if (resolvedPredictions.length > 0) {
      accuracy = resolvedPredictions.reduce((sum, d) => sum + (d.accuracy || 0), 0) / resolvedPredictions.length;
      
      // Calculate how often actual values fall within confidence intervals
      resolvedPredictions.forEach(d => {
        if (d.actual! >= d.ci95_lower && d.actual! <= d.ci95_upper) withinCI95++;
        if (d.actual! >= d.ci80_lower && d.actual! <= d.ci80_upper) withinCI80++;
        if (d.actual! >= d.ci50_lower && d.actual! <= d.ci50_upper) withinCI50++;
      });
      
      withinCI95 = (withinCI95 / resolvedPredictions.length) * 100;
      withinCI80 = (withinCI80 / resolvedPredictions.length) * 100;
      withinCI50 = (withinCI50 / resolvedPredictions.length) * 100;
    }

    return {
      totalPredictions,
      resolvedPredictions: resolvedPredictions.length,
      averageConfidence,
      accuracy: accuracy * 100,
      withinCI95,
      withinCI80,
      withinCI50,
    };
  }, [chartData]);

  // Custom tooltip
  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload as ChartDataPoint;
    
    return (
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 shadow-lg">
        <div className="text-sm font-medium text-trading-text-primary mb-2">
          {label}
        </div>
        
        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-trading-text-secondary">Predicted:</span>
            <span className="text-trading-accent-blue font-medium">
              ${data.predicted.toFixed(2)}
            </span>
          </div>
          
          {data.actual !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-trading-text-secondary">Actual:</span>
              <span className={cn(
                "font-medium",
                data.accuracy && data.accuracy > 0.8 ? "text-trading-success" : "text-trading-error"
              )}>
                ${data.actual.toFixed(2)}
              </span>
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <span className="text-trading-text-secondary">Confidence:</span>
            <span className="text-trading-text-primary">{data.confidence.toFixed(1)}%</span>
          </div>
          
          {data.accuracy !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-trading-text-secondary">Accuracy:</span>
              <span className={cn(
                "font-medium",
                data.accuracy > 0.8 ? "text-trading-success" : 
                data.accuracy > 0.5 ? "text-trading-warning" : "text-trading-error"
              )}>
                {(data.accuracy * 100).toFixed(1)}%
              </span>
            </div>
          )}
          
          <div className="pt-2 border-t border-trading-neutral-700">
            <div className="text-trading-text-secondary">Model: {data.modelName}</div>
            <div className="text-trading-text-secondary">
              Status: {data.isResolved ? 'Resolved' : 'Pending'}
            </div>
          </div>
        </div>
      </div>
    );
  }, []);

  const handleExport = useCallback(() => {
    if (!enableExport) return;
    
    // Export chart data as CSV
    const csvContent = [
      'timestamp,predicted,actual,confidence,ci95_lower,ci95_upper,ci80_lower,ci80_upper,model',
      ...chartData.map(d => 
        `${d.timestamp},${d.predicted},${d.actual || ''},${d.confidence},${d.ci95_lower},${d.ci95_upper},${d.ci80_lower},${d.ci80_upper},${d.modelName}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `confidence-intervals-${symbol || 'all'}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [chartData, symbol, enableExport]);

  if (chartData.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )} style={{ height }}>
        <BarChart3 className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Prediction Data</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          No price predictions available for the selected filters.
          <br />
          Try adjusting the time range or model selection.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-trading-neutral-700">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Prediction Confidence Intervals
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {symbol ? `${symbol} • ` : ''}{modelName || 'All Models'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {enableExport && (
            <button
              onClick={handleExport}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Export Data"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 transition-colors",
              showSettings 
                ? "text-trading-accent-blue" 
                : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Chart Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-trading-bg-primary border-b border-trading-neutral-700">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showCI95}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showCI95: e.target.checked }))}
                className="rounded border-trading-neutral-700"
              />
              <span>95% Confidence</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showCI80}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showCI80: e.target.checked }))}
                className="rounded border-trading-neutral-700"
              />
              <span>80% Confidence</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showCI50}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showCI50: e.target.checked }))}
                className="rounded border-trading-neutral-700"
              />
              <span>50% Confidence</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showActualLine}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showActualLine: e.target.checked }))}
                className="rounded border-trading-neutral-700"
              />
              <span>Actual Values</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chartSettings.showPredictionLine}
                onChange={(e) => setChartSettings(prev => ({ ...prev, showPredictionLine: e.target.checked }))}
                className="rounded border-trading-neutral-700"
              />
              <span>Predictions</span>
            </label>
          </div>
        </div>
      )}

      {/* Statistics */}
      {statistics && (
        <div className="p-4 border-b border-trading-neutral-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-trading-text-primary">
                {statistics.totalPredictions}
              </div>
              <div className="text-xs text-trading-text-secondary">Total Predictions</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-trading-accent-blue">
                {statistics.averageConfidence.toFixed(1)}%
              </div>
              <div className="text-xs text-trading-text-secondary">Avg Confidence</div>
            </div>
            
            <div className="text-center">
              <div className={cn(
                "text-2xl font-bold",
                statistics.accuracy > 80 ? "text-trading-success" :
                statistics.accuracy > 60 ? "text-trading-warning" : "text-trading-error"
              )}>
                {statistics.accuracy.toFixed(1)}%
              </div>
              <div className="text-xs text-trading-text-secondary">Accuracy</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-trading-text-primary">
                {statistics.withinCI95.toFixed(0)}%
              </div>
              <div className="text-xs text-trading-text-secondary">Within 95% CI</div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="p-4" style={{ height: height - 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="time" 
              stroke="#94a3b8"
              fontSize={12}
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis 
              stroke="#94a3b8"
              fontSize={12}
              tick={{ fill: '#94a3b8' }}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip content={CustomTooltip} />
            
            {/* Confidence Intervals */}
            {chartSettings.showCI95 && (
              <Area
                type="monotone"
                dataKey="ci95_upper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.1}
                stackId="1"
              />
            )}
            
            {chartSettings.showCI95 && (
              <Area
                type="monotone"
                dataKey="ci95_lower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                stackId="1"
              />
            )}
            
            {chartSettings.showCI80 && (
              <Area
                type="monotone"
                dataKey="ci80_upper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.2}
                stackId="2"
              />
            )}
            
            {chartSettings.showCI80 && (
              <Area
                type="monotone"
                dataKey="ci80_lower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                stackId="2"
              />
            )}
            
            {chartSettings.showCI50 && (
              <Area
                type="monotone"
                dataKey="ci50_upper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.3}
                stackId="3"
              />
            )}
            
            {chartSettings.showCI50 && (
              <Area
                type="monotone"
                dataKey="ci50_lower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                stackId="3"
              />
            )}
            
            {/* Prediction Line */}
            {chartSettings.showPredictionLine && (
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                name="Prediction"
              />
            )}
            
            {/* Actual Values Line */}
            {chartSettings.showActualLine && showActualValues && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                connectNulls={false}
                name="Actual"
              />
            )}
            
            {enableZoom && <Brush dataKey="time" height={30} stroke="#3b82f6" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}