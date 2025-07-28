"""
Metrics Endpoints for ML Pipeline Service

Prometheus-compatible metrics exposition and custom metrics APIs.
"""

from typing import Dict, Any
from fastapi import APIRouter, Response
from fastapi.responses import PlainTextResponse

from ....core.metrics import get_metrics, get_content_type, metrics_collector

router = APIRouter()


@router.get("/prometheus", response_class=PlainTextResponse)
async def prometheus_metrics():
    """Prometheus-compatible metrics endpoint."""
    metrics_data = get_metrics()
    return Response(
        content=metrics_data,
        media_type=get_content_type()
    )


@router.get("/summary", response_model=Dict[str, Any])
async def metrics_summary():
    """JSON summary of key metrics."""
    return metrics_collector.get_metrics_summary()


@router.get("/health-metrics", response_model=Dict[str, Any]) 
async def health_metrics():
    """Health-related metrics for monitoring dashboards."""
    # This would return health-specific metrics
    # Implementation depends on your monitoring requirements
    return {
        "service_health": "healthy",
        "dependency_health": {
            "database": "healthy",
            "redis": "healthy", 
            "kafka": "healthy"
        },
        "performance_health": {
            "avg_response_time": "< 100ms",
            "error_rate": "< 1%",
            "throughput": "normal"
        }
    }