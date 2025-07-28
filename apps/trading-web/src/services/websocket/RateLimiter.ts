import { EventEmitter } from 'events';
import {
  RateLimitConfig,
  RateLimitChannelConfig,
  RateLimitState,
  WebSocketServiceError,
  RateLimitError
} from '@/types/websocket-service';

/**
 * Advanced Rate Limiting Engine
 * 
 * Features:
 * - Token bucket algorithm for burst handling
 * - Sliding window algorithm for precise rate limiting
 * - Per-channel rate limiting with individual configurations
 * - Backpressure handling and adaptive throttling
 * - Request queuing during rate limit periods
 * - Priority-based request handling
 * - Real-time metrics and monitoring
 */

export interface RateLimiterEvents {
  'limit:exceeded': (data: { channel?: string; limit: number; current: number; nextAllowedTime: number }) => void;
  'limit:warning': (data: { channel?: string; utilization: number; limit: number }) => void;
  'backpressure:activated': (data: { channel?: string; queueSize: number; delay: number }) => void;
  'backpressure:released': (data: { channel?: string; queueSize: number }) => void;
}

export interface TokenBucket {
  tokens: number;
  maxTokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
}

export interface SlidingWindow {
  requests: number[];
  windowStart: number;
  windowSize: number; // milliseconds
  maxRequests: number;
}

export interface ChannelLimiter {
  id: string;
  config: RateLimitChannelConfig;
  tokenBucket: TokenBucket;
  slidingWindow: SlidingWindow;
  state: RateLimitState;
  queue: QueuedRequest[];
  metrics: ChannelMetrics;
}

export interface QueuedRequest {
  id: string;
  timestamp: number;
  priority: number; // 0 = highest
  callback: (allowed: boolean) => void;
  timeoutId?: NodeJS.Timeout;
}

export interface ChannelMetrics {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  queuedRequests: number;
  averageWaitTime: number;
  currentUtilization: number; // 0-1
  peakUtilization: number;
  lastActivity: number;
}

export interface GlobalMetrics {
  totalRequests: number;
  totalAllowed: number;
  totalDenied: number;
  totalQueued: number;
  activeChannels: number;
  averageUtilization: number;
  peakUtilization: number;
  backpressureEvents: number;
  lastReset: number;
}

export class RateLimiter extends EventEmitter {
  private config: RateLimitConfig;
  private globalLimiter: ChannelLimiter;
  private channelLimiters: Map<string, ChannelLimiter> = new Map();
  private globalMetrics: GlobalMetrics;
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config: RateLimitConfig) {
    super();
    
    this.config = config;
    this.globalLimiter = this.createChannelLimiter('global', {
      tokensPerSecond: config.tokensPerSecond,
      burstSize: config.burstSize,
      enabled: config.enabled
    });
    
    this.globalMetrics = this.initializeGlobalMetrics();
  }

  /**
   * Initialize rate limiter
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize per-channel limiters
      Object.entries(this.config.perChannelLimits).forEach(([channelId, channelConfig]) => {
        this.channelLimiters.set(channelId, this.createChannelLimiter(channelId, channelConfig));
      });

      // Start cleanup and metrics collection
      this.startCleanupTimer();
      this.startMetricsCollection();

      this.isInitialized = true;
      console.log('⚡ Rate limiter initialized with', this.channelLimiters.size, 'channel limiters');

    } catch (error) {
      throw new WebSocketServiceError(
        'Failed to initialize rate limiter',
        'RATE_LIMITER_INIT_ERROR',
        undefined,
        false,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Check if a request is allowed (primary method)
   */
  allowRequest(channelId?: string, priority: number = 5): boolean {
    if (!this.config.enabled || !this.isInitialized) {
      return true;
    }

    const now = Date.now();
    let allowed = true;

    // Check global rate limit first
    if (!this.checkTokenBucket(this.globalLimiter, now) || 
        !this.checkSlidingWindow(this.globalLimiter, now)) {
      allowed = false;
    }

    // Check channel-specific rate limit if specified
    if (allowed && channelId) {
      const channelLimiter = this.getOrCreateChannelLimiter(channelId);
      if (!this.checkTokenBucket(channelLimiter, now) || 
          !this.checkSlidingWindow(channelLimiter, now)) {
        allowed = false;
      }
    }

    // Update metrics
    this.updateMetrics(channelId, allowed, now);

    // Emit events for monitoring
    if (!allowed) {
      const limiter = channelId ? this.channelLimiters.get(channelId) || this.globalLimiter : this.globalLimiter;
      this.emit('limit:exceeded', {
        channel: channelId,
        limit: limiter.tokenBucket.maxTokens,
        current: limiter.tokenBucket.tokens,
        nextAllowedTime: this.calculateNextAllowedTime(limiter)
      });
    }

    return allowed;
  }

  /**
   * Queue a request for later processing (backpressure handling)
   */
  async queueRequest(
    channelId?: string,
    priority: number = 5,
    timeout: number = 30000
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const limiter = channelId ? this.getOrCreateChannelLimiter(channelId) : this.globalLimiter;
      
      const queuedRequest: QueuedRequest = {
        id: this.generateRequestId(),
        timestamp: Date.now(),
        priority,
        callback: resolve,
        timeoutId: setTimeout(() => {
          this.removeQueuedRequest(limiter, queuedRequest.id);
          resolve(false); // Timeout - request denied
        }, timeout)
      };

      // Insert request in priority order
      this.insertQueuedRequest(limiter, queuedRequest);

      // Update metrics
      limiter.metrics.queuedRequests++;
      this.globalMetrics.totalQueued++;

      // Emit backpressure event
      if (limiter.queue.length === 1) { // First queued request
        this.emit('backpressure:activated', {
          channel: channelId,
          queueSize: limiter.queue.length,
          delay: this.calculateNextAllowedTime(limiter) - Date.now()
        });
      }
    });
  }

  /**
   * Process queued requests (called periodically)
   */
  processQueue(): void {
    if (!this.isInitialized) return;

    const now = Date.now();

    // Process global queue
    this.processChannelQueue(this.globalLimiter, now);

    // Process channel queues
    this.channelLimiters.forEach(limiter => {
      this.processChannelQueue(limiter, now);
    });
  }

  /**
   * Set rate limit for specific channel
   */
  setChannelLimit(channelId: string, config: RateLimitChannelConfig): void {
    if (this.channelLimiters.has(channelId)) {
      // Update existing limiter
      const limiter = this.channelLimiters.get(channelId)!;
      limiter.config = config;
      this.reconfigureChannelLimiter(limiter, config);
    } else {
      // Create new limiter
      this.channelLimiters.set(channelId, this.createChannelLimiter(channelId, config));
    }
  }

  /**
   * Remove rate limit for specific channel
   */
  removeChannelLimit(channelId: string): void {
    const limiter = this.channelLimiters.get(channelId);
    if (limiter) {
      // Clear any queued requests
      limiter.queue.forEach(request => {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.callback(false);
      });
      
      this.channelLimiters.delete(channelId);
    }
  }

  /**
   * Get rate limiting status
   */
  getStatus(channelId?: string): {
    enabled: boolean;
    tokensAvailable: number;
    maxTokens: number;
    requestsInWindow: number;
    maxRequestsInWindow: number;
    queueSize: number;
    nextRefill: number;
    utilization: number;
  } {
    const limiter = channelId ? this.channelLimiters.get(channelId) || this.globalLimiter : this.globalLimiter;
    
    return {
      enabled: limiter.config.enabled,
      tokensAvailable: Math.floor(limiter.tokenBucket.tokens),
      maxTokens: limiter.tokenBucket.maxTokens,
      requestsInWindow: limiter.slidingWindow.requests.length,
      maxRequestsInWindow: limiter.slidingWindow.maxRequests,
      queueSize: limiter.queue.length,
      nextRefill: limiter.tokenBucket.lastRefill + (1000 / limiter.tokenBucket.refillRate),
      utilization: limiter.metrics.currentUtilization
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(channelId?: string): ChannelMetrics | GlobalMetrics {
    if (channelId) {
      const limiter = this.channelLimiters.get(channelId);
      return limiter ? { ...limiter.metrics } : this.createDefaultChannelMetrics();
    }
    
    return { ...this.globalMetrics };
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  /**
   * Update rate limiter configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update global limiter
    if (config.tokensPerSecond !== undefined || config.burstSize !== undefined) {
      this.reconfigureChannelLimiter(this.globalLimiter, {
        tokensPerSecond: this.config.tokensPerSecond,
        burstSize: this.config.burstSize,
        enabled: this.config.enabled
      });
    }
    
    // Update channel limiters
    if (config.perChannelLimits) {
      Object.entries(config.perChannelLimits).forEach(([channelId, channelConfig]) => {
        this.setChannelLimit(channelId, channelConfig);
      });
    }
  }

  /**
   * Reset rate limiter state
   */
  reset(channelId?: string): void {
    if (channelId) {
      const limiter = this.channelLimiters.get(channelId);
      if (limiter) {
        this.resetChannelLimiter(limiter);
      }
    } else {
      // Reset global limiter
      this.resetChannelLimiter(this.globalLimiter);
      
      // Reset all channel limiters
      this.channelLimiters.forEach(limiter => {
        this.resetChannelLimiter(limiter);
      });
      
      // Reset global metrics
      this.globalMetrics = this.initializeGlobalMetrics();
    }
  }

  /**
   * Shutdown rate limiter
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Clear all queued requests
    this.channelLimiters.forEach(limiter => {
      limiter.queue.forEach(request => {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.callback(false);
      });
    });

    this.channelLimiters.clear();
    this.removeAllListeners();
    this.isInitialized = false;
    
    console.log('✅ Rate limiter shutdown complete');
  }

  // Private methods

  private createChannelLimiter(id: string, config: RateLimitChannelConfig): ChannelLimiter {
    const now = Date.now();
    
    return {
      id,
      config,
      tokenBucket: {
        tokens: config.burstSize,
        maxTokens: config.burstSize,
        refillRate: config.tokensPerSecond,
        lastRefill: now
      },
      slidingWindow: {
        requests: [],
        windowStart: now,
        windowSize: this.config.windowSize,
        maxRequests: Math.max(config.tokensPerSecond, config.burstSize)
      },
      state: {
        tokens: config.burstSize,
        lastRefill: now,
        windowStart: now,
        windowRequests: 0,
        blocked: false,
        nextAllowedTime: 0
      },
      queue: [],
      metrics: this.createDefaultChannelMetrics()
    };
  }

  private getOrCreateChannelLimiter(channelId: string): ChannelLimiter {
    if (!this.channelLimiters.has(channelId)) {
      // Use global config as default for new channels
      const config: RateLimitChannelConfig = {
        tokensPerSecond: this.config.tokensPerSecond,
        burstSize: this.config.burstSize,
        enabled: this.config.enabled
      };
      this.channelLimiters.set(channelId, this.createChannelLimiter(channelId, config));
    }
    
    return this.channelLimiters.get(channelId)!;
  }

  private checkTokenBucket(limiter: ChannelLimiter, now: number): boolean {
    if (!limiter.config.enabled) return true;

    // Refill tokens based on time passed
    const timePassed = now - limiter.tokenBucket.lastRefill;
    const tokensToAdd = (timePassed / 1000) * limiter.tokenBucket.refillRate;
    
    limiter.tokenBucket.tokens = Math.min(
      limiter.tokenBucket.maxTokens,
      limiter.tokenBucket.tokens + tokensToAdd
    );
    limiter.tokenBucket.lastRefill = now;

    // Check if we have tokens available
    if (limiter.tokenBucket.tokens >= 1) {
      limiter.tokenBucket.tokens -= 1;
      return true;
    }

    return false;
  }

  private checkSlidingWindow(limiter: ChannelLimiter, now: number): boolean {
    if (!limiter.config.enabled) return true;

    const window = limiter.slidingWindow;
    const windowStart = now - window.windowSize;

    // Remove old requests outside the window
    window.requests = window.requests.filter(timestamp => timestamp > windowStart);

    // Check if we're within the limit
    if (window.requests.length < window.maxRequests) {
      window.requests.push(now);
      return true;
    }

    return false;
  }

  private processChannelQueue(limiter: ChannelLimiter, now: number): void {
    while (limiter.queue.length > 0) {
      // Check if we can process next request
      if (!this.checkTokenBucket(limiter, now) || !this.checkSlidingWindow(limiter, now)) {
        break;
      }

      // Process next request in priority order
      const request = limiter.queue.shift()!;
      
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      
      // Calculate wait time for metrics
      const waitTime = now - request.timestamp;
      limiter.metrics.averageWaitTime = 
        (limiter.metrics.averageWaitTime * 0.9) + (waitTime * 0.1);

      request.callback(true);
    }

    // Emit backpressure released if queue is empty
    if (limiter.queue.length === 0 && limiter.metrics.queuedRequests > 0) {
      this.emit('backpressure:released', {
        channel: limiter.id === 'global' ? undefined : limiter.id,
        queueSize: 0
      });
    }
  }

  private insertQueuedRequest(limiter: ChannelLimiter, request: QueuedRequest): void {
    // Insert in priority order (lower number = higher priority)
    let insertIndex = limiter.queue.length;
    
    for (let i = 0; i < limiter.queue.length; i++) {
      if (request.priority < limiter.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    limiter.queue.splice(insertIndex, 0, request);
  }

  private removeQueuedRequest(limiter: ChannelLimiter, requestId: string): void {
    const index = limiter.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const request = limiter.queue[index];
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      limiter.queue.splice(index, 1);
    }
  }

  private calculateNextAllowedTime(limiter: ChannelLimiter): number {
    // Calculate when next token will be available
    const tokensNeeded = Math.max(0, 1 - limiter.tokenBucket.tokens);
    const timeToWait = (tokensNeeded / limiter.tokenBucket.refillRate) * 1000;
    return Date.now() + timeToWait;
  }

  private updateMetrics(channelId: string | undefined, allowed: boolean, now: number): void {
    // Update channel metrics
    if (channelId) {
      const limiter = this.channelLimiters.get(channelId);
      if (limiter) {
        this.updateChannelMetrics(limiter, allowed, now);
      }
    }

    // Update global metrics
    this.updateChannelMetrics(this.globalLimiter, allowed, now);
    this.updateGlobalMetrics(allowed);
  }

  private updateChannelMetrics(limiter: ChannelLimiter, allowed: boolean, now: number): void {
    limiter.metrics.totalRequests++;
    limiter.metrics.lastActivity = now;

    if (allowed) {
      limiter.metrics.allowedRequests++;
    } else {
      limiter.metrics.deniedRequests++;
    }

    // Update utilization
    const utilization = limiter.slidingWindow.requests.length / limiter.slidingWindow.maxRequests;
    limiter.metrics.currentUtilization = utilization;
    limiter.metrics.peakUtilization = Math.max(limiter.metrics.peakUtilization, utilization);

    // Emit warning if utilization is high
    if (utilization > 0.8 && utilization < 0.9) {
      this.emit('limit:warning', {
        channel: limiter.id === 'global' ? undefined : limiter.id,
        utilization,
        limit: limiter.slidingWindow.maxRequests
      });
    }
  }

  private updateGlobalMetrics(allowed: boolean): void {
    this.globalMetrics.totalRequests++;
    this.globalMetrics.activeChannels = this.channelLimiters.size;

    if (allowed) {
      this.globalMetrics.totalAllowed++;
    } else {
      this.globalMetrics.totalDenied++;
    }

    // Update average utilization across all channels
    const totalUtilization = Array.from(this.channelLimiters.values())
      .reduce((sum, limiter) => sum + limiter.metrics.currentUtilization, 0);
    
    this.globalMetrics.averageUtilization = this.channelLimiters.size > 0 
      ? totalUtilization / this.channelLimiters.size 
      : 0;
  }

  private reconfigureChannelLimiter(limiter: ChannelLimiter, config: RateLimitChannelConfig): void {
    limiter.config = config;
    limiter.tokenBucket.maxTokens = config.burstSize;
    limiter.tokenBucket.refillRate = config.tokensPerSecond;
    limiter.slidingWindow.maxRequests = Math.max(config.tokensPerSecond, config.burstSize);
    
    // Reset tokens to new max if current is higher
    limiter.tokenBucket.tokens = Math.min(limiter.tokenBucket.tokens, config.burstSize);
  }

  private resetChannelLimiter(limiter: ChannelLimiter): void {
    const now = Date.now();
    
    limiter.tokenBucket.tokens = limiter.tokenBucket.maxTokens;
    limiter.tokenBucket.lastRefill = now;
    limiter.slidingWindow.requests = [];
    limiter.slidingWindow.windowStart = now;
    limiter.state.blocked = false;
    limiter.state.nextAllowedTime = 0;
    limiter.metrics = this.createDefaultChannelMetrics();
    
    // Clear queue
    limiter.queue.forEach(request => {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.callback(false);
    });
    limiter.queue = [];
  }

  private createDefaultChannelMetrics(): ChannelMetrics {
    return {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0,
      currentUtilization: 0,
      peakUtilization: 0,
      lastActivity: Date.now()
    };
  }

  private initializeGlobalMetrics(): GlobalMetrics {
    return {
      totalRequests: 0,
      totalAllowed: 0,
      totalDenied: 0,
      totalQueued: 0,
      activeChannels: 0,
      averageUtilization: 0,
      peakUtilization: 0,
      backpressureEvents: 0,
      lastReset: Date.now()
    };
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.processQueue();
      this.cleanupInactiveChannels();
    }, 1000); // Every second
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updatePeakMetrics();
    }, 5000); // Every 5 seconds
  }

  private cleanupInactiveChannels(): void {
    const now = Date.now();
    const inactivityThreshold = 5 * 60 * 1000; // 5 minutes

    this.channelLimiters.forEach((limiter, channelId) => {
      if (now - limiter.metrics.lastActivity > inactivityThreshold && limiter.queue.length === 0) {
        this.channelLimiters.delete(channelId);
      }
    });
  }

  private updatePeakMetrics(): void {
    let maxUtilization = 0;
    
    this.channelLimiters.forEach(limiter => {
      maxUtilization = Math.max(maxUtilization, limiter.metrics.currentUtilization);
    });
    
    this.globalMetrics.peakUtilization = Math.max(this.globalMetrics.peakUtilization, maxUtilization);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}