'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Bell, Settings, User, TrendingUp, Wifi } from 'lucide-react';

interface TradingHeaderProps {
  className?: string;
}

export function TradingHeader({ className }: TradingHeaderProps) {
  const [connectionStatus, setConnectionStatus] = React.useState<'connected' | 'disconnected' | 'connecting'>('connected');

  return (
    <header className={cn(
      'h-16 bg-trading-bg-secondary border-b border-trading-neutral-700 flex items-center justify-between px-6',
      className
    )}>
      {/* Left Section - Logo & Navigation */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <TrendingUp className="h-8 w-8 text-trading-accent-blue" />
          <div>
            <h1 className="text-xl font-bold text-trading-text-primary">ML Trading Platform</h1>
            <p className="text-xs text-trading-text-muted">Enterprise Edition</p>
          </div>
        </div>

        <nav className="flex items-center space-x-1">
          <NavButton href="/dashboard" active>Dashboard</NavButton>
          <NavButton href="/portfolio">Portfolio</NavButton>
          <NavButton href="/analytics">Analytics</NavButton>
          <NavButton href="/strategies">Strategies</NavButton>
          <NavButton href="/research">Research</NavButton>
        </nav>
      </div>

      {/* Center Section - Market Status */}
      <div className="flex items-center space-x-6">
        <MarketStatusIndicator />
        <QuickStats />
      </div>

      {/* Right Section - User Actions */}
      <div className="flex items-center space-x-4">
        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <Wifi 
            className={cn(
              'h-4 w-4',
              connectionStatus === 'connected' && 'text-trading-success-500',
              connectionStatus === 'disconnected' && 'text-trading-danger-500',
              connectionStatus === 'connecting' && 'text-trading-warning-500 animate-pulse'
            )}
          />
          <span className={cn(
            'text-xs font-medium',
            connectionStatus === 'connected' && 'text-trading-success-500',
            connectionStatus === 'disconnected' && 'text-trading-danger-500',
            connectionStatus === 'connecting' && 'text-trading-warning-500'
          )}>
            {connectionStatus === 'connected' && 'Live'}
            {connectionStatus === 'disconnected' && 'Offline'}
            {connectionStatus === 'connecting' && 'Connecting...'}
          </span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <Bell className="h-5 w-5 text-trading-text-secondary" />
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-trading-danger-500 rounded-full"></span>
        </button>

        {/* Settings */}
        <button className="p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <Settings className="h-5 w-5 text-trading-text-secondary" />
        </button>

        {/* User Menu */}
        <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-trading-neutral-700 transition-colors">
          <User className="h-5 w-5 text-trading-text-secondary" />
          <span className="text-sm text-trading-text-primary">John Doe</span>
        </button>
      </div>
    </header>
  );
}

interface NavButtonProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}

function NavButton({ href, children, active = false }: NavButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active 
          ? 'bg-trading-accent-blue text-white' 
          : 'text-trading-text-secondary hover:text-trading-text-primary hover:bg-trading-neutral-700'
      )}
    >
      {children}
    </a>
  );
}

function MarketStatusIndicator() {
  const marketStatus = 'open'; // TODO: Get from market data service

  return (
    <div className="flex items-center space-x-2">
      <div className={cn(
        'h-2 w-2 rounded-full',
        marketStatus === 'open' ? 'bg-trading-success-500' : 'bg-trading-danger-500'
      )}></div>
      <span className="text-sm text-trading-text-secondary">
        Market {marketStatus === 'open' ? 'Open' : 'Closed'}
      </span>
    </div>
  );
}

function QuickStats() {
  // TODO: Get real data from market service
  const stats = [
    { label: 'S&P 500', value: '4,156.83', change: '+0.82%', positive: true },
    { label: 'NASDAQ', value: '12,845.78', change: '+1.24%', positive: true },
    { label: 'VIX', value: '18.45', change: '-2.15%', positive: false },
  ];

  return (
    <div className="flex items-center space-x-6">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="text-xs text-trading-text-muted">{stat.label}</div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-mono text-trading-text-primary">{stat.value}</span>
            <span className={cn(
              'text-xs font-medium',
              stat.positive ? 'text-trading-success-500' : 'text-trading-danger-500'
            )}>
              {stat.change}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}