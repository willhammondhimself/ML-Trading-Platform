"""
Model Training Engine

Comprehensive training infrastructure for ML trading models.
Supports multiple model types, hyperparameter optimization, and training workflows.
"""

from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import pickle
import json
import pandas as pd
import numpy as np
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import structlog

# ML Libraries
import joblib
from sklearn.model_selection import train_test_split, TimeSeriesSplit
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.svm import SVR
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import optuna
from optuna.samplers import TPESampler
from optuna.pruners import MedianPruner

from ..core.exceptions import (
    ModelTrainingException,
    InvalidModelConfigException,
    InsufficientDataException
)
from ..core.redis_client import get_redis_manager
from ..config.settings import get_settings
from .hyperparameter_tuner import HyperparameterTuner
from .training_data_processor import TrainingDataProcessor

logger = structlog.get_logger("model-trainer")


class ModelType(str, Enum):
    """Supported model types."""
    LINEAR_REGRESSION = "linear_regression"
    RIDGE_REGRESSION = "ridge_regression"
    LASSO_REGRESSION = "lasso_regression"
    RANDOM_FOREST = "random_forest"
    GRADIENT_BOOSTING = "gradient_boosting"
    SVM = "svm"


class TrainingStatus(str, Enum):
    """Training job status."""
    PENDING = "pending"
    PREPARING = "preparing"
    TRAINING = "training"
    OPTIMIZING = "optimizing"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"


class ModelTrainer:
    """Main model training engine."""
    
    def __init__(self):
        self.settings = get_settings()
        self.redis_manager = get_redis_manager()
        self.data_processor = TrainingDataProcessor()
        self.hyperparameter_tuner = HyperparameterTuner()
        self.thread_pool = ThreadPoolExecutor(max_workers=4)
        
        # Model registry
        self.model_registry = {
            ModelType.LINEAR_REGRESSION: LinearRegression,
            ModelType.RIDGE_REGRESSION: Ridge,
            ModelType.LASSO_REGRESSION: Lasso,
            ModelType.RANDOM_FOREST: RandomForestRegressor,
            ModelType.GRADIENT_BOOSTING: GradientBoostingRegressor,
            ModelType.SVM: SVR
        }
        
        # Models directory
        self.models_dir = Path("models")
        self.models_dir.mkdir(exist_ok=True)
    
    async def train_model(
        self,
        training_data: pd.DataFrame,
        target_column: str,
        model_type: ModelType,
        model_name: str,
        hyperparameter_tuning: bool = True,
        optimization_trials: int = 100,
        validation_split: float = 0.2,
        time_series_split: bool = True,
        feature_selection: bool = True,
        model_config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Train a single model with comprehensive workflow."""
        
        training_id = f"{model_name}_{int(datetime.utcnow().timestamp())}"
        
        try:
            logger.info(
                "Starting model training",
                training_id=training_id,
                model_type=model_type,
                model_name=model_name,
                data_shape=training_data.shape
            )
            
            # Update training status
            await self._update_training_status(training_id, TrainingStatus.PREPARING)
            
            # Prepare training data
            prepared_data = await self.data_processor.prepare_training_data(
                data=training_data,
                target_column=target_column,
                feature_selection=feature_selection,
                time_series_aware=time_series_split
            )
            
            if prepared_data["X_train"].empty:
                raise InsufficientDataException("No valid training data after preparation")
            
            # Split data
            if time_series_split:
                X_train, X_val, y_train, y_val = self._time_series_split(
                    prepared_data["X"], prepared_data["y"], validation_split
                )
            else:
                X_train, X_val, y_train, y_val = train_test_split(
                    prepared_data["X"], prepared_data["y"], 
                    test_size=validation_split, random_state=42
                )
            
            logger.info(
                "Data split completed",
                training_id=training_id,
                train_samples=len(X_train),
                validation_samples=len(X_val)
            )
            
            await self._update_training_status(training_id, TrainingStatus.TRAINING)
            
            # Initialize model
            model_class = self.model_registry[model_type]
            best_params = model_config or {}
            
            # Hyperparameter optimization
            if hyperparameter_tuning:
                await self._update_training_status(training_id, TrainingStatus.OPTIMIZING)
                
                best_params = await self.hyperparameter_tuner.optimize_hyperparameters(
                    model_type=model_type,
                    X_train=X_train,
                    y_train=y_train,
                    X_val=X_val,
                    y_val=y_val,
                    n_trials=optimization_trials
                )
                
                logger.info(
                    "Hyperparameter optimization completed",
                    training_id=training_id,
                    best_params=best_params
                )
            
            # Train final model
            model = model_class(**best_params)
            await asyncio.get_event_loop().run_in_executor(
                self.thread_pool, 
                model.fit, 
                X_train, 
                y_train
            )
            
            # Validate model
            await self._update_training_status(training_id, TrainingStatus.VALIDATING)
            
            validation_metrics = await self._validate_model(
                model, X_val, y_val, X_train, y_train
            )
            
            # Feature importance (if available)
            feature_importance = None
            if hasattr(model, 'feature_importances_'):
                feature_importance = dict(zip(
                    prepared_data["feature_names"], 
                    model.feature_importances_
                ))
            elif hasattr(model, 'coef_'):
                feature_importance = dict(zip(
                    prepared_data["feature_names"], 
                    abs(model.coef_)
                ))
            
            # Save model
            model_path = await self._save_model(
                model=model,
                model_name=model_name,
                training_id=training_id,
                scaler=prepared_data.get("scaler"),
                feature_names=prepared_data["feature_names"],
                model_config=best_params,
                validation_metrics=validation_metrics
            )
            
            # Training results
            training_result = {
                "training_id": training_id,
                "model_name": model_name,
                "model_type": model_type,
                "model_path": str(model_path),
                "training_data_shape": training_data.shape,
                "feature_count": len(prepared_data["feature_names"]),
                "feature_names": prepared_data["feature_names"],
                "feature_importance": feature_importance,
                "hyperparameters": best_params,
                "validation_metrics": validation_metrics,
                "training_time": datetime.utcnow().isoformat(),
                "status": TrainingStatus.COMPLETED
            }
            
            await self._update_training_status(training_id, TrainingStatus.COMPLETED)
            
            # Cache training result
            await self.redis_manager.cache_features(
                f"training_result:{training_id}",
                training_result,
                ttl=86400  # 24 hours
            )
            
            logger.info(
                "Model training completed successfully",
                training_id=training_id,
                model_name=model_name,
                validation_r2=validation_metrics["validation_r2"],
                validation_rmse=validation_metrics["validation_rmse"]
            )
            
            return training_result
            
        except Exception as e:
            logger.error(f"Model training failed: {e}", training_id=training_id)
            await self._update_training_status(training_id, TrainingStatus.FAILED)
            
            if isinstance(e, (ModelTrainingException, InvalidModelConfigException, InsufficientDataException)):
                raise
            raise ModelTrainingException(f"Training failed for {model_name}: {str(e)}")
    
    async def train_ensemble_models(
        self,
        training_data: pd.DataFrame,
        target_column: str,
        model_types: List[ModelType],
        ensemble_name: str,
        voting_strategy: str = "average",
        hyperparameter_tuning: bool = True
    ) -> Dict[str, Any]:
        """Train an ensemble of different models."""
        
        ensemble_id = f"{ensemble_name}_{int(datetime.utcnow().timestamp())}"
        
        try:
            logger.info(
                "Starting ensemble training",
                ensemble_id=ensemble_id,
                model_types=model_types,
                ensemble_name=ensemble_name
            )
            
            # Train individual models
            individual_results = []
            models = {}
            
            for model_type in model_types:
                model_name = f"{ensemble_name}_{model_type}_member"
                
                try:
                    training_result = await self.train_model(
                        training_data=training_data,
                        target_column=target_column,
                        model_type=model_type,
                        model_name=model_name,
                        hyperparameter_tuning=hyperparameter_tuning,
                        optimization_trials=50  # Reduced for ensemble training
                    )
                    
                    individual_results.append(training_result)
                    
                    # Load trained model for ensemble
                    model_path = Path(training_result["model_path"])
                    with open(model_path, 'rb') as f:
                        model_data = pickle.load(f)
                        models[model_type] = model_data["model"]
                    
                except Exception as e:
                    logger.warning(f"Failed to train {model_type} for ensemble: {e}")
                    continue
            
            if len(models) < 2:
                raise ModelTrainingException("Insufficient models for ensemble (minimum 2 required)")
            
            # Create ensemble model
            ensemble_model = EnsembleModel(
                models=models,
                voting_strategy=voting_strategy
            )
            
            # Validate ensemble
            prepared_data = await self.data_processor.prepare_training_data(
                data=training_data,
                target_column=target_column,
                feature_selection=True,
                time_series_aware=True
            )
            
            X_train, X_val, y_train, y_val = self._time_series_split(
                prepared_data["X"], prepared_data["y"], 0.2
            )
            
            ensemble_metrics = await self._validate_ensemble(
                ensemble_model, X_val, y_val, X_train, y_train
            )
            
            # Save ensemble
            ensemble_path = await self._save_ensemble(
                ensemble_model=ensemble_model,
                ensemble_name=ensemble_name,
                ensemble_id=ensemble_id,
                individual_results=individual_results,
                validation_metrics=ensemble_metrics
            )
            
            ensemble_result = {
                "ensemble_id": ensemble_id,
                "ensemble_name": ensemble_name,
                "ensemble_path": str(ensemble_path),
                "individual_models": individual_results,
                "ensemble_metrics": ensemble_metrics,
                "voting_strategy": voting_strategy,
                "training_time": datetime.utcnow().isoformat(),
                "status": TrainingStatus.COMPLETED
            }
            
            logger.info(
                "Ensemble training completed",
                ensemble_id=ensemble_id,
                model_count=len(models),
                ensemble_r2=ensemble_metrics["validation_r2"]
            )
            
            return ensemble_result
            
        except Exception as e:
            logger.error(f"Ensemble training failed: {e}", ensemble_id=ensemble_id)
            raise ModelTrainingException(f"Ensemble training failed: {str(e)}")
    
    def _time_series_split(
        self, 
        X: pd.DataFrame, 
        y: pd.Series, 
        validation_split: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """Time series aware train/validation split."""
        
        split_index = int(len(X) * (1 - validation_split))
        
        X_train = X.iloc[:split_index]
        X_val = X.iloc[split_index:]
        y_train = y.iloc[:split_index]
        y_val = y.iloc[split_index:]
        
        return X_train, X_val, y_train, y_val
    
    async def _validate_model(
        self,
        model,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        X_train: pd.DataFrame,
        y_train: pd.Series
    ) -> Dict[str, float]:
        """Validate trained model performance."""
        
        def compute_metrics():
            # Training metrics
            train_pred = model.predict(X_train)
            train_mse = mean_squared_error(y_train, train_pred)
            train_rmse = np.sqrt(train_mse)
            train_mae = mean_absolute_error(y_train, train_pred)
            train_r2 = r2_score(y_train, train_pred)
            
            # Validation metrics
            val_pred = model.predict(X_val)
            val_mse = mean_squared_error(y_val, val_pred)
            val_rmse = np.sqrt(val_mse)
            val_mae = mean_absolute_error(y_val, val_pred)
            val_r2 = r2_score(y_val, val_pred)
            
            return {
                "training_mse": float(train_mse),
                "training_rmse": float(train_rmse),
                "training_mae": float(train_mae),
                "training_r2": float(train_r2),
                "validation_mse": float(val_mse),
                "validation_rmse": float(val_rmse),
                "validation_mae": float(val_mae),
                "validation_r2": float(val_r2),
                "overfitting_ratio": float(train_rmse / val_rmse) if val_rmse > 0 else 0.0
            }
        
        metrics = await asyncio.get_event_loop().run_in_executor(
            self.thread_pool, compute_metrics
        )
        
        return metrics
    
    async def _validate_ensemble(
        self,
        ensemble_model,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        X_train: pd.DataFrame,
        y_train: pd.Series
    ) -> Dict[str, float]:
        """Validate ensemble model performance."""
        
        def compute_ensemble_metrics():
            # Training metrics
            train_pred = ensemble_model.predict(X_train)
            train_mse = mean_squared_error(y_train, train_pred)
            train_rmse = np.sqrt(train_mse)
            train_mae = mean_absolute_error(y_train, train_pred)
            train_r2 = r2_score(y_train, train_pred)
            
            # Validation metrics
            val_pred = ensemble_model.predict(X_val)
            val_mse = mean_squared_error(y_val, val_pred)
            val_rmse = np.sqrt(val_mse)
            val_mae = mean_absolute_error(y_val, val_pred)
            val_r2 = r2_score(y_val, val_pred)
            
            return {
                "training_mse": float(train_mse),
                "training_rmse": float(train_rmse),
                "training_mae": float(train_mae),
                "training_r2": float(train_r2),
                "validation_mse": float(val_mse),
                "validation_rmse": float(val_rmse),
                "validation_mae": float(val_mae),
                "validation_r2": float(val_r2),
                "overfitting_ratio": float(train_rmse / val_rmse) if val_rmse > 0 else 0.0
            }
        
        metrics = await asyncio.get_event_loop().run_in_executor(
            self.thread_pool, compute_ensemble_metrics
        )
        
        return metrics
    
    async def _save_model(
        self,
        model,
        model_name: str,
        training_id: str,
        scaler=None,
        feature_names: List[str] = None,
        model_config: Dict[str, Any] = None,
        validation_metrics: Dict[str, float] = None
    ) -> Path:
        """Save trained model with metadata."""
        
        model_dir = self.models_dir / model_name
        model_dir.mkdir(exist_ok=True)
        
        model_path = model_dir / f"{training_id}.pkl"
        
        model_data = {
            "model": model,
            "scaler": scaler,
            "feature_names": feature_names,
            "model_config": model_config,
            "validation_metrics": validation_metrics,
            "training_id": training_id,
            "model_name": model_name,
            "created_at": datetime.utcnow().isoformat()
        }
        
        with open(model_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        # Save metadata separately
        metadata_path = model_dir / f"{training_id}_metadata.json"
        metadata = {
            "training_id": training_id,
            "model_name": model_name,
            "model_path": str(model_path),
            "feature_names": feature_names,
            "model_config": model_config,
            "validation_metrics": validation_metrics,
            "created_at": datetime.utcnow().isoformat()
        }
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(
            "Model saved successfully",
            training_id=training_id,
            model_path=str(model_path)
        )
        
        return model_path
    
    async def _save_ensemble(
        self,
        ensemble_model,
        ensemble_name: str,
        ensemble_id: str,
        individual_results: List[Dict[str, Any]],
        validation_metrics: Dict[str, float]
    ) -> Path:
        """Save ensemble model with metadata."""
        
        ensemble_dir = self.models_dir / ensemble_name
        ensemble_dir.mkdir(exist_ok=True)
        
        ensemble_path = ensemble_dir / f"{ensemble_id}.pkl"
        
        ensemble_data = {
            "ensemble_model": ensemble_model,
            "individual_results": individual_results,
            "validation_metrics": validation_metrics,
            "ensemble_id": ensemble_id,
            "ensemble_name": ensemble_name,
            "created_at": datetime.utcnow().isoformat()
        }
        
        with open(ensemble_path, 'wb') as f:
            pickle.dump(ensemble_data, f)
        
        return ensemble_path
    
    async def _update_training_status(self, training_id: str, status: TrainingStatus):
        """Update training job status in cache."""
        try:
            await self.redis_manager.cache_features(
                f"training_status:{training_id}",
                {
                    "training_id": training_id,
                    "status": status,
                    "updated_at": datetime.utcnow().isoformat()
                },
                ttl=86400  # 24 hours
            )
        except Exception as e:
            logger.warning(f"Failed to update training status: {e}")
    
    async def get_training_status(self, training_id: str) -> Optional[Dict[str, Any]]:
        """Get training job status."""
        try:
            status = await self.redis_manager.get_cached_features(f"training_status:{training_id}")
            return status
        except Exception as e:
            logger.error(f"Failed to get training status: {e}")
            return None
    
    async def load_model(self, model_path: str) -> Dict[str, Any]:
        """Load trained model from disk."""
        try:
            with open(model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            logger.info(f"Model loaded successfully: {model_path}")
            return model_data
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise ModelTrainingException(f"Failed to load model: {str(e)}")


class EnsembleModel:
    """Simple ensemble model that combines predictions."""
    
    def __init__(self, models: Dict[str, Any], voting_strategy: str = "average"):
        self.models = models
        self.voting_strategy = voting_strategy
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Make ensemble predictions."""
        predictions = []
        
        for model_name, model in self.models.items():
            try:
                pred = model.predict(X)
                predictions.append(pred)
            except Exception as e:
                logger.warning(f"Model {model_name} failed to predict: {e}")
                continue
        
        if not predictions:
            raise ModelTrainingException("No models in ensemble produced predictions")
        
        predictions = np.array(predictions)
        
        if self.voting_strategy == "average":
            return np.mean(predictions, axis=0)
        elif self.voting_strategy == "median":
            return np.median(predictions, axis=0)
        elif self.voting_strategy == "weighted":
            # Simple equal weighting for now
            return np.mean(predictions, axis=0)
        else:
            return np.mean(predictions, axis=0)