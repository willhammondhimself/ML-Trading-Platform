/**
 * Kafka Service for WebSocket Service
 * 
 * Handles Kafka consumer/producer operations for real-time event streaming,
 * with automatic topic management, retry logic, and health monitoring.
 */

import { Kafka, Consumer, Producer, EachMessagePayload, KafkaMessage, Admin } from 'kafkajs';
import { config } from '../config';
import { logger, wsLogger, logError } from '../utils/logger';
import { StreamEvent, KafkaMessage as StreamKafkaMessage } from '../types';
import EventEmitter from 'eventemitter3';

interface TopicHandler {
    topic: string;
    handler: (message: StreamEvent) => Promise<void>;
    options?: {
        fromBeginning?: boolean;
        autoCommit?: boolean;
        sessionTimeout?: number;
    };
}

class KafkaService extends EventEmitter {
    private kafka: Kafka;
    private consumer: Consumer | null = null;
    private producer: Producer | null = null;
    private admin: Admin | null = null;
    private isConnected = false;
    private topicHandlers = new Map<string, TopicHandler>();
    private messageBuffer = new Map<string, StreamEvent[]>();
    private processingStats = {
        messagesProcessed: 0,
        messagesPerSecond: 0,
        lastSecondCount: 0,
        lastSecondTime: Date.now(),
        errors: 0,
        bytesProcessed: 0
    };
    
    constructor() {
        super();
        
        // Initialize Kafka client
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
            logLevel: config.NODE_ENV === 'production' ? 2 : 4 // WARN in production, DEBUG in dev
        });
        
        this.setupShutdownHandler();
        this.setupMetricsCollection();
    }
    
    async connect(): Promise<void> {
        try {
            logger.info('📡 Connecting to Kafka...');
            
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
            
            // Setup consumer error handling
            this.consumer.on('consumer.crash', (error) => {
                wsLogger.kafka('error', 'consumer', {
                    error: error.payload.error.message,
                    groupId: error.payload.groupId,
                    restart: error.payload.restart
                });
                this.emit('error', error.payload.error);
            });
            
            this.consumer.on('consumer.heartbeat', () => {
                wsLogger.kafka('message_processed', 'heartbeat', {
                    groupId: config.KAFKA.GROUP_ID
                });
            });
            
            // Setup producer error handling
            this.producer.on('producer.disconnect', () => {
                wsLogger.kafka('connection_status', 'producer', {
                    status: 'disconnected'
                });
                this.isConnected = false;
            });
            
            this.isConnected = true;
            logger.info('✅ Kafka connection established successfully');
            
            // Ensure required topics exist
            await this.ensureTopicsExist();
            
        } catch (error) {
            logger.error('❌ Kafka connection failed:', error);
            throw error;
        }
    }
    
    async disconnect(): Promise<void> {
        logger.info('🔌 Disconnecting from Kafka...');
        
        try {
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
            
            logger.info('✅ Kafka disconnected successfully');
        } catch (error) {
            logger.error('❌ Error disconnecting from Kafka:', error);
        }
    }
    
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.admin || !this.isConnected) {
                return false;
            }
            
            // Check if we can fetch metadata
            const metadata = await this.admin.fetchTopicMetadata({
                topics: [config.KAFKA_TOPICS.SYSTEM_EVENTS]
            });
            
            return metadata.topics.length > 0;
        } catch (error) {
            wsLogger.kafka('error', 'health_check', {
                error: (error as Error).message
            });
            return false;
        }
    }
    
    private async ensureTopicsExist(): Promise<void> {
        if (!this.admin) return;
        
        try {
            const requiredTopics = Object.values(config.KAFKA_TOPICS);
            const existingTopics = await this.admin.listTopics();
            const missingTopics = requiredTopics.filter(topic => !existingTopics.includes(topic));
            
            if (missingTopics.length > 0) {
                logger.info('Creating missing Kafka topics:', missingTopics);
                
                await this.admin.createTopics({
                    topics: missingTopics.map(topic => ({
                        topic,
                        numPartitions: 3,
                        replicationFactor: 1,
                        configEntries: [
                            { name: 'cleanup.policy', value: 'delete' },
                            { name: 'retention.ms', value: '86400000' }, // 24 hours
                            { name: 'segment.ms', value: '3600000' }, // 1 hour
                            { name: 'max.message.bytes', value: '1048576' } // 1MB
                        ]
                    })),
                    waitForLeaders: true,
                    timeout: 30000
                });
                
                logger.info('✅ Kafka topics created successfully');
            }
        } catch (error) {
            logger.error('❌ Failed to ensure topics exist:', error);
        }
    }
    
    // Consumer operations
    async subscribe(topic: string, handler: (message: StreamEvent) => Promise<void>, options?: TopicHandler['options']): Promise<void> {
        if (!this.consumer) {
            throw new Error('Kafka consumer not initialized');
        }
        
        try {
            // Store handler
            this.topicHandlers.set(topic, { topic, handler, options });
            
            // Subscribe to topic
            await this.consumer.subscribe({
                topic,
                fromBeginning: options?.fromBeginning || false
            });
            
            logger.info('📡 Subscribed to Kafka topic', { topic });
            
            // Start consuming if not already running
            if (this.topicHandlers.size === 1) {
                await this.startConsuming();
            }
            
        } catch (error) {
            wsLogger.kafka('error', topic, {
                operation: 'subscribe',
                error: (error as Error).message
            });
            throw error;
        }
    }
    
    async unsubscribe(topic: string): Promise<void> {
        try {
            this.topicHandlers.delete(topic);
            
            // If no more handlers, stop consuming
            if (this.topicHandlers.size === 0 && this.consumer) {
                await this.consumer.stop();
            }
            
            logger.info('📡 Unsubscribed from Kafka topic', { topic });
            
        } catch (error) {
            wsLogger.kafka('error', topic, {
                operation: 'unsubscribe',
                error: (error as Error).message
            });
            throw error;
        }
    }
    
    private async startConsuming(): Promise<void> {
        if (!this.consumer) return;
        
        try {
            await this.consumer.run({
                autoCommit: config.KAFKA.ENABLE_AUTO_COMMIT,
                autoCommitInterval: config.KAFKA.AUTO_COMMIT_INTERVAL,
                eachMessage: async (payload: EachMessagePayload) => {
                    await this.handleMessage(payload);
                }
            });
            
            logger.info('📡 Kafka consumer started');
            
        } catch (error) {
            wsLogger.kafka('error', 'consumer', {
                operation: 'start_consuming',
                error: (error as Error).message
            });
            throw error;
        }
    }
    
    private async handleMessage(payload: EachMessagePayload): Promise<void> {
        const { topic, partition, message } = payload;
        const startTime = Date.now();
        
        try {
            // Parse message
            const messageValue = message.value?.toString();
            if (!messageValue) {
                wsLogger.kafka('error', topic, {
                    operation: 'parse_message',
                    error: 'Empty message value',
                    partition,
                    offset: message.offset
                });
                return;
            }
            
            let streamEvent: StreamEvent;
            try {
                streamEvent = JSON.parse(messageValue);
            } catch (parseError) {
                wsLogger.kafka('error', topic, {
                    operation: 'parse_json',
                    error: (parseError as Error).message,
                    messageValue: messageValue.substring(0, 200),
                    partition,
                    offset: message.offset
                });
                return;
            }
            
            // Find handler
            const topicHandler = this.topicHandlers.get(topic);
            if (!topicHandler) {
                wsLogger.kafka('error', topic, {
                    operation: 'find_handler',
                    error: 'No handler found for topic',
                    partition,
                    offset: message.offset
                });
                return;
            }
            
            // Process message
            await topicHandler.handler(streamEvent);
            
            // Update stats
            this.processingStats.messagesProcessed++;
            this.processingStats.bytesProcessed += messageValue.length;
            
            const processingTime = Date.now() - startTime;
            
            wsLogger.kafka('message_processed', topic, {
                eventType: streamEvent.eventType,
                source: streamEvent.source,
                userId: streamEvent.userId,
                processingTime,
                partition,
                offset: message.offset,
                messageSize: messageValue.length
            });
            
        } catch (error) {
            this.processingStats.errors++;
            
            wsLogger.kafka('error', topic, {
                operation: 'handle_message',
                error: (error as Error).message,
                partition,
                offset: message.offset,
                processingTime: Date.now() - startTime
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
    
    // Producer operations
    async publish(topic: string, event: StreamEvent, partition?: number): Promise<void> {
        if (!this.producer) {
            throw new Error('Kafka producer not initialized');
        }
        
        const startTime = Date.now();
        
        try {
            const message: KafkaMessage = {
                key: event.userId || event.eventId,
                value: JSON.stringify(event),
                partition,
                timestamp: Date.now().toString(),
                headers: {
                    eventType: event.eventType,
                    source: event.source,
                    version: event.version,
                    correlationId: event.correlationId || ''
                }
            };
            
            await this.producer.send({
                topic,
                messages: [message]
            });
            
            const publishTime = Date.now() - startTime;
            
            wsLogger.kafka('message_received', topic, {
                eventType: event.eventType,
                source: event.source,
                userId: event.userId,
                publishTime,
                messageSize: message.value?.length || 0
            });
            
        } catch (error) {
            const publishTime = Date.now() - startTime;
            
            wsLogger.kafka('error', topic, {
                operation: 'publish',
                eventType: event.eventType,
                error: (error as Error).message,
                publishTime
            });
            
            throw error;
        }
    }
    
    async publishBatch(topic: string, events: StreamEvent[]): Promise<void> {
        if (!this.producer || events.length === 0) return;
        
        const startTime = Date.now();
        
        try {
            const messages: KafkaMessage[] = events.map(event => ({
                key: event.userId || event.eventId,
                value: JSON.stringify(event),
                timestamp: Date.now().toString(),
                headers: {
                    eventType: event.eventType,
                    source: event.source,
                    version: event.version,
                    correlationId: event.correlationId || ''
                }
            }));
            
            await this.producer.send({
                topic,
                messages
            });
            
            const publishTime = Date.now() - startTime;
            
            wsLogger.kafka('message_received', topic, {
                operation: 'batch_publish',
                messageCount: events.length,
                publishTime,
                batchSize: messages.reduce((size, msg) => size + (msg.value?.length || 0), 0)
            });
            
        } catch (error) {
            const publishTime = Date.now() - startTime;
            
            wsLogger.kafka('error', topic, {
                operation: 'batch_publish',
                messageCount: events.length,
                error: (error as Error).message,
                publishTime
            });
            
            throw error;
        }
    }
    
    // Convenience methods for specific event types
    async publishMarketData(data: any): Promise<void> {
        const event: StreamEvent = {
            eventId: `market-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            eventType: 'market_data_update',
            source: 'market-data-service',
            data,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.MARKET_DATA, event);
    }
    
    async publishTradeExecution(trade: any, userId: string): Promise<void> {
        const event: StreamEvent = {
            eventId: `trade-${trade.id || Date.now()}`,
            eventType: 'trade_executed',
            source: 'trading-service',
            userId,
            data: trade,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.TRADE_EXECUTIONS, event);
    }
    
    async publishPortfolioUpdate(portfolio: any, userId: string): Promise<void> {
        const event: StreamEvent = {
            eventId: `portfolio-${userId}-${Date.now()}`,
            eventType: 'portfolio_updated',
            source: 'trading-service',
            userId,
            data: portfolio,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.PORTFOLIO_UPDATES, event);
    }
    
    async publishMLPrediction(prediction: any, userId?: string): Promise<void> {
        const event: StreamEvent = {
            eventId: `ml-${prediction.modelId}-${Date.now()}`,
            eventType: 'ml_prediction',
            source: 'ml-analytics-service',
            userId,
            data: prediction,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.ML_PREDICTIONS, event);
    }
    
    async publishRiskAlert(alert: any, userId: string): Promise<void> {
        const event: StreamEvent = {
            eventId: `risk-${alert.alertId}`,
            eventType: 'risk_alert',
            source: 'risk-service',
            userId,
            data: alert,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.RISK_ALERTS, event);
    }
    
    async publishNotification(notification: any, userId: string): Promise<void> {
        const event: StreamEvent = {
            eventId: `notification-${notification.id}`,
            eventType: 'user_notification',
            source: 'notification-service',
            userId,
            data: notification,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        await this.publish(config.KAFKA_TOPICS.USER_NOTIFICATIONS, event);
    }
    
    // Metrics and monitoring
    private setupMetricsCollection(): void {
        setInterval(() => {
            const now = Date.now();
            const timeDiff = now - this.processingStats.lastSecondTime;
            
            if (timeDiff >= 1000) {
                const newMessages = this.processingStats.messagesProcessed - this.processingStats.lastSecondCount;
                this.processingStats.messagesPerSecond = Math.round((newMessages * 1000) / timeDiff);
                this.processingStats.lastSecondCount = this.processingStats.messagesProcessed;
                this.processingStats.lastSecondTime = now;
                
                // Log metrics periodically
                if (this.processingStats.messagesProcessed > 0) {
                    wsLogger.kafka('message_processed', 'metrics', {
                        messagesProcessed: this.processingStats.messagesProcessed,
                        messagesPerSecond: this.processingStats.messagesPerSecond,
                        errors: this.processingStats.errors,
                        bytesProcessed: this.processingStats.bytesProcessed,
                        errorRate: this.processingStats.errors / this.processingStats.messagesProcessed
                    });
                }
            }
        }, 10000); // Every 10 seconds
    }
    
    getMetrics(): any {
        return {
            ...this.processingStats,
            connected: this.isConnected,
            subscribedTopics: Array.from(this.topicHandlers.keys()),
            consumerGroup: config.KAFKA.GROUP_ID
        };
    }
    
    // Admin operations
    async getTopicMetadata(topic: string): Promise<any> {
        if (!this.admin) {
            throw new Error('Kafka admin not initialized');
        }
        
        try {
            const metadata = await this.admin.fetchTopicMetadata({ topics: [topic] });
            return metadata.topics[0];
        } catch (error) {
            wsLogger.kafka('error', topic, {
                operation: 'get_metadata',
                error: (error as Error).message
            });
            throw error;
        }
    }
    
    async getConsumerGroupInfo(): Promise<any> {
        if (!this.admin) {
            throw new Error('Kafka admin not initialized');
        }
        
        try {
            const groups = await this.admin.describeGroups([config.KAFKA.GROUP_ID]);
            return groups.groups[0];
        } catch (error) {
            wsLogger.kafka('error', 'consumer_group', {
                operation: 'get_group_info',
                groupId: config.KAFKA.GROUP_ID,
                error: (error as Error).message
            });
            throw error;
        }
    }
    
    private setupShutdownHandler(): void {
        process.on('SIGTERM', () => this.disconnect());
        process.on('SIGINT', () => this.disconnect());
    }
    
    get connected(): boolean {
        return this.isConnected;
    }
    
    get clients() {
        return {
            kafka: this.kafka,
            consumer: this.consumer,
            producer: this.producer,
            admin: this.admin
        };
    }
}

// Global Kafka service instance
export const kafkaService = new KafkaService();

// Initialize Kafka connection
export const initializeKafka = async (): Promise<void> => {
    await kafkaService.connect();
};

// Close Kafka connection
export const closeKafka = async (): Promise<void> => {
    await kafkaService.disconnect();
};