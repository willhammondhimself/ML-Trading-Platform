'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ModelMetrics } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  Star,
  Award,
  AlertTriangle,
  Play,
  Pause,
  Settings,
  Download,
  RefreshCw,
  Eye,
  Trash2,
  Filter,
  Search
} from 'lucide-react';

interface ModelComparisonTableProps {
  selectedModels?: string[];
  symbol?: string;
  timeframe?: string;
  maxModels?: number;
  enableActions?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface ModelComparisonRow {
  modelName: string;
  accuracy: number;
  roi: number;
  sharpeRatio: number;
  totalPredictions: number;
  winRate: number;
  precision: number;
  maxDrawdown: number;
  averageLatency: number;
  lastUpdated: number;
  performanceTrend: 'improving' | 'stable' | 'declining';
  status: 'active' | 'paused' | 'error' | 'training';
  tier: 'A' | 'B' | 'C' | 'D';
  isOnline: boolean;
  confidence: number;
  riskScore: number;
}

type SortField = keyof ModelComparisonRow;
type SortDirection = 'asc' | 'desc';

const TIER_COLORS = {
  A: 'text-trading-success',
  B: 'text-trading-accent-blue', 
  C: 'text-trading-warning',
  D: 'text-trading-error'
};

const TIER_BACKGROUNDS = {
  A: 'bg-trading-success/10 border-trading-success/20',
  B: 'bg-trading-accent-blue/10 border-trading-accent-blue/20',
  C: 'bg-trading-warning/10 border-trading-warning/20', 
  D: 'bg-trading-error/10 border-trading-error/20'
};

const STATUS_CONFIG = {
  active: { icon: CheckCircle, color: 'text-trading-success', label: 'Active' },
  paused: { icon: Pause, color: 'text-trading-warning', label: 'Paused' },
  error: { icon: XCircle, color: 'text-trading-error', label: 'Error' },
  training: { icon: Clock, color: 'text-trading-accent-blue', label: 'Training' }
};

export function ModelComparisonTable({
  selectedModels,
  symbol,
  timeframe = '1h',
  maxModels = 20,
  enableActions = true,
  enableExport = true,
  className,
}: ModelComparisonTableProps) {
  const { modelMetrics, calculateModelAccuracy } = useMLAnalyticsStore();
  const [sortField, setSortField] = useState<SortField>('accuracy');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'error'>('all');
  const [filterTier, setFilterTier] = useState<'all' | 'A' | 'B' | 'C' | 'D'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Process model metrics into comparison rows
  const comparisonData = useMemo(() => {
    const metricsArray = Array.from(modelMetrics.values());
    const processedModels = new Map<string, ModelComparisonRow>();

    metricsArray.forEach(metrics => {
      if (symbol && metrics.symbol !== symbol) return;
      if (metrics.timeframe !== timeframe) return;
      if (selectedModels && !selectedModels.includes(metrics.modelName)) return;

      const existing = processedModels.get(metrics.modelName);
      if (!existing || metrics.calculatedAt > existing.lastUpdated) {
        // Calculate performance tier based on multiple metrics
        const accuracyScore = metrics.accuracy * 40;
        const roiScore = Math.max(0, Math.min(40, metrics.roi * 200)); // Cap at 20% ROI = 40 points
        const sharpeScore = Math.max(0, Math.min(20, metrics.sharpeRatio * 10)); // Cap at 2.0 Sharpe = 20 points
        const totalScore = accuracyScore + roiScore + sharpeScore;
        
        let tier: 'A' | 'B' | 'C' | 'D';
        if (totalScore >= 80) tier = 'A';
        else if (totalScore >= 65) tier = 'B';
        else if (totalScore >= 50) tier = 'C';
        else tier = 'D';

        // Calculate risk score (higher = riskier)
        const riskScore = (
          (1 - metrics.accuracy) * 30 +
          Math.abs(metrics.maxDrawdown) * 50 +
          (metrics.sharpeRatio < 0 ? 20 : Math.max(0, 20 - metrics.sharpeRatio * 10))
        );

        // Mock additional data (in real implementation, these would come from the backend)
        const mockLatency = Math.random() * 50 + 10; // 10-60ms
        const mockStatus = Math.random() > 0.1 ? 'active' : Math.random() > 0.5 ? 'paused' : 'error';
        
        processedModels.set(metrics.modelName, {
          modelName: metrics.modelName,
          accuracy: metrics.accuracy,
          roi: metrics.roi,
          sharpeRatio: metrics.sharpeRatio,
          totalPredictions: metrics.totalPredictions,
          winRate: metrics.winRate,
          precision: metrics.precision,
          maxDrawdown: metrics.maxDrawdown,
          averageLatency: mockLatency,
          lastUpdated: metrics.calculatedAt,
          performanceTrend: metrics.performanceTrend,
          status: mockStatus as any,
          tier,
          isOnline: mockStatus === 'active',
          confidence: metrics.averageConfidence,
          riskScore,
        });
      }
    });

    let filtered = Array.from(processedModels.values());

    // Apply filters
    if (filterStatus !== 'all') {
      filtered = filtered.filter(model => model.status === filterStatus);
    }
    
    if (filterTier !== 'all') {
      filtered = filtered.filter(model => model.tier === filterTier);
    }

    if (searchTerm) {
      filtered = filtered.filter(model => 
        model.modelName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort data
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
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

    return filtered.slice(0, maxModels);
  }, [modelMetrics, sortField, sortDirection, filterStatus, filterTier, searchTerm, selectedModels, symbol, timeframe, maxModels]);

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
      'model_name,accuracy,roi,sharpe_ratio,total_predictions,win_rate,precision,max_drawdown,latency,status,tier,last_updated',
      ...comparisonData.map(model => 
        `"${model.modelName}",${model.accuracy},${model.roi},${model.sharpeRatio},${model.totalPredictions},${model.winRate},${model.precision},${model.maxDrawdown},${model.averageLatency},"${model.status}","${model.tier}",${model.lastUpdated}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-comparison-${symbol || 'all'}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [comparisonData, symbol, enableExport]);

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-trading-text-primary transition-colors"
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );

  const StatusBadge = ({ status, isOnline }: { status: ModelComparisonRow['status']; isOnline: boolean }) => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Icon className={cn("w-4 h-4", config.color)} />
          <span className="text-xs">{config.label}</span>
        </div>
        <div className={cn(
          "w-2 h-2 rounded-full",
          isOnline ? "bg-trading-success" : "bg-trading-neutral-600"
        )} />
      </div>
    );
  };

  const TierBadge = ({ tier }: { tier: ModelComparisonRow['tier'] }) => (
    <div className={cn(
      "px-2 py-1 rounded text-xs font-bold border",
      TIER_BACKGROUNDS[tier],
      TIER_COLORS[tier]
    )}>
      {tier}
    </div>
  );

  const TrendIndicator = ({ trend }: { trend: ModelComparisonRow['performanceTrend'] }) => {
    if (trend === 'improving') return <ArrowUp className="w-4 h-4 text-trading-success" />;
    if (trend === 'declining') return <ArrowDown className="w-4 h-4 text-trading-error" />;
    return <div className="w-4 h-4 bg-trading-neutral-600 rounded-full" />;
  };

  if (comparisonData.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )}>
        <Award className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Models to Compare</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          No model data available for the selected filters and timeframe.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Model Comparison
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {symbol || 'All Symbols'} • {timeframe} • {comparisonData.length} models
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
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

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Search Models
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-trading-text-secondary" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search models..."
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
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="error">Error</option>
              </select>
            </div>
            
            {/* Tier Filter */}
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Performance Tier
              </label>
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as any)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="all">All Tiers</option>
                <option value="A">Tier A (Excellent)</option>
                <option value="B">Tier B (Good)</option>
                <option value="C">Tier C (Fair)</option>
                <option value="D">Tier D (Poor)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-trading-bg-primary border-b border-trading-neutral-700">
              <tr>
                <th className="text-left p-4 text-trading-text-secondary font-medium">
                  <SortButton field="modelName">Model</SortButton>
                </th>
                <th className="text-center p-4 text-trading-text-secondary font-medium">
                  Status
                </th>
                <th className="text-center p-4 text-trading-text-secondary font-medium">
                  <SortButton field="tier">Tier</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="accuracy">Accuracy</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="roi">ROI</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="sharpeRatio">Sharpe</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="winRate">Win Rate</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="totalPredictions">Predictions</SortButton>
                </th>
                <th className="text-right p-4 text-trading-text-secondary font-medium">
                  <SortButton field="averageLatency">Latency</SortButton>
                </th>
                <th className="text-center p-4 text-trading-text-secondary font-medium">
                  Trend
                </th>
                {enableActions && (
                  <th className="text-center p-4 text-trading-text-secondary font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((model, index) => (
                <tr 
                  key={model.modelName}
                  className={cn(
                    "border-b border-trading-neutral-700 hover:bg-trading-bg-primary/50 transition-colors",
                    index === 0 && "border-t-2 border-trading-success" // Highlight best model
                  )}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {index === 0 && <Star className="w-4 h-4 text-trading-warning" />}
                      <span className="font-medium text-trading-text-primary">
                        {model.modelName}
                      </span>
                    </div>
                  </td>
                  
                  <td className="p-4 text-center">
                    <StatusBadge status={model.status} isOnline={model.isOnline} />
                  </td>
                  
                  <td className="p-4 text-center">
                    <TierBadge tier={model.tier} />
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className={cn(
                      "font-medium",
                      model.accuracy > 0.8 ? "text-trading-success" :
                      model.accuracy > 0.6 ? "text-trading-warning" : "text-trading-error"
                    )}>
                      {(model.accuracy * 100).toFixed(1)}%
                    </span>
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className={cn(
                      "font-medium",
                      model.roi > 0 ? "text-trading-success" : "text-trading-error"
                    )}>
                      {(model.roi * 100).toFixed(1)}%
                    </span>
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className={cn(
                      "font-medium",
                      model.sharpeRatio > 1 ? "text-trading-success" :
                      model.sharpeRatio > 0.5 ? "text-trading-warning" : "text-trading-error"
                    )}>
                      {model.sharpeRatio.toFixed(2)}
                    </span>
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className="text-trading-text-primary">
                      {(model.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className="text-trading-text-primary">
                      {model.totalPredictions.toLocaleString()}
                    </span>
                  </td>
                  
                  <td className="p-4 text-right">
                    <span className={cn(
                      "text-sm",
                      model.averageLatency < 20 ? "text-trading-success" :
                      model.averageLatency < 40 ? "text-trading-warning" : "text-trading-error"
                    )}>
                      {model.averageLatency.toFixed(0)}ms
                    </span>
                  </td>
                  
                  <td className="p-4 text-center">
                    <TrendIndicator trend={model.performanceTrend} />
                  </td>
                  
                  {enableActions && (
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="p-1 text-trading-text-secondary hover:text-trading-accent-blue transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        <button
                          className="p-1 text-trading-text-secondary hover:text-trading-warning transition-colors"
                          title="Settings"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        
                        <button
                          className={cn(
                            "p-1 transition-colors",
                            model.status === 'active' 
                              ? "text-trading-text-secondary hover:text-trading-warning" 
                              : "text-trading-text-secondary hover:text-trading-success"
                          )}
                          title={model.status === 'active' ? 'Pause' : 'Start'}
                        >
                          {model.status === 'active' ? 
                            <Pause className="w-4 h-4" /> : 
                            <Play className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-text-primary">
            {comparisonData.filter(m => m.status === 'active').length}
          </div>
          <div className="text-xs text-trading-text-secondary">Active Models</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-success">
            {comparisonData.filter(m => m.tier === 'A').length}
          </div>
          <div className="text-xs text-trading-text-secondary">Tier A Models</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-accent-blue">
            {(comparisonData.reduce((sum, m) => sum + m.accuracy, 0) / comparisonData.length * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-trading-text-secondary">Avg Accuracy</div>
        </div>
        
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-trading-text-primary">
            {comparisonData.reduce((sum, m) => sum + m.totalPredictions, 0).toLocaleString()}
          </div>
          <div className="text-xs text-trading-text-secondary">Total Predictions</div>
        </div>
      </div>
    </div>
  );
}