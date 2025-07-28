'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TradingHeader } from './header';
import { TradingSidebar } from './sidebar';
import { TradingChart } from './chart';
import { OrderPanel } from './order-panel';
import { PortfolioSummary } from './portfolio-summary';
import { MarketDataFeed } from './market-data-feed';
import { MLPredictions } from './ml-predictions';
import { RiskMonitor } from './risk-monitor';
import { OrderBook } from './order-book';
import { TradeHistory } from './trade-history';
import { AlertsPanel } from './alerts-panel';

interface TradingDashboardProps {
  className?: string;
}

export function TradingDashboard({ className }: TradingDashboardProps) {
  return (
    <div className={cn('h-screen flex flex-col bg-trading-bg-primary', className)}>
      {/* Header */}
      <TradingHeader />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 flex flex-col border-r border-trading-neutral-700 bg-trading-bg-secondary">
          <TradingSidebar />
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Section - Portfolio Summary & Market Data */}
          <div className="h-48 flex border-b border-trading-neutral-700">
            <div className="flex-1 p-4">
              <PortfolioSummary />
            </div>
            <div className="w-80 border-l border-trading-neutral-700 p-4">
              <MarketDataFeed />
            </div>
          </div>

          {/* Middle Section - Chart & ML Predictions */}
          <div className="flex-1 flex">
            <div className="flex-1 p-4">
              <TradingChart />
            </div>
            <div className="w-80 border-l border-trading-neutral-700 p-4">
              <MLPredictions />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 flex flex-col border-l border-trading-neutral-700 bg-trading-bg-secondary">
          {/* Order Panel */}
          <div className="h-96 border-b border-trading-neutral-700 p-4">
            <OrderPanel />
          </div>

          {/* Order Book */}
          <div className="h-80 border-b border-trading-neutral-700 p-4">
            <OrderBook />
          </div>

          {/* Bottom Tabs */}
          <div className="flex-1 flex flex-col">
            <TradingTabs />
          </div>
        </div>
      </div>
    </div>
  );
}

function TradingTabs() {
  const [activeTab, setActiveTab] = React.useState<'trades' | 'risk' | 'alerts'>('trades');

  const tabs = [
    { id: 'trades' as const, label: 'Trades', component: TradeHistory },
    { id: 'risk' as const, label: 'Risk', component: RiskMonitor },
    { id: 'alerts' as const, label: 'Alerts', component: AlertsPanel },
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
        {tabs.map((tab) => {
          if (tab.id === activeTab) {
            const Component = tab.component;
            return <Component key={tab.id} />;
          }
          return null;
        })}
      </div>
    </>
  );
}