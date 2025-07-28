"""
Model Inference Endpoints for ML Pipeline Service

API endpoints for real-time model predictions, batch inference,
and model serving management.
"""

from typing import Dict, Any, List, Optional, Union
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
import asyncio
import structlog

from ....core.exceptions import (
    ModelInferenceException,
    ModelNotFoundError,
    InvalidInputDataException
)
from ....core.metrics import track_inference_operation, metrics_collector
from ....inference.model_server import model_server, ModelStatus
from ....inference.prediction_cache import prediction_cache, CacheStrategy

logger = structlog.get_logger("inference-api")
router = APIRouter()


# Request/Response Models
class PredictionRequest(BaseModel):
    """Request model for single prediction."""
    model_name: str = Field(..., description="Name of the model to use")
    symbol: str = Field(..., description="Trading symbol (e.g., AAPL, TSLA)")
    input_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Input data (features will be extracted if not provided)"
    )
    return_feature_importance: bool = Field(
        default=False,
        description="Return feature importance scores"
    )
    use_cache: bool = Field(default=True, description="Use cached predictions if available")
    cache_strategy: CacheStrategy = Field(
        default=CacheStrategy.ADAPTIVE,
        description="Caching strategy"
    )
    
    @validator("symbol")
    def validate_symbol(cls, v):
        if not v or not v.strip():
            raise ValueError("Symbol cannot be empty")
        return v.upper()


class BatchPredictionRequest(BaseModel):
    """Request model for batch predictions."""
    model_name: str = Field(..., description="Name of the model to use")
    requests: List[Dict[str, Any]] = Field(..., description="List of prediction requests")
    max_concurrent: int = Field(default=10, ge=1, le=50, description="Max concurrent predictions")
    use_cache: bool = Field(default=True, description="Use cached predictions if available")
    
    @validator("requests")
    def validate_requests(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one request is required")
        if len(v) > 100:
            raise ValueError("Maximum 100 requests allowed per batch")
        
        # Validate each request has required fields
        for i, req in enumerate(v):
            if "symbol" not in req:
                raise ValueError(f"Request {i} missing 'symbol' field")
            req["symbol"] = req["symbol"].upper()
        
        return v


class ModelLoadRequest(BaseModel):
    """Request model for loading a model."""
    model_name: str = Field(..., description="Name of the model to load")
    model_path: Optional[str] = Field(default=None, description="Specific model path")
    force_reload: bool = Field(default=False, description="Force reload if already loaded")


class PredictionResponse(BaseModel):
    """Response model for predictions."""
    request_id: str
    model_name: str
    symbol: str
    prediction: Union[float, List[float], Dict[str, Any]]
    confidence: Optional[float] = None
    feature_importance: Optional[Dict[str, float]] = None
    processing_time_ms: float
    timestamp: datetime
    model_version: str
    cache_hit: bool = False


class BatchPredictionResponse(BaseModel):
    """Response model for batch predictions."""
    predictions: List[PredictionResponse]
    summary: Dict[str, Any]
    processing_time_ms: float
    timestamp: datetime


class ModelInfoResponse(BaseModel):
    """Response model for model information."""
    model_name: str
    model_type: str
    version: str
    status: ModelStatus
    feature_count: int
    feature_names: List[str]
    loaded_at: datetime
    prediction_count: int
    last_prediction: Optional[datetime] = None
    error_message: Optional[str] = None


# API Endpoints
@router.post("/predict", response_model=PredictionResponse)
@track_inference_operation("single_prediction")
async def predict(request: PredictionRequest):
    """Make a single prediction."""
    
    try:
        logger.info(
            "Prediction requested",
            model_name=request.model_name,
            symbol=request.symbol,
            use_cache=request.use_cache
        )
        
        # Check cache first if enabled
        if request.use_cache:
            cached_prediction = await prediction_cache.get_prediction(
                model_name=request.model_name,
                symbol=request.symbol,
                input_data=request.input_data or {},
                strategy=request.cache_strategy
            )
            
            if cached_prediction:
                return PredictionResponse(
                    request_id=cached_prediction.get("request_id", f"cached_{int(datetime.utcnow().timestamp())}"),
                    model_name=request.model_name,
                    symbol=request.symbol,
                    prediction=cached_prediction["prediction"],
                    confidence=cached_prediction.get("confidence"),
                    feature_importance=cached_prediction.get("feature_importance"),
                    processing_time_ms=cached_prediction["processing_time_ms"],
                    timestamp=datetime.fromisoformat(cached_prediction["timestamp"]),
                    model_version=cached_prediction["model_version"],
                    cache_hit=True
                )
        
        # Make prediction
        prediction_response = await model_server.predict(
            model_name=request.model_name,
            symbol=request.symbol,
            input_data=request.input_data,
            return_feature_importance=request.return_feature_importance
        )
        
        # Cache the prediction if caching is enabled
        if request.use_cache:
            await prediction_cache.cache_prediction(
                model_name=request.model_name,
                symbol=request.symbol,
                input_data=request.input_data or {},
                prediction_response=prediction_response.__dict__,
                strategy=request.cache_strategy
            )
        
        return PredictionResponse(
            request_id=prediction_response.request_id,
            model_name=request.model_name,
            symbol=request.symbol,
            prediction=prediction_response.prediction,
            confidence=prediction_response.confidence,
            feature_importance=prediction_response.feature_importance,
            processing_time_ms=prediction_response.processing_time_ms,
            timestamp=prediction_response.timestamp,
            model_version=prediction_response.model_version,
            cache_hit=False
        )
        
    except ModelNotFoundError as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except InvalidInputDataException as e:
        logger.error(f"Invalid input data: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except ModelInferenceException as e:
        logger.error(f"Inference failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during prediction: {e}")
        raise HTTPException(status_code=500, detail="Prediction failed")


@router.post("/predict-batch", response_model=BatchPredictionResponse)
@track_inference_operation("batch_prediction")
async def predict_batch(request: BatchPredictionRequest):
    """Make batch predictions."""
    
    start_time = datetime.utcnow()
    
    try:
        logger.info(
            "Batch prediction requested",
            model_name=request.model_name,
            batch_size=len(request.requests),
            max_concurrent=request.max_concurrent
        )
        
        # Process batch predictions
        predictions = await model_server.predict_batch(
            model_name=request.model_name,
            batch_requests=request.requests,
            max_concurrent=request.max_concurrent
        )
        
        # Convert to response format
        prediction_responses = []
        for pred in predictions:
            if pred:  # Filter out None results from failed predictions
                prediction_responses.append(PredictionResponse(
                    request_id=pred.request_id,
                    model_name=request.model_name,
                    symbol=pred.request_id.split("_")[0] if "_" in pred.request_id else "unknown",  # Extract symbol from request_id
                    prediction=pred.prediction,
                    confidence=pred.confidence,
                    feature_importance=pred.feature_importance,
                    processing_time_ms=pred.processing_time_ms,
                    timestamp=pred.timestamp,
                    model_version=pred.model_version,
                    cache_hit=False
                ))
        
        # Calculate processing time
        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Create summary
        summary = {
            "total_requests": len(request.requests),
            "successful_predictions": len(prediction_responses),
            "failed_predictions": len(request.requests) - len(prediction_responses),
            "success_rate": len(prediction_responses) / len(request.requests) * 100,
            "avg_processing_time_ms": sum(p.processing_time_ms for p in prediction_responses) / len(prediction_responses) if prediction_responses else 0
        }
        
        return BatchPredictionResponse(
            predictions=prediction_responses,
            summary=summary,
            processing_time_ms=processing_time,
            timestamp=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Batch prediction failed: {e}")
        raise HTTPException(status_code=500, detail="Batch prediction failed")


@router.post("/models/load")
async def load_model(request: ModelLoadRequest):
    """Load a model for serving."""
    
    try:
        logger.info(f"Loading model: {request.model_name}")
        
        metadata = await model_server.load_model(
            model_name=request.model_name,
            model_path=request.model_path,
            force_reload=request.force_reload
        )
        
        return {
            "message": f"Model '{request.model_name}' loaded successfully",
            "model_name": metadata.model_name,
            "model_type": metadata.model_type,
            "version": metadata.version,
            "feature_count": len(metadata.feature_names),
            "status": metadata.status,
            "loaded_at": metadata.loaded_at
        }
        
    except ModelNotFoundError as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except Exception as e:
        logger.error(f"Model loading failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.delete("/models/{model_name}")
async def unload_model(model_name: str):
    """Unload a model from serving."""
    
    try:
        success = await model_server.unload_model(model_name)
        
        if success:
            return {
                "message": f"Model '{model_name}' unloaded successfully",
                "unloaded_at": datetime.utcnow()
            }
        else:
            raise HTTPException(status_code=404, detail="Model not found or not loaded")
    
    except Exception as e:
        logger.error(f"Model unloading failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to unload model")


@router.get("/models", response_model=List[ModelInfoResponse])
async def list_loaded_models():
    """List all loaded models."""
    
    try:
        models_info = await model_server.list_loaded_models()
        
        return [
            ModelInfoResponse(
                model_name=info["model_name"],
                model_type=info["model_type"],
                version=info["version"],
                status=ModelStatus(info["status"]),
                feature_count=info["feature_count"],
                feature_names=info["feature_names"],
                loaded_at=datetime.fromisoformat(info["loaded_at"]),
                prediction_count=info["prediction_count"],
                last_prediction=datetime.fromisoformat(info["last_prediction"]) if info["last_prediction"] else None,
                error_message=info["error_message"]
            )
            for info in models_info
        ]
        
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=500, detail="Failed to list models")


@router.get("/models/{model_name}", response_model=ModelInfoResponse)
async def get_model_info(model_name: str):
    """Get information about a specific model."""
    
    try:
        model_info = await model_server.get_model_info(model_name)
        
        if not model_info:
            raise HTTPException(status_code=404, detail="Model not found")
        
        return ModelInfoResponse(
            model_name=model_info["model_name"],
            model_type=model_info["model_type"],
            version=model_info["version"],
            status=ModelStatus(model_info["status"]),
            feature_count=model_info["feature_count"],
            feature_names=model_info["feature_names"],
            loaded_at=datetime.fromisoformat(model_info["loaded_at"]),
            prediction_count=model_info["prediction_count"],
            last_prediction=datetime.fromisoformat(model_info["last_prediction"]) if model_info["last_prediction"] else None,
            error_message=model_info["error_message"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get model info: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve model information")


@router.delete("/cache")
async def clear_prediction_cache(
    model_name: Optional[str] = Query(None, description="Specific model to clear cache for"),
    symbol: Optional[str] = Query(None, description="Specific symbol to clear cache for")
):
    """Clear prediction cache."""
    
    try:
        invalidated_count = await prediction_cache.invalidate_predictions(
            model_name=model_name,
            symbol=symbol
        )
        
        return {
            "message": f"Cleared {invalidated_count} cached predictions",
            "invalidated_count": invalidated_count,
            "cleared_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Cache clearing failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")


@router.post("/cache/warm")
async def warm_prediction_cache(
    background_tasks: BackgroundTasks,
    symbols: List[str] = Query(..., description="Symbols to warm cache for"),
    model_names: List[str] = Query(..., description="Models to warm cache for"),
    concurrent_limit: int = Query(5, ge=1, le=20, description="Concurrent warmup limit")
):
    """Warm prediction cache with popular symbols."""
    
    try:
        logger.info(f"Starting cache warmup for {len(symbols)} symbols, {len(model_names)} models")
        
        # Define warmup prediction function
        async def warmup_prediction(model_name: str, symbol: str):
            try:
                await model_server.predict(
                    model_name=model_name,
                    symbol=symbol
                )
            except Exception as e:
                logger.warning(f"Warmup prediction failed for {model_name}:{symbol}: {e}")
        
        # Start warmup in background
        background_tasks.add_task(
            prediction_cache.warm_cache,
            symbols=symbols,
            model_names=model_names,
            prediction_func=warmup_prediction,
            concurrent_limit=concurrent_limit
        )
        
        return {
            "message": "Cache warmup started",
            "symbols_count": len(symbols),
            "models_count": len(model_names),
            "total_combinations": len(symbols) * len(model_names),
            "started_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Cache warmup failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start cache warmup")


@router.get("/cache/stats")
async def get_cache_statistics():
    """Get prediction cache statistics."""
    
    try:
        stats = await prediction_cache.get_cache_statistics()
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get cache statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache statistics")


@router.get("/health")
async def get_inference_health():
    """Get inference service health status."""
    
    try:
        health_info = await model_server.health_check()
        
        # Add cache health
        cache_stats = await prediction_cache.get_cache_statistics()
        health_info["cache"] = {
            "cached_predictions": cache_stats.get("cached_predictions", 0),
            "hit_rate": cache_stats.get("hit_rate", 0),
            "memory_usage_mb": cache_stats.get("memory_usage_mb", 0)
        }
        
        return health_info
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")


@router.get("/metrics")
async def get_inference_metrics():
    """Get inference service metrics."""
    
    try:
        # Get model server health
        server_health = await model_server.health_check()
        
        # Get cache statistics
        cache_stats = await prediction_cache.get_cache_statistics()
        
        return {
            "server_metrics": server_health,
            "cache_metrics": cache_stats,
            "timestamp": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")