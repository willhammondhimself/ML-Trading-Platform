'use client';

import React, { useState, useEffect } from 'react';
import { cn, formatPrice } from '@/lib/utils';
import { History, TrendingUp, TrendingDown } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
  status: 'pending' | 'filled' | 'canceled';
}

interface TradeHistoryProps {
  symbol: string;
}

export function TradeHistory({ symbol }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch(`/api/portfolio/trades?symbol=${symbol}&limit=20`);
        if (response.ok) {
          const data = await response.json();
          setTrades(data);
        }
      } catch (error) {
        console.error('Error fetching trades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, [symbol]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-trading-text-secondary">Loading trade history...</div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-trading-accent-blue" />
        <h3 className="text-lg font-semibold text-trading-text-primary">
          Trade History
        </h3>
      </div>

      {trades.length === 0 ? (
        <div className="text-center text-trading-text-muted py-8">
          No trades found for {symbol}
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="bg-trading-bg-tertiary rounded-lg p-3 hover:bg-trading-neutral-800/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {trade.side === 'buy' ? (
                    <TrendingUp className="h-4 w-4 text-trading-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-trading-error" />
                  )}
                  <span className={cn(
                    'text-sm font-medium uppercase',
                    trade.side === 'buy' ? 'text-trading-success' : 'text-trading-error'
                  )}>
                    {trade.side}
                  </span>
                  <span className="text-sm font-bold text-trading-text-primary">
                    {trade.symbol}
                  </span>
                </div>
                <div className={cn(
                  'text-xs px-2 py-1 rounded',
                  trade.status === 'filled' ? 'bg-trading-success/20 text-trading-success' :
                  trade.status === 'pending' ? 'bg-trading-warning/20 text-trading-warning' :
                  'bg-trading-error/20 text-trading-error'
                )}>
                  {trade.status}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-trading-text-muted text-xs">Quantity</div>
                  <div className="text-trading-text-primary font-mono">
                    {trade.quantity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-trading-text-muted text-xs">Price</div>
                  <div className="text-trading-text-primary font-mono">
                    {formatPrice(trade.price)}
                  </div>
                </div>
                <div>
                  <div className="text-trading-text-muted text-xs">Total</div>
                  <div className="text-trading-text-primary font-mono">
                    {formatPrice(trade.quantity * trade.price)}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-xs text-trading-text-muted">
                {new Date(trade.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}