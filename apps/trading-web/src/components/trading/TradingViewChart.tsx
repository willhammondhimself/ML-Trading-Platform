'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  TradingViewChartProps, 
  TradingViewWidget, 
  ChartingLibraryWidgetOptions,
  TradingViewError 
} from '@/types/tradingview';
import { CustomDatafeed } from '@/utils/tradingview/CustomDatafeed';

// TradingView library globals
declare global {
  interface Window {
    TradingView: {
      widget: new (config: ChartingLibraryWidgetOptions) => TradingViewWidget;
      version: () => string;
    };
  }
}

const DEFAULT_LIBRARY_PATH = '/static/charting_library/';
const DEFAULT_CHARTS_STORAGE_URL = 'https://saveload.tradingview.com';
const DEFAULT_CHARTS_STORAGE_API_VERSION = '1.1';

interface TradingViewChartState {
  isLoading: boolean;
  isReady: boolean;
  error: TradingViewError | null;
  widget: TradingViewWidget | null;
}

export function TradingViewChart({
  symbol = 'AAPL',
  interval = '15',
  theme = 'dark',
  enableML = true,
  enableDrawingTools = true,
  enableTechnicalIndicators = true,
  mobileOptimized = true,
  height = 600,
  width,
  className,
  onChartReady,
  onSymbolChanged,
  onIntervalChanged,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TradingViewChartState>({
    isLoading: true,
    isReady: false,
    error: null,
    widget: null,
  });

  // Create custom datafeed instance
  const datafeedRef = useRef<CustomDatafeed>();
  
  useEffect(() => {
    if (!datafeedRef.current) {
      datafeedRef.current = new CustomDatafeed();
    }
  }, []);

  const updateState = useCallback((updates: Partial<TradingViewChartState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleError = useCallback((error: string | Error, component: string) => {
    const tradingViewError: TradingViewError = {
      code: 'CHART_ERROR',
      message: error instanceof Error ? error.message : error,
      timestamp: Date.now(),
      component: component as any,
    };
    
    console.error('[TradingViewChart] Error:', tradingViewError);
    updateState({ error: tradingViewError, isLoading: false });
  }, [updateState]);

  const loadTradingViewScript = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if TradingView is already loaded
      if (window.TradingView && window.TradingView.widget) {
        resolve();
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.src = `${DEFAULT_LIBRARY_PATH}charting_library.js`;
      script.async = true;
      script.onload = () => {
        if (window.TradingView && window.TradingView.widget) {
          console.log('[TradingViewChart] Library loaded successfully');
          resolve();
        } else {
          reject(new Error('TradingView library failed to initialize'));
        }
      };
      script.onerror = () => {
        reject(new Error('Failed to load TradingView library'));
      };

      document.head.appendChild(script);
    });
  }, []);

  const getWidgetConfig = useCallback((): ChartingLibraryWidgetOptions => {
    if (!chartContainerRef.current || !datafeedRef.current) {
      throw new Error('Chart container or datafeed not ready');
    }

    // Base configuration
    const config: ChartingLibraryWidgetOptions = {
      symbol,
      datafeed: datafeedRef.current,
      interval: interval as any,
      container: chartContainerRef.current,
      library_path: DEFAULT_LIBRARY_PATH,
      locale: 'en',
      theme: theme === 'dark' ? 'Dark' : 'Light',
      fullscreen: false,
      autosize: true,
      debug: process.env.NODE_ENV === 'development',

      // Features to disable for cleaner interface
      disabled_features: [
        'header_symbol_search',
        'header_compare',
        'header_screenshot',
        'header_chart_type',
        'header_settings',
        'header_indicators',
        'header_fullscreen_button',
        'left_toolbar',
        'control_bar',
        'timeframes_toolbar',
        ...(mobileOptimized ? [
          'header_widget',
          'legend_widget',
          'context_menus',
        ] : []),
        ...(!enableDrawingTools ? [
          'header_drawing_toolbar',
          'drawing_templates',
        ] : []),
      ],

      // Features to enable
      enabled_features: [
        'study_templates',
        'side_toolbar_in_fullscreen_mode',
        'header_in_fullscreen_mode',
        'remove_library_container_border',
        'chart_property_page_style',
        ...(enableTechnicalIndicators ? [
          'study_dialog_search_control',
          'studies_symbol_search',
        ] : []),
        ...(mobileOptimized ? [
          'touch_gestures',
          'dont_show_boolean_study_arguments',
          'hide_last_na_study_output',
        ] : []),
      ],

      // Charts storage (optional - can be removed for standalone usage)
      charts_storage_url: DEFAULT_CHARTS_STORAGE_URL,
      charts_storage_api_version: DEFAULT_CHARTS_STORAGE_API_VERSION,
      client_id: 'ml-trading-platform',
      user_id: 'public_user',

      // Timezone
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

      // Loading screen customization
      loading_screen: {
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        foregroundColor: theme === 'dark' ? '#ffffff' : '#000000',
      },

      // Override default styles to match our trading theme
      overrides: theme === 'dark' ? {
        // Dark theme overrides
        'paneProperties.background': '#0a0b0d',
        'paneProperties.vertGridProperties.color': '#1e293b',
        'paneProperties.horzGridProperties.color': '#1e293b',
        'paneProperties.crossHairProperties.color': '#64748b',
        'mainSeriesProperties.candleStyle.upColor': '#10b981',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.drawWick': true,
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        'scalesProperties.textColor': '#94a3b8',
        'scalesProperties.backgroundColor': '#0f172a',
        'scalesProperties.lineColor': '#1e293b',
      } : {
        // Light theme overrides
        'paneProperties.background': '#ffffff',
        'paneProperties.vertGridProperties.color': '#e2e8f0',
        'paneProperties.horzGridProperties.color': '#e2e8f0',
        'paneProperties.crossHairProperties.color': '#64748b',
        'mainSeriesProperties.candleStyle.upColor': '#10b981',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.drawWick': true,
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        'scalesProperties.textColor': '#1e293b',
        'scalesProperties.backgroundColor': '#f8fafc',
        'scalesProperties.lineColor': '#e2e8f0',
      },

      // Studies overrides for technical indicators
      studies_overrides: {
        'volume.volume.color.0': '#ef4444',
        'volume.volume.color.1': '#10b981',
        'volume.volume.transparency': 65,
        'bollinger bands.median.color': '#3b82f6',
        'bollinger bands.upper.color': '#8b5cf6',
        'bollinger bands.lower.color': '#8b5cf6',
        'bollinger bands.fill.transparency': 95,
        'MACD.macd.color': '#3b82f6',
        'MACD.signal.color': '#f59e0b',
        'MACD.histogram.color': '#6b7280',
        'RSI.plot.color': '#8b5cf6',
        'RSI.hlines.color': '#6b7280',
        'EMA.plot.color': '#10b981',
        'EMA.plot.linewidth': 2,
      },

      // Additional settings for better UX
      withdateranges: true,
      hide_side_toolbar: mobileOptimized,
      allow_symbol_change: true,
      save_image: false,
      study_count_limit: enableTechnicalIndicators ? 20 : 0,
      
      // Time frames
      time_frames: [
        { text: '5Y', resolution: '1W', description: '5 Years' },
        { text: '1Y', resolution: '1D', description: '1 Year' },
        { text: '6M', resolution: '1D', description: '6 Months' },
        { text: '3M', resolution: '1D', description: '3 Months' },
        { text: '1M', resolution: '1D', description: '1 Month' },
        { text: '5D', resolution: '60', description: '5 Days' },
        { text: '1D', resolution: '15', description: '1 Day' },
      ],
    };

    return config;
  }, [
    symbol,
    interval,
    theme,
    enableDrawingTools,
    enableTechnicalIndicators,
    mobileOptimized,
  ]);

  const initializeWidget = useCallback(async () => {
    try {
      updateState({ isLoading: true, error: null });

      // Load TradingView library
      await loadTradingViewScript();

      // Get widget configuration
      const config = getWidgetConfig();

      // Create widget instance
      const widget = new window.TradingView.widget(config);

      // Set up event handlers
      widget.onChartReady(() => {
        console.log('[TradingViewChart] Chart ready');
        
        updateState({ 
          isLoading: false, 
          isReady: true, 
          widget,
        });

        // Add default technical indicators if enabled
        if (enableTechnicalIndicators) {
          setTimeout(() => {
            try {
              const chart = widget.activeChart();
              
              // Add Volume indicator
              chart.createStudy('Volume', false, false);
              
              // Add EMA indicators
              chart.createStudy('Exponential Moving Average', false, false, [9]);
              chart.createStudy('Exponential Moving Average', false, false, [21]);
              chart.createStudy('Exponential Moving Average', false, false, [50]);
              
            } catch (error) {
              console.warn('[TradingViewChart] Failed to add default indicators:', error);
            }
          }, 1000);
        }

        // Call user callback
        if (onChartReady) {
          onChartReady(widget);
        }
      });

      // Subscribe to symbol changes
      widget.subscribe('onSymbolChanged', () => {
        const currentSymbol = widget.activeChart().symbol();
        console.log('[TradingViewChart] Symbol changed to:', currentSymbol);
        
        if (onSymbolChanged) {
          onSymbolChanged({
            symbol: currentSymbol,
            interval: widget.activeChart().resolution(),
          });
        }
      });

      // Subscribe to interval changes
      widget.subscribe('onIntervalChanged', () => {
        const currentInterval = widget.activeChart().resolution();
        console.log('[TradingViewChart] Interval changed to:', currentInterval);
        
        if (onIntervalChanged) {
          onIntervalChanged({
            symbol: widget.activeChart().symbol(),
            interval: currentInterval,
          });
        }
      });

    } catch (error) {
      handleError(error as Error, 'chart');
    }
  }, [
    loadTradingViewScript,
    getWidgetConfig,
    enableTechnicalIndicators,
    onChartReady,
    onSymbolChanged,
    onIntervalChanged,
    updateState,
    handleError,
  ]);

  // Initialize chart on mount
  useEffect(() => {
    if (chartContainerRef.current && !state.widget) {
      initializeWidget();
    }

    // Cleanup on unmount
    return () => {
      if (state.widget) {
        try {
          state.widget.remove();
        } catch (error) {
          console.warn('[TradingViewChart] Error during cleanup:', error);
        }
      }
    };
  }, []); // Only run on mount

  // Handle symbol/interval changes
  useEffect(() => {
    if (state.widget && state.isReady) {
      try {
        state.widget.setSymbol(symbol, interval);
      } catch (error) {
        console.warn('[TradingViewChart] Error changing symbol/interval:', error);
      }
    }
  }, [symbol, interval, state.widget, state.isReady]);

  // Handle theme changes
  useEffect(() => {
    if (state.widget && state.isReady) {
      // Theme changes require widget recreation
      // This is a limitation of TradingView library
      console.log('[TradingViewChart] Theme changed, recreating widget...');
      
      setState(prev => ({ ...prev, widget: null, isReady: false }));
      
      setTimeout(() => {
        initializeWidget();
      }, 100);
    }
  }, [theme]);

  if (state.error) {
    return (
      <div 
        className={cn(
          'flex flex-col items-center justify-center bg-trading-bg-primary border border-trading-neutral-700 rounded',
          className
        )}
        style={{ height, width }}
      >
        <div className="text-center p-6">
          <div className="text-trading-error text-lg font-medium mb-2">
            Chart Error
          </div>
          <div className="text-trading-text-secondary text-sm mb-4">
            {state.error.message}
          </div>
          <button
            onClick={() => {
              setState(prev => ({ ...prev, error: null, widget: null, isReady: false }));
              initializeWidget();
            }}
            className="px-4 py-2 bg-trading-accent-blue text-white rounded hover:bg-trading-accent-blue/80 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        'relative bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden',
        className
      )}
      style={{ height, width }}
    >
      {/* Loading overlay */}
      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-trading-bg-primary z-10">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-trading-accent-blue border-t-transparent rounded-full animate-spin" />
            <div className="text-trading-text-secondary text-sm">
              Loading chart...
            </div>
          </div>
        </div>
      )}

      {/* Chart container */}
      <div
        ref={chartContainerRef}
        className="w-full h-full"
        style={{ 
          minHeight: height,
          visibility: state.isLoading ? 'hidden' : 'visible',
        }}
      />

      {/* ML predictions overlay placeholder */}
      {enableML && state.isReady && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-trading-bg-secondary/90 backdrop-blur-sm border border-trading-neutral-700 rounded px-3 py-2">
            <div className="text-xs text-trading-text-secondary">
              ML Predictions
            </div>
            <div className="text-sm text-trading-accent-blue font-medium">
              Coming Soon
            </div>
          </div>
        </div>
      )}
    </div>
  );
}