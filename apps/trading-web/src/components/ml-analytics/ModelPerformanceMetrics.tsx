'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ModelMetrics } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  Target, 
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Filter,
  RefreshCw,
  Download
} from 'lucide-react';

interface ModelPerformanceMetricsProps {
  modelName?: string;
  symbol?: string;
  timeframe?: string;
  showComparison?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface MetricCardProps {
  title: string;
  value: number;
  format: 'percentage' | 'decimal' | 'currency' | 'number';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  icon: React.ReactNode;
  color: 'success' | 'error' | 'warning' | 'info' | 'neutral';
  description?: string;
  benchmark?: number;
}

interface TrendData {
  timestamp: number;
  date: string;
  accuracy: number;
  roi: number;
  sharpeRatio: number;
  predictions: number;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  format,
  trend,
  trendValue,
  icon,
  color,
  description,
  benchmark,
}) => {
  const formatValue = (val: number) => {
    switch (format) {
      case 'percentage':
        return `${(val * 100).toFixed(1)}%`;
      case 'currency':
        return `$${val.toFixed(2)}`;
      case 'decimal':
        return val.toFixed(2);
      case 'number':
        return val.toLocaleString();
      default:
        return val.toString();
    }
  };

  const getColorClasses = () => {
    switch (color) {
      case 'success':
        return 'text-trading-success border-trading-success/20 bg-trading-success/5';
      case 'error':
        return 'text-trading-error border-trading-error/20 bg-trading-error/5';
      case 'warning':
        return 'text-trading-warning border-trading-warning/20 bg-trading-warning/5';
      case 'info':
        return 'text-trading-accent-blue border-trading-accent-blue/20 bg-trading-accent-blue/5';
      default:
        return 'text-trading-text-primary border-trading-neutral-700 bg-trading-bg-secondary';
    }
  };

  return (
    <div className={cn(
      'p-4 border rounded-lg',
      getColorClasses()
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        
        {trend && trendValue !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-xs",
            trend === 'up' ? 'text-trading-success' :
            trend === 'down' ? 'text-trading-error' : 'text-trading-text-secondary'
          )}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
             trend === 'down' ? <TrendingDown className="w-3 h-3" /> :
             <Activity className="w-3 h-3" />}
            <span>{formatValue(Math.abs(trendValue))}</span>
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        <div className="text-2xl font-bold">
          {formatValue(value)}
        </div>
        
        {benchmark !== undefined && (
          <div className="text-xs text-trading-text-secondary">
            Benchmark: {formatValue(benchmark)}
          </div>
        )}
        
        {description && (
          <div className="text-xs text-trading-text-secondary">
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

export function ModelPerformanceMetrics({
  modelName,
  symbol,
  timeframe = '1h',
  showComparison = false,
  enableExport = true,
  className,
}: ModelPerformanceMetricsProps) {
  const { modelMetrics, getFilteredPredictions } = useMLAnalyticsStore();
  const [selectedMetric, setSelectedMetric] = useState<keyof ModelMetrics>('accuracy');
  const [timeRange, setTimeRange] = useState<'1d' | '7d' | '30d' | '90d'>('7d');

  // Get current metrics
  const currentMetrics = useMemo(() => {
    const metricsArray = Array.from(modelMetrics.values());
    let filtered = metricsArray.filter(metrics => {
      if (modelName && metrics.modelName !== modelName) return false;
      if (symbol && metrics.symbol !== symbol) return false;
      if (metrics.timeframe !== timeframe) return false;
      return true;
    });

    // If we have multiple metrics, get the most recent one
    if (filtered.length > 1) {
      filtered = filtered.sort((a, b) => b.calculatedAt - a.calculatedAt);
    }

    return filtered[0] || null;
  }, [modelMetrics, modelName, symbol, timeframe]);

  // Generate trend data (mock data for demonstration)
  const trendData = useMemo(() => {
    if (!currentMetrics) return [];

    const now = Date.now();
    const days = timeRange === '1d' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const points = Math.min(days * 4, 30); // Up to 30 data points
    
    const data: TrendData[] = [];
    for (let i = points - 1; i >= 0; i--) {
      const timestamp = now - (i * (days * 24 * 60 * 60 * 1000) / points);
      
      // Generate realistic trending data
      const baseAccuracy = currentMetrics.accuracy;
      const variation = 0.1 * Math.sin(i * 0.3) + 0.05 * (Math.random() - 0.5);
      const accuracy = Math.max(0, Math.min(1, baseAccuracy + variation));
      
      const baseROI = currentMetrics.roi;
      const roiVariation = baseROI * 0.2 * Math.sin(i * 0.2) + baseROI * 0.1 * (Math.random() - 0.5);
      const roi = baseROI + roiVariation;
      
      data.push({
        timestamp,
        date: format(new Date(timestamp), 'MMM dd'),
        accuracy: accuracy * 100,
        roi,
        sharpeRatio: currentMetrics.sharpeRatio + Math.sin(i * 0.15) * 0.2,
        predictions: Math.floor(currentMetrics.totalPredictions / points) + Math.floor(Math.random() * 10),
      });
    }
    
    return data;
  }, [currentMetrics, timeRange]);

  // Calculate performance distribution
  const performanceDistribution = useMemo(() => {
    const predictions = getFilteredPredictions();
    const modelPredictions = predictions.filter(p => 
      (!modelName || p.modelName === modelName) &&
      (!symbol || p.symbol === symbol) &&
      p.isResolved
    );

    const total = modelPredictions.length;
    if (total === 0) return [];

    const excellent = modelPredictions.filter(p => (p.accuracy || 0) >= 0.9).length;
    const good = modelPredictions.filter(p => (p.accuracy || 0) >= 0.7 && (p.accuracy || 0) < 0.9).length;
    const fair = modelPredictions.filter(p => (p.accuracy || 0) >= 0.5 && (p.accuracy || 0) < 0.7).length;
    const poor = modelPredictions.filter(p => (p.accuracy || 0) < 0.5).length;

    return [
      { name: 'Excellent (90%+)', value: excellent, percentage: (excellent / total) * 100, color: '#10b981' },
      { name: 'Good (70-90%)', value: good, percentage: (good / total) * 100, color: '#3b82f6' },
      { name: 'Fair (50-70%)', value: fair, percentage: (fair / total) * 100, color: '#f59e0b' },
      { name: 'Poor (<50%)', value: poor, percentage: (poor / total) * 100, color: '#ef4444' },
    ];
  }, [getFilteredPredictions, modelName, symbol]);

  const handleExport = useCallback(() => {
    if (!enableExport || !currentMetrics) return;
    
    const exportData = {
      metrics: currentMetrics,
      trendData,
      performanceDistribution,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-performance-${modelName || 'all'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentMetrics, trendData, performanceDistribution, modelName, enableExport]);

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 shadow-lg">
        <div className="text-sm font-medium text-trading-text-primary mb-2">
          {label}
        </div>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center text-xs">
              <span style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-medium">
                {entry.dataKey === 'accuracy' ? `${entry.value.toFixed(1)}%` :
                 entry.dataKey === 'roi' ? `${entry.value.toFixed(2)}%` :
                 entry.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }, []);

  if (!currentMetrics) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )}>
        <BarChart3 className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Performance Data</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          No performance metrics available for the selected model and filters.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-trading-text-primary">Model Performance</h2>
          <p className="text-sm text-trading-text-secondary">
            {modelName || 'All Models'} • {symbol || 'All Symbols'} • {timeframe}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
          >
            <option value="1d">1 Day</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
          
          {enableExport && (
            <button
              onClick={handleExport}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Export Metrics"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Accuracy"
          value={currentMetrics.accuracy}
          format="percentage"
          trend={currentMetrics.performanceTrend === 'improving' ? 'up' : 
                 currentMetrics.performanceTrend === 'declining' ? 'down' : 'stable'}
          trendValue={0.05} // Mock trend value
          icon={<Target className="w-4 h-4" />}
          color={currentMetrics.accuracy > 0.8 ? 'success' : 
                 currentMetrics.accuracy > 0.6 ? 'warning' : 'error'}
          description="Prediction accuracy rate"
          benchmark={0.75}
        />
        
        <MetricCard
          title="ROI"
          value={currentMetrics.roi}
          format="percentage"
          trend="up"
          trendValue={0.12}
          icon={<DollarSign className="w-4 h-4" />}
          color={currentMetrics.roi > 0 ? 'success' : 'error'}
          description="Return on investment"
          benchmark={0.15}
        />
        
        <MetricCard
          title="Sharpe Ratio"
          value={currentMetrics.sharpeRatio}
          format="decimal"
          trend="stable"
          icon={<Activity className="w-4 h-4" />}
          color={currentMetrics.sharpeRatio > 1 ? 'success' : 
                 currentMetrics.sharpeRatio > 0.5 ? 'warning' : 'error'}
          description="Risk-adjusted return"
          benchmark={1.0}
        />
        
        <MetricCard
          title="Total Predictions"
          value={currentMetrics.totalPredictions}
          format="number"
          icon={<Zap className="w-4 h-4" />}
          color="info"
          description="Total predictions made"
        />
      </div>

      {/* Secondary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Precision"
          value={currentMetrics.precision}
          format="percentage"
          icon={<CheckCircle className="w-4 h-4" />}
          color={currentMetrics.precision > 0.8 ? 'success' : 'warning'}
          description="True positive rate"
        />
        
        <MetricCard
          title="Win Rate"
          value={currentMetrics.winRate}
          format="percentage"
          icon={<TrendingUp className="w-4 h-4" />}
          color={currentMetrics.winRate > 0.6 ? 'success' : 'warning'}
          description="Profitable predictions"
        />
        
        <MetricCard
          title="Max Drawdown"
          value={currentMetrics.maxDrawdown}
          format="percentage"
          icon={<AlertCircle className="w-4 h-4" />}
          color={currentMetrics.maxDrawdown < 0.1 ? 'success' : 'error'}
          description="Maximum loss period"
        />
        
        <MetricCard
          title="Avg Confidence"
          value={currentMetrics.averageConfidence}
          format="percentage"
          icon={<Clock className="w-4 h-4" />}
          color="info"
          description="Average prediction confidence"
        />
      </div>

      {/* Performance Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-trading-text-primary">Performance Trend</h3>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as keyof ModelMetrics)}
              className="px-3 py-1 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
            >
              <option value="accuracy">Accuracy</option>
              <option value="roi">ROI</option>
              <option value="sharpeRatio">Sharpe Ratio</option>
            </select>
          </div>
          
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip content={CustomTooltip} />
              <Area
                type="monotone"
                dataKey={selectedMetric}
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Distribution */}
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-trading-text-primary mb-4">Accuracy Distribution</h3>
          
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={performanceDistribution}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {performanceDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value} predictions`,
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="mt-4 space-y-2">
            {performanceDistribution.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-trading-text-secondary">{item.name}</span>
                </div>
                <span className="text-trading-text-primary font-medium">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}