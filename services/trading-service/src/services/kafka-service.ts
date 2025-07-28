import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';

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
    logger.info('Trading Service Kafka producer connected');

    // Connect consumer
    await consumer.connect();
    logger.info('Trading Service Kafka consumer connected');

    // Subscribe to topics
    await consumer.subscribe({ 
      topics: [
        'market-data-updates',
        'user-events',
        'risk-events',
        'order-events'
      ],
      fromBeginning: false
    });

    // Start consuming
    await consumer.run({
      eachMessage: handleMessage
    });

    logger.info('Trading Service Kafka client initialized successfully');
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
      case 'market-data-updates':
        await handleMarketDataUpdate(payload);
        break;
      case 'user-events':
        await handleUserEvent(payload);
        break;
      case 'risk-events':
        await handleRiskEvent(payload);
        break;
      case 'order-events':
        await handleOrderEvent(payload);
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
 * Handle market data updates
 */
const handleMarketDataUpdate = async (payload: any): Promise<void> => {
  // Process market data updates from market data service
  logger.debug('Processing market data update', { 
    symbol: payload.symbol, 
    price: payload.price 
  });
  
  // This would trigger position value updates, order execution checks, etc.
  // Implementation would integrate with OrderProcessor and PositionUpdater services
};

/**
 * Handle user events
 */
const handleUserEvent = async (payload: any): Promise<void> => {
  // Process user-related events (login, logout, account changes)
  logger.debug('Processing user event', { 
    type: payload.type, 
    userId: payload.userId 
  });
  
  // Could trigger user session updates, position recalculations, etc.
};

/**
 * Handle risk events
 */
const handleRiskEvent = async (payload: any): Promise<void> => {
  // Process risk-related events from risk service
  logger.info('Processing risk event', { 
    type: payload.type, 
    userId: payload.userId,
    severity: payload.severity 
  });
  
  // Could trigger order cancellations, position closures, etc.
};

/**
 * Handle order events
 */
const handleOrderEvent = async (payload: any): Promise<void> => {
  // Process order events from other services or external systems
  logger.debug('Processing order event', { 
    type: payload.type, 
    orderId: payload.orderId 
  });
};

/**
 * Publish trading event
 */
export const publishTradingEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || payload.orderId || 'system',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'trading-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'trading-events',
      messages: [message]
    });

    logger.debug('Published trading event', { type: eventType, key: message.key });
  } catch (error) {
    logger.error('Failed to publish trading event:', { eventType, error });
    throw error;
  }
};

/**
 * Publish order event
 */
export const publishOrderEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.orderId || payload.userId || 'system',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'trading-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'order-events',
      messages: [message]
    });

    logger.debug('Published order event', { type: eventType, orderId: payload.orderId });
  } catch (error) {
    logger.error('Failed to publish order event:', { eventType, error });
    // Don't throw here to avoid breaking the main flow
  }
};

/**
 * Publish position event
 */
export const publishPositionEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || 'system',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'trading-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'position-events',
      messages: [message]
    });

    logger.debug('Published position event', { type: eventType, userId: payload.userId });
  } catch (error) {
    logger.error('Failed to publish position event:', { eventType, error });
    // Don't throw here to avoid breaking the main flow
  }
};

/**
 * Publish trade event
 */
export const publishTradeEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    const message = {
      key: payload.userId || payload.tradeId || 'system',
      value: JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        service: 'trading-service',
        ...payload
      })
    };

    await producer.send({
      topic: 'trade-events',
      messages: [message]
    });

    logger.debug('Published trade event', { type: eventType, tradeId: payload.tradeId });
  } catch (error) {
    logger.error('Failed to publish trade event:', { eventType, error });
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
          service: 'trading-service',
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
      logger.info('Trading Service Kafka producer disconnected');
    }

    if (consumer) {
      await consumer.disconnect();
      logger.info('Trading Service Kafka consumer disconnected');
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
 * Event types for trading service
 */
export const TradingEventTypes = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FILLED: 'order.filled',
  ORDER_PARTIALLY_FILLED: 'order.partially_filled',
  ORDER_REJECTED: 'order.rejected',
  ORDER_EXPIRED: 'order.expired',
  TRADE_EXECUTED: 'trade.executed',
  POSITION_OPENED: 'position.opened',
  POSITION_UPDATED: 'position.updated',
  POSITION_CLOSED: 'position.closed',
  PORTFOLIO_UPDATED: 'portfolio.updated'
} as const;