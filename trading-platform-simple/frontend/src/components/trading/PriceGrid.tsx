'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { cn, formatPrice, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Quote } from '@/types/trading';

interface PriceGridProps {
  symbols: string[];
  selectedSymbol: string;
  onSymbolSelect: (symbol: string) => void;
  maxRows?: number;
}

// Mock data generator for demo
function generateMockQuote(symbol: string): Quote {
  const basePrice = Math.random() * 200 + 50;
  const change = (Math.random() - 0.5) * 10;
  const changePercent = (change / basePrice) * 100;
  
  return {
    symbol,
    price: basePrice,
    change,
    changePercent,
    volume: Math.floor(Math.random() * 10000000),
    marketCap: Math.floor(Math.random() * 1000000000000),
    timestamp: Date.now(),
  };
}

export function PriceGrid({ 
  symbols, 
  selectedSymbol, 
  onSymbolSelect, 
  maxRows = 50 
}: PriceGridProps) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize with mock data
  useEffect(() => {
    const initialQuotes: Record<string, Quote> = {};
    symbols.forEach(symbol => {
      initialQuotes[symbol] = generateMockQuote(symbol);
    });
    setQuotes(initialQuotes);

    // Simulate real-time updates
    const interval = setInterval(() => {
      setQuotes(prev => {
        const updated = { ...prev };
        const symbolsToUpdate = symbols.slice(0, Math.floor(Math.random() * 5) + 1);
        
        symbolsToUpdate.forEach(symbol => {
          if (updated[symbol]) {
            const currentPrice = updated[symbol].price;
            const priceChange = (Math.random() - 0.5) * 2;
            const newPrice = Math.max(currentPrice + priceChange, 1);
            const change = newPrice - currentPrice;
            const changePercent = (change / currentPrice) * 100;
            
            updated[symbol] = {
              ...updated[symbol],
              price: newPrice,
              change,
              changePercent,
              timestamp: Date.now(),
            };
          }
        });
        
        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [symbols]);

  // Listen for real-time quote updates
  useEffect(() => {
    const handleQuoteUpdate = (event: CustomEvent) => {
      const quote = event.detail as Quote;
      setQuotes(prev => ({
        ...prev,
        [quote.symbol]: quote,
      }));
    };

    window.addEventListener('market-quote', handleQuoteUpdate as EventListener);
    return () => {
      window.removeEventListener('market-quote', handleQuoteUpdate as EventListener);
    };
  }, []);

  const filteredSymbols = useMemo(() => {
    return symbols
      .filter(symbol => 
        symbol.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, maxRows);
  }, [symbols, searchTerm, maxRows]);

  const handleSymbolClick = (symbol: string) => {
    onSymbolSelect(symbol);
    // Emit custom event for other components
    window.dispatchEvent(new CustomEvent('symbol-selected', { 
      detail: { symbol } 
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search symbols..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 bg-trading-bg-tertiary border border-trading-neutral-700 rounded-lg text-sm text-trading-text-primary placeholder-trading-text-muted focus:outline-none focus:border-trading-accent-blue"
        />
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 gap-2 text-xs font-medium text-trading-text-muted pb-2 border-b border-trading-neutral-700">
        <div>Symbol</div>
        <div className="text-right">Price</div>
        <div className="text-right">Change</div>
      </div>

      {/* Price List */}
      <div className="flex-1 overflow-y-auto space-y-1 mt-2">
        {filteredSymbols.map((symbol) => {
          const quote = quotes[symbol];
          if (!quote) return null;

          const isSelected = symbol === selectedSymbol;
          const changeColor = getPriceChangeColor(quote.change);

          return (
            <div
              key={symbol}
              onClick={() => handleSymbolClick(symbol)}
              className={cn(
                'grid grid-cols-3 gap-2 p-2 rounded cursor-pointer transition-all duration-200 hover:bg-trading-neutral-800/50',
                isSelected && 'bg-trading-accent-blue/20 border border-trading-accent-blue/30',
                quote.timestamp > Date.now() - 3000 && 'animate-pulse-price'
              )}
            >
              {/* Symbol */}
              <div className="flex items-center">
                <span className="font-medium text-trading-text-primary text-sm">
                  {symbol}
                </span>
              </div>

              {/* Price */}
              <div className="text-right">
                <div className="font-mono text-sm text-trading-text-primary">
                  {formatPrice(quote.price)}
                </div>
              </div>

              {/* Change */}
              <div className="text-right flex items-center justify-end space-x-1">
                <div className={cn('text-xs font-mono', changeColor)}>
                  {formatPercentage(quote.changePercent)}
                </div>
                {quote.change > 0 ? (
                  <TrendingUp className="h-3 w-3 text-trading-success" />
                ) : quote.change < 0 ? (
                  <TrendingDown className="h-3 w-3 text-trading-error" />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Stats */}
      <div className="mt-3 pt-3 border-t border-trading-neutral-700 text-xs text-trading-text-muted">
        <div className="flex justify-between">
          <span>Symbols: {filteredSymbols.length}</span>
          <span>Updates: Live</span>
        </div>
      </div>
    </div>
  );
}