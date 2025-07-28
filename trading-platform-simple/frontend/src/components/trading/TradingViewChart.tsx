'use client';

import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  interval?: string;
  theme?: 'light' | 'dark';
  height?: number;
  width?: number;
  style?: 'bars' | 'candles' | 'line' | 'area';
  timezone?: string;
  locale?: string;
  autosize?: boolean;
  studies?: string[];
  showPopupButton?: boolean;
  showCalendar?: boolean;
  allowSymbolChange?: boolean;
  hideTopToolbar?: boolean;
  hideSideToolbar?: boolean;
  hideBottomToolbar?: boolean;
  range?: string;
  hotlist?: boolean;
  calendar?: boolean;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol = 'NASDAQ:AAPL',
  interval = '1D',
  theme = 'dark',
  height = 500,
  width = 800,
  style = 'candles',
  timezone = 'America/New_York',
  locale = 'en',
  autosize = true,
  studies = ['RSI', 'MACD'],
  showPopupButton = false,
  showCalendar = true,
  allowSymbolChange = true,
  hideTopToolbar = false,
  hideSideToolbar = false,
  hideBottomToolbar = false,
  range = '12M',
  hotlist = false,
  calendar = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadTradingViewScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.TradingView) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load TradingView script'));
        document.head.appendChild(script);
      });
    };

    const initializeTradingView = () => {
      if (!containerRef.current) return;

      // Clear the container first
      containerRef.current.innerHTML = '';

      const config = {
        autosize: autosize,
        symbol: symbol,
        interval: interval,
        timezone: timezone,
        theme: theme,
        style: getStyleNumber(style),
        locale: locale,
        toolbar_bg: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        enable_publishing: false,
        withdateranges: true,
        range: range,
        hide_side_toolbar: hideSideToolbar,
        hide_top_toolbar: hideTopToolbar,
        hide_legend: false,
        save_image: false,
        calendar: calendar,
        hotlist: hotlist,
        details: true,
        news: ['headlines'],
        studies: studies,
        show_popup_button: showPopupButton,
        popup_width: '1000',
        popup_height: '650',
        container_id: containerRef.current.id,
        ...(autosize ? {} : { width, height }),
      };

      // Create script element with configuration
      const widgetScript = document.createElement('script');
      widgetScript.type = 'text/javascript';
      widgetScript.innerHTML = `
        new TradingView.widget(${JSON.stringify(config)});
      `;

      containerRef.current.appendChild(widgetScript);
    };

    // Load script and initialize widget
    loadTradingViewScript()
      .then(() => {
        // Small delay to ensure TradingView is fully loaded
        setTimeout(initializeTradingView, 100);
      })
      .catch((error) => {
        console.error('Error loading TradingView:', error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class=\"flex items-center justify-center h-full bg-gray-800 text-white rounded-lg\">
              <div class=\"text-center\">
                <div class=\"text-xl mb-2\">📊</div>
                <div class=\"text-lg font-semibold mb-1\">Chart Loading Error</div>
                <div class=\"text-sm text-gray-400\">Unable to load TradingView charts</div>
                <div class=\"text-xs text-gray-500 mt-2\">Check your internet connection</div>
              </div>
            </div>
          `;
        }
      });

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, interval, theme, style, studies, range]);

  const getStyleNumber = (styleString: string): number => {
    const styleMap: { [key: string]: number } = {
      bars: 0,
      candles: 1,
      line: 2,
      area: 3,
    };
    return styleMap[styleString] || 1;
  };

  const containerStyle = autosize
    ? { height: height }
    : { width: width, height: height };

  return (
    <div className=\"relative w-full rounded-lg overflow-hidden border border-gray-700\">
      <div
        ref={containerRef}
        id={`tradingview-chart-${Math.random().toString(36).substr(2, 9)}`}
        style={containerStyle}
        className=\"min-h-[400px] bg-gray-900\"
      />
      
      {/* Loading state */}
      <div className=\"absolute inset-0 flex items-center justify-center bg-gray-900 animate-pulse\" 
           style={{ display: 'none' }}>
        <div className=\"text-center text-white\">
          <div className=\"text-3xl mb-4\">📈</div>
          <div className=\"text-lg font-semibold\">Loading Chart...</div>
          <div className=\"text-sm text-gray-400 mt-2\">{symbol}</div>
        </div>
      </div>
    </div>
  );
};

// Lightweight chart component for smaller spaces
export const TradingViewMiniChart: React.FC<{
  symbol: string;
  height?: number;
  theme?: 'light' | 'dark';
}> = ({ symbol, height = 300, theme = 'dark' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: symbol,
      width: '100%',
      height: height,
      locale: 'en',
      dateRange: '12M',
      colorTheme: theme,
      isTransparent: false,
      autosize: true,
      largeChartUrl: '',
    });

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, height, theme]);

  return (
    <div className=\"w-full rounded-lg overflow-hidden border border-gray-700\">
      <div
        ref={containerRef}
        className=\"tradingview-widget-container\"
        style={{ height: height }}
      />
    </div>
  );
};

// Symbol overview widget
export const TradingViewSymbolOverview: React.FC<{
  symbols: string[];
  theme?: 'light' | 'dark';
}> = ({ symbols, theme = 'dark' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: symbols.map(symbol => [symbol, `${symbol}|1D`]),
      chartOnly: false,
      width: '100%',
      height: '400',
      locale: 'en',
      colorTheme: theme,
      autosize: true,
      showVolume: false,
      showMA: false,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: 'right',
      scaleMode: 'Normal',
      fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
      fontSize: '10',
      noTimeScale: false,
      valuesTracking: '1',
      changeMode: 'price-and-percent',
      chartType: 'area',
    });

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbols, theme]);

  return (
    <div className=\"w-full rounded-lg overflow-hidden border border-gray-700\">
      <div
        ref={containerRef}
        className=\"tradingview-widget-container\"
      />
    </div>
  );
};

export default memo(TradingViewChart);