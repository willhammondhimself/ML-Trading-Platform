"""
Settings Configuration for ML Pipeline Service

Environment-based configuration management using Pydantic Settings.
Supports development, testing, and production environments.
"""

from functools import lru_cache
from typing import List, Optional, Any, Dict
import os
from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic import Field, validator


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Application
    APP_NAME: str = "ML Pipeline Service"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")
    DEBUG: bool = Field(default=True, env="DEBUG")
    
    # Server
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8002, env="PORT")
    
    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"],
        env="CORS_ORIGINS"
    )
    
    # Database (PostgreSQL)
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://ml_user:ml_password@localhost:5432/ml_trading",
        env="DATABASE_URL"
    )
    DATABASE_POOL_SIZE: int = Field(default=10, env="DATABASE_POOL_SIZE")
    DATABASE_MAX_OVERFLOW: int = Field(default=20, env="DATABASE_MAX_OVERFLOW")
    DATABASE_ECHO: bool = Field(default=False, env="DATABASE_ECHO")
    
    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/2", env="REDIS_URL")
    REDIS_MAX_CONNECTIONS: int = Field(default=100, env="REDIS_MAX_CONNECTIONS")
    REDIS_RETRY_ON_TIMEOUT: bool = Field(default=True, env="REDIS_RETRY_ON_TIMEOUT")
    
    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: List[str] = Field(
        default=["localhost:9092"], 
        env="KAFKA_BOOTSTRAP_SERVERS"
    )
    KAFKA_GROUP_ID: str = Field(default="ml-pipeline-service", env="KAFKA_GROUP_ID")
    KAFKA_AUTO_OFFSET_RESET: str = Field(default="latest", env="KAFKA_AUTO_OFFSET_RESET")
    
    # ML Model Settings
    MODEL_REGISTRY_PATH: str = Field(
        default="./models", 
        env="MODEL_REGISTRY_PATH"
    )
    FEATURE_STORE_PATH: str = Field(
        default="./features", 
        env="FEATURE_STORE_PATH"
    )
    DEFAULT_MODEL_VERSION: str = Field(default="latest", env="DEFAULT_MODEL_VERSION")
    
    # Feature Engineering
    FEATURE_CACHE_TTL: int = Field(default=300, env="FEATURE_CACHE_TTL")  # 5 minutes
    TECHNICAL_INDICATORS: List[str] = Field(
        default=["sma", "ema", "rsi", "macd", "bollinger", "atr", "stoch"],
        env="TECHNICAL_INDICATORS"
    )
    LOOKBACK_PERIODS: List[int] = Field(
        default=[5, 10, 14, 20, 50, 200],
        env="LOOKBACK_PERIODS"
    )
    
    # Training Configuration
    TRAINING_DATA_DAYS: int = Field(default=365, env="TRAINING_DATA_DAYS")  # 1 year
    VALIDATION_SPLIT: float = Field(default=0.2, env="VALIDATION_SPLIT")
    TEST_SPLIT: float = Field(default=0.1, env="TEST_SPLIT")
    MAX_TRAINING_TIME: int = Field(default=3600, env="MAX_TRAINING_TIME")  # 1 hour
    
    # Hyperparameter Optimization
    OPTUNA_N_TRIALS: int = Field(default=100, env="OPTUNA_N_TRIALS")
    OPTUNA_TIMEOUT: int = Field(default=1800, env="OPTUNA_TIMEOUT")  # 30 minutes
    
    # Inference Settings
    PREDICTION_BATCH_SIZE: int = Field(default=1000, env="PREDICTION_BATCH_SIZE")
    INFERENCE_TIMEOUT: float = Field(default=1.0, env="INFERENCE_TIMEOUT")  # 1 second
    MODEL_WARMUP_REQUESTS: int = Field(default=10, env="MODEL_WARMUP_REQUESTS")
    
    # Monitoring and Metrics
    METRICS_PORT: int = Field(default=8003, env="METRICS_PORT")
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    STRUCTURED_LOGGING: bool = Field(default=True, env="STRUCTURED_LOGGING")
    
    # External Services
    TRADING_SERVICE_URL: str = Field(
        default="http://localhost:3001", 
        env="TRADING_SERVICE_URL"
    )
    MARKET_DATA_SERVICE_URL: str = Field(
        default="http://localhost:8000", 
        env="MARKET_DATA_SERVICE_URL"
    )
    ML_ANALYTICS_SERVICE_URL: str = Field(
        default="http://localhost:8001", 
        env="ML_ANALYTICS_SERVICE_URL"
    )
    
    # Security
    SECRET_KEY: str = Field(default="your-secret-key-here", env="SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    
    # Performance
    WORKER_PROCESSES: int = Field(default=1, env="WORKER_PROCESSES")
    WORKER_CONNECTIONS: int = Field(default=1000, env="WORKER_CONNECTIONS")
    
    @validator("CORS_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    @validator("KAFKA_BOOTSTRAP_SERVERS", pre=True)
    def parse_kafka_servers(cls, v):
        """Parse Kafka bootstrap servers from string or list."""
        if isinstance(v, str):
            return [server.strip() for server in v.split(",")]
        return v
    
    @validator("TECHNICAL_INDICATORS", pre=True)
    def parse_technical_indicators(cls, v):
        """Parse technical indicators from string or list."""
        if isinstance(v, str):
            return [indicator.strip() for indicator in v.split(",")]
        return v
    
    @validator("LOOKBACK_PERIODS", pre=True)
    def parse_lookback_periods(cls, v):
        """Parse lookback periods from string or list."""
        if isinstance(v, str):
            return [int(period.strip()) for period in v.split(",")]
        return v
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT.lower() == "production"
    
    @property
    def is_testing(self) -> bool:
        """Check if running in testing environment."""
        return self.ENVIRONMENT.lower() == "testing"
    
    @property
    def database_url_sync(self) -> str:
        """Get synchronous database URL for migrations."""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    
    def get_model_path(self, model_name: str, version: str = None) -> Path:
        """Get path for a specific model."""
        version = version or self.DEFAULT_MODEL_VERSION
        return Path(self.MODEL_REGISTRY_PATH) / model_name / version
    
    def get_feature_path(self, feature_set: str) -> Path:
        """Get path for a specific feature set."""
        return Path(self.FEATURE_STORE_PATH) / feature_set
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Production settings override
class ProductionSettings(Settings):
    """Production-specific settings."""
    DEBUG: bool = False
    LOG_LEVEL: str = "WARNING"
    DATABASE_ECHO: bool = False
    
    # Performance optimizations for production
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 50
    REDIS_MAX_CONNECTIONS: int = 200
    
    # Security
    STRUCTURED_LOGGING: bool = True


# Testing settings override  
class TestingSettings(Settings):
    """Testing-specific settings."""
    ENVIRONMENT: str = "testing"
    DATABASE_URL: str = "postgresql+asyncpg://test_user:test_pass@localhost:5432/test_ml_trading"
    REDIS_URL: str = "redis://localhost:6379/15"  # Different DB for tests
    
    # Faster settings for testing
    FEATURE_CACHE_TTL: int = 60
    TRAINING_DATA_DAYS: int = 30
    OPTUNA_N_TRIALS: int = 10
    OPTUNA_TIMEOUT: int = 120
    

@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings based on environment."""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    
    if environment == "production":
        return ProductionSettings()
    elif environment == "testing":
        return TestingSettings()
    else:
        return Settings()


# Export settings instance
settings = get_settings()