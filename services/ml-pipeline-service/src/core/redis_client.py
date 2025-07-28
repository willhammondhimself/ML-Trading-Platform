"""
Redis Client Configuration and Connection Management

Async Redis client setup for feature caching, model caching,
and real-time data management in the ML pipeline.
"""

from typing import Optional, Any, Dict, List, Union
import json
import pickle
from datetime import datetime, timedelta
import asyncio

import aioredis
from aioredis import Redis
import structlog

from ..config.settings import get_settings

logger = structlog.get_logger("redis")

# Global Redis client
redis_client: Optional[Redis] = None


async def init_redis() -> None:
    """Initialize Redis connection."""
    global redis_client
    
    settings = get_settings()
    
    try:
        # Create Redis connection
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            retry_on_timeout=settings.REDIS_RETRY_ON_TIMEOUT,
            socket_keepalive=True,
            socket_keepalive_options={},
            health_check_interval=30,
            encoding='utf-8',
            decode_responses=True
        )
        
        # Test connection
        await redis_client.ping()
        
        logger.info(
            "Redis initialized successfully",
            redis_url=settings.REDIS_URL.split("@")[1] if "@" in settings.REDIS_URL else "local",
            max_connections=settings.REDIS_MAX_CONNECTIONS,
        )
        
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


async def close_redis() -> None:
    """Close Redis connection."""
    global redis_client
    
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")


def get_redis_client() -> Redis:
    """Get Redis client instance."""
    if redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return redis_client


async def check_redis_health() -> bool:
    """Check Redis health status."""
    try:
        client = get_redis_client()
        await client.ping()
        return True
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return False


class RedisManager:
    """Redis management utilities for ML pipeline operations."""
    
    def __init__(self):
        self.client = get_redis_client()
    
    # Feature caching
    async def cache_features(
        self, 
        symbol: str, 
        features: Dict[str, Any], 
        ttl: int = None
    ) -> bool:
        """Cache feature data for a symbol."""
        try:
            settings = get_settings()
            ttl = ttl or settings.FEATURE_CACHE_TTL
            
            key = f"features:{symbol}"
            
            # Add timestamp to features
            features_with_ts = {
                **features,
                'cached_at': datetime.utcnow().isoformat(),
                'symbol': symbol
            }
            
            await self.client.setex(
                key, 
                ttl, 
                json.dumps(features_with_ts, default=str)
            )
            
            logger.debug(f"Features cached for {symbol}", ttl=ttl)
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache features for {symbol}: {e}")
            return False
    
    async def get_cached_features(
        self, 
        symbol: str, 
        max_age_seconds: int = None
    ) -> Optional[Dict[str, Any]]:
        """Get cached feature data for a symbol."""
        try:
            settings = get_settings()
            max_age_seconds = max_age_seconds or settings.FEATURE_CACHE_TTL
            
            key = f"features:{symbol}"
            data = await self.client.get(key)
            
            if not data:
                return None
            
            features = json.loads(data)
            
            # Check if data is too old
            if 'cached_at' in features:
                cached_time = datetime.fromisoformat(features['cached_at'])
                age = (datetime.utcnow() - cached_time).total_seconds()
                
                if age > max_age_seconds:
                    # Delete expired cache
                    await self.client.delete(key)
                    return None
            
            return features
            
        except Exception as e:
            logger.error(f"Failed to get cached features for {symbol}: {e}")
            return None
    
    # Model caching
    async def cache_model_prediction(
        self, 
        model_id: str, 
        input_hash: str, 
        prediction: Any, 
        ttl: int = 300
    ) -> bool:
        """Cache model prediction result."""
        try:
            key = f"prediction:{model_id}:{input_hash}"
            
            prediction_data = {
                'prediction': prediction,
                'cached_at': datetime.utcnow().isoformat(),
                'model_id': model_id,
                'input_hash': input_hash
            }
            
            await self.client.setex(
                key, 
                ttl, 
                json.dumps(prediction_data, default=str)
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache prediction: {e}")
            return False
    
    async def get_cached_prediction(
        self, 
        model_id: str, 
        input_hash: str
    ) -> Optional[Any]:
        """Get cached model prediction."""
        try:
            key = f"prediction:{model_id}:{input_hash}"
            data = await self.client.get(key)
            
            if not data:
                return None
            
            prediction_data = json.loads(data)
            return prediction_data.get('prediction')
            
        except Exception as e:
            logger.error(f"Failed to get cached prediction: {e}")
            return None
    
    # Model metadata caching
    async def cache_model_metadata(
        self, 
        model_id: str, 
        metadata: Dict[str, Any], 
        ttl: int = 3600
    ) -> bool:
        """Cache model metadata."""
        try:
            key = f"model_meta:{model_id}"
            
            metadata_with_ts = {
                **metadata,
                'cached_at': datetime.utcnow().isoformat(),
                'model_id': model_id
            }
            
            await self.client.setex(
                key, 
                ttl, 
                json.dumps(metadata_with_ts, default=str)
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache model metadata: {e}")
            return False
    
    async def get_model_metadata(self, model_id: str) -> Optional[Dict[str, Any]]:
        """Get cached model metadata."""
        try:
            key = f"model_meta:{model_id}"
            data = await self.client.get(key)
            
            if not data:
                return None
            
            return json.loads(data)
            
        except Exception as e:
            logger.error(f"Failed to get model metadata: {e}")
            return None
    
    # Training job status
    async def set_training_status(
        self, 
        job_id: str, 
        status: str, 
        progress: float = 0.0, 
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Set training job status."""
        try:
            key = f"training:{job_id}"
            
            status_data = {
                'job_id': job_id,
                'status': status,
                'progress': progress,
                'updated_at': datetime.utcnow().isoformat(),
                'metadata': metadata or {}
            }
            
            await self.client.setex(
                key, 
                86400,  # 24 hours
                json.dumps(status_data, default=str)
            )
            
            # Also publish to subscribers
            await self.client.publish(
                f"training_updates", 
                json.dumps(status_data, default=str)
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to set training status: {e}")
            return False
    
    async def get_training_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get training job status."""
        try:
            key = f"training:{job_id}"
            data = await self.client.get(key)
            
            if not data:
                return None
            
            return json.loads(data)
            
        except Exception as e:
            logger.error(f"Failed to get training status: {e}")
            return None
    
    # Batch operations
    async def cache_batch_features(
        self, 
        feature_batch: Dict[str, Dict[str, Any]], 
        ttl: int = None
    ) -> int:
        """Cache multiple feature sets in batch."""
        settings = get_settings()
        ttl = ttl or settings.FEATURE_CACHE_TTL
        
        success_count = 0
        
        async with self.client.pipeline() as pipe:
            for symbol, features in feature_batch.items():
                try:
                    key = f"features:{symbol}"
                    features_with_ts = {
                        **features,
                        'cached_at': datetime.utcnow().isoformat(),
                        'symbol': symbol
                    }
                    
                    pipe.setex(
                        key, 
                        ttl, 
                        json.dumps(features_with_ts, default=str)
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to prepare batch cache for {symbol}: {e}")
            
            try:
                await pipe.execute()
                logger.debug(f"Batch cached {success_count} feature sets")
            except Exception as e:
                logger.error(f"Failed to execute batch cache: {e}")
                success_count = 0
        
        return success_count
    
    async def get_batch_features(
        self, 
        symbols: List[str]
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """Get cached features for multiple symbols."""
        results = {}
        
        async with self.client.pipeline() as pipe:
            # Queue all get operations
            for symbol in symbols:
                pipe.get(f"features:{symbol}")
            
            try:
                # Execute all operations
                cached_data = await pipe.execute()
                
                # Parse results
                for i, symbol in enumerate(symbols):
                    data = cached_data[i]
                    if data:
                        try:
                            results[symbol] = json.loads(data)
                        except Exception as e:
                            logger.error(f"Failed to parse cached data for {symbol}: {e}")
                            results[symbol] = None
                    else:
                        results[symbol] = None
                        
            except Exception as e:
                logger.error(f"Failed to execute batch get: {e}")
                # Return empty results for all symbols
                results = {symbol: None for symbol in symbols}
        
        return results
    
    # Performance monitoring
    async def get_redis_stats(self) -> Dict[str, Any]:
        """Get Redis performance statistics."""
        try:
            info = await self.client.info()
            return {
                'connected_clients': info.get('connected_clients', 0),
                'used_memory': info.get('used_memory', 0),
                'used_memory_human': info.get('used_memory_human', '0B'),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'total_commands_processed': info.get('total_commands_processed', 0),
            }
        except Exception as e:
            logger.error(f"Failed to get Redis stats: {e}")
            return {}


# Global Redis manager instance
redis_manager: Optional[RedisManager] = None

def get_redis_manager() -> RedisManager:
    """Get Redis manager instance."""
    global redis_manager
    if redis_manager is None:
        redis_manager = RedisManager()
    return redis_manager