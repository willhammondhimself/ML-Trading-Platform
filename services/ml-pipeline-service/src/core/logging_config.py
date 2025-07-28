"""
Logging Configuration for ML Pipeline Service

Structured logging setup with JSON formatting for production
and human-readable formatting for development.
"""

import logging
import logging.config
import sys
from typing import Dict, Any
import structlog
from pathlib import Path

from ..config.settings import get_settings


def setup_logging() -> logging.Logger:
    """Setup structured logging configuration."""
    settings = get_settings()
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if settings.STRUCTURED_LOGGING 
            else structlog.dev.ConsoleRenderer(colors=True),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # Create logs directory if it doesn't exist
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Logging configuration
    log_config: Dict[str, Any] = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "format": "%(asctime)s %(name)s %(levelname)s %(message)s",
                "class": "pythonjsonlogger.jsonlogger.JsonFormatter",
            },
            "standard": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "detailed": {
                "format": "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": settings.LOG_LEVEL,
                "formatter": "json" if settings.STRUCTURED_LOGGING else "standard",
                "stream": sys.stdout,
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": settings.LOG_LEVEL,
                "formatter": "json",
                "filename": "logs/ml-pipeline.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "encoding": "utf-8",
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "ERROR",
                "formatter": "detailed",
                "filename": "logs/ml-pipeline-errors.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "encoding": "utf-8",
            },
        },
        "loggers": {
            "": {  # root logger
                "level": settings.LOG_LEVEL,
                "handlers": ["console", "file", "error_file"],
            },
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "sqlalchemy": {
                "level": "WARNING",
                "handlers": ["file"],
                "propagate": False,
            },
            "aiokafka": {
                "level": "INFO",
                "handlers": ["file"],
                "propagate": False,
            },
            "sklearn": {
                "level": "WARNING",
                "handlers": ["file"],
                "propagate": False,
            },
        },
    }
    
    # Apply logging configuration
    logging.config.dictConfig(log_config)
    
    # Get logger instance
    logger = structlog.get_logger("ml-pipeline")
    
    # Log startup message
    logger.info(
        "Logging configured",
        environment=settings.ENVIRONMENT,
        log_level=settings.LOG_LEVEL,
        structured=settings.STRUCTURED_LOGGING,
    )
    
    return logger


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the specified name."""
    return structlog.get_logger(name)


# Performance logging for ML operations
class MLOperationLogger:
    """Logger specifically for ML operations with performance tracking."""
    
    def __init__(self, operation_name: str):
        self.logger = get_logger(f"ml-ops.{operation_name}")
        self.operation_name = operation_name
    
    def log_operation_start(self, **kwargs):
        """Log the start of an ML operation."""
        self.logger.info(
            f"{self.operation_name} started",
            operation=self.operation_name,
            stage="start",
            **kwargs
        )
    
    def log_operation_progress(self, progress: float, **kwargs):
        """Log progress of an ML operation."""
        self.logger.info(
            f"{self.operation_name} progress",
            operation=self.operation_name,
            stage="progress",
            progress=progress,
            **kwargs
        )
    
    def log_operation_complete(self, duration: float, **kwargs):
        """Log completion of an ML operation."""
        self.logger.info(
            f"{self.operation_name} completed",
            operation=self.operation_name,
            stage="complete",
            duration=duration,
            **kwargs
        )
    
    def log_operation_error(self, error: Exception, **kwargs):
        """Log error during an ML operation."""
        self.logger.error(
            f"{self.operation_name} failed",
            operation=self.operation_name,
            stage="error",
            error=str(error),
            error_type=type(error).__name__,
            **kwargs
        )