/**
 * Provider Manager
 * Manages multiple data providers with failover and load balancing
 */

import { EventEmitter } from 'events';
import PQueue from 'p-queue';

import {
  IDataProvider,
  IFailoverManager,
  DataProvider,
  DataProviderConfig,
  MarketDataType,
  Quote,
  Trade,
  OrderBook,
  OHLCV,
  NewsItem,
  HistoricalDataRequest,
  ProviderStats
} from '../types';
import { IEXCloudProvider } from '../providers/iex-cloud-provider';
import { providerLogger, logError, createPerformanceTimer } from '../utils/logger';

interface ProviderInstance {
  provider: IDataProvider;
  config: DataProviderConfig;
  stats: ProviderStats;
  lastHealthCheck: number;
  consecutiveFailures: number;
  isHealthy: boolean;
  circuitBreakerOpen: boolean;
  circuitBreakerOpenTime?: number;
}

export class ProviderManager extends EventEmitter implements IFailoverManager {
  private providers = new Map<DataProvider, ProviderInstance>();
  private activeProviders = new Map<MarketDataType, DataProvider>();
  private requestQueue: PQueue;
  private healthCheckInterval?: NodeJS.Timeout;

  // Circuit breaker configuration
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerTimeout = 60000; // 1 minute
  private readonly circuitBreakerRecoveryThreshold = 3;

  constructor(configs: DataProviderConfig[]) {
    super();

    // Initialize request queue for provider operations
    this.requestQueue = new PQueue({
      concurrency: 10,
      interval: 1000,
      intervalCap: 50
    });

    // Initialize providers
    this.initializeProviders(configs);

    // Start health monitoring
    this.startHealthMonitoring();

    providerLogger.info('Provider manager initialized', {
      providerCount: this.providers.size,
      providers: Array.from(this.providers.keys())
    });
  }

  // === Provider Initialization ===

  private initializeProviders(configs: DataProviderConfig[]): void {
    for (const config of configs) {
      if (!config.enabled) {
        providerLogger.info(`Skipping disabled provider: ${config.provider}`);
        continue;
      }

      try {
        const provider = this.createProvider(config);
        const instance: ProviderInstance = {
          provider,
          config,
          stats: this.initializeStats(),
          lastHealthCheck: 0,
          consecutiveFailures: 0,
          isHealthy: true,
          circuitBreakerOpen: false
        };

        this.providers.set(config.provider, instance);
        this.setupProviderEventHandlers(provider, config.provider);

        // Set as active provider for all data types if it's the first or highest priority
        for (const dataType of Object.values(MarketDataType)) {
          if (!this.activeProviders.has(dataType) || 
              config.priority < this.getProviderConfig(this.activeProviders.get(dataType)!)?.priority!) {
            this.activeProviders.set(dataType, config.provider);
          }
        }

        providerLogger.info(`Initialized provider: ${config.provider}`, {
          priority: config.priority,
          rateLimits: config.rateLimits
        });

      } catch (error) {
        logError(error as Error, 'provider-manager', {
          operation: 'initializeProvider',
          provider: config.provider
        });
      }
    }
  }

  private createProvider(config: DataProviderConfig): IDataProvider {
    switch (config.provider) {
      case DataProvider.IEX_CLOUD:
        return new IEXCloudProvider(config);
      
      // Add other providers here as they're implemented
      case DataProvider.ALPHA_VANTAGE:
      case DataProvider.FINNHUB:
      case DataProvider.POLYGON:
      case DataProvider.YAHOO_FINANCE:
        throw new Error(`Provider ${config.provider} not yet implemented`);
      
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  private setupProviderEventHandlers(provider: IDataProvider, providerName: DataProvider): void {
    provider.on('connected', () => {
      providerLogger.info(`Provider connected: ${providerName}`);
      this.updateProviderHealth(providerName, true);
    });

    provider.on('disconnected', () => {
      providerLogger.warn(`Provider disconnected: ${providerName}`);
      this.updateProviderHealth(providerName, false);
    });

    provider.on('error', (error: Error) => {
      providerLogger.error(`Provider error: ${providerName}`, error);
      this.handleProviderError(providerName, error);
    });

    provider.on('quote', (quote: Quote) => {
      this.emit('quote', quote);
      this.updateProviderStats(providerName, 'quote', true);
    });

    provider.on('trade', (trade: Trade) => {
      this.emit('trade', trade);
      this.updateProviderStats(providerName, 'trade', true);
    });

    provider.on('news', (news: NewsItem) => {
      this.emit('news', news);
      this.updateProviderStats(providerName, 'news', true);
    });
  }

  private initializeStats(): ProviderStats {
    return {
      uptime: 0,
      errorRate: 0,
      avgLatency: 0,
      requestCount: 0,
      isHealthy: true
    };
  }

  // === Public Interface ===

  async connectAll(): Promise<void> {
    const timer = createPerformanceTimer('provider-manager-connect-all');

    try {
      const connectionPromises = Array.from(this.providers.values()).map(async (instance) => {
        try {
          await instance.provider.connect();
          providerLogger.info(`Connected to provider: ${instance.config.provider}`);
        } catch (error) {
          logError(error as Error, 'provider-manager', {
            operation: 'connect',
            provider: instance.config.provider
          });
          this.handleProviderError(instance.config.provider, error as Error);
        }
      });

      await Promise.allSettled(connectionPromises);
      providerLogger.info('All provider connections attempted');

    } catch (error) {
      logError(error as Error, 'provider-manager', { operation: 'connectAll' });
      throw error;
    } finally {
      timer.end();
    }
  }

  async disconnectAll(): Promise<void> {
    const timer = createPerformanceTimer('provider-manager-disconnect-all');

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Disconnect all providers
      const disconnectionPromises = Array.from(this.providers.values()).map(async (instance) => {
        try {
          await instance.provider.disconnect();
          providerLogger.info(`Disconnected from provider: ${instance.config.provider}`);
        } catch (error) {
          logError(error as Error, 'provider-manager', {
            operation: 'disconnect',
            provider: instance.config.provider
          });
        }
      });

      await Promise.allSettled(disconnectionPromises);
      
      // Clear request queue
      this.requestQueue.clear();

      providerLogger.info('All providers disconnected');

    } catch (error) {
      logError(error as Error, 'provider-manager', { operation: 'disconnectAll' });
      throw error;
    } finally {
      timer.end();
    }
  }

  // === Failover Interface ===

  getActiveProvider(dataType: MarketDataType): DataProvider {
    const activeProvider = this.activeProviders.get(dataType);
    
    if (!activeProvider || !this.isProviderHealthy(activeProvider)) {
      // Try to find a healthy fallback
      const fallbackProvider = this.findHealthyFallback(dataType, activeProvider);
      if (fallbackProvider) {
        this.activeProviders.set(dataType, fallbackProvider);
        return fallbackProvider;
      }
    }
    
    return activeProvider || DataProvider.IEX_CLOUD; // Default fallback
  }

  reportProviderHealth(provider: DataProvider, healthy: boolean): void {
    this.updateProviderHealth(provider, healthy);
  }

  async switchProvider(dataType: MarketDataType, reason: string): Promise<DataProvider> {
    const currentProvider = this.activeProviders.get(dataType);
    const fallbackProvider = this.findHealthyFallback(dataType, currentProvider);

    if (fallbackProvider) {
      this.activeProviders.set(dataType, fallbackProvider);
      
      providerLogger.warn(`Switched provider for ${dataType}`, {
        from: currentProvider,
        to: fallbackProvider,
        reason
      });

      this.emit('provider_switched', {
        dataType,
        from: currentProvider,
        to: fallbackProvider,
        reason
      });

      return fallbackProvider;
    }

    throw new Error(`No healthy fallback provider available for ${dataType}`);
  }

  getProviderStats(): Record<DataProvider, ProviderStats> {
    const stats: Record<DataProvider, ProviderStats> = {} as any;
    
    for (const [provider, instance] of this.providers.entries()) {
      stats[provider] = { ...instance.stats };
    }
    
    return stats;
  }

  // === Data Fetching Methods ===

  async getQuote(symbol: string, preferredProvider?: DataProvider): Promise<Quote | null> {
    return this.executeWithFallback(
      'getQuote',
      MarketDataType.QUOTE,
      (provider) => provider.getQuote(symbol),
      { symbol, preferredProvider }
    );
  }

  async getTrades(symbol: string, limit?: number, preferredProvider?: DataProvider): Promise<Trade[]> {
    return this.executeWithFallback(
      'getTrades',
      MarketDataType.TRADE,
      (provider) => provider.getTrades(symbol, limit),
      { symbol, limit, preferredProvider }
    ) || [];
  }

  async getOrderBook(symbol: string, depth?: number, preferredProvider?: DataProvider): Promise<OrderBook | null> {
    return this.executeWithFallback(
      'getOrderBook',
      MarketDataType.ORDER_BOOK,
      (provider) => provider.getOrderBook(symbol, depth),
      { symbol, depth, preferredProvider }
    );
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<OHLCV[]> {
    return this.executeWithFallback(
      'getHistoricalData',
      MarketDataType.OHLCV,
      (provider) => provider.getHistoricalData(request),
      { request }
    ) || [];
  }

  async getNews(symbols: string[], limit?: number, preferredProvider?: DataProvider): Promise<NewsItem[]> {
    return this.executeWithFallback(
      'getNews',
      MarketDataType.NEWS,
      (provider) => provider.getNews(symbols, limit),
      { symbols, limit, preferredProvider }
    ) || [];
  }

  // === Subscription Management ===

  async subscribeToSymbols(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    const subscriptionPromises: Promise<void>[] = [];

    for (const dataType of dataTypes) {
      const activeProvider = this.getActiveProvider(dataType);
      const instance = this.providers.get(activeProvider);
      
      if (instance && this.isProviderHealthy(activeProvider)) {
        subscriptionPromises.push(
          instance.provider.subscribe(symbols, [dataType])
            .catch((error) => {
              logError(error as Error, 'provider-manager', {
                operation: 'subscribe',
                provider: activeProvider,
                symbols,
                dataType
              });
            })
        );
      }
    }

    await Promise.allSettled(subscriptionPromises);
    
    providerLogger.info('Subscribed to symbols', {
      symbols: symbols.length,
      dataTypes: dataTypes.length
    });
  }

  async unsubscribeFromSymbols(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    const unsubscriptionPromises: Promise<void>[] = [];

    for (const dataType of dataTypes) {
      const activeProvider = this.getActiveProvider(dataType);
      const instance = this.providers.get(activeProvider);
      
      if (instance) {
        unsubscriptionPromises.push(
          instance.provider.unsubscribe(symbols, [dataType])
            .catch((error) => {
              logError(error as Error, 'provider-manager', {
                operation: 'unsubscribe',
                provider: activeProvider,
                symbols,
                dataType
              });
            })
        );
      }
    }

    await Promise.allSettled(unsubscriptionPromises);
    
    providerLogger.info('Unsubscribed from symbols', {
      symbols: symbols.length,
      dataTypes: dataTypes.length
    });
  }

  // === Private Helper Methods ===

  private async executeWithFallback<T>(
    operation: string,
    dataType: MarketDataType,
    executor: (provider: IDataProvider) => Promise<T>,
    metadata: any
  ): Promise<T | null> {
    const timer = createPerformanceTimer(`provider-manager-${operation}`, metadata);
    
    // Determine provider order: preferred, active, then fallbacks
    const providers: DataProvider[] = [];
    
    if (metadata.preferredProvider && this.isProviderHealthy(metadata.preferredProvider)) {
      providers.push(metadata.preferredProvider);
    }
    
    const activeProvider = this.getActiveProvider(dataType);
    if (!providers.includes(activeProvider) && this.isProviderHealthy(activeProvider)) {
      providers.push(activeProvider);
    }
    
    // Add other healthy providers as fallbacks
    for (const [provider] of this.providers.entries()) {
      if (!providers.includes(provider) && this.isProviderHealthy(provider)) {
        providers.push(provider);
      }
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      const instance = this.providers.get(provider);
      if (!instance) continue;

      try {
        const result = await this.requestQueue.add(() => executor(instance.provider));
        
        // Update stats on success
        this.updateProviderStats(provider, operation, true);
        
        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Update stats on failure
        this.updateProviderStats(provider, operation, false);
        this.handleProviderError(provider, error as Error);
        
        providerLogger.warn(`Provider ${provider} failed for ${operation}`, {
          error: error.message,
          ...metadata
        });
        
        // If this was the active provider, try to switch
        if (provider === activeProvider) {
          try {
            await this.switchProvider(dataType, `${operation} failed: ${error.message}`);
          } catch (switchError) {
            // Continue to next provider if switch fails
          }
        }
      }
    }

    // All providers failed
    logError(lastError || new Error('All providers failed'), 'provider-manager', {
      operation,
      dataType,
      providersAttempted: providers.length,
      ...metadata
    });

    return null;
  }

  private findHealthyFallback(dataType: MarketDataType, excludeProvider?: DataProvider): DataProvider | null {
    const sortedProviders = Array.from(this.providers.entries())
      .filter(([provider]) => provider !== excludeProvider)
      .sort((a, b) => a[1].config.priority - b[1].config.priority);

    for (const [provider, instance] of sortedProviders) {
      if (this.isProviderHealthy(provider)) {
        return provider;
      }
    }

    return null;
  }

  private isProviderHealthy(provider: DataProvider): boolean {
    const instance = this.providers.get(provider);
    if (!instance) return false;

    // Check circuit breaker
    if (instance.circuitBreakerOpen) {
      const now = Date.now();
      if (instance.circuitBreakerOpenTime && 
          now - instance.circuitBreakerOpenTime > this.circuitBreakerTimeout) {
        // Try to close circuit breaker
        instance.circuitBreakerOpen = false;
        instance.consecutiveFailures = 0;
        providerLogger.info(`Circuit breaker reset for provider: ${provider}`);
      } else {
        return false;
      }
    }

    return instance.isHealthy && instance.consecutiveFailures < this.circuitBreakerThreshold;
  }

  private updateProviderHealth(provider: DataProvider, healthy: boolean): void {
    const instance = this.providers.get(provider);
    if (!instance) return;

    instance.isHealthy = healthy;
    instance.stats.isHealthy = healthy;

    if (healthy) {
      instance.consecutiveFailures = 0;
    }

    providerLogger.debug(`Provider health updated: ${provider}`, { healthy });
  }

  private handleProviderError(provider: DataProvider, error: Error): void {
    const instance = this.providers.get(provider);
    if (!instance) return;

    instance.consecutiveFailures++;
    instance.stats.lastError = error.message;
    instance.stats.lastErrorTime = Date.now();

    // Open circuit breaker if threshold exceeded
    if (instance.consecutiveFailures >= this.circuitBreakerThreshold && !instance.circuitBreakerOpen) {
      instance.circuitBreakerOpen = true;
      instance.circuitBreakerOpenTime = Date.now();
      
      providerLogger.warn(`Circuit breaker opened for provider: ${provider}`, {
        consecutiveFailures: instance.consecutiveFailures,
        threshold: this.circuitBreakerThreshold
      });
      
      this.emit('circuit_breaker_opened', { provider, error });
    }
  }

  private updateProviderStats(provider: DataProvider, operation: string, success: boolean): void {
    const instance = this.providers.get(provider);
    if (!instance) return;

    instance.stats.requestCount++;
    
    if (!success) {
      const errorRate = (instance.stats.requestCount - 1) === 0 ? 
        1 : 
        (instance.stats.errorRate * (instance.stats.requestCount - 1) + 1) / instance.stats.requestCount;
      instance.stats.errorRate = errorRate;
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logError(error as Error, 'provider-manager', { operation: 'healthCheck' });
      }
    }, 60000); // Every minute

    providerLogger.info('Health monitoring started');
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.entries()).map(async ([provider, instance]) => {
      try {
        const healthy = await instance.provider.isHealthy();
        this.updateProviderHealth(provider, healthy);
        instance.lastHealthCheck = Date.now();
      } catch (error) {
        this.updateProviderHealth(provider, false);
        logError(error as Error, 'provider-manager', {
          operation: 'healthCheck',
          provider
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  private getProviderConfig(provider: DataProvider): DataProviderConfig | undefined {
    return this.providers.get(provider)?.config;
  }
}