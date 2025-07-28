"""
Model Management Endpoints for ML Pipeline Service

API endpoints for model lifecycle management including versioning,
deployment, A/B testing, and monitoring.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
import structlog

from ....core.exceptions import (
    ModelManagementException,
    ModelNotFoundException,
    ModelVersionConflictException
)
from ....core.metrics import track_model_operation, metrics_collector
from ....management.model_registry import (
    model_registry,
    ModelStatus,
    DeploymentStrategy,
    ModelVersion,
    ModelDeployment,
    ABTestConfig
)

logger = structlog.get_logger("models-api")
router = APIRouter()


# Request/Response Models
class ModelRegistrationRequest(BaseModel):
    """Request model for registering a new model version."""
    model_name: str = Field(..., description="Name of the model")
    version: str = Field(..., description="Version identifier (e.g., v1.0.0)")
    model_type: str = Field(..., description="Type of model (e.g., random_forest)")
    training_id: str = Field(..., description="Training job ID")
    file_path: str = Field(..., description="Path to model file")
    feature_names: List[str] = Field(..., description="List of feature names")
    hyperparameters: Dict[str, Any] = Field(..., description="Model hyperparameters")
    training_metrics: Dict[str, float] = Field(..., description="Training performance metrics")
    validation_metrics: Dict[str, float] = Field(..., description="Validation performance metrics")
    created_by: str = Field(..., description="User who created the model")
    tags: List[str] = Field(default=[], description="Model tags")
    description: str = Field(default="", description="Model description")
    auto_promote: bool = Field(default=False, description="Auto-promote to staging")
    
    @validator("version")
    def validate_version(cls, v):
        if not v or not v.strip():
            raise ValueError("Version cannot be empty")
        return v.strip()
    
    @validator("training_metrics", "validation_metrics")
    def validate_metrics(cls, v):
        if not isinstance(v, dict) or not v:
            raise ValueError("Metrics must be a non-empty dictionary")
        return v


class ModelPromotionRequest(BaseModel):
    """Request model for model promotion."""
    target_status: ModelStatus = Field(..., description="Target status for promotion")
    promoted_by: str = Field(default="api", description="User promoting the model")


class ModelDeploymentRequest(BaseModel):
    """Request model for model deployment."""
    environment: str = Field(..., description="Target environment (staging/production)")
    strategy: DeploymentStrategy = Field(default=DeploymentStrategy.IMMEDIATE)
    traffic_percentage: float = Field(default=100.0, ge=0.0, le=100.0)
    deployed_by: str = Field(default="api", description="User deploying the model")
    config: Dict[str, Any] = Field(default={}, description="Deployment configuration")
    
    @validator("environment")
    def validate_environment(cls, v):
        valid_envs = ["development", "staging", "production"]
        if v.lower() not in valid_envs:
            raise ValueError(f"Environment must be one of: {valid_envs}")
        return v.lower()


class ABTestRequest(BaseModel):
    """Request model for A/B test creation."""
    control_version: str = Field(..., description="Control model version")
    treatment_version: str = Field(..., description="Treatment model version")
    traffic_split: float = Field(default=0.5, ge=0.0, le=1.0, description="Traffic split for treatment")
    duration_days: int = Field(default=14, ge=1, le=90, description="Test duration in days")
    success_metrics: List[str] = Field(default=["accuracy", "precision", "recall"])
    minimum_samples: int = Field(default=1000, ge=100, description="Minimum samples required")


class ModelVersionResponse(BaseModel):
    """Response model for model version."""
    model_name: str
    version: str
    model_type: str
    training_id: str
    file_path: str
    file_size: int
    file_hash: str
    feature_names: List[str]
    hyperparameters: Dict[str, Any]
    training_metrics: Dict[str, float]
    validation_metrics: Dict[str, float]
    created_at: datetime
    created_by: str
    status: ModelStatus
    tags: List[str]
    description: str


class ModelDeploymentResponse(BaseModel):
    """Response model for model deployment."""
    deployment_id: str
    model_name: str
    version: str
    strategy: DeploymentStrategy
    traffic_percentage: float
    environment: str
    deployed_at: datetime
    deployed_by: str
    config: Dict[str, Any]
    is_active: bool


class ABTestResponse(BaseModel):
    """Response model for A/B test."""
    test_id: str
    model_name: str
    control_version: str
    treatment_version: str
    traffic_split: float
    start_date: datetime
    end_date: Optional[datetime]
    success_metrics: List[str]
    minimum_samples: int
    statistical_power: float
    significance_level: float
    is_active: bool


# API Endpoints
@router.post("/register", response_model=ModelVersionResponse)
@track_model_operation("register")
async def register_model_version(request: ModelRegistrationRequest):
    """Register a new model version."""
    
    try:
        logger.info(
            "Model registration requested",
            model_name=request.model_name,
            version=request.version,
            model_type=request.model_type
        )
        
        model_version = await model_registry.register_model(
            model_name=request.model_name,
            version=request.version,
            model_type=request.model_type,
            training_id=request.training_id,
            file_path=request.file_path,
            feature_names=request.feature_names,
            hyperparameters=request.hyperparameters,
            training_metrics=request.training_metrics,
            validation_metrics=request.validation_metrics,
            created_by=request.created_by,
            tags=request.tags,
            description=request.description,
            auto_promote=request.auto_promote
        )
        
        return ModelVersionResponse(
            model_name=model_version.model_name,
            version=model_version.version,
            model_type=model_version.model_type,
            training_id=model_version.training_id,
            file_path=model_version.file_path,
            file_size=model_version.file_size,
            file_hash=model_version.file_hash,
            feature_names=model_version.feature_names,
            hyperparameters=model_version.hyperparameters,
            training_metrics=model_version.training_metrics,
            validation_metrics=model_version.validation_metrics,
            created_at=model_version.created_at,
            created_by=model_version.created_by,
            status=model_version.status,
            tags=model_version.tags,
            description=model_version.description
        )
        
    except ModelVersionConflictException as e:
        logger.error(f"Model version conflict: {e}")
        raise HTTPException(status_code=409, detail=str(e))
    
    except ModelManagementException as e:
        logger.error(f"Model registration failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during model registration: {e}")
        raise HTTPException(status_code=500, detail="Model registration failed")


@router.post("/{model_name}/{version}/promote")
@track_model_operation("promote")
async def promote_model(
    model_name: str,
    version: str,
    request: ModelPromotionRequest
):
    """Promote a model to a higher status level."""
    
    try:
        logger.info(
            "Model promotion requested",
            model_name=model_name,
            version=version,
            target_status=request.target_status
        )
        
        success = await model_registry.promote_model(
            model_name=model_name,
            version=version,
            target_status=request.target_status,
            promoted_by=request.promoted_by
        )
        
        if success:
            return {
                "message": f"Model {model_name}:{version} promoted to {request.target_status}",
                "model_name": model_name,
                "version": version,
                "status": request.target_status,
                "promoted_by": request.promoted_by,
                "promoted_at": datetime.utcnow()
            }
        else:
            raise HTTPException(status_code=400, detail="Model promotion failed")
            
    except ModelNotFoundException as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except ModelManagementException as e:
        logger.error(f"Model promotion failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during model promotion: {e}")
        raise HTTPException(status_code=500, detail="Model promotion failed")


@router.post("/{model_name}/{version}/deploy", response_model=ModelDeploymentResponse)
@track_model_operation("deploy")
async def deploy_model(
    model_name: str,
    version: str,
    request: ModelDeploymentRequest
):
    """Deploy a model version to an environment."""
    
    try:
        logger.info(
            "Model deployment requested",
            model_name=model_name,
            version=version,
            environment=request.environment,
            strategy=request.strategy
        )
        
        deployment = await model_registry.deploy_model(
            model_name=model_name,
            version=version,
            environment=request.environment,
            strategy=request.strategy,
            traffic_percentage=request.traffic_percentage,
            deployed_by=request.deployed_by,
            config=request.config
        )
        
        return ModelDeploymentResponse(
            deployment_id=deployment.deployment_id,
            model_name=deployment.model_name,
            version=deployment.version,
            strategy=deployment.strategy,
            traffic_percentage=deployment.traffic_percentage,
            environment=deployment.environment,
            deployed_at=deployment.deployed_at,
            deployed_by=deployment.deployed_by,
            config=deployment.config,
            is_active=deployment.is_active
        )
        
    except ModelNotFoundException as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except ModelManagementException as e:
        logger.error(f"Model deployment failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during model deployment: {e}")
        raise HTTPException(status_code=500, detail="Model deployment failed")


@router.post("/{model_name}/ab-test", response_model=ABTestResponse)
@track_model_operation("ab_test")
async def create_ab_test(
    model_name: str,
    request: ABTestRequest
):
    """Create A/B test between two model versions."""
    
    try:
        logger.info(
            "A/B test creation requested",
            model_name=model_name,
            control_version=request.control_version,
            treatment_version=request.treatment_version,
            traffic_split=request.traffic_split
        )
        
        ab_test = await model_registry.create_ab_test(
            model_name=model_name,
            control_version=request.control_version,
            treatment_version=request.treatment_version,
            traffic_split=request.traffic_split,
            duration_days=request.duration_days,
            success_metrics=request.success_metrics,
            minimum_samples=request.minimum_samples
        )
        
        return ABTestResponse(
            test_id=ab_test.test_id,
            model_name=ab_test.model_name,
            control_version=ab_test.control_version,
            treatment_version=ab_test.treatment_version,
            traffic_split=ab_test.traffic_split,
            start_date=ab_test.start_date,
            end_date=ab_test.end_date,
            success_metrics=ab_test.success_metrics,
            minimum_samples=ab_test.minimum_samples,
            statistical_power=ab_test.statistical_power,
            significance_level=ab_test.significance_level,
            is_active=ab_test.is_active
        )
        
    except ModelNotFoundException as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except ModelManagementException as e:
        logger.error(f"A/B test creation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during A/B test creation: {e}")
        raise HTTPException(status_code=500, detail="A/B test creation failed")


@router.get("/{model_name}/versions", response_model=List[ModelVersionResponse])
async def list_model_versions(
    model_name: str,
    status: Optional[ModelStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of versions")
):
    """List model versions with optional filtering."""
    
    try:
        versions = await model_registry.list_model_versions(
            model_name=model_name,
            status_filter=status,
            limit=limit
        )
        
        return [
            ModelVersionResponse(
                model_name=v.model_name,
                version=v.version,
                model_type=v.model_type,
                training_id=v.training_id,
                file_path=v.file_path,
                file_size=v.file_size,
                file_hash=v.file_hash,
                feature_names=v.feature_names,
                hyperparameters=v.hyperparameters,
                training_metrics=v.training_metrics,
                validation_metrics=v.validation_metrics,
                created_at=v.created_at,
                created_by=v.created_by,
                status=v.status,
                tags=v.tags,
                description=v.description
            )
            for v in versions
        ]
        
    except Exception as e:
        logger.error(f"Failed to list model versions: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve model versions")


@router.get("/{model_name}/{version}", response_model=ModelVersionResponse)
async def get_model_version(model_name: str, version: str):
    """Get specific model version details."""
    
    try:
        model_version = await model_registry.get_model_version(model_name, version)
        
        if not model_version:
            raise HTTPException(status_code=404, detail="Model version not found")
        
        return ModelVersionResponse(
            model_name=model_version.model_name,
            version=model_version.version,
            model_type=model_version.model_type,
            training_id=model_version.training_id,
            file_path=model_version.file_path,
            file_size=model_version.file_size,
            file_hash=model_version.file_hash,
            feature_names=model_version.feature_names,
            hyperparameters=model_version.hyperparameters,
            training_metrics=model_version.training_metrics,
            validation_metrics=model_version.validation_metrics,
            created_at=model_version.created_at,
            created_by=model_version.created_by,
            status=model_version.status,
            tags=model_version.tags,
            description=model_version.description
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get model version: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve model version")


@router.get("/{model_name}/latest")
async def get_latest_model_version(
    model_name: str,
    status: ModelStatus = Query(ModelStatus.PRODUCTION, description="Status filter")
):
    """Get latest model version by status."""
    
    try:
        latest_version = await model_registry.get_latest_model_version(model_name, status)
        
        if not latest_version:
            raise HTTPException(
                status_code=404, 
                detail=f"No {status} model found for {model_name}"
            )
        
        return ModelVersionResponse(
            model_name=latest_version.model_name,
            version=latest_version.version,
            model_type=latest_version.model_type,
            training_id=latest_version.training_id,
            file_path=latest_version.file_path,
            file_size=latest_version.file_size,
            file_hash=latest_version.file_hash,
            feature_names=latest_version.feature_names,
            hyperparameters=latest_version.hyperparameters,
            training_metrics=latest_version.training_metrics,
            validation_metrics=latest_version.validation_metrics,
            created_at=latest_version.created_at,
            created_by=latest_version.created_by,
            status=latest_version.status,
            tags=latest_version.tags,
            description=latest_version.description
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get latest model version: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve latest model version")


@router.get("/{model_name}/deployments", response_model=List[ModelDeploymentResponse])
async def get_model_deployments(
    model_name: str,
    environment: Optional[str] = Query(None, description="Filter by environment")
):
    """Get active deployments for a model."""
    
    try:
        deployments = await model_registry.get_active_deployments(model_name, environment)
        
        return [
            ModelDeploymentResponse(
                deployment_id=d.deployment_id,
                model_name=d.model_name,
                version=d.version,
                strategy=d.strategy,
                traffic_percentage=d.traffic_percentage,
                environment=d.environment,
                deployed_at=d.deployed_at,
                deployed_by=d.deployed_by,
                config=d.config,
                is_active=d.is_active
            )
            for d in deployments
        ]
        
    except Exception as e:
        logger.error(f"Failed to get model deployments: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve deployments")


@router.get("/{model_name}/{version}/metrics")
async def get_model_metrics(
    model_name: str,
    version: str,
    start_date: Optional[datetime] = Query(None, description="Start date for metrics"),
    end_date: Optional[datetime] = Query(None, description="End date for metrics")
):
    """Get model performance metrics and deployment information."""
    
    try:
        metrics = await model_registry.get_model_metrics(
            model_name=model_name,
            version=version,
            start_date=start_date,
            end_date=end_date
        )
        
        if not metrics:
            raise HTTPException(status_code=404, detail="Model metrics not found")
        
        return metrics
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get model metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve model metrics")


@router.delete("/{model_name}/{version}")
async def archive_model_version(
    model_name: str,
    version: str,
    archived_by: str = Query(..., description="User archiving the model")
):
    """Archive a model version (soft delete)."""
    
    try:
        logger.info(
            "Model archival requested",
            model_name=model_name,
            version=version,
            archived_by=archived_by
        )
        
        # Promote to archived status
        success = await model_registry.promote_model(
            model_name=model_name,
            version=version,
            target_status=ModelStatus.ARCHIVED,
            promoted_by=archived_by
        )
        
        if success:
            return {
                "message": f"Model {model_name}:{version} archived successfully",
                "archived_at": datetime.utcnow(),
                "archived_by": archived_by
            }
        else:
            raise HTTPException(status_code=400, detail="Model archival failed")
            
    except ModelNotFoundException as e:
        logger.error(f"Model not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    
    except ModelManagementException as e:
        logger.error(f"Model archival failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Unexpected error during model archival: {e}")
        raise HTTPException(status_code=500, detail="Model archival failed")


@router.get("/registry/health")
async def get_registry_health():
    """Get model registry health status."""
    
    try:
        # This would implement actual health checks
        # For now, return basic status
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow(),
            "version": "1.0.0",
            "components": {
                "registry": "operational",
                "cache": "operational", 
                "storage": "operational"
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")