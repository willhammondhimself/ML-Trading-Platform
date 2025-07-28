'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { TradingHeader } from './TradingHeader';
import { TradingChart } from './TradingChart';
import { OrderPanel } from './OrderPanel';
import { PortfolioSummary } from './PortfolioSummary';
import { PriceGrid } from './PriceGrid';
import { OrderBook } from './OrderBook';
import { SentimentAnalysis } from '../sentiment/SentimentAnalysis';
import { MLPredictions } from './MLPredictions';
import { TradeHistory } from './TradeHistory';
import { AlertsPanel } from './AlertsPanel';
import { PerformanceDashboard } from './PerformanceDashboard';
import { BacktestingDashboard } from './BacktestingDashboard';
import { AdvancedMLDashboard } from './AdvancedMLDashboard';
import { RiskManagementDashboard } from './RiskManagementDashboard';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TradingDashboardProps } from '@/types/trading';

// Default symbols for demo
const DEFAULT_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 
  'NFLX', 'CRM', 'UBER', 'COIN', 'SNOW', 'ZM', 'PLTR', 'SQ'
];

function PerformanceIndicator() {
  const { metrics } = useWebSocket();
  
  if (!metrics.messagesPerSecond) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-trading-bg-secondary/90 border border-trading-neutral-700 rounded-lg px-3 py-2 backdrop-blur-sm">
      <div className="text-xs text-trading-text-secondary flex items-center gap-2">
        <div className="w-2 h-2 bg-trading-success rounded-full animate-pulse"></div>
        <span>
          {Math.round(metrics.messagesPerSecond)}/s | {Math.round(metrics.averageLatency)}ms
        </span>
      </div>
    </div>
  );
}

export function TradingDashboard({
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Initialize WebSocket for real-time data
  const { status: wsStatus, subscribe, unsubscribe } = useWebSocket(enableRealTime);

  // Subscribe to symbols for real-time updates
  useEffect(() => {
    if (enableRealTime && symbols.length > 0) {
      subscribe(symbols, ['quote', 'trade']);
    }
    return () => {
      if (symbols.length > 0) {
        unsubscribe(symbols);
      }
    };
  }, [symbols, enableRealTime, subscribe, unsubscribe]);

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

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Responsive layout classes
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
        {/* Left Sidebar */}
        <div className={cn(
          'flex flex-col border-r border-trading-neutral-700 bg-trading-bg-secondary transition-all duration-300',
          layout === 'mobile' ? 'w-full' : sidebarCollapsed ? 'w-16' : 'w-80'
        )}>
          {/* Sidebar controls */}
          <div className="flex items-center justify-between p-3 border-b border-trading-neutral-700">
            {!sidebarCollapsed && (
              <>
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
              </>
            )}
            <button
              onClick={handleToggleSidebar}
              className="p-1 rounded hover:bg-trading-neutral-700 transition-colors ml-auto"
            >
              <div className="w-4 h-4 text-trading-text-secondary">
                {sidebarCollapsed ? '→' : '←'}
              </div>
            </button>
          </div>

          {/* Price Grid */}
          {!sidebarCollapsed && showPriceGrid && (
            <div className="flex-1 p-3">
              <Suspense fallback={<LoadingSkeleton className="h-full" />}>
                <PriceGrid
                  symbols={symbols}
                  selectedSymbol={selectedSymbol}
                  onSymbolSelect={setSelectedSymbol}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Section - Portfolio Summary */}
          <div className={cn(
            'border-b border-trading-neutral-700 p-4',
            layout === 'compact' ? 'h-32' : 'h-40'
          )}>
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <PortfolioSummary />
            </Suspense>
          </div>

          {/* Chart Section */}
          <div className="flex-1 p-4">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <TradingChart 
                symbol={selectedSymbol}
                height={layout === 'compact' ? 400 : 500}
              />
            </Suspense>
          </div>
        </div>

        {/* Right Panel */}
        <div className={cn(
          'flex flex-col border-l border-trading-neutral-700 bg-trading-bg-secondary',
          layout === 'mobile' ? 'hidden' : 'w-96'
        )}>
          {/* Order Panel */}
          <div className={cn(
            'border-b border-trading-neutral-700 p-4',
            layout === 'compact' ? 'h-64' : 'h-80'
          )}>
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <OrderPanel symbol={selectedSymbol} />
            </Suspense>
          </div>

          {/* Order Book */}
          <div className={cn(
            'border-b border-trading-neutral-700 p-4',
            layout === 'compact' ? 'h-64' : 'h-80'
          )}>
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <OrderBook symbol={selectedSymbol} />
            </Suspense>
          </div>

          {/* Bottom Tabs */}
          <div className="flex-1 flex flex-col">
            <TradingTabs 
              selectedSymbol={selectedSymbol} 
              enableML={enableML}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TradingTabs({ 
  selectedSymbol, 
  enableML 
}: { 
  selectedSymbol: string; 
  enableML: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'trades' | 'ml' | 'sentiment' | 'alerts' | 'performance' | 'backtesting' | 'advanced-ml' | 'risk'>('trades');

  const tabs = [
    { 
      id: 'trades' as const, 
      label: 'Trades', 
      component: () => <TradeHistory symbol={selectedSymbol} />
    },
    ...(enableML ? [{ 
      id: 'ml' as const, 
      label: 'ML Signals', 
      component: () => <MLPredictions symbol={selectedSymbol} />
    }] : []),
    { 
      id: 'sentiment' as const, 
      label: 'Sentiment', 
      component: () => <SentimentAnalysis symbol={selectedSymbol} height={320} />
    },
    { 
      id: 'alerts' as const, 
      label: 'Alerts', 
      component: () => <AlertsPanel symbol={selectedSymbol} />
    },
    { 
      id: 'performance' as const, 
      label: 'Performance', 
      component: () => <PerformanceDashboard />
    },
    { 
      id: 'backtesting' as const, 
      label: 'Backtesting', 
      component: () => <BacktestingDashboard />
    },
    { 
      id: 'advanced-ml' as const, 
      label: 'Neural Networks', 
      component: () => <AdvancedMLDashboard />
    },
    { 
      id: 'risk' as const, 
      label: 'Risk Management', 
      component: () => <RiskManagementDashboard />
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
        <Suspense fallback={<LoadingSkeleton className="h-32" />}>
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