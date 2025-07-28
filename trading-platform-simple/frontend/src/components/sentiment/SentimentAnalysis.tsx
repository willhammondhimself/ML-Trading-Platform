'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, MessageSquare, BarChart3, Eye, Heart } from 'lucide-react';

interface SentimentData {
  symbol: string;
  sentiment: number;
  confidence: number;
  sources: {
    news: number;
    social: number;
    analyst: number;
  };
  signals: {
    bullish: string[];
    bearish: string[];
    neutral: string[];
  };
  volume: {
    mentions: number;
    engagement: number;
    reach: number;
  };
  timestamp: number;
}

interface MarketSentiment {
  overall: number;
  bullishPercent: number;
  bearishPercent: number;
  topBullish: string[];
  topBearish: string[];
}

interface SentimentAnalysisProps {
  symbol?: string;
  showMarketOverview?: boolean;
  height?: number;
}

export function SentimentAnalysis({ 
  symbol, 
  showMarketOverview = true,
  height = 400 
}: SentimentAnalysisProps) {
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSentimentData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (symbol) {
          // Fetch specific symbol sentiment
          const response = await fetch(`/api/sentiment/symbol/${symbol}`);
          if (!response.ok) {
            throw new Error('Failed to fetch sentiment data');
          }
          const data = await response.json();
          setSentimentData(data);
        }

        if (showMarketOverview) {
          // Fetch market sentiment
          const marketResponse = await fetch('/api/sentiment/market');
          if (!marketResponse.ok) {
            throw new Error('Failed to fetch market sentiment');
          }
          const marketData = await response.json();
          setMarketSentiment(marketData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSentimentData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSentimentData, 30000);
    return () => clearInterval(interval);
  }, [symbol, showMarketOverview]);

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.3) return 'text-green-400';
    if (sentiment < -0.3) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getSentimentBgColor = (sentiment: number) => {
    if (sentiment > 0.3) return 'bg-green-900/20 border-green-500';
    if (sentiment < -0.3) return 'bg-red-900/20 border-red-500';
    return 'bg-yellow-900/20 border-yellow-500';
  };

  const getSentimentLabel = (sentiment: number) => {
    if (sentiment > 0.5) return 'Very Bullish';
    if (sentiment > 0.3) return 'Bullish';
    if (sentiment > 0.1) return 'Slightly Bullish';
    if (sentiment > -0.1) return 'Neutral';
    if (sentiment > -0.3) return 'Slightly Bearish';
    if (sentiment > -0.5) return 'Bearish';
    return 'Very Bearish';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6" style={{ height }}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-700 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6" style={{ height }}>
        <div className="text-center text-red-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-lg font-semibold mb-1">Sentiment Data Unavailable</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6" style={{ height }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white flex items-center">
          <MessageSquare className="w-6 h-6 mr-2" />
          {symbol ? `${symbol} Sentiment` : 'Market Sentiment'}
        </h3>
        {sentimentData && (
          <div className="text-xs text-gray-400">
            Updated: {new Date(sentimentData.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Symbol Sentiment */}
      {sentimentData && (
        <div className="space-y-4 mb-6">
          {/* Overall Sentiment */}
          <div className={`p-4 rounded-lg border ${getSentimentBgColor(sentimentData.sentiment)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {sentimentData.sentiment >= 0 ? (
                  <TrendingUp className={`w-5 h-5 ${getSentimentColor(sentimentData.sentiment)}`} />
                ) : (
                  <TrendingDown className={`w-5 h-5 ${getSentimentColor(sentimentData.sentiment)}`} />
                )}
                <span className="text-lg font-semibold text-white">
                  {getSentimentLabel(sentimentData.sentiment)}
                </span>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getSentimentColor(sentimentData.sentiment)}`}>
                  {(sentimentData.sentiment * 100).toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">
                  {(sentimentData.confidence * 100).toFixed(1)}% confidence
                </div>
              </div>
            </div>

            {/* Sentiment Sources */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="text-center">
                <div className="text-sm text-gray-400">News</div>
                <div className={`font-semibold ${getSentimentColor(sentimentData.sources.news)}`}>
                  {(sentimentData.sources.news * 100).toFixed(0)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">Social</div>
                <div className={`font-semibold ${getSentimentColor(sentimentData.sources.social)}`}>
                  {(sentimentData.sources.social * 100).toFixed(0)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">Analyst</div>
                <div className={`font-semibold ${getSentimentColor(sentimentData.sources.analyst)}`}>
                  {(sentimentData.sources.analyst * 100).toFixed(0)}
                </div>
              </div>
            </div>
          </div>

          {/* Volume Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-700 p-3 rounded-lg text-center">
              <MessageSquare className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">
                {formatNumber(sentimentData.volume.mentions)}
              </div>
              <div className="text-xs text-gray-400">Mentions</div>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg text-center">
              <Heart className="w-5 h-5 text-pink-400 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">
                {formatNumber(sentimentData.volume.engagement)}
              </div>
              <div className="text-xs text-gray-400">Engagement</div>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg text-center">
              <Eye className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">
                {formatNumber(sentimentData.volume.reach)}
              </div>
              <div className="text-xs text-gray-400">Reach</div>
            </div>
          </div>

          {/* Sentiment Signals */}
          <div className="space-y-2">
            {sentimentData.signals.bullish.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-green-400 mb-1">Bullish Signals</div>
                <div className="space-y-1">
                  {sentimentData.signals.bullish.map((signal, index) => (
                    <div key={index} className="text-xs text-green-300 bg-green-900/20 px-2 py-1 rounded">
                      • {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sentimentData.signals.bearish.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-red-400 mb-1">Bearish Signals</div>
                <div className="space-y-1">
                  {sentimentData.signals.bearish.map((signal, index) => (
                    <div key={index} className="text-xs text-red-300 bg-red-900/20 px-2 py-1 rounded">
                      • {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sentimentData.signals.neutral.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-yellow-400 mb-1">Neutral Indicators</div>
                <div className="space-y-1">
                  {sentimentData.signals.neutral.map((signal, index) => (
                    <div key={index} className="text-xs text-yellow-300 bg-yellow-900/20 px-2 py-1 rounded">
                      • {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Market Overview */}
      {showMarketOverview && marketSentiment && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Market Overview
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700 p-3 rounded-lg">
              <div className="text-sm text-gray-400 mb-1">Overall Sentiment</div>
              <div className={`text-lg font-bold ${getSentimentColor(marketSentiment.overall)}`}>
                {(marketSentiment.overall * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-gray-700 p-3 rounded-lg">
              <div className="text-sm text-gray-400 mb-1">Bullish/Bearish</div>
              <div className="text-sm">
                <span className="text-green-400">{marketSentiment.bullishPercent.toFixed(0)}%</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-red-400">{marketSentiment.bearishPercent.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Top Movers */}
          <div className="grid grid-cols-2 gap-4 mt-3">
            {marketSentiment.topBullish.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-green-400 mb-2">Most Bullish</div>
                <div className="space-y-1">
                  {marketSentiment.topBullish.slice(0, 2).map((symbol, index) => (
                    <div key={index} className="text-xs text-green-300 bg-green-900/20 px-2 py-1 rounded">
                      {symbol}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {marketSentiment.topBearish.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-red-400 mb-2">Most Bearish</div>
                <div className="space-y-1">
                  {marketSentiment.topBearish.slice(0, 2).map((symbol, index) => (
                    <div key={index} className="text-xs text-red-300 bg-red-900/20 px-2 py-1 rounded">
                      {symbol}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}