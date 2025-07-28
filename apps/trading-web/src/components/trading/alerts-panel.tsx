import { AlertTriangle, CheckCircle } from 'lucide-react';

export function AlertsPanel() {
  const alerts = [
    { type: 'warning', message: 'AAPL approaching resistance at $180', time: '2m ago' },
    { type: 'success', message: 'Portfolio reached daily profit target', time: '15m ago' },
  ];
  
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-trading-text-primary mb-4">Alerts</h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <div key={i} className="p-3 rounded-lg border border-trading-neutral-700 bg-trading-bg-tertiary">
            <div className="flex items-start space-x-2">
              {alert.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4 text-trading-warning-500 mt-0.5" />
              ) : (
                <CheckCircle className="h-4 w-4 text-trading-success-500 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm text-trading-text-primary">{alert.message}</p>
                <p className="text-xs text-trading-text-muted mt-1">{alert.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}