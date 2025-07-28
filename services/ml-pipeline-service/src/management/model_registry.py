"""
Model Registry

Comprehensive model lifecycle management with versioning, metadata tracking,
A/B testing capabilities, and deployment monitoring.
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
import json
import hashlib
from pathlib import Path
from dataclasses import dataclass, asdict
import asyncio
import structlog

from ..core.exceptions import (
    ModelManagementException,
    ModelNotFoundException,
    ModelVersionConflictException
)
from ..core.redis_client import get_redis_manager
from ..config.settings import get_settings

logger = structlog.get_logger("model-registry")


class ModelStatus(str, Enum):
    """Model lifecycle status."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


class DeploymentStrategy(str, Enum):
    """Deployment strategies."""
    BLUE_GREEN = "blue_green"
    CANARY = "canary"
    A_B_TEST = "a_b_test"
    ROLLING = "rolling"
    IMMEDIATE = "immediate"


@dataclass
class ModelVersion:
    """Model version metadata."""
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
    status: ModelStatus = ModelStatus.DEVELOPMENT
    tags: List[str] = None
    description: str = ""
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class ModelDeployment:
    """Model deployment configuration."""
    deployment_id: str
    model_name: str
    version: str
    strategy: DeploymentStrategy
    traffic_percentage: float
    environment: str
    deployed_at: datetime
    deployed_by: str
    config: Dict[str, Any] = None
    is_active: bool = True
    
    def __post_init__(self):
        if self.config is None:
            self.config = {}


@dataclass
class ABTestConfig:
    """A/B testing configuration."""
    test_id: str
    model_name: str
    control_version: str
    treatment_version: str
    traffic_split: float  # 0.0 to 1.0
    start_date: datetime
    end_date: Optional[datetime]
    success_metrics: List[str]
    minimum_samples: int
    statistical_power: float = 0.8
    significance_level: float = 0.05
    is_active: bool = True


class ModelRegistry:
    """Comprehensive model lifecycle management system."""
    
    def __init__(self):
        self.settings = get_settings()
        self.redis_manager = get_redis_manager()
        
        # Registry configuration
        self.models_dir = Path("models")
        self.registry_dir = Path("registry")
        self.registry_dir.mkdir(exist_ok=True)
        
        # Cache keys
        self.cache_keys = {
            "model_versions": "registry:versions",
            "deployments": "registry:deployments", 
            "ab_tests": "registry:ab_tests",
            "model_metadata": "registry:metadata"
        }
        
        # In-memory caches
        self._model_versions_cache: Dict[str, List[ModelVersion]] = {}
        self._deployments_cache: Dict[str, List[ModelDeployment]] = {}
        self._ab_tests_cache: Dict[str, ABTestConfig] = {}
        
        # Cache refresh intervals
        self._cache_ttl = 300  # 5 minutes
        self._last_cache_refresh = datetime.utcnow() - timedelta(minutes=10)
    
    async def register_model(
        self,
        model_name: str,
        version: str,
        model_type: str,
        training_id: str,
        file_path: str,
        feature_names: List[str],
        hyperparameters: Dict[str, Any],
        training_metrics: Dict[str, float],
        validation_metrics: Dict[str, float],
        created_by: str,
        tags: List[str] = None,
        description: str = "",
        auto_promote: bool = False
    ) -> ModelVersion:
        """Register a new model version."""
        
        try:
            logger.info(
                f"Registering model version",
                model_name=model_name,
                version=version,
                training_id=training_id
            )
            
            # Validate file exists
            file_path_obj = Path(file_path)
            if not file_path_obj.exists():
                raise ModelManagementException(f"Model file not found: {file_path}")
            
            # Check if version already exists
            existing_versions = await self.list_model_versions(model_name)
            if any(v.version == version for v in existing_versions):
                raise ModelVersionConflictException(model_name, version)
            
            # Calculate file hash and size
            file_hash = self._calculate_file_hash(file_path)
            file_size = file_path_obj.stat().st_size
            
            # Create model version
            model_version = ModelVersion(
                model_name=model_name,
                version=version,
                model_type=model_type,
                training_id=training_id,
                file_path=str(file_path),
                file_size=file_size,
                file_hash=file_hash,
                feature_names=feature_names,
                hyperparameters=hyperparameters,
                training_metrics=training_metrics,
                validation_metrics=validation_metrics,
                created_at=datetime.utcnow(),
                created_by=created_by,
                tags=tags or [],
                description=description
            )
            
            # Store in registry
            await self._store_model_version(model_version)
            
            # Auto-promote if requested
            if auto_promote:
                await self.promote_model(model_name, version, ModelStatus.STAGING)
            
            # Invalidate cache
            await self._invalidate_cache("model_versions", model_name)
            
            logger.info(
                f"Model version registered successfully",
                model_name=model_name,
                version=version,
                file_size_mb=round(file_size / 1024 / 1024, 2)
            )
            
            return model_version
            
        except Exception as e:
            logger.error(f"Model registration failed: {e}")
            if isinstance(e, (ModelManagementException, ModelVersionConflictException)):
                raise
            raise ModelManagementException(f"Registration failed: {str(e)}")
    
    async def promote_model(
        self,
        model_name: str,
        version: str,
        target_status: ModelStatus,
        promoted_by: str = "system"
    ) -> bool:
        """Promote a model to a higher status level."""
        
        try:
            logger.info(
                f"Promoting model",
                model_name=model_name,
                version=version,
                target_status=target_status
            )
            
            # Get model version
            model_version = await self.get_model_version(model_name, version)
            if not model_version:
                raise ModelNotFoundException(model_name, version)
            
            # Validate promotion path
            current_status = model_version.status
            if not self._is_valid_promotion(current_status, target_status):
                raise ModelManagementException(
                    f"Invalid promotion from {current_status} to {target_status}"
                )
            
            # Update status
            model_version.status = target_status
            await self._store_model_version(model_version)
            
            # Log promotion
            await self._log_model_event(
                model_name=model_name,
                version=version,
                event_type="promotion",
                details={
                    "from_status": current_status,
                    "to_status": target_status,
                    "promoted_by": promoted_by
                }
            )
            
            # If promoting to production, handle existing production models
            if target_status == ModelStatus.PRODUCTION:
                await self._handle_production_promotion(model_name, version)
            
            # Invalidate cache
            await self._invalidate_cache("model_versions", model_name)
            
            logger.info(
                f"Model promotion completed",
                model_name=model_name,
                version=version,
                status=target_status
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Model promotion failed: {e}")
            if isinstance(e, (ModelNotFoundException, ModelManagementException)):
                raise
            raise ModelManagementException(f"Promotion failed: {str(e)}")
    
    async def deploy_model(
        self,
        model_name: str,
        version: str,
        environment: str,
        strategy: DeploymentStrategy = DeploymentStrategy.IMMEDIATE,
        traffic_percentage: float = 100.0,
        deployed_by: str = "system",
        config: Dict[str, Any] = None
    ) -> ModelDeployment:
        """Deploy a model version to an environment."""
        
        try:
            logger.info(
                f"Deploying model",
                model_name=model_name,
                version=version,
                environment=environment,
                strategy=strategy
            )
            
            # Validate model version exists
            model_version = await self.get_model_version(model_name, version)
            if not model_version:
                raise ModelNotFoundException(model_name, version)
            
            # Validate model is ready for deployment
            if model_version.status == ModelStatus.DEVELOPMENT:
                raise ModelManagementException(
                    f"Cannot deploy development model {model_name}:{version}"
                )
            
            # Create deployment
            deployment_id = f"{model_name}_{version}_{environment}_{int(datetime.utcnow().timestamp())}"
            
            deployment = ModelDeployment(
                deployment_id=deployment_id,
                model_name=model_name,
                version=version,
                strategy=strategy,
                traffic_percentage=traffic_percentage,
                environment=environment,
                deployed_at=datetime.utcnow(),
                deployed_by=deployed_by,
                config=config or {}
            )
            
            # Handle deployment strategy
            await self._execute_deployment_strategy(deployment)
            
            # Store deployment record
            await self._store_deployment(deployment)
            
            # Log deployment
            await self._log_model_event(
                model_name=model_name,
                version=version,
                event_type="deployment",
                details={
                    "deployment_id": deployment_id,
                    "environment": environment,
                    "strategy": strategy,
                    "traffic_percentage": traffic_percentage
                }
            )
            
            # Invalidate cache
            await self._invalidate_cache("deployments", model_name)
            
            logger.info(
                f"Model deployment completed",
                deployment_id=deployment_id,
                strategy=strategy
            )
            
            return deployment
            
        except Exception as e:
            logger.error(f"Model deployment failed: {e}")
            if isinstance(e, (ModelNotFoundException, ModelManagementException)):
                raise
            raise ModelManagementException(f"Deployment failed: {str(e)}")
    
    async def create_ab_test(
        self,
        model_name: str,
        control_version: str,
        treatment_version: str,
        traffic_split: float = 0.5,
        duration_days: int = 14,
        success_metrics: List[str] = None,
        minimum_samples: int = 1000
    ) -> ABTestConfig:
        """Create A/B test between two model versions."""
        
        try:
            logger.info(
                f"Creating A/B test",
                model_name=model_name,
                control_version=control_version,
                treatment_version=treatment_version,
                traffic_split=traffic_split
            )
            
            # Validate both model versions exist
            control_model = await self.get_model_version(model_name, control_version)
            treatment_model = await self.get_model_version(model_name, treatment_version)
            
            if not control_model:
                raise ModelNotFoundException(model_name, control_version)
            if not treatment_model:
                raise ModelNotFoundException(model_name, treatment_version)
            
            # Create test configuration
            test_id = f"ab_test_{model_name}_{int(datetime.utcnow().timestamp())}"
            start_date = datetime.utcnow()
            end_date = start_date + timedelta(days=duration_days)
            
            ab_test = ABTestConfig(
                test_id=test_id,
                model_name=model_name,
                control_version=control_version,
                treatment_version=treatment_version,
                traffic_split=traffic_split,
                start_date=start_date,
                end_date=end_date,
                success_metrics=success_metrics or ["accuracy", "precision", "recall"],
                minimum_samples=minimum_samples
            )
            
            # Store A/B test configuration
            await self._store_ab_test(ab_test)
            
            # Deploy both versions with traffic splitting
            await self.deploy_model(
                model_name=model_name,
                version=control_version,
                environment="production",
                strategy=DeploymentStrategy.A_B_TEST,
                traffic_percentage=(1 - traffic_split) * 100
            )
            
            await self.deploy_model(
                model_name=model_name,
                version=treatment_version,
                environment="production",
                strategy=DeploymentStrategy.A_B_TEST,
                traffic_percentage=traffic_split * 100
            )
            
            # Log A/B test creation
            await self._log_model_event(
                model_name=model_name,
                version=treatment_version,
                event_type="ab_test_start",
                details={
                    "test_id": test_id,
                    "control_version": control_version,
                    "traffic_split": traffic_split,
                    "duration_days": duration_days
                }
            )
            
            # Invalidate cache
            await self._invalidate_cache("ab_tests", model_name)
            
            logger.info(f"A/B test created successfully", test_id=test_id)
            
            return ab_test
            
        except Exception as e:
            logger.error(f"A/B test creation failed: {e}")
            if isinstance(e, (ModelNotFoundException, ModelManagementException)):
                raise
            raise ModelManagementException(f"A/B test creation failed: {str(e)}")
    
    async def list_model_versions(
        self,
        model_name: str,
        status_filter: Optional[ModelStatus] = None,
        limit: int = 50
    ) -> List[ModelVersion]:
        """List model versions with optional filtering."""
        
        try:
            # Check cache first
            await self._refresh_cache_if_needed()
            
            if model_name in self._model_versions_cache:
                versions = self._model_versions_cache[model_name]
            else:
                versions = await self._load_model_versions(model_name)
                self._model_versions_cache[model_name] = versions
            
            # Apply status filter
            if status_filter:
                versions = [v for v in versions if v.status == status_filter]
            
            # Sort by creation date (newest first) and limit
            versions = sorted(versions, key=lambda x: x.created_at, reverse=True)[:limit]
            
            return versions
            
        except Exception as e:
            logger.error(f"Failed to list model versions: {e}")
            return []
    
    async def get_model_version(
        self,
        model_name: str,
        version: str
    ) -> Optional[ModelVersion]:
        """Get specific model version."""
        
        try:
            versions = await self.list_model_versions(model_name)
            for model_version in versions:
                if model_version.version == version:
                    return model_version
            return None
            
        except Exception as e:
            logger.error(f"Failed to get model version: {e}")
            return None
    
    async def get_latest_model_version(
        self,
        model_name: str,
        status: ModelStatus = ModelStatus.PRODUCTION
    ) -> Optional[ModelVersion]:
        """Get latest model version by status."""
        
        try:
            versions = await self.list_model_versions(model_name, status_filter=status)
            return versions[0] if versions else None
            
        except Exception as e:
            logger.error(f"Failed to get latest model version: {e}")
            return None
    
    async def get_active_deployments(
        self,
        model_name: str,
        environment: Optional[str] = None
    ) -> List[ModelDeployment]:
        """Get active deployments for a model."""
        
        try:
            # Check cache first
            await self._refresh_cache_if_needed()
            
            if model_name in self._deployments_cache:
                deployments = self._deployments_cache[model_name]
            else:
                deployments = await self._load_deployments(model_name)
                self._deployments_cache[model_name] = deployments
            
            # Filter active deployments
            active_deployments = [d for d in deployments if d.is_active]
            
            # Filter by environment if specified
            if environment:
                active_deployments = [d for d in active_deployments if d.environment == environment]
            
            return active_deployments
            
        except Exception as e:
            logger.error(f"Failed to get active deployments: {e}")
            return []
    
    async def get_model_metrics(
        self,
        model_name: str,
        version: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get model performance metrics."""
        
        try:
            # This would integrate with monitoring systems
            # For now, return basic metrics from model version
            
            model_version = await self.get_model_version(model_name, version)
            if not model_version:
                return {}
            
            metrics = {
                "training_metrics": model_version.training_metrics,
                "validation_metrics": model_version.validation_metrics,
                "model_info": {
                    "status": model_version.status,
                    "created_at": model_version.created_at.isoformat(),
                    "feature_count": len(model_version.feature_names),
                    "file_size_mb": round(model_version.file_size / 1024 / 1024, 2)
                }
            }
            
            # Add deployment metrics if available
            deployments = await self.get_active_deployments(model_name)
            version_deployments = [d for d in deployments if d.version == version]
            
            if version_deployments:
                metrics["deployment_info"] = [
                    {
                        "environment": d.environment,
                        "traffic_percentage": d.traffic_percentage,
                        "deployed_at": d.deployed_at.isoformat()
                    }
                    for d in version_deployments
                ]
            
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to get model metrics: {e}")
            return {}
    
    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of model file."""
        
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    def _is_valid_promotion(
        self,
        current_status: ModelStatus,
        target_status: ModelStatus
    ) -> bool:
        """Validate promotion path."""
        
        valid_promotions = {
            ModelStatus.DEVELOPMENT: [ModelStatus.STAGING, ModelStatus.DEPRECATED],
            ModelStatus.STAGING: [ModelStatus.PRODUCTION, ModelStatus.DEPRECATED],
            ModelStatus.PRODUCTION: [ModelStatus.DEPRECATED, ModelStatus.ARCHIVED],
            ModelStatus.DEPRECATED: [ModelStatus.ARCHIVED]
        }
        
        return target_status in valid_promotions.get(current_status, [])
    
    async def _handle_production_promotion(self, model_name: str, version: str):
        """Handle promotion to production - deprecate other production versions."""
        
        try:
            # Get all production versions for this model
            production_versions = await self.list_model_versions(
                model_name, 
                status_filter=ModelStatus.PRODUCTION
            )
            
            # Deprecate other production versions
            for prod_version in production_versions:
                if prod_version.version != version:
                    prod_version.status = ModelStatus.DEPRECATED
                    await self._store_model_version(prod_version)
                    
                    logger.info(
                        f"Deprecated previous production version",
                        model_name=model_name,
                        version=prod_version.version
                    )
                    
        except Exception as e:
            logger.error(f"Failed to handle production promotion: {e}")
    
    async def _execute_deployment_strategy(self, deployment: ModelDeployment):
        """Execute specific deployment strategy."""
        
        # This would integrate with actual deployment systems
        # For now, just log the strategy
        
        logger.info(
            f"Executing deployment strategy: {deployment.strategy}",
            deployment_id=deployment.deployment_id,
            traffic_percentage=deployment.traffic_percentage
        )
        
        # Strategy-specific logic would go here
        # - Blue/Green: Switch traffic after validation
        # - Canary: Gradual traffic increase
        # - A/B Test: Split traffic
        # - Rolling: Update instances gradually
        # - Immediate: Full deployment
    
    async def _store_model_version(self, model_version: ModelVersion):
        """Store model version in registry."""
        
        registry_file = self.registry_dir / f"{model_version.model_name}_versions.json"
        
        # Load existing versions
        versions = []
        if registry_file.exists():
            with open(registry_file, 'r') as f:
                versions_data = json.load(f)
                versions = [self._dict_to_model_version(v) for v in versions_data]
        
        # Update or add version
        updated = False
        for i, v in enumerate(versions):
            if v.version == model_version.version:
                versions[i] = model_version
                updated = True
                break
        
        if not updated:
            versions.append(model_version)
        
        # Save to file
        with open(registry_file, 'w') as f:
            json.dump([self._model_version_to_dict(v) for v in versions], f, indent=2)
        
        # Cache in Redis
        await self.redis_manager.cache_features(
            f"{self.cache_keys['model_versions']}:{model_version.model_name}",
            [self._model_version_to_dict(v) for v in versions],
            ttl=self._cache_ttl
        )
    
    async def _store_deployment(self, deployment: ModelDeployment):
        """Store deployment record."""
        
        registry_file = self.registry_dir / f"{deployment.model_name}_deployments.json"
        
        # Load existing deployments
        deployments = []
        if registry_file.exists():
            with open(registry_file, 'r') as f:
                deployments_data = json.load(f)
                deployments = [self._dict_to_deployment(d) for d in deployments_data]
        
        deployments.append(deployment)
        
        # Save to file
        with open(registry_file, 'w') as f:
            json.dump([self._deployment_to_dict(d) for d in deployments], f, indent=2)
        
        # Cache in Redis
        await self.redis_manager.cache_features(
            f"{self.cache_keys['deployments']}:{deployment.model_name}",
            [self._deployment_to_dict(d) for d in deployments],
            ttl=self._cache_ttl
        )
    
    async def _store_ab_test(self, ab_test: ABTestConfig):
        """Store A/B test configuration."""
        
        registry_file = self.registry_dir / "ab_tests.json"
        
        # Load existing tests
        tests = []
        if registry_file.exists():
            with open(registry_file, 'r') as f:
                tests_data = json.load(f)
                tests = [self._dict_to_ab_test(t) for t in tests_data]
        
        tests.append(ab_test)
        
        # Save to file
        with open(registry_file, 'w') as f:
            json.dump([self._ab_test_to_dict(t) for t in tests], f, indent=2)
        
        # Cache in Redis
        await self.redis_manager.cache_features(
            f"{self.cache_keys['ab_tests']}:{ab_test.model_name}",
            [self._ab_test_to_dict(t) for t in tests if t.model_name == ab_test.model_name],
            ttl=self._cache_ttl
        )
    
    async def _load_model_versions(self, model_name: str) -> List[ModelVersion]:
        """Load model versions from storage."""
        
        # Try Redis first
        cached_data = await self.redis_manager.get_cached_features(
            f"{self.cache_keys['model_versions']}:{model_name}"
        )
        
        if cached_data:
            return [self._dict_to_model_version(v) for v in cached_data]
        
        # Fallback to file storage
        registry_file = self.registry_dir / f"{model_name}_versions.json"
        if registry_file.exists():
            with open(registry_file, 'r') as f:
                versions_data = json.load(f)
                return [self._dict_to_model_version(v) for v in versions_data]
        
        return []
    
    async def _load_deployments(self, model_name: str) -> List[ModelDeployment]:
        """Load deployments from storage."""
        
        # Try Redis first
        cached_data = await self.redis_manager.get_cached_features(
            f"{self.cache_keys['deployments']}:{model_name}"
        )
        
        if cached_data:
            return [self._dict_to_deployment(d) for d in cached_data]
        
        # Fallback to file storage
        registry_file = self.registry_dir / f"{model_name}_deployments.json"
        if registry_file.exists():
            with open(registry_file, 'r') as f:
                deployments_data = json.load(f)
                return [self._dict_to_deployment(d) for d in deployments_data]
        
        return []
    
    async def _log_model_event(
        self,
        model_name: str,
        version: str,
        event_type: str,
        details: Dict[str, Any]
    ):
        """Log model lifecycle events."""
        
        event = {
            "model_name": model_name,
            "version": version,
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "details": details
        }
        
        # Log to structured logger
        logger.info(f"Model event: {event_type}", **event)
        
        # Store in Redis for event history
        await self.redis_manager.cache_features(
            f"model_events:{model_name}:{version}:{int(datetime.utcnow().timestamp())}",
            event,
            ttl=86400 * 30  # 30 days
        )
    
    async def _refresh_cache_if_needed(self):
        """Refresh cache if TTL expired."""
        
        now = datetime.utcnow()
        if (now - self._last_cache_refresh).total_seconds() > self._cache_ttl:
            self._model_versions_cache.clear()
            self._deployments_cache.clear()
            self._ab_tests_cache.clear()
            self._last_cache_refresh = now
    
    async def _invalidate_cache(self, cache_type: str, model_name: str):
        """Invalidate specific cache entries."""
        
        if cache_type == "model_versions" and model_name in self._model_versions_cache:
            del self._model_versions_cache[model_name]
        elif cache_type == "deployments" and model_name in self._deployments_cache:
            del self._deployments_cache[model_name]
        elif cache_type == "ab_tests" and model_name in self._ab_tests_cache:
            # Remove all A/B tests for this model
            to_remove = [k for k in self._ab_tests_cache.keys() if k.startswith(model_name)]
            for key in to_remove:
                del self._ab_tests_cache[key]
    
    # Serialization helpers
    def _model_version_to_dict(self, model_version: ModelVersion) -> Dict[str, Any]:
        data = asdict(model_version)
        data['created_at'] = model_version.created_at.isoformat()
        return data
    
    def _dict_to_model_version(self, data: Dict[str, Any]) -> ModelVersion:
        data['created_at'] = datetime.fromisoformat(data['created_at'])
        return ModelVersion(**data)
    
    def _deployment_to_dict(self, deployment: ModelDeployment) -> Dict[str, Any]:
        data = asdict(deployment)
        data['deployed_at'] = deployment.deployed_at.isoformat()
        return data
    
    def _dict_to_deployment(self, data: Dict[str, Any]) -> ModelDeployment:
        data['deployed_at'] = datetime.fromisoformat(data['deployed_at'])
        return ModelDeployment(**data)
    
    def _ab_test_to_dict(self, ab_test: ABTestConfig) -> Dict[str, Any]:
        data = asdict(ab_test)
        data['start_date'] = ab_test.start_date.isoformat()
        if ab_test.end_date:
            data['end_date'] = ab_test.end_date.isoformat()
        return data
    
    def _dict_to_ab_test(self, data: Dict[str, Any]) -> ABTestConfig:
        data['start_date'] = datetime.fromisoformat(data['start_date'])
        if data.get('end_date'):
            data['end_date'] = datetime.fromisoformat(data['end_date'])
        return ABTestConfig(**data)


# Global model registry instance
model_registry = ModelRegistry()