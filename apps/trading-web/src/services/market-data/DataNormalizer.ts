import { EventEmitter } from 'events';
import Decimal from 'decimal.js';
import {
  MarketDataProvider,
  PriceData,
  QuoteData,
  TradeData,
  OrderBookData,
  NewsData,
  SocialData,
  CompanyInfo,
  EconomicIndicator,
  DataQuality,
  validatePriceData,
  validateQuoteData,
  validateTradeData,
  validateOrderBookData,
  validateNewsData,
  validateSocialData
} from '@/types/market-data';

/**
 * Data Normalization Pipeline
 * 
 * Features:
 * - Provider-agnostic data standardization
 * - Timezone conversion and standardization
 * - Decimal precision normalization
 * - Symbol format standardization
 * - Currency conversion support
 * - Data quality validation and enhancement
 * - Missing data interpolation
 * - Outlier detection and handling
 * - Performance optimization with caching
 */

export interface NormalizationConfig {
  timezone: string;
  decimalPrecision: number;
  baseCurrency: string;
  enableCurrencyConversion: boolean;
  enableDataInterpolation: boolean;
  enableOutlierDetection: boolean;
  outlierThreshold: number; // standard deviations
  symbolMapping: Record<string, string>; // provider symbol -> standard symbol
  exchangeMapping: Record<string, string>; // provider exchange -> standard exchange
  currencyRates: Record<string, number>; // currency -> USD rate
  qualityWeights: Record<DataQuality, number>; // quality scores
}

export interface NormalizationResult<T> {
  normalized: T;
  original: any;
  transformations: TransformationLog[];
  quality: {
    score: number;
    issues: QualityIssue[];
    confidence: number;
  };
  metadata: {
    provider: MarketDataProvider;
    normalizedAt: number;
    processingTime: number;
  };
}

export interface TransformationLog {
  field: string;
  transformation: string;
  originalValue: any;
  normalizedValue: any;
  reason: string;
}

export interface QualityIssue {
  field: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface NormalizationMetrics {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  averageProcessingTime: number;
  qualityDistribution: Record<string, number>;
  transformationCounts: Record<string, number>;
  providerStats: Record<MarketDataProvider, {
    processed: number;
    averageQuality: number;
    commonIssues: string[];
  }>;
}

export class DataNormalizer extends EventEmitter {
  private config: NormalizationConfig;
  private metrics: NormalizationMetrics;
  private symbolCache: Map<string, string> = new Map();
  private currencyCache: Map<string, number> = new Map();
  private outlierCache: Map<string, { mean: number; stdDev: number; samples: number[] }> = new Map();

  constructor(config: NormalizationConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Normalize price data from any provider
   */
  async normalizePriceData(data: any, provider: MarketDataProvider): Promise<NormalizationResult<PriceData>> {
    const startTime = performance.now();
    const transformations: TransformationLog[] = [];
    const issues: QualityIssue[] = [];

    try {
      // Provider-specific raw data transformation
      const rawNormalized = this.transformProviderPriceData(data, provider, transformations);
      
      // Apply common normalizations
      const normalized = await this.applyCommonNormalizations(rawNormalized, provider, transformations, issues);
      
      // Validate and enhance
      const validated = this.validateAndEnhancePriceData(normalized, issues);
      
      // Calculate quality score
      const quality = this.calculateQualityScore(validated, issues, provider);
      
      const processingTime = performance.now() - startTime;
      this.updateMetrics('price', processingTime, quality.score, provider);

      const result: NormalizationResult<PriceData> = {
        normalized: validated,
        original: data,
        transformations,
        quality,
        metadata: {
          provider,
          normalizedAt: Date.now(),
          processingTime
        }
      };

      this.emit('data:normalized', {
        type: 'price',
        provider,
        quality: quality.score,
        transformations: transformations.length
      });

      return result;

    } catch (error) {
      this.metrics.errorCount++;
      throw new Error(`Failed to normalize price data from ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize quote data from any provider
   */
  async normalizeQuoteData(data: any, provider: MarketDataProvider): Promise<NormalizationResult<QuoteData>> {
    const startTime = performance.now();
    const transformations: TransformationLog[] = [];
    const issues: QualityIssue[] = [];

    try {
      const rawNormalized = this.transformProviderQuoteData(data, provider, transformations);
      const normalized = await this.applyCommonNormalizations(rawNormalized, provider, transformations, issues);
      const validated = this.validateAndEnhanceQuoteData(normalized, issues);
      const quality = this.calculateQualityScore(validated, issues, provider);
      
      const processingTime = performance.now() - startTime;
      this.updateMetrics('quote', processingTime, quality.score, provider);

      return {
        normalized: validated,
        original: data,
        transformations,
        quality,
        metadata: {
          provider,
          normalizedAt: Date.now(),
          processingTime
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      throw new Error(`Failed to normalize quote data from ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize trade data from any provider
   */
  async normalizeTradeData(data: any, provider: MarketDataProvider): Promise<NormalizationResult<TradeData>> {
    const startTime = performance.now();
    const transformations: TransformationLog[] = [];
    const issues: QualityIssue[] = [];

    try {
      const rawNormalized = this.transformProviderTradeData(data, provider, transformations);
      const normalized = await this.applyCommonNormalizations(rawNormalized, provider, transformations, issues);
      const validated = this.validateAndEnhanceTradeData(normalized, issues);
      const quality = this.calculateQualityScore(validated, issues, provider);
      
      const processingTime = performance.now() - startTime;
      this.updateMetrics('trade', processingTime, quality.score, provider);

      return {
        normalized: validated,
        original: data,
        transformations,
        quality,
        metadata: {
          provider,
          normalizedAt: Date.now(),
          processingTime
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      throw new Error(`Failed to normalize trade data from ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize order book data from any provider
   */
  async normalizeOrderBookData(data: any, provider: MarketDataProvider): Promise<NormalizationResult<OrderBookData>> {
    const startTime = performance.now();
    const transformations: TransformationLog[] = [];
    const issues: QualityIssue[] = [];

    try {
      const rawNormalized = this.transformProviderOrderBookData(data, provider, transformations);
      const normalized = await this.applyCommonNormalizations(rawNormalized, provider, transformations, issues);
      const validated = this.validateAndEnhanceOrderBookData(normalized, issues);
      const quality = this.calculateQualityScore(validated, issues, provider);
      
      const processingTime = performance.now() - startTime;
      this.updateMetrics('orderbook', processingTime, quality.score, provider);

      return {
        normalized: validated,
        original: data,
        transformations,
        quality,
        metadata: {
          provider,
          normalizedAt: Date.now(),
          processingTime
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      throw new Error(`Failed to normalize order book data from ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize news data from any provider
   */
  async normalizeNewsData(data: any, provider: MarketDataProvider): Promise<NormalizationResult<NewsData>> {
    const startTime = performance.now();
    const transformations: TransformationLog[] = [];
    const issues: QualityIssue[] = [];

    try {
      const rawNormalized = this.transformProviderNewsData(data, provider, transformations);
      const normalized = await this.applyCommonNormalizations(rawNormalized, provider, transformations, issues);
      const validated = this.validateAndEnhanceNewsData(normalized, issues);
      const quality = this.calculateQualityScore(validated, issues, provider);
      
      const processingTime = performance.now() - startTime;
      this.updateMetrics('news', processingTime, quality.score, provider);

      return {
        normalized: validated,
        original: data,
        transformations,
        quality,
        metadata: {
          provider,
          normalizedAt: Date.now(),
          processingTime
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      throw new Error(`Failed to normalize news data from ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get normalization metrics
   */
  getMetrics(): NormalizationMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NormalizationConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCaches();
    
    this.emit('config:updated', {
      changes: Object.keys(config),
      newConfig: this.config
    });
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.symbolCache.clear();
    this.currencyCache.clear();
    this.outlierCache.clear();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  // Private methods for provider-specific transformations

  private transformProviderPriceData(data: any, provider: MarketDataProvider, transformations: TransformationLog[]): any {
    switch (provider) {
      case 'alpha_vantage':
        return this.transformAlphaVantagePriceData(data, transformations);
      case 'polygon':
        return this.transformPolygonPriceData(data, transformations);
      case 'iex':
        return this.transformIexPriceData(data, transformations);
      case 'finnhub':
        return this.transformFinnhubPriceData(data, transformations);
      case 'yahoo':
        return this.transformYahooPriceData(data, transformations);
      default:
        return this.transformGenericPriceData(data, transformations);
    }
  }

  private transformAlphaVantagePriceData(data: any, transformations: TransformationLog[]): any {
    const result: any = {
      symbol: data.symbol || data['01. symbol'],
      timestamp: this.parseTimestamp(data.timestamp || data.date, transformations),
      open: this.parseDecimal(data['1. open'] || data.open, transformations, 'open'),
      high: this.parseDecimal(data['2. high'] || data.high, transformations, 'high'),
      low: this.parseDecimal(data['3. low'] || data.low, transformations, 'low'),
      close: this.parseDecimal(data['4. close'] || data.close, transformations, 'close'),
      volume: this.parseNumber(data['5. volume'] || data.volume, transformations, 'volume'),
      adjustedClose: data['5. adjusted close'] ? this.parseDecimal(data['5. adjusted close'], transformations, 'adjustedClose') : undefined,
      quality: 'historical' as const,
      provider: 'alpha_vantage' as const
    };

    return result;
  }

  private transformPolygonPriceData(data: any, transformations: TransformationLog[]): any {
    return {
      symbol: data.T || data.symbol,
      timestamp: data.t || data.timestamp,
      open: this.parseDecimal(data.o || data.open, transformations, 'open'),
      high: this.parseDecimal(data.h || data.high, transformations, 'high'),
      low: this.parseDecimal(data.l || data.low, transformations, 'low'),
      close: this.parseDecimal(data.c || data.close, transformations, 'close'),
      volume: data.v || data.volume,
      vwap: data.vw ? this.parseDecimal(data.vw, transformations, 'vwap') : undefined,
      trades: data.n || data.trades,
      quality: 'real_time' as const,
      provider: 'polygon' as const
    };
  }

  private transformIexPriceData(data: any, transformations: TransformationLog[]): any {
    return {
      symbol: data.symbol,
      timestamp: this.parseTimestamp(data.date || data.timestamp, transformations),
      open: this.parseDecimal(data.open, transformations, 'open'),
      high: this.parseDecimal(data.high, transformations, 'high'),
      low: this.parseDecimal(data.low, transformations, 'low'),
      close: this.parseDecimal(data.close, transformations, 'close'),
      volume: data.volume,
      quality: 'delayed_15min' as const,
      provider: 'iex' as const
    };
  }

  private transformFinnhubPriceData(data: any, transformations: TransformationLog[]): any {
    return {
      symbol: data.s || data.symbol,
      timestamp: data.t || data.timestamp,
      open: this.parseDecimal(data.o || data.open, transformations, 'open'),
      high: this.parseDecimal(data.h || data.high, transformations, 'high'),
      low: this.parseDecimal(data.l || data.low, transformations, 'low'),
      close: this.parseDecimal(data.c || data.close, transformations, 'close'),
      volume: data.v || data.volume,
      quality: 'real_time' as const,
      provider: 'finnhub' as const
    };
  }

  private transformYahooPriceData(data: any, transformations: TransformationLog[]): any {
    return {
      symbol: data.symbol,
      timestamp: this.parseTimestamp(data.date || data.timestamp, transformations),
      open: this.parseDecimal(data.open, transformations, 'open'),
      high: this.parseDecimal(data.high, transformations, 'high'),
      low: this.parseDecimal(data.low, transformations, 'low'),
      close: this.parseDecimal(data.close, transformations, 'close'),
      volume: data.volume,
      adjustedClose: data.adjClose ? this.parseDecimal(data.adjClose, transformations, 'adjustedClose') : undefined,
      quality: 'delayed_15min' as const,
      provider: 'yahoo' as const
    };
  }

  private transformGenericPriceData(data: any, transformations: TransformationLog[]): any {
    return {
      symbol: data.symbol,
      timestamp: this.parseTimestamp(data.timestamp || data.date, transformations),
      open: this.parseDecimal(data.open, transformations, 'open'),
      high: this.parseDecimal(data.high, transformations, 'high'),
      low: this.parseDecimal(data.low, transformations, 'low'),
      close: this.parseDecimal(data.close, transformations, 'close'),
      volume: data.volume,
      quality: 'historical' as const,
      provider: data.provider
    };
  }

  private transformProviderQuoteData(data: any, provider: MarketDataProvider, transformations: TransformationLog[]): any {
    const baseQuote = {
      symbol: data.symbol || data.sym || data.T,
      timestamp: this.parseTimestamp(data.timestamp || data.t || Date.now(), transformations),
      bid: this.parseDecimal(data.bid || data.b, transformations, 'bid'),
      ask: this.parseDecimal(data.ask || data.a, transformations, 'ask'),
      bidSize: this.parseNumber(data.bidSize || data.bs || data.bsize, transformations, 'bidSize'),
      askSize: this.parseNumber(data.askSize || data.as || data.asize, transformations, 'askSize'),
      last: this.parseDecimal(data.last || data.l || data.price, transformations, 'last'),
      lastSize: this.parseNumber(data.lastSize || data.ls || data.size, transformations, 'lastSize'),
      quality: 'real_time' as const,
      provider
    };

    // Add optional fields if available
    if (data.change || data.c) {
      baseQuote.change = this.parseDecimal(data.change || data.c, transformations, 'change');
    }
    if (data.changePercent || data.cp) {
      baseQuote.changePercent = this.parseDecimal(data.changePercent || data.cp, transformations, 'changePercent');
    }

    return baseQuote;
  }

  private transformProviderTradeData(data: any, provider: MarketDataProvider, transformations: TransformationLog[]): any {
    return {
      symbol: data.symbol || data.sym || data.T || data.s,
      timestamp: this.parseTimestamp(data.timestamp || data.t, transformations),
      price: this.parseDecimal(data.price || data.p, transformations, 'price'),
      size: this.parseNumber(data.size || data.s || data.v, transformations, 'size'),
      exchange: data.exchange || data.x || data.e,
      conditions: data.conditions || data.c,
      tradeId: data.tradeId || data.i?.toString(),
      quality: 'real_time' as const,
      provider
    };
  }

  private transformProviderOrderBookData(data: any, provider: MarketDataProvider, transformations: TransformationLog[]): any {
    return {
      symbol: data.symbol || data.sym || data.T,
      timestamp: this.parseTimestamp(data.timestamp || data.t || Date.now(), transformations),
      bids: (data.bids || data.b || []).map((bid: any) => ({
        price: this.parseDecimal(Array.isArray(bid) ? bid[0] : bid.price, transformations, 'bid_price'),
        size: this.parseNumber(Array.isArray(bid) ? bid[1] : bid.size, transformations, 'bid_size'),
        orders: Array.isArray(bid) && bid[2] ? bid[2] : undefined
      })),
      asks: (data.asks || data.a || []).map((ask: any) => ({
        price: this.parseDecimal(Array.isArray(ask) ? ask[0] : ask.price, transformations, 'ask_price'),
        size: this.parseNumber(Array.isArray(ask) ? ask[1] : ask.size, transformations, 'ask_size'),
        orders: Array.isArray(ask) && ask[2] ? ask[2] : undefined
      })),
      sequence: data.sequence || data.seq,
      quality: 'real_time' as const,
      provider
    };
  }

  private transformProviderNewsData(data: any, provider: MarketDataProvider, transformations: TransformationLog[]): any {
    return {
      id: data.id || data.uuid || this.generateId(),
      title: data.title || data.headline,
      summary: data.summary || data.description || data.snippet,
      content: data.content || data.body,
      author: data.author || data.source?.name,
      source: data.source?.name || data.source || data.publisher,
      url: data.url || data.link,
      imageUrl: data.image_url || data.imageUrl || data.urlToImage || data.banner_image,
      publishedAt: this.parseTimestamp(data.publishedAt || data.published_utc || data.time_published || data.datetime, transformations),
      symbols: this.extractSymbols(data),
      sentiment: data.sentiment ? {
        score: this.parseNumber(data.sentiment.score, transformations, 'sentiment_score'),
        label: data.sentiment.label || this.labelFromScore(data.sentiment.score),
        confidence: this.parseNumber(data.sentiment.confidence || 0.5, transformations, 'sentiment_confidence')
      } : undefined,
      topics: data.topics || data.categories,
      provider
    };
  }

  // Common normalization methods

  private async applyCommonNormalizations(
    data: any, 
    provider: MarketDataProvider, 
    transformations: TransformationLog[], 
    issues: QualityIssue[]
  ): Promise<any> {
    const normalized = { ...data };

    // Normalize symbol format
    if (normalized.symbol) {
      normalized.symbol = this.normalizeSymbol(normalized.symbol, transformations);
    }

    // Normalize timestamp to UTC
    if (normalized.timestamp) {
      normalized.timestamp = this.normalizeTimestamp(normalized.timestamp, transformations);
    }

    // Apply currency conversion if needed
    if (this.config.enableCurrencyConversion && normalized.currency && normalized.currency !== this.config.baseCurrency) {
      await this.applyCurrencyConversion(normalized, transformations);
    }

    // Apply decimal precision normalization
    this.normalizeDecimalPrecision(normalized, transformations);

    // Detect and handle outliers
    if (this.config.enableOutlierDetection) {
      this.detectAndHandleOutliers(normalized, issues, transformations);
    }

    // Apply data interpolation for missing values
    if (this.config.enableDataInterpolation) {
      this.interpolateMissingData(normalized, issues, transformations);
    }

    return normalized;
  }

  private parseDecimal(value: any, transformations: TransformationLog[], field: string): string {
    if (value === null || value === undefined || value === '') {
      return '0';
    }

    try {
      const decimal = new Decimal(value.toString());
      const rounded = decimal.toDecimalPlaces(this.config.decimalPrecision);
      const result = rounded.toString();

      if (value.toString() !== result) {
        transformations.push({
          field,
          transformation: 'decimal_precision',
          originalValue: value,
          normalizedValue: result,
          reason: `Normalized to ${this.config.decimalPrecision} decimal places`
        });
      }

      return result;
    } catch (error) {
      transformations.push({
        field,
        transformation: 'decimal_parse_error',
        originalValue: value,
        normalizedValue: '0',
        reason: `Invalid decimal value, defaulted to 0: ${error instanceof Error ? error.message : String(error)}`
      });
      return '0';
    }
  }

  private parseNumber(value: any, transformations: TransformationLog[], field: string): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    const parsed = Number(value);
    if (isNaN(parsed)) {
      transformations.push({
        field,
        transformation: 'number_parse_error',
        originalValue: value,
        normalizedValue: 0,
        reason: 'Invalid number value, defaulted to 0'
      });
      return 0;
    }

    return parsed;
  }

  private parseTimestamp(value: any, transformations: TransformationLog[]): number {
    if (typeof value === 'number') {
      // Handle different timestamp formats (seconds vs milliseconds)
      const timestamp = value < 10000000000 ? value * 1000 : value;
      return timestamp;
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }

    // Fallback to current time
    const now = Date.now();
    transformations.push({
      field: 'timestamp',
      transformation: 'timestamp_fallback',
      originalValue: value,
      normalizedValue: now,
      reason: 'Invalid timestamp, used current time'
    });

    return now;
  }

  private normalizeSymbol(symbol: string, transformations: TransformationLog[]): string {
    if (this.symbolCache.has(symbol)) {
      return this.symbolCache.get(symbol)!;
    }

    let normalized = symbol.toUpperCase().trim();

    // Apply symbol mapping if configured
    if (this.config.symbolMapping[symbol]) {
      normalized = this.config.symbolMapping[symbol];
      transformations.push({
        field: 'symbol',
        transformation: 'symbol_mapping',
        originalValue: symbol,
        normalizedValue: normalized,
        reason: 'Applied configured symbol mapping'
      });
    }

    // Remove common prefixes/suffixes
    normalized = normalized.replace(/^(NYSE:|NASDAQ:|AMEX:)/, '');
    normalized = normalized.replace(/\.(TO|L|PA|MI|F|BE|AS|SW|CO|ME|ST|HE|OL|VI|PR|WA|AX)$/, '');

    this.symbolCache.set(symbol, normalized);
    return normalized;
  }

  private normalizeTimestamp(timestamp: number, transformations: TransformationLog[]): number {
    // Convert to UTC if needed (implementation would depend on timezone logic)
    return timestamp;
  }

  private async applyCurrencyConversion(data: any, transformations: TransformationLog[]): Promise<void> {
    // Currency conversion implementation would go here
    // This is a placeholder for the actual currency conversion logic
  }

  private normalizeDecimalPrecision(data: any, transformations: TransformationLog[]): void {
    const decimalFields = ['open', 'high', 'low', 'close', 'adjustedClose', 'vwap', 'bid', 'ask', 'last', 'price'];
    
    decimalFields.forEach(field => {
      if (data[field] && typeof data[field] === 'string') {
        const decimal = new Decimal(data[field]);
        const rounded = decimal.toDecimalPlaces(this.config.decimalPrecision);
        
        if (!decimal.equals(rounded)) {
          transformations.push({
            field,
            transformation: 'decimal_precision',
            originalValue: data[field],
            normalizedValue: rounded.toString(),
            reason: `Normalized to ${this.config.decimalPrecision} decimal places`
          });
          data[field] = rounded.toString();
        }
      }
    });
  }

  private detectAndHandleOutliers(data: any, issues: QualityIssue[], transformations: TransformationLog[]): void {
    // Outlier detection implementation would go here
    // This is a placeholder for statistical outlier detection
  }

  private interpolateMissingData(data: any, issues: QualityIssue[], transformations: TransformationLog[]): void {
    // Data interpolation implementation would go here
    // This is a placeholder for missing data interpolation
  }

  private validateAndEnhancePriceData(data: any, issues: QualityIssue[]): PriceData {
    try {
      return validatePriceData(data);
    } catch (error) {
      issues.push({
        field: 'validation',
        issue: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high',
        suggestion: 'Check data completeness and format'
      });
      throw error;
    }
  }

  private validateAndEnhanceQuoteData(data: any, issues: QualityIssue[]): QuoteData {
    try {
      return validateQuoteData(data);
    } catch (error) {
      issues.push({
        field: 'validation',
        issue: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high',
        suggestion: 'Check data completeness and format'
      });
      throw error;
    }
  }

  private validateAndEnhanceTradeData(data: any, issues: QualityIssue[]): TradeData {
    try {
      return validateTradeData(data);
    } catch (error) {
      issues.push({
        field: 'validation',
        issue: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high',
        suggestion: 'Check data completeness and format'
      });
      throw error;
    }
  }

  private validateAndEnhanceOrderBookData(data: any, issues: QualityIssue[]): OrderBookData {
    try {
      return validateOrderBookData(data);
    } catch (error) {
      issues.push({
        field: 'validation',
        issue: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high',
        suggestion: 'Check data completeness and format'
      });
      throw error;
    }
  }

  private validateAndEnhanceNewsData(data: any, issues: QualityIssue[]): NewsData {
    try {
      return validateNewsData(data);
    } catch (error) {
      issues.push({
        field: 'validation',
        issue: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high',
        suggestion: 'Check data completeness and format'
      });
      throw error;
    }
  }

  private calculateQualityScore(data: any, issues: QualityIssue[], provider: MarketDataProvider): {
    score: number;
    issues: QualityIssue[];
    confidence: number;
  } {
    let score = 100;
    
    // Deduct points for issues
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    // Apply provider quality weight
    const providerWeight = this.config.qualityWeights[data.quality] || 1;
    score *= providerWeight;

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // Calculate confidence based on data completeness
    const confidence = this.calculateDataCompleteness(data);

    return {
      score,
      issues,
      confidence
    };
  }

  private calculateDataCompleteness(data: any): number {
    const requiredFields = ['symbol', 'timestamp'];
    const optionalFields = Object.keys(data).filter(key => !requiredFields.includes(key));
    
    const requiredComplete = requiredFields.every(field => data[field] !== undefined && data[field] !== null && data[field] !== '');
    const optionalComplete = optionalFields.filter(field => data[field] !== undefined && data[field] !== null && data[field] !== '').length;
    
    if (!requiredComplete) return 0;
    
    const completeness = optionalComplete / Math.max(optionalFields.length, 1);
    return Math.min(1, completeness + 0.5); // Base 50% for required fields, up to 100% for all optional
  }

  private extractSymbols(data: any): string[] {
    // Extract symbols from various news data formats
    if (data.symbols) return data.symbols;
    if (data.ticker_sentiment) return data.ticker_sentiment.map((t: any) => t.ticker);
    if (data.tickers) return data.tickers;
    if (data.related_symbols) return data.related_symbols;
    return [];
  }

  private labelFromScore(score: number): 'positive' | 'neutral' | 'negative' {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  private updateMetrics(dataType: string, processingTime: number, qualityScore: number, provider: MarketDataProvider): void {
    this.metrics.totalProcessed++;
    this.metrics.successCount++;
    
    // Update processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.successCount - 1) + processingTime;
    this.metrics.averageProcessingTime = totalTime / this.metrics.successCount;

    // Update quality distribution
    const qualityBucket = Math.floor(qualityScore / 10) * 10;
    const bucketKey = `${qualityBucket}-${qualityBucket + 10}`;
    this.metrics.qualityDistribution[bucketKey] = (this.metrics.qualityDistribution[bucketKey] || 0) + 1;

    // Update provider stats
    if (!this.metrics.providerStats[provider]) {
      this.metrics.providerStats[provider] = {
        processed: 0,
        averageQuality: 0,
        commonIssues: []
      };
    }

    const providerStats = this.metrics.providerStats[provider];
    const totalQuality = providerStats.averageQuality * providerStats.processed + qualityScore;
    providerStats.processed++;
    providerStats.averageQuality = totalQuality / providerStats.processed;
  }

  private initializeMetrics(): NormalizationMetrics {
    return {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      averageProcessingTime: 0,
      qualityDistribution: {},
      transformationCounts: {},
      providerStats: {}
    };
  }

  private generateId(): string {
    return `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}