'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Bell, Plus, Trash2 } from 'lucide-react';

interface Alert {
  id: string;
  symbol: string;
  type: 'price' | 'volume' | 'ml_signal' | 'technical';
  condition: string;
  target: number;
  currentValue: number;
  status: 'active' | 'triggered' | 'disabled';
  timestamp: number;
}

interface AlertsPanelProps {
  symbol: string;
}

export function AlertsPanel({ symbol }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: '1',
      symbol: 'AAPL',
      type: 'price',
      condition: 'price_above',
      target: 180,
      currentValue: 175.30,
      status: 'active',
      timestamp: Date.now() - 86400000
    },
    {
      id: '2',
      symbol: 'AAPL',
      type: 'ml_signal',
      condition: 'confidence_above',
      target: 0.8,
      currentValue: 0.72,
      status: 'active',
      timestamp: Date.now() - 172800000
    }
  ]);

  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({
    type: 'price' as const,
    condition: 'price_above',
    target: ''
  });

  const handleCreateAlert = () => {
    if (!newAlert.target) return;

    const alert: Alert = {
      id: Math.random().toString(36).substr(2, 9),
      symbol,
      type: newAlert.type,
      condition: newAlert.condition,
      target: Number(newAlert.target),
      currentValue: 0, // This would be fetched from current market data
      status: 'active',
      timestamp: Date.now()
    };

    setAlerts(prev => [alert, ...prev]);
    setNewAlert({ type: 'price', condition: 'price_above', target: '' });
    setShowCreateAlert(false);
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'price': return 'Price';
      case 'volume': return 'Volume';
      case 'ml_signal': return 'ML Signal';
      case 'technical': return 'Technical';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-trading-accent-blue';
      case 'triggered': return 'text-trading-success';
      case 'disabled': return 'text-trading-text-muted';
      default: return 'text-trading-text-secondary';
    }
  };

  const symbolAlerts = alerts.filter(alert => alert.symbol === symbol);

  return (
    <div className="h-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-trading-accent-blue" />
          <h3 className="text-lg font-semibold text-trading-text-primary">
            Alerts
          </h3>
        </div>
        <button
          onClick={() => setShowCreateAlert(!showCreateAlert)}
          className="p-1 rounded hover:bg-trading-neutral-700 transition-colors"
        >
          <Plus className="h-4 w-4 text-trading-text-secondary" />
        </button>
      </div>

      {/* Create Alert Form */}
      {showCreateAlert && (
        <div className="bg-trading-bg-tertiary rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-trading-text-primary">
            Create Alert for {symbol}
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-trading-text-secondary mb-1">
                Type
              </label>
              <select
                value={newAlert.type}
                onChange={(e) => setNewAlert(prev => ({ 
                  ...prev, 
                  type: e.target.value as any 
                }))}
                className="w-full px-2 py-1 bg-trading-bg-secondary border border-trading-neutral-700 rounded text-sm text-trading-text-primary"
              >
                <option value="price">Price Alert</option>
                <option value="volume">Volume Alert</option>
                <option value="ml_signal">ML Signal Alert</option>
                <option value="technical">Technical Alert</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-trading-text-secondary mb-1">
                Condition
              </label>
              <select
                value={newAlert.condition}
                onChange={(e) => setNewAlert(prev => ({ 
                  ...prev, 
                  condition: e.target.value 
                }))}
                className="w-full px-2 py-1 bg-trading-bg-secondary border border-trading-neutral-700 rounded text-sm text-trading-text-primary"
              >
                {newAlert.type === 'price' && (
                  <>
                    <option value="price_above">Price Above</option>
                    <option value="price_below">Price Below</option>
                  </>
                )}
                {newAlert.type === 'volume' && (
                  <>
                    <option value="volume_above">Volume Above</option>
                    <option value="volume_spike">Volume Spike</option>
                  </>
                )}
                {newAlert.type === 'ml_signal' && (
                  <>
                    <option value="confidence_above">Confidence Above</option>
                    <option value="direction_change">Direction Change</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-trading-text-secondary mb-1">
                Target Value
              </label>
              <input
                type="number"
                step="0.01"
                value={newAlert.target}
                onChange={(e) => setNewAlert(prev => ({ 
                  ...prev, 
                  target: e.target.value 
                }))}
                placeholder="0.00"
                className="w-full px-2 py-1 bg-trading-bg-secondary border border-trading-neutral-700 rounded text-sm text-trading-text-primary"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreateAlert}
                disabled={!newAlert.target}
                className="flex-1 py-2 bg-trading-accent-blue text-white rounded text-sm font-medium disabled:opacity-50"
              >
                Create Alert
              </button>
              <button
                onClick={() => setShowCreateAlert(false)}
                className="px-4 py-2 bg-trading-bg-secondary text-trading-text-secondary rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts List */}
      <div className="space-y-2">
        {symbolAlerts.length === 0 ? (
          <div className="text-center text-trading-text-muted py-8">
            No alerts set for {symbol}
          </div>
        ) : (
          symbolAlerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-trading-bg-tertiary rounded-lg p-3 hover:bg-trading-neutral-800/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    alert.status === 'active' ? 'bg-trading-accent-blue' :
                    alert.status === 'triggered' ? 'bg-trading-success' : 'bg-trading-text-muted'
                  )} />
                  <span className="text-sm font-medium text-trading-text-primary">
                    {getAlertTypeLabel(alert.type)}
                  </span>
                  <span className={cn('text-xs capitalize', getStatusColor(alert.status))}>
                    {alert.status}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteAlert(alert.id)}
                  className="p-1 rounded hover:bg-trading-error/20 text-trading-text-muted hover:text-trading-error transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div className="text-sm text-trading-text-secondary mb-1">
                {alert.condition.replace(/_/g, ' ')} {alert.target}
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-trading-text-muted">
                  Current: {alert.currentValue}
                </span>
                <span className="text-trading-text-muted">
                  {new Date(alert.timestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}