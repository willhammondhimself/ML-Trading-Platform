/**
 * Kafka Service for Risk Management
 * 
 * Handles real-time event streaming for risk monitoring, compliance tracking,
 * and audit trail management with robust error handling and retry logic.
 */

import { Kafka, Producer, Consumer, EachMessagePayload, KafkaMessage } from 'kafkajs';
import { config } from '../config';
import { logger, logError, logKafkaEvent } from '../utils/logger';
import { addShutdownHandler } from '../utils/graceful-shutdown';

interface KafkaEventHandler {
    (payload: EachMessagePayload): Promise<void>;
}

interface RiskEvent {
    type: string;
    userId: string;
    timestamp: string;
    data: any;
    metadata?: any;
}

class KafkaService {
    private kafka: Kafka | null = null;
    private producer: Producer | null = null;
    private consumer: Consumer | null = null;
    private isConnected = false;
    private eventHandlers: Map<string, KafkaEventHandler[]> = new Map();
    private consumedTopics: Set<string> = new Set();
    
    constructor() {
        this.setupShutdownHandler();
    }
    
    async connect(): Promise<void> {
        try {
            logger.info('📨 Connecting to Kafka...');
            
            // Create Kafka instance
            this.kafka = new Kafka({
                clientId: config.KAFKA_CLIENT_ID,
                brokers: config.KAFKA_BROKERS,
                retry: {
                    initialRetryTime: 300,
                    retries: 8
                },
                connectionTimeout: 10000,
                requestTimeout: 30000,
                ...(config.KAFKA_USERNAME && config.KAFKA_PASSWORD && {
                    sasl: {
                        mechanism: 'plain',
                        username: config.KAFKA_USERNAME,
                        password: config.KAFKA_PASSWORD
                    }
                })
            });
            
            // Create producer
            this.producer = this.kafka.producer({
                maxInFlightRequests: 1,
                idempotent: true,
                transactionTimeout: 30000,
                retry: {
                    initialRetryTime: 300,
                    retries: 5
                }
            });
            
            // Create consumer
            this.consumer = this.kafka.consumer({
                groupId: config.KAFKA_GROUP_ID,
                sessionTimeout: 30000,
                rebalanceTimeout: 60000,
                heartbeatInterval: 3000,
                retry: {
                    initialRetryTime: 300,
                    retries: 5
                }
            });
            
            // Setup error handlers
            this.setupErrorHandlers();
            
            // Connect producer and consumer
            await Promise.all([
                this.producer.connect(),
                this.consumer.connect()
            ]);
            
            // Subscribe to topics first before starting consumer
            await this.subscribeToTradingEvents();
            
            // Setup consumer message handling
            await this.setupConsumer();
            
            this.isConnected = true;
            logger.info('✅ Kafka connection established successfully');
            
        } catch (error) {
            logger.error('❌ Kafka connection failed:', error);
            throw error;
        }
    }
    
    async disconnect(): Promise<void> {
        if (this.producer || this.consumer) {
            logger.info('🔌 Disconnecting from Kafka...');
            
            try {
                const disconnectPromises = [];
                
                if (this.producer) {
                    disconnectPromises.push(this.producer.disconnect());
                }
                
                if (this.consumer) {
                    disconnectPromises.push(this.consumer.disconnect());
                }
                
                await Promise.all(disconnectPromises);
                
                this.producer = null;
                this.consumer = null;
                this.kafka = null;
                this.isConnected = false;
                
                logger.info('✅ Kafka disconnected successfully');
            } catch (error) {
                logger.error('❌ Error disconnecting from Kafka:', error);
            }
        }
    }
    
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.kafka || !this.isConnected) {
                return false;
            }
            
            // Simple health check by getting metadata
            const admin = this.kafka.admin();
            await admin.connect();
            await admin.getTopicMetadata();
            await admin.disconnect();
            
            return true;
        } catch (error) {
            logger.error('❌ Kafka health check failed:', error);
            return false;
        }
    }
    
    // Producer methods
    async publishEvent(topic: string, event: RiskEvent, key?: string): Promise<void> {
        try {
            if (!this.producer) {
                throw new Error('Kafka producer not initialized');
            }
            
            const message = {
                key: key || event.userId,
                value: JSON.stringify(event),
                timestamp: Date.now().toString(),
                headers: {
                    eventType: event.type,
                    userId: event.userId,
                    service: 'risk-service'
                }
            };
            
            await this.producer.send({
                topic,
                messages: [message]
            });
            
            logKafkaEvent(topic, 'publish', 1);
            logger.debug('📤 Event published to Kafka', {
                topic,
                eventType: event.type,
                userId: event.userId,
                key
            });
            
        } catch (error) {
            logKafkaEvent(topic, 'publish', 0, error as Error);
            throw error;
        }
    }
    
    async publishBatch(topic: string, events: RiskEvent[]): Promise<void> {
        try {
            if (!this.producer) {
                throw new Error('Kafka producer not initialized');
            }
            
            const messages = events.map(event => ({
                key: event.userId,
                value: JSON.stringify(event),
                timestamp: Date.now().toString(),
                headers: {
                    eventType: event.type,
                    userId: event.userId,
                    service: 'risk-service'
                }
            }));
            
            await this.producer.send({
                topic,
                messages
            });
            
            logKafkaEvent(topic, 'publish_batch', events.length);
            logger.debug('📤 Batch events published to Kafka', {
                topic,
                eventCount: events.length
            });
            
        } catch (error) {
            logKafkaEvent(topic, 'publish_batch', 0, error as Error);
            throw error;
        }
    }
    
    // Consumer methods
    async subscribe(topic: string, handler: KafkaEventHandler): Promise<void> {
        try {
            if (!this.consumer) {
                throw new Error('Kafka consumer not initialized');
            }
            
            // Add handler to the map
            if (!this.eventHandlers.has(topic)) {
                this.eventHandlers.set(topic, []);
            }
            this.eventHandlers.get(topic)!.push(handler);
            
            // Subscribe to topic if not already subscribed and consumer not running
            if (!this.consumedTopics.has(topic)) {
                try {
                    await this.consumer.subscribe({ topic, fromBeginning: false });
                    this.consumedTopics.add(topic);
                    logger.info('📥 Subscribed to Kafka topic', { topic });
                } catch (error: any) {
                    if (error.message?.includes('Cannot subscribe to topic while consumer is running')) {
                        // Consumer is already running, we'll handle this topic in the next restart
                        logger.warn('⚠️ Cannot subscribe while consumer running, topic will be available on restart', { topic });
                        this.consumedTopics.add(topic); // Mark as handled
                    } else {
                        throw error;
                    }
                }
            }
            
        } catch (error) {
            logKafkaEvent(topic, 'subscribe', 0, error as Error);
            throw error;
        }
    }
    
    private async setupConsumer(): Promise<void> {
        if (!this.consumer) return;
        
        await this.consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
                const { topic, partition, message } = payload;
                
                try {
                    // Get handlers for this topic
                    const handlers = this.eventHandlers.get(topic) || [];
                    
                    if (handlers.length === 0) {
                        logger.warn('⚠️ No handlers found for topic', { topic });
                        return;
                    }
                    
                    // Execute all handlers for this topic
                    await Promise.all(
                        handlers.map(handler => handler(payload))
                    );
                    
                    logKafkaEvent(topic, 'consume', 1);
                    
                } catch (error) {
                    logger.error('❌ Error processing Kafka message', {
                        topic,
                        partition,
                        offset: message.offset,
                        error: error instanceof Error ? error.message : error
                    });
                    
                    logKafkaEvent(topic, 'consume', 0, error as Error);
                    
                    // Consider implementing dead letter queue here
                    await this.handleMessageError(payload, error as Error);
                }
            }
        });
    }
    
    private async handleMessageError(payload: EachMessagePayload, error: Error): Promise<void> {
        const { topic, partition, message } = payload;
        
        // Log error details
        logger.error('📮 Message processing failed', {
            topic,
            partition,
            offset: message.offset,
            key: message.key?.toString(),
            error: error.message,
            timestamp: message.timestamp
        });
        
        // TODO: Implement dead letter queue or retry mechanism
        // For now, we just log the error and continue
    }
    
    private setupErrorHandlers(): void {
        if (!this.producer || !this.consumer) return;
        
        // Producer error handlers
        this.producer.on('producer.connect', () => {
            logger.info('📤 Kafka producer connected');
        });
        
        this.producer.on('producer.disconnect', () => {
            logger.warn('📤 Kafka producer disconnected');
        });
        
        this.producer.on('producer.network.request_timeout', (payload) => {
            logger.warn('📤 Kafka producer request timeout', payload);
        });
        
        // Consumer error handlers
        this.consumer.on('consumer.connect', () => {
            logger.info('📥 Kafka consumer connected');
        });
        
        this.consumer.on('consumer.disconnect', () => {
            logger.warn('📥 Kafka consumer disconnected');
        });
        
        this.consumer.on('consumer.network.request_timeout', (payload) => {
            logger.warn('📥 Kafka consumer request timeout', payload);
        });
        
        this.consumer.on('consumer.rebalancing', () => {
            logger.info('⚖️ Kafka consumer rebalancing');
        });
    }
    
    // Risk-specific event methods
    async publishRiskViolation(userId: string, violationType: string, details: any): Promise<void> {
        const event: RiskEvent = {
            type: 'risk_violation',
            userId,
            timestamp: new Date().toISOString(),
            data: {
                violationType,
                ...details
            },
            metadata: {
                service: 'risk-service',
                version: '1.0.0'
            }
        };
        
        await this.publishEvent(config.KAFKA_TOPICS.RISK_ALERTS, event);
    }
    
    async publishComplianceEvent(userId: string, eventType: string, details: any): Promise<void> {
        const event: RiskEvent = {
            type: 'compliance_event',
            userId,
            timestamp: new Date().toISOString(),
            data: {
                eventType,
                ...details
            },
            metadata: {
                service: 'risk-service',
                version: '1.0.0'
            }
        };
        
        await this.publishEvent(config.KAFKA_TOPICS.COMPLIANCE_EVENTS, event);
    }
    
    async publishAuditEvent(userId: string, action: string, entityType: string, details: any): Promise<void> {
        const event: RiskEvent = {
            type: 'audit_event',
            userId,
            timestamp: new Date().toISOString(),
            data: {
                action,
                entityType,
                ...details
            },
            metadata: {
                service: 'risk-service',
                version: '1.0.0'
            }
        };
        
        await this.publishEvent(config.KAFKA_TOPICS.AUDIT_TRAIL, event);
    }
    
    async publishRiskAlert(userId: string, alertType: string, severity: string, details: any): Promise<void> {
        const event: RiskEvent = {
            type: 'risk_alert',
            userId,
            timestamp: new Date().toISOString(),
            data: {
                alertType,
                severity,
                ...details
            },
            metadata: {
                service: 'risk-service',
                version: '1.0.0'
            }
        };
        
        await this.publishEvent(config.KAFKA_TOPICS.RISK_ALERTS, event);
    }
    
    // Subscribe to trading events
    async subscribeToTradingEvents(): Promise<void> {
        // Subscribe to trades
        await this.subscribe(config.KAFKA_TOPICS.TRADES, async (payload) => {
            try {
                const message = JSON.parse(payload.message.value?.toString() || '{}');
                logger.debug('📈 Received trade event', {
                    userId: message.userId,
                    tradeId: message.tradeId,
                    symbol: message.symbol
                });
                
                // Process trade for risk analysis
                await this.processTradingEvent('trade', message);
            } catch (error) {
                logger.error('❌ Error processing trade event:', error);
            }
        });
        
        // Subscribe to positions
        await this.subscribe(config.KAFKA_TOPICS.POSITIONS, async (payload) => {
            try {
                const message = JSON.parse(payload.message.value?.toString() || '{}');
                logger.debug('📊 Received position event', {
                    userId: message.userId,
                    positionId: message.positionId,
                    symbol: message.symbol
                });
                
                // Process position for risk analysis
                await this.processTradingEvent('position', message);
            } catch (error) {
                logger.error('❌ Error processing position event:', error);
            }
        });
        
        // Subscribe to orders
        await this.subscribe(config.KAFKA_TOPICS.ORDERS, async (payload) => {
            try {
                const message = JSON.parse(payload.message.value?.toString() || '{}');
                logger.debug('📋 Received order event', {
                    userId: message.userId,
                    orderId: message.orderId,
                    symbol: message.symbol
                });
                
                // Process order for compliance checking
                await this.processTradingEvent('order', message);
            } catch (error) {
                logger.error('❌ Error processing order event:', error);
            }
        });
        
        // Subscribe to market data
        await this.subscribe(config.KAFKA_TOPICS.MARKET_DATA, async (payload) => {
            try {
                const message = JSON.parse(payload.message.value?.toString() || '{}');
                
                // Process market data for risk calculations
                await this.processMarketData(message);
            } catch (error) {
                logger.error('❌ Error processing market data:', error);
            }
        });
    }
    
    private async processTradingEvent(eventType: string, data: any): Promise<void> {
        // This will be implemented by the risk monitoring service
        logger.debug(`🔍 Processing ${eventType} event for risk analysis`, {
            eventType,
            userId: data.userId
        });
    }
    
    private async processMarketData(data: any): Promise<void> {
        // This will be implemented by the risk monitoring service
        logger.debug('📊 Processing market data for risk calculations', {
            symbol: data.symbol,
            price: data.price
        });
    }
    
    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.disconnect();
        });
    }
    
    // Connection status
    get connected(): boolean {
        return this.isConnected;
    }
    
    // Get Kafka instance for advanced operations
    get kafkaInstance(): Kafka | null {
        return this.kafka;
    }
}

// Global Kafka service instance
export const kafkaService = new KafkaService();

// Initialize Kafka connection
export const initializeKafka = async (): Promise<void> => {
    await kafkaService.connect();
    // subscribeToTradingEvents is now called within connect()
};

// Close Kafka connection
export const closeKafka = async (): Promise<void> => {
    await kafkaService.disconnect();
};