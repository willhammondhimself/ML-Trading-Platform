"""
Model Inference Server

High-performance model serving infrastructure for real-time trading predictions.
Supports model loading, caching, batching, and concurrent prediction serving.
"""

from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime, timedelta
import asyncio
import pickle
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
from dataclasses import dataclass
from enum import Enum
import structlog

from ..core.exceptions import (
    ModelInferenceException,
    ModelNotFoundError,
    InvalidInputDataException
)
from ..core.redis_client import get_redis_manager
from ..core.metrics import track_inference_operation, metrics_collector
from ..config.settings import get_settings
from ..features.feature_engine import FeatureEngine

logger = structlog.get_logger("model-server")


class ModelStatus(str, Enum):
    """Model serving status."""
    LOADING = "loading"
    READY = "ready"
    ERROR = "error"
    UNLOADED = "unloaded"


@dataclass
class ModelMetadata:
    """Model metadata for serving."""
    model_name: str
    model_type: str
    model_path: str
    version: str
    feature_names: List[str]
    loaded_at: datetime
    status: ModelStatus
    prediction_count: int = 0
    last_prediction: Optional[datetime] = None
    error_message: Optional[str] = None


@dataclass
class PredictionRequest:
    """Prediction request data structure."""
    model_name: str
    input_data: Dict[str, Any]
    request_id: str
    timestamp: datetime
    features_provided: bool = False


@dataclass
class PredictionResponse:
    """Prediction response data structure."""
    request_id: str
    model_name: str
    prediction: Union[float, List[float], Dict[str, Any]]
    confidence: Optional[float]
    feature_importance: Optional[Dict[str, float]]
    processing_time_ms: float
    timestamp: datetime
    model_version: str


class ModelServer:
    """High-performance model serving engine."""
    
    def __init__(self):
        self.settings = get_settings()
        self.redis_manager = get_redis_manager()
        self.feature_engine = FeatureEngine()
        
        # Model registry and cache
        self.loaded_models: Dict[str, Dict[str, Any]] = {}
        self.model_metadata: Dict[str, ModelMetadata] = {}
        
        # Thread pool for CPU-intensive operations
        self.thread_pool = ThreadPoolExecutor(max_workers=8)
        
        # Model loading lock
        self._loading_locks: Dict[str, asyncio.Lock] = {}
        
        # Prediction batching
        self.batch_config = {
            "max_batch_size": 50,
            "batch_timeout_ms": 100,
            "enable_batching": True
        }
        
        # Pending predictions for batching
        self.pending_predictions: Dict[str, List[PredictionRequest]] = {}
        self.batch_timers: Dict[str, asyncio.Task] = {}
        
        # Models directory
        self.models_dir = Path("models")
    
    async def load_model(
        self, 
        model_name: str, 
        model_path: Optional[str] = None,
        force_reload: bool = False
    ) -> ModelMetadata:
        """Load a model for serving."""
        
        # Check if already loaded and not forcing reload
        if model_name in self.loaded_models and not force_reload:
            metadata = self.model_metadata.get(model_name)
            if metadata and metadata.status == ModelStatus.READY:
                logger.debug(f"Model {model_name} already loaded")
                return metadata
        
        # Get or create loading lock
        if model_name not in self._loading_locks:
            self._loading_locks[model_name] = asyncio.Lock()
        
        async with self._loading_locks[model_name]:
            try:
                logger.info(f"Loading model: {model_name}")
                
                # Update status to loading
                if model_name in self.model_metadata:
                    self.model_metadata[model_name].status = ModelStatus.LOADING
                
                # Find model path if not provided
                if not model_path:
                    model_path = await self._find_latest_model_path(model_name)
                
                if not model_path or not Path(model_path).exists():
                    raise ModelNotFoundError(f"Model file not found: {model_path}")
                
                # Load model in thread pool
                model_data = await asyncio.get_event_loop().run_in_executor(
                    self.thread_pool,
                    self._load_model_from_disk,
                    model_path
                )
                
                # Create metadata
                metadata = ModelMetadata(
                    model_name=model_name,
                    model_type=model_data.get("model_config", {}).get("model_type", "unknown"),
                    model_path=model_path,
                    version=model_data.get("training_id", "unknown"),
                    feature_names=model_data.get("feature_names", []),
                    loaded_at=datetime.utcnow(),
                    status=ModelStatus.READY
                )
                
                # Store in registry
                self.loaded_models[model_name] = model_data
                self.model_metadata[model_name] = metadata
                
                # Cache metadata
                await self._cache_model_metadata(model_name, metadata)
                
                logger.info(
                    f"Model loaded successfully: {model_name}",
                    model_type=metadata.model_type,
                    feature_count=len(metadata.feature_names)
                )
                
                return metadata
                
            except Exception as e:
                error_msg = f"Failed to load model {model_name}: {str(e)}"
                logger.error(error_msg)
                
                # Update metadata with error
                if model_name in self.model_metadata:
                    self.model_metadata[model_name].status = ModelStatus.ERROR
                    self.model_metadata[model_name].error_message = error_msg
                
                raise ModelInferenceException(error_msg)
    
    async def unload_model(self, model_name: str) -> bool:
        """Unload a model from memory."""
        
        try:
            if model_name in self.loaded_models:
                del self.loaded_models[model_name]
                
                if model_name in self.model_metadata:
                    self.model_metadata[model_name].status = ModelStatus.UNLOADED
                
                # Cancel any pending batch processing
                if model_name in self.batch_timers:
                    self.batch_timers[model_name].cancel()
                    del self.batch_timers[model_name]
                
                if model_name in self.pending_predictions:
                    del self.pending_predictions[model_name]
                
                logger.info(f"Model unloaded: {model_name}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to unload model {model_name}: {e}")
            return False
    
    @track_inference_operation("single_prediction")
    async def predict(
        self,
        model_name: str,
        symbol: str,
        input_data: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        return_feature_importance: bool = False
    ) -> PredictionResponse:
        """Make a single prediction."""
        
        start_time = datetime.utcnow()
        request_id = request_id or f"pred_{int(start_time.timestamp() * 1000)}"
        
        try:
            # Ensure model is loaded
            if model_name not in self.loaded_models:
                await self.load_model(model_name)
            
            model_data = self.loaded_models[model_name]
            metadata = self.model_metadata[model_name]
            
            if metadata.status != ModelStatus.READY:
                raise ModelInferenceException(f"Model {model_name} is not ready: {metadata.status}")
            
            # Prepare features
            features = await self._prepare_features_for_prediction(
                symbol=symbol,
                input_data=input_data,
                required_features=metadata.feature_names,
                model_name=model_name
            )
            
            # Make prediction
            prediction_result = await self._make_single_prediction(
                model_data=model_data,
                features=features,
                return_feature_importance=return_feature_importance
            )
            
            # Update metadata
            metadata.prediction_count += 1
            metadata.last_prediction = datetime.utcnow()
            
            # Calculate processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Create response
            response = PredictionResponse(
                request_id=request_id,
                model_name=model_name,
                prediction=prediction_result["prediction"],
                confidence=prediction_result.get("confidence"),
                feature_importance=prediction_result.get("feature_importance") if return_feature_importance else None,
                processing_time_ms=processing_time,
                timestamp=datetime.utcnow(),
                model_version=metadata.version
            )
            
            # Record metrics
            metrics_collector.record_prediction(
                model_name=model_name,
                processing_time_ms=processing_time,
                success=True
            )
            
            logger.debug(
                f"Prediction completed",
                model_name=model_name,
                request_id=request_id,
                processing_time_ms=processing_time
            )
            
            return response
            
        except Exception as e:
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Record error metrics
            metrics_collector.record_prediction(
                model_name=model_name,
                processing_time_ms=processing_time,
                success=False
            )
            
            logger.error(f"Prediction failed: {e}", model_name=model_name, request_id=request_id)
            raise ModelInferenceException(f"Prediction failed: {str(e)}")
    
    @track_inference_operation("batch_prediction")
    async def predict_batch(
        self,
        model_name: str,
        batch_requests: List[Dict[str, Any]],
        max_concurrent: int = 10
    ) -> List[PredictionResponse]:
        """Make batch predictions."""
        
        try:
            logger.info(
                f"Starting batch prediction",
                model_name=model_name,
                batch_size=len(batch_requests)
            )
            
            # Ensure model is loaded
            if model_name not in self.loaded_models:
                await self.load_model(model_name)
            
            # Create semaphore for concurrency control
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def predict_single_with_semaphore(request_data: Dict[str, Any]):
                async with semaphore:
                    try:
                        return await self.predict(
                            model_name=model_name,
                            symbol=request_data["symbol"],
                            input_data=request_data.get("input_data"),
                            request_id=request_data.get("request_id"),
                            return_feature_importance=request_data.get("return_feature_importance", False)
                        )
                    except Exception as e:
                        logger.error(f"Batch prediction item failed: {e}")
                        return None
            
            # Execute batch predictions
            tasks = [predict_single_with_semaphore(req) for req in batch_requests]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter successful predictions
            successful_predictions = [r for r in results if isinstance(r, PredictionResponse)]
            
            logger.info(
                f"Batch prediction completed",
                model_name=model_name,
                successful=len(successful_predictions),
                failed=len(batch_requests) - len(successful_predictions)
            )
            
            return successful_predictions
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            raise ModelInferenceException(f"Batch prediction failed: {str(e)}")
    
    async def get_model_info(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get information about a loaded model."""
        
        if model_name not in self.model_metadata:
            return None
        
        metadata = self.model_metadata[model_name]
        
        return {
            "model_name": metadata.model_name,
            "model_type": metadata.model_type,
            "version": metadata.version,
            "status": metadata.status,
            "feature_count": len(metadata.feature_names),
            "feature_names": metadata.feature_names,
            "loaded_at": metadata.loaded_at.isoformat(),
            "prediction_count": metadata.prediction_count,
            "last_prediction": metadata.last_prediction.isoformat() if metadata.last_prediction else None,
            "error_message": metadata.error_message
        }
    
    async def list_loaded_models(self) -> List[Dict[str, Any]]:
        """List all loaded models."""
        
        models_info = []
        for model_name in self.model_metadata:
            info = await self.get_model_info(model_name)
            if info:
                models_info.append(info)
        
        return models_info
    
    async def health_check(self) -> Dict[str, Any]:
        """Check health of model server."""
        
        total_models = len(self.model_metadata)
        ready_models = sum(1 for m in self.model_metadata.values() if m.status == ModelStatus.READY)
        error_models = sum(1 for m in self.model_metadata.values() if m.status == ModelStatus.ERROR)
        
        total_predictions = sum(m.prediction_count for m in self.model_metadata.values())
        
        return {
            "status": "healthy" if ready_models > 0 or total_models == 0 else "degraded",
            "loaded_models": total_models,
            "ready_models": ready_models,
            "error_models": error_models,
            "total_predictions": total_predictions,
            "uptime_seconds": (datetime.utcnow() - datetime.utcnow()).total_seconds(),
            "thread_pool_workers": self.thread_pool._max_workers
        }
    
    def _load_model_from_disk(self, model_path: str) -> Dict[str, Any]:
        """Load model from disk (synchronous operation for thread pool)."""
        
        try:
            with open(model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            # Validate model data structure
            required_keys = ["model", "feature_names"]
            for key in required_keys:
                if key not in model_data:
                    raise ValueError(f"Invalid model file: missing '{key}'")
            
            return model_data
            
        except Exception as e:
            raise ModelInferenceException(f"Failed to load model from disk: {str(e)}")
    
    async def _find_latest_model_path(self, model_name: str) -> Optional[str]:
        """Find the latest model file for a given model name."""
        
        try:
            model_dir = self.models_dir / model_name
            if not model_dir.exists():
                return None
            
            # Find all pickle files in model directory
            model_files = list(model_dir.glob("*.pkl"))
            if not model_files:
                return None
            
            # Sort by modification time and return latest
            latest_file = max(model_files, key=lambda p: p.stat().st_mtime)
            return str(latest_file)
            
        except Exception as e:
            logger.error(f"Failed to find model path for {model_name}: {e}")
            return None
    
    async def _prepare_features_for_prediction(
        self,
        symbol: str,
        input_data: Optional[Dict[str, Any]],
        required_features: List[str],
        model_name: str
    ) -> pd.DataFrame:
        """Prepare features for prediction."""
        
        try:
            if input_data and "features" in input_data:
                # Features provided directly
                features_dict = input_data["features"]
                
                # Validate required features
                missing_features = set(required_features) - set(features_dict.keys())
                if missing_features:
                    raise InvalidInputDataException(f"Missing required features: {missing_features}")
                
                # Create DataFrame with required features only
                feature_values = [features_dict[name] for name in required_features]
                features_df = pd.DataFrame([feature_values], columns=required_features)
                
            else:
                # Extract features using feature engine
                end_date = datetime.utcnow()
                start_date = end_date - timedelta(days=60)  # 60 days of data
                
                feature_result = await self.feature_engine.extract_features(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    feature_types=["price", "volume", "technical", "volatility", "momentum"]
                )
                
                extracted_features = feature_result["features"]
                
                # Match required features
                feature_values = []
                missing_features = []
                
                for feature_name in required_features:
                    if feature_name in extracted_features:
                        feature_values.append(extracted_features[feature_name])
                    else:
                        missing_features.append(feature_name)
                        feature_values.append(0.0)  # Default value
                
                if missing_features:
                    logger.warning(
                        f"Missing features for prediction, using defaults",
                        model_name=model_name,
                        missing_features=missing_features[:5]  # Log first 5
                    )
                
                features_df = pd.DataFrame([feature_values], columns=required_features)
            
            # Apply scaling if model has scaler
            model_data = self.loaded_models[model_name]
            if "scaler" in model_data and model_data["scaler"] is not None:
                scaler = model_data["scaler"]
                features_scaled = scaler.transform(features_df)
                features_df = pd.DataFrame(features_scaled, columns=required_features)
            
            return features_df
            
        except Exception as e:
            logger.error(f"Feature preparation failed: {e}")
            raise InvalidInputDataException(f"Feature preparation failed: {str(e)}")
    
    async def _make_single_prediction(
        self,
        model_data: Dict[str, Any],
        features: pd.DataFrame,
        return_feature_importance: bool = False
    ) -> Dict[str, Any]:
        """Make a single prediction (async wrapper for model.predict)."""
        
        def predict_sync():
            model = model_data["model"]
            
            # Make prediction
            if hasattr(model, 'predict_proba'):
                # For classification models
                prediction_proba = model.predict_proba(features)
                prediction = model.predict(features)[0]
                confidence = float(np.max(prediction_proba[0]))
            else:
                # For regression models
                prediction = model.predict(features)[0]
                confidence = None
            
            result = {
                "prediction": float(prediction) if isinstance(prediction, (np.integer, np.floating)) else prediction,
                "confidence": confidence
            }
            
            # Add feature importance if requested and available
            if return_feature_importance and hasattr(model, 'feature_importances_'):
                feature_names = model_data.get("feature_names", [])
                if len(feature_names) == len(model.feature_importances_):
                    importance_dict = dict(zip(feature_names, model.feature_importances_))
                    # Sort by importance
                    importance_dict = dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
                    result["feature_importance"] = importance_dict
            
            return result
        
        # Execute prediction in thread pool
        result = await asyncio.get_event_loop().run_in_executor(
            self.thread_pool,
            predict_sync
        )
        
        return result
    
    async def _cache_model_metadata(self, model_name: str, metadata: ModelMetadata):
        """Cache model metadata in Redis."""
        
        try:
            metadata_dict = {
                "model_name": metadata.model_name,
                "model_type": metadata.model_type,
                "version": metadata.version,
                "status": metadata.status,
                "loaded_at": metadata.loaded_at.isoformat(),
                "feature_count": len(metadata.feature_names),
                "prediction_count": metadata.prediction_count
            }
            
            await self.redis_manager.cache_features(
                f"model_metadata:{model_name}",
                metadata_dict,
                ttl=3600  # 1 hour
            )
            
        except Exception as e:
            logger.warning(f"Failed to cache model metadata: {e}")


# Global model server instance
model_server = ModelServer()