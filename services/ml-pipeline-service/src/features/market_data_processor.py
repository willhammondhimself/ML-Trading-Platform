"""
Market Data Processor

Handles fetching, processing, and validation of market data
for feature engineering in the ML pipeline.
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import asyncio
import httpx
import structlog

from ..core.exceptions import (
    MissingMarketDataException,
    InvalidFeatureDataException,
    ExternalServiceException,
    MarketDataServiceException
)
from ..config.settings import get_settings

logger = structlog.get_logger("market-data-processor")


class MarketDataProcessor:
    """Processor for market data operations."""
    
    def __init__(self):
        self.settings = get_settings()
        self.http_client = None
        self._client_lock = asyncio.Lock()
    
    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self.http_client is None:
            async with self._client_lock:
                if self.http_client is None:
                    self.http_client = httpx.AsyncClient(
                        timeout=30.0,
                        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5)
                    )
        return self.http_client
    
    async def close(self):
        """Close HTTP client."""
        if self.http_client:
            await self.http_client.aclose()
    
    async def get_market_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> pd.DataFrame:
        """Get market data for a symbol."""
        
        try:
            logger.info(
                "Fetching market data",
                symbol=symbol,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                interval=interval
            )
            
            # Try to get data from market data service first
            try:
                market_data = await self._fetch_from_market_service(
                    symbol, start_date, end_date, interval
                )
                if not market_data.empty:
                    return market_data
            except Exception as e:
                logger.warning(f"Market data service unavailable: {e}")
            
            # Fallback to generating mock data for development
            logger.warning(f"Using mock data for {symbol} (fallback mode)")
            return self._generate_mock_data(symbol, start_date, end_date)
            
        except Exception as e:
            logger.error(f"Failed to get market data for {symbol}: {e}")
            raise MissingMarketDataException(
                symbol=symbol,
                date_range=f"{start_date.date()} to {end_date.date()}"
            )
    
    async def _fetch_from_market_service(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> pd.DataFrame:
        """Fetch market data from the market data service."""
        
        try:
            client = await self._get_http_client()
            
            # Build request URL
            url = f"{self.settings.MARKET_DATA_SERVICE_URL}/api/v1/market-data/historical"
            params = {
                "symbol": symbol,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "interval": interval
            }
            
            # Make request
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            
            # Convert to DataFrame
            if "data" in data and data["data"]:
                df = pd.DataFrame(data["data"])
                df["timestamp"] = pd.to_datetime(df["timestamp"])
                df = df.set_index("timestamp")
                
                # Ensure required columns exist
                required_columns = ["open", "high", "low", "close", "volume"]
                missing_columns = [col for col in required_columns if col not in df.columns]
                
                if missing_columns:
                    raise InvalidFeatureDataException(
                        f"Missing required columns: {missing_columns}",
                        symbol=symbol
                    )
                
                # Clean and validate data
                df = self._clean_market_data(df, symbol)
                
                logger.info(f"Fetched {len(df)} data points for {symbol}")
                return df
            else:
                logger.warning(f"No data returned for {symbol}")
                return pd.DataFrame()
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"Symbol {symbol} not found in market data service")
                return pd.DataFrame()
            raise MarketDataServiceException(f"HTTP {e.response.status_code}: {e}")
        
        except Exception as e:
            logger.error(f"Error fetching from market service: {e}")
            raise MarketDataServiceException(str(e))
    
    def _generate_mock_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> pd.DataFrame:
        """Generate mock market data for development/testing."""
        
        logger.info(f"Generating mock data for {symbol}")
        
        # Create date range
        date_range = pd.date_range(start=start_date, end=end_date, freq='D')
        
        # Generate realistic price movements
        np.random.seed(hash(symbol) % 2**32)  # Consistent seed based on symbol
        
        # Base price depending on symbol
        base_price = self._get_base_price(symbol)
        
        # Generate price series with random walk
        returns = np.random.normal(0.001, 0.02, len(date_range))  # ~0.1% daily return, 2% volatility
        prices = [base_price]
        
        for ret in returns[1:]:
            new_price = prices[-1] * (1 + ret)
            prices.append(max(new_price, 1.0))  # Prevent negative prices
        
        # Generate OHLC from close prices
        data = []
        for i, (date, close) in enumerate(zip(date_range, prices)):
            # Generate realistic OHLC
            volatility = abs(np.random.normal(0, 0.015))  # Daily volatility
            
            high = close * (1 + volatility * np.random.uniform(0, 1))
            low = close * (1 - volatility * np.random.uniform(0, 1))
            open_price = close * (1 + np.random.normal(0, 0.005))  # Small gap from previous close
            
            # Ensure OHLC relationships
            high = max(high, open_price, close)
            low = min(low, open_price, close)
            
            # Generate volume (log-normal distribution)
            base_volume = 1000000 + hash(symbol + str(i)) % 5000000
            volume_multiplier = np.random.lognormal(0, 0.5)
            volume = int(base_volume * volume_multiplier)
            
            data.append({
                "open": round(open_price, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2),
                "volume": volume
            })
        
        # Create DataFrame
        df = pd.DataFrame(data, index=date_range)
        df.index.name = "timestamp"
        
        logger.info(f"Generated {len(df)} mock data points for {symbol}")
        return df
    
    def _get_base_price(self, symbol: str) -> float:
        """Get base price for a symbol (for mock data)."""
        # Simple hash-based pricing for consistency
        symbol_hash = hash(symbol) % 10000
        
        # Price ranges based on symbol characteristics
        if symbol in ["TSLA", "NVDA", "AMZN", "GOOGL"]:
            return 150 + (symbol_hash % 1000)  # $150-1150
        elif symbol in ["AAPL", "MSFT", "META"]:
            return 100 + (symbol_hash % 400)   # $100-500
        elif symbol in ["SPY", "QQQ", "IWM"]:
            return 200 + (symbol_hash % 300)   # $200-500
        else:
            return 20 + (symbol_hash % 200)    # $20-220
    
    def _clean_market_data(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Clean and validate market data."""
        
        try:
            # Remove rows with missing critical data
            required_columns = ["open", "high", "low", "close", "volume"]
            df = df.dropna(subset=required_columns)
            
            if df.empty:
                raise InvalidFeatureDataException(
                    "No valid data after cleaning",
                    symbol=symbol
                )
            
            # Ensure numeric types
            for col in required_columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            
            # Remove invalid prices (negative or zero)
            price_columns = ["open", "high", "low", "close"]
            for col in price_columns:
                df = df[df[col] > 0]
            
            # Remove invalid volume
            df = df[df["volume"] >= 0]
            
            # Validate OHLC relationships
            invalid_ohlc = (
                (df["high"] < df["low"]) |
                (df["high"] < df["open"]) |
                (df["high"] < df["close"]) |
                (df["low"] > df["open"]) |
                (df["low"] > df["close"])
            )
            
            if invalid_ohlc.any():
                logger.warning(f"Found {invalid_ohlc.sum()} rows with invalid OHLC for {symbol}")
                df = df[~invalid_ohlc]
            
            # Remove extreme outliers (beyond 5 standard deviations)
            for col in price_columns:
                returns = df[col].pct_change()
                outliers = abs(returns) > (5 * returns.std())
                if outliers.any():
                    logger.warning(f"Removed {outliers.sum()} outliers in {col} for {symbol}")
                    df = df[~outliers]
            
            # Sort by timestamp
            df = df.sort_index()
            
            # Remove duplicates
            df = df[~df.index.duplicated(keep='first')]
            
            logger.debug(f"Cleaned data for {symbol}: {len(df)} rows remaining")
            return df
            
        except Exception as e:
            logger.error(f"Error cleaning market data for {symbol}: {e}")
            raise InvalidFeatureDataException(f"Data cleaning failed: {str(e)}", symbol=symbol)
    
    async def get_batch_market_data(
        self,
        symbols: List[str],
        start_date: datetime,
        end_date: datetime,
        max_concurrent: int = 5
    ) -> Dict[str, pd.DataFrame]:
        """Get market data for multiple symbols in parallel."""
        
        logger.info(f"Fetching market data for {len(symbols)} symbols")
        
        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_single_symbol(symbol: str) -> Tuple[str, pd.DataFrame]:
            """Fetch data for single symbol with concurrency control."""
            async with semaphore:
                try:
                    data = await self.get_market_data(symbol, start_date, end_date)
                    return symbol, data
                except Exception as e:
                    logger.error(f"Failed to fetch data for {symbol}: {e}")
                    return symbol, pd.DataFrame()
        
        # Execute batch fetch
        tasks = [fetch_single_symbol(symbol) for symbol in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        market_data = {}
        successful = 0
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Task failed: {result}")
                continue
            
            symbol, data = result
            market_data[symbol] = data
            
            if not data.empty:
                successful += 1
        
        logger.info(f"Successfully fetched data for {successful}/{len(symbols)} symbols")
        return market_data
    
    def validate_data_quality(self, data: pd.DataFrame, symbol: str) -> Dict[str, Any]:
        """Validate data quality and return quality metrics."""
        
        if data.empty:
            return {
                "is_valid": False,
                "quality_score": 0.0,
                "issues": ["No data available"],
                "metrics": {}
            }
        
        issues = []
        metrics = {}
        
        # Check data completeness
        required_columns = ["open", "high", "low", "close", "volume"]
        missing_columns = [col for col in required_columns if col not in data.columns]
        
        if missing_columns:
            issues.append(f"Missing columns: {missing_columns}")
        
        # Check for missing values
        missing_values = data[required_columns].isnull().sum()
        if missing_values.any():
            issues.append(f"Missing values: {missing_values.to_dict()}")
        
        # Check data consistency
        price_columns = ["open", "high", "low", "close"]
        for col in price_columns:
            if (data[col] <= 0).any():
                issues.append(f"Non-positive values in {col}")
        
        # Check OHLC relationships
        invalid_ohlc = (
            (data["high"] < data["low"]) |
            (data["high"] < data["open"]) |
            (data["high"] < data["close"]) |
            (data["low"] > data["open"]) |
            (data["low"] > data["close"])
        )
        
        if invalid_ohlc.any():
            issues.append(f"Invalid OHLC relationships: {invalid_ohlc.sum()} rows")
        
        # Calculate quality metrics
        metrics.update({
            "total_rows": len(data),
            "date_range_days": (data.index[-1] - data.index[0]).days + 1,
            "missing_data_pct": (missing_values.sum() / (len(data) * len(required_columns))) * 100,
            "duplicate_dates": data.index.duplicated().sum(),
            "avg_volume": float(data["volume"].mean()) if "volume" in data.columns else 0,
            "price_volatility": float(data["close"].pct_change().std()) if "close" in data.columns else 0
        })
        
        # Calculate overall quality score
        quality_score = 1.0
        
        # Penalize for missing data
        if metrics["missing_data_pct"] > 0:
            quality_score *= (1 - min(metrics["missing_data_pct"] / 100, 0.5))
        
        # Penalize for OHLC issues
        if invalid_ohlc.any():
            quality_score *= (1 - min(invalid_ohlc.sum() / len(data), 0.3))
        
        # Penalize for missing columns
        if missing_columns:
            quality_score *= (1 - len(missing_columns) / len(required_columns))
        
        is_valid = quality_score >= 0.7 and len(issues) == 0
        
        return {
            "is_valid": is_valid,
            "quality_score": round(quality_score, 3),
            "issues": issues,
            "metrics": metrics
        }