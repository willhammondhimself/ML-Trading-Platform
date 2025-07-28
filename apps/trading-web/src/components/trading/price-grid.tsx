'use client';

import React, { useMemo, useCallback, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { useTradingVirtualScroll } from '@/hooks/use-virtual-scrolling';
import { useMarketDataWebSocket } from '@/hooks/use-websocket';
import { usePriceStore, usePriceValue, useSpread } from '@/stores/price-store';
import { PriceGridProps, TickData } from '@/types/trading';
import Decimal from 'decimal.js';

interface PriceGridItem {
  symbol: string;
  name: string;
  price: Decimal | undefined;
  change: Decimal | undefined;
  changePercent: Decimal | undefined;
  volume: Decimal | undefined;
  spread: Decimal | undefined;
  timestamp: number | undefined;
}

const ITEM_HEIGHT = 32; // Height of each row in pixels
const DEFAULT_CONTAINER_HEIGHT = 400;

function PriceRow({ 
  item, 
  style, 
  isSelected, 
  onSelect 
}: { 
  item: PriceGridItem;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  
  const handleClick = useCallback(() => {
    startTransition(() => {
      onSelect(item.symbol);
    });
  }, [item.symbol, onSelect]);

  const priceColor = useMemo(() => {
    if (!item.change) return 'text-trading-text-primary';
    return item.change.isPositive() 
      ? 'text-trading-success' 
      : item.change.isNegative() 
        ? 'text-trading-error' 
        : 'text-trading-text-primary';
  }, [item.change]);

  const changeColor = useMemo(() => {
    if (!item.change) return 'text-trading-text-secondary';
    return item.change.isPositive() 
      ? 'text-trading-success bg-trading-success/10' 
      : item.change.isNegative() 
        ? 'text-trading-error bg-trading-error/10' 
        : 'text-trading-text-secondary';
  }, [item.change]);

  const formatPrice = useCallback((price: Decimal | undefined) => {
    if (!price) return '-';
    return price.toFixed(4);
  }, []);

  const formatChange = useCallback((change: Decimal | undefined) => {
    if (!change) return '-';
    const sign = change.isPositive() ? '+' : '';
    return `${sign}${change.toFixed(4)}`;
  }, []);

  const formatPercent = useCallback((percent: Decimal | undefined) => {
    if (!percent) return '-';
    const sign = percent.isPositive() ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  }, []);

  const formatVolume = useCallback((volume: Decimal | undefined) => {
    if (!volume) return '-';
    const num = volume.toNumber();
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  }, []);

  return (
    <div
      style={style}
      onClick={handleClick}
      className={cn(
        'flex items-center px-3 py-1 border-b border-trading-neutral-800 cursor-pointer transition-colors hover:bg-trading-neutral-800/50',
        isSelected && 'bg-trading-accent-blue/10 border-trading-accent-blue/30',
        isPending && 'opacity-70'
      )}
    >
      {/* Symbol */}
      <div className="w-16 flex-shrink-0">
        <div className="font-medium text-trading-text-primary text-sm">
          {item.symbol}
        </div>
        <div className="text-xs text-trading-text-secondary truncate">
          {item.name}
        </div>
      </div>

      {/* Price */}
      <div className={cn('w-20 text-right font-mono text-sm', priceColor)}>
        {formatPrice(item.price)}
      </div>

      {/* Change */}
      <div className="w-20 text-right">
        <div className={cn('inline-flex items-center px-1 py-0.5 rounded text-xs font-mono', changeColor)}>
          {formatChange(item.change)}
        </div>
      </div>

      {/* Change % */}
      <div className="w-16 text-right">
        <div className={cn('inline-flex items-center px-1 py-0.5 rounded text-xs font-mono', changeColor)}>
          {formatPercent(item.changePercent)}
        </div>
      </div>

      {/* Volume */}
      <div className="w-16 text-right text-xs text-trading-text-secondary font-mono">
        {formatVolume(item.volume)}
      </div>

      {/* Spread */}
      <div className="w-16 text-right text-xs text-trading-text-secondary font-mono">
        {item.spread ? item.spread.toFixed(4) : '-'}
      </div>

      {/* Last Update */}
      <div className="flex-1 text-right text-xs text-trading-text-secondary">
        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '-'}
      </div>
    </div>
  );
}

function PriceGridHeader() {
  return (
    <div className="flex items-center px-3 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700 text-xs font-medium text-trading-text-secondary">
      <div className="w-16 flex-shrink-0">Symbol</div>
      <div className="w-20 text-right">Price</div>
      <div className="w-20 text-right">Change</div>
      <div className="w-16 text-right">Change %</div>
      <div className="w-16 text-right">Volume</div>
      <div className="w-16 text-right">Spread</div>
      <div className="flex-1 text-right">Updated</div>
    </div>
  );
}

export function PriceGrid({
  symbols,
  maxRows = 100,
  enableVirtualScrolling = true,
  updateRate = 16,
  className,
}: PriceGridProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Get price data from store
  const prices = usePriceStore(state => state.prices);
  const getPrice = usePriceStore(state => state.getPrice);
  const getSpread = usePriceStore(state => state.getSpread);

  // Connect to WebSocket for real-time updates
  const { status: wsStatus, performanceMetrics } = useMarketDataWebSocket(symbols);

  // Transform symbols into grid items
  const gridItems = useMemo(() => {
    return symbols.slice(0, maxRows).map((symbol): PriceGridItem => {
      const tickData = getPrice(symbol);
      const spread = getSpread(symbol);
      
      // Calculate change and change percentage
      // Note: In a real implementation, you'd track previous prices
      let change: Decimal | undefined;
      let changePercent: Decimal | undefined;
      
      if (tickData) {
        // For demo purposes, generate mock change data
        // In production, this would come from your price history
        const mockChange = new Decimal(Math.random() * 2 - 1); // Random between -1 and 1
        change = mockChange;
        changePercent = change.div(tickData.price.value).mul(100);
      }

      return {
        symbol,
        name: symbol, // In production, you'd have a symbol name mapping
        price: tickData?.price.value,
        change,
        changePercent,
        volume: tickData?.volume.value,
        spread,
        timestamp: tickData?.timestamp,
      };
    });
  }, [symbols, maxRows, getPrice, getSpread, prices]);

  // Virtual scrolling for performance
  const containerHeight = Math.min(DEFAULT_CONTAINER_HEIGHT, gridItems.length * ITEM_HEIGHT + 40); // +40 for header
  
  const virtualScroll = useTradingVirtualScroll(gridItems, {
    itemHeight: ITEM_HEIGHT,
    containerHeight: containerHeight - 40, // Subtract header height
    overscan: 5,
    autoScrollToLatest: false,
  });

  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    // Emit selection event for other components
    window.dispatchEvent(new CustomEvent('symbol-selected', { detail: { symbol } }));
  }, []);

  const handleScrollToTop = useCallback(() => {
    startTransition(() => {
      virtualScroll.scrollToTop();
    });
  }, [virtualScroll]);

  const handleScrollToBottom = useCallback(() => {
    startTransition(() => {
      virtualScroll.scrollToBottom();
    });
  }, [virtualScroll]);

  if (symbols.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-64 bg-trading-bg-primary border border-trading-neutral-700 rounded', className)}>
        <div className="text-center">
          <div className="text-trading-text-secondary mb-2">No symbols to display</div>
          <div className="text-xs text-trading-text-secondary">Add symbols to see real-time prices</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-trading-bg-primary border border-trading-neutral-700 rounded overflow-hidden', className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-trading-bg-secondary border-b border-trading-neutral-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-trading-text-primary">Market Prices</h3>
          <div className={cn(
            'w-2 h-2 rounded-full',
            wsStatus === 'connected' ? 'bg-trading-success' : 'bg-trading-error'
          )} />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Performance metrics */}
          {performanceMetrics.messagesPerSecond > 0 && (
            <div className="text-xs text-trading-text-secondary">
              {Math.round(performanceMetrics.messagesPerSecond)}/s
            </div>
          )}
          
          {/* Scroll controls */}
          <button
            onClick={handleScrollToTop}
            disabled={isPending}
            className="p-1 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
            title="Scroll to top"
          >
            ↑
          </button>
          <button
            onClick={handleScrollToBottom}
            disabled={isPending}
            className="p-1 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
            title="Scroll to bottom"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Column headers */}
      <PriceGridHeader />

      {/* Virtual scrolled content */}
      {enableVirtualScrolling ? (
        <div {...virtualScroll.scrollElementProps}>
          <div style={{ height: virtualScroll.totalHeight, position: 'relative' }}>
            {virtualScroll.virtualItems.map(({ item, style, index }) => (
              <PriceRow
                key={item.symbol}
                item={item}
                style={style}
                isSelected={selectedSymbol === item.symbol}
                onSelect={handleSymbolSelect}
              />
            ))}
          </div>
        </div>
      ) : (
        // Non-virtualized fallback for small lists
        <div className="overflow-y-auto" style={{ height: containerHeight - 40 }}>
          {gridItems.map((item) => (
            <PriceRow
              key={item.symbol}
              item={item}
              style={{ position: 'relative' }}
              isSelected={selectedSymbol === item.symbol}
              onSelect={handleSymbolSelect}
            />
          ))}
        </div>
      )}

      {/* Footer with summary */}
      <div className="px-3 py-2 bg-trading-bg-secondary border-t border-trading-neutral-700 text-xs text-trading-text-secondary">
        {gridItems.length} symbols | {wsStatus} | {virtualScroll.virtualItems.length} visible
      </div>
    </div>
  );
}