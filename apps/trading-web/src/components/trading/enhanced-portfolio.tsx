'use client';

import React, { useMemo, useCallback, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { 
  usePositions, 
  usePortfolioValue, 
  useRiskMetrics, 
  useTotalPnL,
  useRecentTrades 
} from '@/stores/portfolio-store';
import { usePriceStore } from '@/stores/price-store';
import { useTradingDataWebSocket } from '@/hooks/use-websocket';
import { Position, PortfolioValue, RiskMetrics } from '@/types/trading';
import Decimal from 'decimal.js';

interface PortfolioMetricCardProps {
  title: string;
  value: string;
  change?: string;
  changePercent?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  subtitle?: string;
  icon?: React.ReactNode;
}

function PortfolioMetricCard({
  title,
  value,
  change,
  changePercent,
  isPositive,
  isNegative,
  subtitle,
  icon,
}: PortfolioMetricCardProps) {
  const changeColor = isPositive 
    ? 'text-trading-success' 
    : isNegative 
      ? 'text-trading-error' 
      : 'text-trading-text-secondary';

  return (
    <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-trading-text-secondary">{title}</div>
        {icon && <div className="text-trading-text-secondary">{icon}</div>}
      </div>
      
      <div className="text-2xl font-bold text-trading-text-primary mb-1">
        {value}
      </div>
      
      {(change || changePercent) && (
        <div className={cn('text-sm font-mono', changeColor)}>
          {change && <span>{change}</span>}
          {change && changePercent && <span> </span>}
          {changePercent && <span>({changePercent})</span>}
        </div>
      )}
      
      {subtitle && (
        <div className="text-xs text-trading-text-secondary mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
}

interface PositionRowProps {
  position: Position;
  currentPrice?: Decimal;
  onSelect?: (symbol: string) => void;
}

function PositionRow({ position, currentPrice, onSelect }: PositionRowProps) {
  const [isPending, startTransition] = useTransition();
  
  const unrealizedPnL = useMemo(() => {
    if (!currentPrice) return new Decimal(0);
    const priceDiff = currentPrice.sub(position.avgPrice);
    const multiplier = position.side === 'long' ? 1 : -1;
    return priceDiff.mul(position.quantity).mul(multiplier);
  }, [position, currentPrice]);

  const unrealizedPnLPercent = useMemo(() => {
    if (!currentPrice || position.avgPrice.isZero()) return new Decimal(0);
    const priceDiff = currentPrice.sub(position.avgPrice);
    return priceDiff.div(position.avgPrice).mul(100);
  }, [position.avgPrice, currentPrice]);

  const marketValue = useMemo(() => {
    if (!currentPrice) return new Decimal(0);
    return currentPrice.mul(position.quantity);
  }, [currentPrice, position.quantity]);

  const handleClick = useCallback(() => {
    if (onSelect) {
      startTransition(() => {
        onSelect(position.symbol);
      });
    }
  }, [position.symbol, onSelect]);

  const formatDecimal = useCallback((value: Decimal) => {
    return value.toFixed(2);
  }, []);

  const formatCurrency = useCallback((value: Decimal) => {
    return `$${value.toFixed(2)}`;
  }, []);

  const isProfit = unrealizedPnL.isPositive();
  const isLoss = unrealizedPnL.isNegative();

  return (
    <div 
      onClick={handleClick}
      className={cn(
        'flex items-center justify-between py-2 px-3 border-b border-trading-neutral-800 hover:bg-trading-neutral-800/50 cursor-pointer transition-colors',
        isPending && 'opacity-70'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-trading-text-primary">
            {position.symbol}
          </span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            position.side === 'long' 
              ? 'bg-trading-success/20 text-trading-success' 
              : 'bg-trading-error/20 text-trading-error'
          )}>
            {position.side.toUpperCase()}
          </span>
        </div>
        <div className="text-sm text-trading-text-secondary">
          {formatDecimal(position.quantity)} @ {formatCurrency(position.avgPrice)}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-mono text-trading-text-primary">
          {formatCurrency(marketValue)}
        </div>
        <div className={cn(
          'text-xs font-mono',
          isProfit ? 'text-trading-success' : isLoss ? 'text-trading-error' : 'text-trading-text-secondary'
        )}>
          {formatCurrency(unrealizedPnL)} ({unrealizedPnLPercent.toFixed(2)}%)
        </div>
      </div>
    </div>
  );
}

interface RecentTradeRowProps {
  trade: any; // Using any for now, would be Trade type
}

function RecentTradeRow({ trade }: RecentTradeRowProps) {
  const formatCurrency = useCallback((value: Decimal) => {
    return `$${value.toFixed(2)}`;
  }, []);

  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  }, []);

  return (
    <div className="flex items-center justify-between py-2 px-3 border-b border-trading-neutral-800 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-trading-text-primary">
          {trade.symbol}
        </span>
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded',
          trade.side === 'buy' 
            ? 'bg-trading-success/20 text-trading-success' 
            : 'bg-trading-error/20 text-trading-error'
        )}>
          {trade.side.toUpperCase()}
        </span>
      </div>

      <div className="text-right">
        <div className="font-mono text-trading-text-primary">
          {trade.quantity.toFixed(0)} @ {formatCurrency(trade.price)}
        </div>
        <div className="text-xs text-trading-text-secondary">
          {formatTime(trade.timestamp)}
        </div>
      </div>
    </div>
  );
}

export function EnhancedPortfolio({ className }: { className?: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'trades' | 'risk'>('overview');
  const [isPending, startTransition] = useTransition();

  // Portfolio data
  const positions = usePositions();
  const portfolioValue = usePortfolioValue();
  const riskMetrics = useRiskMetrics();
  const totalPnL = useTotalPnL();
  const recentTrades = useRecentTrades(10);

  // Price data for calculations
  const prices = usePriceStore(state => state.prices);

  // WebSocket connection for real-time updates
  const { status: wsStatus } = useTradingDataWebSocket();

  // Format functions
  const formatCurrency = useCallback((value: Decimal) => {
    return `$${value.toNumber().toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, []);

  const formatPercent = useCallback((value: Decimal) => {
    const sign = value.isPositive() ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }, []);

  const formatChange = useCallback((value: Decimal) => {
    const sign = value.isPositive() ? '+' : '';
    return `${sign}${formatCurrency(value)}`;
  }, [formatCurrency]);

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    const dayPnLIsPositive = portfolioValue.dayPnL.isPositive();
    const dayPnLIsNegative = portfolioValue.dayPnL.isNegative();
    const totalPnLIsPositive = totalPnL.isPositive();
    const totalPnLIsNegative = totalPnL.isNegative();

    return {
      totalValue: formatCurrency(portfolioValue.totalValue),
      totalChange: formatChange(portfolioValue.dayPnL),
      totalChangePercent: formatPercent(portfolioValue.dayPnLPercent),
      totalPnL: formatCurrency(totalPnL),
      cashBalance: formatCurrency(portfolioValue.cashBalance),
      positionsValue: formatCurrency(portfolioValue.positionsValue),
      unrealizedPnL: formatCurrency(portfolioValue.unrealizedPnL),
      realizedPnL: formatCurrency(portfolioValue.realizedPnL),
      dayPnLIsPositive,
      dayPnLIsNegative,
      totalPnLIsPositive,
      totalPnLIsNegative,
    };
  }, [portfolioValue, totalPnL, formatCurrency, formatChange, formatPercent]);

  const handleTabChange = useCallback((tab: typeof activeTab) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  }, []);

  const handlePositionSelect = useCallback((symbol: string) => {
    window.dispatchEvent(new CustomEvent('symbol-selected', { detail: { symbol } }));
  }, []);

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'positions' as const, label: 'Positions' },
    { id: 'trades' as const, label: 'Trades' },
    { id: 'risk' as const, label: 'Risk' },
  ];

  return (
    <div className={cn('flex flex-col bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-trading-bg-secondary border-b border-trading-neutral-700">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-trading-text-primary">Portfolio</h2>
          <div className={cn(
            'w-2 h-2 rounded-full',
            wsStatus === 'connected' ? 'bg-trading-success' : 'bg-trading-error'
          )} />
        </div>
        
        <div className="text-sm text-trading-text-secondary">
          {new Date(portfolioValue.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-trading-neutral-700 bg-trading-bg-secondary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            disabled={isPending}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-trading-accent-blue border-b-2 border-trading-accent-blue bg-trading-neutral-800'
                : 'text-trading-text-secondary hover:text-trading-text-primary hover:bg-trading-neutral-800/50',
              isPending && 'opacity-50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <PortfolioMetricCard
                title="Total Value"
                value={portfolioMetrics.totalValue}
                change={portfolioMetrics.totalChange}
                changePercent={portfolioMetrics.totalChangePercent}
                isPositive={portfolioMetrics.dayPnLIsPositive}
                isNegative={portfolioMetrics.dayPnLIsNegative}
              />
              
              <PortfolioMetricCard
                title="Total P&L"
                value={portfolioMetrics.totalPnL}
                isPositive={portfolioMetrics.totalPnLIsPositive}
                isNegative={portfolioMetrics.totalPnLIsNegative}
                subtitle="Unrealized + Realized"
              />
              
              <PortfolioMetricCard
                title="Cash Balance"
                value={portfolioMetrics.cashBalance}
                subtitle="Available for trading"
              />
              
              <PortfolioMetricCard
                title="Positions Value"
                value={portfolioMetrics.positionsValue}
                subtitle={`${positions.length} open positions`}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-trading-text-secondary">Exposure</div>
                <div className="font-mono text-trading-text-primary">
                  {formatCurrency(riskMetrics.exposure)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-trading-text-secondary">Leverage</div>
                <div className="font-mono text-trading-text-primary">
                  {riskMetrics.leverage.toFixed(2)}x
                </div>
              </div>
              <div className="text-center">
                <div className="text-trading-text-secondary">Sharpe Ratio</div>
                <div className="font-mono text-trading-text-primary">
                  {riskMetrics.sharpeRatio.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'positions' && (
          <div>
            {positions.length === 0 ? (
              <div className="text-center py-8 text-trading-text-secondary">
                No open positions
              </div>
            ) : (
              <div className="space-y-1">
                {positions.map((position) => {
                  const tickData = prices.get(position.symbol);
                  const currentPrice = tickData?.price.value;
                  
                  return (
                    <PositionRow
                      key={position.id}
                      position={position}
                      currentPrice={currentPrice}
                      onSelect={handlePositionSelect}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div>
            {recentTrades.length === 0 ? (
              <div className="text-center py-8 text-trading-text-secondary">
                No recent trades
              </div>
            ) : (
              <div className="space-y-1">
                {recentTrades.map((trade, index) => (
                  <RecentTradeRow
                    key={`${trade.id}-${index}`}
                    trade={trade}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <PortfolioMetricCard
                title="VaR (95%)"
                value={formatCurrency(riskMetrics.var95)}
                subtitle="Value at Risk 95%"
              />
              
              <PortfolioMetricCard
                title="VaR (99%)"
                value={formatCurrency(riskMetrics.var99)}
                subtitle="Value at Risk 99%"
              />
              
              <PortfolioMetricCard
                title="Max Drawdown"
                value={formatCurrency(riskMetrics.maxDrawdown)}
                subtitle="Maximum loss from peak"
              />
              
              <PortfolioMetricCard
                title="Leverage"
                value={`${riskMetrics.leverage.toFixed(2)}x`}
                subtitle="Portfolio leverage ratio"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}