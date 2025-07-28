/**
 * Performance Monitor Service (Stub Implementation)
 * Tracks and reports performance metrics
 */

import { EventEmitter } from 'events';
import { performanceLogger } from '@/utils/logger';
import type { MonitoringConfig } from '@/config';
import type { RedisService } from './redis-service';

export interface PerformanceMonitorOptions extends MonitoringConfig {
  redisService: RedisService;
}

export class PerformanceMonitor extends EventEmitter {
  private isStarted = false;
  private metrics = {
    connections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    errors: 0,
    latency: { avg: 0, p95: 0, p99: 0 }
  };

  constructor(private options: PerformanceMonitorOptions) {
    super();
    performanceLogger.info('Performance monitor initialized (stub)');
  }

  async start(): Promise<void> {
    performanceLogger.info('Starting performance monitor...');
    this.isStarted = true;
    performanceLogger.info('✅ Performance monitor started (stub)');
  }

  async stop(): Promise<void> {
    performanceLogger.info('Stopping performance monitor...');
    this.isStarted = false;
    performanceLogger.info('✅ Performance monitor stopped');
  }

  recordMetric(name: string, value: number): void {
    performanceLogger.debug(`Metric recorded: ${name} = ${value} (stub)`);
  }

  getMetrics(): any {
    return this.metrics;
  }

  isHealthy(): boolean {
    return this.isStarted;
  }
}