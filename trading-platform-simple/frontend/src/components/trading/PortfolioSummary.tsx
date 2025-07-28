'use client';

import React, { useState, useEffect } from 'react';
import { cn, formatPrice, formatPercentage } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';

interface PortfolioData {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  cashBalance: number;
  todaysPnL: number;
  todaysPnLPercent: number;
}

export function PortfolioSummary() {
  const [portfolio, setPortfolio] = useState<PortfolioData>({
    totalValue: 125000,
    totalPnL: 15000,
    totalPnLPercent: 13.64,
    cashBalance: 25000,
    todaysPnL: 1250,
    todaysPnLPercent: 1.01,
  });

  const [loading, setLoading] = useState(false);

  // Fetch portfolio data
  useEffect(() => {
    const fetchPortfolio = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/portfolio/summary');
        if (response.ok) {
          const data = await response.json();
          setPortfolio(data);
        }
      } catch (error) {
        console.error('Error fetching portfolio:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
    
    // Update every 30 seconds
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-trading-text-secondary">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 bg-trading-bg-secondary rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-trading-text-primary flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          Portfolio Summary
        </h2>
        <div className="text-xs text-trading-text-muted">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
        {/* Total Value */}
        <div className="bg-trading-bg-tertiary rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-trading-text-secondary">Total Value</div>
            <DollarSign className="h-4 w-4 text-trading-accent-blue" />
          </div>
          <div className="text-2xl font-bold text-trading-text-primary font-mono">
            {formatPrice(portfolio.totalValue)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {portfolio.totalPnLPercent >= 0 ? (
              <TrendingUp className="h-3 w-3 text-trading-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-trading-error" />
            )}
            <span className={cn(
              'text-sm font-medium',
              portfolio.totalPnLPercent >= 0 ? 'text-trading-success' : 'text-trading-error'
            )}>
              {formatPercentage(portfolio.totalPnLPercent)}
            </span>
            <span className="text-xs text-trading-text-muted">
              ({formatPrice(portfolio.totalPnL)})
            </span>
          </div>
        </div>

        {/* Today's P&L */}
        <div className="bg-trading-bg-tertiary rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-trading-text-secondary">Today's P&L</div>
            {portfolio.todaysPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-trading-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-trading-error" />
            )}
          </div>
          <div className={cn(
            'text-2xl font-bold font-mono',
            portfolio.todaysPnL >= 0 ? 'text-trading-success' : 'text-trading-error'
          )}>
            {formatPrice(portfolio.todaysPnL)}
          </div>
          <div className="mt-1">
            <span className={cn(
              'text-sm font-medium',
              portfolio.todaysPnL >= 0 ? 'text-trading-success' : 'text-trading-error'
            )}>
              {formatPercentage(portfolio.todaysPnLPercent)}
            </span>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-trading-bg-tertiary rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-trading-text-secondary">Cash Balance</div>
            <div className="w-2 h-2 bg-trading-accent-blue rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-trading-text-primary font-mono">
            {formatPrice(portfolio.cashBalance)}
          </div>
          <div className="mt-1">
            <span className="text-xs text-trading-text-muted">
              {((portfolio.cashBalance / portfolio.totalValue) * 100).toFixed(1)}% of portfolio
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="mt-4 grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-xs text-trading-text-muted">Buying Power</div>
          <div className="text-sm font-mono text-trading-text-primary">
            {formatPrice(portfolio.cashBalance * 4)} {/* Assume 4:1 margin */}
          </div>
        </div>
        <div>
          <div className="text-xs text-trading-text-muted">Day Range</div>
          <div className="text-sm font-mono text-trading-text-primary">
            ±{Math.abs(portfolio.todaysPnLPercent).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-trading-text-muted">Total Return</div>
          <div className="text-sm font-mono text-trading-text-primary">
            {formatPercentage(portfolio.totalPnLPercent)}
          </div>
        </div>
        <div>
          <div className="text-xs text-trading-text-muted">Risk Level</div>
          <div className="text-sm font-mono text-trading-warning">Moderate</div>
        </div>
      </div>
    </div>
  );
}