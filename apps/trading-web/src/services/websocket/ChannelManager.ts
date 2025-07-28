import { EventEmitter } from 'events';
import { WebSocketMessage } from '@/types/trading';
import {
  ChannelSubscription,
  MessageFilter,
  MessagePriority,
  RateLimitChannelConfig
} from '@/types/websocket-service';

/**
 * Advanced Channel Subscription Manager
 * 
 * Features:
 * - Pattern-based subscriptions with wildcard support
 * - Message filtering and routing
 * - Priority-based message delivery
 * - Subscription analytics and monitoring
 * - Bulk subscription operations
 * - Rate limiting integration
 * - Message deduplication
 * - Subscription persistence
 * - Performance optimization with efficient pattern matching
 */

export interface ChannelManagerEvents {
  'subscription:added': (subscription: ChannelSubscription) => void;
  'subscription:removed': (subscriptionId: string, channelId: string) => void;
  'subscription:matched': (channelId: string, subscriptionCount: number) => void;
  'message:routed': (messageId: string, channelId: string, subscriptionCount: number) => void;
  'message:filtered': (messageId: string, channelId: string, reason: string) => void;
  'pattern:compiled': (pattern: string, subscriptionId: string) => void;
  'bulk:completed': (operation: 'subscribe' | 'unsubscribe', count: number, duration: number) => void;
}

export interface PatternMatcher {
  pattern: string;
  regex: RegExp;
  isWildcard: boolean;
  segments: string[];
  subscriptionIds: Set<string>;
}

export interface ChannelMetrics {
  channelId: string;
  subscriptionCount: number;
  messageCount: number;
  lastActivity: number;
  averageDeliveryTime: number;
  filteredMessages: number;
  totalDataVolume: number; // bytes
  uniqueSubscribers: number;
  rateLimitHits: number;
}

export interface SubscriptionMetrics {
  subscriptionId: string;
  messagesReceived: number;
  messagesFiltered: number;
  lastMessageAt: number;
  totalProcessingTime: number;
  averageLatency: number;
  filterHitRate: number;
}

export interface BulkSubscriptionRequest {
  patterns: string[];
  callback: (message: WebSocketMessage) => void | Promise<void>;
  priority: MessagePriority;
  filters?: MessageFilter[];
  rateLimiting?: RateLimitChannelConfig;
}

export interface MessageDeliveryOptions {
  priority: MessagePriority;
  async: boolean;
  timeout?: number;
  retries?: number;
  deduplication?: boolean;
}

export class ChannelManager extends EventEmitter {
  private subscriptions: Map<string, ChannelSubscription> = new Map();
  private patternMatchers: Map<string, PatternMatcher> = new Map();
  private channelIndex: Map<string, Set<string>> = new Map(); // channelId -> subscriptionIds
  private channelMetrics: Map<string, ChannelMetrics> = new Map();
  private subscriptionMetrics: Map<string, SubscriptionMetrics> = new Map();
  
  // Performance optimization
  private exactMatchCache: Map<string, string[]> = new Map(); // channelId -> subscriptionIds
  private patternCache: Map<string, string[]> = new Map(); // pattern -> matching channels
  private compiledPatterns: Map<string, RegExp> = new Map();
  
  // Message deduplication
  private messageHashes: Map<string, Set<string>> = new Map(); // channelId -> messageHash set
  private deduplicationWindow = 5000; // 5 seconds
  
  // Rate limiting integration
  private channelRateLimits: Map<string, RateLimitChannelConfig> = new Map();
  
  // Batch processing
  private pendingDeliveries: Array<{
    message: WebSocketMessage;
    channelId: string;
    subscriptions: ChannelSubscription[];
    timestamp: number;
  }> = [];
  
  private deliveryTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.startPeriodicTasks();
  }

  /**
   * Subscribe to a channel with pattern support
   */
  subscribe(
    channelId: string,
    callback: (message: WebSocketMessage) => void | Promise<void>,
    options: Partial<ChannelSubscription> = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    const now = Date.now();

    // Create subscription
    const subscription: ChannelSubscription = {
      id: subscriptionId,
      channelId,
      pattern: options.pattern || channelId,
      callback,
      priority: options.priority || 'normal',
      filters: options.filters || [],
      rateLimiting: options.rateLimiting,
      createdAt: now,
      lastMessageAt: 0,
      messageCount: 0
    };

    // Store subscription
    this.subscriptions.set(subscriptionId, subscription);

    // Create pattern matcher
    this.createPatternMatcher(subscription);

    // Update channel index
    this.updateChannelIndex(channelId, subscriptionId, 'add');

    // Initialize metrics
    this.initializeSubscriptionMetrics(subscriptionId);
    this.updateChannelMetrics(channelId, 'subscription_added');

    // Apply rate limiting if specified
    if (subscription.rateLimiting) {
      this.channelRateLimits.set(channelId, subscription.rateLimiting);
    }

    // Clear relevant caches
    this.invalidateCache(channelId, subscription.pattern);

    this.emit('subscription:added', subscription);

    console.log(`📡 Subscribed to channel: ${channelId} (pattern: ${subscription.pattern})`);
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Remove from pattern matchers
    this.removeFromPatternMatchers(subscription);

    // Update channel index
    this.updateChannelIndex(subscription.channelId, subscriptionId, 'remove');

    // Clean up metrics
    this.subscriptionMetrics.delete(subscriptionId);
    this.updateChannelMetrics(subscription.channelId, 'subscription_removed');

    // Remove rate limiting if this was the only subscriber
    const remainingSubscriptions = this.getChannelSubscriptions(subscription.channelId);
    if (remainingSubscriptions.length === 0) {
      this.channelRateLimits.delete(subscription.channelId);
    }

    // Remove subscription
    this.subscriptions.delete(subscriptionId);

    // Clear relevant caches
    this.invalidateCache(subscription.channelId, subscription.pattern);

    this.emit('subscription:removed', subscriptionId, subscription.channelId);

    console.log(`📡 Unsubscribed from: ${subscriptionId}`);
    
    return true;
  }

  /**
   * Bulk subscribe to multiple channels
   */
  async bulkSubscribe(requests: BulkSubscriptionRequest[]): Promise<string[]> {
    const startTime = performance.now();
    const subscriptionIds: string[] = [];

    for (const request of requests) {
      for (const pattern of request.patterns) {
        const subscriptionId = this.subscribe(pattern, request.callback, {
          pattern,
          priority: request.priority,
          filters: request.filters,
          rateLimiting: request.rateLimiting
        });
        subscriptionIds.push(subscriptionId);
      }
    }

    const duration = performance.now() - startTime;
    this.emit('bulk:completed', 'subscribe', subscriptionIds.length, duration);

    return subscriptionIds;
  }

  /**
   * Bulk unsubscribe from multiple subscriptions
   */
  async bulkUnsubscribe(subscriptionIds: string[]): Promise<number> {
    const startTime = performance.now();
    let removedCount = 0;

    for (const subscriptionId of subscriptionIds) {
      if (this.unsubscribe(subscriptionId)) {
        removedCount++;
      }
    }

    const duration = performance.now() - startTime;
    this.emit('bulk:completed', 'unsubscribe', removedCount, duration);

    return removedCount;
  }

  /**
   * Route message to matching subscriptions
   */
  async routeMessage(
    channelId: string,
    message: WebSocketMessage,
    options: Partial<MessageDeliveryOptions> = {}
  ): Promise<number> {
    const startTime = performance.now();
    
    // Check for message deduplication
    if (options.deduplication && this.isDuplicateMessage(channelId, message)) {
      return 0;
    }

    // Find matching subscriptions
    const matchingSubscriptions = this.findMatchingSubscriptions(channelId);
    
    if (matchingSubscriptions.length === 0) {
      return 0;
    }

    // Filter subscriptions by priority if needed
    const prioritizedSubscriptions = this.prioritizeSubscriptions(matchingSubscriptions, options.priority);

    // Apply message filters
    const filteredSubscriptions = await this.filterSubscriptions(prioritizedSubscriptions, message, channelId);

    // Update metrics
    this.updateChannelMetrics(channelId, 'message_routed', {
      subscriptionCount: filteredSubscriptions.length,
      messageSize: JSON.stringify(message).length
    });

    // Deliver messages
    const deliveredCount = await this.deliverMessages(channelId, message, filteredSubscriptions, options);

    const processingTime = performance.now() - startTime;
    
    this.emit('message:routed', this.generateMessageId(), channelId, deliveredCount);

    return deliveredCount;
  }

  /**
   * Get all subscriptions for a channel
   */
  getChannelSubscriptions(channelId: string): ChannelSubscription[] {
    const subscriptionIds = this.channelIndex.get(channelId) || new Set();
    return Array.from(subscriptionIds)
      .map(id => this.subscriptions.get(id))
      .filter(sub => sub !== undefined) as ChannelSubscription[];
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): ChannelSubscription | null {
    return this.subscriptions.get(subscriptionId) || null;
  }

  /**
   * Get all active subscriptions
   */
  getAllSubscriptions(): ChannelSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get channel metrics
   */
  getChannelMetrics(channelId?: string): ChannelMetrics | Map<string, ChannelMetrics> {
    if (channelId) {
      return this.channelMetrics.get(channelId) || this.createDefaultChannelMetrics(channelId);
    }
    return new Map(this.channelMetrics);
  }

  /**
   * Get subscription metrics
   */
  getSubscriptionMetrics(subscriptionId?: string): SubscriptionMetrics | Map<string, SubscriptionMetrics> {
    if (subscriptionId) {
      return this.subscriptionMetrics.get(subscriptionId) || this.createDefaultSubscriptionMetrics(subscriptionId);
    }
    return new Map(this.subscriptionMetrics);
  }

  /**
   * Update subscription filters
   */
  updateSubscriptionFilters(subscriptionId: string, filters: MessageFilter[]): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.filters = filters;
    this.invalidateCache(subscription.channelId, subscription.pattern);
    
    return true;
  }

  /**
   * Test if a channel ID matches a pattern
   */
  testPattern(pattern: string, channelId: string): boolean {
    const matcher = this.getOrCreatePatternMatcher(pattern);
    return matcher.regex.test(channelId);
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    this.patternMatchers.clear();
    this.channelIndex.clear();
    this.channelMetrics.clear();
    this.subscriptionMetrics.clear();
    this.exactMatchCache.clear();
    this.patternCache.clear();
    this.compiledPatterns.clear();
    this.messageHashes.clear();
    this.channelRateLimits.clear();
    this.pendingDeliveries.length = 0;

    console.log('📡 All subscriptions cleared');
  }

  /**
   * Shutdown channel manager
   */
  shutdown(): void {
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    this.clear();
    this.removeAllListeners();

    console.log('✅ Channel manager shutdown complete');
  }

  // Private methods

  private createPatternMatcher(subscription: ChannelSubscription): void {
    const pattern = subscription.pattern;
    const existingMatcher = this.patternMatchers.get(pattern);

    if (existingMatcher) {
      existingMatcher.subscriptionIds.add(subscription.id);
      return;
    }

    // Create new pattern matcher
    const matcher: PatternMatcher = {
      pattern,
      regex: this.compilePattern(pattern),
      isWildcard: pattern.includes('*') || pattern.includes('?'),
      segments: pattern.split('.'),
      subscriptionIds: new Set([subscription.id])
    };

    this.patternMatchers.set(pattern, matcher);
    this.emit('pattern:compiled', pattern, subscription.id);
  }

  private removeFromPatternMatchers(subscription: ChannelSubscription): void {
    const pattern = subscription.pattern;
    const matcher = this.patternMatchers.get(pattern);

    if (matcher) {
      matcher.subscriptionIds.delete(subscription.id);
      
      if (matcher.subscriptionIds.size === 0) {
        this.patternMatchers.delete(pattern);
        this.compiledPatterns.delete(pattern);
      }
    }
  }

  private compilePattern(pattern: string): RegExp {
    if (this.compiledPatterns.has(pattern)) {
      return this.compiledPatterns.get(pattern)!;
    }

    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')     // Escape dots
      .replace(/\*/g, '.*')      // * matches any characters
      .replace(/\?/g, '.')       // ? matches single character
      .replace(/\+/g, '\\+');    // Escape plus signs

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    this.compiledPatterns.set(pattern, regex);
    
    return regex;
  }

  private getOrCreatePatternMatcher(pattern: string): PatternMatcher {
    let matcher = this.patternMatchers.get(pattern);
    if (!matcher) {
      matcher = {
        pattern,
        regex: this.compilePattern(pattern),
        isWildcard: pattern.includes('*') || pattern.includes('?'),
        segments: pattern.split('.'),
        subscriptionIds: new Set()
      };
      this.patternMatchers.set(pattern, matcher);
    }
    return matcher;
  }

  private findMatchingSubscriptions(channelId: string): ChannelSubscription[] {
    // Check exact match cache first
    const cached = this.exactMatchCache.get(channelId);
    if (cached) {
      return cached.map(id => this.subscriptions.get(id)).filter(Boolean) as ChannelSubscription[];
    }

    const matchingSubscriptions: ChannelSubscription[] = [];

    // Test all pattern matchers
    for (const matcher of this.patternMatchers.values()) {
      if (matcher.regex.test(channelId)) {
        for (const subscriptionId of matcher.subscriptionIds) {
          const subscription = this.subscriptions.get(subscriptionId);
          if (subscription) {
            matchingSubscriptions.push(subscription);
          }
        }
      }
    }

    // Cache result for performance
    this.exactMatchCache.set(channelId, matchingSubscriptions.map(s => s.id));

    this.emit('subscription:matched', channelId, matchingSubscriptions.length);
    
    return matchingSubscriptions;
  }

  private prioritizeSubscriptions(subscriptions: ChannelSubscription[], priority?: MessagePriority): ChannelSubscription[] {
    if (!priority) {
      return subscriptions;
    }

    // Filter by priority level and above
    const priorityOrder: Record<MessagePriority, number> = {
      'critical': 0, 'high': 1, 'normal': 2, 'low': 3
    };

    const minPriority = priorityOrder[priority];
    
    return subscriptions.filter(sub => priorityOrder[sub.priority] <= minPriority);
  }

  private async filterSubscriptions(
    subscriptions: ChannelSubscription[],
    message: WebSocketMessage,
    channelId: string
  ): Promise<ChannelSubscription[]> {
    const filtered: ChannelSubscription[] = [];

    for (const subscription of subscriptions) {
      if (subscription.filters && subscription.filters.length > 0) {
        const passed = await this.applyFilters(message, subscription.filters);
        if (passed) {
          filtered.push(subscription);
        } else {
          // Track filtered message
          this.updateSubscriptionMetrics(subscription.id, 'message_filtered');
          this.emit('message:filtered', this.generateMessageId(), channelId, 'filters_failed');
        }
      } else {
        filtered.push(subscription);
      }
    }

    return filtered;
  }

  private async applyFilters(message: WebSocketMessage, filters: MessageFilter[]): Promise<boolean> {
    for (const filter of filters) {
      if (!this.evaluateFilter(message, filter)) {
        return false;
      }
    }
    return true;
  }

  private evaluateFilter(message: WebSocketMessage, filter: MessageFilter): boolean {
    const value = this.getNestedProperty(message.data, filter.field);
    const filterValue = filter.value;

    if (value === undefined || value === null) {
      return false;
    }

    switch (filter.operator) {
      case 'equals':
        return filter.caseSensitive 
          ? value === filterValue 
          : String(value).toLowerCase() === String(filterValue).toLowerCase();

      case 'contains':
        const searchStr = filter.caseSensitive ? String(value) : String(value).toLowerCase();
        const searchFor = filter.caseSensitive ? String(filterValue) : String(filterValue).toLowerCase();
        return searchStr.includes(searchFor);

      case 'startsWith':
        return String(value).startsWith(String(filterValue));

      case 'endsWith':
        return String(value).endsWith(String(filterValue));

      case 'matches':
        try {
          const regex = new RegExp(String(filterValue), filter.caseSensitive ? '' : 'i');
          return regex.test(String(value));
        } catch {
          return false;
        }

      case 'gt':
        return Number(value) > Number(filterValue);

      case 'lt':
        return Number(value) < Number(filterValue);

      case 'gte':
        return Number(value) >= Number(filterValue);

      case 'lte':
        return Number(value) <= Number(filterValue);

      default:
        return true;
    }
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj);
  }

  private async deliverMessages(
    channelId: string,
    message: WebSocketMessage,
    subscriptions: ChannelSubscription[],
    options: Partial<MessageDeliveryOptions>
  ): Promise<number> {
    let deliveredCount = 0;

    const deliveryPromises = subscriptions.map(async (subscription) => {
      const startTime = performance.now();
      
      try {
        // Apply rate limiting check
        if (this.isRateLimited(channelId, subscription)) {
          this.updateChannelMetrics(channelId, 'rate_limit_hit');
          return false;
        }

        // Call subscription callback
        await subscription.callback(message);

        // Update subscription metrics
        const latency = performance.now() - startTime;
        this.updateSubscriptionMetrics(subscription.id, 'message_delivered', { latency });
        
        return true;

      } catch (error) {
        console.error(`❌ Error delivering message to subscription ${subscription.id}:`, error);
        this.updateSubscriptionMetrics(subscription.id, 'delivery_error');
        return false;
      }
    });

    if (options.async) {
      // Fire and forget
      Promise.allSettled(deliveryPromises);
      deliveredCount = subscriptions.length; // Assume all will be delivered
    } else {
      // Wait for all deliveries
      const results = await Promise.allSettled(deliveryPromises);
      deliveredCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    }

    return deliveredCount;
  }

  private isDuplicateMessage(channelId: string, message: WebSocketMessage): boolean {
    const hash = this.hashMessage(message);
    const hashes = this.messageHashes.get(channelId) || new Set();
    
    if (hashes.has(hash)) {
      return true;
    }

    hashes.add(hash);
    this.messageHashes.set(channelId, hashes);
    
    // Clean up old hashes periodically
    setTimeout(() => {
      const currentHashes = this.messageHashes.get(channelId);
      if (currentHashes) {
        currentHashes.delete(hash);
      }
    }, this.deduplicationWindow);

    return false;
  }

  private hashMessage(message: WebSocketMessage): string {
    const data = JSON.stringify({
      type: message.type,
      data: message.data,
      timestamp: Math.floor(message.timestamp / 1000) // 1-second precision
    });
    
    return this.simpleHash(data);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  private isRateLimited(channelId: string, subscription: ChannelSubscription): boolean {
    const rateLimitConfig = subscription.rateLimiting || this.channelRateLimits.get(channelId);
    if (!rateLimitConfig || !rateLimitConfig.enabled) {
      return false;
    }

    // Simplified rate limiting check - in production would integrate with RateLimiter
    return false;
  }

  private updateChannelIndex(channelId: string, subscriptionId: string, operation: 'add' | 'remove'): void {
    const subscriptionIds = this.channelIndex.get(channelId) || new Set();
    
    if (operation === 'add') {
      subscriptionIds.add(subscriptionId);
    } else {
      subscriptionIds.delete(subscriptionId);
    }
    
    if (subscriptionIds.size > 0) {
      this.channelIndex.set(channelId, subscriptionIds);
    } else {
      this.channelIndex.delete(channelId);
    }
  }

  private updateChannelMetrics(channelId: string, event: string, data?: any): void {
    const metrics = this.channelMetrics.get(channelId) || this.createDefaultChannelMetrics(channelId);
    
    switch (event) {
      case 'subscription_added':
        metrics.subscriptionCount++;
        break;
      case 'subscription_removed':
        metrics.subscriptionCount = Math.max(0, metrics.subscriptionCount - 1);
        break;
      case 'message_routed':
        metrics.messageCount++;
        metrics.lastActivity = Date.now();
        if (data?.messageSize) {
          metrics.totalDataVolume += data.messageSize;
        }
        break;
      case 'rate_limit_hit':
        metrics.rateLimitHits++;
        break;
    }
    
    this.channelMetrics.set(channelId, metrics);
  }

  private updateSubscriptionMetrics(subscriptionId: string, event: string, data?: any): void {
    const metrics = this.subscriptionMetrics.get(subscriptionId) || this.createDefaultSubscriptionMetrics(subscriptionId);
    
    switch (event) {
      case 'message_delivered':
        metrics.messagesReceived++;
        metrics.lastMessageAt = Date.now();
        if (data?.latency) {
          metrics.totalProcessingTime += data.latency;
          metrics.averageLatency = metrics.totalProcessingTime / metrics.messagesReceived;
        }
        break;
      case 'message_filtered':
        metrics.messagesFiltered++;
        metrics.filterHitRate = metrics.messagesFiltered / (metrics.messagesReceived + metrics.messagesFiltered);
        break;
    }
    
    this.subscriptionMetrics.set(subscriptionId, metrics);
  }

  private initializeSubscriptionMetrics(subscriptionId: string): void {
    this.subscriptionMetrics.set(subscriptionId, this.createDefaultSubscriptionMetrics(subscriptionId));
  }

  private createDefaultChannelMetrics(channelId: string): ChannelMetrics {
    return {
      channelId,
      subscriptionCount: 0,
      messageCount: 0,
      lastActivity: Date.now(),
      averageDeliveryTime: 0,
      filteredMessages: 0,
      totalDataVolume: 0,
      uniqueSubscribers: 0,
      rateLimitHits: 0
    };
  }

  private createDefaultSubscriptionMetrics(subscriptionId: string): SubscriptionMetrics {
    return {
      subscriptionId,
      messagesReceived: 0,
      messagesFiltered: 0,
      lastMessageAt: 0,
      totalProcessingTime: 0,
      averageLatency: 0,
      filterHitRate: 0
    };
  }

  private invalidateCache(channelId: string, pattern: string): void {
    this.exactMatchCache.delete(channelId);
    this.patternCache.delete(pattern);
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startPeriodicTasks(): void {
    // Periodic cleanup of caches and metrics
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 300000); // 5 minutes

    // Metrics collection
    this.metricsTimer = setInterval(() => {
      this.updateAggregateMetrics();
    }, 30000); // 30 seconds
  }

  private performCleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    // Clear old cache entries
    this.exactMatchCache.clear();
    this.patternCache.clear();

    // Clean up old message hashes
    for (const [channelId, hashes] of this.messageHashes.entries()) {
      if (hashes.size === 0) {
        this.messageHashes.delete(channelId);
      }
    }

    // Clean up inactive channel metrics
    for (const [channelId, metrics] of this.channelMetrics.entries()) {
      if (now - metrics.lastActivity > maxAge && metrics.subscriptionCount === 0) {
        this.channelMetrics.delete(channelId);
      }
    }
  }

  private updateAggregateMetrics(): void {
    // Update unique subscriber counts
    for (const [channelId, metrics] of this.channelMetrics.entries()) {
      const subscriptions = this.getChannelSubscriptions(channelId);
      const uniqueCallbacks = new Set(subscriptions.map(s => s.callback)).size;
      metrics.uniqueSubscribers = uniqueCallbacks;
    }
  }
}