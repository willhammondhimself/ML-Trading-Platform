'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  useMLAnalyticsStore,
  selectRealtimeUpdates,
  selectIsConnected,
  selectFilteredPredictions
} from '@/stores/ml-analytics-store';
import { EnhancedMLPrediction, PredictionUpdate } from '@/types/ml-analytics';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  Zap,
  Brain,
  Pause,
  Play,
  RotateCcw,
  Filter,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { format } from 'date-fns';

interface LivePredictionFeedProps {
  maxItems?: number;
  autoScroll?: boolean;
  showFilters?: boolean;
  height?: number;
  showMiniView?: boolean;
  className?: string;
}

interface FeedItem {
  id: string;
  prediction: EnhancedMLPrediction;
  updateType: PredictionUpdate['type'];
  timestamp: number;
  isNew: boolean;
}

interface FeedFilters {
  symbols: string[];
  models: string[];
  predictionTypes: string[];
  confidenceThreshold: number;
  showOnlyNew: boolean;
}

export function LivePredictionFeed({
  maxItems = 50,
  autoScroll = true,
  showFilters = true,
  height = 600,
  showMiniView = false,
  className,
}: LivePredictionFeedProps) {
  const realtimeUpdates = useMLAnalyticsStore(selectRealtimeUpdates);
  const isConnected = useMLAnalyticsStore(selectIsConnected);
  const allPredictions = useMLAnalyticsStore(selectFilteredPredictions);

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!showMiniView);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [lastProcessedUpdate, setLastProcessedUpdate] = useState<number>(0);
  
  const [filters, setFilters] = useState<FeedFilters>({
    symbols: [],
    models: [],
    predictionTypes: [],
    confidenceThreshold: 0,
    showOnlyNew: false,
  });

  const feedRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(autoScroll);

  // Process realtime updates into feed items
  useEffect(() => {
    if (isPaused || realtimeUpdates.length === 0) return;

    const latestUpdate = realtimeUpdates[0];
    if (latestUpdate.timestamp <= lastProcessedUpdate) return;

    const newFeedItem: FeedItem = {
      id: `${latestUpdate.prediction.id}-${latestUpdate.timestamp}`,
      prediction: latestUpdate.prediction,
      updateType: latestUpdate.type,
      timestamp: latestUpdate.timestamp,
      isNew: true,
    };

    setFeedItems(prev => {
      // Remove duplicates and add new item
      const filtered = prev.filter(item => 
        item.prediction.id !== latestUpdate.prediction.id || 
        item.timestamp < latestUpdate.timestamp
      );
      
      const updated = [newFeedItem, ...filtered].slice(0, maxItems);
      return updated;
    });

    setLastProcessedUpdate(latestUpdate.timestamp);

    // Mark as not new after 2 seconds
    setTimeout(() => {
      setFeedItems(prev => 
        prev.map(item => 
          item.id === newFeedItem.id 
            ? { ...item, isNew: false }
            : item
        )
      );
    }, 2000);
  }, [realtimeUpdates, isPaused, lastProcessedUpdate, maxItems]);

  // Initialize feed with recent predictions
  useEffect(() => {
    if (feedItems.length === 0 && allPredictions.length > 0) {
      const recentPredictions = allPredictions
        .slice(0, Math.min(20, maxItems))
        .map(prediction => ({
          id: `initial-${prediction.id}`,
          prediction,
          updateType: 'new_prediction' as const,
          timestamp: prediction.timestamp,
          isNew: false,
        }));

      setFeedItems(recentPredictions);
    }
  }, [allPredictions, feedItems.length, maxItems]);

  // Auto-scroll to top when new items arrive
  useEffect(() => {
    if (shouldAutoScroll && feedRef.current && !isPaused) {
      feedRef.current.scrollTop = 0;
    }
  }, [feedItems.length, shouldAutoScroll, isPaused]);

  // Handle scroll detection for auto-scroll behavior
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const isAtTop = scrollTop < 50;
    
    if (autoScroll && !isAtTop) {
      setShouldAutoScroll(false);
    } else if (autoScroll && isAtTop) {
      setShouldAutoScroll(true);
    }
  }, [autoScroll]);

  // Filter feed items
  const filteredItems = useMemo(() => {
    return feedItems.filter(item => {
      const { prediction } = item;
      
      // Symbol filter
      if (filters.symbols.length > 0 && !filters.symbols.includes(prediction.symbol)) {
        return false;
      }
      
      // Model filter
      if (filters.models.length > 0 && !filters.models.includes(prediction.modelName)) {
        return false;
      }
      
      // Prediction type filter
      if (filters.predictionTypes.length > 0 && !filters.predictionTypes.includes(prediction.predictionType)) {
        return false;
      }
      
      // Confidence threshold
      if (prediction.confidence < filters.confidenceThreshold) {
        return false;
      }
      
      // Show only new items
      if (filters.showOnlyNew && !item.isNew) {
        return false;
      }
      
      return true;
    });
  }, [feedItems, filters]);

  // Get available filter options
  const filterOptions = useMemo(() => {
    const symbols = [...new Set(feedItems.map(item => item.prediction.symbol))];
    const models = [...new Set(feedItems.map(item => item.prediction.modelName))];
    const predictionTypes = [...new Set(feedItems.map(item => item.prediction.predictionType))];
    
    return { symbols, models, predictionTypes };
  }, [feedItems]);

  // Get prediction trend direction
  const getTrendIcon = useCallback((prediction: EnhancedMLPrediction) => {
    if (prediction.predictionType === 'trend') {
      return prediction.value.toNumber() > 0 ? (
        <TrendingUp className="w-4 h-4 text-trading-success" />
      ) : (
        <TrendingDown className="w-4 h-4 text-trading-error" />
      );
    }
    
    // For price predictions, show based on market conditions
    if (prediction.marketConditions?.trend === 'bullish') {
      return <ArrowUpRight className="w-4 h-4 text-trading-success" />;
    } else if (prediction.marketConditions?.trend === 'bearish') {
      return <ArrowDownRight className="w-4 h-4 text-trading-error" />;
    }
    
    return <Target className="w-4 h-4 text-trading-text-secondary" />;
  }, []);

  // Get update type styling
  const getUpdateTypeStyle = useCallback((updateType: PredictionUpdate['type']) => {
    switch (updateType) {
      case 'new_prediction':
        return {
          icon: <Zap className="w-3 h-3" />,
          color: 'text-trading-accent-blue',
          bgColor: 'bg-trading-accent-blue/10',
          label: 'New',
        };
      case 'resolution':
        return {
          icon: <Target className="w-3 h-3" />,
          color: 'text-trading-success',
          bgColor: 'bg-trading-success/10',
          label: 'Resolved',
        };
      case 'correction':
        return {
          icon: <RotateCcw className="w-3 h-3" />,
          color: 'text-trading-warning',
          bgColor: 'bg-trading-warning/10',
          label: 'Updated',
        };
      case 'expiry':
        return {
          icon: <Clock className="w-3 h-3" />,
          color: 'text-trading-text-secondary',
          bgColor: 'bg-trading-neutral-700/10',
          label: 'Expired',
        };
      default:
        return {
          icon: <Activity className="w-3 h-3" />,
          color: 'text-trading-text-secondary',
          bgColor: 'bg-trading-neutral-700/10',
          label: 'Update',
        };
    }
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(!isPaused);
  }, [isPaused]);

  const clearFeed = useCallback(() => {
    setFeedItems([]);
    setLastProcessedUpdate(0);
  }, []);

  const handleFilterChange = useCallback((key: keyof FeedFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  if (showMiniView && !isExpanded) {
    return (
      <div className={cn(
        'bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4',
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-trading-accent-blue" />
            <h3 className="text-sm font-medium text-trading-text-primary">
              Live Feed
            </h3>
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-trading-success animate-pulse' : 'bg-trading-text-secondary'
            )} />
          </div>
          
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-2">
          {filteredItems.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {getTrendIcon(item.prediction)}
                <span className="text-trading-text-primary font-medium">
                  {item.prediction.symbol}
                </span>
              </div>
              <div className="text-right">
                <div className="text-trading-text-primary">
                  ${item.prediction.value.toFixed(2)}
                </div>
                <div className="text-trading-text-secondary">
                  {format(new Date(item.timestamp), 'HH:mm')}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {filteredItems.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-trading-text-secondary">
              {isConnected ? 'No predictions yet' : 'Connecting...'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      'bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg',
      className
    )} style={{ height: isExpanded ? height : 'auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-trading-neutral-700">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Live Prediction Feed
            </h3>
            <div className="flex items-center gap-2 text-sm text-trading-text-secondary">
              <div className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-trading-success animate-pulse' : 'bg-trading-text-secondary'
              )} />
              <span>
                {isConnected ? `${filteredItems.length} predictions` : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={cn(
              'p-2 rounded transition-colors',
              isPaused 
                ? 'text-trading-warning hover:text-trading-warning/80' 
                : 'text-trading-success hover:text-trading-success/80'
            )}
            title={isPaused ? 'Resume Feed' : 'Pause Feed'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {showFilters && (
            <button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={cn(
                'p-2 rounded transition-colors',
                showFiltersPanel 
                  ? 'bg-trading-accent-blue text-white' 
                  : 'text-trading-text-secondary hover:text-trading-text-primary'
              )}
              title="Filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={clearFeed}
            className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
            title="Clear Feed"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {showMiniView && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFiltersPanel && (
        <div className="p-4 bg-trading-bg-primary border-b border-trading-neutral-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-trading-text-secondary mb-2">
                Symbols
              </label>
              <select
                multiple
                value={filters.symbols}
                onChange={(e) => handleFilterChange('symbols', Array.from(e.target.selectedOptions, option => option.value))}
                className="w-full px-2 py-1 bg-trading-bg-secondary border border-trading-neutral-700 rounded text-xs"
                size={3}
              >
                {filterOptions.symbols.map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-trading-text-secondary mb-2">
                Models
              </label>
              <select
                multiple
                value={filters.models}
                onChange={(e) => handleFilterChange('models', Array.from(e.target.selectedOptions, option => option.value))}
                className="w-full px-2 py-1 bg-trading-bg-secondary border border-trading-neutral-700 rounded text-xs"
                size={3}
              >
                {filterOptions.models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-trading-text-secondary mb-2">
                Confidence Threshold
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.confidenceThreshold}
                onChange={(e) => handleFilterChange('confidenceThreshold', parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-trading-text-secondary mt-1">
                <span>0%</span>
                <span>{(filters.confidenceThreshold * 100).toFixed(0)}%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={filters.showOnlyNew}
                onChange={(e) => handleFilterChange('showOnlyNew', e.target.checked)}
                className="rounded border-trading-neutral-700"
              />
              <span>Show only new predictions</span>
            </label>
          </div>
        </div>
      )}

      {/* Feed Content */}
      <div 
        ref={feedRef}
        className="overflow-y-auto"
        style={{ height: height - 100 }}
        onScroll={handleScroll}
      >
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <EyeOff className="w-12 h-12 text-trading-text-secondary mb-4" />
            <h3 className="text-lg font-medium text-trading-text-primary mb-2">
              No Predictions
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {isPaused ? 'Feed is paused' : 
               !isConnected ? 'Waiting for connection...' : 
               'Waiting for new predictions...'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-trading-neutral-700">
            {filteredItems.map((item) => {
              const { prediction, updateType, timestamp, isNew } = item;
              const updateStyle = getUpdateTypeStyle(updateType);
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-4 transition-all duration-500',
                    'hover:bg-trading-bg-primary/50',
                    isNew && 'bg-trading-accent-blue/5 scale-[1.02]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {getTrendIcon(prediction)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-trading-text-primary">
                            {prediction.symbol}
                          </h4>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1',
                            updateStyle.color,
                            updateStyle.bgColor
                          )}>
                            {updateStyle.icon}
                            {updateStyle.label}
                          </span>
                          {isNew && (
                            <div className="w-2 h-2 bg-trading-accent-blue rounded-full animate-pulse" />
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-trading-text-primary">
                            ${prediction.value.toFixed(2)}
                          </div>
                          <div className="text-xs text-trading-text-secondary">
                            {format(new Date(timestamp), 'HH:mm:ss')}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-trading-text-secondary">
                          <span>{prediction.modelName}</span>
                          <span>{prediction.predictionType}</span>
                          <span className="flex items-center gap-1">
                            <Brain className="w-3 h-3" />
                            {(prediction.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        
                        {prediction.isResolved && prediction.accuracy !== undefined && (
                          <div className={cn(
                            'text-xs font-medium',
                            prediction.accuracy > 0.8 ? 'text-trading-success' :
                            prediction.accuracy > 0.5 ? 'text-trading-warning' : 'text-trading-error'
                          )}>
                            {(prediction.accuracy * 100).toFixed(1)}% accurate
                          </div>
                        )}
                      </div>

                      {prediction.isResolved && prediction.actualValue && (
                        <div className="mt-2 p-2 bg-trading-bg-primary/50 rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-trading-text-secondary">Actual Value:</span>
                            <span className="text-trading-text-primary font-medium">
                              ${prediction.actualValue.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="p-3 border-t border-trading-neutral-700 bg-trading-bg-primary/50">
        <div className="flex items-center justify-between text-xs text-trading-text-secondary">
          <div className="flex items-center gap-4">
            <span>
              {filteredItems.length} of {feedItems.length} predictions
            </span>
            {isPaused && (
              <span className="text-trading-warning">Feed Paused</span>
            )}
            {!shouldAutoScroll && autoScroll && (
              <button
                onClick={() => setShouldAutoScroll(true)}
                className="text-trading-accent-blue hover:underline"
              >
                Resume auto-scroll
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-trading-success animate-pulse' : 'bg-trading-text-secondary'
            )} />
            <span>
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}