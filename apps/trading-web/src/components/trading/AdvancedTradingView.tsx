'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TradingViewChart } from './TradingViewChart';
import { TradingViewControls } from './TradingViewControls';
import { MultiTimeframeChart } from './MultiTimeframeChart';
import { TradingViewChartProps, TradingViewWidget } from '@/types/tradingview';
import { ChartThemeManager } from '@/utils/tradingview/ChartThemes';
import { Monitor, Smartphone, Tablet, Settings, Maximize, Minimize, Clock } from 'lucide-react';

interface AdvancedTradingViewProps extends Omit<TradingViewChartProps, 'onChartReady'> {
  showControls?: boolean;
  allowFullscreen?: boolean;
  responsiveBreakpoints?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  defaultLayout?: 'standard' | 'compact' | 'minimal';
  enableSync?: boolean;
  enableMultiTimeframe?: boolean;
  multiTimeframeLayout?: 'grid' | 'horizontal' | 'vertical' | 'focus';
  className?: string;
}

interface ViewportMode {
  type: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
}

interface LayoutState {
  mode: 'standard' | 'compact' | 'minimal';
  isFullscreen: boolean;
  showControls: boolean;
  showSettings: boolean;
  currentTheme: string;
  viewport: ViewportMode;
  multiTimeframeMode: boolean;
}

const DEFAULT_BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1200,
};

export function AdvancedTradingView({
  symbol = 'AAPL',
  interval = '15',
  theme = 'dark',
  enableML = true,
  enableDrawingTools = true,
  enableTechnicalIndicators = true,
  mobileOptimized = true,
  height = 600,
  width,
  showControls = true,
  allowFullscreen = true,
  responsiveBreakpoints = DEFAULT_BREAKPOINTS,
  defaultLayout = 'standard',
  enableSync = false,
  enableMultiTimeframe = false,
  multiTimeframeLayout = 'grid',
  className,
  onSymbolChanged,
  onIntervalChanged,
}: AdvancedTradingViewProps) {
  const [widget, setWidget] = useState<TradingViewWidget | null>(null);
  const [layoutState, setLayoutState] = useState<LayoutState>({
    mode: defaultLayout,
    isFullscreen: false,
    showControls,
    showSettings: false,
    currentTheme: theme === 'dark' ? 'darkProfessional' : 'lightProfessional',
    viewport: {
      type: 'desktop',
      width: window.innerWidth,
      height: window.innerHeight,
    },
    multiTimeframeMode: enableMultiTimeframe,
  });

  // Update viewport information on window resize
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      let type: ViewportMode['type'] = 'desktop';
      if (width < responsiveBreakpoints.mobile) {
        type = 'mobile';
      } else if (width < responsiveBreakpoints.tablet) {
        type = 'tablet';
      }

      setLayoutState(prev => ({
        ...prev,
        viewport: { type, width, height },
      }));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [responsiveBreakpoints]);

  // Auto-adjust layout based on viewport
  useEffect(() => {
    if (mobileOptimized) {
      const { viewport } = layoutState;
      let newMode = layoutState.mode;
      
      if (viewport.type === 'mobile') {
        newMode = 'minimal';
      } else if (viewport.type === 'tablet') {
        newMode = 'compact';
      } else {
        newMode = defaultLayout;
      }

      if (newMode !== layoutState.mode) {
        setLayoutState(prev => ({ ...prev, mode: newMode }));
      }
    }
  }, [layoutState.viewport, mobileOptimized, defaultLayout, layoutState.mode]);

  const updateLayoutState = useCallback((updates: Partial<LayoutState>) => {
    setLayoutState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleChartReady = useCallback((chartWidget: TradingViewWidget) => {
    setWidget(chartWidget);
    console.log('[AdvancedTradingView] Chart initialized successfully');
  }, []);

  const handleSymbolChange = useCallback((newSymbol: string) => {
    onSymbolChanged?.({ symbol: newSymbol, interval });
  }, [interval, onSymbolChanged]);

  const handleIntervalChange = useCallback((newInterval: string) => {
    onIntervalChanged?.({ symbol, interval: newInterval });
  }, [symbol, onIntervalChanged]);

  const handleThemeChange = useCallback((themeName: string) => {
    updateLayoutState({ currentTheme: themeName });
    
    // Theme changes require widget recreation
    if (widget) {
      console.log('[AdvancedTradingView] Theme changed, widget will be recreated');
    }
  }, [widget, updateLayoutState]);

  const handleLayoutModeChange = useCallback((mode: LayoutState['mode']) => {
    updateLayoutState({ mode });
  }, [updateLayoutState]);

  const toggleFullscreen = useCallback(() => {
    if (!allowFullscreen) return;

    const newFullscreen = !layoutState.isFullscreen;
    updateLayoutState({ isFullscreen: newFullscreen });

    if (newFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [allowFullscreen, layoutState.isFullscreen, updateLayoutState]);

  const toggleControls = useCallback(() => {
    updateLayoutState({ showControls: !layoutState.showControls });
  }, [layoutState.showControls, updateLayoutState]);

  const toggleSettings = useCallback(() => {
    updateLayoutState({ showSettings: !layoutState.showSettings });
  }, [layoutState.showSettings, updateLayoutState]);

  const toggleMultiTimeframe = useCallback(() => {
    updateLayoutState({ multiTimeframeMode: !layoutState.multiTimeframeMode });
  }, [layoutState.multiTimeframeMode, updateLayoutState]);

  // Get current theme configuration
  const currentTheme = ChartThemeManager.getTheme(layoutState.currentTheme);
  const currentThemeMode = currentTheme?.mode || 'dark';

  // Calculate responsive dimensions
  const getResponsiveDimensions = () => {
    const { viewport, mode, isFullscreen } = layoutState;
    
    if (isFullscreen) {
      return {
        height: viewport.height,
        width: viewport.width,
      };
    }

    let responsiveHeight = height;
    let responsiveWidth = width;

    switch (mode) {
      case 'minimal':
        responsiveHeight = Math.min(400, viewport.height * 0.6);
        break;
      case 'compact':
        responsiveHeight = Math.min(500, viewport.height * 0.7);
        break;
      case 'standard':
        responsiveHeight = height;
        break;
    }

    if (viewport.type === 'mobile') {
      responsiveWidth = viewport.width - 32; // Account for padding
      responsiveHeight = Math.min(responsiveHeight, viewport.height * 0.5);
    }

    return {
      height: responsiveHeight,
      width: responsiveWidth,
    };
  };

  const dimensions = getResponsiveDimensions();

  // Get chart configuration based on layout mode
  const getChartConfig = () => {
    const { mode, viewport } = layoutState;
    
    return {
      symbol,
      interval,
      theme: currentThemeMode,
      enableML: mode !== 'minimal' && enableML,
      enableDrawingTools: mode === 'standard' && enableDrawingTools,
      enableTechnicalIndicators: mode !== 'minimal' && enableTechnicalIndicators,
      mobileOptimized: viewport.type === 'mobile',
      height: dimensions.height,
      width: dimensions.width,
      onChartReady: handleChartReady,
      onSymbolChanged: handleSymbolChange,
      onIntervalChanged: handleIntervalChange,
    };
  };

  const chartConfig = getChartConfig();

  return (
    <div className={cn(
      'flex flex-col bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden',
      layoutState.isFullscreen && 'fixed inset-0 z-50 rounded-none border-none',
      className
    )}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-trading-text-primary">
            Advanced Chart
          </h3>
          
          {/* Viewport indicator */}
          <div className="flex items-center gap-1 text-xs text-trading-text-secondary">
            {layoutState.viewport.type === 'mobile' && <Smartphone className="w-3 h-3" />}
            {layoutState.viewport.type === 'tablet' && <Tablet className="w-3 h-3" />}
            {layoutState.viewport.type === 'desktop' && <Monitor className="w-3 h-3" />}
            <span className="capitalize">{layoutState.viewport.type}</span>
          </div>

          {/* Layout mode indicator */}
          <div className="text-xs text-trading-text-secondary">
            {layoutState.mode}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme selector */}
          {layoutState.showSettings && (
            <select
              value={layoutState.currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="px-2 py-1 bg-trading-bg-primary border border-trading-neutral-700 rounded text-xs text-trading-text-primary focus:border-trading-accent-blue focus:outline-none"
            >
              {ChartThemeManager.getAllThemes().map(theme => (
                <option key={theme.name} value={theme.name.replace(/\s+/g, '')}>
                  {theme.name}
                </option>
              ))}
            </select>
          )}

          {/* Layout mode selector */}
          {layoutState.showSettings && layoutState.viewport.type !== 'mobile' && (
            <select
              value={layoutState.mode}
              onChange={(e) => handleLayoutModeChange(e.target.value as LayoutState['mode'])}
              className="px-2 py-1 bg-trading-bg-primary border border-trading-neutral-700 rounded text-xs text-trading-text-primary focus:border-trading-accent-blue focus:outline-none"
            >
              <option value="minimal">Minimal</option>
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
            </select>
          )}

          {/* Control buttons */}
          {enableMultiTimeframe && (
            <button
              onClick={toggleMultiTimeframe}
              className={cn(
                'p-1 rounded text-trading-text-secondary hover:text-trading-text-primary transition-colors',
                layoutState.multiTimeframeMode && 'bg-trading-accent-blue/20 text-trading-accent-blue'
              )}
              title="Multi-Timeframe View"
            >
              <Clock className="w-4 h-4" />
            </button>
          )}
          
          <button
            onClick={toggleSettings}
            className={cn(
              'p-1 rounded text-trading-text-secondary hover:text-trading-text-primary transition-colors',
              layoutState.showSettings && 'bg-trading-accent-blue/20 text-trading-accent-blue'
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={toggleControls}
            className={cn(
              'p-1 rounded text-trading-text-secondary hover:text-trading-text-primary transition-colors',
              layoutState.showControls && 'bg-trading-accent-blue/20 text-trading-accent-blue'
            )}
            title="Toggle Controls"
          >
            <Monitor className="w-4 h-4" />
          </button>

          {allowFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title={layoutState.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {layoutState.isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className={cn(
        'flex flex-1 min-h-0',
        layoutState.viewport.type === 'mobile' ? 'flex-col' : 'flex-row'
      )}>
        {/* Chart area */}
        <div className="flex-1">
          {layoutState.multiTimeframeMode && enableMultiTimeframe ? (
            <MultiTimeframeChart
              {...chartConfig}
              layout={multiTimeframeLayout}
              syncCrosshair={enableSync}
              syncZoom={enableSync}
              syncSymbol={enableSync}
              allowLayoutChange={true}
              onTimeframeChange={(timeframeId, interval) => {
                console.log(`[AdvancedTradingView] Timeframe ${timeframeId} changed to ${interval}`);
                onIntervalChanged?.({ symbol, interval });
              }}
            />
          ) : (
            <TradingViewChart {...chartConfig} />
          )}
        </div>

        {/* Controls panel */}
        {layoutState.showControls && (
          <div className={cn(
            'bg-trading-bg-secondary border-trading-neutral-700',
            layoutState.viewport.type === 'mobile'
              ? 'border-t w-full max-h-48 overflow-y-auto'
              : 'border-l w-80'
          )}>
            <TradingViewControls
              widget={widget}
              symbol={symbol}
              onSymbolChange={handleSymbolChange}
              onIntervalChange={handleIntervalChange}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 bg-trading-bg-secondary border-t border-trading-neutral-700 text-xs text-trading-text-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Symbol: {symbol}</span>
            <span>Interval: {interval}</span>
            <span>Theme: {currentTheme?.name}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <span>
              {dimensions.width} × {dimensions.height}
            </span>
            <span className={cn(
              'w-2 h-2 rounded-full',
              widget ? 'bg-trading-success' : 'bg-trading-error'
            )} />
            <span>{widget ? 'Connected' : 'Loading'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}