'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Search, Star } from 'lucide-react';

interface TradingSidebarProps {
  className?: string;
}

export function TradingSidebar({ className }: TradingSidebarProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeWatchlist, setActiveWatchlist] = React.useState('favorites');

  const watchlists = [
    { id: 'favorites', name: 'Favorites', count: 12 },
    { id: 'sp500', name: 'S&P 500', count: 500 },
    { id: 'nasdaq', name: 'NASDAQ 100', count: 100 },
    { id: 'crypto', name: 'Crypto', count: 25 },
  ];

  const symbols = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 178.25, change: 2.15, changePercent: 1.22 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 2735.84, change: -12.45, changePercent: -0.45 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: 338.11, change: 5.23, changePercent: 1.57 },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 235.87, change: -8.90, changePercent: -3.64 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 445.67, change: 15.23, changePercent: 3.54 },
  ];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-4 border-b border-trading-neutral-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-trading-text-muted" />
          <input
            type="text"
            placeholder="Search symbols..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-trading-bg-tertiary border border-trading-neutral-700 rounded-lg text-trading-text-primary placeholder-trading-text-muted focus:outline-none focus:ring-2 focus:ring-trading-accent-blue focus:border-transparent"
          />
        </div>
      </div>

      {/* Watchlist Tabs */}
      <div className="border-b border-trading-neutral-700">
        <div className="flex overflow-x-auto hide-scrollbar">
          {watchlists.map((watchlist) => (
            <button
              key={watchlist.id}
              onClick={() => setActiveWatchlist(watchlist.id)}
              className={cn(
                'flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors border-b-2',
                activeWatchlist === watchlist.id
                  ? 'text-trading-accent-blue border-trading-accent-blue'
                  : 'text-trading-text-secondary border-transparent hover:text-trading-text-primary'
              )}
            >
              {watchlist.name}
              <span className="ml-2 text-xs text-trading-text-muted">({watchlist.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Symbol List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {symbols.map((symbol) => (
            <SymbolRow key={symbol.symbol} symbol={symbol} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SymbolRowProps {
  symbol: {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
  };
}

function SymbolRow({ symbol }: SymbolRowProps) {
  const isPositive = symbol.change > 0;
  const isNegative = symbol.change < 0;

  return (
    <button className="w-full p-3 rounded-lg hover:bg-trading-neutral-800 transition-colors text-left group">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-trading-text-primary">{symbol.symbol}</span>
            <Star className="h-3 w-3 text-trading-text-muted group-hover:text-trading-warning-500 transition-colors" />
          </div>
          <div className="text-xs text-trading-text-muted truncate">{symbol.name}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm text-trading-text-primary">
            ${symbol.price.toFixed(2)}
          </div>
          <div className={cn(
            'text-xs font-medium',
            isPositive && 'text-trading-success-500',
            isNegative && 'text-trading-danger-500',
            !isPositive && !isNegative && 'text-trading-text-muted'
          )}>
            {isPositive && '+'}{symbol.change.toFixed(2)} ({isPositive && '+'}{symbol.changePercent.toFixed(2)}%)
          </div>
        </div>
      </div>
    </button>
  );
}