'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3, LineChart, CandlestickChart, Settings } from 'lucide-react';
import TradingViewChart, { TradingViewMiniChart } from './TradingViewChart';
import { useWebSocket } from '../../hooks/useWebSocket';

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}

interface TradingChartProps {
  symbol: string;
  height?: number;
  showControls?: boolean;
  variant?: 'full' | 'mini' | 'compact';
  className?: string;
}

export function TradingChart({
  symbol,
  height = 500,
  showControls = true,
  variant = 'full',
  className
}: TradingChartProps) {
  const [chartStyle, setChartStyle] = useState<'candles' | 'line' | 'area' | 'bars'>('candles');
  const [interval, setInterval] = useState('1D');
  const [showStudies, setShowStudies] = useState(true);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const { subscribe, unsubscribe } = useWebSocket();

  // Subscribe to real-time quotes for the symbol
  useEffect(() => {
    const handleQuote = (quote: Quote) => {
      if (quote.symbol === symbol) {
        setCurrentQuote(quote);
      }
    };

    subscribe([symbol], ['quotes'], handleQuote);

    return () => {
      unsubscribe([symbol]);
    };
  }, [symbol, subscribe, unsubscribe]);

  const intervals = [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1H', value: '60' },
    { label: '4H', value: '240' },
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
  ];

  const chartStyles = [
    { label: 'Candles', value: 'candles', icon: CandlestickChart },
    { label: 'Line', value: 'line', icon: LineChart },
    { label: 'Area', value: 'area', icon: TrendingUp },
    { label: 'Bars', value: 'bars', icon: BarChart3 },
  ];

  const studies = showStudies ? ['RSI', 'MACD', 'Volume'] : [];

  // Format symbol for TradingView (add exchange prefix if needed)
  const formatSymbolForTradingView = (sym: string) => {
    const exchangeMap: { [key: string]: string } = {
      'AAPL': 'NASDAQ:AAPL',
      'GOOGL': 'NASDAQ:GOOGL',
      'MSFT': 'NASDAQ:MSFT',
      'AMZN': 'NASDAQ:AMZN',
      'TSLA': 'NASDAQ:TSLA',
      'META': 'NASDAQ:META',
      'NVDA': 'NASDAQ:NVDA',
      'AMD': 'NASDAQ:AMD',
      'NFLX': 'NASDAQ:NFLX',
      'CRM': 'NYSE:CRM',
      'UBER': 'NYSE:UBER',
      'COIN': 'NASDAQ:COIN',
      'SNOW': 'NYSE:SNOW',
      'ZM': 'NASDAQ:ZM',
      'PLTR': 'NYSE:PLTR',
      'SQ': 'NYSE:SQ',
    };
    
    return exchangeMap[sym] || `NASDAQ:${sym}`;
  };

  // Render mini chart variant
  if (variant === 'mini') {
    return (
      <div className="space-y-4">
        {currentQuote && (
          <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
            <div>
              <h3 className="text-lg font-semibold text-white">{symbol}</h3>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-white">
                  ${currentQuote.price.toFixed(2)}
                </span>
                <span className={`flex items-center text-sm font-medium ${
                  currentQuote.change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {currentQuote.change >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  {currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)} ({currentQuote.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        )}
        <TradingViewMiniChart
          symbol={formatSymbolForTradingView(symbol)}
          height={height}
          theme="dark"
        />
      </div>
    );
  }

  // Render compact chart variant
  if (variant === 'compact') {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-white">{symbol}</h3>
            {currentQuote && (
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold text-white">
                  ${currentQuote.price.toFixed(2)}
                </span>
                <span className={`flex items-center text-sm font-medium ${
                  currentQuote.change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {currentQuote.change >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  {currentQuote.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
        <TradingViewChart
          symbol={formatSymbolForTradingView(symbol)}
          interval={interval}
          theme="dark"
          height={height}
          style={chartStyle}
          studies={studies}
          hideTopToolbar={true}
          hideSideToolbar={true}
          showCalendar={false}
          allowSymbolChange={false}
        />
      </div>
    );
  }

  // Render full chart variant
  return (
    <div className={`bg-gray-800 rounded-lg p-6 ${className || ''}`}>
      {/* Header with real-time quote */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-white">{symbol}</h2>
          {currentQuote && (
            <div className="flex items-center space-x-3">
              <span className="text-3xl font-bold text-white">
                ${currentQuote.price.toFixed(2)}
              </span>
              <div className={`flex items-center px-3 py-1 rounded-lg ${
                currentQuote.change >= 0 
                  ? 'bg-green-900/30 text-green-400' 
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {currentQuote.change >= 0 ? <TrendingUp className="w-5 h-5 mr-2" /> : <TrendingDown className="w-5 h-5 mr-2" />}
                <span className="font-semibold">
                  {currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)} ({currentQuote.changePercent.toFixed(2)}%)
                </span>
              </div>
              <div className="text-sm text-gray-400">
                Volume: {currentQuote.volume.toLocaleString()}
              </div>
            </div>
          )}
        </div>
        
        {/* Live indicator */}
        {currentQuote && (
          <div className="flex items-center space-x-2 text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">LIVE</span>
          </div>
        )}
      </div>

      {/* Chart controls */}
      {showControls && (
        <div className="flex items-center justify-between mb-4 p-4 bg-gray-700 rounded-lg">
          {/* Time intervals */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-300 mr-3">Interval:</span>
            {intervals.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setInterval(value)}
                className={`px-3 py-1 text-sm rounded ${
                  interval === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart style controls */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-300 mr-3">Style:</span>
            {chartStyles.map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setChartStyle(value as any)}
                className={`flex items-center px-3 py-1 text-sm rounded ${
                  chartStyle === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                <Icon className="w-4 h-4 mr-1" />
                {label}
              </button>
            ))}
          </div>

          {/* Studies toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowStudies(!showStudies)}
              className={`flex items-center px-3 py-1 text-sm rounded ${
                showStudies
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              <Settings className="w-4 h-4 mr-1" />
              Indicators
            </button>
          </div>
        </div>
      )}

      {/* TradingView Chart */}
      <TradingViewChart
        symbol={formatSymbolForTradingView(symbol)}
        interval={interval}
        theme="dark"
        height={height}
        style={chartStyle}
        studies={studies}
        showCalendar={true}
        allowSymbolChange={true}
        hideTopToolbar={false}
        hideSideToolbar={false}
        range="12M"
      />

      {/* Chart info footer */}
      <div className="flex items-center justify-between mt-4 p-3 bg-gray-700 rounded-lg text-sm">
        <div className="flex items-center space-x-4 text-gray-300">
          <span>📊 Professional Trading Charts by TradingView</span>
          <span>•</span>
          <span>Real-time data integration</span>
          <span>•</span>
          <span>Advanced technical analysis</span>
        </div>
        {currentQuote && (
          <div className="text-gray-400">
            Last updated: {new Date(currentQuote.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}