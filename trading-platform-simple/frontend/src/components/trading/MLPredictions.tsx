'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Brain, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface MLPrediction {
  symbol: string;
  prediction: number;
  confidence: number;
  direction: 'up' | 'down' | 'sideways';
  timeframe: string;
  features: Record<string, number>;
  timestamp: number;
}

interface MLPredictionsProps {
  symbol: string;
}

export function MLPredictions({ symbol }: MLPredictionsProps) {
  const [prediction, setPrediction] = useState<MLPrediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const response = await fetch(`/api/ml/prediction/${symbol}`);
        if (response.ok) {
          const data = await response.json();
          setPrediction(data);
        }
      } catch (error) {
        console.error('Error fetching ML prediction:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
    
    // Update every 60 seconds
    const interval = setInterval(fetchPrediction, 60000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Listen for real-time ML prediction updates
  useEffect(() => {
    const handleMLUpdate = (event: CustomEvent) => {
      const data = event.detail;
      if (data.symbol === symbol) {
        setPrediction(data);
      }
    };

    window.addEventListener('ml-prediction', handleMLUpdate as EventListener);
    return () => {
      window.removeEventListener('ml-prediction', handleMLUpdate as EventListener);
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-trading-text-secondary">Loading ML predictions...</div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-trading-text-secondary">No ML prediction available</div>
      </div>
    );
  }

  const getDirectionIcon = () => {
    switch (prediction.direction) {
      case 'up':
        return <TrendingUp className="h-5 w-5 text-trading-success" />;
      case 'down':
        return <TrendingDown className="h-5 w-5 text-trading-error" />;
      default:
        return <Activity className="h-5 w-5 text-trading-text-secondary" />;
    }
  };

  const getDirectionColor = () => {
    switch (prediction.direction) {
      case 'up':
        return 'text-trading-success';
      case 'down':
        return 'text-trading-error';
      default:
        return 'text-trading-text-secondary';
    }
  };

  const topFeatures = Object.entries(prediction.features)
    .sort(([,a], [,b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 5);

  return (
    <div className="h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-trading-accent-blue" />
        <h3 className="text-lg font-semibold text-trading-text-primary">
          ML Prediction
        </h3>
      </div>

      {/* Main Prediction */}
      <div className="bg-trading-bg-tertiary rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-trading-text-secondary">
            {prediction.timeframe} Prediction
          </div>
          <div className="text-xs text-trading-text-muted">
            {symbol}
          </div>
        </div>

        <div className="space-y-3">
          {/* Direction & Confidence */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getDirectionIcon()}
              <span className={cn('text-lg font-medium capitalize', getDirectionColor())}>
                {prediction.direction}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs text-trading-text-muted">Confidence</div>
              <div className="text-lg font-bold text-trading-text-primary">
                {(prediction.confidence * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Confidence Bar */}
          <div className="w-full bg-trading-bg-secondary rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                prediction.confidence > 0.7 ? 'bg-trading-success' :
                prediction.confidence > 0.5 ? 'bg-trading-warning' : 'bg-trading-error'
              )}
              style={{ width: `${prediction.confidence * 100}%` }}
            />
          </div>

          {/* Raw Prediction */}
          <div className="text-center py-2 border-t border-trading-neutral-700">
            <div className="text-xs text-trading-text-muted">Expected Price Change</div>
            <div className={cn(
              'text-xl font-mono font-bold',
              prediction.prediction >= 0 ? 'text-trading-success' : 'text-trading-error'
            )}>
              {prediction.prediction >= 0 ? '+' : ''}{(prediction.prediction * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Feature Importance */}
      <div className="bg-trading-bg-tertiary rounded-lg p-4">
        <div className="text-sm font-medium text-trading-text-primary mb-3">
          Key Factors
        </div>
        
        <div className="space-y-2">
          {topFeatures.map(([feature, value], index) => (
            <div key={feature} className="flex items-center justify-between">
              <div className="text-xs text-trading-text-secondary">
                {feature.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 bg-trading-bg-secondary rounded-full h-1.5">
                  <div
                    className={cn(
                      'h-1.5 rounded-full',
                      value >= 0 ? 'bg-trading-success' : 'bg-trading-error'
                    )}
                    style={{ 
                      width: `${Math.abs(value) * 100}%`,
                      marginLeft: value < 0 ? `${100 - Math.abs(value) * 100}%` : '0'
                    }}
                  />
                </div>
                <div className={cn(
                  'text-xs font-mono w-12 text-right',
                  value >= 0 ? 'text-trading-success' : 'text-trading-error'
                )}>
                  {value.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Info */}
      <div className="bg-trading-bg-tertiary rounded-lg p-4">
        <div className="text-sm font-medium text-trading-text-primary mb-2">
          Model Information
        </div>
        
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-trading-text-muted">Model Type:</span>
            <span className="text-trading-text-primary">Random Forest</span>
          </div>
          <div className="flex justify-between">
            <span className="text-trading-text-muted">Accuracy:</span>
            <span className="text-trading-text-primary">72.4%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-trading-text-muted">Last Updated:</span>
            <span className="text-trading-text-primary">
              {new Date(prediction.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-trading-text-muted text-center">
        ML predictions are for educational purposes only. Not financial advice.
      </div>
    </div>
  );
}