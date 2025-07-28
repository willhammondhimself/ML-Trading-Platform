'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Wallet, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

export function PortfolioSummary() {
  return (
    <div className="h-full">
      <div className="flex items-center space-x-2 mb-4">
        <Wallet className="h-5 w-5 text-trading-accent-blue" />
        <h3 className="text-lg font-semibold text-trading-text-primary">Portfolio</h3>
      </div>
      
      <div className="grid grid-cols-4 gap-4 h-32">
        <StatCard
          title="Total Value"
          value="$125,420.50"
          change="+2,350.75"
          changePercent="+1.91%"
          icon={DollarSign}
          positive
        />
        <StatCard
          title="Day P&L"
          value="+$1,250.30"
          change="+850.20"
          changePercent="+0.68%"
          icon={TrendingUp}
          positive
        />
        <StatCard
          title="Total P&L"
          value="+$8,750.45"
          change="+1,150.30"
          changePercent="+15.2%"
          icon={TrendingUp}
          positive
        />
        <StatCard
          title="Buying Power"
          value="$45,230.80"
          change="-1,500.00"
          changePercent="-3.2%"
          icon={DollarSign}
          positive={false}
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changePercent: string;
  icon: React.ComponentType<{ className?: string }>;
  positive: boolean;
}

function StatCard({ title, value, change, changePercent, icon: Icon, positive }: StatCardProps) {
  return (
    <div className="trading-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-trading-text-muted">{title}</span>
        <Icon className="h-4 w-4 text-trading-text-muted" />
      </div>
      <div className="space-y-1">
        <div className="text-xl font-bold text-trading-text-primary">{value}</div>
        <div className={cn(
          'text-sm font-medium',
          positive ? 'text-trading-success-500' : 'text-trading-danger-500'
        )}>
          {change} ({changePercent})
        </div>
      </div>
    </div>
  );
}