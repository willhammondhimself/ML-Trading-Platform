"""
Technical Indicators Calculator

Comprehensive technical analysis indicators for trading feature engineering.
Implements popular indicators like SMA, EMA, RSI, MACD, Bollinger Bands, etc.
"""

from typing import Dict, Any, List, Optional, Union
import pandas as pd
import numpy as np
from datetime import datetime
import structlog

logger = structlog.get_logger("technical-indicators")


class TechnicalIndicatorCalculator:
    """Calculator for technical analysis indicators."""
    
    def __init__(self):
        self.available_indicators = {
            "sma": self._simple_moving_average,
            "ema": self._exponential_moving_average,
            "wma": self._weighted_moving_average,
            "rsi": self._relative_strength_index,
            "macd": self._macd,
            "bollinger": self._bollinger_bands,
            "stoch": self._stochastic_oscillator,
            "williams_r": self._williams_r,
            "atr": self._average_true_range,
            "obv": self._on_balance_volume,
            "vwap": self._volume_weighted_average_price,
            "mfi": self._money_flow_index,
            "adx": self._average_directional_index,
            "cci": self._commodity_channel_index,
            "roc": self._rate_of_change,
            "trix": self._trix,
            "keltner": self._keltner_channels,
            "donchian": self._donchian_channels
        }
    
    def get_available_indicators(self) -> List[str]:
        """Get list of available indicators."""
        return list(self.available_indicators.keys())
    
    async def calculate_indicator(
        self,
        data: pd.DataFrame,
        indicator: str,
        period: int = 14,
        **kwargs
    ) -> Optional[pd.Series]:
        """Calculate a specific technical indicator."""
        
        if indicator not in self.available_indicators:
            logger.warning(f"Unknown indicator: {indicator}")
            return None
        
        try:
            calculator_func = self.available_indicators[indicator]
            result = calculator_func(data, period, **kwargs)
            
            if result is not None and not result.empty:
                logger.debug(f"Calculated {indicator} with period {period}")
                return result
            else:
                logger.warning(f"No result for {indicator} with period {period}")
                return None
                
        except Exception as e:
            logger.error(f"Error calculating {indicator}: {e}")
            return None
    
    async def calculate_multiple_indicators(
        self,
        data: pd.DataFrame,
        indicators: List[str],
        periods: List[int] = None
    ) -> Dict[str, Any]:
        """Calculate multiple indicators at once."""
        
        periods = periods or [14]  # Default period
        results = {}
        
        for indicator in indicators:
            for period in periods:
                try:
                    result = await self.calculate_indicator(data, indicator, period)
                    if result is not None:
                        key = f"{indicator}_{period}" if len(periods) > 1 else indicator
                        results[key] = result
                except Exception as e:
                    logger.error(f"Failed to calculate {indicator}_{period}: {e}")
        
        return results
    
    # Moving Averages
    def _simple_moving_average(self, data: pd.DataFrame, period: int, **kwargs) -> pd.Series:
        """Simple Moving Average."""
        column = kwargs.get('column', 'close')
        return data[column].rolling(window=period, min_periods=1).mean()
    
    def _exponential_moving_average(self, data: pd.DataFrame, period: int, **kwargs) -> pd.Series:
        """Exponential Moving Average."""
        column = kwargs.get('column', 'close')
        return data[column].ewm(span=period, adjust=False).mean()
    
    def _weighted_moving_average(self, data: pd.DataFrame, period: int, **kwargs) -> pd.Series:
        """Weighted Moving Average."""
        column = kwargs.get('column', 'close')
        weights = np.arange(1, period + 1)
        
        def wma(x):
            return np.dot(x, weights) / weights.sum()
        
        return data[column].rolling(window=period).apply(wma, raw=True)
    
    # Momentum Oscillators
    def _relative_strength_index(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.Series:
        """Relative Strength Index (RSI)."""
        column = kwargs.get('column', 'close')
        prices = data[column]
        
        # Calculate price changes
        delta = prices.diff()
        
        # Separate gains and losses
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        # Calculate RS and RSI
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def _macd(
        self, 
        data: pd.DataFrame, 
        period: int = 12, 
        slow_period: int = 26, 
        signal_period: int = 9,
        **kwargs
    ) -> pd.DataFrame:
        """Moving Average Convergence Divergence (MACD)."""
        column = kwargs.get('column', 'close')
        prices = data[column]
        
        # Calculate EMAs
        ema_fast = prices.ewm(span=period).mean()
        ema_slow = prices.ewm(span=slow_period).mean()
        
        # MACD line
        macd_line = ema_fast - ema_slow
        
        # Signal line
        signal_line = macd_line.ewm(span=signal_period).mean()
        
        # Histogram
        histogram = macd_line - signal_line
        
        return pd.DataFrame({
            'macd': macd_line,
            'signal': signal_line,
            'histogram': histogram
        })
    
    def _stochastic_oscillator(
        self, 
        data: pd.DataFrame, 
        period: int = 14, 
        smooth_k: int = 3, 
        smooth_d: int = 3,
        **kwargs
    ) -> pd.DataFrame:
        """Stochastic Oscillator."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        # Calculate %K
        lowest_low = low.rolling(window=period).min()
        highest_high = high.rolling(window=period).max()
        
        k_percent = 100 * ((close - lowest_low) / (highest_high - lowest_low))
        
        # Smooth %K
        k_percent_smooth = k_percent.rolling(window=smooth_k).mean()
        
        # Calculate %D
        d_percent = k_percent_smooth.rolling(window=smooth_d).mean()
        
        return pd.DataFrame({
            'stoch_k': k_percent_smooth,
            'stoch_d': d_percent
        })
    
    def _williams_r(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.Series:
        """Williams %R."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        highest_high = high.rolling(window=period).max()
        lowest_low = low.rolling(window=period).min()
        
        williams_r = -100 * ((highest_high - close) / (highest_high - lowest_low))
        
        return williams_r
    
    # Volatility Indicators
    def _bollinger_bands(
        self, 
        data: pd.DataFrame, 
        period: int = 20, 
        std_dev: float = 2.0,
        **kwargs
    ) -> pd.DataFrame:
        """Bollinger Bands."""
        column = kwargs.get('column', 'close')
        prices = data[column]
        
        # Calculate SMA and standard deviation
        sma = prices.rolling(window=period).mean()
        std = prices.rolling(window=period).std()
        
        # Calculate bands
        upper_band = sma + (std * std_dev)
        lower_band = sma - (std * std_dev)
        
        # Calculate %B and bandwidth
        percent_b = (prices - lower_band) / (upper_band - lower_band)
        bandwidth = (upper_band - lower_band) / sma
        
        return pd.DataFrame({
            'bb_upper': upper_band,
            'bb_middle': sma,
            'bb_lower': lower_band,
            'bb_percent_b': percent_b,
            'bb_bandwidth': bandwidth
        })
    
    def _average_true_range(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.Series:
        """Average True Range (ATR)."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        # Calculate True Range
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        
        # Calculate ATR
        atr = true_range.rolling(window=period).mean()
        
        return atr
    
    def _keltner_channels(
        self, 
        data: pd.DataFrame, 
        period: int = 20, 
        multiplier: float = 2.0,
        **kwargs
    ) -> pd.DataFrame:
        """Keltner Channels."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        # Calculate typical price and EMA
        typical_price = (high + low + close) / 3
        ema = typical_price.ewm(span=period).mean()
        
        # Calculate ATR
        atr = self._average_true_range(data, period)
        
        # Calculate channels
        upper_channel = ema + (multiplier * atr)
        lower_channel = ema - (multiplier * atr)
        
        return pd.DataFrame({
            'keltner_upper': upper_channel,
            'keltner_middle': ema,
            'keltner_lower': lower_channel
        })
    
    def _donchian_channels(self, data: pd.DataFrame, period: int = 20, **kwargs) -> pd.DataFrame:
        """Donchian Channels."""
        high = data['high']
        low = data['low']
        
        # Calculate channels
        upper_channel = high.rolling(window=period).max()
        lower_channel = low.rolling(window=period).min()
        middle_channel = (upper_channel + lower_channel) / 2
        
        return pd.DataFrame({
            'donchian_upper': upper_channel,
            'donchian_middle': middle_channel,
            'donchian_lower': lower_channel
        })
    
    # Volume Indicators
    def _on_balance_volume(self, data: pd.DataFrame, period: int = None, **kwargs) -> pd.Series:
        """On Balance Volume (OBV)."""
        close = data['close']
        volume = data['volume']
        
        # Calculate price direction
        price_change = close.diff()
        direction = np.where(price_change > 0, 1, np.where(price_change < 0, -1, 0))
        
        # Calculate OBV
        obv = (volume * direction).cumsum()
        
        return obv
    
    def _volume_weighted_average_price(self, data: pd.DataFrame, period: int = None, **kwargs) -> pd.Series:
        """Volume Weighted Average Price (VWAP)."""
        high = data['high']
        low = data['low']
        close = data['close']
        volume = data['volume']
        
        # Calculate typical price
        typical_price = (high + low + close) / 3
        
        # Calculate VWAP
        if period is None:
            # Cumulative VWAP
            vwap = (typical_price * volume).cumsum() / volume.cumsum()
        else:
            # Rolling VWAP
            vwap = (typical_price * volume).rolling(window=period).sum() / volume.rolling(window=period).sum()
        
        return vwap
    
    def _money_flow_index(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.Series:
        """Money Flow Index (MFI)."""
        high = data['high']
        low = data['low']
        close = data['close']
        volume = data['volume']
        
        # Calculate typical price and raw money flow
        typical_price = (high + low + close) / 3
        raw_money_flow = typical_price * volume
        
        # Calculate money flow direction
        positive_flow = raw_money_flow.where(typical_price > typical_price.shift(1), 0)
        negative_flow = raw_money_flow.where(typical_price < typical_price.shift(1), 0)
        
        # Calculate money flow ratio
        positive_money_flow = positive_flow.rolling(window=period).sum()
        negative_money_flow = negative_flow.rolling(window=period).sum()
        
        money_flow_ratio = positive_money_flow / negative_money_flow
        
        # Calculate MFI
        mfi = 100 - (100 / (1 + money_flow_ratio))
        
        return mfi
    
    # Trend Indicators
    def _average_directional_index(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.DataFrame:
        """Average Directional Index (ADX)."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        # Calculate True Range and Directional Movement
        tr = self._average_true_range(data, 1)  # Single period TR
        
        dm_plus = np.where((high - high.shift(1)) > (low.shift(1) - low), 
                          np.maximum(high - high.shift(1), 0), 0)
        dm_minus = np.where((low.shift(1) - low) > (high - high.shift(1)), 
                           np.maximum(low.shift(1) - low, 0), 0)
        
        # Smooth the values
        tr_smooth = pd.Series(tr).rolling(window=period).sum()
        dm_plus_smooth = pd.Series(dm_plus).rolling(window=period).sum()
        dm_minus_smooth = pd.Series(dm_minus).rolling(window=period).sum()
        
        # Calculate DI+ and DI-
        di_plus = 100 * (dm_plus_smooth / tr_smooth)
        di_minus = 100 * (dm_minus_smooth / tr_smooth)
        
        # Calculate DX and ADX
        dx = 100 * abs(di_plus - di_minus) / (di_plus + di_minus)
        adx = dx.rolling(window=period).mean()
        
        return pd.DataFrame({
            'adx': adx,
            'di_plus': di_plus,
            'di_minus': di_minus
        })
    
    def _commodity_channel_index(self, data: pd.DataFrame, period: int = 20, **kwargs) -> pd.Series:
        """Commodity Channel Index (CCI)."""
        high = data['high']
        low = data['low']
        close = data['close']
        
        # Calculate typical price
        typical_price = (high + low + close) / 3
        
        # Calculate SMA and mean deviation
        sma = typical_price.rolling(window=period).mean()
        mean_deviation = typical_price.rolling(window=period).apply(
            lambda x: np.mean(np.abs(x - x.mean()))
        )
        
        # Calculate CCI
        cci = (typical_price - sma) / (0.015 * mean_deviation)
        
        return cci
    
    # Momentum Indicators
    def _rate_of_change(self, data: pd.DataFrame, period: int = 12, **kwargs) -> pd.Series:
        """Rate of Change (ROC)."""
        column = kwargs.get('column', 'close')
        prices = data[column]
        
        roc = ((prices / prices.shift(period)) - 1) * 100
        
        return roc
    
    def _trix(self, data: pd.DataFrame, period: int = 14, **kwargs) -> pd.Series:
        """TRIX - Triple Exponential Moving Average."""
        column = kwargs.get('column', 'close')
        prices = data[column]
        
        # Calculate triple smoothed EMA
        ema1 = prices.ewm(span=period).mean()
        ema2 = ema1.ewm(span=period).mean()
        ema3 = ema2.ewm(span=period).mean()
        
        # Calculate TRIX
        trix = ((ema3 / ema3.shift(1)) - 1) * 10000
        
        return trix