'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { EnhancedMLPrediction } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import {
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  CheckCircle,
  Eye,
  Calendar,
  BarChart3,
  Download,
  RefreshCw,
  Zap,
  Brain,
  Layers,
  Globe,
  Settings,
} from 'lucide-react';

interface PredictionExplorerProps {
  modelName?: string;
  symbol?: string;
  predictionType?: 'price' | 'trend' | 'volatility' | 'volume' | 'sentiment';
  maxPredictions?: number;
  enableFiltering?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface PredictionFilter {
  status: 'all' | 'pending' | 'resolved' | 'expired';
  confidence: { min: number; max: number };
  accuracy: { min: number; max: number };
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d';
  searchTerm: string;
}

type SortField = 'timestamp' | 'confidence' | 'accuracy' | 'symbol' | 'modelName';
type SortDirection = 'asc' | 'desc';

const PREDICTION_TYPE_COLORS = {
  price: 'text-trading-accent-blue',
  trend: 'text-trading-success',
  volatility: 'text-trading-warning',
  volume: 'text-trading-info',
  sentiment: 'text-trading-accent-purple'
};

const PREDICTION_TYPE_ICONS = {
  price: <BarChart3 className="w-4 h-4" />,
  trend: <TrendingUp className="w-4 h-4" />,
  volatility: <Activity className="w-4 h-4" />,
  volume: <Layers className="w-4 h-4" />,
  sentiment: <Brain className="w-4 h-4" />
};

export function PredictionExplorer({
  modelName,
  symbol,
  predictionType,
  maxPredictions = 100,
  enableFiltering = true,
  enableExport = true,
  className,
}: PredictionExplorerProps) {
  const { getFilteredPredictions } = useMLAnalyticsStore();
  const [filters, setFilters] = useState<PredictionFilter>({
    status: 'all',
    confidence: { min: 0, max: 100 },
    accuracy: { min: 0, max: 100 },
    timeRange: '24h',
    searchTerm: '',
  });
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'timeline'>('list');

  // Process and filter predictions
  const processedPredictions = useMemo(() => {
    let predictions = getFilteredPredictions();

    // Apply basic filters
    if (modelName) {
      predictions = predictions.filter(p => p.modelName === modelName);
    }
    if (symbol) {
      predictions = predictions.filter(p => p.symbol === symbol);
    }
    if (predictionType) {
      predictions = predictions.filter(p => p.predictionType === predictionType);
    }

    // Apply advanced filters
    const now = Date.now();
    const timeRangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[filters.timeRange];

    predictions = predictions.filter(p => {
      // Time range filter
      if (now - p.timestamp > timeRangeMs) return false;

      // Status filter
      if (filters.status !== 'all') {
        const isPending = !p.isResolved && p.timestamp + (60 * 60 * 1000) > now; // 1 hour horizon
        const isExpired = !p.isResolved && p.timestamp + (60 * 60 * 1000) <= now;
        const isResolved = p.isResolved;

        if (filters.status === 'pending' && !isPending) return false;
        if (filters.status === 'resolved' && !isResolved) return false;
        if (filters.status === 'expired' && !isExpired) return false;
      }

      // Confidence filter
      const confidencePercent = p.confidence * 100;
      if (confidencePercent < filters.confidence.min || confidencePercent > filters.confidence.max) {
        return false;
      }

      // Accuracy filter (only for resolved predictions)
      if (p.isResolved && p.accuracy !== undefined) {
        const accuracyPercent = p.accuracy * 100;
        if (accuracyPercent < filters.accuracy.min || accuracyPercent > filters.accuracy.max) {
          return false;
        }
      }

      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return (
          p.symbol.toLowerCase().includes(searchLower) ||
          p.modelName.toLowerCase().includes(searchLower) ||
          p.predictionType.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    // Sort predictions
    predictions.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'timestamp':
          aVal = a.timestamp;
          bVal = b.timestamp;
          break;
        case 'confidence':
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        case 'accuracy':
          aVal = a.accuracy || 0;
          bVal = b.accuracy || 0;
          break;
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'modelName':
          aVal = a.modelName;
          bVal = b.modelName;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return predictions.slice(0, maxPredictions);
  }, [getFilteredPredictions, modelName, symbol, predictionType, filters, sortField, sortDirection, maxPredictions]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const total = processedPredictions.length;
    const resolved = processedPredictions.filter(p => p.isResolved).length;
    const pending = processedPredictions.filter(p => !p.isResolved && 
      p.timestamp + (60 * 60 * 1000) > Date.now()).length;
    const expired = processedPredictions.filter(p => !p.isResolved && 
      p.timestamp + (60 * 60 * 1000) <= Date.now()).length;

    const resolvedPredictions = processedPredictions.filter(p => p.isResolved && p.accuracy !== undefined);
    const avgAccuracy = resolvedPredictions.length > 0
      ? resolvedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) / resolvedPredictions.length
      : 0;

    const avgConfidence = total > 0
      ? processedPredictions.reduce((sum, p) => sum + p.confidence, 0) / total
      : 0;

    const highConfidencePredictions = processedPredictions.filter(p => p.confidence > 0.8).length;

    return {
      total,
      resolved,
      pending,
      expired,
      avgAccuracy: avgAccuracy * 100,
      avgConfidence: avgConfidence * 100,
      highConfidence: highConfidencePredictions,
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
    };
  }, [processedPredictions]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleExport = useCallback(() => {
    if (!enableExport) return;

    const csvContent = [
      'id,symbol,model,type,value,confidence,actual_value,accuracy,timestamp,is_resolved',
      ...processedPredictions.map(p => 
        `"${p.id}","${p.symbol}","${p.modelName}","${p.predictionType}",${p.value.toString()},${p.confidence},"${p.actualValue?.toString() || ''}",${p.accuracy || ''},${p.timestamp},${p.isResolved}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${symbol || 'all'}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [processedPredictions, symbol, enableExport]);

  const PredictionCard = ({ prediction }: { prediction: EnhancedMLPrediction }) => {
    const isSelected = selectedPrediction === prediction.id;
    const isPending = !prediction.isResolved && prediction.timestamp + (60 * 60 * 1000) > Date.now();
    const isExpired = !prediction.isResolved && prediction.timestamp + (60 * 60 * 1000) <= Date.now();

    return (
      <div
        onClick={() => setSelectedPrediction(isSelected ? null : prediction.id)}
        className={cn(
          "p-4 border rounded-lg cursor-pointer transition-all",
          isSelected 
            ? "border-trading-accent-blue bg-trading-accent-blue/5" 
            : "border-trading-neutral-700 bg-trading-bg-secondary hover:border-trading-neutral-600"
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={PREDICTION_TYPE_COLORS[prediction.predictionType]}>
              {PREDICTION_TYPE_ICONS[prediction.predictionType]}
            </div>
            <div>
              <div className="font-medium text-trading-text-primary">
                {prediction.symbol}
              </div>
              <div className="text-xs text-trading-text-secondary">
                {prediction.modelName}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isPending && <Clock className="w-4 h-4 text-trading-warning" />}
            {prediction.isResolved && <CheckCircle className="w-4 h-4 text-trading-success" />}
            {isExpired && <AlertCircle className="w-4 h-4 text-trading-error" />}
            
            <div className={cn(
              "text-xs font-medium px-2 py-1 rounded",
              prediction.confidence > 0.8 ? "bg-trading-success/20 text-trading-success" :
              prediction.confidence > 0.6 ? "bg-trading-warning/20 text-trading-warning" :
              "bg-trading-error/20 text-trading-error"
            )}>
              {(prediction.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-trading-text-secondary">Predicted:</span>
            <div className="font-medium text-trading-text-primary">
              ${prediction.value.toFixed(2)}
            </div>
          </div>
          
          {prediction.actualValue && (
            <div>
              <span className="text-trading-text-secondary">Actual:</span>
              <div className={cn(
                "font-medium",
                prediction.accuracy && prediction.accuracy > 0.8 ? "text-trading-success" : "text-trading-error"
              )}>
                ${prediction.actualValue.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {prediction.accuracy !== undefined && (
          <div className="mt-3 pt-3 border-t border-trading-neutral-700">
            <div className="flex justify-between items-center text-sm">
              <span className="text-trading-text-secondary">Accuracy:</span>
              <span className={cn(
                "font-medium",
                prediction.accuracy > 0.8 ? "text-trading-success" :
                prediction.accuracy > 0.5 ? "text-trading-warning" : "text-trading-error"
              )}>
                {(prediction.accuracy * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        <div className="mt-2 text-xs text-trading-text-secondary">
          {formatDistanceToNow(new Date(prediction.timestamp), { addSuffix: true })}
        </div>

        {isSelected && (
          <div className="mt-4 pt-4 border-t border-trading-neutral-700 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-trading-text-secondary">Type:</span>
                <div className="text-trading-text-primary capitalize">{prediction.predictionType}</div>
              </div>
              
              <div>
                <span className="text-trading-text-secondary">Horizon:</span>
                <div className="text-trading-text-primary">1 hour</div>
              </div>
            </div>

            {prediction.confidenceIntervals && (
              <div>
                <span className="text-trading-text-secondary">Confidence Intervals:</span>
                <div className="text-xs space-y-1 mt-1">
                  <div className="flex justify-between">
                    <span>95%:</span>
                    <span>${prediction.confidenceIntervals.level95.lower.toFixed(2)} - ${prediction.confidenceIntervals.level95.upper.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>80%:</span>
                    <span>${prediction.confidenceIntervals.level80.lower.toFixed(2)} - ${prediction.confidenceIntervals.level80.upper.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-trading-text-primary transition-colors"
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
      ) : (
        <div className="w-3 h-3 opacity-50" />
      )}
    </button>
  );

  if (processedPredictions.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )}>
        <Target className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Predictions Found</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          No predictions match the current filters and criteria.
          <br />
          Try adjusting the filters or time range.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Prediction Explorer
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {modelName || 'All Models'} • {symbol || 'All Symbols'} • {statistics.total} predictions
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-trading-bg-secondary border border-trading-neutral-700 rounded p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "px-3 py-1 rounded text-sm transition-colors",
                viewMode === 'list' ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary"
              )}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "px-3 py-1 rounded text-sm transition-colors",
                viewMode === 'grid' ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary"
              )}
            >
              Grid
            </button>
          </div>
          
          {enableFiltering && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded transition-colors",
                showFilters ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
              )}
              title="Filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
          
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-text-primary">{statistics.total}</div>
          <div className="text-xs text-trading-text-secondary">Total</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-warning">{statistics.pending}</div>
          <div className="text-xs text-trading-text-secondary">Pending</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-success">{statistics.resolved}</div>
          <div className="text-xs text-trading-text-secondary">Resolved</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-accent-blue">{statistics.avgAccuracy.toFixed(1)}%</div>
          <div className="text-xs text-trading-text-secondary">Avg Accuracy</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-text-primary">{statistics.avgConfidence.toFixed(1)}%</div>
          <div className="text-xs text-trading-text-secondary">Avg Confidence</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-info">{statistics.resolutionRate.toFixed(1)}%</div>
          <div className="text-xs text-trading-text-secondary">Resolution Rate</div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && enableFiltering && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-trading-text-secondary" />
                  <input
                    type="text"
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    placeholder="Search predictions..."
                    className="w-full pl-10 pr-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
                  />
                </div>
              </div>
              
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              
              {/* Time Range */}
              <div>
                <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                  Time Range
                </label>
                <select
                  value={filters.timeRange}
                  onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
                >
                  <option value="1h">Last Hour</option>
                  <option value="6h">Last 6 Hours</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Confidence Range */}
              <div>
                <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                  Confidence Range ({filters.confidence.min}% - {filters.confidence.max}%)
                </label>
                <div className="flex gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.confidence.min}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      confidence: { ...prev.confidence, min: Number(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.confidence.max}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      confidence: { ...prev.confidence, max: Number(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                </div>
              </div>
              
              {/* Accuracy Range */}
              <div>
                <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                  Accuracy Range ({filters.accuracy.min}% - {filters.accuracy.max}%)
                </label>
                <div className="flex gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.accuracy.min}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      accuracy: { ...prev.accuracy, min: Number(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.accuracy.max}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      accuracy: { ...prev.accuracy, max: Number(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-trading-text-secondary">Sort by:</span>
        <SortButton field="timestamp">Time</SortButton>
        <SortButton field="confidence">Confidence</SortButton>
        <SortButton field="accuracy">Accuracy</SortButton>
        <SortButton field="symbol">Symbol</SortButton>
        <SortButton field="modelName">Model</SortButton>
      </div>

      {/* Predictions Grid/List */}
      <div className={cn(
        viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          : "space-y-4"
      )}>
        {processedPredictions.map((prediction) => (
          <PredictionCard key={prediction.id} prediction={prediction} />
        ))}
      </div>
    </div>
  );
}