/**
 * Cache Key Generation Utilities
 * Standardized cache key generation for market data
 */

import { CacheKey, DataProvider, MarketDataType, TimePeriod } from '../types';
import { createHash } from 'crypto';

/**
 * Generate standardized cache key for market data
 */
export function generateCacheKey(key: CacheKey): string {
  const parts: string[] = [
    key.provider,
    key.dataType,
    key.symbol
  ];

  if (key.period) {
    parts.push(key.period);
  }

  if (key.timestamp) {
    // Round timestamp to nearest interval for better cache hits
    const roundedTimestamp = roundTimestamp(key.timestamp, key.period);
    parts.push(roundedTimestamp.toString());
  }

  if (key.parameters) {
    // Create deterministic hash of parameters
    const paramHash = hashParameters(key.parameters);
    parts.push(paramHash);
  }

  return parts.join(':');
}

/**
 * Generate cache key for real-time quotes
 */
export function generateQuoteCacheKey(
  provider: DataProvider,
  symbol: string,
  timestamp?: number
): string {
  return generateCacheKey({
    provider,
    dataType: MarketDataType.QUOTE,
    symbol,
    timestamp
  });
}

/**
 * Generate cache key for trades
 */
export function generateTradeCacheKey(
  provider: DataProvider,
  symbol: string,
  limit?: number
): string {
  return generateCacheKey({
    provider,
    dataType: MarketDataType.TRADE,
    symbol,
    parameters: limit ? { limit } : undefined
  });
}

/**
 * Generate cache key for order book
 */
export function generateOrderBookCacheKey(
  provider: DataProvider,
  symbol: string,
  depth?: number
): string {
  return generateCacheKey({
    provider,
    dataType: MarketDataType.ORDER_BOOK,
    symbol,
    parameters: depth ? { depth } : undefined
  });
}

/**
 * Generate cache key for historical OHLCV data
 */
export function generateOHLCVCacheKey(
  provider: DataProvider,
  symbol: string,
  period: TimePeriod,
  startTime?: number,
  endTime?: number
): string {
  const parameters: any = {};
  
  if (startTime) parameters.startTime = startTime;
  if (endTime) parameters.endTime = endTime;

  return generateCacheKey({
    provider,
    dataType: MarketDataType.OHLCV,
    symbol,
    period,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined
  });
}

/**
 * Generate cache key for news
 */
export function generateNewsCacheKey(
  provider: DataProvider,
  symbols: string[],
  limit?: number,
  since?: number
): string {
  const symbolKey = symbols.sort().join(',');
  const parameters: any = {};
  
  if (limit) parameters.limit = limit;
  if (since) parameters.since = since;

  return generateCacheKey({
    provider,
    dataType: MarketDataType.NEWS,
    symbol: symbolKey,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined
  });
}

/**
 * Generate cache key for social media data
 */
export function generateSocialCacheKey(
  provider: DataProvider,
  symbols: string[],
  platform?: string,
  limit?: number
): string {
  const symbolKey = symbols.sort().join(',');
  const parameters: any = {};
  
  if (platform) parameters.platform = platform;
  if (limit) parameters.limit = limit;

  return generateCacheKey({
    provider,
    dataType: MarketDataType.SOCIAL,
    symbol: symbolKey,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined
  });
}

/**
 * Generate wildcard cache key pattern for invalidation
 */
export function generateCachePattern(
  provider?: DataProvider,
  dataType?: MarketDataType,
  symbol?: string
): string {
  const parts: string[] = [];
  
  parts.push(provider || '*');
  parts.push(dataType || '*');
  parts.push(symbol || '*');
  parts.push('*'); // For additional parameters
  
  return parts.join(':');
}

/**
 * Parse cache key back into components
 */
export function parseCacheKey(cacheKey: string): Partial<CacheKey> {
  const parts = cacheKey.split(':');
  
  if (parts.length < 3) {
    throw new Error(`Invalid cache key format: ${cacheKey}`);
  }

  const result: Partial<CacheKey> = {
    provider: parts[0] as DataProvider,
    dataType: parts[1] as MarketDataType,
    symbol: parts[2]
  };

  if (parts.length > 3 && parts[3] !== '*') {
    // Try to parse as TimePeriod
    if (Object.values(TimePeriod).includes(parts[3] as TimePeriod)) {
      result.period = parts[3] as TimePeriod;
    } else if (!isNaN(Number(parts[3]))) {
      result.timestamp = Number(parts[3]);
    }
  }

  return result;
}

/**
 * Round timestamp to appropriate interval based on time period
 */
function roundTimestamp(timestamp: number, period?: TimePeriod): number {
  if (!period) {
    // For real-time data, round to nearest second
    return Math.floor(timestamp / 1000) * 1000;
  }

  switch (period) {
    case TimePeriod.SECOND:
      return Math.floor(timestamp / 1000) * 1000;
    case TimePeriod.MINUTE:
      return Math.floor(timestamp / (60 * 1000)) * (60 * 1000);
    case TimePeriod.FIVE_MINUTES:
      return Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000);
    case TimePeriod.FIFTEEN_MINUTES:
      return Math.floor(timestamp / (15 * 60 * 1000)) * (15 * 60 * 1000);
    case TimePeriod.THIRTY_MINUTES:
      return Math.floor(timestamp / (30 * 60 * 1000)) * (30 * 60 * 1000);
    case TimePeriod.HOUR:
      return Math.floor(timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
    case TimePeriod.FOUR_HOURS:
      return Math.floor(timestamp / (4 * 60 * 60 * 1000)) * (4 * 60 * 60 * 1000);
    case TimePeriod.DAY:
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    case TimePeriod.WEEK:
      const weekDate = new Date(timestamp);
      const day = weekDate.getDay();
      weekDate.setDate(weekDate.getDate() - day);
      weekDate.setHours(0, 0, 0, 0);
      return weekDate.getTime();
    case TimePeriod.MONTH:
      const monthDate = new Date(timestamp);
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);
      return monthDate.getTime();
    case TimePeriod.YEAR:
      const yearDate = new Date(timestamp);
      yearDate.setMonth(0, 1);
      yearDate.setHours(0, 0, 0, 0);
      return yearDate.getTime();
    default:
      return Math.floor(timestamp / 1000) * 1000;
  }
}

/**
 * Create deterministic hash of parameters object
 */
function hashParameters(parameters: Record<string, any>): string {
  // Sort keys to ensure deterministic hashing
  const sortedKeys = Object.keys(parameters).sort();
  const sortedParams: Record<string, any> = {};
  
  for (const key of sortedKeys) {
    sortedParams[key] = parameters[key];
  }
  
  const paramString = JSON.stringify(sortedParams);
  return createHash('sha256').update(paramString).digest('hex').substring(0, 16);
}

/**
 * Extract symbol from cache key
 */
export function extractSymbolFromCacheKey(cacheKey: string): string {
  const parts = cacheKey.split(':');
  return parts.length >= 3 ? parts[2] : '';
}

/**
 * Extract provider from cache key
 */
export function extractProviderFromCacheKey(cacheKey: string): DataProvider | undefined {
  const parts = cacheKey.split(':');
  return parts.length >= 1 ? parts[0] as DataProvider : undefined;
}

/**
 * Check if cache key matches pattern
 */
export function matchesCachePattern(cacheKey: string, pattern: string): boolean {
  const keyParts = cacheKey.split(':');
  const patternParts = pattern.split(':');
  
  if (patternParts.length > keyParts.length) {
    return false;
  }
  
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] !== '*' && patternParts[i] !== keyParts[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Generate cache key for provider health check
 */
export function generateHealthCacheKey(provider: DataProvider): string {
  return `health:${provider}:status`;
}

/**
 * Generate cache key for rate limit tracking
 */
export function generateRateLimitCacheKey(provider: DataProvider, identifier: string): string {
  return `ratelimit:${provider}:${identifier}`;
}

/**
 * Cache TTL utilities
 */
export const CacheTTL = {
  REALTIME: 5, // 5 seconds
  QUOTE: 5,
  TRADE: 10,
  ORDER_BOOK: 3,
  OHLCV_MINUTE: 60,
  OHLCV_HOUR: 3600,
  OHLCV_DAY: 86400,
  NEWS: 300, // 5 minutes
  SOCIAL: 60, // 1 minute
  HEALTH: 30, // 30 seconds
  RATE_LIMIT: 60 // 1 minute
} as const;