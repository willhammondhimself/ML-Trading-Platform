import { EventEmitter } from 'events';
import {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreakerError
} from '@/types/websocket-service';

/**
 * Circuit Breaker Pattern Implementation
 * 
 * Features:
 * - Three-state circuit breaker (closed, open, half-open)
 * - Configurable failure thresholds and timeouts
 * - Health checking and automatic recovery
 * - Error type filtering and categorization
 * - Performance metrics and monitoring
 * - Manual circuit control and reset
 * - Graceful degradation strategies
 * - Integration with WebSocket service
 */

export interface CircuitBreakerEvents {
  'state:changed': (newState: CircuitBreakerState, previousState: CircuitBreakerState, reason: string) => void;
  'failure:recorded': (error: Error, failureCount: number, threshold: number) => void;
  'health:check': (success: boolean, latency: number) => void;
  'recovery:attempted': (success: boolean, attempts: number) => void;
  'threshold:exceeded': (failureCount: number, threshold: number, timeWindow: number) => void;
}

export interface FailureRecord {
  timestamp: number;
  error: Error;
  errorType: string;
  operation: string;
  latency: number;
  recoverable: boolean;
}

export interface HealthCheckResult {
  success: boolean;
  latency: number;
  timestamp: number;
  error?: Error;
  details?: Record<string, any>;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  averageLatency: number;
  lastFailure: number;
  lastSuccess: number;
  lastStateChange: number;
  stateHistory: StateChangeRecord[];
  healthCheckCount: number;
  successfulHealthChecks: number;
  uptime: number;
  downtimeTotal: number;
  resetCount: number;
}

export interface StateChangeRecord {
  timestamp: number;
  fromState: CircuitBreakerState;
  toState: CircuitBreakerState;
  reason: string;
  failureCount: number;
  duration: number; // how long in previous state
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  isOpen: boolean;
  isClosed: boolean;
  isHalfOpen: boolean;
  canExecute: boolean;
  failureCount: number;
  failureThreshold: number;
  nextHealthCheck: number;
  timeUntilRetry: number;
  lastError?: Error;
}

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private lastStateChange = Date.now();
  private halfOpenAttempts = 0;
  private nextHealthCheck = 0;
  private resetCount = 0;
  
  // Failure tracking
  private failures: FailureRecord[] = [];
  private stateHistory: StateChangeRecord[] = [];
  private healthCheckHistory: HealthCheckResult[] = [];
  
  // Timers
  private healthCheckTimer?: NodeJS.Timeout;
  private resetTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  // Performance tracking
  private latencyHistory: number[] = [];
  private downtimeStart: number = 0;
  private totalDowntime = 0;
  
  constructor(config: CircuitBreakerConfig) {
    super();
    this.config = config;
    
    if (this.config.enabled) {
      this.startHealthChecking();
      this.startMetricsCollection();
    }
    
    console.log('⚡ Circuit breaker initialized:', this.config.enabled ? 'enabled' : 'disabled');
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>, operationName: string = 'unknown'): Promise<T> {
    if (!this.config.enabled) {
      return await operation();
    }

    // Check if circuit allows execution
    if (!this.canExecuteOperation()) {
      const error = new CircuitBreakerError(
        `Circuit breaker is ${this.state} - operation rejected`,
        undefined,
        { 
          state: this.state, 
          failureCount: this.failureCount,
          nextRetry: this.getNextRetryTime()
        }
      );
      throw error;
    }

    const startTime = performance.now();
    
    try {
      // Execute the operation
      const result = await Promise.race([
        operation(),
        this.createTimeoutPromise()
      ]);
      
      const latency = performance.now() - startTime;
      await this.recordSuccess(operationName, latency);
      
      return result;
      
    } catch (error) {
      const latency = performance.now() - startTime;
      await this.recordFailure(error as Error, operationName, latency);
      throw error;
    }
  }

  /**
   * Check if an operation can be executed
   */
  canExecuteOperation(): boolean {
    if (!this.config.enabled) return true;
    
    switch (this.state) {
      case 'closed':
        return true;
        
      case 'open':
        // Check if enough time has passed to try health check
        return Date.now() >= this.nextHealthCheck;
        
      case 'half-open':
        // Allow limited requests in half-open state
        return this.halfOpenAttempts < this.config.successThreshold;
        
      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  async recordSuccess(operation: string = 'unknown', latency: number = 0): Promise<void> {
    if (!this.config.enabled) return;

    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.updateLatencyHistory(latency);

    // Handle state transitions based on success
    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      
      if (this.halfOpenAttempts >= this.config.successThreshold) {
        await this.transitionTo('closed', 'Sufficient successful attempts in half-open state');
      }
    } else if (this.state === 'open') {
      // Successful operation while open - transition to half-open
      await this.transitionTo('half-open', 'Successful operation during recovery attempt');
    }

    // Clear old failures if we're seeing consistent success
    if (this.successCount % 10 === 0) {
      this.cleanupOldFailures();
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(error: Error, operation: string = 'unknown', latency: number = 0): Promise<void> {
    if (!this.config.enabled) return;

    // Check if this error type should trigger the circuit breaker
    if (!this.shouldRecordError(error)) {
      return;
    }

    const now = Date.now();
    this.failureCount++;
    this.lastFailureTime = now;

    // Record failure details
    const failureRecord: FailureRecord = {
      timestamp: now,
      error,
      errorType: error.constructor.name,
      operation,
      latency,
      recoverable: this.isRecoverableError(error)
    };

    this.failures.push(failureRecord);
    this.updateLatencyHistory(latency);

    // Emit failure event
    this.emit('failure:recorded', error, this.failureCount, this.config.failureThreshold);

    // Handle state transitions based on failure
    switch (this.state) {
      case 'closed':
        if (this.shouldOpenCircuit()) {
          await this.transitionTo('open', `Failure threshold exceeded: ${this.failureCount}/${this.config.failureThreshold}`);
        }
        break;
        
      case 'half-open':
        // Any failure in half-open immediately goes back to open
        await this.transitionTo('open', 'Failure during half-open recovery attempt');
        break;
        
      case 'open':
        // Update next health check time
        this.scheduleNextHealthCheck();
        break;
    }

    // Clean up old failure records
    this.cleanupOldFailures();
  }

  /**
   * Manually open the circuit
   */
  async open(reason: string = 'Manual intervention'): Promise<void> {
    await this.transitionTo('open', reason);
  }

  /**
   * Manually close the circuit (reset)
   */
  async close(reason: string = 'Manual reset'): Promise<void> {
    this.reset();
    await this.transitionTo('closed', reason);
  }

  /**
   * Force circuit to half-open state for testing
   */
  async halfOpen(reason: string = 'Manual testing'): Promise<void> {
    await this.transitionTo('half-open', reason);
  }

  /**
   * Reset circuit breaker statistics
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.failures = [];
    this.latencyHistory = [];
    this.resetCount++;
    
    if (this.downtimeStart > 0) {
      this.totalDowntime += Date.now() - this.downtimeStart;
      this.downtimeStart = 0;
    }
    
    console.log('🔄 Circuit breaker reset');
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'open';
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === 'closed';
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  /**
   * Get comprehensive status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      isOpen: this.isOpen(),
      isClosed: this.isClosed(),
      isHalfOpen: this.isHalfOpen(),
      canExecute: this.canExecuteOperation(),
      failureCount: this.failureCount,
      failureThreshold: this.config.failureThreshold,
      nextHealthCheck: this.nextHealthCheck,
      timeUntilRetry: Math.max(0, this.nextHealthCheck - Date.now()),
      lastError: this.failures.length > 0 ? this.failures[this.failures.length - 1].error : undefined
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    const totalRequests = this.successCount + this.failureCount;
    const failureRate = totalRequests > 0 ? (this.failureCount / totalRequests) * 100 : 0;
    const averageLatency = this.latencyHistory.length > 0 
      ? this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length 
      : 0;
    
    const uptime = now - (this.lastStateChange - this.getStateDuration());
    const totalDowntimeWithCurrent = this.totalDowntime + (this.downtimeStart > 0 ? now - this.downtimeStart : 0);

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests,
      failureRate,
      averageLatency,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      stateHistory: [...this.stateHistory],
      healthCheckCount: this.healthCheckHistory.length,
      successfulHealthChecks: this.healthCheckHistory.filter(h => h.success).length,
      uptime,
      downtimeTotal: totalDowntimeWithCurrent,
      resetCount: this.resetCount
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (!this.config.enabled) {
      this.stopHealthChecking();
      this.stopMetricsCollection();
    } else if (!this.healthCheckTimer) {
      this.startHealthChecking();
      this.startMetricsCollection();
    }
  }

  /**
   * Shutdown circuit breaker
   */
  shutdown(): void {
    this.stopHealthChecking();
    this.stopMetricsCollection();
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.removeAllListeners();
    console.log('✅ Circuit breaker shutdown complete');
  }

  // Private methods

  private async transitionTo(newState: CircuitBreakerState, reason: string): Promise<void> {
    if (newState === this.state) {
      return;
    }

    const previousState = this.state;
    const now = Date.now();
    const duration = now - this.lastStateChange;

    // Record state change
    const stateChangeRecord: StateChangeRecord = {
      timestamp: now,
      fromState: previousState,
      toState: newState,
      reason,
      failureCount: this.failureCount,
      duration
    };

    this.stateHistory.push(stateChangeRecord);

    // Update state
    this.state = newState;
    this.lastStateChange = now;

    // Handle state-specific logic
    switch (newState) {
      case 'open':
        this.scheduleNextHealthCheck();
        if (this.downtimeStart === 0) {
          this.downtimeStart = now;
        }
        this.emit('threshold:exceeded', this.failureCount, this.config.failureThreshold, this.config.monitoringPeriod);
        break;
        
      case 'half-open':
        this.halfOpenAttempts = 0;
        break;
        
      case 'closed':
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        if (this.downtimeStart > 0) {
          this.totalDowntime += now - this.downtimeStart;
          this.downtimeStart = 0;
        }
        break;
    }

    // Emit state change event
    this.emit('state:changed', newState, previousState, reason);
    
    console.log(`🔄 Circuit breaker: ${previousState} → ${newState} (${reason})`);

    // Keep state history bounded
    if (this.stateHistory.length > 100) {
      this.stateHistory = this.stateHistory.slice(-50);
    }
  }

  private shouldOpenCircuit(): boolean {
    // Check failure count threshold
    if (this.failureCount < this.config.failureThreshold) {
      return false;
    }

    // Check if failures occurred within monitoring period
    const cutoff = Date.now() - this.config.monitoringPeriod;
    const recentFailures = this.failures.filter(f => f.timestamp > cutoff);
    
    return recentFailures.length >= this.config.failureThreshold;
  }

  private shouldRecordError(error: Error): boolean {
    // Check if error type should trigger circuit breaker
    if (this.config.errorTypes.length > 0) {
      const errorType = error.constructor.name;
      const errorCode = (error as any).code;
      
      return this.config.errorTypes.some(type => 
        type === errorType || type === errorCode || error.message.includes(type)
      );
    }
    
    return true; // Record all errors if no specific types configured
  }

  private isRecoverableError(error: Error): boolean {
    // Determine if error is recoverable (could succeed on retry)
    const unrecoverablePatterns = [
      'unauthorized', 'forbidden', 'not found', 
      'invalid', 'malformed', 'syntax error'
    ];
    
    const message = error.message.toLowerCase();
    return !unrecoverablePatterns.some(pattern => message.includes(pattern));
  }

  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeoutThreshold}ms`));
      }, this.config.timeoutThreshold);
    });
  }

  private scheduleNextHealthCheck(): void {
    this.nextHealthCheck = Date.now() + this.config.resetTimeout;
  }

  private getNextRetryTime(): number {
    return this.nextHealthCheck;
  }

  private updateLatencyHistory(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory = this.latencyHistory.slice(-50);
    }
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - (this.config.monitoringPeriod * 2);
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  private getStateDuration(): number {
    return Date.now() - this.lastStateChange;
  }

  // Health checking
  private startHealthChecking(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.state === 'open' && Date.now() >= this.nextHealthCheck) {
        await this.performHealthCheck();
      }
    }, this.config.healthCheckInterval);
  }

  private stopHealthChecking(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.config.enabled) return;

    const startTime = performance.now();
    
    try {
      // Perform a lightweight health check operation
      const result = await this.executeHealthCheck();
      const latency = performance.now() - startTime;
      
      this.healthCheckHistory.push({
        success: true,
        latency,
        timestamp: Date.now(),
        details: result
      });

      // Emit health check event
      this.emit('health:check', true, latency);

      // Transition to half-open if health check succeeded
      if (this.state === 'open') {
        await this.transitionTo('half-open', 'Health check successful');
      }

    } catch (error) {
      const latency = performance.now() - startTime;
      
      this.healthCheckHistory.push({
        success: false,
        latency,
        timestamp: Date.now(),
        error: error as Error
      });

      // Emit health check event
      this.emit('health:check', false, latency);

      // Schedule next health check
      this.scheduleNextHealthCheck();
    }

    // Keep health check history bounded
    if (this.healthCheckHistory.length > 50) {
      this.healthCheckHistory = this.healthCheckHistory.slice(-25);
    }
  }

  private async executeHealthCheck(): Promise<Record<string, any>> {
    // Simple health check - in production this would ping the actual service
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, this.config.healthCheckTimeout);

      // Simulate health check
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ status: 'healthy', timestamp: Date.now() });
      }, Math.random() * 100); // Simulate variable latency
    });
  }

  // Metrics collection
  private startMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    this.metricsTimer = setInterval(() => {
      // Periodic cleanup and metrics update
      this.cleanupOldFailures();
      
      // Log status periodically in debug mode
      if (process.env.NODE_ENV === 'development') {
        const status = this.getStatus();
        if (status.failureCount > 0 || !status.isClosed) {
          console.log(`🔄 Circuit Breaker Status:`, {
            state: status.state,
            failures: status.failureCount,
            canExecute: status.canExecute
          });
        }
      }
    }, 30000); // Every 30 seconds
  }

  private stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }
}