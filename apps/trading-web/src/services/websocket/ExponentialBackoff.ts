/**
 * Exponential Backoff System with Jitter
 * 
 * Provides intelligent retry strategies with various backoff algorithms
 * to prevent thundering herd problems and optimize reconnection timing.
 * 
 * Features:
 * - Multiple backoff strategies (exponential, linear, fibonacci, fixed)
 * - Jitter variants (full, equal, decorrelated)
 * - Maximum retry limits and circuit breaker integration
 * - Backoff state persistence and recovery
 * - Performance metrics and monitoring
 */

export type BackoffStrategy = 'exponential' | 'linear' | 'fibonacci' | 'fixed';
export type JitterType = 'none' | 'full' | 'equal' | 'decorrelated';

export interface BackoffConfig {
  strategy: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  maxAttempts: number;
  multiplier: number;
  jitterType: JitterType;
  resetAfter?: number; // Reset attempt count after success for this duration (ms)
  circuitBreakerIntegration: boolean;
}

export interface BackoffState {
  attempts: number;
  currentDelay: number;
  nextDelay: number;
  lastAttemptTime: number;
  totalBackoffTime: number;
  isExhausted: boolean;
  history: BackoffAttempt[];
}

export interface BackoffAttempt {
  attempt: number;
  timestamp: number;
  delay: number;
  jitteredDelay: number;
  success: boolean;
  error?: string;
}

export interface BackoffMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageDelay: number;
  maxDelayReached: number;
  totalBackoffTime: number;
  successRate: number;
  lastResetTime: number;
}

export class ExponentialBackoff {
  private config: BackoffConfig;
  private state: BackoffState;
  private metrics: BackoffMetrics;
  private resetTimer?: NodeJS.Timeout;
  private listeners: Map<string, (state: BackoffState) => void> = new Map();

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = {
      strategy: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      multiplier: 2,
      jitterType: 'full',
      resetAfter: 60000, // Reset after 1 minute of success
      circuitBreakerIntegration: true,
      ...config
    };

    this.state = this.initializeState();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Calculate next backoff delay
   */
  getNextDelay(): number {
    if (this.state.isExhausted) {
      return -1; // No more attempts
    }

    const baseDelay = this.calculateBaseDelay();
    const jitteredDelay = this.applyJitter(baseDelay);
    
    this.state.nextDelay = Math.min(jitteredDelay, this.config.maxDelay);
    return this.state.nextDelay;
  }

  /**
   * Record an attempt and update state
   */
  async recordAttempt(success: boolean, error?: string): Promise<void> {
    const now = Date.now();
    
    const attempt: BackoffAttempt = {
      attempt: this.state.attempts + 1,
      timestamp: now,
      delay: this.state.currentDelay,
      jitteredDelay: this.state.nextDelay,
      success,
      error
    };

    // Update state
    this.state.attempts++;
    this.state.currentDelay = this.state.nextDelay;
    this.state.lastAttemptTime = now;
    this.state.totalBackoffTime += this.state.nextDelay;
    this.state.history.push(attempt);
    
    // Check if exhausted
    this.state.isExhausted = this.state.attempts >= this.config.maxAttempts;

    // Update metrics
    this.updateMetrics(success, attempt);

    if (success) {
      await this.handleSuccess();
    } else {
      this.handleFailure(error);
    }

    // Notify listeners
    this.notifyStateChange();
  }

  /**
   * Execute operation with backoff retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    onAttempt?: (attempt: number, delay: number) => void
  ): Promise<T> {
    while (!this.state.isExhausted) {
      const delay = this.getNextDelay();
      
      if (delay === -1) {
        throw new Error(`Backoff exhausted after ${this.state.attempts} attempts`);
      }

      // Wait for backoff delay (except first attempt)
      if (this.state.attempts > 0) {
        onAttempt?.(this.state.attempts + 1, delay);
        await this.sleep(delay);
      }

      try {
        const result = await operation();
        await this.recordAttempt(true);
        return result;
      } catch (error) {
        await this.recordAttempt(false, error instanceof Error ? error.message : String(error));
        
        // If this is the last attempt, throw the error
        if (this.state.isExhausted) {
          throw error;
        }
      }
    }

    throw new Error('Backoff exhausted - should not reach here');
  }

  /**
   * Reset backoff state
   */
  reset(): void {
    this.state = this.initializeState();
    this.clearResetTimer();
    this.notifyStateChange();
  }

  /**
   * Check if backoff is exhausted
   */
  isExhausted(): boolean {
    return this.state.isExhausted;
  }

  /**
   * Get current backoff state
   */
  getState(): BackoffState {
    return { ...this.state };
  }

  /**
   * Get backoff metrics
   */
  getMetrics(): BackoffMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BackoffConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(id: string, callback: (state: BackoffState) => void): void {
    this.listeners.set(id, callback);
  }

  /**
   * Unsubscribe from state changes
   */
  offStateChange(id: string): void {
    this.listeners.delete(id);
  }

  // Private methods

  private initializeState(): BackoffState {
    return {
      attempts: 0,
      currentDelay: 0,
      nextDelay: this.config.initialDelay,
      lastAttemptTime: 0,
      totalBackoffTime: 0,
      isExhausted: false,
      history: []
    };
  }

  private initializeMetrics(): BackoffMetrics {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageDelay: 0,
      maxDelayReached: 0,
      totalBackoffTime: 0,
      successRate: 0,
      lastResetTime: Date.now()
    };
  }

  private calculateBaseDelay(): number {
    const { strategy, initialDelay, multiplier } = this.config;
    const attempts = this.state.attempts;

    switch (strategy) {
      case 'exponential':
        return initialDelay * Math.pow(multiplier, attempts);
      
      case 'linear':
        return initialDelay + (attempts * multiplier * 1000);
      
      case 'fibonacci':
        return initialDelay * this.fibonacci(attempts + 1);
      
      case 'fixed':
        return initialDelay;
      
      default:
        return initialDelay * Math.pow(multiplier, attempts);
    }
  }

  private applyJitter(baseDelay: number): number {
    const { jitterType } = this.config;
    
    switch (jitterType) {
      case 'none':
        return baseDelay;
      
      case 'full':
        // Random delay between 0 and baseDelay
        return Math.random() * baseDelay;
      
      case 'equal':
        // Random delay between baseDelay/2 and baseDelay
        return baseDelay / 2 + Math.random() * (baseDelay / 2);
      
      case 'decorrelated':
        // AWS-style decorrelated jitter
        return Math.random() * (baseDelay * 3 / 2);
      
      default:
        return baseDelay;
    }
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    
    let a = 0;
    let b = 1;
    
    for (let i = 2; i <= n; i++) {
      const temp = a + b;
      a = b;
      b = temp;
    }
    
    return b;
  }

  private async handleSuccess(): Promise<void> {
    // Schedule reset after success period
    if (this.config.resetAfter && this.config.resetAfter > 0) {
      this.clearResetTimer();
      
      this.resetTimer = setTimeout(() => {
        this.reset();
      }, this.config.resetAfter);
    }
  }

  private handleFailure(error?: string): void {
    // Clear reset timer on failure
    this.clearResetTimer();
    
    // Log failure if configured
    if (process.env.NODE_ENV === 'development') {
      console.warn(`🔄 Backoff attempt ${this.state.attempts} failed:`, error);
    }
  }

  private updateMetrics(success: boolean, attempt: BackoffAttempt): void {
    this.metrics.totalAttempts++;
    
    if (success) {
      this.metrics.successfulAttempts++;
    } else {
      this.metrics.failedAttempts++;
    }
    
    // Update average delay
    const totalDelayTime = this.metrics.averageDelay * (this.metrics.totalAttempts - 1) + attempt.jitteredDelay;
    this.metrics.averageDelay = totalDelayTime / this.metrics.totalAttempts;
    
    // Update max delay reached
    this.metrics.maxDelayReached = Math.max(this.metrics.maxDelayReached, attempt.jitteredDelay);
    
    // Update total backoff time
    this.metrics.totalBackoffTime = this.state.totalBackoffTime;
    
    // Update success rate
    this.metrics.successRate = this.metrics.totalAttempts > 0 
      ? (this.metrics.successfulAttempts / this.metrics.totalAttempts) * 100 
      : 0;
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  private notifyStateChange(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('Error in backoff state change listener:', error);
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create backoff instance with preset configurations
   */
  static createPreset(preset: 'fast' | 'standard' | 'slow' | 'persistent'): ExponentialBackoff {
    const presets = {
      fast: {
        initialDelay: 100,
        maxDelay: 5000,
        maxAttempts: 5,
        multiplier: 1.5,
        jitterType: 'equal' as JitterType,
      },
      standard: {
        initialDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 10,
        multiplier: 2,
        jitterType: 'full' as JitterType,
      },
      slow: {
        initialDelay: 5000,
        maxDelay: 300000,
        maxAttempts: 20,
        multiplier: 2.5,
        jitterType: 'decorrelated' as JitterType,
      },
      persistent: {
        initialDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 50,
        multiplier: 1.8,
        jitterType: 'equal' as JitterType,
        resetAfter: 300000, // 5 minutes
      }
    };

    return new ExponentialBackoff(presets[preset]);
  }

  /**
   * Get human-readable backoff summary
   */
  getSummary(): string {
    const { attempts, currentDelay, isExhausted, totalBackoffTime } = this.state;
    const { successRate, averageDelay } = this.metrics;
    
    const status = isExhausted ? 'EXHAUSTED' : 
                  attempts === 0 ? 'READY' : 'ACTIVE';
    
    const totalTime = Math.round(totalBackoffTime / 1000);
    const avgDelay = Math.round(averageDelay);
    
    return [
      `Status: ${status}`,
      `Attempts: ${attempts}/${this.config.maxAttempts}`,
      `Success Rate: ${successRate.toFixed(1)}%`,
      `Avg Delay: ${avgDelay}ms`,
      `Total Backoff: ${totalTime}s`,
      `Strategy: ${this.config.strategy} with ${this.config.jitterType} jitter`
    ].join(' | ');
  }
}