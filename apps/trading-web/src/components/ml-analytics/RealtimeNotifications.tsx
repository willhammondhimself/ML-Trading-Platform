'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { 
  useMLAnalyticsStore, 
  selectRealtimeUpdates, 
  selectIsConnected 
} from '@/stores/ml-analytics-store';
import { PredictionUpdate } from '@/types/ml-analytics';
import { 
  Bell, 
  BellRing, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';
import { format } from 'date-fns';

interface RealtimeNotificationsProps {
  maxNotifications?: number;
  autoHideDelay?: number;
  showBadge?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
}

interface NotificationItem extends PredictionUpdate {
  id: string;
  isNew: boolean;
  isVisible: boolean;
  createdAt: number;
}

export function RealtimeNotifications({
  maxNotifications = 5,
  autoHideDelay = 5000,
  showBadge = true,
  position = 'top-right',
  className,
}: RealtimeNotificationsProps) {
  const realtimeUpdates = useMLAnalyticsStore(selectRealtimeUpdates);
  const isConnected = useMLAnalyticsStore(selectIsConnected);
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);

  // Process realtime updates into notifications
  useEffect(() => {
    if (realtimeUpdates.length === 0) return;

    const latestUpdate = realtimeUpdates[0];
    if (latestUpdate.timestamp <= lastUpdateTime) return;

    const notification: NotificationItem = {
      ...latestUpdate,
      id: `${latestUpdate.prediction.id}-${latestUpdate.timestamp}`,
      isNew: true,
      isVisible: true,
      createdAt: Date.now(),
    };

    setNotifications(prev => {
      const filtered = prev.slice(0, maxNotifications - 1);
      return [notification, ...filtered];
    });

    setLastUpdateTime(latestUpdate.timestamp);

    // Auto-hide notification after delay
    if (autoHideDelay > 0) {
      setTimeout(() => {
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id 
              ? { ...n, isNew: false }
              : n
          )
        );
      }, autoHideDelay);
    }
  }, [realtimeUpdates, lastUpdateTime, maxNotifications, autoHideDelay]);

  // Count unread notifications
  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.isNew).length;
  }, [notifications]);

  // Get notification icon and color based on update type
  const getNotificationStyle = useCallback((notification: NotificationItem) => {
    const { type, prediction } = notification;
    
    switch (type) {
      case 'new_prediction':
        return {
          icon: <Zap className="w-4 h-4" />,
          color: 'text-trading-accent-blue',
          bgColor: 'bg-trading-accent-blue/10',
          borderColor: 'border-trading-accent-blue/20',
          title: 'New Prediction',
        };
      case 'resolution':
        const accuracy = prediction.accuracy || 0;
        return {
          icon: accuracy > 0.8 ? 
            <CheckCircle className="w-4 h-4" /> : 
            <AlertCircle className="w-4 h-4" />,
          color: accuracy > 0.8 ? 'text-trading-success' : 'text-trading-warning',
          bgColor: accuracy > 0.8 ? 'bg-trading-success/10' : 'bg-trading-warning/10',
          borderColor: accuracy > 0.8 ? 'border-trading-success/20' : 'border-trading-warning/20',
          title: 'Prediction Resolved',
        };
      case 'correction':
        return {
          icon: <Target className="w-4 h-4" />,
          color: 'text-trading-warning',
          bgColor: 'bg-trading-warning/10',
          borderColor: 'border-trading-warning/20',
          title: 'Prediction Updated',
        };
      case 'expiry':
        return {
          icon: <Clock className="w-4 h-4" />,
          color: 'text-trading-text-secondary',
          bgColor: 'bg-trading-neutral-700/10',
          borderColor: 'border-trading-neutral-700/20',
          title: 'Prediction Expired',
        };
      default:
        return {
          icon: <Bell className="w-4 h-4" />,
          color: 'text-trading-text-secondary',
          bgColor: 'bg-trading-neutral-700/10',
          borderColor: 'border-trading-neutral-700/20',
          title: 'Update',
        };
    }
  }, []);

  // Handle notification dismiss
  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.filter(n => n.id !== notificationId)
    );
  }, []);

  // Handle mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isNew: false }))
    );
  }, []);

  // Position classes
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4', 
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  if (!isConnected && notifications.length === 0) {
    return null;
  }

  return (
    <div className={cn('fixed z-50', positionClasses[position], className)}>
      {/* Notification Bell */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className={cn(
            'p-3 rounded-full border transition-all duration-200',
            'bg-trading-bg-secondary border-trading-neutral-700',
            'hover:bg-trading-bg-primary',
            showNotifications && 'bg-trading-bg-primary border-trading-accent-blue/50',
            unreadCount > 0 && 'shadow-lg shadow-trading-accent-blue/20'
          )}
        >
          {unreadCount > 0 ? (
            <BellRing className="w-5 h-5 text-trading-accent-blue" />
          ) : (
            <Bell className="w-5 h-5 text-trading-text-secondary" />
          )}
        </button>

        {/* Unread Badge */}
        {showBadge && unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-trading-accent-blue text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}

        {/* Pulsing Ring for New Notifications */}
        {unreadCount > 0 && (
          <div className="absolute -inset-1 rounded-full border-2 border-trading-accent-blue animate-pulse opacity-30" />
        )}
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className={cn(
          'absolute w-80 max-h-96 overflow-hidden',
          'bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg shadow-xl',
          'mt-2',
          position.includes('left') ? 'left-0' : 'right-0'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-trading-neutral-700">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-trading-success animate-pulse' : 'bg-trading-text-secondary'
                )} />
                <h3 className="text-sm font-medium text-trading-text-primary">
                  Live Updates
                </h3>
              </div>
              {unreadCount > 0 && (
                <span className="text-xs bg-trading-accent-blue text-white px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1 text-xs text-trading-text-secondary hover:text-trading-text-primary transition-colors"
                  title="Mark all as read"
                >
                  <Eye className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => setShowNotifications(false)}
                className="p-1 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <EyeOff className="w-8 h-8 text-trading-text-secondary mb-2" />
                <p className="text-sm text-trading-text-secondary">
                  No recent updates
                </p>
                <p className="text-xs text-trading-text-secondary mt-1">
                  {isConnected ? 'Connected and monitoring...' : 'Waiting for connection...'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-trading-neutral-700">
                {notifications.map((notification) => {
                  const style = getNotificationStyle(notification);
                  const { prediction } = notification;
                  
                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-4 transition-all duration-200',
                        'hover:bg-trading-bg-primary/50',
                        notification.isNew && 'bg-trading-accent-blue/5',
                        style.bgColor
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'p-1.5 rounded-full border',
                          style.color,
                          style.borderColor
                        )}>
                          {style.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className={cn(
                              'text-sm font-medium',
                              style.color
                            )}>
                              {style.title}
                            </h4>
                            <div className="flex items-center gap-1">
                              {notification.isNew && (
                                <div className="w-2 h-2 bg-trading-accent-blue rounded-full" />
                              )}
                              <button
                                onClick={() => dismissNotification(notification.id)}
                                className="p-0.5 text-trading-text-secondary hover:text-trading-text-primary transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-1">
                            <p className="text-xs text-trading-text-primary">
                              {prediction.symbol} • {prediction.modelName}
                            </p>
                            <p className="text-xs text-trading-text-secondary">
                              ${prediction.value.toFixed(2)} 
                              {prediction.confidence && (
                                <span className="ml-1">
                                  ({(prediction.confidence * 100).toFixed(1)}% confidence)
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Resolution Details */}
                          {notification.type === 'resolution' && prediction.actualValue && (
                            <div className="mt-2 p-2 bg-trading-bg-primary/50 rounded text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-trading-text-secondary">Actual:</span>
                                <span className="text-trading-text-primary font-medium">
                                  ${prediction.actualValue.toFixed(2)}
                                </span>
                              </div>
                              {prediction.accuracy !== undefined && (
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-trading-text-secondary">Accuracy:</span>
                                  <span className={cn(
                                    'font-medium',
                                    prediction.accuracy > 0.8 ? 'text-trading-success' :
                                    prediction.accuracy > 0.5 ? 'text-trading-warning' : 'text-trading-error'
                                  )}>
                                    {(prediction.accuracy * 100).toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-trading-text-secondary">
                              {format(new Date(notification.createdAt), 'HH:mm:ss')}
                            </span>
                            <span className="text-xs text-trading-text-secondary">
                              {notification.trigger}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-trading-neutral-700 bg-trading-bg-primary/50">
              <div className="flex items-center justify-between text-xs text-trading-text-secondary">
                <span>
                  {notifications.length} of {maxNotifications} notifications
                </span>
                {isConnected && (
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-trading-success rounded-full animate-pulse" />
                    Live monitoring active
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}