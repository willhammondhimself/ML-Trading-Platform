'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ShoppingCart, TrendingUp, TrendingDown, Shield, AlertTriangle, Calculator, Zap } from 'lucide-react';

interface PositionSizeRecommendation {
  symbol: string;
  recommendedSize: number;
  maxAllowedSize: number;
  riskScore: number;
  kellyFraction: number;
  confidenceLevel: number;
  reasoning: string;
  riskFactors: string[];
}

interface TradeAnalysis {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  tradeValue: number;
  riskAmount: number;
  rewardAmount: number;
  riskRewardRatio: number;
  riskPercent: number;
  newLeverage: number;
  newConcentration: number;
  riskScore: number;
  riskFactors: string[];
  recommendation: 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK';
  approved: boolean;
}

interface OrderPanelProps {
  symbol: string;
}

export function OrderPanel({ symbol }: OrderPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRiskAnalysis, setShowRiskAnalysis] = useState(true);
  
  // Risk management states
  const [positionRecommendation, setPositionRecommendation] = useState<PositionSizeRecommendation | null>(null);
  const [tradeAnalysis, setTradeAnalysis] = useState<TradeAnalysis | null>(null);
  const [currentPrice, setCurrentPrice] = useState(150); // Mock current price
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Get position size recommendation when symbol or stop loss changes
  useEffect(() => {
    if (stopLoss) {
      getPositionSizeRecommendation();
    }
  }, [symbol, stopLoss]);

  // Analyze trade when quantity or price changes
  useEffect(() => {
    if (quantity && (price || orderType === 'market')) {
      analyzeTrade();
    } else {
      setTradeAnalysis(null);
    }
  }, [quantity, price, orderType, side, stopLoss, takeProfit]);

  const getPositionSizeRecommendation = async () => {
    if (!stopLoss) return;

    try {
      const entryPrice = orderType === 'limit' ? parseFloat(price) : currentPrice;
      const response = await fetch('http://localhost:8001/api/risk-management/position-size', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          entryPrice,
          stopLoss: parseFloat(stopLoss),
          winRate: 0.55, // Default values
          avgWin: 1.5,
          avgLoss: 1.0
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPositionRecommendation(data.recommendation);
      }
    } catch (error) {
      console.error('Error getting position size recommendation:', error);
    }
  };

  const analyzeTrade = async () => {
    if (!quantity) return;

    setIsAnalyzing(true);
    try {
      const entryPrice = orderType === 'limit' ? parseFloat(price) : currentPrice;
      const response = await fetch('http://localhost:8001/api/risk-management/analyze-trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          side,
          quantity: parseInt(quantity),
          entryPrice,
          stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTradeAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('Error analyzing trade:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const useRecommendedSize = () => {
    if (positionRecommendation) {
      setQuantity(positionRecommendation.recommendedSize.toString());
    }
  };

  const handleSubmitOrder = async () => {
    if (!quantity || (orderType === 'limit' && !price)) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/portfolio/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          side,
          quantity: Number(quantity),
          price: orderType === 'limit' ? Number(price) : undefined,
          type: orderType,
        }),
      });

      if (response.ok) {
        const order = await response.json();
        console.log('Order placed:', order);
        
        // Reset form
        setQuantity('');
        setPrice('');
        
        alert(`${side.toUpperCase()} order for ${quantity} ${symbol} placed successfully!`);
      } else {
        throw new Error('Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'LOW_RISK': return 'text-green-600 bg-green-50 border-green-200';
      case 'MEDIUM_RISK': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'HIGH_RISK': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="h-full bg-trading-bg-tertiary rounded-lg p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-trading-accent-blue" />
          <h3 className="text-lg font-semibold text-trading-text-primary">
            Place Order
          </h3>
        </div>
        <button
          onClick={() => setShowRiskAnalysis(!showRiskAnalysis)}
          className={cn(
            'p-2 rounded-lg text-xs transition-colors',
            showRiskAnalysis
              ? 'bg-blue-100 text-blue-600 border border-blue-200'
              : 'bg-trading-bg-secondary text-trading-text-secondary hover:text-trading-text-primary'
          )}
        >
          <Shield className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Symbol Display */}
        <div className="bg-trading-bg-secondary rounded-lg p-3">
          <div className="text-sm text-trading-text-secondary">Symbol</div>
          <div className="text-xl font-bold text-trading-text-primary">{symbol}</div>
          <div className="text-sm text-trading-text-muted">
            Current: {formatCurrency(currentPrice)}
          </div>
        </div>

        {/* Order Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide('buy')}
            className={cn(
              'p-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
              side === 'buy'
                ? 'bg-trading-success text-white'
                : 'bg-trading-bg-secondary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            <TrendingUp className="h-4 w-4" />
            BUY
          </button>
          <button
            onClick={() => setSide('sell')}
            className={cn(
              'p-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
              side === 'sell'
                ? 'bg-trading-error text-white'
                : 'bg-trading-bg-secondary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            <TrendingDown className="h-4 w-4" />
            SELL
          </button>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderType('market')}
            className={cn(
              'p-2 rounded-lg text-sm font-medium transition-colors',
              orderType === 'market'
                ? 'bg-trading-accent-blue text-white'
                : 'bg-trading-bg-secondary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('limit')}
            className={cn(
              'p-2 rounded-lg text-sm font-medium transition-colors',
              orderType === 'limit'
                ? 'bg-trading-accent-blue text-white'
                : 'bg-trading-bg-secondary text-trading-text-secondary hover:text-trading-text-primary'
            )}
          >
            Limit
          </button>
        </div>

        {/* Price (for limit orders) */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm text-trading-text-secondary mb-2">
              Limit Price
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg text-trading-text-primary placeholder-trading-text-muted focus:outline-none focus:border-trading-accent-blue"
            />
          </div>
        )}

        {/* Risk Management Inputs */}
        {showRiskAnalysis && (
          <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Risk Management</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-blue-700 mb-1">
                  Stop Loss
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">
                  Take Profit
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Position Size Recommendation */}
        {showRiskAnalysis && positionRecommendation && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Recommended Size</span>
              </div>
              <button
                onClick={useRecommendedSize}
                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
              >
                Use
              </button>
            </div>
            
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-green-700">Shares:</span>
                <span className="font-medium text-green-800">{positionRecommendation.recommendedSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Risk Score:</span>
                <span className="font-medium text-green-800">{formatPercent(positionRecommendation.riskScore)}</span>
              </div>
              <div className="text-xs text-green-600 mt-2">
                {positionRecommendation.reasoning}
              </div>
            </div>
          </div>
        )}

        {/* Quantity Input */}
        <div>
          <label className="block text-sm text-trading-text-secondary mb-2">
            Quantity
            {positionRecommendation && (
              <span className="text-xs text-blue-600 ml-2">
                (Max: {positionRecommendation.maxAllowedSize})
              </span>
            )}
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg text-trading-text-primary placeholder-trading-text-muted focus:outline-none focus:border-trading-accent-blue"
          />
        </div>

        {/* Trade Risk Analysis */}
        {showRiskAnalysis && tradeAnalysis && (
          <div className={`p-3 rounded-lg border ${getRiskColor(tradeAnalysis.recommendation)}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Trade Analysis</span>
            </div>
            
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Risk Level:</span>
                <span className="font-medium">{tradeAnalysis.recommendation.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Trade Value:</span>
                <span className="font-medium">{formatCurrency(tradeAnalysis.tradeValue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Portfolio Risk:</span>
                <span className="font-medium">{formatPercent(tradeAnalysis.riskPercent)}</span>
              </div>
              {tradeAnalysis.riskRewardRatio > 0 && (
                <div className="flex justify-between">
                  <span>Risk/Reward:</span>
                  <span className="font-medium">1:{tradeAnalysis.riskRewardRatio.toFixed(2)}</span>
                </div>
              )}
              
              {tradeAnalysis.riskFactors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                  <div className="text-xs">Risk Factors:</div>
                  <ul className="text-xs mt-1 space-y-1">
                    {tradeAnalysis.riskFactors.map((factor, index) => (
                      <li key={index}>• {factor}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Summary */}
        {quantity && (
          <div className="bg-trading-bg-secondary rounded-lg p-3 space-y-2">
            <div className="text-sm text-trading-text-secondary">Order Summary</div>
            <div className="flex justify-between">
              <span className="text-sm text-trading-text-muted">Type:</span>
              <span className="text-sm text-trading-text-primary capitalize">
                {orderType} {side}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-trading-text-muted">Quantity:</span>
              <span className="text-sm text-trading-text-primary">{quantity}</span>
            </div>
            {orderType === 'limit' && price && (
              <div className="flex justify-between">
                <span className="text-sm text-trading-text-muted">Price:</span>
                <span className="text-sm text-trading-text-primary">{formatCurrency(parseFloat(price))}</span>
              </div>
            )}
            <div className="flex justify-between font-medium pt-2 border-t border-trading-neutral-700">
              <span className="text-sm text-trading-text-muted">Est. Total:</span>
              <span className="text-sm text-trading-text-primary">
                {orderType === 'limit' && price 
                  ? formatCurrency(Number(quantity) * Number(price))
                  : formatCurrency(Number(quantity) * currentPrice)
                }
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmitOrder}
          disabled={!quantity || isSubmitting || (showRiskAnalysis && tradeAnalysis && !tradeAnalysis.approved)}
          className={cn(
            'w-full py-3 rounded-lg font-medium transition-colors',
            side === 'buy'
              ? 'bg-trading-success hover:bg-green-600 text-white'
              : 'bg-trading-error hover:bg-red-600 text-white',
            (!quantity || isSubmitting || (showRiskAnalysis && tradeAnalysis && !tradeAnalysis.approved)) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSubmitting ? 'Placing Order...' : 
           showRiskAnalysis && tradeAnalysis && !tradeAnalysis.approved ? 'Risk Limits Exceeded' :
           `${side.toUpperCase()} ${symbol}`}
        </button>

        {/* Risk Analysis Loading */}
        {isAnalyzing && (
          <div className="flex items-center justify-center gap-2 text-sm text-trading-text-muted">
            <Zap className="h-4 w-4 animate-pulse" />
            Analyzing trade risk...
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-xs text-trading-text-muted text-center">
          This is a demo trading interface. No real orders will be executed.
        </div>
      </div>
    </div>
  );
}