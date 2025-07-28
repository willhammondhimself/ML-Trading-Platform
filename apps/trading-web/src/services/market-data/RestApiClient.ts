import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { EventEmitter } from 'events';
import {
  MarketDataProvider,
  ApiResponse,
  PaginatedResponse,
  MarketDataError,
  ProviderConfig,
  HistoricalDataRequest,
  NewsRequest,
  PriceData,
  NewsData,
  CompanyInfo
} from '@/types/market-data';
import { RateLimitStatus, ProviderMetrics } from './interfaces';

/**
 * REST API Client for Historical Market Data
 * 
 * Features:
 * - Multi-provider HTTP client with unified interface
 * - Automatic retry logic with exponential backoff
 * - Request/response interceptors for authentication and rate limiting
 * - Response caching with TTL support
 * - Error handling and classification
 * - Request queuing and batching
 * - Performance monitoring and metrics
 * - Provider-specific adaptations
 */

export interface RestClientConfig {
  provider: MarketDataProvider;
  baseUrl: string;
  apiKey: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  rateLimitBuffer: number; // percentage buffer for rate limits
  enableRequestQueue: boolean;
  maxQueueSize: number;
  enableMetrics: boolean;
  defaultHeaders?: Record<string, string>;
}

export interface RequestMetadata {
  startTime: number;
  endTime?: number;
  duration?: number;
  retryCount: number;
  cacheHit: boolean;
  rateLimited: boolean;
  provider: MarketDataProvider;
}

export interface QueuedRequest {
  id: string;
  config: AxiosRequestConfig;
  resolve: (response: AxiosResponse) => void;
  reject: (error: any) => void;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
  metadata: Partial<RequestMetadata>;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  provider: MarketDataProvider;
  key: string;
}

export class RestApiClient extends EventEmitter {
  private client: AxiosInstance;
  private config: RestClientConfig;
  private rateLimitStatus: RateLimitStatus;
  private metrics: ProviderMetrics;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private cache: Map<string, CacheEntry> = new Map();
  private activeRequests = 0;
  private maxConcurrentRequests = 10;

  constructor(config: RestClientConfig) {
    super();
    this.config = config;
    this.rateLimitStatus = this.initializeRateLimitStatus();
    this.metrics = this.initializeMetrics();
    
    this.client = this.createAxiosInstance();
    this.setupInterceptors();
    this.startQueueProcessor();
    this.startCacheCleanup();
  }

  /**
   * Make a GET request with full error handling and caching
   */
  async get<T>(
    url: string, 
    params?: Record<string, any>,
    options: {
      cache?: boolean;
      cacheTtl?: number;
      priority?: 'high' | 'normal' | 'low';
      timeout?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const cacheKey = this.generateCacheKey('GET', url, params);
    
    // Check cache first
    if (options.cache !== false) {
      const cached = this.getCached<T>(cacheKey);
      if (cached) {
        return this.wrapResponse(cached, true);
      }
    }

    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url,
      params,
      timeout: options.timeout || this.config.timeout
    };

    const response = await this.executeRequest<T>(requestConfig, {
      priority: options.priority || 'normal',
      cacheKey: options.cache !== false ? cacheKey : undefined,
      cacheTtl: options.cacheTtl
    });

    return response;
  }

  /**
   * Make a POST request
   */
  async post<T>(
    url: string, 
    data?: any,
    options: {
      priority?: 'high' | 'normal' | 'low';
      timeout?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url,
      data,
      timeout: options.timeout || this.config.timeout
    };

    return await this.executeRequest<T>(requestConfig, {
      priority: options.priority || 'normal'
    });
  }

  /**
   * Get historical price data with provider-specific formatting
   */
  async getHistoricalData(request: HistoricalDataRequest): Promise<ApiResponse<PriceData[]>> {
    const endpoint = this.buildHistoricalDataEndpoint(request);
    const params = this.buildHistoricalDataParams(request);
    
    const response = await this.get<any>(endpoint, params, { 
      cache: true, 
      cacheTtl: 3600, // 1 hour cache for historical data
      priority: 'high'
    });

    // Transform provider-specific response to normalized format
    const normalizedData = this.normalizeHistoricalData(response.data, request);
    
    return {
      ...response,
      data: normalizedData
    };
  }

  /**
   * Get company information
   */
  async getCompanyInfo(symbol: string): Promise<ApiResponse<CompanyInfo>> {
    const endpoint = this.buildCompanyInfoEndpoint(symbol);
    
    const response = await this.get<any>(endpoint, undefined, {
      cache: true,
      cacheTtl: 86400, // 24 hour cache for company info
      priority: 'normal'
    });

    const normalizedData = this.normalizeCompanyInfo(response.data, symbol);
    
    return {
      ...response,
      data: normalizedData
    };
  }

  /**
   * Get news data
   */
  async getNews(request: NewsRequest): Promise<PaginatedResponse<NewsData>> {
    const endpoint = this.buildNewsEndpoint();
    const params = this.buildNewsParams(request);
    
    const response = await this.get<any>(endpoint, params, {
      cache: true,
      cacheTtl: 1800, // 30 minute cache for news
      priority: 'normal'
    });

    const normalizedData = this.normalizeNewsData(response.data, request);
    
    return this.wrapPaginatedResponse(normalizedData, response);
  }

  /**
   * Check current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  /**
   * Get client metrics
   */
  getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cache:cleared');
  }

  /**
   * Shutdown the client
   */
  shutdown(): void {
    this.isProcessingQueue = false;
    this.cache.clear();
    this.removeAllListeners();
  }

  // Private methods

  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ML-Trading-Platform/1.0',
        ...this.config.defaultHeaders
      }
    });
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.activeRequests++;
        
        // Add authentication
        config.headers = this.addAuthentication(config.headers || {});
        
        // Add request ID for tracking
        config.metadata = {
          startTime: Date.now(),
          retryCount: 0,
          cacheHit: false,
          rateLimited: false,
          provider: this.config.provider,
          requestId: this.generateRequestId()
        };

        this.emit('request:sent', {
          provider: this.config.provider,
          url: config.url,
          method: config.method?.toUpperCase(),
          requestId: config.metadata.requestId
        });

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.activeRequests--;
        const metadata = response.config.metadata as RequestMetadata;
        
        if (metadata) {
          metadata.endTime = Date.now();
          metadata.duration = metadata.endTime - metadata.startTime;
          
          // Update metrics
          this.updateSuccessMetrics(metadata);
          
          // Update rate limit status from headers
          this.updateRateLimitFromHeaders(response.headers);
        }

        this.emit('response:received', {
          provider: this.config.provider,
          status: response.status,
          duration: metadata?.duration,
          requestId: metadata?.requestId
        });

        return response;
      },
      async (error: AxiosError) => {
        this.activeRequests--;
        const metadata = error.config?.metadata as RequestMetadata;
        
        if (metadata) {
          metadata.endTime = Date.now();
          metadata.duration = metadata.endTime! - metadata.startTime;
          
          // Update error metrics
          this.updateErrorMetrics(metadata, error);
        }

        // Handle rate limiting
        if (this.isRateLimitError(error)) {
          this.handleRateLimitError(error);
          metadata.rateLimited = true;
        }

        // Retry logic
        if (this.shouldRetry(error, metadata)) {
          return this.retryRequest(error.config!, metadata);
        }

        this.emit('response:error', {
          provider: this.config.provider,
          error: this.normalizeError(error),
          duration: metadata?.duration,
          requestId: metadata?.requestId
        });

        return Promise.reject(this.normalizeError(error));
      }
    );
  }

  private async executeRequest<T>(
    requestConfig: AxiosRequestConfig,
    options: {
      priority?: 'high' | 'normal' | 'low';
      cacheKey?: string;
      cacheTtl?: number;
    }
  ): Promise<ApiResponse<T>> {
    // Check rate limits
    if (!this.checkRateLimit()) {
      await this.waitForRateLimit();
    }

    // Queue request if needed
    if (this.config.enableRequestQueue && this.activeRequests >= this.maxConcurrentRequests) {
      return this.queueRequest<T>(requestConfig, options);
    }

    try {
      const response = await this.client.request<T>(requestConfig);
      
      // Cache response if requested
      if (options.cacheKey) {
        this.setCached(options.cacheKey, response.data, options.cacheTtl);
      }

      return this.wrapResponse(response.data, false);
      
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async queueRequest<T>(
    requestConfig: AxiosRequestConfig,
    options: {
      priority?: 'high' | 'normal' | 'low';
      cacheKey?: string;
      cacheTtl?: number;
    }
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      if (this.requestQueue.length >= this.config.maxQueueSize) {
        reject(new Error('Request queue full'));
        return;
      }

      const queuedRequest: QueuedRequest = {
        id: this.generateRequestId(),
        config: requestConfig,
        resolve: (response) => {
          if (options.cacheKey) {
            this.setCached(options.cacheKey, response.data, options.cacheTtl);
          }
          resolve(this.wrapResponse(response.data, false));
        },
        reject,
        priority: options.priority || 'normal',
        timestamp: Date.now(),
        metadata: {}
      };

      this.requestQueue.push(queuedRequest);
      this.sortRequestQueue();

      this.emit('request:queued', {
        requestId: queuedRequest.id,
        queueSize: this.requestQueue.length,
        priority: queuedRequest.priority
      });
    });
  }

  private startQueueProcessor(): void {
    if (!this.config.enableRequestQueue) return;

    const processQueue = async () => {
      if (this.isProcessingQueue || this.requestQueue.length === 0) {
        setTimeout(processQueue, 100);
        return;
      }

      this.isProcessingQueue = true;

      while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
        const request = this.requestQueue.shift();
        if (!request) break;

        try {
          const response = await this.client.request(request.config);
          request.resolve(response);
        } catch (error) {
          request.reject(this.normalizeError(error));
        }
      }

      this.isProcessingQueue = false;
      setTimeout(processQueue, 100);
    };

    processQueue();
  }

  private sortRequestQueue(): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    this.requestQueue.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.timestamp - b.timestamp;
    });
  }

  private checkRateLimit(): boolean {
    const now = Date.now() / 1000;
    const bufferMultiplier = 1 - (this.config.rateLimitBuffer / 100);
    
    return this.rateLimitStatus.remaining > (this.rateLimitStatus.limit * bufferMultiplier) &&
           now < this.rateLimitStatus.resetTime;
  }

  private async waitForRateLimit(): Promise<void> {
    const waitTime = Math.max(0, this.rateLimitStatus.resetTime - (Date.now() / 1000)) * 1000;
    
    this.emit('rate-limit:waiting', {
      provider: this.config.provider,
      waitTime,
      resetTime: this.rateLimitStatus.resetTime
    });

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  private shouldRetry(error: AxiosError, metadata?: RequestMetadata): boolean {
    if (!metadata || metadata.retryCount >= this.config.maxRetries) {
      return false;
    }

    // Retry on temporary errors
    const retryableStatuses = [429, 502, 503, 504];
    return retryableStatuses.includes(error.response?.status || 0) ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  private async retryRequest(config: AxiosRequestConfig, metadata: RequestMetadata): Promise<AxiosResponse> {
    metadata.retryCount++;
    const delay = this.calculateRetryDelay(metadata.retryCount);
    
    this.emit('request:retry', {
      provider: this.config.provider,
      attempt: metadata.retryCount,
      delay,
      requestId: metadata.requestId
    });

    await new Promise(resolve => setTimeout(resolve, delay));
    
    return this.client.request(config);
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(this.config.retryDelay * Math.pow(2, attempt - 1), 30000);
  }

  private addAuthentication(headers: Record<string, any>): Record<string, any> {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return { ...headers, 'apikey': this.config.apiKey };
      case 'polygon':
        return { ...headers, 'Authorization': `Bearer ${this.config.apiKey}` };
      case 'iex':
        return { ...headers, 'token': this.config.apiKey };
      case 'finnhub':
        return { ...headers, 'X-Finnhub-Token': this.config.apiKey };
      default:
        return { ...headers, 'X-API-Key': this.config.apiKey };
    }
  }

  private updateRateLimitFromHeaders(headers: any): void {
    // Standard headers
    if (headers['x-ratelimit-remaining']) {
      this.rateLimitStatus.remaining = parseInt(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-limit']) {
      this.rateLimitStatus.limit = parseInt(headers['x-ratelimit-limit']);
    }
    if (headers['x-ratelimit-reset']) {
      this.rateLimitStatus.resetTime = parseInt(headers['x-ratelimit-reset']);
    }

    // Provider-specific headers
    switch (this.config.provider) {
      case 'alpha_vantage':
        // Alpha Vantage doesn't provide rate limit headers, use defaults
        break;
      case 'polygon':
        if (headers['x-ratelimit-requests-remaining']) {
          this.rateLimitStatus.remaining = parseInt(headers['x-ratelimit-requests-remaining']);
        }
        break;
      case 'iex':
        if (headers['iexcloud-messages-used']) {
          const used = parseInt(headers['iexcloud-messages-used']);
          this.rateLimitStatus.remaining = Math.max(0, this.rateLimitStatus.limit - used);
        }
        break;
    }

    this.rateLimitStatus.resetIn = Math.max(0, this.rateLimitStatus.resetTime - (Date.now() / 1000));
  }

  private isRateLimitError(error: AxiosError): boolean {
    return error.response?.status === 429 || 
           (error.response?.status === 403 && 
            error.response?.data?.toString().toLowerCase().includes('rate limit'));
  }

  private handleRateLimitError(error: AxiosError): void {
    this.rateLimitStatus.blocked = true;
    
    // Extract reset time from headers or estimate
    const retryAfter = error.response?.headers['retry-after'];
    if (retryAfter) {
      this.rateLimitStatus.resetTime = (Date.now() / 1000) + parseInt(retryAfter);
    } else {
      this.rateLimitStatus.resetTime = (Date.now() / 1000) + 60; // Default 1 minute
    }

    this.emit('rate-limit:exceeded', {
      provider: this.config.provider,
      resetTime: this.rateLimitStatus.resetTime,
      error: error.response?.data
    });
  }

  private normalizeError(error: unknown): MarketDataError {
    if (axios.isAxiosError(error)) {
      return {
        code: error.code || 'HTTP_ERROR',
        message: error.message,
        provider: this.config.provider,
        details: {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        },
        timestamp: Date.now(),
        retryable: this.shouldRetry(error, { retryCount: 0 } as RequestMetadata),
        rateLimited: this.isRateLimitError(error)
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : String(error),
      provider: this.config.provider,
      timestamp: Date.now(),
      retryable: false,
      rateLimited: false
    };
  }

  private updateSuccessMetrics(metadata: RequestMetadata): void {
    this.metrics.requestCount++;
    this.metrics.lastRequestTime = Date.now();
    
    if (metadata.duration) {
      const totalTime = this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + metadata.duration;
      this.metrics.averageResponseTime = totalTime / this.metrics.requestCount;
    }
    
    this.metrics.successRate = ((this.metrics.requestCount - this.metrics.errorCount) / this.metrics.requestCount) * 100;
  }

  private updateErrorMetrics(metadata: RequestMetadata, error: AxiosError): void {
    this.metrics.errorCount++;
    this.metrics.requestCount++;
    this.metrics.lastRequestTime = Date.now();
    this.metrics.successRate = ((this.metrics.requestCount - this.metrics.errorCount) / this.metrics.requestCount) * 100;
  }

  // Cache management
  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCached<T>(key: string, data: T, ttl: number = 300): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      provider: this.config.provider,
      key
    });
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.timestamp + (entry.ttl * 1000)) {
          this.cache.delete(key);
        }
      }
    }, 300000); // Clean every 5 minutes
  }

  private generateCacheKey(method: string, url: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${this.config.provider}:${method}:${url}:${this.simpleHash(paramStr)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private wrapResponse<T>(data: T, cached: boolean): ApiResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        timestamp: Date.now(),
        provider: this.config.provider,
        cached
      }
    };
  }

  private wrapPaginatedResponse<T>(data: any, originalResponse: ApiResponse<any>): PaginatedResponse<T> {
    return {
      success: true,
      data: {
        items: data.items || [],
        pagination: {
          page: data.page || 1,
          pageSize: data.pageSize || 20,
          totalPages: data.totalPages || 1,
          totalItems: data.totalItems || 0,
          hasNext: data.hasNext || false,
          hasPrevious: data.hasPrevious || false
        }
      },
      metadata: originalResponse.metadata
    };
  }

  private initializeRateLimitStatus(): RateLimitStatus {
    return {
      remaining: 1000,
      limit: 1000,
      resetTime: Date.now() / 1000 + 3600,
      resetIn: 3600,
      blocked: false
    };
  }

  private initializeMetrics(): ProviderMetrics {
    return {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      successRate: 100,
      dataPointsReceived: 0,
      lastRequestTime: 0,
      uptime: Date.now()
    };
  }

  // Provider-specific endpoint builders
  private buildHistoricalDataEndpoint(request: HistoricalDataRequest): string {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return '/query';
      case 'polygon':
        return `/v2/aggs/ticker/${request.symbol}/range/1/day/${request.startDate}/${request.endDate}`;
      case 'iex':
        return `/stock/${request.symbol}/chart/range`;
      case 'finnhub':
        return `/stock/candle`;
      default:
        return '/historical';
    }
  }

  private buildHistoricalDataParams(request: HistoricalDataRequest): any {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return {
          function: 'TIME_SERIES_DAILY_ADJUSTED',
          symbol: request.symbol,
          outputsize: 'full'
        };
      case 'polygon':
        return {
          adjusted: request.adjusted,
          sort: 'asc'
        };
      case 'iex':
        return {
          chartByDay: true,
          from: request.startDate,
          to: request.endDate
        };
      case 'finnhub':
        return {
          symbol: request.symbol,
          resolution: 'D',
          from: Math.floor(new Date(request.startDate).getTime() / 1000),
          to: Math.floor(new Date(request.endDate).getTime() / 1000)
        };
      default:
        return request;
    }
  }

  private buildCompanyInfoEndpoint(symbol: string): string {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return '/query';
      case 'polygon':
        return `/v3/reference/tickers/${symbol}`;
      case 'iex':
        return `/stock/${symbol}/company`;
      case 'finnhub':
        return `/stock/profile2`;
      default:
        return `/company/${symbol}`;
    }
  }

  private buildNewsEndpoint(): string {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return '/query';
      case 'polygon':
        return '/v2/reference/news';
      case 'iex':
        return '/stock/market/news';
      case 'finnhub':
        return '/news';
      default:
        return '/news';
    }
  }

  private buildNewsParams(request: NewsRequest): any {
    switch (this.config.provider) {
      case 'alpha_vantage':
        return {
          function: 'NEWS_SENTIMENT',
          tickers: request.symbols?.join(','),
          limit: request.limit
        };
      case 'polygon':
        return {
          'ticker.gte': request.symbols?.join(','),
          limit: request.limit,
          'published_utc.gte': request.startDate,
          'published_utc.lte': request.endDate
        };
      default:
        return request;
    }
  }

  private normalizeHistoricalData(data: any, request: HistoricalDataRequest): PriceData[] {
    // Provider-specific normalization logic would go here
    // This is a simplified example
    switch (this.config.provider) {
      case 'alpha_vantage':
        return this.normalizeAlphaVantageHistoricalData(data, request);
      case 'polygon':
        return this.normalizePolygonHistoricalData(data, request);
      default:
        return [];
    }
  }

  private normalizeAlphaVantageHistoricalData(data: any, request: HistoricalDataRequest): PriceData[] {
    const timeSeries = data['Time Series (Daily)'] || {};
    return Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      symbol: request.symbol,
      timestamp: new Date(date).getTime(),
      open: values['1. open'],
      high: values['2. high'],
      low: values['3. low'],
      close: values['4. close'],
      adjustedClose: values['5. adjusted close'],
      volume: parseInt(values['6. volume']),
      quality: 'historical' as const,
      provider: 'alpha_vantage' as const
    }));
  }

  private normalizePolygonHistoricalData(data: any, request: HistoricalDataRequest): PriceData[] {
    const results = data.results || [];
    return results.map((item: any) => ({
      symbol: request.symbol,
      timestamp: item.t,
      open: item.o.toString(),
      high: item.h.toString(),
      low: item.l.toString(),
      close: item.c.toString(),
      volume: item.v,
      vwap: item.vw?.toString(),
      trades: item.n,
      quality: 'historical' as const,
      provider: 'polygon' as const
    }));
  }

  private normalizeCompanyInfo(data: any, symbol: string): CompanyInfo {
    // Provider-specific company info normalization
    switch (this.config.provider) {
      case 'alpha_vantage':
        return {
          symbol,
          name: data.Name || '',
          description: data.Description || '',
          exchange: data.Exchange || '',
          sector: data.Sector,
          industry: data.Industry,
          marketCap: data.MarketCapitalization ? parseInt(data.MarketCapitalization) : undefined,
          peRatio: data.PERatio,
          dividendYield: data.DividendYield,
          beta: data.Beta,
          lastUpdated: Date.now(),
          provider: 'alpha_vantage'
        };
      default:
        return {
          symbol,
          name: data.name || '',
          exchange: data.exchange || '',
          lastUpdated: Date.now(),
          provider: this.config.provider
        };
    }
  }

  private normalizeNewsData(data: any, request: NewsRequest): { items: NewsData[]; [key: string]: any } {
    // Provider-specific news normalization
    const items = (data.feed || data.results || data.articles || []).map((item: any) => ({
      id: item.id || item.uuid || this.generateRequestId(),
      title: item.title,
      summary: item.summary || item.description,
      content: item.content,
      author: item.author,
      source: item.source || item.publisher?.name,
      url: item.url,
      imageUrl: item.banner_image || item.image_url || item.urlToImage,
      publishedAt: new Date(item.time_published || item.published_utc || item.publishedAt).getTime(),
      symbols: item.ticker_sentiment?.map((t: any) => t.ticker) || request.symbols || [],
      provider: this.config.provider
    }));

    return { items };
  }
}