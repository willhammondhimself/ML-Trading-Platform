"""
Database Configuration and Connection Management

Async PostgreSQL database setup with SQLAlchemy 2.0
for ML pipeline metadata, model registry, and feature store.
"""

from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager
import asyncio

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy import event, text
import structlog

from ..config.settings import get_settings

logger = structlog.get_logger("database")

# Global database engine
engine: Optional[AsyncEngine] = None
async_session_maker: Optional[async_sessionmaker[AsyncSession]] = None


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


async def init_db() -> None:
    """Initialize database connection and create engine."""
    global engine, async_session_maker
    
    settings = get_settings()
    
    try:
        # Create async engine
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DATABASE_ECHO,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_pre_ping=True,
            pool_recycle=3600,  # Recycle connections after 1 hour
            poolclass=QueuePool if not settings.is_testing else NullPool,
            future=True,
        )
        
        # Add connection event listeners for better monitoring
        @event.listens_for(engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            """Set database connection parameters."""
            if "postgresql" in settings.DATABASE_URL:
                with dbapi_connection.cursor() as cursor:
                    # Set timezone to UTC
                    cursor.execute("SET timezone = 'UTC'")
        
        # Create session maker
        async_session_maker = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        
        # Test connection
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        
        logger.info(
            "Database initialized successfully",
            database_url=settings.DATABASE_URL.split("@")[1] if "@" in settings.DATABASE_URL else "local",
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
        )
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


async def close_db() -> None:
    """Close database connections."""
    global engine
    
    if engine:
        await engine.dispose()
        logger.info("Database connections closed")


def get_engine() -> AsyncEngine:
    """Get database engine instance."""
    if engine is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return engine


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session with automatic cleanup."""
    if async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def get_session() -> AsyncSession:
    """Get database session (for dependency injection)."""
    if async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    
    return async_session_maker()


# Health check function
async def check_db_health() -> bool:
    """Check database health status."""
    try:
        async with get_db_session() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


# Database utilities
class DatabaseManager:
    """Database management utilities."""
    
    @staticmethod
    async def create_tables():
        """Create all database tables."""
        if engine is None:
            raise RuntimeError("Database not initialized")
        
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database tables created")
    
    @staticmethod
    async def drop_tables():
        """Drop all database tables."""
        if engine is None:
            raise RuntimeError("Database not initialized")
        
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        
        logger.info("Database tables dropped")
    
    @staticmethod
    async def reset_database():
        """Reset database by dropping and recreating tables."""
        await DatabaseManager.drop_tables()
        await DatabaseManager.create_tables()
        logger.info("Database reset completed")
    
    @staticmethod
    async def get_table_stats():
        """Get database table statistics."""
        stats = {}
        try:
            async with get_db_session() as session:
                # Get table row counts
                for table_name in Base.metadata.tables.keys():
                    result = await session.execute(
                        text(f"SELECT COUNT(*) FROM {table_name}")
                    )
                    count = result.scalar()
                    stats[table_name] = count
            
            return stats
        except Exception as e:
            logger.error(f"Failed to get table stats: {e}")
            return stats


# Transaction decorator
def transactional(func):
    """Decorator to wrap function in database transaction."""
    async def wrapper(*args, **kwargs):
        async with get_db_session() as session:
            try:
                # Add session to kwargs if not present
                if 'session' not in kwargs:
                    kwargs['session'] = session
                
                result = await func(*args, **kwargs)
                await session.commit()
                return result
            except Exception as e:
                await session.rollback()
                logger.error(f"Transaction failed: {e}")
                raise
    
    return wrapper


# Connection pool monitoring
async def get_pool_status():
    """Get connection pool status."""
    if engine is None:
        return {"status": "not_initialized"}
    
    pool = engine.pool
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalidated": pool.invalidated(),
    }