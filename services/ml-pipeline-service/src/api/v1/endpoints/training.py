"""
Model Training Endpoints for ML Pipeline Service

API endpoints for training ML models, hyperparameter optimization,
and managing training workflows.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
import asyncio
import structlog

from ....core.exceptions import (
    ModelTrainingException,
    InvalidModelConfigException,
    InsufficientDataException
)
from ....core.metrics import track_training_operation, metrics_collector
from ....core.redis_client import get_redis_manager
from ....training.model_trainer import ModelTrainer, ModelType, TrainingStatus
from ....training.hyperparameter_tuner import HyperparameterTuner
from ....training.training_data_processor import TrainingDataProcessor
from ....features.feature_engine import FeatureEngine

logger = structlog.get_logger("training-api")
router = APIRouter()


# Request/Response Models
class TrainingRequest(BaseModel):
    """Request model for model training."""
    model_name: str = Field(..., description="Name for the trained model")
    model_type: ModelType = Field(..., description="Type of model to train")
    training_symbols: List[str] = Field(..., description="Symbols to include in training data")
    start_date: datetime = Field(..., description="Start date for training data")
    end_date: datetime = Field(..., description="End date for training data")
    target_definition: Dict[str, Any] = Field(
        default={"type": "price_return", "column": "target", "horizon": 1},
        description="Target variable definition"
    )
    feature_types: List[str] = Field(
        default=["price", "volume", "technical", "volatility", "momentum"],
        description="Feature types to include"
    )
    hyperparameter_tuning: bool = Field(default=True, description="Enable hyperparameter optimization")
    optimization_trials: int = Field(default=100, ge=10, le=500, description="Number of optimization trials")
    validation_split: float = Field(default=0.2, ge=0.1, le=0.5, description="Validation data ratio")
    
    @validator("training_symbols")
    def validate_symbols(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one training symbol is required")
        if len(v) > 50:
            raise ValueError("Maximum 50 symbols allowed for training")
        return [s.upper() for s in v]
    
    @validator("end_date")
    def validate_date_range(cls, v, values):
        if "start_date" in values and v <= values["start_date"]:
            raise ValueError("End date must be after start date")
        return v


class EnsembleTrainingRequest(BaseModel):
    """Request model for ensemble training."""
    ensemble_name: str = Field(..., description="Name for the ensemble model")
    model_types: List[ModelType] = Field(..., description="Model types to include in ensemble")
    training_symbols: List[str] = Field(..., description="Symbols for training data")
    start_date: datetime = Field(..., description="Start date for training data")
    end_date: datetime = Field(..., description="End date for training data")
    target_definition: Dict[str, Any] = Field(
        default={"type": "price_return", "column": "target", "horizon": 1}
    )
    voting_strategy: str = Field(default="average", description="Ensemble voting strategy")
    
    @validator("model_types")
    def validate_model_types(cls, v):
        if len(v) < 2:
            raise ValueError("Ensemble requires at least 2 models")
        if len(v) > 10:
            raise ValueError("Maximum 10 models allowed in ensemble")
        return v


class HyperparameterOptimizationRequest(BaseModel):
    """Request for hyperparameter optimization."""
    model_type: ModelType = Field(..., description="Model type to optimize")
    training_symbols: List[str] = Field(..., description="Training symbols")
    start_date: datetime = Field(..., description="Start date")
    end_date: datetime = Field(..., description="End date")
    n_trials: int = Field(default=100, ge=10, le=1000)
    optimization_direction: str = Field(default="maximize", description="Optimization direction")
    scoring_metric: str = Field(default="r2", description="Scoring metric")


class TrainingResponse(BaseModel):
    """Response model for training operations."""
    training_id: str
    model_name: str
    model_type: str
    status: TrainingStatus
    validation_metrics: Optional[Dict[str, float]] = None
    hyperparameters: Optional[Dict[str, Any]] = None
    feature_count: Optional[int] = None
    training_time: datetime
    model_path: Optional[str] = None


class TrainingStatusResponse(BaseModel):
    """Response model for training status."""
    training_id: str
    status: TrainingStatus
    progress: Optional[Dict[str, Any]] = None
    updated_at: datetime


# API Endpoints
@router.post("/train", response_model=TrainingResponse)
@track_training_operation("single_model")
async def train_model(
    request: TrainingRequest,
    background_tasks: BackgroundTasks
):
    """Train a single ML model."""
    
    try:
        logger.info(
            "Model training requested",
            model_name=request.model_name,
            model_type=request.model_type,
            training_symbols=request.training_symbols,
            hyperparameter_tuning=request.hyperparameter_tuning
        )
        
        # Start training in background
        training_id = f"{request.model_name}_{int(datetime.utcnow().timestamp())}"
        
        background_tasks.add_task(
            _train_model_background,
            training_id=training_id,
            request=request
        )
        
        # Return immediate response
        return TrainingResponse(
            training_id=training_id,
            model_name=request.model_name,
            model_type=request.model_type,
            status=TrainingStatus.PENDING,
            training_time=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Training request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start training")


@router.post("/train-ensemble", response_model=TrainingResponse)
@track_training_operation("ensemble")
async def train_ensemble(
    request: EnsembleTrainingRequest,
    background_tasks: BackgroundTasks
):
    """Train an ensemble of models."""
    
    try:
        logger.info(
            "Ensemble training requested",
            ensemble_name=request.ensemble_name,
            model_types=request.model_types,
            training_symbols=request.training_symbols
        )
        
        ensemble_id = f"{request.ensemble_name}_{int(datetime.utcnow().timestamp())}"
        
        background_tasks.add_task(
            _train_ensemble_background,
            ensemble_id=ensemble_id,
            request=request
        )
        
        return TrainingResponse(
            training_id=ensemble_id,
            model_name=request.ensemble_name,
            model_type="ensemble",
            status=TrainingStatus.PENDING,
            training_time=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Ensemble training request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start ensemble training")


@router.post("/optimize-hyperparameters")
@track_training_operation("hyperparameter_optimization")
async def optimize_hyperparameters(
    request: HyperparameterOptimizationRequest,
    background_tasks: BackgroundTasks
):
    """Optimize hyperparameters for a model type."""
    
    try:
        logger.info(
            "Hyperparameter optimization requested",
            model_type=request.model_type,
            n_trials=request.n_trials
        )
        
        optimization_id = f"opt_{request.model_type}_{int(datetime.utcnow().timestamp())}"
        
        background_tasks.add_task(
            _optimize_hyperparameters_background,
            optimization_id=optimization_id,
            request=request
        )
        
        return {
            "optimization_id": optimization_id,
            "status": "started",
            "model_type": request.model_type,
            "n_trials": request.n_trials,
            "started_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Hyperparameter optimization failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start optimization")


@router.get("/status/{training_id}", response_model=TrainingStatusResponse)
async def get_training_status(training_id: str):
    """Get training job status."""
    
    try:
        trainer = ModelTrainer()
        status_info = await trainer.get_training_status(training_id)
        
        if not status_info:
            raise HTTPException(status_code=404, detail="Training job not found")
        
        return TrainingStatusResponse(
            training_id=training_id,
            status=TrainingStatus(status_info["status"]),
            updated_at=datetime.fromisoformat(status_info["updated_at"])
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get training status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve training status")


@router.get("/results/{training_id}")
async def get_training_results(training_id: str):
    """Get training results."""
    
    try:
        redis_manager = get_redis_manager()
        results = await redis_manager.get_cached_features(f"training_result:{training_id}")
        
        if not results:
            raise HTTPException(status_code=404, detail="Training results not found")
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get training results: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve training results")


@router.get("/models", response_model=List[Dict[str, Any]])
async def list_trained_models():
    """List all trained models."""
    
    try:
        from pathlib import Path
        import json
        
        models_dir = Path("models")
        if not models_dir.exists():
            return []
        
        models = []
        for model_dir in models_dir.iterdir():
            if model_dir.is_dir():
                # Look for metadata files
                for metadata_file in model_dir.glob("*_metadata.json"):
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                            models.append(metadata)
                    except Exception as e:
                        logger.warning(f"Failed to read metadata {metadata_file}: {e}")
        
        # Sort by creation time
        models.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return models
        
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=500, detail="Failed to list models")


@router.delete("/models/{model_name}")
async def delete_model(model_name: str):
    """Delete a trained model."""
    
    try:
        from pathlib import Path
        import shutil
        
        models_dir = Path("models") / model_name
        if not models_dir.exists():
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Remove model directory
        shutil.rmtree(models_dir)
        
        return {
            "message": f"Model '{model_name}' deleted successfully",
            "deleted_at": datetime.utcnow()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete model: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete model")


@router.get("/model-types")
async def get_supported_model_types():
    """Get supported model types."""
    
    return {
        "model_types": [
            {
                "name": ModelType.LINEAR_REGRESSION,
                "description": "Linear regression for continuous targets",
                "suitable_for": ["regression", "baseline"]
            },
            {
                "name": ModelType.RIDGE_REGRESSION,
                "description": "Ridge regression with L2 regularization",
                "suitable_for": ["regression", "high_dimensionality"]
            },
            {
                "name": ModelType.LASSO_REGRESSION,
                "description": "Lasso regression with L1 regularization",
                "suitable_for": ["regression", "feature_selection"]
            },
            {
                "name": ModelType.RANDOM_FOREST,
                "description": "Random Forest ensemble method",
                "suitable_for": ["regression", "classification", "non_linear"]
            },
            {
                "name": ModelType.GRADIENT_BOOSTING,
                "description": "Gradient Boosting ensemble method",
                "suitable_for": ["regression", "classification", "high_performance"]
            },
            {
                "name": ModelType.SVM,
                "description": "Support Vector Machine",
                "suitable_for": ["regression", "classification", "non_linear"]
            }
        ]
    }


# Background task functions
async def _train_model_background(training_id: str, request: TrainingRequest):
    """Background task for model training."""
    try:
        logger.info(f"Starting background training: {training_id}")
        
        # Initialize components
        feature_engine = FeatureEngine()
        data_processor = TrainingDataProcessor()
        trainer = ModelTrainer()
        
        # Extract features for all symbols
        all_features = []
        for symbol in request.training_symbols:
            try:
                features = await feature_engine.extract_features(
                    symbol=symbol,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    feature_types=request.feature_types
                )
                all_features.append(features)
            except Exception as e:
                logger.warning(f"Failed to extract features for {symbol}: {e}")
        
        if not all_features:
            raise InsufficientDataException("No features extracted for any symbol")
        
        # Create training dataset
        training_data = await data_processor.create_training_dataset(
            features_data=all_features,
            target_definition=request.target_definition
        )
        
        # Train model
        training_result = await trainer.train_model(
            training_data=training_data,
            target_column=request.target_definition["column"],
            model_type=request.model_type,
            model_name=request.model_name,
            hyperparameter_tuning=request.hyperparameter_tuning,
            optimization_trials=request.optimization_trials,
            validation_split=request.validation_split
        )
        
        logger.info(f"Background training completed: {training_id}")
        
    except Exception as e:
        logger.error(f"Background training failed: {training_id}: {e}")


async def _train_ensemble_background(ensemble_id: str, request: EnsembleTrainingRequest):
    """Background task for ensemble training."""
    try:
        logger.info(f"Starting background ensemble training: {ensemble_id}")
        
        # Initialize components
        feature_engine = FeatureEngine()
        data_processor = TrainingDataProcessor()
        trainer = ModelTrainer()
        
        # Extract features for all symbols
        all_features = []
        for symbol in request.training_symbols:
            try:
                features = await feature_engine.extract_features(
                    symbol=symbol,
                    start_date=request.start_date,
                    end_date=request.end_date
                )
                all_features.append(features)
            except Exception as e:
                logger.warning(f"Failed to extract features for {symbol}: {e}")
        
        if not all_features:
            raise InsufficientDataException("No features extracted for any symbol")
        
        # Create training dataset
        training_data = await data_processor.create_training_dataset(
            features_data=all_features,
            target_definition=request.target_definition
        )
        
        # Train ensemble
        ensemble_result = await trainer.train_ensemble_models(
            training_data=training_data,
            target_column=request.target_definition["column"],
            model_types=request.model_types,
            ensemble_name=request.ensemble_name,
            voting_strategy=request.voting_strategy
        )
        
        logger.info(f"Background ensemble training completed: {ensemble_id}")
        
    except Exception as e:
        logger.error(f"Background ensemble training failed: {ensemble_id}: {e}")


async def _optimize_hyperparameters_background(optimization_id: str, request: HyperparameterOptimizationRequest):
    """Background task for hyperparameter optimization."""
    try:
        logger.info(f"Starting background hyperparameter optimization: {optimization_id}")
        
        # Initialize components
        feature_engine = FeatureEngine()
        data_processor = TrainingDataProcessor()
        tuner = HyperparameterTuner()
        
        # Extract features
        all_features = []
        for symbol in request.training_symbols:
            try:
                features = await feature_engine.extract_features(
                    symbol=symbol,
                    start_date=request.start_date,
                    end_date=request.end_date
                )
                all_features.append(features)
            except Exception as e:
                logger.warning(f"Failed to extract features for {symbol}: {e}")
        
        if not all_features:
            raise InsufficientDataException("No features extracted for any symbol")
        
        # Create dataset
        training_data = await data_processor.create_training_dataset(
            features_data=all_features,
            target_definition={"type": "price_return", "column": "target", "horizon": 1}
        )
        
        # Prepare data
        prepared_data = await data_processor.prepare_training_data(
            data=training_data,
            target_column="target"
        )
        
        # Split data
        from sklearn.model_selection import train_test_split
        X_train, X_val, y_train, y_val = train_test_split(
            prepared_data["X"], prepared_data["y"], 
            test_size=0.2, random_state=42
        )
        
        # Optimize hyperparameters
        best_params = await tuner.optimize_hyperparameters(
            model_type=request.model_type,
            X_train=X_train,
            y_train=y_train,
            X_val=X_val,
            y_val=y_val,
            n_trials=request.n_trials,
            optimization_direction=request.optimization_direction,
            scoring_metric=request.scoring_metric
        )
        
        # Cache results
        redis_manager = get_redis_manager()
        await redis_manager.cache_features(
            f"optimization_result:{optimization_id}",
            {
                "optimization_id": optimization_id,
                "model_type": request.model_type,
                "best_params": best_params,
                "completed_at": datetime.utcnow().isoformat()
            },
            ttl=86400  # 24 hours
        )
        
        logger.info(f"Background hyperparameter optimization completed: {optimization_id}")
        
    except Exception as e:
        logger.error(f"Background hyperparameter optimization failed: {optimization_id}: {e}")