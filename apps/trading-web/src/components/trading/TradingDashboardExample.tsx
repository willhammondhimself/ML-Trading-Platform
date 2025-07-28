'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AdvancedTradingView } from './AdvancedTradingView';
import { PriceGrid } from './price-grid';
import { OrderBook } from './OrderBook';
import { Portfolio } from './Portfolio';
import { Activity, BarChart3, DollarSign, TrendingUp } from 'lucide-react';

interface TradingDashboardExampleProps {
  className?: string;
}

export function TradingDashboardExample({ className }: TradingDashboardExampleProps) {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedInterval, setSelectedInterval] = useState('15');
  const [viewMode, setViewMode] = useState<'single' | 'multi'>('single');

  const handleSymbolChange = (params: { symbol: string; interval: string }) => {
    setSelectedSymbol(params.symbol);
    setSelectedInterval(params.interval);
  };

  const handleIntervalChange = (params: { symbol: string; interval: string }) => {
    setSelectedInterval(params.interval);
  };

  return (
    <div className={cn('h-screen bg-trading-bg-primary text-trading-text-primary overflow-hidden', className)}>
      {/* Header */}
      <div className="h-16 bg-trading-bg-secondary border-b border-trading-neutral-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">ML Trading Platform</h1>
          <div className="flex items-center gap-2 text-sm text-trading-text-secondary">
            <span>Symbol: {selectedSymbol}</span>
            <span>•</span>
            <span>Interval: {selectedInterval}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('single')}
            className={cn(
              'px-3 py-1 text-sm rounded transition-colors',
              viewMode === 'single'
                ? 'bg-trading-accent-blue text-white'
                : 'bg-trading-bg-primary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            Single Chart
          </button>
          <button
            onClick={() => setViewMode('multi')}
            className={cn(
              'px-3 py-1 text-sm rounded transition-colors',
              viewMode === 'multi'
                ? 'bg-trading-accent-blue text-white'
                : 'bg-trading-bg-primary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            Multi-Timeframe
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar */}
        <div className="w-80 bg-trading-bg-secondary border-r border-trading-neutral-700 flex flex-col">
          {/* Price Grid */}
          <div className="flex-1">
            <div className="p-4 border-b border-trading-neutral-700">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Live Prices
              </h3>
            </div>
            <PriceGrid
              symbols={['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD']}
              onSymbolSelect={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
              className="h-64"
            />
          </div>

          {/* Order Book */}
          <div className="flex-1">
            <div className="p-4 border-b border-trading-neutral-700">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Order Book
              </h3>
            </div>
            <OrderBook
              symbol={selectedSymbol}
              maxLevels={10}
              className="h-64"
            />
          </div>

          {/* Portfolio */}
          <div className="flex-1">
            <div className="p-4 border-b border-trading-neutral-700">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Portfolio
              </h3>
            </div>
            <Portfolio
              positions={[
                { symbol: 'AAPL', quantity: 100, avgPrice: 150.00 },
                { symbol: 'GOOGL', quantity: 50, avgPrice: 2800.00 },
                { symbol: 'MSFT', quantity: 75, avgPrice: 300.00 },
              ]}
              className="h-48"
            />
          </div>
        </div>

        {/* Main Chart Area */}
        <div className="flex-1 p-4">
          <div className="h-full">
            <AdvancedTradingView
              symbol={selectedSymbol}
              interval={selectedInterval}
              theme="dark"
              enableML={true}
              enableDrawingTools={true}
              enableTechnicalIndicators={true}
              enableMultiTimeframe={true}
              multiTimeframeLayout={viewMode === 'multi' ? 'grid' : 'grid'}
              enableSync={true}
              showControls={true}
              allowFullscreen={true}
              mobileOptimized={false}
              height={600}
              onSymbolChanged={handleSymbolChange}
              onIntervalChanged={handleIntervalChange}
              className="h-full"
            />
          </div>
        </div>

        {/* Right Sidebar - Trading Panel */}
        <div className="w-64 bg-trading-bg-secondary border-l border-trading-neutral-700">
          <div className="p-4 border-b border-trading-neutral-700">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trading Panel
            </h3>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-trading-bg-primary p-3 rounded">
                <div className="text-xs text-trading-text-secondary">Market Cap</div>
                <div className="text-lg font-medium">$2.85T</div>
              </div>
              
              <div className="bg-trading-bg-primary p-3 rounded">
                <div className="text-xs text-trading-text-secondary">P/E Ratio</div>
                <div className="text-lg font-medium">28.42</div>
              </div>
              
              <div className="bg-trading-bg-primary p-3 rounded">
                <div className="text-xs text-trading-text-secondary">52W High</div>
                <div className="text-lg font-medium">$198.23</div>
              </div>
              
              <div className="bg-trading-bg-primary p-3 rounded">
                <div className="text-xs text-trading-text-secondary">52W Low</div>
                <div className="text-lg font-medium">$124.17</div>
              </div>
            </div>

            {/* Buy/Sell Buttons */}
            <div className="space-y-2 pt-4 border-t border-trading-neutral-700">
              <button className="w-full py-2 bg-trading-success text-white rounded hover:bg-trading-success/90 transition-colors">
                Buy {selectedSymbol}
              </button>
              <button className="w-full py-2 bg-trading-error text-white rounded hover:bg-trading-error/90 transition-colors">
                Sell {selectedSymbol}
              </button>
            </div>

            {/* ML Predictions */}
            <div className="pt-4 border-t border-trading-neutral-700">
              <h4 className="text-xs font-medium text-trading-text-secondary mb-2">ML Predictions</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>1H Target:</span>
                  <span className="text-trading-success">$152.45 ↗</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>4H Target:</span>
                  <span className="text-trading-success">$155.20 ↗</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>1D Target:</span>
                  <span className="text-trading-error">$148.80 ↘</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Confidence:</span>
                  <span>78.5%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}