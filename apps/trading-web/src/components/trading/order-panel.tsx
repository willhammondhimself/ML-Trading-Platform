'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ShoppingCart, TrendingUp, TrendingDown } from 'lucide-react';

interface OrderPanelProps {
  className?: string;
}

export function OrderPanel({ className }: OrderPanelProps) {
  const [orderType, setOrderType] = React.useState<'market' | 'limit'>('market');
  const [side, setSide] = React.useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = React.useState('');
  const [price, setPrice] = React.useState('');

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center space-x-2 mb-4">
        <ShoppingCart className="h-5 w-5 text-trading-accent-blue" />
        <h3 className="text-lg font-semibold text-trading-text-primary">Place Order</h3>
      </div>

      <div className="space-y-4 flex-1">
        {/* Buy/Sell Toggle */}
        <div className="flex bg-trading-bg-tertiary rounded-lg p-1">
          <button
            onClick={() => setSide('buy')}
            className={cn(
              'flex-1 flex items-center justify-center space-x-2 py-3 rounded-md font-medium transition-colors',
              side === 'buy'
                ? 'bg-trading-success-500 text-white'
                : 'text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Buy</span>
          </button>
          <button
            onClick={() => setSide('sell')}
            className={cn(
              'flex-1 flex items-center justify-center space-x-2 py-3 rounded-md font-medium transition-colors',
              side === 'sell'
                ? 'bg-trading-danger-500 text-white'
                : 'text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            <TrendingDown className="h-4 w-4" />
            <span>Sell</span>
          </button>
        </div>

        {/* Order Type */}
        <div>
          <label className="trading-form-label">Order Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
            className="trading-form-select"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className="trading-form-label">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="trading-form-input"
          />
        </div>

        {/* Price (only for limit orders) */}
        {orderType === 'limit' && (
          <div>
            <label className="trading-form-label">Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="trading-form-input"
            />
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-trading-bg-secondary rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-trading-text-muted">Symbol</span>
            <span className="text-trading-text-primary font-mono">AAPL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-trading-text-muted">Current Price</span>
            <span className="text-trading-text-primary font-mono">$178.25</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-trading-text-muted">Estimated Cost</span>
            <span className="text-trading-text-primary font-mono">$0.00</span>
          </div>
        </div>

        {/* Place Order Button */}
        <button
          className={cn(
            'w-full py-3 rounded-lg font-semibold transition-colors',
            side === 'buy'
              ? 'bg-trading-success-500 hover:bg-trading-success-600 text-white'
              : 'bg-trading-danger-500 hover:bg-trading-danger-600 text-white'
          )}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} AAPL
        </button>
      </div>
    </div>
  );
}