"""
Health Check Endpoints for ML Pipeline Service

Comprehensive health monitoring including service status,
dependency health, and system metrics.
"""

from typing import Dict, Any
from fastapi import APIRouter, Depends
from datetime import datetime
import asyncio
import psutil
import structlog

from ....core.database import check_db_health, get_pool_status
from ....core.redis_client import check_redis_health, get_redis_manager
from ....core.kafka_client import check_kafka_health
from ....core.metrics import metrics_collector

logger = structlog.get_logger("health")
router = APIRouter()


@router.get("/", response_model=Dict[str, Any])
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "ml-pipeline-service",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": "development"  # Will be dynamic from settings
    }


@router.get("/detailed", response_model=Dict[str, Any])
async def detailed_health_check():
    """Detailed health check with dependency status."""
    
    # Check all dependencies in parallel
    db_health_task = asyncio.create_task(check_db_health())
    redis_health_task = asyncio.create_task(check_redis_health())
    kafka_health_task = asyncio.create_task(check_kafka_health())
    
    # Wait for all health checks
    db_healthy, redis_healthy, kafka_healthy = await asyncio.gather(
        db_health_task,
        redis_health_task, 
        kafka_health_task,
        return_exceptions=True
    )
    
    # Handle exceptions
    db_healthy = db_healthy if isinstance(db_healthy, bool) else False
    redis_healthy = redis_healthy if isinstance(redis_healthy, bool) else False
    kafka_healthy = kafka_healthy if isinstance(kafka_healthy, bool) else False
    
    # Overall status
    overall_healthy = all([db_healthy, redis_healthy, kafka_healthy])
    
    # System metrics
    process = psutil.Process()
    
    health_data = {
        "status": "healthy" if overall_healthy else "unhealthy",
        "service": "ml-pipeline-service",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": process.create_time(),
        "dependencies": {
            "database": {
                "status": "healthy" if db_healthy else "unhealthy",
                "type": "postgresql"
            },
            "cache": {
                "status": "healthy" if redis_healthy else "unhealthy", 
                "type": "redis"
            },
            "message_queue": {
                "status": "healthy" if kafka_healthy else "unhealthy",
                "type": "kafka"
            }
        },
        "system": {
            "cpu_percent": process.cpu_percent(),
            "memory_mb": round(process.memory_info().rss / 1024 / 1024, 2),
            "open_files": process.num_fds() if hasattr(process, 'num_fds') else 0,
            "threads": process.num_threads()
        }
    }
    
    # Add database pool status if available
    try:
        pool_status = await get_pool_status()
        health_data["dependencies"]["database"]["pool"] = pool_status
    except Exception as e:
        logger.warning(f"Could not get database pool status: {e}")
    
    # Add Redis stats if available
    try:
        redis_manager = get_redis_manager()
        redis_stats = await redis_manager.get_redis_stats()
        health_data["dependencies"]["cache"]["stats"] = redis_stats
    except Exception as e:
        logger.warning(f"Could not get Redis stats: {e}")
    
    return health_data


@router.get("/readiness", response_model=Dict[str, Any])
async def readiness_check():
    """Readiness probe for Kubernetes deployments."""
    
    try:
        # Check critical dependencies
        db_healthy = await check_db_health()
        redis_healthy = await check_redis_health()
        
        # Service is ready if critical dependencies are healthy
        is_ready = db_healthy and redis_healthy
        
        status_code = 200 if is_ready else 503
        
        return {
            "ready": is_ready,
            "checks": {
                "database": db_healthy,
                "cache": redis_healthy
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {
            "ready": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/liveness", response_model=Dict[str, Any])
async def liveness_check():
    """Liveness probe for Kubernetes deployments."""
    
    try:
        # Basic liveness check - service is alive if it can respond
        process = psutil.Process()
        
        return {
            "alive": True,
            "pid": process.pid,
            "uptime_seconds": process.create_time(),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Liveness check failed: {e}")
        return {
            "alive": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/metrics-summary", response_model=Dict[str, Any])
async def metrics_summary():
    """Summary of key metrics for monitoring."""
    
    try:
        summary = metrics_collector.get_metrics_summary()
        
        # Add system metrics
        process = psutil.Process()
        summary.update({
            "system_metrics": {
                "cpu_percent": process.cpu_percent(),
                "memory_mb": round(process.memory_info().rss / 1024 / 1024, 2),
                "open_files": process.num_fds() if hasattr(process, 'num_fds') else 0,
                "threads": process.num_threads()
            }
        })
        
        return summary
        
    except Exception as e:
        logger.error(f"Metrics summary failed: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }