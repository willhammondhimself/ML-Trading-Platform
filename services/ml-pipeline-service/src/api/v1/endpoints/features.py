"""
Feature Engineering Endpoints for ML Pipeline Service

API endpoints for extracting, transforming, and managing trading features
from market data, technical indicators, and alternative data sources.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
import structlog

from ....core.exceptions import (
    FeatureEngineeringException,
    InvalidFeatureDataException,
    MissingMarketDataException
)
from ....core.metrics import track_feature_extraction, metrics_collector
from ....core.redis_client import get_redis_manager
from ....features.feature_engine import FeatureEngine
from ....features.technical_indicators import TechnicalIndicatorCalculator
from ....features.market_data_processor import MarketDataProcessor

logger = structlog.get_logger("features-api")
router = APIRouter()


# Request/Response Models
class FeatureExtractionRequest(BaseModel):
    """Request model for feature extraction."""
    symbol: str = Field(..., description="Trading symbol (e.g., AAPL, TSLA)")
    start_date: datetime = Field(..., description="Start date for data extraction")
    end_date: datetime = Field(..., description="End date for data extraction")
    feature_types: List[str] = Field(
        default=["price", "volume", "technical"],
        description="Types of features to extract"
    )
    indicators: List[str] = Field(
        default=["sma", "ema", "rsi", "macd"],
        description="Technical indicators to calculate"
    )
    lookback_periods: List[int] = Field(
        default=[5, 10, 20, 50],
        description="Lookback periods for indicators"
    )
    
    @validator("symbol")
    def validate_symbol(cls, v):
        if not v or not v.strip():
            raise ValueError("Symbol cannot be empty")
        return v.upper()
    
    @validator("end_date")
    def validate_date_range(cls, v, values):
        if "start_date" in values and v <= values["start_date"]:
            raise ValueError("End date must be after start date")
        return v
    
    @validator("feature_types")
    def validate_feature_types(cls, v):
        valid_types = ["price", "volume", "technical", "volatility", "momentum", "sentiment"]
        invalid_types = [t for t in v if t not in valid_types]
        if invalid_types:
            raise ValueError(f"Invalid feature types: {invalid_types}")
        return v


class BatchFeatureRequest(BaseModel):
    """Request model for batch feature extraction."""
    symbols: List[str] = Field(..., description="List of trading symbols")
    start_date: datetime = Field(..., description="Start date for data extraction")
    end_date: datetime = Field(..., description="End date for data extraction")
    feature_types: List[str] = Field(default=["price", "volume", "technical"])
    indicators: List[str] = Field(default=["sma", "ema", "rsi", "macd"])
    
    @validator("symbols")
    def validate_symbols(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one symbol is required")
        if len(v) > 100:
            raise ValueError("Maximum 100 symbols allowed per batch")
        return [s.upper() for s in v]


class FeatureResponse(BaseModel):
    """Response model for extracted features."""
    symbol: str
    features: Dict[str, Any]
    metadata: Dict[str, Any]
    extraction_time: datetime
    cache_hit: bool = False


class BatchFeatureResponse(BaseModel):
    """Response model for batch feature extraction."""
    results: List[FeatureResponse]
    summary: Dict[str, Any]
    extraction_time: datetime


# API Endpoints
@router.post("/extract", response_model=FeatureResponse)
@track_feature_extraction("single")
async def extract_features(
    request: FeatureExtractionRequest,
    background_tasks: BackgroundTasks,
    use_cache: bool = Query(True, description="Use cached features if available")
):
    """Extract features for a single symbol."""
    
    try:
        logger.info(
            "Feature extraction requested",
            symbol=request.symbol,
            start_date=request.start_date.isoformat(),
            end_date=request.end_date.isoformat(),
            feature_types=request.feature_types
        )
        
        redis_manager = get_redis_manager()
        
        # Check cache first if enabled
        cached_features = None
        if use_cache:
            cache_key = f"{request.symbol}_{request.start_date.date()}_{request.end_date.date()}"
            cached_features = await redis_manager.get_cached_features(
                cache_key,
                max_age_seconds=1800  # 30 minutes
            )
            
            if cached_features:
                metrics_collector.record_cache_hit(request.symbol, "features")
                logger.debug(f"Using cached features for {request.symbol}")
                
                return FeatureResponse(
                    symbol=request.symbol,
                    features=cached_features.get("features", {}),
                    metadata=cached_features.get("metadata", {}),
                    extraction_time=datetime.fromisoformat(cached_features.get("cached_at")),
                    cache_hit=True
                )
        
        if not cached_features:
            metrics_collector.record_cache_miss(request.symbol, "features")
        
        # Initialize feature engine
        feature_engine = FeatureEngine()
        
        # Extract features
        extraction_result = await feature_engine.extract_features(
            symbol=request.symbol,
            start_date=request.start_date,
            end_date=request.end_date,
            feature_types=request.feature_types,
            indicators=request.indicators,
            lookback_periods=request.lookback_periods
        )
        
        # Cache the results in background
        if use_cache:
            background_tasks.add_task(
                _cache_features_background,
                cache_key,
                extraction_result,
                redis_manager
            )
        
        return FeatureResponse(
            symbol=request.symbol,
            features=extraction_result["features"],
            metadata=extraction_result["metadata"],
            extraction_time=datetime.utcnow(),
            cache_hit=False
        )
        
    except MissingMarketDataException as e:
        logger.error(f"Missing market data for {request.symbol}: {e.detail}")
        raise HTTPException(status_code=422, detail=e.detail)
    
    except InvalidFeatureDataException as e:
        logger.error(f"Invalid feature data for {request.symbol}: {e.detail}")
        raise HTTPException(status_code=400, detail=e.detail)
    
    except FeatureEngineeringException as e:
        logger.error(f"Feature engineering failed for {request.symbol}: {e.detail}")
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    
    except Exception as e:
        logger.error(f"Unexpected error during feature extraction: {e}")
        raise HTTPException(status_code=500, detail="Feature extraction failed")


@router.post("/extract-batch", response_model=BatchFeatureResponse)
@track_feature_extraction("batch")
async def extract_features_batch(
    request: BatchFeatureRequest,
    background_tasks: BackgroundTasks,
    use_cache: bool = Query(True, description="Use cached features if available"),
    max_concurrent: int = Query(5, ge=1, le=20, description="Max concurrent extractions")
):
    """Extract features for multiple symbols in batch."""
    
    try:
        logger.info(
            "Batch feature extraction requested",
            symbols=request.symbols,
            symbol_count=len(request.symbols),
            start_date=request.start_date.isoformat(),
            end_date=request.end_date.isoformat()
        )
        
        feature_engine = FeatureEngine()
        
        # Process batch extraction
        batch_results = await feature_engine.extract_features_batch(
            symbols=request.symbols,
            start_date=request.start_date,
            end_date=request.end_date,
            feature_types=request.feature_types,
            indicators=request.indicators,
            use_cache=use_cache,
            max_concurrent=max_concurrent
        )
        
        # Prepare response
        results = []
        successful_extractions = 0
        failed_extractions = 0
        
        for symbol, result in batch_results.items():
            if "error" not in result:
                results.append(FeatureResponse(
                    symbol=symbol,
                    features=result["features"],
                    metadata=result["metadata"],
                    extraction_time=datetime.utcnow(),
                    cache_hit=result.get("cache_hit", False)
                ))
                successful_extractions += 1
            else:
                failed_extractions += 1
                logger.warning(f"Failed to extract features for {symbol}: {result['error']}")
        
        summary = {
            "total_symbols": len(request.symbols),
            "successful": successful_extractions,
            "failed": failed_extractions,
            "success_rate": round(successful_extractions / len(request.symbols) * 100, 2)
        }
        
        return BatchFeatureResponse(
            results=results,
            summary=summary,
            extraction_time=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Batch feature extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Batch feature extraction failed")


@router.get("/cached/{symbol}", response_model=Optional[FeatureResponse])
async def get_cached_features(
    symbol: str,
    max_age_minutes: int = Query(30, ge=1, le=1440, description="Maximum age in minutes")
):
    """Get cached features for a symbol."""
    
    try:
        redis_manager = get_redis_manager()
        
        cached_features = await redis_manager.get_cached_features(
            symbol.upper(),
            max_age_seconds=max_age_minutes * 60
        )
        
        if not cached_features:
            return None
        
        return FeatureResponse(
            symbol=symbol.upper(),
            features=cached_features.get("features", {}),
            metadata=cached_features.get("metadata", {}),
            extraction_time=datetime.fromisoformat(cached_features.get("cached_at")),
            cache_hit=True
        )
        
    except Exception as e:
        logger.error(f"Failed to get cached features for {symbol}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cached features")


@router.delete("/cache/{symbol}")
async def clear_cached_features(symbol: str):
    """Clear cached features for a symbol."""
    
    try:
        redis_manager = get_redis_manager()
        client = redis_manager.client
        
        # Delete all cache entries for this symbol
        pattern = f"features:{symbol.upper()}*"
        keys = await client.keys(pattern)
        
        if keys:
            await client.delete(*keys)
            deleted_count = len(keys)
        else:
            deleted_count = 0
        
        return {
            "symbol": symbol.upper(),
            "deleted_entries": deleted_count,
            "message": f"Cleared {deleted_count} cache entries for {symbol.upper()}"
        }
        
    except Exception as e:
        logger.error(f"Failed to clear cache for {symbol}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")


@router.get("/indicators", response_model=Dict[str, Any])
async def get_available_indicators():
    """Get list of available technical indicators."""
    
    try:
        calculator = TechnicalIndicatorCalculator()
        indicators = calculator.get_available_indicators()
        
        return {
            "indicators": indicators,
            "count": len(indicators),
            "categories": {
                "trend": ["sma", "ema", "wma", "tema"],
                "momentum": ["rsi", "stoch", "williams_r", "roc"],
                "volatility": ["atr", "bollinger", "keltner", "donchian"],
                "volume": ["obv", "vwap", "mfi", "ad_line"],
                "overlap": ["sma", "ema", "bollinger", "envelope"]
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get available indicators: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve indicators")


@router.get("/feature-types", response_model=Dict[str, Any])
async def get_feature_types():
    """Get list of available feature types."""
    
    return {
        "feature_types": [
            {
                "name": "price",
                "description": "Price-based features (OHLC, returns, gaps)",
                "examples": ["open", "high", "low", "close", "returns", "log_returns"]
            },
            {
                "name": "volume",
                "description": "Volume-based features and patterns",
                "examples": ["volume", "volume_ma", "volume_ratio", "vwap"]
            },
            {
                "name": "technical",
                "description": "Technical indicators and oscillators",
                "examples": ["rsi", "macd", "sma", "ema", "bollinger"]
            },
            {
                "name": "volatility",
                "description": "Volatility and risk measures",
                "examples": ["atr", "volatility", "garch", "std_dev"]
            },
            {
                "name": "momentum",
                "description": "Momentum and trend strength",
                "examples": ["momentum", "roc", "williams_r", "stoch"]
            },
            {
                "name": "sentiment",
                "description": "Market sentiment indicators",
                "examples": ["vix_ratio", "put_call", "news_sentiment"]
            }
        ]
    }


# Background task functions
async def _cache_features_background(
    cache_key: str, 
    extraction_result: Dict[str, Any],
    redis_manager
):
    """Background task to cache extracted features."""
    try:
        await redis_manager.cache_features(
            cache_key,
            {
                "features": extraction_result["features"],
                "metadata": extraction_result["metadata"]
            },
            ttl=1800  # 30 minutes
        )
        logger.debug(f"Features cached in background: {cache_key}")
    except Exception as e:
        logger.error(f"Failed to cache features in background: {e}")