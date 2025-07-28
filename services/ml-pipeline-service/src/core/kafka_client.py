"""
Kafka Client Configuration and Event Management

Async Kafka client for ML pipeline event streaming,
model prediction publishing, and inter-service communication.
"""

from typing import Optional, Dict, Any, List, Callable
import json
import asyncio
from datetime import datetime
import uuid

from aiokafka import AIOKafkaProducer, AIOKafkaConsumer, ConsumerRecord
from aiokafka.errors import KafkaError
import structlog

from ..config.settings import get_settings

logger = structlog.get_logger("kafka")

# Global Kafka clients
producer: Optional[AIOKafkaProducer] = None
consumers: Dict[str, AIOKafkaConsumer] = {}


async def init_kafka() -> None:
    """Initialize Kafka producer and consumers."""
    global producer
    
    settings = get_settings()
    
    try:
        # Create producer
        producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
            key_serializer=lambda k: str(k).encode('utf-8') if k else None,
            acks='all',  # Wait for all replicas to acknowledge
            retries=5,
            max_in_flight_requests_per_connection=5,
            enable_idempotence=True,
            compression_type='gzip',
            batch_size=16384,
            linger_ms=10,  # Small delay to batch messages
        )
        
        await producer.start()
        
        logger.info(
            "Kafka producer initialized successfully",
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        )
        
    except Exception as e:
        logger.error(f"Failed to initialize Kafka: {e}")
        raise


async def close_kafka() -> None:
    """Close Kafka connections."""
    global producer, consumers
    
    try:
        # Close all consumers
        for topic, consumer in consumers.items():
            try:
                await consumer.stop()
                logger.debug(f"Consumer for {topic} closed")
            except Exception as e:
                logger.error(f"Error closing consumer for {topic}: {e}")
        
        consumers.clear()
        
        # Close producer
        if producer:
            await producer.stop()
            logger.info("Kafka producer closed")
            
    except Exception as e:
        logger.error(f"Error closing Kafka connections: {e}")


def get_producer() -> AIOKafkaProducer:
    """Get Kafka producer instance."""
    if producer is None:
        raise RuntimeError("Kafka not initialized. Call init_kafka() first.")
    return producer


async def check_kafka_health() -> bool:
    """Check Kafka health status."""
    try:
        kafka_producer = get_producer()
        metadata = await kafka_producer.client.fetch_metadata()
        return len(metadata.brokers) > 0
    except Exception as e:
        logger.error(f"Kafka health check failed: {e}")
        return False


class KafkaEventPublisher:
    """Kafka event publisher for ML pipeline events."""
    
    def __init__(self):
        self.producer = get_producer()
    
    async def publish_ml_prediction(
        self,
        symbol: str,
        model_id: str,
        prediction: Dict[str, Any],
        confidence: float = None,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Publish ML prediction event."""
        try:
            event = {
                'event_type': 'ml_prediction',
                'event_id': str(uuid.uuid4()),
                'timestamp': datetime.utcnow().isoformat(),
                'symbol': symbol,
                'model_id': model_id,
                'prediction': prediction,
                'confidence': confidence,
                'metadata': metadata or {},
                'service': 'ml-pipeline-service'
            }
            
            await self.producer.send(
                topic='ml-predictions',
                key=symbol,
                value=event
            )
            
            logger.debug(
                "ML prediction published",
                symbol=symbol,
                model_id=model_id,
                confidence=confidence
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish ML prediction: {e}")
            return False
    
    async def publish_model_training_event(
        self,
        job_id: str,
        model_id: str,
        status: str,
        progress: float = None,
        metrics: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Publish model training status event."""
        try:
            event = {
                'event_type': 'model_training',
                'event_id': str(uuid.uuid4()),
                'timestamp': datetime.utcnow().isoformat(),
                'job_id': job_id,
                'model_id': model_id,
                'status': status,
                'progress': progress,
                'metrics': metrics or {},
                'metadata': metadata or {},
                'service': 'ml-pipeline-service'
            }
            
            await self.producer.send(
                topic='model-training-events',
                key=job_id,
                value=event
            )
            
            logger.debug(
                "Model training event published",
                job_id=job_id,
                model_id=model_id,
                status=status,
                progress=progress
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish training event: {e}")
            return False
    
    async def publish_feature_update(
        self,
        symbol: str,
        features: Dict[str, Any],
        feature_version: str = None,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Publish feature update event."""
        try:
            event = {
                'event_type': 'feature_update',
                'event_id': str(uuid.uuid4()),
                'timestamp': datetime.utcnow().isoformat(),
                'symbol': symbol,
                'features': features,
                'feature_version': feature_version,
                'metadata': metadata or {},
                'service': 'ml-pipeline-service'
            }
            
            await self.producer.send(
                topic='feature-updates',
                key=symbol,
                value=event
            )
            
            logger.debug(
                "Feature update published",
                symbol=symbol,
                feature_count=len(features),
                version=feature_version
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish feature update: {e}")
            return False
    
    async def publish_model_deployment_event(
        self,
        model_id: str,
        version: str,
        status: str,
        deployment_metadata: Dict[str, Any] = None
    ) -> bool:
        """Publish model deployment event."""
        try:
            event = {
                'event_type': 'model_deployment',
                'event_id': str(uuid.uuid4()),
                'timestamp': datetime.utcnow().isoformat(),
                'model_id': model_id,
                'version': version,
                'status': status,
                'deployment_metadata': deployment_metadata or {},
                'service': 'ml-pipeline-service'
            }
            
            await self.producer.send(
                topic='model-deployments',
                key=model_id,
                value=event
            )
            
            logger.info(
                "Model deployment event published",
                model_id=model_id,
                version=version,
                status=status
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish deployment event: {e}")
            return False
    
    async def publish_batch_predictions(
        self,
        predictions: List[Dict[str, Any]]
    ) -> int:
        """Publish multiple predictions in batch."""
        success_count = 0
        
        try:
            # Send all predictions in batch
            tasks = []
            for prediction in predictions:
                if 'symbol' in prediction and 'model_id' in prediction:
                    task = self.publish_ml_prediction(
                        symbol=prediction['symbol'],
                        model_id=prediction['model_id'],
                        prediction=prediction.get('prediction', {}),
                        confidence=prediction.get('confidence'),
                        metadata=prediction.get('metadata', {})
                    )
                    tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            success_count = sum(1 for result in results if result is True)
            
            logger.info(
                "Batch predictions published",
                total=len(predictions),
                success=success_count,
                failed=len(predictions) - success_count
            )
            
        except Exception as e:
            logger.error(f"Failed to publish batch predictions: {e}")
        
        return success_count


class KafkaEventConsumer:
    """Kafka event consumer for ML pipeline."""
    
    def __init__(self, topics: List[str], group_id: str = None):
        settings = get_settings()
        self.topics = topics
        self.group_id = group_id or settings.KAFKA_GROUP_ID
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.handlers: Dict[str, Callable] = {}
        self.running = False
    
    async def start(self) -> None:
        """Start the consumer."""
        if self.consumer is not None:
            return
        
        settings = get_settings()
        
        try:
            self.consumer = AIOKafkaConsumer(
                *self.topics,
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                group_id=self.group_id,
                auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')) if m else None,
                key_deserializer=lambda k: k.decode('utf-8') if k else None,
                enable_auto_commit=False,  # Manual commit for reliability
                max_poll_records=500,
                fetch_max_bytes=52428800,  # 50MB
                consumer_timeout_ms=1000,
            )
            
            await self.consumer.start()
            self.running = True
            
            # Store consumer reference globally
            for topic in self.topics:
                consumers[topic] = self.consumer
            
            logger.info(
                "Kafka consumer started",
                topics=self.topics,
                group_id=self.group_id
            )
            
        except Exception as e:
            logger.error(f"Failed to start consumer: {e}")
            raise
    
    async def stop(self) -> None:
        """Stop the consumer."""
        self.running = False
        
        if self.consumer:
            await self.consumer.stop()
            
            # Remove from global consumers
            for topic in self.topics:
                if topic in consumers:
                    del consumers[topic]
            
            logger.info("Kafka consumer stopped")
    
    def register_handler(self, event_type: str, handler: Callable) -> None:
        """Register event handler for specific event type."""
        self.handlers[event_type] = handler
        logger.debug(f"Handler registered for event type: {event_type}")
    
    async def consume_messages(self) -> None:
        """Start consuming messages."""
        if not self.consumer or not self.running:
            raise RuntimeError("Consumer not started")
        
        try:
            async for message in self.consumer:
                try:
                    await self._process_message(message)
                    await self.consumer.commit()
                except Exception as e:
                    logger.error(
                        f"Failed to process message: {e}",
                        topic=message.topic,
                        partition=message.partition,
                        offset=message.offset
                    )
                    
        except Exception as e:
            logger.error(f"Consumer loop error: {e}")
            self.running = False
            raise
    
    async def _process_message(self, message: ConsumerRecord) -> None:
        """Process individual message."""
        try:
            # Parse message
            event_data = message.value
            event_type = event_data.get('event_type')
            
            if not event_type:
                logger.warning("Message missing event_type", topic=message.topic)
                return
            
            # Find and execute handler
            handler = self.handlers.get(event_type)
            if handler:
                await handler(event_data, message)
                logger.debug(
                    "Message processed",
                    event_type=event_type,
                    topic=message.topic,
                    partition=message.partition,
                    offset=message.offset
                )
            else:
                logger.debug(f"No handler for event type: {event_type}")
                
        except Exception as e:
            logger.error(f"Message processing error: {e}")
            raise


# Global instances
event_publisher: Optional[KafkaEventPublisher] = None

def get_event_publisher() -> KafkaEventPublisher:
    """Get event publisher instance."""
    global event_publisher
    if event_publisher is None:
        event_publisher = KafkaEventPublisher()
    return event_publisher