"""
ML Pipeline Service - Simplified FastAPI Application

Basic ML service for trading platform development environment.
"""

from typing import Dict, Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from datetime import datetime

# Create FastAPI application
app = FastAPI(
    title="ML Pipeline Service",
    description="Machine Learning pipeline for trading platform with feature engineering, training, and inference",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Basic CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ml-pipeline-service",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with service information."""
    return {
        "service": "ML Pipeline Service",
        "version": "1.0.0",
        "description": "Machine Learning pipeline for trading platform",
        "docs": "/docs",
        "health": "/health",
        "api": "/api/v1",
        "status": "running"
    }

# Basic API endpoints for development
@app.get("/api/v1/features", tags=["Features"])
async def get_features():
    """Get available feature engineering capabilities."""
    return {
        "features": [
            "technical_indicators",
            "market_data_processing", 
            "sentiment_analysis",
            "risk_metrics"
        ],
        "status": "available",
        "count": 4
    }

@app.get("/api/v1/models", tags=["Models"])
async def get_models():
    """Get available ML models."""
    return {
        "models": [
            "price_prediction",
            "volatility_forecasting",
            "risk_assessment", 
            "sentiment_classification"
        ],
        "status": "available",
        "count": 4
    }

@app.get("/api/v1/status", tags=["Status"])
async def get_service_status():
    """Get detailed service status."""
    return {
        "service": "ml-pipeline-service",
        "status": "running",
        "uptime": "development mode",
        "version": "1.0.0",
        "features_enabled": True,
        "models_loaded": False,
        "database_connected": False,
        "redis_connected": False,
        "kafka_connected": False
    }

# Development server
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )