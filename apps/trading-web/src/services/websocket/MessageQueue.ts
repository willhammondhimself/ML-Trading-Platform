import { EventEmitter } from 'events';
import {
  QueuedMessage,
  ProcessedMessage,
  MessagePriority,
  MessageQueueConfig,
  WebSocketServiceError
} from '@/types/websocket-service';

/**
 * Priority-based Message Queue System
 * 
 * Features:
 * - Priority-based queuing (critical, high, normal, low)
 * - Message persistence during disconnections  
 * - Memory management with size limits
 * - Message deduplication
 * - Batch processing optimization
 * - Queue metrics and monitoring
 * - Optional disk persistence
 */

export interface QueueMetrics {
  totalMessages: number;
  queueSize: number;
  priorityDistribution: Record<MessagePriority, number>;
  memoryUsage: number;
  diskUsage: number;
  averageWaitTime: number;
  throughputPerSecond: number;
  droppedMessages: number;
  duplicatesDropped: number;
}

export interface QueueSnapshot {
  timestamp: number;
  size: number;
  messages: QueuedMessage[];
  metrics: QueueMetrics;
}

interface PriorityQueue {
  critical: QueuedMessage[];
  high: QueuedMessage[];
  normal: QueuedMessage[];
  low: QueuedMessage[];
}

interface QueueState {
  isRunning: boolean;
  isPaused: boolean;
  lastFlushTime: number;
  totalProcessed: number;
  startTime: number;
}

export class MessageQueue extends EventEmitter {
  private config: MessageQueueConfig;
  private queues: PriorityQueue;
  private state: QueueState;
  private messageHashes: Set<string> = new Set(); // For deduplication
  private metrics: QueueMetrics;
  private flushTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  // Disk persistence (if enabled)
  private persistenceEnabled: boolean;
  private persistenceFile?: string;

  constructor(config: MessageQueueConfig) {
    super();
    
    this.config = config;
    this.persistenceEnabled = config.persistToDisk && !!config.diskPath;
    this.persistenceFile = config.diskPath ? `${config.diskPath}/message-queue.json` : undefined;
    
    this.queues = {
      critical: [],
      high: [],
      normal: [],
      low: []
    };
    
    this.state = {
      isRunning: false,
      isPaused: false,
      lastFlushTime: 0,
      totalProcessed: 0,
      startTime: Date.now()
    };
    
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the message queue
   */
  async initialize(): Promise<void> {
    try {
      // Load persisted messages if enabled
      if (this.persistenceEnabled) {
        await this.loadFromDisk();
      }
      
      this.state.isRunning = true;
      this.state.startTime = Date.now();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      console.log('📊 Message queue initialized');
      
    } catch (error) {
      throw new WebSocketServiceError(
        'Failed to initialize message queue',
        'QUEUE_INIT_ERROR',
        undefined,
        false,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Enqueue a message with priority handling
   */
  async enqueue(message: QueuedMessage): Promise<void> {
    if (!this.state.isRunning) {
      throw new WebSocketServiceError('Message queue not initialized', 'QUEUE_NOT_READY');
    }
    
    if (this.state.isPaused) {
      console.warn('⚠️ Queue is paused, message will be queued but not processed');
    }

    try {
      // Check memory limits
      if (this.getTotalSize() >= this.config.maxQueueSize) {
        await this.handleQueueOverflow();
      }
      
      // Check for duplicates if enabled
      if (this.config.deduplication && this.isDuplicate(message)) {
        this.metrics.duplicatesDropped++;
        this.emit('message:duplicate', { messageId: message.id, type: message.message.type });
        return;
      }
      
      // Add to appropriate priority queue
      const priorityLevel = this.config.priorityLevels[message.priority];
      const queue = this.getQueueByPriority(message.priority);
      
      if (this.config.orderingGuarantee) {
        // Insert in order by timestamp
        const insertIndex = this.findInsertionIndex(queue, message.timestamp);
        queue.splice(insertIndex, 0, message);
      } else {
        // Simple append for better performance
        queue.push(message);
      }
      
      // Update deduplication tracking
      if (this.config.deduplication) {
        this.messageHashes.add(this.getMessageHash(message));
      }
      
      // Update metrics
      this.metrics.totalMessages++;
      this.metrics.queueSize++;
      this.metrics.priorityDistribution[message.priority]++;
      this.updateMemoryUsage();
      
      // Persist to disk if enabled
      if (this.persistenceEnabled && this.getTotalSize() % 100 === 0) {
        await this.saveToDisk();
      }
      
      this.emit('message:enqueued', {
        messageId: message.id,
        priority: message.priority,
        queueSize: this.getTotalSize()
      });
      
    } catch (error) {
      this.metrics.droppedMessages++;
      throw new WebSocketServiceError(
        `Failed to enqueue message: ${error instanceof Error ? error.message : String(error)}`,
        'ENQUEUE_ERROR',
        undefined,
        true,
        { messageId: message.id, priority: message.priority }
      );
    }
  }

  /**
   * Dequeue a single message (highest priority first)
   */
  dequeue(): QueuedMessage | null {
    if (!this.state.isRunning || this.state.isPaused) {
      return null;
    }

    // Check queues in priority order
    for (const priority of ['critical', 'high', 'normal', 'low'] as const) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const message = queue.shift()!;
        
        // Update metrics
        this.metrics.queueSize--;
        this.metrics.priorityDistribution[priority]--;
        this.updateMemoryUsage();
        
        // Remove from deduplication tracking
        if (this.config.deduplication) {
          this.messageHashes.delete(this.getMessageHash(message));
        }
        
        return message;
      }
    }
    
    return null;
  }

  /**
   * Dequeue multiple messages in a batch
   */
  async dequeueBatch(batchSize: number): Promise<QueuedMessage[]> {
    if (!this.state.isRunning || this.state.isPaused) {
      return [];
    }

    const batch: QueuedMessage[] = [];
    const maxBatchSize = Math.min(batchSize, this.config.batchSize);
    
    while (batch.length < maxBatchSize) {
      const message = this.dequeue();
      if (!message) break;
      
      batch.push(message);
    }
    
    if (batch.length > 0) {
      this.emit('batch:dequeued', {
        batchSize: batch.length,
        queueSize: this.getTotalSize()
      });
    }
    
    return batch;
  }

  /**
   * Peek at next message without removing it
   */
  peek(): QueuedMessage | null {
    for (const priority of ['critical', 'high', 'normal', 'low'] as const) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.getTotalSize();
  }

  /**
   * Get size by priority
   */
  sizeByPriority(priority: MessagePriority): number {
    return this.queues[priority].length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.getTotalSize() === 0;
  }

  /**
   * Pause message processing
   */
  pause(): void {
    this.state.isPaused = true;
    this.emit('queue:paused');
    console.log('⏸️ Message queue paused');
  }

  /**
   * Resume message processing
   */
  resume(): void {
    this.state.isPaused = false;
    this.emit('queue:resumed');
    console.log('▶️ Message queue resumed');
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.queues = {
      critical: [],
      high: [],
      normal: [],
      low: []
    };
    
    this.messageHashes.clear();
    this.metrics.queueSize = 0;
    this.metrics.priorityDistribution = { critical: 0, high: 0, normal: 0, low: 0 };
    this.updateMemoryUsage();
    
    this.emit('queue:cleared');
    console.log('🗑️ Message queue cleared');
  }

  /**
   * Flush all messages (for shutdown)
   */
  async flush(): Promise<ProcessedMessage[]> {
    console.log('🚿 Flushing message queue...');
    
    const allMessages: QueuedMessage[] = [];
    let message: QueuedMessage | null;
    
    while ((message = this.dequeue()) !== null) {
      allMessages.push(message);
    }
    
    // Persist remaining messages if enabled
    if (this.persistenceEnabled) {
      await this.saveToDisk();
    }
    
    const processedMessages: ProcessedMessage[] = allMessages.map(msg => ({
      ...msg,
      processedAt: Date.now(),
      processingTime: 0,
      success: false, // Flushed messages are considered not processed
      error: 'Queue flushed during shutdown'
    }));
    
    this.state.lastFlushTime = Date.now();
    
    this.emit('queue:flushed', { messageCount: allMessages.length });
    
    return processedMessages;
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    this.updateThroughputMetrics();
    return { ...this.metrics };
  }

  /**
   * Take a snapshot of the current queue state
   */
  getSnapshot(): QueueSnapshot {
    return {
      timestamp: Date.now(),
      size: this.getTotalSize(),
      messages: this.getAllMessages(),
      metrics: this.getMetrics()
    };
  }

  /**
   * Update queue configuration
   */
  updateConfig(newConfig: Partial<MessageQueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Handle persistence changes
    if (newConfig.persistToDisk !== undefined || newConfig.diskPath) {
      this.persistenceEnabled = this.config.persistToDisk && !!this.config.diskPath;
      this.persistenceFile = this.config.diskPath ? `${this.config.diskPath}/message-queue.json` : undefined;
    }
  }

  /**
   * Shutdown the queue
   */
  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down message queue...');
    
    this.state.isRunning = false;
    
    // Clear timers
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Flush remaining messages
    await this.flush();
    
    // Final persistence
    if (this.persistenceEnabled) {
      await this.saveToDisk();
    }
    
    this.removeAllListeners();
    
    console.log('✅ Message queue shutdown complete');
  }

  // Private methods

  private initializeMetrics(): QueueMetrics {
    return {
      totalMessages: 0,
      queueSize: 0,
      priorityDistribution: { critical: 0, high: 0, normal: 0, low: 0 },
      memoryUsage: 0,
      diskUsage: 0,
      averageWaitTime: 0,
      throughputPerSecond: 0,
      droppedMessages: 0,
      duplicatesDropped: 0
    };
  }

  private getQueueByPriority(priority: MessagePriority): QueuedMessage[] {
    return this.queues[priority];
  }

  private getTotalSize(): number {
    return this.queues.critical.length + 
           this.queues.high.length + 
           this.queues.normal.length + 
           this.queues.low.length;
  }

  private getAllMessages(): QueuedMessage[] {
    return [
      ...this.queues.critical,
      ...this.queues.high, 
      ...this.queues.normal,
      ...this.queues.low
    ];
  }

  private findInsertionIndex(queue: QueuedMessage[], timestamp: number): number {
    // Binary search for insertion point to maintain timestamp order
    let left = 0;
    let right = queue.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (queue[mid].timestamp <= timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left;
  }

  private isDuplicate(message: QueuedMessage): boolean {
    const hash = this.getMessageHash(message);
    return this.messageHashes.has(hash);
  }

  private getMessageHash(message: QueuedMessage): string {
    // Create hash from message type, data, and timestamp (within 1 second window)
    const timeWindow = Math.floor(message.timestamp / 1000); // 1 second windows
    const data = JSON.stringify(message.message.data);
    return `${message.message.type}:${timeWindow}:${this.simpleHash(data)}`;
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

  private async handleQueueOverflow(): Promise<void> {
    console.warn('⚠️ Queue overflow detected, removing oldest low priority messages');
    
    // Remove oldest messages from lowest priority queue first
    const priorities: MessagePriority[] = ['low', 'normal', 'high'];
    let removed = 0;
    const targetRemoval = Math.floor(this.config.maxQueueSize * 0.1); // Remove 10%
    
    for (const priority of priorities) {
      const queue = this.queues[priority];
      while (queue.length > 0 && removed < targetRemoval) {
        const message = queue.shift()!;
        this.metrics.droppedMessages++;
        this.metrics.priorityDistribution[priority]--;
        
        // Remove from deduplication tracking
        if (this.config.deduplication) {
          this.messageHashes.delete(this.getMessageHash(message));
        }
        
        removed++;
        
        this.emit('message:dropped', {
          messageId: message.id,
          reason: 'queue_overflow',
          priority
        });
      }
      
      if (removed >= targetRemoval) break;
    }
    
    this.metrics.queueSize = this.getTotalSize();
    this.updateMemoryUsage();
    
    console.log(`🗑️ Removed ${removed} messages due to overflow`);
  }

  private updateMemoryUsage(): void {
    // Estimate memory usage (rough calculation)
    const allMessages = this.getAllMessages();
    let totalSize = 0;
    
    allMessages.forEach(message => {
      // Estimate size of message object
      totalSize += JSON.stringify(message).length * 2; // UTF-16 encoding
    });
    
    this.metrics.memoryUsage = totalSize;
    
    // Check memory limit
    if (totalSize > this.config.maxMemoryUsage) {
      console.warn(`⚠️ Memory usage ${Math.round(totalSize / 1024 / 1024)}MB exceeds limit ${Math.round(this.config.maxMemoryUsage / 1024 / 1024)}MB`);
    }
  }

  private updateThroughputMetrics(): void {
    const now = Date.now();
    const timeElapsed = (now - this.state.startTime) / 1000; // seconds
    
    this.metrics.throughputPerSecond = timeElapsed > 0 
      ? this.state.totalProcessed / timeElapsed 
      : 0;
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateThroughputMetrics();
      this.updateMemoryUsage();
      
      this.emit('metrics:updated', this.getMetrics());
    }, 5000); // Update every 5 seconds
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.persistenceFile) return;
    
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.persistenceFile, 'utf8');
      const snapshot: QueueSnapshot = JSON.parse(data);
      
      // Restore messages to appropriate queues
      snapshot.messages.forEach(message => {
        const queue = this.getQueueByPriority(message.priority);
        queue.push(message);
        
        // Restore deduplication tracking
        if (this.config.deduplication) {
          this.messageHashes.add(this.getMessageHash(message));
        }
      });
      
      // Update metrics
      this.metrics.queueSize = this.getTotalSize();
      this.updateMemoryUsage();
      
      console.log(`📁 Restored ${snapshot.messages.length} messages from disk`);
      
    } catch (error) {
      console.warn('⚠️ Failed to load messages from disk:', error);
      // Continue without loaded messages
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.persistenceFile) return;
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Ensure directory exists
      const dir = path.dirname(this.persistenceFile);
      await fs.mkdir(dir, { recursive: true });
      
      const snapshot = this.getSnapshot();
      await fs.writeFile(this.persistenceFile, JSON.stringify(snapshot, null, 2));
      
      this.metrics.diskUsage = JSON.stringify(snapshot).length;
      
    } catch (error) {
      console.error('❌ Failed to save messages to disk:', error);
    }
  }
}