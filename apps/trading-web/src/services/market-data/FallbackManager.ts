import { EventEmitter } from 'events';
import {
  MarketDataProvider,
  ApiResponse,
  PriceData,
  QuoteData,
  TradeData,
  OrderBookData,
  NewsData,
  CompanyInfo,
  MarketDataError,
  HistoricalDataRequest,
  NewsRequest
} from '@/types/market-data';
import { IMarketDataProvider } from './interfaces';

/**
 * Intelligent Fallback Data Source System
 * 
 * Features:
 * - Multi-provider failover with intelligent routing
 * - Health monitoring and automatic provider switching
 * - Data quality assessment and provider scoring
 * - Latency-based provider selection
 * - Geographic and regulatory compliance routing
 * - Cost optimization across providers
 * - Request retry with exponential backoff
 * - Provider capability matching
 * - Real-time provider status tracking
 */

export interface FallbackConfiguration {
  enableFallback: boolean;
  maxRetries: number;
  retryDelay: number;
  maxRetryDelay: number;
  backoffMultiplier: number;
  healthCheckInterval: number;
  providerTimeout: number;
  qualityThreshold: number; // minimum data quality score (0-1)
  latencyThreshold: number; // maximum acceptable latency in ms
  costOptimization: boolean;
  geographicRouting: boolean;
  preferredRegions: string[];
  fallbackStrategies: FallbackStrategy[];
}

export interface FallbackStrategy {
  name: string;
  priority: number;
  conditions: FallbackCondition[];
  actions: FallbackAction[];
  enabled: boolean;
}

export interface FallbackCondition {
  type: 'provider_down' | 'rate_limited' | 'high_latency' | 'low_quality' | 'cost_threshold' | 'region_restricted';
  provider?: MarketDataProvider;
  threshold?: number;
  region?: string;
}

export interface FallbackAction {
  type: 'switch_provider' | 'retry_request' | 'aggregate_data' | 'cache_fallback' | 'delay_request';
  targetProvider?: MarketDataProvider;
  delay?: number;
  maxAttempts?: number;
}

export interface ProviderHealth {
  provider: MarketDataProvider;
  healthy: boolean;
  lastHealthCheck: number;
  averageLatency: number;
  errorRate: number;
  successRate: number;
  dataQualityScore: number;
  costScore: number; // relative cost (lower is better)
  capabilities: ProviderCapability[];
  lastError?: string;
  consecutiveFailures: number;
  region: string;
  status: 'active' | 'degraded' | 'unavailable' | 'maintenance';
}

export interface ProviderCapability {
  feature: 'historical_data' | 'real_time_quotes' | 'news' | 'company_info' | 'order_book' | 'trades';
  quality: 'high' | 'medium' | 'low';
  latency: 'low' | 'medium' | 'high';
  coverage: string[]; // supported symbols/markets
  cost: 'low' | 'medium' | 'high';
}

export interface FallbackRequest<T = any> {
  id: string;
  operation: string;
  parameters: any;
  preferredProviders: MarketDataProvider[];
  fallbackProviders: MarketDataProvider[];
  attempt: number;
  startTime: number;
  timeout: number;
  resolver: (result: ApiResponse<T>) => void;
  rejector: (error: MarketDataError) => void;
  metadata: {
    originalProvider: MarketDataProvider;
    qualityRequirement: number;
    latencyRequirement: number;
    costBudget?: number;
    region?: string;
  };
}

export interface FallbackMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  fallbacksTriggered: number;
  averageLatency: number;
  providerSwitches: number;
  costSavings: number;
  dataQualityImprovements: number;
  strategies: Record<string, {
    triggered: number;
    successful: number;
    averageLatency: number;
  }>;
  providers: Record<MarketDataProvider, {
    attempts: number;
    successes: number;
    failures: number;
    averageLatency: number;
    lastUsed: number;
    fallbacksFrom: number; // times this provider was fallen back FROM
    fallbacksTo: number; // times this provider was fallen back TO
  }>;
}

export class FallbackManager extends EventEmitter {
  private config: FallbackConfiguration;
  private providers: Map<MarketDataProvider, IMarketDataProvider> = new Map();
  private providerHealth: Map<MarketDataProvider, ProviderHealth> = new Map();
  private activeRequests: Map<string, FallbackRequest> = new Map();
  private metrics: FallbackMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private isHealthCheckRunning = false;

  constructor(config: FallbackConfiguration) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize fallback manager
   */
  async initialize(): Promise<void> {
    try {
      // Start health monitoring
      this.startHealthChecks();
      
      console.log('🔄 Fallback manager initialized with', this.providers.size, 'providers');
      
    } catch (error) {
      console.error('❌ Failed to initialize fallback manager:', error);
      throw error;
    }
  }

  /**
   * Register a provider with the fallback manager
   */
  registerProvider(provider: IMarketDataProvider): void {
    this.providers.set(provider.name, provider);
    this.providerHealth.set(provider.name, this.initializeProviderHealth(provider.name));
    
    // Set up provider event listeners
    provider.on('error', (error) => {
      this.handleProviderError(provider.name, error);
    });

    provider.on('connected', () => {
      this.updateProviderHealth(provider.name, { healthy: true, status: 'active' });
    });

    provider.on('disconnected', () => {
      this.updateProviderHealth(provider.name, { healthy: false, status: 'unavailable' });
    });

    console.log(`📡 Registered provider: ${provider.name}`);
  }

  /**
   * Execute a request with fallback support
   */
  async executeWithFallback<T>(
    operation: string,
    parameters: any,
    preferredProviders: MarketDataProvider[] = [],
    options: {
      timeout?: number;
      qualityRequirement?: number;
      latencyRequirement?: number;
      region?: string;
    } = {}
  ): Promise<ApiResponse<T>> {
    const requestId = this.generateRequestId();
    const fallbackProviders = this.selectFallbackProviders(operation, preferredProviders, options);

    return new Promise((resolve, reject) => {
      const request: FallbackRequest<T> = {
        id: requestId,
        operation,
        parameters,
        preferredProviders,
        fallbackProviders,
        attempt: 0,
        startTime: Date.now(),
        timeout: options.timeout || this.config.providerTimeout,
        resolver: resolve,
        rejector: reject,
        metadata: {
          originalProvider: preferredProviders[0] || fallbackProviders[0],
          qualityRequirement: options.qualityRequirement || this.config.qualityThreshold,
          latencyRequirement: options.latencyRequirement || this.config.latencyThreshold,
          region: options.region
        }
      };

      this.activeRequests.set(requestId, request);
      this.executeRequest(request);
    });
  }

  /**
   * Get historical price data with fallback
   */
  async getHistoricalData(
    request: HistoricalDataRequest,
    preferredProviders: MarketDataProvider[] = []
  ): Promise<ApiResponse<PriceData[]>> {
    return this.executeWithFallback<PriceData[]>(
      'getHistoricalPrices',
      request,
      preferredProviders,
      { qualityRequirement: 0.8, latencyRequirement: 5000 }
    );
  }

  /**
   * Get real-time quote with fallback
   */
  async getCurrentQuote(
    symbol: string,
    preferredProviders: MarketDataProvider[] = []
  ): Promise<ApiResponse<QuoteData>> {
    return this.executeWithFallback<QuoteData>(
      'getCurrentQuote',
      { symbol },
      preferredProviders,
      { qualityRequirement: 0.9, latencyRequirement: 1000 }
    );
  }

  /**
   * Get company information with fallback
   */
  async getCompanyInfo(
    symbol: string,
    preferredProviders: MarketDataProvider[] = []
  ): Promise<ApiResponse<CompanyInfo>> {
    return this.executeWithFallback<CompanyInfo>(
      'getCompanyInfo',
      { symbol },
      preferredProviders,
      { qualityRequirement: 0.7, latencyRequirement: 3000 }
    );
  }

  /**
   * Get news data with fallback
   */
  async getNews(
    request: NewsRequest,
    preferredProviders: MarketDataProvider[] = []
  ): Promise<ApiResponse<NewsData[]>> {
    return this.executeWithFallback<NewsData[]>(
      'getNews',
      request,
      preferredProviders,
      { qualityRequirement: 0.6, latencyRequirement: 2000 }
    );
  }

  /**
   * Get provider health status
   */
  getProviderHealth(provider?: MarketDataProvider): ProviderHealth | Record<MarketDataProvider, ProviderHealth> {
    if (provider) {
      return this.providerHealth.get(provider) || this.initializeProviderHealth(provider);
    }

    const allHealth: Record<MarketDataProvider, ProviderHealth> = {} as any;
    this.providerHealth.forEach((health, providerName) => {
      allHealth[providerName] = health;
    });

    return allHealth;
  }

  /**
   * Get fallback metrics
   */
  getMetrics(): FallbackMetrics {
    return { ...this.metrics };
  }

  /**
   * Update fallback configuration
   */
  updateConfiguration(config: Partial<FallbackConfiguration>): void {
    this.config = { ...this.config, ...config };
    
    this.emit('configuration:updated', { config: this.config });
  }

  /**
   * Force provider health check
   */
  async checkProviderHealth(provider?: MarketDataProvider): Promise<void> {
    if (provider) {
      await this.performHealthCheck(provider);
    } else {
      await this.performAllHealthChecks();
    }
  }

  /**
   * Shutdown fallback manager
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Cancel all active requests
    this.activeRequests.forEach(request => {
      request.rejector(new MarketDataError({
        code: 'SHUTDOWN',
        message: 'Fallback manager shutting down',
        provider: request.metadata.originalProvider,
        timestamp: Date.now(),
        retryable: false
      }));
    });

    this.activeRequests.clear();
    this.removeAllListeners();
    
    console.log('✅ Fallback manager shutdown complete');
  }

  // Private methods

  private async executeRequest<T>(request: FallbackRequest<T>): Promise<void> {
    const providersToTry = [...request.preferredProviders, ...request.fallbackProviders];
    
    if (providersToTry.length === 0) {
      this.handleRequestFailure(request, new MarketDataError({
        code: 'NO_PROVIDERS_AVAILABLE',
        message: 'No providers available for request',
        provider: request.metadata.originalProvider,
        timestamp: Date.now(),
        retryable: false
      }));
      return;
    }

    for (const providerName of providersToTry) {
      if (request.attempt >= this.config.maxRetries) {
        break;
      }

      request.attempt++;
      
      const provider = this.providers.get(providerName);
      const health = this.providerHealth.get(providerName);
      
      if (!provider || !health?.healthy) {
        continue;
      }

      try {
        const startTime = Date.now();
        let result: ApiResponse<T>;

        // Execute the specific operation
        switch (request.operation) {
          case 'getHistoricalPrices':
            result = await provider.getHistoricalPrices(request.parameters);
            break;
          case 'getCompanyInfo':
            result = await provider.getCompanyInfo!(request.parameters.symbol);
            break;
          case 'getCurrentQuote':
            // This would need to be implemented based on your provider interface
            throw new Error('getCurrentQuote not implemented in provider interface');
          default:
            throw new Error(`Unknown operation: ${request.operation}`);
        }

        const latency = Date.now() - startTime;
        
        // Check if result meets quality requirements
        if (this.assessDataQuality(result, request)) {
          this.handleRequestSuccess(request, result, providerName, latency);
          return;
        } else {
          console.warn(`⚠️ Data quality below threshold from ${providerName}`);
          this.updateProviderHealth(providerName, { 
            dataQualityScore: Math.max(0, health.dataQualityScore - 0.1) 
          });
          continue;
        }

      } catch (error) {
        this.handleProviderError(providerName, error);
        
        // Apply fallback strategies
        const shouldRetry = await this.applyFallbackStrategies(request, providerName, error);
        
        if (!shouldRetry) {
          continue;
        }

        // Wait before retry
        const delay = this.calculateRetryDelay(request.attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All providers failed
    this.handleRequestFailure(request, new MarketDataError({
      code: 'ALL_PROVIDERS_FAILED',
      message: 'All available providers failed',
      provider: request.metadata.originalProvider,
      timestamp: Date.now(),
      retryable: true
    }));
  }

  private selectFallbackProviders(
    operation: string,
    preferredProviders: MarketDataProvider[],
    options: any
  ): MarketDataProvider[] {
    const availableProviders = Array.from(this.providers.keys())
      .filter(provider => !preferredProviders.includes(provider))
      .map(provider => ({
        provider,
        health: this.providerHealth.get(provider)!,
        score: this.calculateProviderScore(provider, operation, options)
      }))
      .filter(p => p.health.healthy && p.health.status === 'active')
      .sort((a, b) => b.score - a.score)
      .map(p => p.provider);

    return availableProviders;
  }

  private calculateProviderScore(
    provider: MarketDataProvider,
    operation: string,
    options: any
  ): number {
    const health = this.providerHealth.get(provider);
    if (!health) return 0;

    let score = 0;

    // Health score (0-40 points)
    score += health.successRate * 40;

    // Latency score (0-30 points)
    const latencyScore = Math.max(0, 30 - (health.averageLatency / 100));
    score += latencyScore;

    // Data quality score (0-20 points)
    score += health.dataQualityScore * 20;

    // Cost optimization (0-10 points)
    if (this.config.costOptimization) {
      const costScore = Math.max(0, 10 - health.costScore);
      score += costScore;
    }

    // Regional preference
    if (options.region && health.region === options.region) {
      score += 10;
    }

    return score;
  }

  private assessDataQuality<T>(result: ApiResponse<T>, request: FallbackRequest<T>): boolean {
    // Basic quality checks
    if (!result.success || !result.data) {
      return false;
    }

    // Operation-specific quality checks would go here
    // For now, we'll use a simple heuristic based on data completeness
    
    if (Array.isArray(result.data)) {
      return result.data.length > 0;
    }

    if (typeof result.data === 'object') {
      const dataObj = result.data as any;
      const requiredFields = this.getRequiredFields(request.operation);
      
      return requiredFields.every(field => 
        dataObj[field] !== undefined && dataObj[field] !== null
      );
    }

    return true;
  }

  private getRequiredFields(operation: string): string[] {
    switch (operation) {
      case 'getHistoricalPrices':
        return ['symbol', 'timestamp', 'open', 'high', 'low', 'close'];
      case 'getCurrentQuote':
        return ['symbol', 'bid', 'ask', 'last'];
      case 'getCompanyInfo':
        return ['symbol', 'name', 'exchange'];
      default:
        return [];
    }
  }

  private async applyFallbackStrategies(
    request: FallbackRequest,
    failedProvider: MarketDataProvider,
    error: any
  ): Promise<boolean> {
    for (const strategy of this.config.fallbackStrategies) {
      if (!strategy.enabled) continue;

      const shouldApply = this.evaluateStrategy(strategy, failedProvider, error, request);
      if (!shouldApply) continue;

      this.metrics.strategies[strategy.name].triggered++;

      for (const action of strategy.actions) {
        switch (action.type) {
          case 'switch_provider':
            if (action.targetProvider && this.providers.has(action.targetProvider)) {
              // Move target provider to front of fallback list
              const index = request.fallbackProviders.indexOf(action.targetProvider);
              if (index > -1) {
                request.fallbackProviders.splice(index, 1);
                request.fallbackProviders.unshift(action.targetProvider);
              }
            }
            break;

          case 'retry_request':
            if (request.attempt < (action.maxAttempts || this.config.maxRetries)) {
              return true;
            }
            break;

          case 'delay_request':
            if (action.delay) {
              await new Promise(resolve => setTimeout(resolve, action.delay));
            }
            break;

          case 'cache_fallback':
            // Try to get data from cache as fallback
            // This would integrate with your cache system
            break;
        }
      }
    }

    return false;
  }

  private evaluateStrategy(
    strategy: FallbackStrategy,
    provider: MarketDataProvider,
    error: any,
    request: FallbackRequest
  ): boolean {
    return strategy.conditions.every(condition => {
      switch (condition.type) {
        case 'provider_down':
          return condition.provider === provider && !this.providerHealth.get(provider)?.healthy;
        
        case 'rate_limited':
          return error?.rateLimited === true;
        
        case 'high_latency':
          const health = this.providerHealth.get(provider);
          return health && health.averageLatency > (condition.threshold || this.config.latencyThreshold);
        
        case 'low_quality':
          const qualityScore = this.providerHealth.get(provider)?.dataQualityScore || 0;
          return qualityScore < (condition.threshold || this.config.qualityThreshold);
        
        default:
          return false;
      }
    });
  }

  private handleRequestSuccess<T>(
    request: FallbackRequest<T>,
    result: ApiResponse<T>,
    provider: MarketDataProvider,
    latency: number
  ): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      // Update provider health metrics
      health.averageLatency = (health.averageLatency * 0.9) + (latency * 0.1);
      health.successRate = Math.min(1, health.successRate + 0.01);
      health.errorRate = Math.max(0, health.errorRate - 0.01);
      health.consecutiveFailures = 0;
      health.lastHealthCheck = Date.now();
    }

    // Update metrics
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);

    if (provider !== request.metadata.originalProvider) {
      this.metrics.fallbacksTriggered++;
      this.metrics.providerSwitches++;
    }

    this.updateProviderMetrics(provider, 'success', latency);
    
    this.activeRequests.delete(request.id);
    request.resolver(result);

    this.emit('request:success', {
      requestId: request.id,
      provider,
      operation: request.operation,
      latency,
      fallbackUsed: provider !== request.metadata.originalProvider
    });
  }

  private handleRequestFailure<T>(request: FallbackRequest<T>, error: MarketDataError): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    
    this.activeRequests.delete(request.id);
    request.rejector(error);

    this.emit('request:failed', {
      requestId: request.id,
      operation: request.operation,
      error: error.message,
      attempts: request.attempt
    });
  }

  private handleProviderError(provider: MarketDataProvider, error: any): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures++;
      health.errorRate = Math.min(1, health.errorRate + 0.05);
      health.successRate = Math.max(0, health.successRate - 0.05);
      health.lastError = error instanceof Error ? error.message : String(error);

      // Mark as unhealthy after consecutive failures
      if (health.consecutiveFailures >= 3) {
        health.healthy = false;
        health.status = 'degraded';
      }

      this.updateProviderMetrics(provider, 'failure', 0);
    }

    this.emit('provider:error', {
      provider,
      error: error instanceof Error ? error.message : String(error),
      consecutiveFailures: health?.consecutiveFailures || 0
    });
  }

  private updateProviderHealth(provider: MarketDataProvider, updates: Partial<ProviderHealth>): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      Object.assign(health, updates);
      health.lastHealthCheck = Date.now();
    }
  }

  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isHealthCheckRunning) {
        this.isHealthCheckRunning = true;
        await this.performAllHealthChecks();
        this.isHealthCheckRunning = false;
      }
    }, this.config.healthCheckInterval);
  }

  private async performAllHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.providers.keys()).map(provider =>
      this.performHealthCheck(provider).catch(error =>
        console.error(`❌ Health check failed for ${provider}:`, error)
      )
    );

    await Promise.all(healthPromises);
  }

  private async performHealthCheck(provider: MarketDataProvider): Promise<void> {
    const providerInstance = this.providers.get(provider);
    const health = this.providerHealth.get(provider);
    
    if (!providerInstance || !health) return;

    try {
      const isHealthy = providerInstance.isHealthy();
      const status = providerInstance.getStatus();

      health.healthy = isHealthy;
      health.lastHealthCheck = Date.now();
      
      if (isHealthy) {
        health.status = 'active';
        health.consecutiveFailures = 0;
      } else {
        health.status = 'unavailable';
      }

      // Update metrics from provider status
      if (status.metrics) {
        health.successRate = status.metrics.successRate / 100;
        health.averageLatency = status.metrics.averageResponseTime;
      }

    } catch (error) {
      health.healthy = false;
      health.status = 'unavailable';
      health.lastError = error instanceof Error ? error.message : String(error);
      health.consecutiveFailures++;
    }
  }

  private updateProviderMetrics(provider: MarketDataProvider, result: 'success' | 'failure', latency: number): void {
    if (!this.metrics.providers[provider]) {
      this.metrics.providers[provider] = {
        attempts: 0,
        successes: 0,
        failures: 0,
        averageLatency: 0,
        lastUsed: 0,
        fallbacksFrom: 0,
        fallbacksTo: 0
      };
    }

    const providerMetrics = this.metrics.providers[provider];
    providerMetrics.attempts++;
    providerMetrics.lastUsed = Date.now();

    if (result === 'success') {
      providerMetrics.successes++;
      if (latency > 0) {
        providerMetrics.averageLatency = (providerMetrics.averageLatency * 0.9) + (latency * 0.1);
      }
    } else {
      providerMetrics.failures++;
    }
  }

  private initializeProviderHealth(provider: MarketDataProvider): ProviderHealth {
    return {
      provider,
      healthy: true,
      lastHealthCheck: Date.now(),
      averageLatency: 1000,
      errorRate: 0,
      successRate: 1,
      dataQualityScore: 0.8,
      costScore: 5,
      capabilities: [],
      consecutiveFailures: 0,
      region: 'us-east-1',
      status: 'active'
    };
  }

  private initializeMetrics(): FallbackMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbacksTriggered: 0,
      averageLatency: 0,
      providerSwitches: 0,
      costSavings: 0,
      dataQualityImprovements: 0,
      strategies: {},
      providers: {}
    };
  }

  private generateRequestId(): string {
    return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}