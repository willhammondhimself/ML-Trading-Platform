"""
Custom Exception Classes for ML Pipeline Service

Standardized error handling with detailed error codes,
proper HTTP status codes, and structured logging.
"""

from typing import Any, Dict, Optional
from datetime import datetime
import uuid


class MLPipelineException(Exception):
    """Base exception class for ML Pipeline service."""
    
    def __init__(
        self,
        detail: str,
        status_code: int = 500,
        error_code: str = "ML_PIPELINE_ERROR",
        metadata: Dict[str, Any] = None
    ):
        self.detail = detail
        self.status_code = status_code
        self.error_code = error_code
        self.metadata = metadata or {}
        self.timestamp = datetime.utcnow().isoformat()
        self.error_id = str(uuid.uuid4())
        
        super().__init__(self.detail)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary."""
        return {
            "error": self.__class__.__name__,
            "detail": self.detail,
            "error_code": self.error_code,
            "status_code": self.status_code,
            "timestamp": self.timestamp,
            "error_id": self.error_id,
            "metadata": self.metadata
        }


# Feature Engineering Exceptions
class FeatureEngineeringException(MLPipelineException):
    """Exception raised during feature engineering operations."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=422,
            error_code="FEATURE_ENGINEERING_ERROR",
            metadata=metadata
        )


class InvalidFeatureDataException(FeatureEngineeringException):
    """Exception for invalid feature data."""
    
    def __init__(self, detail: str, symbol: str = None, feature_name: str = None):
        metadata = {}
        if symbol:
            metadata['symbol'] = symbol
        if feature_name:
            metadata['feature_name'] = feature_name
            
        super().__init__(
            detail=detail,
            metadata=metadata
        )


class MissingMarketDataException(FeatureEngineeringException):
    """Exception for missing market data."""
    
    def __init__(self, symbol: str, date_range: str = None):
        detail = f"Missing market data for symbol: {symbol}"
        if date_range:
            detail += f" in date range: {date_range}"
            
        super().__init__(
            detail=detail,
            metadata={'symbol': symbol, 'date_range': date_range}
        )


# Model Training Exceptions
class ModelTrainingException(MLPipelineException):
    """Exception raised during model training operations."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=422,
            error_code="MODEL_TRAINING_ERROR",
            metadata=metadata
        )


class InvalidModelConfigException(ModelTrainingException):
    """Exception for invalid model configuration."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(detail=detail, metadata=metadata)


class InsufficientDataException(ModelTrainingException):
    """Exception for insufficient data."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(detail=detail, metadata=metadata)


class InsufficientTrainingDataException(ModelTrainingException):
    """Exception for insufficient training data."""
    
    def __init__(self, required_samples: int, actual_samples: int, model_type: str = None):
        detail = f"Insufficient training data: {actual_samples} samples, {required_samples} required"
        if model_type:
            detail += f" for {model_type} model"
            
        super().__init__(
            detail=detail,
            metadata={
                'required_samples': required_samples,
                'actual_samples': actual_samples,
                'model_type': model_type
            }
        )


class ModelConvergenceException(ModelTrainingException):
    """Exception for model training convergence issues."""
    
    def __init__(self, model_id: str, iterations: int, loss: float = None):
        detail = f"Model {model_id} failed to converge after {iterations} iterations"
        if loss is not None:
            detail += f" (final loss: {loss:.6f})"
            
        super().__init__(
            detail=detail,
            metadata={
                'model_id': model_id,
                'iterations': iterations,
                'final_loss': loss
            }
        )


class HyperparameterOptimizationException(ModelTrainingException):
    """Exception for hyperparameter optimization failures."""
    
    def __init__(self, study_name: str, n_trials: int, error_msg: str = None):
        detail = f"Hyperparameter optimization failed for study '{study_name}' after {n_trials} trials"
        if error_msg:
            detail += f": {error_msg}"
            
        super().__init__(
            detail=detail,
            metadata={
                'study_name': study_name,
                'n_trials': n_trials,
                'error_message': error_msg
            }
        )


# Model Inference Exceptions
class ModelInferenceException(MLPipelineException):
    """Exception raised during model inference operations."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=422,
            error_code="MODEL_INFERENCE_ERROR",
            metadata=metadata
        )


class ModelNotLoadedException(ModelInferenceException):
    """Exception for models that are not loaded."""
    
    def __init__(self, model_id: str, version: str = None):
        detail = f"Model {model_id}"
        if version:
            detail += f" version {version}"
        detail += " is not loaded"
        
        super().__init__(
            detail=detail,
            metadata={'model_id': model_id, 'version': version}
        )


class PredictionTimeoutException(ModelInferenceException):
    """Exception for prediction timeouts."""
    
    def __init__(self, model_id: str, timeout_seconds: float):
        detail = f"Prediction timeout for model {model_id} after {timeout_seconds}s"
        
        super().__init__(
            detail=detail,
            metadata={'model_id': model_id, 'timeout_seconds': timeout_seconds}
        )


class InvalidPredictionInputException(ModelInferenceException):
    """Exception for invalid prediction input."""
    
    def __init__(self, model_id: str, input_shape: tuple = None, expected_shape: tuple = None):
        detail = f"Invalid input for model {model_id}"
        metadata = {'model_id': model_id}
        
        if input_shape and expected_shape:
            detail += f": got shape {input_shape}, expected {expected_shape}"
            metadata['input_shape'] = input_shape
            metadata['expected_shape'] = expected_shape
            
        super().__init__(detail=detail, metadata=metadata)


# Alias for inference compatibility  
ModelNotFoundError = ModelNotFoundException


class InvalidInputDataException(MLPipelineException):
    """Exception for invalid input data."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=400,
            error_code="INVALID_INPUT_DATA",
            metadata=metadata
        )


# Model Management Exceptions
class ModelManagementException(MLPipelineException):
    """Exception raised during model management operations."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=422,
            error_code="MODEL_MANAGEMENT_ERROR",
            metadata=metadata
        )


class ModelNotFoundException(ModelManagementException):
    """Exception for models that cannot be found."""
    
    def __init__(self, model_id: str, version: str = None):
        detail = f"Model {model_id}"
        if version:
            detail += f" version {version}"
        detail += " not found"
        
        super().__init__(
            detail=detail,
            status_code=404,
            error_code="MODEL_NOT_FOUND",
            metadata={'model_id': model_id, 'version': version}
        )


class ModelVersionConflictException(ModelManagementException):
    """Exception for model version conflicts."""
    
    def __init__(self, model_id: str, version: str, existing_version: str = None):
        detail = f"Version conflict for model {model_id} version {version}"
        if existing_version:
            detail += f" (existing version: {existing_version})"
            
        super().__init__(
            detail=detail,
            status_code=409,
            error_code="MODEL_VERSION_CONFLICT",
            metadata={
                'model_id': model_id,
                'version': version,
                'existing_version': existing_version
            }
        )


class ModelRegistryException(ModelManagementException):
    """Exception for model registry operations."""
    
    def __init__(self, operation: str, model_id: str, error_msg: str = None):
        detail = f"Model registry {operation} failed for model {model_id}"
        if error_msg:
            detail += f": {error_msg}"
            
        super().__init__(
            detail=detail,
            metadata={
                'operation': operation,
                'model_id': model_id,
                'error_message': error_msg
            }
        )


# Data Validation Exceptions
class DataValidationException(MLPipelineException):
    """Exception raised during data validation."""
    
    def __init__(self, detail: str, metadata: Dict[str, Any] = None):
        super().__init__(
            detail=detail,
            status_code=400,
            error_code="DATA_VALIDATION_ERROR",
            metadata=metadata
        )


class SchemaValidationException(DataValidationException):
    """Exception for schema validation failures."""
    
    def __init__(self, field_name: str, expected_type: str, actual_type: str):
        detail = f"Schema validation failed for field '{field_name}': expected {expected_type}, got {actual_type}"
        
        super().__init__(
            detail=detail,
            metadata={
                'field_name': field_name,
                'expected_type': expected_type,
                'actual_type': actual_type
            }
        )


# External Service Exceptions
class ExternalServiceException(MLPipelineException):
    """Exception for external service communication failures."""
    
    def __init__(self, service_name: str, detail: str, status_code: int = 503):
        super().__init__(
            detail=f"External service error ({service_name}): {detail}",
            status_code=status_code,
            error_code="EXTERNAL_SERVICE_ERROR",
            metadata={'service_name': service_name}
        )


class TradingServiceException(ExternalServiceException):
    """Exception for Trading Service communication failures."""
    
    def __init__(self, detail: str, status_code: int = 503):
        super().__init__("trading-service", detail, status_code)


class MarketDataServiceException(ExternalServiceException):
    """Exception for Market Data Service communication failures."""
    
    def __init__(self, detail: str, status_code: int = 503):
        super().__init__("market-data-service", detail, status_code)


# Resource Exceptions
class ResourceException(MLPipelineException):
    """Exception for resource-related issues."""
    
    def __init__(self, detail: str, resource_type: str, metadata: Dict[str, Any] = None):
        metadata = metadata or {}
        metadata['resource_type'] = resource_type
        
        super().__init__(
            detail=detail,
            status_code=507,  # Insufficient Storage
            error_code="RESOURCE_ERROR",
            metadata=metadata
        )


class InsufficientResourcesException(ResourceException):
    """Exception for insufficient resources."""
    
    def __init__(self, resource_type: str, required: float, available: float, unit: str = ""):
        detail = f"Insufficient {resource_type}: required {required}{unit}, available {available}{unit}"
        
        super().__init__(
            detail=detail,
            resource_type=resource_type,
            metadata={
                'required': required,
                'available': available,
                'unit': unit
            }
        )


# Configuration Exceptions
class ConfigurationException(MLPipelineException):
    """Exception for configuration-related issues."""
    
    def __init__(self, detail: str, config_key: str = None):
        metadata = {}
        if config_key:
            metadata['config_key'] = config_key
            
        super().__init__(
            detail=detail,
            status_code=500,
            error_code="CONFIGURATION_ERROR",
            metadata=metadata
        )


# Rate Limiting Exceptions
class RateLimitException(MLPipelineException):
    """Exception for rate limiting."""
    
    def __init__(self, detail: str, retry_after: int = None):
        metadata = {}
        if retry_after:
            metadata['retry_after'] = retry_after
            
        super().__init__(
            detail=detail,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            metadata=metadata
        )


# Utility functions for exception handling
def handle_external_service_error(service_name: str, error: Exception) -> ExternalServiceException:
    """Convert generic exception to external service exception."""
    if isinstance(error, ExternalServiceException):
        return error
    
    return ExternalServiceException(
        service_name=service_name,
        detail=str(error),
        status_code=503
    )


def create_validation_error(field_errors: Dict[str, str]) -> DataValidationException:
    """Create validation exception from field errors."""
    errors = [f"{field}: {message}" for field, message in field_errors.items()]
    detail = "Validation failed: " + "; ".join(errors)
    
    return DataValidationException(
        detail=detail,
        metadata={'field_errors': field_errors}
    )