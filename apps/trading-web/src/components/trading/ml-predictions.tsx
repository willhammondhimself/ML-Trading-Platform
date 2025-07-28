'use client';

import { Brain } from 'lucide-react';

export function MLPredictions() {
  return (
    <div className="h-full">
      <div className="flex items-center space-x-2 mb-4">
        <Brain className="h-5 w-5 text-trading-accent-purple" />
        <h3 className="text-lg font-semibold text-trading-text-primary">ML Predictions</h3>
      </div>
      <div className="space-y-4">
        <div className="trading-card p-3">
          <div className="text-sm text-trading-text-muted mb-1">AAPL Next Hour</div>
          <div className="text-lg font-bold text-trading-success-500">Bullish 78%</div>
        </div>
        <div className="trading-card p-3">
          <div className="text-sm text-trading-text-muted mb-1">Market Sentiment</div>
          <div className="text-lg font-bold text-trading-warning-500">Neutral 52%</div>
        </div>
      </div>
    </div>
  );
}