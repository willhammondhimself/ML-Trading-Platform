'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  useMLAnalyticsStore, 
  selectConnectionStatus, 
  selectConnectionHealth, 
  selectIsConnected 
} from '@/stores/ml-analytics-store';

// Import all ML analytics components
import { ConfidenceIntervalChart } from './ConfidenceIntervalChart';
import { ModelPerformanceMetrics } from './ModelPerformanceMetrics';
import { FeatureImportanceChart } from './FeatureImportanceChart';
import { AccuracyTrendChart } from './AccuracyTrendChart';
import { ModelComparisonTable } from './ModelComparisonTable';
import { PredictionExplorer } from './PredictionExplorer';
import { RealtimeNotifications } from './RealtimeNotifications';
import { LivePredictionFeed } from './LivePredictionFeed';

import {
  Brain,
  BarChart3,
  Target,
  TrendingUp,
  Award,
  Eye,
  Settings,
  Filter,
  RefreshCw,
  Download,
  Grid,
  List,
  Maximize2,
  Minimize2,
  Activity,
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Wifi,
  WifiOff,
  Loader2,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

interface MLAnalyticsDashboardProps {
  defaultTab?: string;
  defaultSymbol?: string;
  defaultModel?: string;
  layout?: 'standard' | 'compact' | 'fullscreen';
  enableCustomLayout?: boolean;
  className?: string;
}

type TabId = 'overview' | 'performance' | 'predictions' | 'models' | 'features' | 'accuracy' | 'live';
type LayoutMode = 'grid' | 'stack' | 'sidebar';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface DashboardFilters {
  symbol: string;
  modelName: string;
  timeframe: string;
  predictionType: 'all' | 'price' | 'trend' | 'volatility' | 'volume' | 'sentiment';
}

const TABS: Tab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Real-time ML analytics overview and key metrics'
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: <Target className="w-4 h-4" />,
    description: 'Model performance metrics and trend analysis'
  },
  {
    id: 'predictions',
    label: 'Predictions',
    icon: <Eye className="w-4 h-4" />,
    description: 'Interactive prediction explorer and analysis'
  },
  {
    id: 'models',
    label: 'Models',
    icon: <Award className="w-4 h-4" />,
    description: 'Model comparison and performance rankings'
  },
  {
    id: 'features',
    label: 'Features',
    icon: <Activity className="w-4 h-4" />,
    description: 'Feature importance analysis and insights'
  },
  {
    id: 'accuracy',
    label: 'Accuracy',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Historical accuracy trends and anomaly detection'
  },
  {
    id: 'live',
    label: 'Live Feed',
    icon: <Zap className="w-4 h-4" />,
    description: 'Real-time prediction feed and live updates'
  },
];

const DEFAULT_FILTERS: DashboardFilters = {
  symbol: '',
  modelName: '',
  timeframe: '1h',
  predictionType: 'all',
};

export function MLAnalyticsDashboard({
  defaultTab = 'overview',
  defaultSymbol = '',
  defaultModel = '',
  layout = 'standard',
  enableCustomLayout = true,
  className,
}: MLAnalyticsDashboardProps) {
  const { 
    predictions, 
    modelMetrics, 
    featureImportance, 
    accuracyHistory,
    getFilteredPredictions,
    calculateModelAccuracy,
    // WebSocket actions
    initializeWebSocket,
    connectWebSocket,
    disconnectWebSocket,
    subscribeToUpdates,
    unsubscribeFromUpdates,
    updateConnectionHealth,
  } = useMLAnalyticsStore();

  // WebSocket state
  const connectionStatus = useMLAnalyticsStore(selectConnectionStatus);
  const connectionHealth = useMLAnalyticsStore(selectConnectionHealth);
  const isConnected = useMLAnalyticsStore(selectIsConnected);

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab as TabId);
  const [filters, setFilters] = useState<DashboardFilters>({
    ...DEFAULT_FILTERS,
    symbol: defaultSymbol,
    modelName: defaultModel,
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(layout === 'fullscreen');

  // Initialize WebSocket connection on mount
  useEffect(() => {
    initializeWebSocket();
    connectWebSocket();

    // Health metrics update interval
    const healthInterval = setInterval(() => {
      updateConnectionHealth();
    }, 5000);

    return () => {
      clearInterval(healthInterval);
      disconnectWebSocket();
    };
  }, [initializeWebSocket, connectWebSocket, disconnectWebSocket, updateConnectionHealth]);

  // Update subscription when filters change
  useEffect(() => {
    if (isConnected) {
      const symbols = filters.symbol ? [filters.symbol] : [];
      const models = filters.modelName ? [filters.modelName] : [];
      const predictionTypes = filters.predictionType !== 'all' ? [filters.predictionType] : [];

      subscribeToUpdates({
        symbols,
        models,
        predictionTypes,
        enableMetrics: true,
        enableFeatures: true,
      });
    }
  }, [filters, isConnected, subscribeToUpdates]);

  // Get available options for filters
  const availableOptions = useMemo(() => {
    const allPredictions = Array.from(predictions.values());
    const symbols = [...new Set(allPredictions.map(p => p.symbol))].sort();
    const models = [...new Set(allPredictions.map(p => p.modelName))].sort();
    const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];

    return { symbols, models, timeframes };
  }, [predictions]);

  // Calculate dashboard summary statistics
  const dashboardStats = useMemo(() => {
    const allPredictions = getFilteredPredictions();
    const filteredPredictions = allPredictions.filter(p => {
      if (filters.symbol && p.symbol !== filters.symbol) return false;
      if (filters.modelName && p.modelName !== filters.modelName) return false;
      if (filters.predictionType !== 'all' && p.predictionType !== filters.predictionType) return false;
      return true;
    });

    const totalPredictions = filteredPredictions.length;
    const activePredictions = filteredPredictions.filter(p => !p.isResolved).length;
    const resolvedPredictions = filteredPredictions.filter(p => p.isResolved).length;
    
    const avgAccuracy = resolvedPredictions > 0
      ? filteredPredictions
          .filter(p => p.isResolved && p.accuracy !== undefined)
          .reduce((sum, p) => sum + (p.accuracy || 0), 0) / resolvedPredictions
      : 0;

    const avgConfidence = totalPredictions > 0
      ? filteredPredictions.reduce((sum, p) => sum + p.confidence, 0) / totalPredictions
      : 0;

    const activeModels = new Set(filteredPredictions.map(p => p.modelName)).size;
    const topModel = models.length > 0 ? models[0] : null;

    // Calculate recent activity (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentPredictions = filteredPredictions.filter(p => p.timestamp > oneDayAgo).length;

    // Calculate alerts (low accuracy models, high confidence failed predictions, etc.)
    const lowAccuracyModels = Array.from(modelMetrics.values()).filter(m => m.accuracy < 0.6).length;
    const highConfidenceFailures = filteredPredictions.filter(p => 
      p.isResolved && p.confidence > 0.8 && (p.accuracy || 0) < 0.5
    ).length;
    const alerts = lowAccuracyModels + highConfidenceFailures;

    return {
      totalPredictions,
      activePredictions,
      resolvedPredictions,
      avgAccuracy: avgAccuracy * 100,
      avgConfidence: avgConfidence * 100,
      activeModels,
      topModel,
      recentActivity: recentPredictions,
      alerts,
    };
  }, [predictions, modelMetrics, filters, getFilteredPredictions]);

  const handleFilterChange = useCallback((key: keyof DashboardFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExportAll = useCallback(() => {
    // Export comprehensive ML analytics data
    const exportData = {
      filters,
      statistics: dashboardStats,
      predictions: getFilteredPredictions(),
      modelMetrics: Array.from(modelMetrics.values()),
      featureImportance: Array.from(featureImportance.entries()),
      accuracyHistory: Array.from(accuracyHistory.entries()),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-analytics-dashboard-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filters, dashboardStats, getFilteredPredictions, modelMetrics, featureImportance, accuracyHistory]);

  // WebSocket connection management
  const handleToggleConnection = useCallback(() => {
    if (isConnected) {
      disconnectWebSocket();
    } else {
      connectWebSocket();
    }
  }, [isConnected, connectWebSocket, disconnectWebSocket]);

  const handleReconnect = useCallback(() => {
    disconnectWebSocket();
    setTimeout(() => connectWebSocket(), 1000);
  }, [connectWebSocket, disconnectWebSocket]);

  // Connection status component
  const ConnectionStatus = () => {
    const getStatusIcon = () => {
      switch (connectionStatus) {
        case 'connected':
          return <Wifi className="w-4 h-4 text-trading-success" />;
        case 'connecting':
        case 'reconnecting':
          return <Loader2 className="w-4 h-4 text-trading-warning animate-spin" />;
        case 'disconnected':
          return <WifiOff className="w-4 h-4 text-trading-text-secondary" />;
        case 'error':
          return <WifiOff className="w-4 h-4 text-trading-error" />;
        default:
          return <WifiOff className="w-4 h-4 text-trading-text-secondary" />;
      }
    };

    const getStatusText = () => {
      switch (connectionStatus) {
        case 'connected':
          return 'Live';
        case 'connecting':
          return 'Connecting...';
        case 'reconnecting':
          return 'Reconnecting...';
        case 'disconnected':
          return 'Offline';
        case 'error':
          return 'Error';
        default:
          return 'Unknown';
      }
    };

    const getStatusColor = () => {
      switch (connectionStatus) {
        case 'connected':
          return 'text-trading-success';
        case 'connecting':
        case 'reconnecting':
          return 'text-trading-warning';
        case 'disconnected':
          return 'text-trading-text-secondary';
        case 'error':
          return 'text-trading-error';
        default:
          return 'text-trading-text-secondary';
      }
    };

    return (
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <div className="flex flex-col">
          <span className={cn('text-xs font-medium', getStatusColor())}>
            {getStatusText()}
          </span>
          {isConnected && connectionHealth.messageCount > 0 && (
            <span className="text-xs text-trading-text-secondary">
              {connectionHealth.messageCount} msgs • {connectionHealth.latency}ms
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <Brain className="w-8 h-8 text-trading-accent-blue" />
            <span className="text-xs text-trading-text-secondary">ML Analytics</span>
          </div>
          <div className="text-3xl font-bold text-trading-text-primary mb-1">
            {dashboardStats.totalPredictions}
          </div>
          <div className="text-sm text-trading-text-secondary">Total Predictions</div>
          <div className="text-xs text-trading-success mt-2">
            +{dashboardStats.recentActivity} in 24h
          </div>
        </div>

        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <Target className="w-8 h-8 text-trading-success" />
            <span className="text-xs text-trading-text-secondary">Accuracy</span>
          </div>
          <div className={cn(
            "text-3xl font-bold mb-1",
            dashboardStats.avgAccuracy > 80 ? "text-trading-success" :
            dashboardStats.avgAccuracy > 60 ? "text-trading-warning" : "text-trading-error"
          )}>
            {dashboardStats.avgAccuracy.toFixed(1)}%
          </div>
          <div className="text-sm text-trading-text-secondary">Average Accuracy</div>
          <div className="text-xs text-trading-text-secondary mt-2">
            {dashboardStats.resolvedPredictions} resolved
          </div>
        </div>

        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <Award className="w-8 h-8 text-trading-warning" />
            <span className="text-xs text-trading-text-secondary">Models</span>
          </div>
          <div className="text-3xl font-bold text-trading-text-primary mb-1">
            {dashboardStats.activeModels}
          </div>
          <div className="text-sm text-trading-text-secondary">Active Models</div>
          {dashboardStats.topModel && (
            <div className="text-xs text-trading-accent-blue mt-2">
              Top: {dashboardStats.topModel}
            </div>
          )}
        </div>

        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            {dashboardStats.alerts > 0 ? (
              <AlertCircle className="w-8 h-8 text-trading-error" />
            ) : (
              <CheckCircle className="w-8 h-8 text-trading-success" />
            )}
            <span className="text-xs text-trading-text-secondary">Status</span>
          </div>
          <div className={cn(
            "text-3xl font-bold mb-1",
            dashboardStats.alerts === 0 ? "text-trading-success" : "text-trading-error"
          )}>
            {dashboardStats.alerts}
          </div>
          <div className="text-sm text-trading-text-secondary">
            {dashboardStats.alerts === 0 ? 'No Alerts' : 'Active Alerts'}
          </div>
          <div className="text-xs text-trading-text-secondary mt-2">
            {dashboardStats.activePredictions} pending
          </div>
        </div>
      </div>

      {/* Overview Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModelPerformanceMetrics
          modelName={filters.modelName || undefined}
          symbol={filters.symbol || undefined}
          timeframe={filters.timeframe}
          showComparison={true}
        />
        
        <ConfidenceIntervalChart
          symbol={filters.symbol || undefined}
          modelName={filters.modelName || undefined}
          height={400}
          showActualValues={true}
          enableZoom={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AccuracyTrendChart
            modelName={filters.modelName || undefined}
            symbol={filters.symbol || undefined}
            timeframe={filters.timeframe}
            height={300}
            showBenchmarks={true}
            showAnomalies={true}
          />
        </div>
        
        <div>
          <LivePredictionFeed
            maxItems={20}
            autoScroll={true}
            showFilters={false}
            height={300}
            showMiniView={true}
          />
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    const commonProps = {
      modelName: filters.modelName || undefined,
      symbol: filters.symbol || undefined,
      timeframe: filters.timeframe,
    };

    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      
      case 'performance':
        return (
          <div className="space-y-6">
            <ModelPerformanceMetrics {...commonProps} showComparison={true} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AccuracyTrendChart {...commonProps} height={400} />
              <ConfidenceIntervalChart {...commonProps} height={400} />
            </div>
          </div>
        );
      
      case 'predictions':
        return (
          <PredictionExplorer
            {...commonProps}
            predictionType={filters.predictionType !== 'all' ? filters.predictionType : undefined}
            maxPredictions={100}
            enableFiltering={true}
          />
        );
      
      case 'models':
        return (
          <div className="space-y-6">
            <ModelComparisonTable
              {...commonProps}
              maxModels={20}
              enableActions={true}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ModelPerformanceMetrics {...commonProps} />
              <AccuracyTrendChart {...commonProps} height={300} />
            </div>
          </div>
        );
      
      case 'features':
        return (
          <div className="space-y-6">
            <FeatureImportanceChart
              modelName={filters.modelName || undefined}
              maxFeatures={20}
              chartType="bar"
              enableDrilldown={true}
            />
            {filters.modelName && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FeatureImportanceChart
                  modelName={filters.modelName}
                  maxFeatures={8}
                  chartType="radar"
                />
                <FeatureImportanceChart
                  modelName={filters.modelName}
                  maxFeatures={15}
                  chartType="treemap"
                />
              </div>
            )}
          </div>
        );
      
      case 'accuracy':
        return (
          <div className="space-y-6">
            <AccuracyTrendChart
              {...commonProps}
              height={500}
              showBenchmarks={true}
              showAnomalies={true}
              showMovingAverages={true}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConfidenceIntervalChart {...commonProps} height={400} />
              <ModelPerformanceMetrics {...commonProps} />
            </div>
          </div>
        );
      
      case 'live':
        return (
          <LivePredictionFeed
            maxItems={100}
            autoScroll={true}
            showFilters={true}
            height={600}
            showMiniView={false}
          />
        );
      
      default:
        return renderOverviewTab();
    }
  };

  return (
    <div className={cn(
      'space-y-6 transition-all duration-300',
      isFullscreen && 'fixed inset-0 z-50 bg-trading-bg-primary p-6 overflow-auto',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-trading-accent-blue" />
            <div>
              <h1 className="text-2xl font-bold text-trading-text-primary">
                ML Analytics Dashboard
              </h1>
              <p className="text-sm text-trading-text-secondary">
                Real-time machine learning performance insights and analytics
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="hidden md:flex items-center gap-3">
            <div className="h-6 w-px bg-trading-neutral-700" />
            <ConnectionStatus />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleConnection}
              className={cn(
                "p-2 rounded transition-colors",
                isConnected 
                  ? "text-trading-success hover:text-trading-success/80" 
                  : "text-trading-text-secondary hover:text-trading-text-primary"
              )}
              title={isConnected ? "Disconnect Real-time Feed" : "Connect Real-time Feed"}
            >
              {isConnected ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            
            <button
              onClick={handleReconnect}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Reconnect"
              disabled={connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
            >
              <RotateCcw className={cn(
                "w-4 h-4",
                (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') && "animate-spin"
              )} />
            </button>
          </div>

          <div className="h-6 w-px bg-trading-neutral-700" />

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
          
          <button
            onClick={handleExportAll}
            className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
            title="Export Dashboard Data"
          >
            <Download className="w-4 h-4" />
          </button>
          
          {enableCustomLayout && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Symbol
              </label>
              <select
                value={filters.symbol}
                onChange={(e) => handleFilterChange('symbol', e.target.value)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="">All Symbols</option>
                {availableOptions.symbols.map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Model
              </label>
              <select
                value={filters.modelName}
                onChange={(e) => handleFilterChange('modelName', e.target.value)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="">All Models</option>
                {availableOptions.models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Timeframe
              </label>
              <select
                value={filters.timeframe}
                onChange={(e) => handleFilterChange('timeframe', e.target.value)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                {availableOptions.timeframes.map(tf => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Prediction Type
              </label>
              <select
                value={filters.predictionType}
                onChange={(e) => handleFilterChange('predictionType', e.target.value)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="all">All Types</option>
                <option value="price">Price</option>
                <option value="trend">Trend</option>
                <option value="volatility">Volatility</option>
                <option value="volume">Volume</option>
                <option value="sentiment">Sentiment</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-trading-neutral-700">
        <div className="flex space-x-8 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-trading-accent-blue text-trading-accent-blue"
                  : "border-transparent text-trading-text-secondary hover:text-trading-text-primary hover:border-trading-neutral-600"
              )}
              title={tab.description}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        {renderTabContent()}
      </div>

      {/* Real-time Notifications */}
      <RealtimeNotifications 
        maxNotifications={8}
        autoHideDelay={6000}
        showBadge={true}
        position="top-right"
      />
    </div>
  );
}