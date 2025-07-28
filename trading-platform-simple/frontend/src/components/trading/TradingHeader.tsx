'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { BarChart3, Settings, Bell, User } from 'lucide-react';

export function TradingHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-trading-neutral-700 bg-trading-bg-secondary">
      {/* Logo and Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <BarChart3 className="h-8 w-8 text-trading-accent-blue" />
          <h1 className="text-xl font-bold text-trading-text-primary">
            Trading Platform
          </h1>
        </div>
        <div className="text-sm text-trading-text-secondary">
          ML-Powered Analytics
        </div>
      </div>

      {/* Market Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-trading-success rounded-full animate-pulse"></div>
          <span className="text-sm text-trading-text-secondary">Market Open</span>
        </div>
        
        {/* Quick Stats */}
        <div className="hidden md:flex items-center space-x-6 text-sm">
          <div className="text-center">
            <div className="text-trading-text-muted">S&P 500</div>
            <div className="text-trading-success font-mono">+0.24%</div>
          </div>
          <div className="text-center">
            <div className="text-trading-text-muted">NASDAQ</div>
            <div className="text-trading-success font-mono">+0.31%</div>
          </div>
          <div className="text-center">
            <div className="text-trading-text-muted">DOW</div>
            <div className="text-trading-error font-mono">-0.12%</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-3">
        <button className="p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <Bell className="h-5 w-5 text-trading-text-secondary" />
        </button>
        <button className="p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <Settings className="h-5 w-5 text-trading-text-secondary" />
        </button>
        <button className="p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <User className="h-5 w-5 text-trading-text-secondary" />
        </button>
      </div>
    </header>
  );
}