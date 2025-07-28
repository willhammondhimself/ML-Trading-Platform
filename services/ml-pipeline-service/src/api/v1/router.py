"""
Main API Router for ML Pipeline Service v1

Centralized routing configuration for all ML pipeline endpoints
including feature engineering, model training, inference, and management.
"""

from fastapi import APIRouter
from .endpoints import (
    features,
    models,
    training,
    inference,
    health,
    metrics
)

# Create main API router
api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    health.router,
    prefix="/health",
    tags=["Health"]
)

api_router.include_router(
    metrics.router,
    prefix="/metrics", 
    tags=["Metrics"]
)

api_router.include_router(
    features.router,
    prefix="/features",
    tags=["Feature Engineering"]
)

api_router.include_router(
    models.router,
    prefix="/models",
    tags=["Model Management"]
)

api_router.include_router(
    training.router,
    prefix="/training",
    tags=["Model Training"]
)

api_router.include_router(
    inference.router,
    prefix="/inference",
    tags=["Model Inference"]
)