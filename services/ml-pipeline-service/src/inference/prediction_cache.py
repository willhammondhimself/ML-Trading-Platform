"""
Prediction Cache System

Intelligent caching system for model predictions with TTL, invalidation,
and cache warming strategies for high-frequency trading scenarios.
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import asyncio
import json
import hashlib
from enum import Enum
import structlog

from ..core.redis_client import get_redis_manager
from ..core.exceptions import ModelInferenceException
from ..config.settings import get_settings

logger = structlog.get_logger("prediction-cache")


class CacheStrategy(str, Enum):
    """Cache invalidation strategies."""
    TTL_ONLY = "ttl_only"
    MARKET_HOURS = "market_hours"  
    PRICE_CHANGE = "price_change"
    VOLUME_SPIKE = "volume_spike"
    ADAPTIVE = "adaptive"


class PredictionCache:
    """Intelligent prediction caching system."""
    
    def __init__(self):
        self.settings = get_settings()
        self.redis_manager = get_redis_manager()
        
        # Cache configuration
        self.cache_config = {
            "default_ttl": 300,  # 5 minutes
            "max_ttl": 3600,     # 1 hour
            "min_ttl": 30,       # 30 seconds
            "cache_key_prefix": "prediction:",
            "warmup_key_prefix": "warmup:",
            "stats_key_prefix": "cache_stats:"
        }
        
        # Cache strategies configuration
        self.strategy_config = {
            CacheStrategy.TTL_ONLY: {"ttl": 300},
            CacheStrategy.MARKET_HOURS: {"market_ttl": 60, "after_hours_ttl": 600},
            CacheStrategy.PRICE_CHANGE: {"price_threshold": 0.02, "base_ttl": 300},
            CacheStrategy.VOLUME_SPIKE: {"volume_threshold": 2.0, "base_ttl": 300},
            CacheStrategy.ADAPTIVE: {"base_ttl": 300, "min_ttl": 30, "max_ttl": 1800}
        }
        
        # Cache statistics
        self.stats = {
            "hits": 0,
            "misses": 0,
            "invalidations": 0,
            "warmups": 0
        }
    
    async def get_prediction(
        self,
        model_name: str,
        symbol: str,
        input_data: Dict[str, Any],
        strategy: CacheStrategy = CacheStrategy.ADAPTIVE
    ) -> Optional[Dict[str, Any]]:
        """Get prediction from cache if valid."""
        
        try:
            # Generate cache key
            cache_key = self._generate_cache_key(model_name, symbol, input_data)
            
            # Check cache
            cached_data = await self.redis_manager.get_cached_features(cache_key)
            
            if not cached_data:
                await self._record_cache_miss(model_name, symbol)
                return None
            
            # Validate cached prediction
            if await self._is_cache_valid(cached_data, strategy, symbol):
                await self._record_cache_hit(model_name, symbol)
                logger.debug(f"Cache hit for {model_name}:{symbol}")
                return cached_data
            else:
                # Cache expired or invalidated
                await self._invalidate_cache_key(cache_key)
                await self._record_cache_miss(model_name, symbol)
                logger.debug(f"Cache invalidated for {model_name}:{symbol}")
                return None
                
        except Exception as e:
            logger.error(f"Cache retrieval failed: {e}")
            return None
    
    async def cache_prediction(
        self,
        model_name: str,
        symbol: str,
        input_data: Dict[str, Any],
        prediction_response: Dict[str, Any],
        strategy: CacheStrategy = CacheStrategy.ADAPTIVE,
        custom_ttl: Optional[int] = None
    ) -> bool:
        """Cache a prediction with intelligent TTL."""
        
        try:
            # Generate cache key
            cache_key = self._generate_cache_key(model_name, symbol, input_data)
            
            # Calculate TTL based on strategy
            ttl = custom_ttl or await self._calculate_ttl(strategy, symbol, prediction_response)
            
            # Prepare cache data
            cache_data = {
                **prediction_response,
                "cached_at": datetime.utcnow().isoformat(),
                "cache_strategy": strategy,
                "ttl": ttl,
                "model_name": model_name,
                "symbol": symbol
            }
            
            # Store in cache
            success = await self.redis_manager.cache_features(
                cache_key,
                cache_data,
                ttl=ttl
            )
            
            if success:
                logger.debug(f"Prediction cached: {model_name}:{symbol} (TTL: {ttl}s)")
                await self._update_cache_stats("cached", model_name, symbol)
            
            return success
            
        except Exception as e:
            logger.error(f"Cache storage failed: {e}")
            return False
    
    async def invalidate_predictions(
        self,
        model_name: Optional[str] = None,
        symbol: Optional[str] = None,
        pattern: Optional[str] = None
    ) -> int:
        """Invalidate cached predictions."""
        
        try:
            if pattern:
                # Use provided pattern
                search_pattern = f"{self.cache_config['cache_key_prefix']}{pattern}"
            elif model_name and symbol:
                # Specific model and symbol
                search_pattern = f"{self.cache_config['cache_key_prefix']}{model_name}:{symbol}:*"
            elif model_name:
                # All predictions for a model
                search_pattern = f"{self.cache_config['cache_key_prefix']}{model_name}:*"
            elif symbol:
                # All predictions for a symbol
                search_pattern = f"{self.cache_config['cache_key_prefix']}*:{symbol}:*"
            else:
                # All predictions
                search_pattern = f"{self.cache_config['cache_key_prefix']}*"
            
            # Find matching keys
            client = self.redis_manager.client
            keys = await client.keys(search_pattern)
            
            if keys:
                # Delete keys
                await client.delete(*keys)
                await self._update_cache_stats("invalidated", model_name, symbol, len(keys))
                
                logger.info(f"Invalidated {len(keys)} cached predictions")
                return len(keys)
            
            return 0
            
        except Exception as e:
            logger.error(f"Cache invalidation failed: {e}")
            return 0
    
    async def warm_cache(
        self,
        symbols: List[str],
        model_names: List[str],
        prediction_func: callable,
        concurrent_limit: int = 5
    ) -> Dict[str, Any]:
        """Warm cache with predictions for popular symbols."""
        
        try:
            logger.info(
                f"Starting cache warmup",
                symbols=len(symbols),
                models=len(model_names)
            )
            
            # Create semaphore for concurrency control
            semaphore = asyncio.Semaphore(concurrent_limit)
            
            async def warm_single_prediction(model_name: str, symbol: str):
                async with semaphore:
                    try:
                        # Make prediction (this will cache it automatically)
                        await prediction_func(model_name=model_name, symbol=symbol)
                        return True
                    except Exception as e:
                        logger.warning(f"Cache warmup failed for {model_name}:{symbol}: {e}")
                        return False
            
            # Create warmup tasks
            tasks = []
            for model_name in model_names:
                for symbol in symbols:
                    task = warm_single_prediction(model_name, symbol)
                    tasks.append(task)
            
            # Execute warmup
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Count successes
            successful_warmups = sum(1 for r in results if r is True)
            
            warmup_stats = {
                "total_attempts": len(tasks),
                "successful": successful_warmups,
                "failed": len(tasks) - successful_warmups,
                "success_rate": successful_warmups / len(tasks) if tasks else 0
            }
            
            await self._update_cache_stats("warmup", stats=warmup_stats)
            
            logger.info(
                f"Cache warmup completed",
                successful=successful_warmups,
                total=len(tasks)
            )
            
            return warmup_stats
            
        except Exception as e:
            logger.error(f"Cache warmup failed: {e}")
            return {"error": str(e)}
    
    async def get_cache_statistics(self) -> Dict[str, Any]:
        """Get cache performance statistics."""
        
        try:
            # Get Redis cache info
            client = self.redis_manager.client
            info = await client.info("memory")
            
            # Count cached predictions
            pattern = f"{self.cache_config['cache_key_prefix']}*"
            keys = await client.keys(pattern)
            cached_predictions = len(keys)
            
            # Calculate hit rate
            total_requests = self.stats["hits"] + self.stats["misses"]
            hit_rate = self.stats["hits"] / total_requests if total_requests > 0 else 0
            
            return {
                "cached_predictions": cached_predictions,
                "cache_hits": self.stats["hits"],
                "cache_misses": self.stats["misses"],
                "hit_rate": round(hit_rate * 100, 2),
                "invalidations": self.stats["invalidations"],
                "warmups": self.stats["warmups"],
                "memory_usage_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
                "max_memory_mb": round(info.get("maxmemory", 0) / 1024 / 1024, 2)
            }
            
        except Exception as e:
            logger.error(f"Failed to get cache statistics: {e}")
            return {"error": str(e)}
    
    def _generate_cache_key(
        self,
        model_name: str,
        symbol: str,
        input_data: Dict[str, Any]
    ) -> str:
        """Generate a unique cache key for prediction parameters."""
        
        # Create deterministic hash of input data
        input_str = json.dumps(input_data, sort_keys=True)
        input_hash = hashlib.md5(input_str.encode()).hexdigest()[:8]
        
        return f"{self.cache_config['cache_key_prefix']}{model_name}:{symbol}:{input_hash}"
    
    async def _is_cache_valid(
        self,
        cached_data: Dict[str, Any],
        strategy: CacheStrategy,
        symbol: str
    ) -> bool:
        """Check if cached prediction is still valid."""
        
        try:
            cached_at = datetime.fromisoformat(cached_data.get("cached_at"))
            age_seconds = (datetime.utcnow() - cached_at).total_seconds()
            
            if strategy == CacheStrategy.TTL_ONLY:
                # Simple TTL validation
                ttl = cached_data.get("ttl", self.cache_config["default_ttl"])
                return age_seconds < ttl
            
            elif strategy == CacheStrategy.MARKET_HOURS:
                # Different TTLs for market hours vs after hours
                is_market_hours = await self._is_market_hours()
                config = self.strategy_config[CacheStrategy.MARKET_HOURS]
                ttl = config["market_ttl"] if is_market_hours else config["after_hours_ttl"]
                return age_seconds < ttl
            
            elif strategy == CacheStrategy.PRICE_CHANGE:
                # Invalidate if significant price movement
                price_change = await self._get_price_change_since_cache(symbol, cached_at)
                config = self.strategy_config[CacheStrategy.PRICE_CHANGE]
                
                if abs(price_change) > config["price_threshold"]:
                    return False
                
                return age_seconds < config["base_ttl"]
            
            elif strategy == CacheStrategy.ADAPTIVE:
                # Adaptive TTL based on market volatility and model confidence
                adaptive_ttl = await self._calculate_adaptive_ttl(cached_data, symbol)
                return age_seconds < adaptive_ttl
            
            else:
                # Default TTL validation
                ttl = cached_data.get("ttl", self.cache_config["default_ttl"])
                return age_seconds < ttl
                
        except Exception as e:
            logger.error(f"Cache validation failed: {e}")
            return False
    
    async def _calculate_ttl(
        self,
        strategy: CacheStrategy,
        symbol: str,
        prediction_response: Dict[str, Any]
    ) -> int:
        """Calculate TTL based on caching strategy."""
        
        try:
            if strategy == CacheStrategy.TTL_ONLY:
                return self.strategy_config[CacheStrategy.TTL_ONLY]["ttl"]
            
            elif strategy == CacheStrategy.MARKET_HOURS:
                is_market_hours = await self._is_market_hours()
                config = self.strategy_config[CacheStrategy.MARKET_HOURS]
                return config["market_ttl"] if is_market_hours else config["after_hours_ttl"]
            
            elif strategy == CacheStrategy.ADAPTIVE:
                return await self._calculate_adaptive_ttl(prediction_response, symbol)
            
            else:
                return self.cache_config["default_ttl"]
                
        except Exception as e:
            logger.error(f"TTL calculation failed: {e}")
            return self.cache_config["default_ttl"]
    
    async def _calculate_adaptive_ttl(
        self,
        prediction_data: Dict[str, Any],
        symbol: str
    ) -> int:
        """Calculate adaptive TTL based on prediction confidence and market conditions."""
        
        try:
            config = self.strategy_config[CacheStrategy.ADAPTIVE]
            base_ttl = config["base_ttl"]
            min_ttl = config["min_ttl"]
            max_ttl = config["max_ttl"]
            
            # Start with base TTL
            adaptive_ttl = base_ttl
            
            # Adjust based on prediction confidence
            confidence = prediction_data.get("confidence")
            if confidence is not None:
                # Higher confidence = longer TTL
                confidence_multiplier = 0.5 + confidence  # 0.5 to 1.5 range
                adaptive_ttl = int(base_ttl * confidence_multiplier)
            
            # Adjust based on market volatility (simplified)
            volatility_factor = await self._get_market_volatility_factor(symbol)
            if volatility_factor > 1.5:  # High volatility
                adaptive_ttl = int(adaptive_ttl * 0.5)  # Shorter TTL
            elif volatility_factor < 0.7:  # Low volatility
                adaptive_ttl = int(adaptive_ttl * 1.5)  # Longer TTL
            
            # Enforce bounds
            adaptive_ttl = max(min_ttl, min(adaptive_ttl, max_ttl))
            
            return adaptive_ttl
            
        except Exception as e:
            logger.error(f"Adaptive TTL calculation failed: {e}")
            return self.cache_config["default_ttl"]
    
    async def _is_market_hours(self) -> bool:
        """Check if current time is during market hours."""
        
        try:
            import pytz
            
            # US market hours (9:30 AM - 4:00 PM ET, Monday-Friday)
            et = pytz.timezone('US/Eastern')
            now_et = datetime.now(et)
            
            # Check if weekday
            if now_et.weekday() >= 5:  # Saturday = 5, Sunday = 6
                return False
            
            # Check time range
            market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
            market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
            
            return market_open <= now_et <= market_close
            
        except Exception as e:
            logger.error(f"Market hours check failed: {e}")
            return True  # Assume market hours if check fails
    
    async def _get_price_change_since_cache(
        self,
        symbol: str,
        cached_at: datetime
    ) -> float:
        """Get price change percentage since cache time."""
        
        try:
            # This would typically fetch real-time price data
            # For now, return 0 (no change detected)
            # In production, integrate with market data service
            return 0.0
            
        except Exception as e:
            logger.error(f"Price change calculation failed: {e}")
            return 0.0
    
    async def _get_market_volatility_factor(self, symbol: str) -> float:
        """Get market volatility factor for adaptive TTL."""
        
        try:
            # This would typically calculate recent volatility
            # For now, return 1.0 (normal volatility)
            # In production, integrate with market data service
            return 1.0
            
        except Exception as e:
            logger.error(f"Volatility factor calculation failed: {e}")
            return 1.0
    
    async def _invalidate_cache_key(self, cache_key: str) -> bool:
        """Invalidate a specific cache key."""
        
        try:
            client = self.redis_manager.client
            result = await client.delete(cache_key)
            return result > 0
            
        except Exception as e:
            logger.error(f"Cache key invalidation failed: {e}")
            return False
    
    async def _record_cache_hit(self, model_name: str, symbol: str):
        """Record cache hit statistics."""
        self.stats["hits"] += 1
    
    async def _record_cache_miss(self, model_name: str, symbol: str):
        """Record cache miss statistics."""
        self.stats["misses"] += 1
    
    async def _update_cache_stats(
        self,
        operation: str,
        model_name: Optional[str] = None,
        symbol: Optional[str] = None,
        count: int = 1,
        stats: Optional[Dict[str, Any]] = None
    ):
        """Update cache operation statistics."""
        
        try:
            if operation == "cached":
                pass  # Already handled in cache_prediction
            elif operation == "invalidated":
                self.stats["invalidations"] += count
            elif operation == "warmup":
                if stats:
                    self.stats["warmups"] += stats.get("successful", 0)
            
        except Exception as e:
            logger.error(f"Stats update failed: {e}")


# Global prediction cache instance
prediction_cache = PredictionCache()