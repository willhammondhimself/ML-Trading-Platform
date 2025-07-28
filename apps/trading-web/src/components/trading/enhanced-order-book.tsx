'use client';

import React, { useMemo, useCallback, useState, useTransition, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useOrderBook, useBestBid, useBestAsk, useSpread, useMidPrice } from '@/stores/orderbook-store';
import { useMarketDataWebSocket } from '@/hooks/use-websocket';
import { OrderBookProps, OrderBookLevel } from '@/types/trading';
import Decimal from 'decimal.js';

interface OrderBookRowProps {
  level: OrderBookLevel;
  maxVolume: Decimal;
  side: 'bid' | 'ask';
  isTop?: boolean;
}

function OrderBookRow({ level, maxVolume, side, isTop = false }: OrderBookRowProps) {
  const [isPending, startTransition] = useTransition();
  
  const volumePercentage = useMemo(() => {
    if (maxVolume.isZero()) return 0;
    return level.volume.div(maxVolume).mul(100).toNumber();
  }, [level.volume, maxVolume]);

  const depthBarColor = side === 'bid' 
    ? 'bg-trading-success/20 border-r-2 border-trading-success/40'
    : 'bg-trading-error/20 border-l-2 border-trading-error/40';

  const textColor = side === 'bid' 
    ? 'text-trading-success' 
    : 'text-trading-error';

  const formatPrice = useCallback((price: Decimal) => {
    return price.toFixed(4);
  }, []);

  const formatVolume = useCallback((volume: Decimal) => {
    const num = volume.toNumber();
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  }, []);

  return (
    <div 
      className={cn(
        'relative flex items-center h-6 text-xs font-mono transition-all duration-75',
        isTop && 'font-semibold',
        isPending && 'opacity-70'
      )}
    >
      {/* Depth visualization bar */}
      <div 
        className={cn('absolute inset-0 transition-all duration-200', depthBarColor)}
        style={{
          width: `${volumePercentage}%`,
          [side === 'bid' ? 'right' : 'left']: 0,
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex items-center justify-between w-full px-2">
        {side === 'bid' ? (
          <>
            {/* Bid side: Volume | Price */}
            <div className="flex-1 text-left text-trading-text-secondary">
              {formatVolume(level.volume)}
            </div>
            <div className={cn('flex-1 text-right font-medium', textColor)}>
              {formatPrice(level.price)}
            </div>
          </>
        ) : (
          <>
            {/* Ask side: Price | Volume */}
            <div className={cn('flex-1 text-left font-medium', textColor)}>
              {formatPrice(level.price)}
            </div>
            <div className="flex-1 text-right text-trading-text-secondary">
              {formatVolume(level.volume)}
            </div>
          </>
        )}
      </div>
      
      {/* Order count indicator */}
      {level.count > 1 && (
        <div className="absolute right-1 top-0 text-xs text-trading-text-secondary opacity-60">
          {level.count}
        </div>
      )}
    </div>
  );
}

function SpreadIndicator({ 
  bestBid, 
  bestAsk, 
  spread, 
  midPrice 
}: {
  bestBid?: OrderBookLevel;
  bestAsk?: OrderBookLevel;
  spread?: Decimal;
  midPrice?: Decimal;
}) {
  const formatPrice = useCallback((price: Decimal) => {
    return price.toFixed(4);
  }, []);

  const spreadBps = useMemo(() => {
    if (!spread || !midPrice || midPrice.isZero()) return undefined;
    return spread.div(midPrice).mul(10000); // Convert to basis points
  }, [spread, midPrice]);

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-trading-neutral-900/50 border-y border-trading-neutral-700">
      {/* Best Ask */}
      <div className="text-right">
        <div className="text-xs text-trading-text-secondary">Ask</div>
        <div className="text-sm font-mono text-trading-error font-medium">
          {bestAsk ? formatPrice(bestAsk.price) : '-'}
        </div>
      </div>

      {/* Spread Info */}
      <div className="text-center">
        <div className="text-xs text-trading-text-secondary">Spread</div>
        <div className="text-sm font-mono text-trading-text-primary">
          {spread ? formatPrice(spread) : '-'}
        </div>
        {spreadBps && (
          <div className="text-xs text-trading-text-secondary">
            {spreadBps.toFixed(1)} bps
          </div>
        )}
      </div>

      {/* Mid Price */}
      <div className="text-center">
        <div className="text-xs text-trading-text-secondary">Mid</div>
        <div className="text-sm font-mono text-trading-accent-blue font-medium">
          {midPrice ? formatPrice(midPrice) : '-'}
        </div>
      </div>

      {/* Best Bid */}
      <div className="text-left">
        <div className="text-xs text-trading-text-secondary">Bid</div>
        <div className="text-sm font-mono text-trading-success font-medium">
          {bestBid ? formatPrice(bestBid.price) : '-'}
        </div>
      </div>
    </div>
  );
}

function OrderBookHeader() {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700">
      <div className="text-xs font-medium text-trading-text-secondary">Volume</div>
      <div className="text-xs font-medium text-trading-text-secondary">Price</div>
    </div>
  );
}

export function EnhancedOrderBook({
  symbol,
  levels = 10,
  enableMarketDepth = true,
  enableVolumeProfile = false,
  className,
}: OrderBookProps) {
  const [isPending, startTransition] = useTransition();
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  
  // Get order book data
  const orderBook = useOrderBook(symbol);
  const bestBid = useBestBid(symbol);
  const bestAsk = useBestAsk(symbol);
  const spread = useSpread(symbol);
  const midPrice = useMidPrice(symbol);

  // Connect to WebSocket for real-time updates
  const { status: wsStatus, performanceMetrics } = useMarketDataWebSocket([symbol]);

  // Update animation trigger
  useEffect(() => {
    if (orderBook) {
      setLastUpdateTime(orderBook.timestamp);
    }
  }, [orderBook]);

  // Calculate maximum volume for depth visualization
  const maxVolume = useMemo(() => {
    if (!orderBook) return new Decimal(0);
    
    const allLevels = [...orderBook.bids.slice(0, levels), ...orderBook.asks.slice(0, levels)];
    return allLevels.reduce((max, level) => 
      level.volume.gt(max) ? level.volume : max, 
      new Decimal(0)
    );
  }, [orderBook, levels]);

  // Prepare display data
  const { displayBids, displayAsks } = useMemo(() => {
    if (!orderBook) {
      return { displayBids: [], displayAsks: [] };
    }

    return {
      displayBids: orderBook.bids.slice(0, levels),
      displayAsks: orderBook.asks.slice(0, levels).reverse(), // Reverse asks for better visual flow
    };
  }, [orderBook, levels]);

  const totalBidVolume = useMemo(() => {
    return displayBids.reduce((total, level) => total.add(level.volume), new Decimal(0));
  }, [displayBids]);

  const totalAskVolume = useMemo(() => {
    return displayAsks.reduce((total, level) => total.add(level.volume), new Decimal(0));
  }, [displayAsks]);

  if (!symbol) {
    return (
      <div className={cn('flex items-center justify-center h-64 bg-trading-bg-primary border border-trading-neutral-700 rounded', className)}>
        <div className="text-center">
          <div className="text-trading-text-secondary mb-2">No symbol selected</div>
          <div className="text-xs text-trading-text-secondary">Select a symbol to view order book</div>
        </div>
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className={cn('flex items-center justify-center h-64 bg-trading-bg-primary border border-trading-neutral-700 rounded', className)}>
        <div className="text-center">
          <div className="text-trading-text-secondary mb-2">Loading order book...</div>
          <div className={cn(
            'w-2 h-2 rounded-full mx-auto',
            wsStatus === 'connected' ? 'bg-trading-success animate-pulse' : 'bg-trading-error'
          )} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-trading-text-primary">Order Book</h3>
          <div className="text-xs text-trading-text-secondary">{symbol}</div>
          <div className={cn(
            'w-2 h-2 rounded-full',
            wsStatus === 'connected' ? 'bg-trading-success' : 'bg-trading-error'
          )} />
        </div>
        
        <div className="flex items-center gap-2 text-xs text-trading-text-secondary">
          {performanceMetrics.messagesPerSecond > 0 && (
            <div>{Math.round(performanceMetrics.messagesPerSecond)}/s</div>
          )}
          <div>L{levels}</div>
        </div>
      </div>

      {/* Column headers */}
      <OrderBookHeader />

      {/* Order book content */}
      <div className="flex-1 min-h-0">
        {/* Asks (sell orders) - displayed top to bottom from highest to lowest price */}
        <div className="border-b border-trading-neutral-800">
          {displayAsks.map((level, index) => (
            <OrderBookRow
              key={`ask-${level.price.toString()}`}
              level={level}
              maxVolume={maxVolume}
              side="ask"
              isTop={index === displayAsks.length - 1} // Highlight closest to mid
            />
          ))}
        </div>

        {/* Spread indicator */}
        <SpreadIndicator 
          bestBid={bestBid}
          bestAsk={bestAsk}
          spread={spread}
          midPrice={midPrice}
        />

        {/* Bids (buy orders) - displayed top to bottom from highest to lowest price */}
        <div>
          {displayBids.map((level, index) => (
            <OrderBookRow
              key={`bid-${level.price.toString()}`}
              level={level}
              maxVolume={maxVolume}
              side="bid"
              isTop={index === 0} // Highlight closest to mid
            />
          ))}
        </div>
      </div>

      {/* Footer with summary */}
      <div className="px-3 py-2 bg-trading-bg-secondary border-t border-trading-neutral-700 text-xs">
        <div className="flex justify-between items-center">
          <div className="text-trading-text-secondary">
            Bid: {totalBidVolume.toFixed(0)} | Ask: {totalAskVolume.toFixed(0)}
          </div>
          <div className="text-trading-text-secondary">
            {orderBook.sequence} | {new Date(orderBook.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}