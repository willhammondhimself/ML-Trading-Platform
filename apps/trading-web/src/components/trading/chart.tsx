'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

interface TradingChartProps {
  className?: string;
}

export function TradingChart({ className }: TradingChartProps) {
  const [selectedSymbol, setSelectedSymbol] = React.useState('AAPL');
  const [timeframe, setTimeframe] = React.useState('1D');
  const [chartType, setChartType] = React.useState('candlestick');

  const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M'];
  const chartTypes = [
    { id: 'candlestick', label: 'Candlestick', icon: BarChart3 },
    { id: 'line', label: 'Line', icon: TrendingUp },
    { id: 'area', label: 'Area', icon: Activity },
  ];

  return (
    <div className={cn('flex flex-col h-full bg-trading-bg-tertiary rounded-lg', className)}>
      {/* Chart Header */}
      <div className="flex items-center justify-between p-4 border-b border-trading-neutral-700">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-trading-text-primary">{selectedSymbol}</h3>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-mono text-trading-text-primary">$178.25</span>
            <div className="flex items-center space-x-1 text-trading-success-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">+2.15 (+1.22%)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Chart Type Selector */}
          <div className="flex items-center space-x-1 bg-trading-bg-secondary rounded-lg p-1">
            {chartTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setChartType(type.id)}
                  className={cn(
                    'flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    chartType === type.id
                      ? 'bg-trading-accent-blue text-white'
                      : 'text-trading-text-secondary hover:text-trading-text-primary hover:bg-trading-neutral-700'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center space-x-1 bg-trading-bg-secondary rounded-lg p-1">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  timeframe === tf
                    ? 'bg-trading-accent-blue text-white'
                    : 'text-trading-text-secondary hover:text-trading-text-primary hover:bg-trading-neutral-700'
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 p-4">
        <div className="w-full h-full bg-trading-bg-primary rounded-lg border border-trading-neutral-700 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="h-16 w-16 text-trading-text-muted mx-auto mb-4" />
            <h4 className="text-lg font-medium text-trading-text-primary mb-2">TradingView Chart</h4>
            <p className="text-trading-text-muted max-w-md">
              Professional charting powered by TradingView will be integrated here with real-time market data, 
              technical indicators, and drawing tools.
            </p>
          </div>
        </div>
      </div>

      {/* Chart Footer - Quick Stats */}
      <div className="p-4 border-t border-trading-neutral-700">
        <div className="grid grid-cols-4 gap-4">
          <QuickStat label="Volume" value="45.2M" />
          <QuickStat label="Market Cap" value="$2.78T" />
          <QuickStat label="P/E Ratio" value="28.45" />
          <QuickStat label="52W High" value="$198.23" />
        </div>
      </div>
    </div>
  );
}

interface QuickStatProps {
  label: string;
  value: string;
}

function QuickStat({ label, value }: QuickStatProps) {
  return (
    <div className="text-center">
      <div className="text-xs text-trading-text-muted">{label}</div>
      <div className="text-sm font-mono text-trading-text-primary">{value}</div>
    </div>
  );
}