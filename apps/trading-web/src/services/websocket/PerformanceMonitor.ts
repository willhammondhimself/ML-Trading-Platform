import { EventEmitter } from 'events';
import {
  PerformanceConfig,
  ConnectionMetrics,
  AggregateMetrics
} from '@/types/websocket-service';

/**
 * Advanced Performance Monitoring System
 * 
 * Features:
 * - Real-time latency tracking with percentile calculations (p50, p95, p99)
 * - Throughput monitoring (messages/sec, bytes/sec)
 * - Error rate analysis and alerting
 * - Connection health scoring and SLA monitoring
 * - Resource usage tracking (memory, CPU, queue sizes)
 * - Historical data retention with time-series analysis
 * - Configurable alerting with threshold management
 * - Performance histogram analysis
 * - Batch processing optimization metrics
 * - Integration with external monitoring systems
 */

export interface PerformanceEvents {
  'alert:latency': (data: AlertData) => void;
  'alert:throughput': (data: AlertData) => void;
  'alert:error_rate': (data: AlertData) => void;
  'alert:connection_failure': (data: AlertData) => void;
  'health:degraded': (data: HealthData) => void;
  'health:recovered': (data: HealthData) => void;
  'sla:breach': (data: SLABreachData) => void;
  'metrics:updated': (metrics: AggregateMetrics) => void;
}

export interface AlertData {
  type: 'latency' | 'throughput' | 'error_rate' | 'connection_failure';
  severity: 'warning' | 'critical';
  metric: string;
  currentValue: number;
  threshold: number;
  connectionId?: string;
  timestamp: number;
  details?: Record<string, any>;
}

export interface HealthData {
  healthy: boolean;
  score: number; // 0-100
  previousScore: number;
  issues: string[];
  connectionId?: string;
  timestamp: number;
}

export interface SLABreachData {
  slaType: 'availability' | 'latency' | 'throughput' | 'error_rate';
  targetValue: number;
  actualValue: number;
  duration: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface MetricPoint {
  timestamp: number;
  value: number;
  connectionId?: string;
  metadata?: Record<string, any>;
}

export interface LatencyHistogram {
  buckets: number[];
  counts: number[];
  total: number;
  p50: number;
  p95: number;
  p99: number;
  p99_9: number;
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

export interface ThroughputMetrics {
  messagesPerSecond: number;
  bytesPerSecond: number;
  peakMessagesPerSecond: number;
  peakBytesPerSecond: number;
  averageMessageSize: number;
  totalMessages: number;
  totalBytes: number;
}

export interface ErrorMetrics {
  errorRate: number; // percentage
  errorsPerSecond: number;
  totalErrors: number;
  errorTypes: Map<string, number>;
  criticalErrors: number;
  recoverableErrors: number;
  lastError: Error | null;
  lastErrorTime: number;
}

export interface ResourceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
    heapUsed?: number;
    heapTotal?: number;
  };
  cpuUsage: {
    percentage: number;
    loadAverage?: number[];
  };
  queueMetrics: {
    size: number;
    maxSize: number;
    utilization: number;
    backpressureEvents: number;
  };
  connectionPoolMetrics: {
    activeConnections: number;
    totalConnections: number;
    healthyConnections: number;
    utilization: number;
  };
}

export interface PerformanceSnapshot {
  timestamp: number;
  latency: LatencyHistogram;
  throughput: ThroughputMetrics;
  errors: ErrorMetrics;
  resources: ResourceMetrics;
  connections: Map<string, ConnectionMetrics>;
  health: {
    overall: number;
    availability: number;
    performance: number;
    reliability: number;
  };
}

export class PerformanceMonitor extends EventEmitter {
  private config: PerformanceConfig;
  private isRunning = false;
  private startTime = 0;
  
  // Metrics storage
  private latencyPoints: MetricPoint[] = [];
  private throughputPoints: MetricPoint[] = [];
  private errorPoints: MetricPoint[] = [];
  private connectionMetrics: Map<string, ConnectionMetrics> = new Map();
  
  // Real-time tracking
  private latencyHistogram: LatencyHistogram;
  private throughputTracker: ThroughputMetrics;
  private errorTracker: ErrorMetrics;
  private resourceTracker: ResourceMetrics;
  
  // Alerting state
  private lastAlerts: Map<string, number> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  
  // Timers
  private metricsTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private flushTimer?: NodeJS.Timeout;
  
  // Batch processing
  private pendingMetrics: MetricPoint[] = [];
  private batchCounter = 0;

  constructor(config: PerformanceConfig) {
    super();
    this.config = config;
    this.latencyHistogram = this.createLatencyHistogram();
    this.throughputTracker = this.createThroughputTracker();
    this.errorTracker = this.createErrorTracker();
    this.resourceTracker = this.createResourceTracker();
  }

  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    
    // Start periodic metrics collection
    this.startMetricsCollection();
    
    // Start data cleanup
    this.startDataCleanup();
    
    // Start batch flushing
    this.startBatchFlushing();
    
    console.log('📊 Performance monitor started');
  }

  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    // Stop all timers
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    
    // Flush any remaining metrics
    await this.flushPendingMetrics();
    
    console.log('📊 Performance monitor stopped');
  }

  /**
   * Record latency for a specific connection
   */
  recordLatency(connectionId: string, latency: number, metadata?: Record<string, any>): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const point: MetricPoint = { timestamp: now, value: latency, connectionId, metadata };
    
    // Add to pending batch
    this.pendingMetrics.push(point);
    
    // Update real-time histogram
    this.updateLatencyHistogram(latency);
    
    // Update connection metrics
    this.updateConnectionLatency(connectionId, latency, now);
    
    // Check latency alerts
    this.checkLatencyAlerts(connectionId, latency);
  }

  /**
   * Record successful operation
   */
  recordSuccess(connectionId: string, bytes?: number, metadata?: Record<string, any>): void {
    if (!this.isRunning) return;

    const now = Date.now();
    
    // Update throughput metrics
    this.throughputTracker.totalMessages++;
    if (bytes) {
      this.throughputTracker.totalBytes += bytes;
    }
    
    // Update connection metrics
    const connMetrics = this.getOrCreateConnectionMetrics(connectionId);
    connMetrics.health.reliability = Math.min(100, connMetrics.health.reliability + 0.1);
    
    // Add throughput point
    this.pendingMetrics.push({
      timestamp: now,
      value: 1, // success count
      connectionId,
      metadata: { type: 'success', bytes, ...metadata }
    });
  }

  /**
   * Record error
   */
  recordError(connectionId: string, error: string | Error, metadata?: Record<string, any>): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const errorType = errorObj.constructor.name;
    
    // Update error metrics
    this.errorTracker.totalErrors++;
    this.errorTracker.lastError = errorObj;
    this.errorTracker.lastErrorTime = now;
    this.errorTracker.errorTypes.set(errorType, (this.errorTracker.errorTypes.get(errorType) || 0) + 1);
    
    // Categorize error
    if (this.isCriticalError(errorObj)) {
      this.errorTracker.criticalErrors++;
    } else {
      this.errorTracker.recoverableErrors++;
    }
    
    // Update connection metrics
    const connMetrics = this.getOrCreateConnectionMetrics(connectionId);
    connMetrics.errors.total++;
    connMetrics.errors.recent.push(errorObj);
    connMetrics.health.reliability = Math.max(0, connMetrics.health.reliability - 1);
    
    // Keep recent errors list bounded
    if (connMetrics.errors.recent.length > 10) {
      connMetrics.errors.recent = connMetrics.errors.recent.slice(-5);
    }
    
    // Add error point
    this.pendingMetrics.push({
      timestamp: now,
      value: 1, // error count
      connectionId,
      metadata: { type: 'error', errorType, message: errorObj.message, ...metadata }
    });
    
    // Check error rate alerts
    this.checkErrorRateAlerts(connectionId);
  }

  /**
   * Record batch processing metrics
   */
  recordBatchProcessing(batchSize: number, processingTime: number, connectionId?: string): void {
    if (!this.isRunning) return;

    const throughputRate = batchSize / (processingTime / 1000); // messages per second
    const avgLatency = processingTime / batchSize;
    
    // Update throughput tracker
    this.throughputTracker.messagesPerSecond = 
      (this.throughputTracker.messagesPerSecond * 0.9) + (throughputRate * 0.1);
    
    this.pendingMetrics.push({
      timestamp: Date.now(),
      value: throughputRate,
      connectionId,
      metadata: { type: 'batch', batchSize, processingTime, avgLatency }
    });
  }

  /**
   * Update resource usage metrics
   */
  updateResourceMetrics(resources: Partial<ResourceMetrics>): void {
    if (!this.isRunning) return;

    // Merge with existing resource metrics
    this.resourceTracker = {
      ...this.resourceTracker,
      ...resources,
      memoryUsage: { ...this.resourceTracker.memoryUsage, ...resources.memoryUsage },
      cpuUsage: { ...this.resourceTracker.cpuUsage, ...resources.cpuUsage },
      queueMetrics: { ...this.resourceTracker.queueMetrics, ...resources.queueMetrics },
      connectionPoolMetrics: { ...this.resourceTracker.connectionPoolMetrics, ...resources.connectionPoolMetrics }
    };
  }

  /**
   * Get current performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      latency: { ...this.latencyHistogram },
      throughput: { ...this.throughputTracker },
      errors: {
        ...this.errorTracker,
        errorTypes: new Map(this.errorTracker.errorTypes)
      },
      resources: { ...this.resourceTracker },
      connections: new Map(this.connectionMetrics),
      health: this.calculateOverallHealth()
    };
  }

  /**
   * Get metrics for specific connection or aggregate
   */
  getMetrics(connectionId?: string): ConnectionMetrics | AggregateMetrics {
    if (connectionId) {
      return this.getOrCreateConnectionMetrics(connectionId);
    }
    
    // Return aggregate metrics
    const totalConnections = this.connectionMetrics.size;
    const healthyConnections = Array.from(this.connectionMetrics.values())
      .filter(m => m.health.score >= 70).length;
    const connectingConnections = Array.from(this.connectionMetrics.values())
      .filter(m => m.throughput.currentLoad > 0 && m.throughput.currentLoad < 1).length;
    
    return {
      connections: {
        total: totalConnections,
        healthy: healthyConnections,
        connecting: connectingConnections,
        disconnected: Math.max(0, totalConnections - healthyConnections - connectingConnections),
        error: Array.from(this.connectionMetrics.values())
          .filter(m => m.errors.total > 0 && m.health.score < 50).length
      },
      performance: {
        totalThroughput: this.throughputTracker.messagesPerSecond,
        averageLatency: this.latencyHistogram.mean,
        errorRate: this.errorTracker.errorRate,
        successRate: 100 - this.errorTracker.errorRate
      },
      resources: {
        memoryUsage: this.resourceTracker.memoryUsage.used,
        cpuUsage: this.resourceTracker.cpuUsage.percentage,
        queueSize: this.resourceTracker.queueMetrics.size,
        activeSubscriptions: totalConnections // Simplified
      },
      timestamp: Date.now()
    };
  }

  /**
   * Clear all metrics and reset state
   */
  clearMetrics(): void {
    this.latencyPoints = [];
    this.throughputPoints = [];
    this.errorPoints = [];
    this.connectionMetrics.clear();
    this.latencyHistogram = this.createLatencyHistogram();
    this.throughputTracker = this.createThroughputTracker();
    this.errorTracker = this.createErrorTracker();
    this.pendingMetrics = [];
    this.lastAlerts.clear();
    this.alertCooldowns.clear();
    
    console.log('📊 Performance metrics cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart if needed
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // Private methods

  private createLatencyHistogram(): LatencyHistogram {
    return {
      buckets: [...this.config.histogramBuckets],
      counts: new Array(this.config.histogramBuckets.length).fill(0),
      total: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      p99_9: 0,
      mean: 0,
      min: Infinity,
      max: -Infinity,
      stddev: 0
    };
  }

  private createThroughputTracker(): ThroughputMetrics {
    return {
      messagesPerSecond: 0,
      bytesPerSecond: 0,
      peakMessagesPerSecond: 0,
      peakBytesPerSecond: 0,
      averageMessageSize: 0,
      totalMessages: 0,
      totalBytes: 0
    };
  }

  private createErrorTracker(): ErrorMetrics {
    return {
      errorRate: 0,
      errorsPerSecond: 0,
      totalErrors: 0,
      errorTypes: new Map(),
      criticalErrors: 0,
      recoverableErrors: 0,
      lastError: null,
      lastErrorTime: 0
    };
  }

  private createResourceTracker(): ResourceMetrics {
    return {
      memoryUsage: { used: 0, total: 0, percentage: 0 },
      cpuUsage: { percentage: 0 },
      queueMetrics: { size: 0, maxSize: 0, utilization: 0, backpressureEvents: 0 },
      connectionPoolMetrics: { activeConnections: 0, totalConnections: 0, healthyConnections: 0, utilization: 0 }
    };
  }

  private getOrCreateConnectionMetrics(connectionId: string): ConnectionMetrics {
    if (!this.connectionMetrics.has(connectionId)) {
      this.connectionMetrics.set(connectionId, {
        connectionId,
        latency: { current: 0, p50: 0, p95: 0, p99: 0, average: 0 },
        throughput: { messagesPerSecond: 0, bytesPerSecond: 0, currentLoad: 0 },
        errors: { rate: 0, total: 0, recent: [] },
        health: { score: 100, uptime: 100, reliability: 100 },
        timestamp: Date.now()
      });
    }
    return this.connectionMetrics.get(connectionId)!;
  }

  private updateLatencyHistogram(latency: number): void {
    const histogram = this.latencyHistogram;
    histogram.total++;
    
    // Update min/max
    histogram.min = Math.min(histogram.min, latency);
    histogram.max = Math.max(histogram.max, latency);
    
    // Update buckets
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (latency <= histogram.buckets[i]) {
        histogram.counts[i]++;
        break;
      }
    }
    
    // Update percentiles (simplified)
    this.updatePercentiles(histogram);
  }

  private updatePercentiles(histogram: LatencyHistogram): void {
    if (histogram.total === 0) return;

    const values: number[] = [];
    for (let i = 0; i < histogram.buckets.length; i++) {
      const count = histogram.counts[i];
      const value = i > 0 ? (histogram.buckets[i] + histogram.buckets[i - 1]) / 2 : histogram.buckets[i];
      for (let j = 0; j < count; j++) {
        values.push(value);
      }
    }

    if (values.length === 0) return;

    values.sort((a, b) => a - b);

    histogram.p50 = this.percentile(values, 0.5);
    histogram.p95 = this.percentile(values, 0.95);
    histogram.p99 = this.percentile(values, 0.99);
    histogram.p99_9 = this.percentile(values, 0.999);
    histogram.mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    // Calculate standard deviation
    const variance = values.reduce((sum, v) => sum + Math.pow(v - histogram.mean, 2), 0) / values.length;
    histogram.stddev = Math.sqrt(variance);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil(values.length * p) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  private updateConnectionLatency(connectionId: string, latency: number, timestamp: number): void {
    const metrics = this.getOrCreateConnectionMetrics(connectionId);
    metrics.latency.current = latency;
    metrics.latency.average = (metrics.latency.average * 0.9) + (latency * 0.1);
    metrics.timestamp = timestamp;
  }

  private calculateOverallHealth(): PerformanceSnapshot['health'] {
    const availability = this.calculateAvailability();
    const performance = this.calculatePerformanceHealth();
    const reliability = this.calculateReliability();
    const overall = (availability + performance + reliability) / 3;

    return { overall, availability, performance, reliability };
  }

  private calculateAvailability(): number {
    const totalConnections = this.connectionMetrics.size;
    if (totalConnections === 0) return 100;

    const healthyConnections = Array.from(this.connectionMetrics.values())
      .filter(m => m.health.score >= 70).length;

    return (healthyConnections / totalConnections) * 100;
  }

  private calculatePerformanceHealth(): number {
    let score = 100;

    // Penalize high latency
    if (this.latencyHistogram.p95 > this.config.alertThresholds.latency.p95) {
      score -= 20;
    }
    if (this.latencyHistogram.p99 > this.config.alertThresholds.latency.p99) {
      score -= 30;
    }

    // Penalize low throughput
    if (this.throughputTracker.messagesPerSecond < this.config.alertThresholds.throughput.messagesPerSecond * 0.5) {
      score -= 25;
    }

    return Math.max(0, score);
  }

  private calculateReliability(): number {
    if (this.errorTracker.errorRate > this.config.alertThresholds.errorRate) {
      return Math.max(0, 100 - this.errorTracker.errorRate * 5);
    }
    return Math.max(0, 100 - this.errorTracker.errorRate);
  }

  private checkLatencyAlerts(connectionId: string, latency: number): void {
    const thresholds = this.config.alertThresholds.latency;
    
    if (latency > thresholds.p99) {
      this.emitAlert('latency', 'critical', 'p99_latency', latency, thresholds.p99, connectionId);
    } else if (latency > thresholds.p95) {
      this.emitAlert('latency', 'warning', 'p95_latency', latency, thresholds.p95, connectionId);
    }
  }

  private checkErrorRateAlerts(connectionId: string): void {
    // Calculate recent error rate
    const recentWindow = 60000; // 1 minute
    const now = Date.now();
    const recentErrors = this.errorPoints.filter(p => now - p.timestamp < recentWindow);
    const recentTotal = this.throughputPoints.filter(p => now - p.timestamp < recentWindow);
    
    if (recentTotal.length > 0) {
      const errorRate = (recentErrors.length / (recentErrors.length + recentTotal.length)) * 100;
      this.errorTracker.errorRate = errorRate;
      
      if (errorRate > this.config.alertThresholds.errorRate) {
        this.emitAlert('error_rate', 'critical', 'error_rate', errorRate, this.config.alertThresholds.errorRate, connectionId);
      }
    }
  }

  private emitAlert(type: AlertData['type'], severity: AlertData['severity'], metric: string, currentValue: number, threshold: number, connectionId?: string): void {
    const alertKey = `${type}_${metric}_${connectionId || 'global'}`;
    const now = Date.now();
    
    // Check cooldown
    const lastAlert = this.lastAlerts.get(alertKey) || 0;
    const cooldown = this.alertCooldowns.get(alertKey) || 60000; // 1 minute default
    
    if (now - lastAlert < cooldown) {
      return; // Still in cooldown
    }

    const alertData: AlertData = {
      type,
      severity,
      metric,
      currentValue,
      threshold,
      connectionId,
      timestamp: now
    };

    this.emit(`alert:${type}`, alertData);
    this.lastAlerts.set(alertKey, now);
    
    // Increase cooldown for repeated alerts
    this.alertCooldowns.set(alertKey, Math.min(cooldown * 2, 300000)); // Max 5 minutes
  }

  private isCriticalError(error: Error): boolean {
    const criticalPatterns = [
      'out of memory', 'stack overflow', 'segmentation fault',
      'connection refused', 'network unreachable', 'timeout'
    ];
    
    const message = error.message.toLowerCase();
    return criticalPatterns.some(pattern => message.includes(pattern));
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateRealTimeMetrics();
      this.emit('metrics:updated', this.getMetrics() as AggregateMetrics);
    }, 5000); // Update every 5 seconds
  }

  private startDataCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - this.config.metricsRetentionTime;
      
      this.latencyPoints = this.latencyPoints.filter(p => p.timestamp > cutoff);
      this.throughputPoints = this.throughputPoints.filter(p => p.timestamp > cutoff);
      this.errorPoints = this.errorPoints.filter(p => p.timestamp > cutoff);
      
      // Reset alert cooldowns
      this.alertCooldowns.clear();
    }, 3600000); // Clean up every hour
  }

  private startBatchFlushing(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushPendingMetrics();
    }, this.config.flushInterval);
  }

  private async flushPendingMetrics(): Promise<void> {
    if (this.pendingMetrics.length === 0) return;

    const batch = [...this.pendingMetrics];
    this.pendingMetrics = [];

    // Process batch
    for (const point of batch) {
      if (point.metadata?.type === 'success') {
        this.throughputPoints.push(point);
      } else if (point.metadata?.type === 'error') {
        this.errorPoints.push(point);
      } else {
        this.latencyPoints.push(point);
      }
    }

    this.batchCounter += batch.length;
  }

  private updateRealTimeMetrics(): void {
    // Update throughput calculations
    const timeWindow = 60000; // 1 minute window
    const now = Date.now();
    const cutoff = now - timeWindow;

    const recentThroughput = this.throughputPoints.filter(p => p.timestamp > cutoff);
    this.throughputTracker.messagesPerSecond = recentThroughput.length / (timeWindow / 1000);

    const recentErrors = this.errorPoints.filter(p => p.timestamp > cutoff);
    this.errorTracker.errorsPerSecond = recentErrors.length / (timeWindow / 1000);

    // Update peaks
    this.throughputTracker.peakMessagesPerSecond = Math.max(
      this.throughputTracker.peakMessagesPerSecond,
      this.throughputTracker.messagesPerSecond
    );
  }
}