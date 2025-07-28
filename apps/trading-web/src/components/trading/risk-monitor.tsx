import { Shield } from 'lucide-react';

export function RiskMonitor() {
  return (
    <div className="h-full">
      <div className="flex items-center space-x-2 mb-4">
        <Shield className="h-5 w-5 text-trading-warning-500" />
        <h3 className="text-lg font-semibold text-trading-text-primary">Risk Monitor</h3>
      </div>
      <div className="space-y-3">
        <div className="trading-card p-3">
          <div className="text-sm text-trading-text-muted mb-1">Daily P&L Limit</div>
          <div className="flex justify-between">
            <span className="text-trading-text-primary">$8,500 / $10,000</span>
            <span className="text-trading-warning-500">85%</span>
          </div>
        </div>
        <div className="trading-card p-3">
          <div className="text-sm text-trading-text-muted mb-1">Position Limit</div>
          <div className="flex justify-between">
            <span className="text-trading-text-primary">$75,000 / $100,000</span>
            <span className="text-trading-success-500">75%</span>
          </div>
        </div>
      </div>
    </div>
  );
}