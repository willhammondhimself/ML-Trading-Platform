import { EventEmitter } from 'events';
import {
  MarketDataProvider,
  MarketDataError,
  DEFAULT_RATE_LIMITS
} from '@/types/market-data';

/**
 * Comprehensive Rate Limit Management System
 * 
 * Features:
 * - Multi-provider rate limit tracking and enforcement
 * - Token bucket algorithm with burst handling
 * - Sliding window rate limiting
 * - Request queuing with priority management
 * - Adaptive throttling based on provider responses
 * - Cross-provider load balancing
 * - Rate limit forecasting and planning
 * - Circuit breaker pattern for failing providers
 * - Real-time monitoring and alerting
 */

export interface RateLimitRule {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstSize: number;
  windowSize: number; // milliseconds
  cooldownPeriod: number; // milliseconds after limit exceeded
}

export interface ProviderRateLimitConfig {
  provider: MarketDataProvider;
  rules: RateLimitRule;
  priority: number; // Higher number = higher priority
  enabled: boolean;
  circuitBreakerThreshold: number; // consecutive failures before opening circuit
  circuitBreakerTimeout: number; // milliseconds before attempting reset
}

export interface RateLimitState {
  tokens: number;
  maxTokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
  windowRequests: number[];
  blocked: boolean;
  blockedUntil: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  lastFailure: number;
}

export interface RequestMetadata {
  id: string;
  provider: MarketDataProvider;
  priority: number;
  timestamp: number;
  retries: number;
  timeout: number;
  callback: (allowed: boolean, waitTime?: number) => void;
  timeoutHandle?: NodeJS.Timeout;
}

export interface RateLimitMetrics {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  queuedRequests: number;
  timedOutRequests: number;
  averageWaitTime: number;
  circuitBreakerTrips: number;
  providerMetrics: Record<MarketDataProvider, {
    requests: number;
    allowed: number;
    denied: number;
    averageResponseTime: number;
    utilization: number;
    circuitBreakerTrips: number;
    lastActivity: number;
  }>;
  currentLoad: Record<MarketDataProvider, number>; // 0-1 utilization
  predictions: Record<MarketDataProvider, {
    nextResetTime: number;
    tokensAvailable: number;
    recommendedWaitTime: number;
  }>;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'weighted' | 'least-loaded' | 'priority';
  weights?: Record<MarketDataProvider, number>;
  fallbackOrder?: MarketDataProvider[];
}

export class RateLimitManager extends EventEmitter {
  private providerConfigs: Map<MarketDataProvider, ProviderRateLimitConfig> = new Map();
  private providerStates: Map<MarketDataProvider, RateLimitState> = new Map();
  private requestQueue: RequestMetadata[] = [];
  private metrics: RateLimitMetrics;
  private loadBalancingStrategy: LoadBalancingStrategy;
  private isProcessingQueue = false;
  private queueProcessor?: NodeJS.Timeout;
  private metricsCollector?: NodeJS.Timeout;
  private stateUpdater?: NodeJS.Timeout;

  constructor(
    configs: ProviderRateLimitConfig[],
    loadBalancingStrategy: LoadBalancingStrategy = { type: 'priority' }
  ) {
    super();
    
    this.loadBalancingStrategy = loadBalancingStrategy;
    this.metrics = this.initializeMetrics();
    
    // Initialize provider configurations
    configs.forEach(config => {
      this.providerConfigs.set(config.provider, config);
      this.providerStates.set(config.provider, this.initializeProviderState(config));
    });

    // Set up default configurations for providers without explicit config
    this.setupDefaultConfigurations();
    
    // Start background processing
    this.startQueueProcessor();
    this.startMetricsCollection();
    this.startStateUpdater();
  }

  /**
   * Check if a request to a specific provider is allowed immediately
   */
  isRequestAllowed(provider: MarketDataProvider, priority: number = 5): boolean {
    const config = this.providerConfigs.get(provider);
    const state = this.providerStates.get(provider);

    if (!config || !state || !config.enabled) {
      return false;
    }

    // Check circuit breaker
    if (state.circuitBreakerState === 'open') {
      return false;
    }

    // Check if blocked
    if (state.blocked && Date.now() < state.blockedUntil) {
      return false;
    } else if (state.blocked && Date.now() >= state.blockedUntil) {
      // Unblock if cooldown period has passed
      state.blocked = false;
      state.blockedUntil = 0;
    }

    const now = Date.now();
    
    // Update token bucket
    this.updateTokenBucket(state, now);
    
    // Check token availability
    if (state.tokens < 1) {
      return false;
    }

    // Check sliding window limits
    if (!this.checkSlidingWindowLimits(state, config.rules, now)) {
      return false;
    }

    return true;
  }

  /**
   * Request permission to make an API call (may queue if rate limited)
   */
  async requestPermission(
    provider: MarketDataProvider,
    priority: number = 5,
    timeout: number = 30000
  ): Promise<{ allowed: boolean; waitTime?: number; recommendedProvider?: MarketDataProvider }> {
    return new Promise((resolve) => {
      // Check if immediately allowed
      if (this.isRequestAllowed(provider, priority)) {
        this.consumeToken(provider);
        this.updateMetrics('allowed', provider);
        resolve({ allowed: true });
        return;
      }

      // Check for alternative providers
      const alternativeProvider = this.findAlternativeProvider(provider, priority);
      if (alternativeProvider && this.isRequestAllowed(alternativeProvider, priority)) {
        this.consumeToken(alternativeProvider);
        this.updateMetrics('allowed', alternativeProvider);
        resolve({ allowed: true, recommendedProvider: alternativeProvider });
        return;
      }

      // Queue the request
      const requestId = this.generateRequestId();
      const request: RequestMetadata = {
        id: requestId,
        provider,
        priority,
        timestamp: Date.now(),
        retries: 0,
        timeout,
        callback: (allowed, waitTime) => resolve({ allowed, waitTime }),
        timeoutHandle: setTimeout(() => {
          this.removeFromQueue(requestId);
          this.updateMetrics('timeout', provider);
          resolve({ allowed: false, waitTime: timeout });
        }, timeout)
      };

      this.addToQueue(request);
      this.updateMetrics('queued', provider);
      
      this.emit('request:queued', {
        provider,
        requestId,
        queuePosition: this.requestQueue.length,
        estimatedWaitTime: this.estimateWaitTime(provider)
      });
    });
  }

  /**
   * Get the best available provider for a request
   */
  getBestProvider(
    preferredProviders: MarketDataProvider[] = [],
    priority: number = 5
  ): MarketDataProvider | null {
    const availableProviders = this.getAvailableProviders();
    
    if (availableProviders.length === 0) {
      return null;
    }

    // Try preferred providers first
    for (const provider of preferredProviders) {
      if (availableProviders.includes(provider) && this.isRequestAllowed(provider, priority)) {
        return provider;
      }
    }

    // Use load balancing strategy
    switch (this.loadBalancingStrategy.type) {
      case 'least-loaded':
        return this.getLeastLoadedProvider(availableProviders);
      case 'weighted':
        return this.getWeightedProvider(availableProviders);
      case 'priority':
        return this.getHighestPriorityProvider(availableProviders);
      case 'round-robin':
      default:
        return this.getRoundRobinProvider(availableProviders);
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: MarketDataProvider, responseTime: number): void {
    const state = this.providerStates.get(provider);
    if (state) {
      // Reset circuit breaker on success
      if (state.circuitBreakerState === 'half-open') {
        state.circuitBreakerState = 'closed';
        state.consecutiveFailures = 0;
        
        this.emit('circuit-breaker:closed', { provider });
      } else if (state.circuitBreakerState === 'closed') {
        state.consecutiveFailures = 0;
      }
    }

    this.updateProviderMetrics(provider, 'success', responseTime);
  }

  /**
   * Record a failed request
   */
  recordFailure(provider: MarketDataProvider, error: MarketDataError): void {
    const state = this.providerStates.get(provider);
    const config = this.providerConfigs.get(provider);
    
    if (state && config) {
      state.consecutiveFailures++;
      state.lastFailure = Date.now();

      // Handle rate limit errors
      if (error.rateLimited) {
        this.handleRateLimitExceeded(provider, error);
      }

      // Check circuit breaker threshold
      if (state.consecutiveFailures >= config.circuitBreakerThreshold && 
          state.circuitBreakerState === 'closed') {
        
        state.circuitBreakerState = 'open';
        this.metrics.circuitBreakerTrips++;
        this.metrics.providerMetrics[provider].circuitBreakerTrips++;
        
        // Schedule circuit breaker reset attempt
        setTimeout(() => {
          if (state.circuitBreakerState === 'open') {
            state.circuitBreakerState = 'half-open';
            this.emit('circuit-breaker:half-open', { provider });
          }
        }, config.circuitBreakerTimeout);

        this.emit('circuit-breaker:opened', { 
          provider, 
          consecutiveFailures: state.consecutiveFailures 
        });
      }
    }

    this.updateProviderMetrics(provider, 'failure', 0);
  }

  /**
   * Get current rate limit status for a provider
   */
  getProviderStatus(provider: MarketDataProvider): {
    enabled: boolean;
    tokensAvailable: number;
    maxTokens: number;
    blocked: boolean;
    blockedUntil: number;
    circuitBreakerState: string;
    utilization: number;
    nextResetTime: number;
    queueSize: number;
  } {
    const config = this.providerConfigs.get(provider);
    const state = this.providerStates.get(provider);
    
    if (!config || !state) {
      return {
        enabled: false,
        tokensAvailable: 0,
        maxTokens: 0,
        blocked: true,
        blockedUntil: 0,
        circuitBreakerState: 'open',
        utilization: 0,
        nextResetTime: 0,
        queueSize: 0
      };
    }

    const queueSize = this.requestQueue.filter(req => req.provider === provider).length;
    const utilization = this.calculateProviderUtilization(provider);
    const nextResetTime = this.calculateNextResetTime(state);

    return {
      enabled: config.enabled,
      tokensAvailable: Math.floor(state.tokens),
      maxTokens: state.maxTokens,
      blocked: state.blocked,
      blockedUntil: state.blockedUntil,
      circuitBreakerState: state.circuitBreakerState,
      utilization,
      nextResetTime,
      queueSize
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): RateLimitMetrics {
    // Update current load and predictions
    for (const provider of this.providerConfigs.keys()) {
      this.metrics.currentLoad[provider] = this.calculateProviderUtilization(provider);
      this.metrics.predictions[provider] = this.generateProviderPredictions(provider);
    }

    return { ...this.metrics };
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(provider: MarketDataProvider, config: Partial<ProviderRateLimitConfig>): void {
    const currentConfig = this.providerConfigs.get(provider);
    if (currentConfig) {
      const updatedConfig = { ...currentConfig, ...config };
      this.providerConfigs.set(provider, updatedConfig);
      
      // Reinitialize state if rules changed
      if (config.rules) {
        this.providerStates.set(provider, this.initializeProviderState(updatedConfig));
      }

      this.emit('provider:config-updated', { provider, config: updatedConfig });
    }
  }

  /**
   * Reset rate limits for a provider
   */
  resetProvider(provider: MarketDataProvider): void {
    const config = this.providerConfigs.get(provider);
    if (config) {
      this.providerStates.set(provider, this.initializeProviderState(config));
      
      this.emit('provider:reset', { provider });
    }
  }

  /**
   * Shutdown rate limit manager
   */
  shutdown(): void {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }
    
    if (this.metricsCollector) {
      clearInterval(this.metricsCollector);
    }
    
    if (this.stateUpdater) {
      clearInterval(this.stateUpdater);
    }

    // Clear all pending request timeouts
    this.requestQueue.forEach(request => {
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }
      request.callback(false, 0);
    });

    this.requestQueue = [];
    this.removeAllListeners();
  }

  // Private methods

  private setupDefaultConfigurations(): void {
    const providers: MarketDataProvider[] = [
      'alpha_vantage', 'polygon', 'iex', 'finnhub', 'yahoo', 'quandl'
    ];

    providers.forEach(provider => {
      if (!this.providerConfigs.has(provider)) {
        const limits = DEFAULT_RATE_LIMITS[provider.toUpperCase() as keyof typeof DEFAULT_RATE_LIMITS];
        
        const config: ProviderRateLimitConfig = {
          provider,
          rules: {
            requestsPerMinute: limits.requestsPerMinute,
            requestsPerHour: limits.requestsPerHour,
            requestsPerDay: limits.requestsPerHour * 24,
            burstSize: Math.min(limits.requestsPerMinute / 4, 10),
            windowSize: 60000, // 1 minute
            cooldownPeriod: 60000 // 1 minute
          },
          priority: this.getDefaultPriority(provider),
          enabled: true,
          circuitBreakerThreshold: 5,
          circuitBreakerTimeout: 300000 // 5 minutes
        };

        this.providerConfigs.set(provider, config);
        this.providerStates.set(provider, this.initializeProviderState(config));
      }
    });
  }

  private getDefaultPriority(provider: MarketDataProvider): number {
    const priorities: Record<MarketDataProvider, number> = {
      polygon: 10,
      alpha_vantage: 8,
      iex: 7,
      finnhub: 6,
      yahoo: 5,
      quandl: 4,
      newsapi: 3,
      twitter: 2
    };
    
    return priorities[provider] || 1;
  }

  private initializeProviderState(config: ProviderRateLimitConfig): RateLimitState {
    return {
      tokens: config.rules.burstSize,
      maxTokens: config.rules.burstSize,
      refillRate: config.rules.requestsPerMinute / 60, // tokens per second
      lastRefill: Date.now(),
      windowRequests: [],
      blocked: false,
      blockedUntil: 0,
      circuitBreakerState: 'closed',
      consecutiveFailures: 0,
      lastFailure: 0
    };
  }

  private updateTokenBucket(state: RateLimitState, now: number): void {
    const timePassed = now - state.lastRefill;
    const tokensToAdd = (timePassed / 1000) * state.refillRate;
    
    state.tokens = Math.min(state.maxTokens, state.tokens + tokensToAdd);
    state.lastRefill = now;
  }

  private checkSlidingWindowLimits(state: RateLimitState, rules: RateLimitRule, now: number): boolean {
    // Clean old requests outside the window
    state.windowRequests = state.windowRequests.filter(timestamp => 
      now - timestamp < rules.windowSize
    );

    // Check if within limit
    return state.windowRequests.length < rules.requestsPerMinute;
  }

  private consumeToken(provider: MarketDataProvider): void {
    const state = this.providerStates.get(provider);
    if (state) {
      state.tokens = Math.max(0, state.tokens - 1);
      state.windowRequests.push(Date.now());
    }
  }

  private findAlternativeProvider(
    preferredProvider: MarketDataProvider,
    priority: number
  ): MarketDataProvider | null {
    const availableProviders = this.getAvailableProviders()
      .filter(p => p !== preferredProvider);
      
    if (availableProviders.length === 0) {
      return null;
    }

    // Use load balancing strategy to select alternative
    return this.getBestProvider(availableProviders, priority) || null;
  }

  private getAvailableProviders(): MarketDataProvider[] {
    return Array.from(this.providerConfigs.keys()).filter(provider => {
      const config = this.providerConfigs.get(provider);
      const state = this.providerStates.get(provider);
      
      return config?.enabled && 
             state?.circuitBreakerState !== 'open' &&
             (!state?.blocked || Date.now() >= state.blockedUntil);
    });
  }

  private getLeastLoadedProvider(providers: MarketDataProvider[]): MarketDataProvider {
    return providers.reduce((best, current) => {
      const bestUtilization = this.calculateProviderUtilization(best);
      const currentUtilization = this.calculateProviderUtilization(current);
      return currentUtilization < bestUtilization ? current : best;
    });
  }

  private getWeightedProvider(providers: MarketDataProvider[]): MarketDataProvider {
    const weights = this.loadBalancingStrategy.weights || {};
    let totalWeight = 0;
    const weightedProviders = providers.map(provider => {
      const weight = weights[provider] || 1;
      totalWeight += weight;
      return { provider, weight };
    });

    const random = Math.random() * totalWeight;
    let currentWeight = 0;
    
    for (const { provider, weight } of weightedProviders) {
      currentWeight += weight;
      if (random <= currentWeight) {
        return provider;
      }
    }

    return providers[0];
  }

  private getHighestPriorityProvider(providers: MarketDataProvider[]): MarketDataProvider {
    return providers.reduce((best, current) => {
      const bestPriority = this.providerConfigs.get(best)?.priority || 0;
      const currentPriority = this.providerConfigs.get(current)?.priority || 0;
      return currentPriority > bestPriority ? current : best;
    });
  }

  private getRoundRobinProvider(providers: MarketDataProvider[]): MarketDataProvider {
    // Simple round-robin based on total requests
    const providerCounts = providers.map(provider => ({
      provider,
      count: this.metrics.providerMetrics[provider]?.requests || 0
    }));

    return providerCounts.reduce((best, current) => 
      current.count < best.count ? current : best
    ).provider;
  }

  private calculateProviderUtilization(provider: MarketDataProvider): number {
    const state = this.providerStates.get(provider);
    const config = this.providerConfigs.get(provider);
    
    if (!state || !config) return 0;

    const tokenUtilization = 1 - (state.tokens / state.maxTokens);
    const windowUtilization = state.windowRequests.length / config.rules.requestsPerMinute;
    
    return Math.max(tokenUtilization, windowUtilization);
  }

  private estimateWaitTime(provider: MarketDataProvider): number {
    const state = this.providerStates.get(provider);
    if (!state) return 0;

    if (state.blocked) {
      return Math.max(0, state.blockedUntil - Date.now());
    }

    // Estimate based on token refill rate
    const tokensNeeded = Math.max(0, 1 - state.tokens);
    return (tokensNeeded / state.refillRate) * 1000; // milliseconds
  }

  private calculateNextResetTime(state: RateLimitState): number {
    const tokensNeeded = Math.max(0, 1 - state.tokens);
    const timeToRefill = (tokensNeeded / state.refillRate) * 1000;
    return Date.now() + timeToRefill;
  }

  private generateProviderPredictions(provider: MarketDataProvider): {
    nextResetTime: number;
    tokensAvailable: number;
    recommendedWaitTime: number;
  } {
    const state = this.providerStates.get(provider);
    
    if (!state) {
      return {
        nextResetTime: 0,
        tokensAvailable: 0,
        recommendedWaitTime: 0
      };
    }

    return {
      nextResetTime: this.calculateNextResetTime(state),
      tokensAvailable: Math.floor(state.tokens),
      recommendedWaitTime: this.estimateWaitTime(provider)
    };
  }

  private handleRateLimitExceeded(provider: MarketDataProvider, error: MarketDataError): void {
    const state = this.providerStates.get(provider);
    const config = this.providerConfigs.get(provider);
    
    if (state && config) {
      state.blocked = true;
      state.blockedUntil = Date.now() + config.rules.cooldownPeriod;
      state.tokens = 0; // Drain all tokens
      
      this.emit('rate-limit:exceeded', {
        provider,
        cooldownPeriod: config.rules.cooldownPeriod,
        error: error.message
      });
    }
  }

  private addToQueue(request: RequestMetadata): void {
    // Insert in priority order (lower number = higher priority)
    let insertIndex = this.requestQueue.length;
    
    for (let i = 0; i < this.requestQueue.length; i++) {
      if (request.priority < this.requestQueue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.requestQueue.splice(insertIndex, 0, request);
  }

  private removeFromQueue(requestId: string): void {
    const index = this.requestQueue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      const request = this.requestQueue[index];
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }
      this.requestQueue.splice(index, 1);
    }
  }

  private startQueueProcessor(): void {
    this.queueProcessor = setInterval(() => {
      this.processQueue();
    }, 100); // Process every 100ms
  }

  private processQueue(): void {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    const processedRequests: string[] = [];

    for (const request of this.requestQueue) {
      if (this.isRequestAllowed(request.provider, request.priority)) {
        this.consumeToken(request.provider);
        
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        
        request.callback(true, 0);
        processedRequests.push(request.id);
        this.updateMetrics('allowed', request.provider);
        
        this.emit('request:processed', {
          requestId: request.id,
          provider: request.provider,
          waitTime: Date.now() - request.timestamp
        });
      }
    }

    // Remove processed requests
    this.requestQueue = this.requestQueue.filter(req => !processedRequests.includes(req.id));
    
    this.isProcessingQueue = false;
  }

  private startMetricsCollection(): void {
    this.metricsCollector = setInterval(() => {
      this.updateMetrics();
    }, 30000); // Every 30 seconds
  }

  private startStateUpdater(): void {
    this.stateUpdater = setInterval(() => {
      const now = Date.now();
      
      // Update all provider states
      this.providerStates.forEach(state => {
        this.updateTokenBucket(state, now);
        
        // Clean old window requests
        state.windowRequests = state.windowRequests.filter(timestamp => 
          now - timestamp < 60000 // 1 minute window
        );
      });
    }, 1000); // Every second
  }

  private updateMetrics(operation?: string, provider?: MarketDataProvider): void {
    if (operation && provider) {
      this.metrics.totalRequests++;
      
      if (!this.metrics.providerMetrics[provider]) {
        this.metrics.providerMetrics[provider] = {
          requests: 0,
          allowed: 0,
          denied: 0,
          averageResponseTime: 0,
          utilization: 0,
          circuitBreakerTrips: 0,
          lastActivity: 0
        };
      }

      const providerMetrics = this.metrics.providerMetrics[provider];
      providerMetrics.requests++;
      providerMetrics.lastActivity = Date.now();
      
      switch (operation) {
        case 'allowed':
          this.metrics.allowedRequests++;
          providerMetrics.allowed++;
          break;
        case 'denied':
          this.metrics.deniedRequests++;
          providerMetrics.denied++;
          break;
        case 'queued':
          this.metrics.queuedRequests++;
          break;
        case 'timeout':
          this.metrics.timedOutRequests++;
          break;
      }
    }
  }

  private updateProviderMetrics(provider: MarketDataProvider, result: 'success' | 'failure', responseTime: number): void {
    if (!this.metrics.providerMetrics[provider]) {
      this.metrics.providerMetrics[provider] = {
        requests: 0,
        allowed: 0,
        denied: 0,
        averageResponseTime: 0,
        utilization: 0,
        circuitBreakerTrips: 0,
        lastActivity: 0
      };
    }

    const providerMetrics = this.metrics.providerMetrics[provider];
    
    if (result === 'success' && responseTime > 0) {
      const totalTime = providerMetrics.averageResponseTime * providerMetrics.requests + responseTime;
      providerMetrics.averageResponseTime = totalTime / (providerMetrics.requests + 1);
    }

    providerMetrics.utilization = this.calculateProviderUtilization(provider);
    providerMetrics.lastActivity = Date.now();
  }

  private initializeMetrics(): RateLimitMetrics {
    return {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      queuedRequests: 0,
      timedOutRequests: 0,
      averageWaitTime: 0,
      circuitBreakerTrips: 0,
      providerMetrics: {},
      currentLoad: {},
      predictions: {}
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}