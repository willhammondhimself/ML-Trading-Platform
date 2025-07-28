import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';
import { AuditAction } from '../models/audit-log';

let kafka: Kafka;
let producer: Producer;
let consumer: Consumer;

/**
 * Initialize Kafka client
 */
export const initializeKafka = async (): Promise<void> => {
  try {
    const env = getEnvironment();
    
    kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS.split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
      logLevel: 1 // Error level only in production
    });

    // Create producer
    producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    // Create consumer
    consumer = kafka.consumer({
      groupId: env.KAFKA_GROUP_ID,
      sessionTimeout: 30000,
      heartbeatInterval: 10000,
      maxWaitTimeInMs: 5000,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    // Connect producer
    await producer.connect();
    logger.info('Kafka producer connected');

    // Connect consumer
    await consumer.connect();
    logger.info('Kafka consumer connected');

    // Subscribe to topics
    await consumer.subscribe({ 
      topics: [
        'user-events',
        'audit-events',
        'security-events'
      ],
      fromBeginning: false
    });

    // Start consuming
    await consumer.run({
      eachMessage: handleMessage
    });

    logger.info('Kafka client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Kafka:', error);
    throw error;
  }
};

/**
 * Handle incoming Kafka messages
 */
const handleMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  try {
    const key = message.key?.toString();
    const value = message.value?.toString();
    
    if (!value) {
      logger.warn('Received empty Kafka message', { topic, partition });
      return;
    }

    const payload = JSON.parse(value);
    
    logger.debug('Received Kafka message', {
      topic,
      partition,
      key,
      offset: message.offset,
      timestamp: message.timestamp
    });

    // Handle different message types based on topic
    switch (topic) {
      case 'user-events':
        await handleUserEvent(payload);
        break;
      case 'audit-events':
        await handleAuditEvent(payload);
        break;
      case 'security-events':
        await handleSecurityEvent(payload);
        break;
      default:
        logger.warn('Unknown topic received', { topic });
    }
  } catch (error) {
    logger.error('Error handling Kafka message:', {
      topic,
      partition,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Handle user events
 */
const handleUserEvent = async (payload: any): Promise<void> => {
  // Process user-related events from other services
  logger.info('Processing user event', { type: payload.type, userId: payload.userId });
  
  // Example: Handle user status changes from other services
  // This could trigger notifications, updates, etc.
};

/**
 * Handle audit events
 */
const handleAuditEvent = async (payload: any): Promise<void> => {
  // Process audit events for compliance reporting
  logger.info('Processing audit event', { action: payload.action, userId: payload.userId });
  
  // Could trigger compliance workflows, notifications, etc.
};

/**
 * Handle security events
 */
const handleSecurityEvent = async (payload: any): Promise<void> => {
  // Process security events for threat detection
  logger.info('Processing security event', { type: payload.type, severity: payload.severity });
  
  // Could trigger security alerts, blocking, etc.
};

/**
 * Publish user event
 */
export const publishUserEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || 'system',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'user-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'user-events',
      messages: [message]
    });

    logger.debug('Published user event', { type: eventType, userId: payload.userId });
  } catch (error) {
    logger.error('Failed to publish user event:', { eventType, error });
    throw error;
  }
};

/**
 * Publish audit event
 */
export const publishAuditEvent = async (action: AuditAction, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || payload.ipAddress || 'system',
      value: JSON.stringify({
        action,
        timestamp: new Date().toISOString(),
        service: 'user-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'audit-events',
      messages: [message]
    });

    logger.debug('Published audit event', { action, userId: payload.userId });
  } catch (error) {
    logger.error('Failed to publish audit event:', { action, error });
    // Don't throw here to avoid breaking the main flow
  }
};

/**
 * Publish security event
 */
export const publishSecurityEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || payload.ipAddress || 'security',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'user-service',
        severity: payload.severity || 'medium',
        ...payload
      })
    };

    await producer.send({
      topic: 'security-events',
      messages: [message]
    });

    logger.info('Published security event', { type: eventType, severity: payload.severity });
  } catch (error) {
    logger.error('Failed to publish security event:', { eventType, error });
    // Don't throw here to avoid breaking the main flow
  }
};

/**
 * Publish batch of events (for better performance)
 */
export const publishEventsBatch = async (events: Array<{
  topic: string;
  key: string;
  payload: any;
}>): Promise<void> => {
  try {
    const messagesByTopic: { [topic: string]: any[] } = {};

    // Group messages by topic
    events.forEach(event => {
      if (!messagesByTopic[event.topic]) {
        messagesByTopic[event.topic] = [];
      }

      messagesByTopic[event.topic].push({
        key: event.key,
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'user-service',
          ...event.payload
        })
      });
    });

    // Send messages for each topic
    const sendPromises = Object.entries(messagesByTopic).map(([topic, messages]) =>
      producer.send({ topic, messages })
    );

    await Promise.all(sendPromises);

    logger.debug('Published batch events', { count: events.length });
  } catch (error) {
    logger.error('Failed to publish batch events:', error);
    throw error;
  }
};

/**
 * Get Kafka client instance
 */
export const getKafkaClient = (): Kafka => {
  if (!kafka) {
    throw new Error('Kafka client not initialized. Call initializeKafka() first.');
  }
  return kafka;
};

/**
 * Close Kafka connections
 */
export const closeKafka = async (): Promise<void> => {
  try {
    if (producer) {
      await producer.disconnect();
      logger.info('Kafka producer disconnected');
    }

    if (consumer) {
      await consumer.disconnect();
      logger.info('Kafka consumer disconnected');
    }
  } catch (error) {
    logger.error('Error closing Kafka connections:', error);
  }
};

/**
 * Check Kafka health
 */
export const checkKafkaHealth = async (): Promise<boolean> => {
  try {
    const admin = kafka.admin();
    await admin.connect();
    
    const topics = await admin.listTopics();
    const isHealthy = topics.length >= 0; // Basic check
    
    await admin.disconnect();
    return isHealthy;
  } catch (error) {
    logger.error('Kafka health check failed:', error);
    return false;
  }
};

/**
 * Event types for user service
 */
export const UserEventTypes = {
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  PASSWORD_CHANGED: 'user.password_changed',
  MFA_ENABLED: 'user.mfa_enabled',
  MFA_DISABLED: 'user.mfa_disabled',
  EMAIL_VERIFIED: 'user.email_verified',
  ACCOUNT_LOCKED: 'user.account_locked',
  ACCOUNT_UNLOCKED: 'user.account_unlocked'
} as const;

/**
 * Security event types
 */
export const SecurityEventTypes = {
  FAILED_LOGIN: 'security.failed_login',
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
  BRUTE_FORCE_ATTEMPT: 'security.brute_force_attempt',
  ACCOUNT_TAKEOVER_ATTEMPT: 'security.account_takeover_attempt',
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
  INVALID_TOKEN: 'security.invalid_token'
} as const;