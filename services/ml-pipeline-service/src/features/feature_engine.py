"""
Feature Engineering Engine

Core engine for extracting and transforming trading features from market data.
Supports technical indicators, price patterns, volume analysis, and alternative data.
"""

from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
import asyncio
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import structlog

from ..core.exceptions import (
    FeatureEngineeringException,
    InvalidFeatureDataException,
    MissingMarketDataException
)
from ..core.redis_client import get_redis_manager
from ..config.settings import get_settings
from .technical_indicators import TechnicalIndicatorCalculator
from .market_data_processor import MarketDataProcessor
from .feature_validators import FeatureValidator

logger = structlog.get_logger("feature-engine")


class FeatureEngine:
    """Main feature engineering engine."""
    
    def __init__(self):
        self.settings = get_settings()
        self.market_processor = MarketDataProcessor()
        self.indicator_calculator = TechnicalIndicatorCalculator()
        self.validator = FeatureValidator()
        self.redis_manager = get_redis_manager()
        
        # Thread pool for CPU-intensive operations
        self.thread_pool = ThreadPoolExecutor(max_workers=4)
    
    async def extract_features(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        feature_types: List[str] = None,
        indicators: List[str] = None,
        lookback_periods: List[int] = None
    ) -> Dict[str, Any]:
        """Extract comprehensive features for a single symbol."""
        
        try:
            logger.info(
                "Starting feature extraction",
                symbol=symbol,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat()
            )
            
            # Set defaults
            feature_types = feature_types or self.settings.TECHNICAL_INDICATORS[:4]
            indicators = indicators or ["sma", "ema", "rsi", "macd"]
            lookback_periods = lookback_periods or self.settings.LOOKBACK_PERIODS[:4]
            
            # Get market data
            market_data = await self.market_processor.get_market_data(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date
            )
            
            if market_data.empty:
                raise MissingMarketDataException(
                    symbol=symbol,
                    date_range=f"{start_date.date()} to {end_date.date()}"
                )
            
            # Extract different types of features
            all_features = {}
            feature_metadata = {
                "symbol": symbol,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "data_points": len(market_data),
                "feature_types": feature_types,
                "extraction_timestamp": datetime.utcnow().isoformat()
            }
            
            # Price-based features
            if "price" in feature_types:
                price_features = await self._extract_price_features(market_data)
                all_features.update(price_features)
            
            # Volume-based features  
            if "volume" in feature_types:
                volume_features = await self._extract_volume_features(market_data)
                all_features.update(volume_features)
            
            # Technical indicators
            if "technical" in feature_types:
                technical_features = await self._extract_technical_features(
                    market_data, indicators, lookback_periods
                )
                all_features.update(technical_features)
            
            # Volatility features
            if "volatility" in feature_types:
                volatility_features = await self._extract_volatility_features(market_data)
                all_features.update(volatility_features)
            
            # Momentum features
            if "momentum" in feature_types:
                momentum_features = await self._extract_momentum_features(market_data)
                all_features.update(momentum_features)
            
            # Validate extracted features
            validation_result = await self.validator.validate_features(all_features, market_data)
            if not validation_result.is_valid:
                raise InvalidFeatureDataException(
                    detail=validation_result.error_message,
                    symbol=symbol
                )
            
            # Add feature statistics to metadata
            feature_metadata.update({
                "feature_count": len(all_features),
                "feature_names": list(all_features.keys()),
                "validation_passed": True,
                "data_quality_score": validation_result.quality_score
            })
            
            logger.info(
                "Feature extraction completed",
                symbol=symbol,
                feature_count=len(all_features),
                data_quality=validation_result.quality_score
            )
            
            return {
                "features": all_features,
                "metadata": feature_metadata
            }
            
        except Exception as e:
            logger.error(f"Feature extraction failed for {symbol}: {e}")
            if isinstance(e, (FeatureEngineeringException, MissingMarketDataException, InvalidFeatureDataException)):
                raise
            raise FeatureEngineeringException(f"Unexpected error during feature extraction: {str(e)}")
    
    async def extract_features_batch(
        self,
        symbols: List[str],
        start_date: datetime,
        end_date: datetime,
        feature_types: List[str] = None,
        indicators: List[str] = None,
        use_cache: bool = True,
        max_concurrent: int = 5
    ) -> Dict[str, Any]:
        """Extract features for multiple symbols in parallel."""
        
        logger.info(
            "Starting batch feature extraction",
            symbols=symbols,
            symbol_count=len(symbols),
            max_concurrent=max_concurrent
        )
        
        # Create semaphore to limit concurrent operations
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def extract_single_with_semaphore(symbol: str) -> tuple[str, Dict[str, Any]]:
            """Extract features for single symbol with concurrency control."""
            async with semaphore:
                try:
                    # Check cache first if enabled
                    if use_cache:
                        cache_key = f"{symbol}_{start_date.date()}_{end_date.date()}"
                        cached = await self.redis_manager.get_cached_features(cache_key)
                        if cached:
                            cached["cache_hit"] = True
                            return symbol, cached
                    
                    # Extract features
                    result = await self.extract_features(
                        symbol=symbol,
                        start_date=start_date,
                        end_date=end_date,
                        feature_types=feature_types,
                        indicators=indicators
                    )
                    
                    # Cache result if enabled
                    if use_cache:
                        cache_key = f"{symbol}_{start_date.date()}_{end_date.date()}"
                        await self.redis_manager.cache_features(cache_key, result)
                    
                    result["cache_hit"] = False
                    return symbol, result
                    
                except Exception as e:
                    logger.error(f"Failed to extract features for {symbol}: {e}")
                    return symbol, {"error": str(e)}
        
        # Execute batch extraction
        tasks = [extract_single_with_semaphore(symbol) for symbol in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        batch_results = {}
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Task failed with exception: {result}")
                continue
            
            symbol, feature_result = result
            batch_results[symbol] = feature_result
        
        logger.info(
            "Batch feature extraction completed",
            total_symbols=len(symbols),
            successful=len([r for r in batch_results.values() if "error" not in r]),
            failed=len([r for r in batch_results.values() if "error" in r])
        )
        
        return batch_results
    
    async def _extract_price_features(self, market_data: pd.DataFrame) -> Dict[str, Any]:
        """Extract price-based features."""
        
        def calculate_price_features(df: pd.DataFrame) -> Dict[str, Any]:
            features = {}
            
            # Basic price features
            features["current_price"] = float(df["close"].iloc[-1])
            features["price_change"] = float(df["close"].iloc[-1] - df["close"].iloc[-2])
            features["price_change_pct"] = float((df["close"].iloc[-1] / df["close"].iloc[-2] - 1) * 100)
            
            # Returns
            df["returns"] = df["close"].pct_change()
            df["log_returns"] = np.log(df["close"] / df["close"].shift(1))
            
            features["returns_1d"] = float(df["returns"].iloc[-1])
            features["returns_5d"] = float(df["returns"].iloc[-5:].mean())
            features["returns_volatility"] = float(df["returns"].std())
            
            # Price gaps
            df["gap"] = (df["open"] - df["close"].shift(1)) / df["close"].shift(1)
            features["current_gap"] = float(df["gap"].iloc[-1]) if not pd.isna(df["gap"].iloc[-1]) else 0.0
            features["avg_gap"] = float(df["gap"].mean())
            
            # High-Low analysis
            df["high_low_ratio"] = df["high"] / df["low"]
            features["hl_ratio"] = float(df["high_low_ratio"].iloc[-1])
            features["hl_ratio_ma"] = float(df["high_low_ratio"].rolling(20).mean().iloc[-1])
            
            # Price position within range
            features["price_position"] = float((df["close"].iloc[-1] - df["low"].iloc[-1]) / 
                                           (df["high"].iloc[-1] - df["low"].iloc[-1]))
            
            return features
        
        # Execute in thread pool for CPU-intensive calculations
        loop = asyncio.get_event_loop()
        price_features = await loop.run_in_executor(
            self.thread_pool, calculate_price_features, market_data
        )
        
        return {f"price_{k}": v for k, v in price_features.items()}
    
    async def _extract_volume_features(self, market_data: pd.DataFrame) -> Dict[str, Any]:
        """Extract volume-based features."""
        
        def calculate_volume_features(df: pd.DataFrame) -> Dict[str, Any]:
            features = {}
            
            # Basic volume features
            features["current_volume"] = float(df["volume"].iloc[-1])
            features["avg_volume_10d"] = float(df["volume"].rolling(10).mean().iloc[-1])
            features["avg_volume_30d"] = float(df["volume"].rolling(30).mean().iloc[-1])
            
            # Volume ratios
            features["volume_ratio_10d"] = float(df["volume"].iloc[-1] / 
                                               df["volume"].rolling(10).mean().iloc[-1])
            features["volume_ratio_30d"] = float(df["volume"].iloc[-1] / 
                                               df["volume"].rolling(30).mean().iloc[-1])
            
            # Volume-price relationship
            df["volume_price"] = df["volume"] * df["close"]
            features["volume_weighted_price"] = float(df["volume_price"].rolling(20).sum().iloc[-1] / 
                                                   df["volume"].rolling(20).sum().iloc[-1])
            
            # Volume trends
            df["volume_ma5"] = df["volume"].rolling(5).mean()
            df["volume_ma20"] = df["volume"].rolling(20).mean()
            features["volume_trend"] = float(df["volume_ma5"].iloc[-1] / df["volume_ma20"].iloc[-1])
            
            # On Balance Volume approximation
            df["price_direction"] = np.where(df["close"] > df["close"].shift(1), 1, 
                                          np.where(df["close"] < df["close"].shift(1), -1, 0))
            df["obv_approx"] = (df["volume"] * df["price_direction"]).cumsum()
            features["obv"] = float(df["obv_approx"].iloc[-1])
            
            return features
        
        loop = asyncio.get_event_loop()
        volume_features = await loop.run_in_executor(
            self.thread_pool, calculate_volume_features, market_data
        )
        
        return {f"volume_{k}": v for k, v in volume_features.items()}
    
    async def _extract_technical_features(
        self, 
        market_data: pd.DataFrame, 
        indicators: List[str],
        lookback_periods: List[int]
    ) -> Dict[str, Any]:
        """Extract technical indicator features."""
        
        technical_features = {}
        
        for indicator in indicators:
            try:
                # Calculate indicator for different periods
                for period in lookback_periods:
                    indicator_data = await self.indicator_calculator.calculate_indicator(
                        market_data, indicator, period
                    )
                    
                    if indicator_data is not None and not indicator_data.empty:
                        # Get latest value
                        latest_value = indicator_data.iloc[-1]
                        
                        if isinstance(latest_value, (pd.Series, dict)):
                            # Handle multi-column indicators (like MACD)
                            for col, val in latest_value.items():
                                if pd.notna(val):
                                    technical_features[f"technical_{indicator}_{period}_{col}"] = float(val)
                        else:
                            # Single value indicators
                            if pd.notna(latest_value):
                                technical_features[f"technical_{indicator}_{period}"] = float(latest_value)
                                
            except Exception as e:
                logger.warning(f"Failed to calculate {indicator}: {e}")
                continue
        
        return technical_features
    
    async def _extract_volatility_features(self, market_data: pd.DataFrame) -> Dict[str, Any]:
        """Extract volatility-based features."""
        
        def calculate_volatility_features(df: pd.DataFrame) -> Dict[str, Any]:
            features = {}
            
            # Calculate returns if not exists
            df["returns"] = df["close"].pct_change()
            
            # Historical volatility
            features["volatility_5d"] = float(df["returns"].rolling(5).std() * np.sqrt(252))
            features["volatility_10d"] = float(df["returns"].rolling(10).std() * np.sqrt(252))
            features["volatility_20d"] = float(df["returns"].rolling(20).std() * np.sqrt(252))
            
            # Average True Range approximation
            df["tr1"] = df["high"] - df["low"]
            df["tr2"] = abs(df["high"] - df["close"].shift(1))
            df["tr3"] = abs(df["low"] - df["close"].shift(1))
            df["tr"] = df[["tr1", "tr2", "tr3"]].max(axis=1)
            
            features["atr_14"] = float(df["tr"].rolling(14).mean().iloc[-1])
            features["atr_ratio"] = float(df["tr"].iloc[-1] / df["tr"].rolling(14).mean().iloc[-1])
            
            # Volatility ratios
            vol_5d = df["returns"].rolling(5).std()
            vol_20d = df["returns"].rolling(20).std()
            features["volatility_ratio"] = float(vol_5d.iloc[-1] / vol_20d.iloc[-1])
            
            return features
        
        loop = asyncio.get_event_loop()
        volatility_features = await loop.run_in_executor(
            self.thread_pool, calculate_volatility_features, market_data
        )
        
        return {f"volatility_{k}": v for k, v in volatility_features.items()}
    
    async def _extract_momentum_features(self, market_data: pd.DataFrame) -> Dict[str, Any]:
        """Extract momentum-based features."""
        
        def calculate_momentum_features(df: pd.DataFrame) -> Dict[str, Any]:
            features = {}
            
            # Price momentum
            features["momentum_1d"] = float((df["close"].iloc[-1] / df["close"].iloc[-2] - 1) * 100)
            features["momentum_5d"] = float((df["close"].iloc[-1] / df["close"].iloc[-6] - 1) * 100)
            features["momentum_10d"] = float((df["close"].iloc[-1] / df["close"].iloc[-11] - 1) * 100)
            
            # Rate of Change
            features["roc_5"] = float((df["close"].iloc[-1] / df["close"].iloc[-6] - 1) * 100)
            features["roc_10"] = float((df["close"].iloc[-1] / df["close"].iloc[-11] - 1) * 100)
            
            # Moving Average convergence/divergence approximation
            ema12 = df["close"].ewm(span=12).mean()
            ema26 = df["close"].ewm(span=26).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9).mean()
            
            features["macd_line"] = float(macd_line.iloc[-1])
            features["macd_signal"] = float(signal_line.iloc[-1])
            features["macd_histogram"] = float(macd_line.iloc[-1] - signal_line.iloc[-1])
            
            return features
        
        loop = asyncio.get_event_loop()
        momentum_features = await loop.run_in_executor(
            self.thread_pool, calculate_momentum_features, market_data
        )
        
        return {f"momentum_{k}": v for k, v in momentum_features.items()}