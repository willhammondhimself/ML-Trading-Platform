'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { TradingViewChart } from './TradingViewChart';
import { TradingViewWidget, TradingViewChartProps } from '@/types/tradingview';
import { ChartThemeManager } from '@/utils/tradingview/ChartThemes';
import { Clock, Maximize2, Minimize2, RotateCcw, Settings } from 'lucide-react';

interface TimeframeConfig {
  id: string;
  interval: string;
  label: string;
  weight: number; // For layout sizing
}

interface MultiTimeframeChartProps extends Omit<TradingViewChartProps, 'interval' | 'onChartReady'> {
  timeframes?: TimeframeConfig[];
  syncCrosshair?: boolean;
  syncZoom?: boolean;
  syncSymbol?: boolean;
  layout?: 'grid' | 'horizontal' | 'vertical' | 'focus';
  allowLayoutChange?: boolean;
  onTimeframeChange?: (timeframeId: string, interval: string) => void;
  className?: string;
}

interface ChartState {
  widget: TradingViewWidget | null;
  crosshair: { time: number; price: number } | null;
  visibleRange: { from: number; to: number } | null;
  symbol: string;
}

interface MultiTimeframeState {
  charts: Map<string, ChartState>;
  activeTimeframe: string | null;
  layout: 'grid' | 'horizontal' | 'vertical' | 'focus';
  syncSettings: {
    crosshair: boolean;
    zoom: boolean;
    symbol: boolean;
  };
  isResizing: boolean;
}

const DEFAULT_TIMEFRAMES: TimeframeConfig[] = [
  { id: 'tf1', interval: '5', label: '5m', weight: 1 },
  { id: 'tf2', interval: '15', label: '15m', weight: 1 },
  { id: 'tf3', interval: '60', label: '1h', weight: 1 },
  { id: 'tf4', interval: '1D', label: '1D', weight: 1 },
];

export function MultiTimeframeChart({
  symbol = 'AAPL',
  theme = 'dark',
  enableML = true,
  enableDrawingTools = false,
  enableTechnicalIndicators = true,
  mobileOptimized = true,
  height = 600,
  width,
  timeframes = DEFAULT_TIMEFRAMES,
  syncCrosshair = true,
  syncZoom = true,
  syncSymbol = true,
  layout = 'grid',
  allowLayoutChange = true,
  onSymbolChanged,
  onIntervalChanged,
  onTimeframeChange,
  className,
}: MultiTimeframeChartProps) {
  const [state, setState] = useState<MultiTimeframeState>({
    charts: new Map(),
    activeTimeframe: timeframes[0]?.id || null,
    layout,
    syncSettings: {
      crosshair: syncCrosshair,
      zoom: syncZoom,
      symbol: syncSymbol,
    },
    isResizing: false,
  });

  const syncInProgress = useRef(false);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  const updateState = useCallback((updates: Partial<MultiTimeframeState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateChartState = useCallback((timeframeId: string, updates: Partial<ChartState>) => {
    setState(prev => {
      const newCharts = new Map(prev.charts);
      const existing = newCharts.get(timeframeId);
      newCharts.set(timeframeId, { ...existing, ...updates } as ChartState);
      return { ...prev, charts: newCharts };
    });
  }, []);

  // Handle chart ready event
  const handleChartReady = useCallback((timeframeId: string) => {
    return (widget: TradingViewWidget) => {
      updateChartState(timeframeId, { 
        widget,
        symbol,
        crosshair: null,
        visibleRange: null,
      });

      // Set up chart event listeners for synchronization
      if (widget && (state.syncSettings.crosshair || state.syncSettings.zoom)) {
        try {
          widget.onChartReady(() => {
            const chart = widget.activeChart();
            
            // Crosshair synchronization
            if (state.syncSettings.crosshair) {
              chart.onCrosshairMoved().subscribe(null, (params: any) => {
                if (syncInProgress.current) return;
                
                syncInProgress.current = true;
                
                const crosshair = params ? {
                  time: params.time,
                  price: params.price,
                } : null;

                updateChartState(timeframeId, { crosshair });
                
                // Sync to other charts
                state.charts.forEach((chartState, otherId) => {
                  if (otherId !== timeframeId && chartState.widget && crosshair) {
                    try {
                      const otherChart = chartState.widget.activeChart();
                      otherChart.setCrosshairXY(params.x, params.y, true);
                    } catch (error) {
                      console.warn(`[MultiTimeframe] Crosshair sync error for ${otherId}:`, error);
                    }
                  }
                });
                
                setTimeout(() => {
                  syncInProgress.current = false;
                }, 50);
              });
            }

            // Zoom synchronization
            if (state.syncSettings.zoom) {
              chart.onVisibleRangeChanged().subscribe(null, (range: any) => {
                if (syncInProgress.current) return;
                
                syncInProgress.current = true;
                updateChartState(timeframeId, { visibleRange: range });
                
                // Sync zoom to other charts (with timeframe adjustment)
                state.charts.forEach((chartState, otherId) => {
                  if (otherId !== timeframeId && chartState.widget && range) {
                    try {
                      const otherChart = chartState.widget.activeChart();
                      const otherTimeframe = timeframes.find(tf => tf.id === otherId);
                      
                      if (otherTimeframe) {
                        // Adjust range based on timeframe ratio
                        const currentTf = timeframes.find(tf => tf.id === timeframeId);
                        if (currentTf) {
                          const ratio = this.getTimeframeRatio(currentTf.interval, otherTimeframe.interval);
                          const adjustedRange = {
                            from: range.from,
                            to: range.from + (range.to - range.from) * ratio,
                          };
                          otherChart.setVisibleRange(adjustedRange);
                        }
                      }
                    } catch (error) {
                      console.warn(`[MultiTimeframe] Zoom sync error for ${otherId}:`, error);
                    }
                  }
                });
                
                setTimeout(() => {
                  syncInProgress.current = false;
                }, 100);
              });
            }
          });
        } catch (error) {
          console.error(`[MultiTimeframe] Error setting up sync for ${timeframeId}:`, error);
        }
      }

      console.log(`[MultiTimeframe] Chart ${timeframeId} ready`);
    };
  }, [state.charts, state.syncSettings, symbol, timeframes, updateChartState]);

  // Calculate timeframe ratio for zoom synchronization
  const getTimeframeRatio = useCallback((fromInterval: string, toInterval: string): number => {
    const intervals: Record<string, number> = {
      '1': 1,
      '5': 5,
      '15': 15,
      '30': 30,
      '60': 60,
      '240': 240,
      '1D': 1440,
      '1W': 10080,
    };
    
    const fromMinutes = intervals[fromInterval] || 15;
    const toMinutes = intervals[toInterval] || 15;
    
    return fromMinutes / toMinutes;
  }, []);

  // Handle symbol change
  const handleSymbolChange = useCallback((newSymbol: string, timeframeId?: string) => {
    if (state.syncSettings.symbol) {
      // Update all charts
      state.charts.forEach((chartState, id) => {
        updateChartState(id, { symbol: newSymbol });
      });
    } else if (timeframeId) {
      // Update only specific chart
      updateChartState(timeframeId, { symbol: newSymbol });
    }
    
    onSymbolChanged?.({ symbol: newSymbol, interval: timeframes[0]?.interval || '15' });
  }, [state.charts, state.syncSettings.symbol, timeframes, onSymbolChanged, updateChartState]);

  // Handle interval change
  const handleIntervalChange = useCallback((newInterval: string, timeframeId: string) => {
    const timeframe = timeframes.find(tf => tf.id === timeframeId);
    if (timeframe) {
      onTimeframeChange?.(timeframeId, newInterval);
      onIntervalChanged?.({ symbol, interval: newInterval });
    }
  }, [timeframes, symbol, onTimeframeChange, onIntervalChanged]);

  // Layout management
  const handleLayoutChange = useCallback((newLayout: MultiTimeframeState['layout']) => {
    updateState({ layout: newLayout });
  }, [updateState]);

  const handleSetActiveTimeframe = useCallback((timeframeId: string) => {
    updateState({ activeTimeframe: timeframeId });
  }, [updateState]);

  // Toggle sync settings
  const toggleSync = useCallback((syncType: keyof MultiTimeframeState['syncSettings']) => {
    updateState({
      syncSettings: {
        ...state.syncSettings,
        [syncType]: !state.syncSettings[syncType],
      },
    });
  }, [state.syncSettings, updateState]);

  // Get layout styles
  const getLayoutStyles = useCallback(() => {
    const { layout } = state;
    const chartCount = timeframes.length;
    
    switch (layout) {
      case 'horizontal':
        return {
          display: 'flex',
          flexDirection: 'row' as const,
          gap: '8px',
        };
      case 'vertical':
        return {
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '8px',
        };
      case 'grid':
        const cols = Math.ceil(Math.sqrt(chartCount));
        return {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '8px',
        };
      case 'focus':
        return {
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '8px',
        };
      default:
        return {};
    }
  }, [state.layout, timeframes.length]);

  // Get chart dimensions
  const getChartDimensions = useCallback((timeframeId: string) => {
    const { layout } = state;
    const chartCount = timeframes.length;
    const timeframe = timeframes.find(tf => tf.id === timeframeId);
    
    let chartHeight = height;
    let chartWidth = width;
    
    switch (layout) {
      case 'horizontal':
        chartWidth = width ? Math.floor(width / chartCount) - 8 : undefined;
        break;
      case 'vertical':
        chartHeight = Math.floor(height / chartCount) - 8;
        break;
      case 'grid':
        const cols = Math.ceil(Math.sqrt(chartCount));
        const rows = Math.ceil(chartCount / cols);
        chartHeight = Math.floor(height / rows) - 8;
        chartWidth = width ? Math.floor(width / cols) - 8 : undefined;
        break;
      case 'focus':
        if (timeframeId === state.activeTimeframe) {
          chartHeight = Math.floor(height * 0.7);
        } else {
          chartHeight = Math.floor(height * 0.3 / (chartCount - 1));
        }
        break;
    }
    
    return {
      height: chartHeight,
      width: chartWidth,
      weight: timeframe?.weight || 1,
    };
  }, [state.layout, state.activeTimeframe, timeframes, height, width]);

  return (
    <div className={cn('flex flex-col bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden', className)}>
      {/* Control Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-trading-text-primary flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Multi-Timeframe Analysis
          </h3>
          
          <div className="flex items-center gap-2 text-xs text-trading-text-secondary">
            <span>Symbol: {symbol}</span>
            <span>•</span>
            <span>{timeframes.length} timeframes</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleSync('crosshair')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                state.syncSettings.crosshair
                  ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                  : 'bg-trading-bg-primary text-trading-text-secondary hover:text-trading-text-primary'
              )}
              title="Sync Crosshair"
            >
              Cross
            </button>
            
            <button
              onClick={() => toggleSync('zoom')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                state.syncSettings.zoom
                  ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                  : 'bg-trading-bg-primary text-trading-text-secondary hover:text-trading-text-primary'
              )}
              title="Sync Zoom"
            >
              Zoom
            </button>
            
            <button
              onClick={() => toggleSync('symbol')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                state.syncSettings.symbol
                  ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                  : 'bg-trading-bg-primary text-trading-text-secondary hover:text-trading-text-primary'
              )}
              title="Sync Symbol"
            >
              Symbol
            </button>
          </div>

          {/* Layout Controls */}
          {allowLayoutChange && (
            <div className="flex items-center gap-1 border-l border-trading-neutral-700 pl-2">
              <button
                onClick={() => handleLayoutChange('grid')}
                className={cn(
                  'p-1 rounded transition-colors',
                  state.layout === 'grid'
                    ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                    : 'text-trading-text-secondary hover:text-trading-text-primary'
                )}
                title="Grid Layout"
              >
                <div className="w-3 h-3 grid grid-cols-2 gap-px">
                  <div className="bg-current"></div>
                  <div className="bg-current"></div>
                  <div className="bg-current"></div>
                  <div className="bg-current"></div>
                </div>
              </button>
              
              <button
                onClick={() => handleLayoutChange('horizontal')}
                className={cn(
                  'p-1 rounded transition-colors',
                  state.layout === 'horizontal'
                    ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                    : 'text-trading-text-secondary hover:text-trading-text-primary'
                )}
                title="Horizontal Layout"
              >
                <div className="w-3 h-3 flex gap-px">
                  <div className="bg-current flex-1"></div>
                  <div className="bg-current flex-1"></div>
                </div>
              </button>
              
              <button
                onClick={() => handleLayoutChange('focus')}
                className={cn(
                  'p-1 rounded transition-colors',
                  state.layout === 'focus'
                    ? 'bg-trading-accent-blue/20 text-trading-accent-blue'
                    : 'text-trading-text-secondary hover:text-trading-text-primary'
                )}
                title="Focus Layout"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Charts Container */}
      <div 
        className="flex-1 p-4"
        style={{ minHeight: height - 80 }}
      >
        <div style={getLayoutStyles()}>
          {timeframes.map((timeframe) => {
            const dimensions = getChartDimensions(timeframe.id);
            const chartState = state.charts.get(timeframe.id);
            const isActive = state.activeTimeframe === timeframe.id;
            
            return (
              <div
                key={timeframe.id}
                className={cn(
                  'relative border border-trading-neutral-700 rounded overflow-hidden transition-all',
                  isActive && state.layout === 'focus' && 'ring-2 ring-trading-accent-blue/50',
                  state.layout === 'focus' && !isActive && 'opacity-70'
                )}
                onClick={() => handleSetActiveTimeframe(timeframe.id)}
                style={{
                  height: dimensions.height,
                  width: dimensions.width,
                  flex: state.layout === 'horizontal' ? dimensions.weight : undefined,
                }}
              >
                {/* Timeframe Header */}
                <div className="absolute top-2 left-2 z-10 bg-trading-bg-secondary/90 px-2 py-1 rounded text-xs font-medium text-trading-text-primary border border-trading-neutral-700">
                  {timeframe.label}
                  {chartState?.widget && (
                    <span className="ml-2 w-2 h-2 bg-trading-success rounded-full inline-block"></span>
                  )}
                </div>

                {/* Chart */}
                <TradingViewChart
                  symbol={chartState?.symbol || symbol}
                  interval={timeframe.interval}
                  theme={theme}
                  enableML={enableML && isActive} // Only enable ML on active chart in focus mode
                  enableDrawingTools={enableDrawingTools && isActive}
                  enableTechnicalIndicators={enableTechnicalIndicators}
                  mobileOptimized={mobileOptimized}
                  height={dimensions.height}
                  width={dimensions.width}
                  onChartReady={handleChartReady(timeframe.id)}
                  onSymbolChanged={(params) => handleSymbolChange(params.symbol, timeframe.id)}
                  onIntervalChanged={(params) => handleIntervalChange(params.interval, timeframe.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-trading-bg-secondary border-t border-trading-neutral-700 text-xs text-trading-text-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Layout: {state.layout}</span>
            <span>Active: {timeframes.find(tf => tf.id === state.activeTimeframe)?.label}</span>
            <span>
              Sync: {[
                state.syncSettings.crosshair && 'Cross',
                state.syncSettings.zoom && 'Zoom', 
                state.syncSettings.symbol && 'Symbol'
              ].filter(Boolean).join(', ') || 'None'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <span>
              Connected: {Array.from(state.charts.values()).filter(c => c.widget).length}/{timeframes.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}