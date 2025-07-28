'use client';

import React, { useState, useEffect } from 'react';
import { cn, formatPrice } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

interface OrderBookLevel {
  price: number;
  size: number;
  total?: number;
}

interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

interface OrderBookProps {
  symbol: string;
}

export function OrderBook({ symbol }: OrderBookProps) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        const response = await fetch(`/api/market-data/orderbook/${symbol}`);
        if (response.ok) {
          const data = await response.json();
          setOrderBook(data);
        }
      } catch (error) {
        console.error('Error fetching order book:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
    
    // Update every 2 seconds
    const interval = setInterval(fetchOrderBook, 2000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Listen for real-time order book updates
  useEffect(() => {
    const handleOrderBookUpdate = (event: CustomEvent) => {
      const data = event.detail;
      if (data.symbol === symbol) {
        setOrderBook(data);
      }
    };

    window.addEventListener('market-orderbook', handleOrderBookUpdate as EventListener);
    return () => {
      window.removeEventListener('market-orderbook', handleOrderBookUpdate as EventListener);
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-trading-bg-tertiary rounded-lg">
        <div className="text-trading-text-secondary">Loading order book...</div>
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className="h-full flex items-center justify-center bg-trading-bg-tertiary rounded-lg">
        <div className="text-trading-text-secondary">No order book data</div>
      </div>
    );
  }

  const maxBidSize = Math.max(...orderBook.bids.map(b => b.size));
  const maxAskSize = Math.max(...orderBook.asks.map(a => a.size));
  const maxSize = Math.max(maxBidSize, maxAskSize);

  return (
    <div className="h-full bg-trading-bg-tertiary rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-trading-accent-blue" />
          <h3 className="text-lg font-semibold text-trading-text-primary">
            Order Book
          </h3>
        </div>
        <div className="text-xs text-trading-text-muted">
          {symbol}
        </div>
      </div>

      <div className="space-y-4 h-full">
        {/* Header */}
        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-trading-text-muted pb-2 border-b border-trading-neutral-700">
          <div className="text-right">Size</div>
          <div className="text-right">Price</div>
          <div className="text-right">Total</div>
        </div>

        {/* Asks (Sell Orders) */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-trading-error mb-2">ASKS</div>
          {orderBook.asks.slice(0, 8).reverse().map((ask, index) => {
            const sizePercent = (ask.size / maxSize) * 100;
            return (
              <div
                key={index}
                className="relative grid grid-cols-3 gap-2 text-xs font-mono py-1 hover:bg-trading-neutral-800/50 rounded"
              >
                {/* Size bar background */}
                <div
                  className="absolute right-0 top-0 h-full bg-trading-error/20 rounded"
                  style={{ width: `${sizePercent}%` }}
                />
                
                <div className="text-right text-trading-text-primary relative z-10">
                  {ask.size.toLocaleString()}
                </div>
                <div className="text-right text-trading-error relative z-10">
                  {formatPrice(ask.price)}
                </div>
                <div className="text-right text-trading-text-secondary relative z-10">
                  {ask.total?.toLocaleString() || '-'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Spread */}
        <div className="py-2 border-y border-trading-neutral-700">
          <div className="text-center">
            <div className="text-xs text-trading-text-muted">Spread</div>
            <div className="text-sm font-mono text-trading-text-primary">
              {orderBook.asks.length > 0 && orderBook.bids.length > 0
                ? formatPrice(orderBook.asks[0].price - orderBook.bids[0].price)
                : '-'
              }
            </div>
          </div>
        </div>

        {/* Bids (Buy Orders) */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-trading-success mb-2">BIDS</div>
          {orderBook.bids.slice(0, 8).map((bid, index) => {
            const sizePercent = (bid.size / maxSize) * 100;
            return (
              <div
                key={index}
                className="relative grid grid-cols-3 gap-2 text-xs font-mono py-1 hover:bg-trading-neutral-800/50 rounded"
              >
                {/* Size bar background */}
                <div
                  className="absolute right-0 top-0 h-full bg-trading-success/20 rounded"
                  style={{ width: `${sizePercent}%` }}
                />
                
                <div className="text-right text-trading-text-primary relative z-10">
                  {bid.size.toLocaleString()}
                </div>
                <div className="text-right text-trading-success relative z-10">
                  {formatPrice(bid.price)}
                </div>
                <div className="text-right text-trading-text-secondary relative z-10">
                  {bid.total?.toLocaleString() || '-'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-xs text-trading-text-muted text-center pt-2 border-t border-trading-neutral-700">
          Last updated: {new Date(orderBook.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}