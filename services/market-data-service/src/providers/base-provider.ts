/**
 * Base Data Provider
 * Abstract base class for all market data providers
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import PQueue from 'p-queue';
import pRetry from 'p-retry';

import {
  IDataProvider,
  DataProvider,
  DataProviderConfig,
  MarketDataType,
  Quote,
  Trade,
  OrderBook,
  OHLCV,
  NewsItem,
  HistoricalDataRequest,
  DataQuality
} from '../types';
import { logProviderEvent, logError, createPerformanceTimer } from '../utils/logger';

export abstract class BaseDataProvider extends EventEmitter implements IDataProvider {
  public readonly name: string;
  public readonly priority: number;
  protected readonly config: DataProviderConfig;
  protected readonly httpClient: AxiosInstance;
  protected readonly requestQueue: PQueue;
  
  private _isHealthy = false;
  private _isConnected = false;
  private _lastError?: Error;
  private _healthCheckInterval?: NodeJS.Timeout;
  private _stats = {
    requestCount: 0,
    errorCount: 0,
    lastRequestTime: 0,
    averageResponseTime: 0,
    rateLimitHits: 0
  };

  constructor(config: DataProviderConfig) {
    super();
    
    this.name = config.provider;
    this.priority = config.priority;
    this.config = config;
    
    // Create HTTP client with provider-specific configuration
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'User-Agent': 'ML-Trading-Platform/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Setup request/response interceptors
    this.setupHttpInterceptors();

    // Create request queue for rate limiting
    this.requestQueue = new PQueue({
      concurrency: Math.min(config.rateLimits.requestsPerSecond, 10),
      interval: 1000, // 1 second
      intervalCap: config.rateLimits.requestsPerSecond
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  // === Abstract Methods ===

  /**
   * Provider-specific connection logic
   */
  protected abstract connectProvider(): Promise<void>;

  /**
   * Provider-specific disconnection logic
   */
  protected abstract disconnectProvider(): Promise<void>;

  /**
   * Provider-specific subscription logic
   */
  protected abstract subscribeProvider(symbols: string[], dataTypes: MarketDataType[]): Promise<void>;

  /**
   * Provider-specific unsubscription logic
   */
  protected abstract unsubscribeProvider(symbols: string[], dataTypes: MarketDataType[]): Promise<void>;

  /**
   * Provider-specific quote fetching
   */
  protected abstract fetchQuote(symbol: string): Promise<Quote | null>;

  /**
   * Provider-specific trade fetching
   */
  protected abstract fetchTrades(symbol: string, limit?: number): Promise<Trade[]>;

  /**
   * Provider-specific order book fetching
   */
  protected abstract fetchOrderBook(symbol: string, depth?: number): Promise<OrderBook | null>;

  /**
   * Provider-specific historical data fetching
   */
  protected abstract fetchHistoricalData(request: HistoricalDataRequest): Promise<OHLCV[]>;

  /**
   * Provider-specific news fetching
   */
  protected abstract fetchNews(symbols: string[], limit?: number): Promise<NewsItem[]>;

  /**
   * Provider-specific health check
   */
  protected abstract checkProviderHealth(): Promise<boolean>;

  // === Public Interface ===

  async connect(): Promise<void> {
    try {
      logProviderEvent('connect', this.name, { attempt: 'start' });
      
      await this.connectProvider();
      this._isConnected = true;
      this._isHealthy = true;

      // Start health monitoring
      this.startHealthMonitoring();

      logProviderEvent('connect', this.name, { status: 'success' });
      this.emit('connected');

    } catch (error) {
      this._lastError = error as Error;
      this._isConnected = false;
      this._isHealthy = false;

      logError(error as Error, `provider-${this.name}`, { operation: 'connect' });
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      logProviderEvent('disconnect', this.name, { attempt: 'start' });

      // Stop health monitoring
      if (this._healthCheckInterval) {
        clearInterval(this._healthCheckInterval);
      }

      await this.disconnectProvider();
      this._isConnected = false;

      // Drain request queue
      this.requestQueue.clear();

      logProviderEvent('disconnect', this.name, { status: 'success' });
      this.emit('disconnected');

    } catch (error) {
      this._lastError = error as Error;
      logError(error as Error, `provider-${this.name}`, { operation: 'disconnect' });
      throw error;
    }
  }

  async subscribe(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    if (!this._isConnected) {
      throw new Error(`Provider ${this.name} is not connected`);
    }

    try {
      await this.subscribeProvider(symbols, dataTypes);
      this.emit('subscribed', { symbols, dataTypes });
      
      logProviderEvent('data_received', this.name, {
        action: 'subscribe',
        symbols: symbols.length,
        dataTypes
      });

    } catch (error) {
      this._lastError = error as Error;
      logError(error as Error, `provider-${this.name}`, { 
        operation: 'subscribe',
        symbols,
        dataTypes 
      });
      throw error;
    }
  }

  async unsubscribe(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    if (!this._isConnected) {
      return; // Already disconnected
    }

    try {
      await this.unsubscribeProvider(symbols, dataTypes);
      this.emit('unsubscribed', { symbols, dataTypes });

      logProviderEvent('data_received', this.name, {
        action: 'unsubscribe',
        symbols: symbols.length,
        dataTypes
      });

    } catch (error) {
      this._lastError = error as Error;
      logError(error as Error, `provider-${this.name}`, { 
        operation: 'unsubscribe',
        symbols,
        dataTypes 
      });
      throw error;
    }
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    return this.executeWithQueue(() => this.fetchQuote(symbol), 'getQuote', { symbol });
  }

  async getTrades(symbol: string, limit?: number): Promise<Trade[]> {
    return this.executeWithQueue(() => this.fetchTrades(symbol, limit), 'getTrades', { symbol, limit });
  }

  async getOrderBook(symbol: string, depth?: number): Promise<OrderBook | null> {
    return this.executeWithQueue(() => this.fetchOrderBook(symbol, depth), 'getOrderBook', { symbol, depth });
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<OHLCV[]> {
    return this.executeWithQueue(() => this.fetchHistoricalData(request), 'getHistoricalData', { request });
  }

  async getNews(symbols: string[], limit?: number): Promise<NewsItem[]> {
    return this.executeWithQueue(() => this.fetchNews(symbols, limit), 'getNews', { symbols, limit });
  }

  async isHealthy(): Promise<boolean> {
    if (!this._isConnected) {
      return false;
    }

    try {
      const healthy = await this.checkProviderHealth();
      this._isHealthy = healthy;
      return healthy;
    } catch (error) {
      this._lastError = error as Error;
      this._isHealthy = false;
      return false;
    }
  }

  // === Protected Utilities ===

  /**
   * Execute request with retry logic and queue management
   */
  protected async executeWithQueue<T>(
    operation: () => Promise<T>,
    operationName: string,
    metadata?: Record<string, any>
  ): Promise<T> {
    const timer = createPerformanceTimer(`${this.name}-${operationName}`, metadata);

    return this.requestQueue.add(async () => {
      return pRetry(async () => {
        try {
          this._stats.requestCount++;
          this._stats.lastRequestTime = Date.now();

          const result = await operation();
          
          // Update stats
          const duration = timer.end();
          this.updateResponseTimeStats(duration);

          return result;

        } catch (error) {
          this._stats.errorCount++;
          this._lastError = error as Error;

          // Check for rate limit errors
          if (this.isRateLimitError(error as Error)) {
            this._stats.rateLimitHits++;
            logProviderEvent('rate_limit', this.name, { operation: operationName });
            
            // Throw with specific rate limit error to trigger retry
            throw new Error(`Rate limit exceeded for ${this.name}`);
          }

          // Check if error is retryable
          if (this.isRetryableError(error as Error)) {
            throw error; // Will trigger retry
          }

          // Non-retryable error, fail immediately
          throw new Error(`Non-retryable error in ${operationName}: ${(error as Error).message}`);
        }
      }, {
        retries: this.config.retries,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (error) => {
          logProviderEvent('error', this.name, {
            operation: operationName,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message
          });
        }
      });
    }, {
      priority: this.getPriorityForOperation(operationName)
    });
  }

  /**
   * Make HTTP request with provider authentication
   */
  protected async makeRequest<T = any>(
    config: AxiosRequestConfig,
    retries = this.config.retries
  ): Promise<T> {
    // Add authentication
    config = this.addAuthentication(config);

    const response = await this.httpClient.request<T>(config);
    return response.data;
  }

  /**
   * Add provider-specific authentication to request
   */
  protected abstract addAuthentication(config: AxiosRequestConfig): AxiosRequestConfig;

  /**
   * Check if error is due to rate limiting
   */
  protected isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           message.includes('429');
  }

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('connection') ||
           message.includes('503') ||
           message.includes('502') ||
           message.includes('500') ||
           this.isRateLimitError(error);
  }

  /**
   * Get operation priority for queue management
   */
  private getPriorityForOperation(operation: string): number {
    const priorities = {
      'getQuote': 10,
      'getTrades': 8,
      'getOrderBook': 9,
      'getHistoricalData': 5,
      'getNews': 3
    };
    
    return priorities[operation as keyof typeof priorities] || 5;
  }

  /**
   * Setup HTTP request/response interceptors
   */
  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        // Add timestamp for latency tracking
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        // Track response time
        const duration = Date.now() - response.config.metadata.startTime;
        this.updateResponseTimeStats(duration);
        return response;
      },
      (error) => {
        // Handle HTTP errors
        if (error.response) {
          const status = error.response.status;
          if (status === 429) {
            this._stats.rateLimitHits++;
            logProviderEvent('rate_limit', this.name, { status });
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('error', (error) => {
      this._isHealthy = false;
      this._lastError = error;
    });

    this.on('connected', () => {
      this._isHealthy = true;
    });

    this.on('disconnected', () => {
      this._isHealthy = false;
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (!this.config.healthCheck.enabled) {
      return;
    }

    this._healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.isHealthy();
        
        if (!healthy && this._isHealthy) {
          // Health status changed from healthy to unhealthy
          logProviderEvent('error', this.name, { reason: 'health_check_failed' });
          this.emit('unhealthy');
        } else if (healthy && !this._isHealthy) {
          // Health status changed from unhealthy to healthy
          logProviderEvent('connect', this.name, { reason: 'health_check_recovered' });
          this.emit('healthy');
        }

        this._isHealthy = healthy;

      } catch (error) {
        logError(error as Error, `provider-${this.name}`, { operation: 'health_check' });
      }
    }, this.config.healthCheck.interval);
  }

  /**
   * Update response time statistics
   */
  private updateResponseTimeStats(duration: number): void {
    const currentAvg = this._stats.averageResponseTime;
    const requestCount = this._stats.requestCount;
    
    // Calculate rolling average
    this._stats.averageResponseTime = requestCount === 1 
      ? duration 
      : (currentAvg * (requestCount - 1) + duration) / requestCount;
  }

  // === Public Getters ===

  get isConnected(): boolean {
    return this._isConnected;
  }

  get lastError(): Error | undefined {
    return this._lastError;
  }

  get stats() {
    return {
      ...this._stats,
      errorRate: this._stats.requestCount > 0 ? this._stats.errorCount / this._stats.requestCount : 0,
      isHealthy: this._isHealthy,
      uptime: this._isConnected ? Date.now() - this._stats.lastRequestTime : 0
    };
  }
}