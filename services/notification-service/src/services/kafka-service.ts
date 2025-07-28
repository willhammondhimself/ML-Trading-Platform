/**
 * Kafka Service for Notification System
 * 
 * Event streaming integration for consuming notification events
 * and publishing notification status updates across the platform.
 */

import { Kafka, Consumer, Producer, EachMessagePayload, Admin } from 'kafkajs';
import { config } from '../config';
import { kafkaLogger, logError, createTimer } from '../utils/logger';
import { NotificationEvent } from '../types';
import EventEmitter from 'eventemitter3';

interface NotificationKafkaEvent extends NotificationEvent {
  eventType: 'notification_request' | 'notification_status_update' | 'bulk_notification_request';
}

export class NotificationKafkaService extends EventEmitter {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  private admin: Admin | null = null;
  private isConnected = false;

  constructor() {
    super();

    this.kafka = new Kafka({
      clientId: config.KAFKA.CLIENT_ID,
      brokers: config.KAFKA.BROKERS,
      retry: {
        initialRetryTime: config.KAFKA.RETRY_DELAY,
        retries: config.KAFKA.RETRY_ATTEMPTS,
        multiplier: 2,
        maxRetryTime: 30000
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
      logLevel: config.NODE_ENV === 'production' ? 2 : 4
    });
  }

  async connect(): Promise<void> {
    const timer = createTimer('kafka_connect');

    try {
      kafkaLogger.connection('connecting', {
        brokers: config.KAFKA.BROKERS,
        clientId: config.KAFKA.CLIENT_ID
      });

      // Initialize admin client
      this.admin = this.kafka.admin();
      await this.admin.connect();

      // Initialize consumer
      this.consumer = this.kafka.consumer({
        groupId: config.KAFKA.GROUP_ID,
        sessionTimeout: config.KAFKA.SESSION_TIMEOUT,
        heartbeatInterval: config.KAFKA.HEARTBEAT_INTERVAL,
        maxBytesPerPartition: config.KAFKA.MAX_BYTES_PER_PARTITION,
        allowAutoTopicCreation: false,
        retry: {
          initialRetryTime: config.KAFKA.RETRY_DELAY,
          retries: config.KAFKA.RETRY_ATTEMPTS
        }
      });

      // Initialize producer
      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000,
        retry: {
          initialRetryTime: config.KAFKA.RETRY_DELAY,
          retries: config.KAFKA.RETRY_ATTEMPTS
        }
      });

      // Connect consumer and producer
      await Promise.all([
        this.consumer.connect(),
        this.producer.connect()
      ]);

      // Setup event handlers
      this.setupEventHandlers();

      // Ensure required topics exist
      await this.ensureTopicsExist();

      // Start consuming
      await this.startConsuming();

      this.isConnected = true;
      timer.end({ success: true });

      kafkaLogger.connection('connected', {
        groupId: config.KAFKA.GROUP_ID,
        topics: Object.values(config.KAFKA_TOPICS)
      });

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      kafkaLogger.error('connect', 'connection', (error as Error).message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const timer = createTimer('kafka_disconnect');

    try {
      kafkaLogger.connection('disconnecting');

      const disconnectPromises = [];

      if (this.consumer) {
        disconnectPromises.push(this.consumer.disconnect());
      }

      if (this.producer) {
        disconnectPromises.push(this.producer.disconnect());
      }

      if (this.admin) {
        disconnectPromises.push(this.admin.disconnect());
      }

      await Promise.all(disconnectPromises);

      this.consumer = null;
      this.producer = null;
      this.admin = null;
      this.isConnected = false;

      timer.end({ success: true });
      kafkaLogger.connection('disconnected');

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      logError(error as Error, { operation: 'kafka_disconnect' });
    }
  }

  private setupEventHandlers(): void {
    if (this.consumer) {
      this.consumer.on('consumer.crash', (error) => {
        kafkaLogger.error('consumer_crash', 'consumer', error.payload.error.message, {
          groupId: error.payload.groupId,
          restart: error.payload.restart
        });
        this.emit('error', error.payload.error);
      });

      this.consumer.on('consumer.heartbeat', () => {
        kafkaLogger.messageConsumed('heartbeat', 0, '0', 0, 0, {
          groupId: config.KAFKA.GROUP_ID
        });
      });
    }

    if (this.producer) {
      this.producer.on('producer.disconnect', () => {
        kafkaLogger.connection('producer_disconnected');
        this.isConnected = false;
      });
    }
  }

  private async ensureTopicsExist(): Promise<void> {
    if (!this.admin) return;

    try {
      const requiredTopics = Object.values(config.KAFKA_TOPICS);
      const existingTopics = await this.admin.listTopics();
      const missingTopics = requiredTopics.filter(topic => !existingTopics.includes(topic));

      if (missingTopics.length > 0) {
        kafkaLogger.connection('creating_topics', { topics: missingTopics });

        await this.admin.createTopics({
          topics: missingTopics.map(topic => ({
            topic,
            numPartitions: 3,
            replicationFactor: 1,
            configEntries: [
              { name: 'cleanup.policy', value: 'delete' },
              { name: 'retention.ms', value: '604800000' }, // 7 days
              { name: 'segment.ms', value: '3600000' }, // 1 hour
              { name: 'max.message.bytes', value: '1048576' } // 1MB
            ]
          })),
          waitForLeaders: true,
          timeout: 30000
        });

        kafkaLogger.connection('topics_created', { topics: missingTopics });
      }
    } catch (error) {
      logError(error as Error, { operation: 'ensure_topics_exist' });
    }
  }

  private async startConsuming(): Promise<void> {
    if (!this.consumer) return;

    try {
      // Subscribe to notification-related topics
      await this.consumer.subscribe({
        topics: [
          config.KAFKA_TOPICS.USER_NOTIFICATIONS,
          config.KAFKA_TOPICS.TRADE_ALERTS,
          config.KAFKA_TOPICS.RISK_ALERTS,
          config.KAFKA_TOPICS.MARKET_ALERTS,
          config.KAFKA_TOPICS.SYSTEM_NOTIFICATIONS
        ],
        fromBeginning: false
      });

      await this.consumer.run({
        autoCommit: config.KAFKA.ENABLE_AUTO_COMMIT,
        autoCommitInterval: config.KAFKA.AUTO_COMMIT_INTERVAL,
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        }
      });

      kafkaLogger.connection('consumer_started', {
        groupId: config.KAFKA.GROUP_ID
      });

    } catch (error) {
      kafkaLogger.error('start_consuming', 'consumer', (error as Error).message);
      throw error;
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const timer = createTimer('kafka_message_processing', { topic, partition });

    try {
      const messageValue = message.value?.toString();
      if (!messageValue) {
        kafkaLogger.error('handle_message', topic, 'Empty message value', {
          partition,
          offset: message.offset
        });
        return;
      }

      let event: NotificationKafkaEvent;
      try {
        event = JSON.parse(messageValue);
      } catch (parseError) {
        kafkaLogger.error('handle_message', topic, 'JSON parse error', {
          error: (parseError as Error).message,
          partition,
          offset: message.offset
        });
        return;
      }

      const processingTime = timer.end({ success: true });

      kafkaLogger.messageConsumed(
        topic,
        partition,
        message.offset || '0',
        messageValue.length,
        processingTime,
        {
          eventType: event.eventType,
          eventId: event.eventId,
          userId: event.userId
        }
      );

      // Emit event for processing by notification service
      this.emit('notificationEvent', {
        topic,
        event,
        metadata: {
          partition,
          offset: message.offset,
          timestamp: message.timestamp
        }
      });

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      
      kafkaLogger.error('handle_message', topic, (error as Error).message, {
        partition,
        offset: message.offset
      });

      // Emit error for external handling
      this.emit('processingError', {
        topic,
        partition,
        offset: message.offset,
        error: error as Error
      });
    }
  }

  // Producer methods for publishing notification status updates
  async publishNotificationStatus(event: NotificationKafkaEvent): Promise<void> {
    if (!this.producer) {
      throw new Error('Kafka producer not initialized');
    }

    const timer = createTimer('kafka_publish_status', {
      eventType: event.eventType,
      eventId: event.eventId
    });

    try {
      const messageValue = JSON.stringify(event);

      await this.producer.send({
        topic: config.KAFKA_TOPICS.NOTIFICATION_STATUS,
        messages: [{
          key: event.userId || event.eventId,
          value: messageValue,
          timestamp: Date.now().toString(),
          headers: {
            eventType: event.eventType,
            source: event.source,
            version: event.version,
            correlationId: event.correlationId || ''
          }
        }]
      });

      timer.end({ success: true });

      kafkaLogger.messageProduced(
        config.KAFKA_TOPICS.NOTIFICATION_STATUS,
        0, // Partition will be determined by Kafka
        'unknown', // Offset not available at send time
        messageValue.length,
        {
          eventType: event.eventType,
          eventId: event.eventId,
          userId: event.userId
        }
      );

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      
      kafkaLogger.error(
        'publish_status',
        config.KAFKA_TOPICS.NOTIFICATION_STATUS,
        (error as Error).message,
        {
          eventType: event.eventType,
          eventId: event.eventId
        }
      );

      throw error;
    }
  }

  // Convenience methods for different notification status events
  async publishNotificationSent(notificationId: string, userId: string, channel: string, messageId?: string): Promise<void> {
    const event: NotificationKafkaEvent = {
      eventId: `notification-sent-${notificationId}`,
      eventType: 'notification_status_update',
      source: 'notification-service',
      userId,
      data: {
        notificationId,
        status: 'sent',
        channel,
        messageId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    await this.publishNotificationStatus(event);
  }

  async publishNotificationDelivered(notificationId: string, userId: string, channel: string, messageId?: string): Promise<void> {
    const event: NotificationKafkaEvent = {
      eventId: `notification-delivered-${notificationId}`,
      eventType: 'notification_status_update',
      source: 'notification-service',
      userId,
      data: {
        notificationId,
        status: 'delivered',
        channel,
        messageId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    await this.publishNotificationStatus(event);
  }

  async publishNotificationFailed(notificationId: string, userId: string, channel: string, error: string, messageId?: string): Promise<void> {
    const event: NotificationKafkaEvent = {
      eventId: `notification-failed-${notificationId}`,
      eventType: 'notification_status_update',
      source: 'notification-service',
      userId,
      data: {
        notificationId,
        status: 'failed',
        channel,
        error,
        messageId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    await this.publishNotificationStatus(event);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.admin || !this.isConnected) {
        return false;
      }

      // Check if we can fetch metadata
      const metadata = await this.admin.fetchTopicMetadata({
        topics: [config.KAFKA_TOPICS.NOTIFICATION_STATUS]
      });

      return metadata.topics.length > 0;
    } catch (error) {
      kafkaLogger.error('health_check', 'admin', (error as Error).message);
      return false;
    }
  }

  // Metrics
  getMetrics() {
    return {
      connected: this.isConnected,
      brokers: config.KAFKA.BROKERS,
      groupId: config.KAFKA.GROUP_ID,
      topics: Object.values(config.KAFKA_TOPICS)
    };
  }

  get connected(): boolean {
    return this.isConnected;
  }
}

export const notificationKafkaService = new NotificationKafkaService();