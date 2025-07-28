"""
Metrics and Monitoring for ML Pipeline Service

Prometheus-compatible metrics collection for performance monitoring,
ML model tracking, and operational insights.
"""

from typing import Dict, Any, Optional, List
import time
from functools import wraps
from datetime import datetime, timedelta

from prometheus_client import (
    Counter, Histogram, Gauge, Summary, 
    CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
)
from fastapi import Request, Response
import structlog

logger = structlog.get_logger("metrics")

# Create custom registry for isolation
registry = CollectorRegistry()

# HTTP Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code'],
    registry=registry
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0],
    registry=registry
)

http_requests_in_progress = Gauge(
    'http_requests_in_progress',
    'Number of HTTP requests currently being processed',
    registry=registry
)

# ML Model Metrics
ml_predictions_total = Counter(
    'ml_predictions_total',
    'Total ML predictions made',
    ['model_id', 'model_version', 'status'],
    registry=registry
)

ml_prediction_duration_seconds = Histogram(
    'ml_prediction_duration_seconds',
    'ML prediction duration in seconds',
    ['model_id', 'model_version'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=registry
)

ml_model_accuracy = Gauge(
    'ml_model_accuracy',
    'Current model accuracy score',
    ['model_id', 'model_version', 'metric_type'],
    registry=registry
)

ml_model_last_trained = Gauge(
    'ml_model_last_trained_timestamp',
    'Unix timestamp of last model training',
    ['model_id', 'model_version'],
    registry=registry
)

ml_training_jobs_total = Counter(
    'ml_training_jobs_total',
    'Total ML training jobs',
    ['model_type', 'status'],
    registry=registry
)

ml_training_duration_seconds = Histogram(
    'ml_training_duration_seconds',
    'ML training duration in seconds',
    ['model_type'],
    buckets=[60, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400],  # 1min to 1day
    registry=registry
)

# Feature Engineering Metrics
feature_extraction_total = Counter(
    'feature_extraction_total',
    'Total feature extractions',
    ['symbol', 'feature_type', 'status'],
    registry=registry
)

feature_extraction_duration_seconds = Histogram(
    'feature_extraction_duration_seconds',
    'Feature extraction duration in seconds',
    ['feature_type'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
    registry=registry
)

feature_cache_hits_total = Counter(
    'feature_cache_hits_total',
    'Total feature cache hits',
    ['symbol', 'feature_type'],
    registry=registry
)

feature_cache_misses_total = Counter(
    'feature_cache_misses_total',
    'Total feature cache misses',
    ['symbol', 'feature_type'],
    registry=registry
)

# Data Pipeline Metrics
data_pipeline_records_processed = Counter(
    'data_pipeline_records_processed_total',
    'Total records processed by data pipeline',
    ['pipeline_stage', 'status'],
    registry=registry
)

data_pipeline_batch_size = Histogram(
    'data_pipeline_batch_size',
    'Size of data pipeline batches',
    ['pipeline_stage'],
    buckets=[1, 10, 50, 100, 500, 1000, 5000, 10000],
    registry=registry
)

# External Service Metrics
external_service_requests_total = Counter(
    'external_service_requests_total',
    'Total requests to external services',
    ['service_name', 'endpoint', 'status_code'],
    registry=registry
)

external_service_request_duration_seconds = Histogram(
    'external_service_request_duration_seconds',
    'External service request duration in seconds',
    ['service_name', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=registry
)

# Resource Metrics
memory_usage_bytes = Gauge(
    'memory_usage_bytes',
    'Current memory usage in bytes',
    ['component'],
    registry=registry
)

cpu_usage_percent = Gauge(
    'cpu_usage_percent',
    'Current CPU usage percentage',
    ['component'],
    registry=registry
)

active_connections = Gauge(
    'active_connections',
    'Number of active connections',
    ['connection_type'],
    registry=registry
)

# Business Metrics
trading_signals_generated = Counter(
    'trading_signals_generated_total',
    'Total trading signals generated',
    ['signal_type', 'confidence_level'],
    registry=registry
)

prediction_accuracy_score = Summary(
    'prediction_accuracy_score',
    'Prediction accuracy scores',
    ['model_id', 'time_horizon'],
    registry=registry
)

# Model Management Metrics
model_operations_total = Counter(
    'model_operations_total',
    'Total model management operations',
    ['operation_type', 'model_name', 'status'],
    registry=registry
)

model_operation_duration_seconds = Histogram(
    'model_operation_duration_seconds',
    'Model management operation duration in seconds',
    ['operation_type'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=registry
)

model_versions_total = Gauge(
    'model_versions_total',
    'Total number of model versions by status',
    ['model_name', 'status'],
    registry=registry
)

model_deployments_active = Gauge(
    'model_deployments_active',
    'Active model deployments',
    ['model_name', 'environment', 'strategy'],
    registry=registry
)

ab_tests_active = Gauge(
    'ab_tests_active',
    'Active A/B tests',
    ['model_name'],
    registry=registry
)


def setup_metrics():
    """Initialize metrics collection."""
    logger.info("Metrics collection initialized")


def get_metrics() -> str:
    """Get Prometheus metrics in text format."""
    return generate_latest(registry)


def get_content_type() -> str:
    """Get Prometheus metrics content type."""
    return CONTENT_TYPE_LATEST


# Middleware for HTTP metrics collection
async def metrics_middleware(request: Request, call_next):
    """Middleware to collect HTTP metrics."""
    start_time = time.time()
    http_requests_in_progress.inc()
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        # Record metrics
        endpoint = request.url.path
        method = request.method
        status_code = response.status_code
        
        http_requests_total.labels(
            method=method, 
            endpoint=endpoint, 
            status_code=status_code
        ).inc()
        
        http_request_duration_seconds.labels(
            method=method, 
            endpoint=endpoint
        ).observe(duration)
        
        return response
        
    except Exception as e:
        duration = time.time() - start_time
        
        http_requests_total.labels(
            method=request.method, 
            endpoint=request.url.path, 
            status_code=500
        ).inc()
        
        raise
    finally:
        http_requests_in_progress.dec()


# Decorators for ML operation metrics
def track_predictions(model_id: str, model_version: str = "latest"):
    """Decorator to track ML predictions."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                ml_predictions_total.labels(
                    model_id=model_id,
                    model_version=model_version,
                    status=status
                ).inc()
                
                ml_prediction_duration_seconds.labels(
                    model_id=model_id,
                    model_version=model_version
                ).observe(duration)
        
        return wrapper
    return decorator


def track_training(model_type: str):
    """Decorator to track model training."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                ml_training_jobs_total.labels(
                    model_type=model_type,
                    status=status
                ).inc()
                
                ml_training_duration_seconds.labels(
                    model_type=model_type
                ).observe(duration)
        
        return wrapper
    return decorator


def track_feature_extraction(feature_type: str):
    """Decorator to track feature extraction."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            symbol = kwargs.get('symbol', 'unknown')
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                feature_extraction_total.labels(
                    symbol=symbol,
                    feature_type=feature_type,
                    status=status
                ).inc()
                
                feature_extraction_duration_seconds.labels(
                    feature_type=feature_type
                ).observe(duration)
        
        return wrapper
    return decorator


def track_external_service(service_name: str, endpoint: str):
    """Decorator to track external service calls."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status_code = 200
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status_code = 500
                raise
            finally:
                duration = time.time() - start_time
                
                external_service_requests_total.labels(
                    service_name=service_name,
                    endpoint=endpoint,
                    status_code=status_code
                ).inc()
                
                external_service_request_duration_seconds.labels(
                    service_name=service_name,
                    endpoint=endpoint
                ).observe(duration)
        
        return wrapper
    return decorator


def track_model_operation(operation_type: str):
    """Decorator to track model management operations."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            model_name = "unknown"
            
            # Try to extract model_name from arguments
            if args and hasattr(args[0], 'model_name'):
                model_name = args[0].model_name
            elif 'model_name' in kwargs:
                model_name = kwargs['model_name']
            elif len(args) > 1 and isinstance(args[1], str):
                model_name = args[1]  # Often the second parameter in path
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                model_operations_total.labels(
                    operation_type=operation_type,
                    model_name=model_name,
                    status=status
                ).inc()
                
                model_operation_duration_seconds.labels(
                    operation_type=operation_type
                ).observe(duration)
        
        return wrapper
    return decorator


def track_inference_operation(operation_type: str):
    """Decorator to track inference operations."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            model_name = "unknown"
            
            # Try to extract model_name from arguments
            if args and hasattr(args[0], 'model_name'):
                model_name = args[0].model_name
            elif 'model_name' in kwargs:
                model_name = kwargs['model_name']
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                ml_predictions_total.labels(
                    model_id=model_name,
                    model_version="latest",
                    status=status
                ).inc()
                
                ml_prediction_duration_seconds.labels(
                    model_id=model_name,
                    model_version="latest"
                ).observe(duration)
        
        return wrapper
    return decorator


def track_training_operation(operation_type: str):
    """Decorator to track training operations."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = "success"
            model_type = "unknown"
            
            # Try to extract model_type from arguments
            if args and hasattr(args[0], 'model_type'):
                model_type = args[0].model_type
            elif 'model_type' in kwargs:
                model_type = kwargs['model_type']
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = "error"
                raise
            finally:
                duration = time.time() - start_time
                
                ml_training_jobs_total.labels(
                    model_type=model_type,
                    status=status
                ).inc()
                
                ml_training_duration_seconds.labels(
                    model_type=model_type
                ).observe(duration)
        
        return wrapper
    return decorator


# Utility functions for metrics updates
class MetricsCollector:
    """Utility class for collecting various metrics."""
    
    @staticmethod
    def record_model_accuracy(model_id: str, model_version: str, metric_type: str, accuracy: float):
        """Record model accuracy metric."""
        ml_model_accuracy.labels(
            model_id=model_id,
            model_version=model_version,
            metric_type=metric_type
        ).set(accuracy)
    
    @staticmethod
    def record_model_training_timestamp(model_id: str, model_version: str, timestamp: datetime = None):
        """Record model training timestamp."""
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        ml_model_last_trained.labels(
            model_id=model_id,
            model_version=model_version
        ).set(timestamp.timestamp())
    
    @staticmethod
    def record_cache_hit(symbol: str, feature_type: str):
        """Record cache hit."""
        feature_cache_hits_total.labels(
            symbol=symbol,
            feature_type=feature_type
        ).inc()
    
    @staticmethod
    def record_cache_miss(symbol: str, feature_type: str):
        """Record cache miss."""
        feature_cache_misses_total.labels(
            symbol=symbol,
            feature_type=feature_type
        ).inc()
    
    @staticmethod
    def record_pipeline_batch(stage: str, batch_size: int, status: str = "success"):
        """Record data pipeline batch processing."""
        data_pipeline_records_processed.labels(
            pipeline_stage=stage,
            status=status
        ).inc(batch_size)
        
        data_pipeline_batch_size.labels(
            pipeline_stage=stage
        ).observe(batch_size)
    
    @staticmethod
    def record_trading_signal(signal_type: str, confidence_level: str):
        """Record trading signal generation."""
        trading_signals_generated.labels(
            signal_type=signal_type,
            confidence_level=confidence_level
        ).inc()
    
    @staticmethod
    def record_prediction_accuracy(model_id: str, time_horizon: str, accuracy: float):
        """Record prediction accuracy score."""
        prediction_accuracy_score.labels(
            model_id=model_id,
            time_horizon=time_horizon
        ).observe(accuracy)
    
    @staticmethod
    def update_resource_usage(component: str, memory_bytes: int, cpu_percent: float):
        """Update resource usage metrics."""
        memory_usage_bytes.labels(component=component).set(memory_bytes)
        cpu_usage_percent.labels(component=component).set(cpu_percent)
    
    @staticmethod
    def update_active_connections(connection_type: str, count: int):
        """Update active connections count."""
        active_connections.labels(connection_type=connection_type).set(count)
    
    @staticmethod
    def record_model_operation(operation_type: str, model_name: str, status: str = "success"):
        """Record model management operation."""
        model_operations_total.labels(
            operation_type=operation_type,
            model_name=model_name,
            status=status
        ).inc()
    
    @staticmethod
    def update_model_versions_count(model_name: str, status: str, count: int):
        """Update count of model versions by status."""
        model_versions_total.labels(
            model_name=model_name,
            status=status
        ).set(count)
    
    @staticmethod
    def update_active_deployments(model_name: str, environment: str, strategy: str, count: int):
        """Update count of active deployments."""
        model_deployments_active.labels(
            model_name=model_name,
            environment=environment,
            strategy=strategy
        ).set(count)
    
    @staticmethod
    def update_active_ab_tests(model_name: str, count: int):
        """Update count of active A/B tests."""
        ab_tests_active.labels(model_name=model_name).set(count)
    
    @staticmethod
    def record_prediction(model_name: str, processing_time_ms: float, success: bool = True):
        """Record prediction metrics."""
        status = "success" if success else "error"
        
        ml_predictions_total.labels(
            model_id=model_name,
            model_version="latest",
            status=status
        ).inc()
        
        ml_prediction_duration_seconds.labels(
            model_id=model_name,
            model_version="latest"
        ).observe(processing_time_ms / 1000.0)  # Convert ms to seconds
    
    @staticmethod
    def get_metrics_summary() -> Dict[str, Any]:
        """Get current metrics summary."""
        return {
            "http_requests_total": http_requests_total._value._value,
            "ml_predictions_total": ml_predictions_total._value._value,
            "ml_training_jobs_total": ml_training_jobs_total._value._value,
            "feature_extractions_total": feature_extraction_total._value._value,
            "external_requests_total": external_service_requests_total._value._value,
            "model_operations_total": model_operations_total._value._value,
            "timestamp": datetime.utcnow().isoformat()
        }


# Global metrics collector instance
metrics_collector = MetricsCollector()