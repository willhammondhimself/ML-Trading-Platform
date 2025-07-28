'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { TradingViewWidget } from '@/types/tradingview';
import { TechnicalIndicatorsManager, IndicatorPreset } from '@/utils/tradingview/TechnicalIndicators';
import { MLOverlaysManager, MLPredictionConfig } from '@/utils/tradingview/MLOverlays';
import { ChevronDown, TrendingUp, BarChart3, Layers, Zap, Settings } from 'lucide-react';

interface TradingViewControlsProps {
  widget: TradingViewWidget | null;
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  onIntervalChange?: (interval: string) => void;
  className?: string;
}

interface ControlsState {
  indicatorsManager: TechnicalIndicatorsManager | null;
  mlManager: MLOverlaysManager | null;
  appliedIndicators: string[];
  mlOverlays: string[];
  selectedPreset: string | null;
  showIndicatorPanel: boolean;
  showMLPanel: boolean;
  showDrawingTools: boolean;
}

const INTERVALS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
];

const POPULAR_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD',
  'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY'
];

export function TradingViewControls({
  widget,
  symbol,
  onSymbolChange,
  onIntervalChange,
  className,
}: TradingViewControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ControlsState>({
    indicatorsManager: null,
    mlManager: null,
    appliedIndicators: [],
    mlOverlays: [],
    selectedPreset: null,
    showIndicatorPanel: false,
    showMLPanel: false,
    showDrawingTools: false,
  });

  // Initialize managers when widget is ready
  React.useEffect(() => {
    if (widget && !state.indicatorsManager) {
      widget.onChartReady(() => {
        const chart = widget.activeChart();
        const indicatorsManager = new TechnicalIndicatorsManager(chart);
        const mlManager = new MLOverlaysManager(chart);
        
        setState(prev => ({
          ...prev,
          indicatorsManager,
          mlManager,
        }));
      });
    }
  }, [widget, state.indicatorsManager]);

  const updateState = useCallback((updates: Partial<ControlsState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleApplyPreset = useCallback(async (presetId: string) => {
    if (!state.indicatorsManager) return;

    startTransition(async () => {
      try {
        await state.indicatorsManager!.removeAllIndicators();
        await state.indicatorsManager!.applyPreset(presetId);
        
        updateState({
          selectedPreset: presetId,
          appliedIndicators: state.indicatorsManager!.getAppliedIndicators(),
        });
      } catch (error) {
        console.error('Error applying preset:', error);
      }
    });
  }, [state.indicatorsManager, updateState]);

  const handleRemoveAllIndicators = useCallback(() => {
    if (!state.indicatorsManager) return;

    startTransition(() => {
      state.indicatorsManager!.removeAllIndicators();
      updateState({
        appliedIndicators: [],
        selectedPreset: null,
      });
    });
  }, [state.indicatorsManager, updateState]);

  const handleAddMLPredictions = useCallback(async () => {
    if (!state.mlManager) return;

    const config: MLPredictionConfig = {
      modelName: 'LSTM-Transformer',
      symbol,
      timeframe: '15m',
      predictionHorizon: 240, // 4 hours
      confidenceThreshold: 0.6,
      showConfidenceBands: true,
      showPredictionLine: true,
      showSupportResistance: true,
      updateInterval: 60000, // 1 minute
    };

    // Mock prediction data
    const predictions = Array.from({ length: 16 }, (_, i) => ({
      time: Date.now() + (i * 15 * 60 * 1000),
      value: 150 + Math.random() * 20 - 10,
      confidence: Math.random() * 0.4 + 0.6,
      type: 'price' as const,
    }));

    startTransition(async () => {
      try {
        const overlayId = await state.mlManager!.addPredictionOverlay(config, predictions);
        updateState({
          mlOverlays: [...state.mlOverlays, overlayId],
        });
      } catch (error) {
        console.error('Error adding ML predictions:', error);
      }
    });
  }, [state.mlManager, symbol, state.mlOverlays, updateState]);

  const handleRemoveMLOverlays = useCallback(() => {
    if (!state.mlManager) return;

    startTransition(() => {
      state.mlManager!.removeAllOverlays();
      updateState({ mlOverlays: [] });
    });
  }, [state.mlManager, updateState]);

  const handleToggleDrawingTools = useCallback(() => {
    if (!widget) return;

    try {
      const chart = widget.activeChart();
      
      if (state.showDrawingTools) {
        // Hide drawing tools (limited API access)
        chart.executeActionById('drawingToolbarAction');
      } else {
        // Show drawing tools
        chart.executeActionById('drawingToolbarAction');
      }
      
      updateState({ showDrawingTools: !state.showDrawingTools });
    } catch (error) {
      console.warn('Drawing tools action not available:', error);
    }
  }, [widget, state.showDrawingTools, updateState]);

  const presets = TechnicalIndicatorsManager.PRESETS;

  if (!widget) {
    return (
      <div className={cn('p-4 bg-trading-bg-secondary border border-trading-neutral-700 rounded', className)}>
        <div className="text-center text-trading-text-secondary">
          Chart controls will appear when chart is loaded
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4 bg-trading-bg-secondary border border-trading-neutral-700 rounded', className)}>
      {/* Symbol and Interval Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-trading-text-secondary mb-1">
            Symbol
          </label>
          <select
            value={symbol}
            onChange={(e) => onSymbolChange?.(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-trading-text-primary text-sm focus:border-trading-accent-blue focus:outline-none"
          >
            {POPULAR_SYMBOLS.map(sym => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-medium text-trading-text-secondary mb-1">
            Interval
          </label>
          <select
            onChange={(e) => onIntervalChange?.(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-trading-text-primary text-sm focus:border-trading-accent-blue focus:outline-none"
          >
            {INTERVALS.map(interval => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Technical Indicators Section */}
      <div className="border-t border-trading-neutral-700 pt-4">
        <button
          onClick={() => updateState({ showIndicatorPanel: !state.showIndicatorPanel })}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-trading-accent-blue" />
            <span className="text-sm font-medium text-trading-text-primary">
              Technical Indicators
            </span>
            {state.appliedIndicators.length > 0 && (
              <span className="px-2 py-1 bg-trading-accent-blue/20 text-trading-accent-blue text-xs rounded">
                {state.appliedIndicators.length}
              </span>
            )}
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-trading-text-secondary transition-transform',
            state.showIndicatorPanel && 'rotate-180'
          )} />
        </button>

        {state.showIndicatorPanel && (
          <div className="mt-3 space-y-3">
            {/* Preset Selection */}
            <div>
              <label className="block text-xs font-medium text-trading-text-secondary mb-2">
                Preset Configurations
              </label>
              <div className="grid grid-cols-2 gap-2">
                {presets.slice(0, 4).map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset.id)}
                    disabled={isPending}
                    className={cn(
                      'p-2 text-xs border rounded transition-colors text-left',
                      state.selectedPreset === preset.id
                        ? 'bg-trading-accent-blue/20 border-trading-accent-blue text-trading-accent-blue'
                        : 'bg-trading-bg-primary border-trading-neutral-700 text-trading-text-secondary hover:border-trading-neutral-600 hover:text-trading-text-primary'
                    )}
                  >
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs opacity-75 mt-1">
                      {preset.indicators.length} indicators
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleRemoveAllIndicators}
                disabled={isPending || state.appliedIndicators.length === 0}
                className="flex-1 px-3 py-2 bg-trading-error/10 border border-trading-error/30 text-trading-error text-xs rounded hover:bg-trading-error/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ML Predictions Section */}
      <div className="border-t border-trading-neutral-700 pt-4">
        <button
          onClick={() => updateState({ showMLPanel: !state.showMLPanel })}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-trading-accent-blue" />
            <span className="text-sm font-medium text-trading-text-primary">
              ML Predictions
            </span>
            {state.mlOverlays.length > 0 && (
              <span className="px-2 py-1 bg-trading-accent-blue/20 text-trading-accent-blue text-xs rounded">
                {state.mlOverlays.length}
              </span>
            )}
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-trading-text-secondary transition-transform',
            state.showMLPanel && 'rotate-180'
          )} />
        </button>

        {state.showMLPanel && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleAddMLPredictions}
                disabled={isPending}
                className="p-3 bg-trading-bg-primary border border-trading-neutral-700 rounded text-left hover:border-trading-accent-blue/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3 h-3 text-trading-accent-blue" />
                  <span className="text-xs font-medium text-trading-text-primary">
                    Price Prediction
                  </span>
                </div>
                <div className="text-xs text-trading-text-secondary">
                  LSTM model, 4h horizon
                </div>
              </button>

              <button
                onClick={handleRemoveMLOverlays}
                disabled={isPending || state.mlOverlays.length === 0}
                className="p-3 bg-trading-error/10 border border-trading-error/30 rounded text-left hover:bg-trading-error/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-3 h-3 text-trading-error" />
                  <span className="text-xs font-medium text-trading-error">
                    Clear Overlays
                  </span>
                </div>
                <div className="text-xs text-trading-error/70">
                  Remove all ML overlays
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawing Tools Section */}
      <div className="border-t border-trading-neutral-700 pt-4">
        <button
          onClick={handleToggleDrawingTools}
          disabled={isPending}
          className={cn(
            'flex items-center justify-between w-full p-3 border rounded transition-colors',
            state.showDrawingTools
              ? 'bg-trading-accent-blue/20 border-trading-accent-blue text-trading-accent-blue'
              : 'bg-trading-bg-primary border-trading-neutral-700 text-trading-text-secondary hover:border-trading-neutral-600 hover:text-trading-text-primary'
          )}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Drawing Tools</span>
          </div>
          <div className="text-xs">
            {state.showDrawingTools ? 'Enabled' : 'Disabled'}
          </div>
        </button>
      </div>

      {/* Status Information */}
      <div className="border-t border-trading-neutral-700 pt-4">
        <div className="text-xs text-trading-text-secondary space-y-1">
          <div>Symbol: {symbol}</div>
          <div>Indicators: {state.appliedIndicators.length}</div>
          <div>ML Overlays: {state.mlOverlays.length}</div>
          <div>Chart: {widget ? 'Ready' : 'Loading'}</div>
        </div>
      </div>
    </div>
  );
}