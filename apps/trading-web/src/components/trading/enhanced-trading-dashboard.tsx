'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { TradingHeader } from './header';
import { TradingSidebar } from './sidebar';
import { TradingChart } from './chart';
import { OrderPanel } from './order-panel';
import { PortfolioSummary } from './portfolio-summary';
import { MarketDataFeed } from './market-data-feed';
import { MLPredictions } from './ml-predictions';
import { RiskMonitor } from './risk-monitor';
import { TradeHistory } from './trade-history';
import { AlertsPanel } from './alerts-panel';
import { PriceGrid } from './price-grid';
import { EnhancedOrderBook } from './enhanced-order-book';
import { useMarketDataWebSocket, useWebSocketPerformance } from '@/hooks/use-websocket';
import { TradingDashboardProps } from '@/types/trading';

// Default symbols for demo purposes
const DEFAULT_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 
  'NFLX', 'SPOTIFY', 'UBER', 'AIRBNB', 'COINBASE', 'SNOWFLAKE',
  'ZOOM', 'SLACK', 'DOCUSIGN', 'PELOTON', 'ROKU', 'SQUARE'
];

function LoadingFallback({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full bg-trading-bg-primary border border-trading-neutral-700 rounded">
      <div className="text-center">
        <div className="w-6 h-6 mx-auto mb-2 border-2 border-trading-accent-blue border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-trading-text-secondary">Loading {name}...</div>
      </div>
    </div>
  );
}

function PerformanceIndicator() {
  const metrics = useWebSocketPerformance();
  
  if (!metrics.messagesPerSecond) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-trading-bg-secondary border border-trading-neutral-700 rounded px-3 py-2">
      <div className="text-xs text-trading-text-secondary">
        Performance: {Math.round(metrics.messagesPerSecond)}/s | {Math.round(metrics.averageLatency)}ms
      </div>
    </div>
  );
}

export function EnhancedTradingDashboard({
  className,
  symbols = DEFAULT_SYMBOLS,
  defaultSymbol = 'AAPL',
  layout = 'standard',
  enableML = true,
  enableRealTime = true,
}: TradingDashboardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(defaultSymbol);
  const [showPriceGrid, setShowPriceGrid] = useState(true);
  const [showPerformanceMetrics, setShowPerformanceMetrics] = useState(false);

  // Initialize WebSocket connections for real-time data
  const { status: wsStatus } = useMarketDataWebSocket(enableRealTime ? symbols : []);

  // Handle symbol selection from any component
  useEffect(() => {
    const handleSymbolSelected = (event: CustomEvent) => {
      setSelectedSymbol(event.detail.symbol);
    };

    window.addEventListener('symbol-selected', handleSymbolSelected as EventListener);
    return () => {
      window.removeEventListener('symbol-selected', handleSymbolSelected as EventListener);
    };
  }, []);

  const handleTogglePriceGrid = useCallback(() => {
    setShowPriceGrid(prev => !prev);
  }, []);

  const handleTogglePerformanceMetrics = useCallback(() => {
    setShowPerformanceMetrics(prev => !prev);
  }, []);

  // Responsive layout adjustments
  const layoutClasses = {
    standard: 'h-screen flex flex-col',
    compact: 'h-screen flex flex-col text-sm',
    mobile: 'min-h-screen flex flex-col',
  };

  return (
    <div className={cn('bg-trading-bg-primary', layoutClasses[layout], className)}>
      {/* Performance indicator */}
      {showPerformanceMetrics && <PerformanceIndicator />}

      {/* Header */}
      <TradingHeader />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar with enhanced price grid */}
        <div className={cn(
          'flex flex-col border-r border-trading-neutral-700 bg-trading-bg-secondary',
          layout === 'mobile' ? 'w-full' : 'w-80'
        )}>
          {/* Toggle controls */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-trading-neutral-700">
            <h2 className="text-sm font-medium text-trading-text-primary">Market Data</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePriceGrid}
                className={cn(
                  'text-xs px-2 py-1 rounded transition-colors',
                  showPriceGrid 
                    ? 'bg-trading-accent-blue text-white' 
                    : 'bg-trading-neutral-800 text-trading-text-secondary hover:text-trading-text-primary'
                )}
              >
                Grid
              </button>
              <button
                onClick={handleTogglePerformanceMetrics}
                className={cn(
                  'text-xs px-2 py-1 rounded transition-colors',
                  showPerformanceMetrics 
                    ? 'bg-trading-accent-blue text-white' 
                    : 'bg-trading-neutral-800 text-trading-text-secondary hover:text-trading-text-primary'
                )}
              >
                Perf
              </button>
              <div className={cn(
                'w-2 h-2 rounded-full',
                wsStatus === 'connected' ? 'bg-trading-success' : 'bg-trading-error'
              )} />
            </div>
          </div>

          {/* Price Grid */}
          {showPriceGrid ? (
            <div className="flex-1 p-3">
              <Suspense fallback={<LoadingFallback name="Price Grid" />}>
                <PriceGrid
                  symbols={symbols}
                  maxRows={50}
                  enableVirtualScrolling={true}
                  updateRate={16}
                />
              </Suspense>
            </div>
          ) : (
            <div className="flex-1">
              <TradingSidebar />
            </div>
          )}
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Section - Portfolio Summary & Market Data */}
          <div className={cn(
            'flex border-b border-trading-neutral-700',
            layout === 'compact' ? 'h-32' : 'h-48'
          )}>
            <div className="flex-1 p-4">
              <Suspense fallback={<LoadingFallback name="Portfolio Summary" />}>
                <PortfolioSummary />
              </Suspense>
            </div>
            <div className={cn(
              'border-l border-trading-neutral-700 p-4',
              layout === 'mobile' ? 'hidden' : 'w-80'
            )}>
              <Suspense fallback={<LoadingFallback name="Market Data Feed" />}>
                <MarketDataFeed />
              </Suspense>
            </div>
          </div>

          {/* Middle Section - Chart & ML Predictions */}
          <div className="flex-1 flex">
            <div className="flex-1 p-4">
              <Suspense fallback={<LoadingFallback name="Trading Chart" />}>
                <TradingChart />
              </Suspense>
            </div>
            {enableML && (
              <div className={cn(
                'border-l border-trading-neutral-700 p-4',
                layout === 'mobile' ? 'hidden' : 'w-80'
              )}>
                <Suspense fallback={<LoadingFallback name="ML Predictions" />}>
                  <MLPredictions />
                </Suspense>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel with Enhanced Order Book */}
        <div className={cn(
          'flex flex-col border-l border-trading-neutral-700 bg-trading-bg-secondary',
          layout === 'mobile' ? 'hidden' : 'w-96'
        )}>
          {/* Order Panel */}
          <div className={cn(
            'border-b border-trading-neutral-700 p-4',
            layout === 'compact' ? 'h-80' : 'h-96'
          )}>
            <Suspense fallback={<LoadingFallback name="Order Panel" />}>
              <OrderPanel />
            </Suspense>
          </div>

          {/* Enhanced Order Book */}
          <div className={cn(
            'border-b border-trading-neutral-700 p-4',
            layout === 'compact' ? 'h-64' : 'h-80'
          )}>
            <Suspense fallback={<LoadingFallback name="Order Book" />}>
              <EnhancedOrderBook
                symbol={selectedSymbol}
                levels={15}
                enableMarketDepth={true}
                enableVolumeProfile={false}
              />
            </Suspense>
          </div>

          {/* Bottom Tabs */}
          <div className="flex-1 flex flex-col">
            <TradingTabs selectedSymbol={selectedSymbol} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TradingTabs({ selectedSymbol }: { selectedSymbol: string }) {
  const [activeTab, setActiveTab] = React.useState<'trades' | 'risk' | 'alerts'>('trades');

  const tabs = [
    { 
      id: 'trades' as const, 
      label: 'Trades', 
      component: () => <TradeHistory symbol={selectedSymbol} />
    },
    { 
      id: 'risk' as const, 
      label: 'Risk', 
      component: () => <RiskMonitor symbol={selectedSymbol} />
    },
    { 
      id: 'alerts' as const, 
      label: 'Alerts', 
      component: () => <AlertsPanel symbol={selectedSymbol} />
    },
  ];

  return (
    <>
      {/* Tab Navigation */}
      <div className="flex border-b border-trading-neutral-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-trading-accent-blue border-b-2 border-trading-accent-blue bg-trading-neutral-800'
                : 'text-trading-text-secondary hover:text-trading-text-primary hover:bg-trading-neutral-800/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        <Suspense fallback={<LoadingFallback name={`${activeTab} data`} />}>
          {tabs.map((tab) => {
            if (tab.id === activeTab) {
              const Component = tab.component;
              return <Component key={tab.id} />;
            }
            return null;
          })}
        </Suspense>
      </div>
    </>
  );
}

// Export both versions for flexibility
export { TradingDashboard } from './dashboard';
export default EnhancedTradingDashboard;