"""
Training Data Processor

Prepares and processes data for ML model training.
Handles feature selection, scaling, encoding, and data validation.
"""

from typing import Dict, Any, List, Optional, Tuple, Union
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler
from sklearn.feature_selection import SelectKBest, f_regression, mutual_info_regression
from sklearn.impute import SimpleImputer
import structlog

from ..core.exceptions import InsufficientDataException, InvalidFeatureDataException
from ..config.settings import get_settings

logger = structlog.get_logger("training-data-processor")


class TrainingDataProcessor:
    """Comprehensive training data preparation engine."""
    
    def __init__(self):
        self.settings = get_settings()
        self.scalers = {
            "standard": StandardScaler,
            "robust": RobustScaler,
            "minmax": MinMaxScaler
        }
        self.feature_selectors = {
            "f_regression": f_regression,
            "mutual_info": mutual_info_regression
        }
    
    async def prepare_training_data(
        self,
        data: pd.DataFrame,
        target_column: str,
        feature_selection: bool = True,
        n_features: int = None,
        scaling_method: str = "robust",
        handle_missing: bool = True,
        remove_outliers: bool = False,
        time_series_aware: bool = True,
        min_samples: int = 100
    ) -> Dict[str, Any]:
        """Comprehensive data preparation pipeline."""
        
        try:
            logger.info(
                "Starting training data preparation",
                input_shape=data.shape,
                target_column=target_column,
                feature_selection=feature_selection,
                scaling_method=scaling_method
            )
            
            # Validate input data
            if data.empty:
                raise InsufficientDataException("Input data is empty")
            
            if target_column not in data.columns:
                raise InvalidFeatureDataException(f"Target column '{target_column}' not found in data")
            
            if len(data) < min_samples:
                raise InsufficientDataException(f"Insufficient data: {len(data)} samples (minimum: {min_samples})")
            
            # Create working copy
            processed_data = data.copy()
            
            # Handle missing values
            if handle_missing:
                processed_data = self._handle_missing_values(processed_data, target_column)
            
            # Remove outliers if requested
            if remove_outliers:
                processed_data = self._remove_outliers(processed_data, target_column)
            
            # Separate features and target
            y = processed_data[target_column]
            feature_columns = [col for col in processed_data.columns if col != target_column]
            X = processed_data[feature_columns]
            
            # Remove non-numeric features
            numeric_features = X.select_dtypes(include=[np.number]).columns.tolist()
            X = X[numeric_features]
            
            if X.empty:
                raise InvalidFeatureDataException("No numeric features available for training")
            
            # Feature selection
            selected_features = numeric_features
            if feature_selection and len(numeric_features) > 1:
                selected_features, feature_scores = self._select_features(
                    X, y, n_features or min(50, len(numeric_features))
                )
                X = X[selected_features]
            
            # Feature scaling
            scaler = None
            if scaling_method and scaling_method in self.scalers:
                scaler, X_scaled = self._scale_features(X, scaling_method)
                X = pd.DataFrame(X_scaled, columns=X.columns, index=X.index)
            
            # Final validation
            if X.isna().any().any():
                logger.warning("NaN values found after preprocessing, filling with median")
                X = X.fillna(X.median())
            
            if y.isna().any():
                logger.warning("NaN values found in target, removing affected samples")
                valid_indices = ~y.isna()
                X = X[valid_indices]
                y = y[valid_indices]
            
            # Create train/validation split indices if time-series aware
            split_info = None
            if time_series_aware:
                split_info = self._create_time_aware_split(X, y)
            
            result = {
                "X": X,
                "y": y,
                "X_train": X,  # Full data, splitting handled in trainer
                "y_train": y,
                "scaler": scaler,
                "feature_names": selected_features,
                "original_feature_count": len(numeric_features),
                "selected_feature_count": len(selected_features),
                "preprocessing_info": {
                    "scaling_method": scaling_method,
                    "feature_selection": feature_selection,
                    "outlier_removal": remove_outliers,
                    "missing_value_handling": handle_missing,
                    "time_series_aware": time_series_aware
                },
                "split_info": split_info
            }
            
            logger.info(
                "Training data preparation completed",
                output_shape=X.shape,
                selected_features=len(selected_features),
                scaling_method=scaling_method
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Training data preparation failed: {e}")
            if isinstance(e, (InsufficientDataException, InvalidFeatureDataException)):
                raise
            raise InvalidFeatureDataException(f"Data preparation failed: {str(e)}")
    
    def _handle_missing_values(
        self, 
        data: pd.DataFrame, 
        target_column: str
    ) -> pd.DataFrame:
        """Handle missing values in the dataset."""
        
        logger.debug("Handling missing values")
        
        # Remove rows where target is missing
        data = data.dropna(subset=[target_column])
        
        # Handle missing features
        numeric_columns = data.select_dtypes(include=[np.number]).columns
        categorical_columns = data.select_dtypes(include=["object", "category"]).columns
        
        # Impute numeric features with median
        if len(numeric_columns) > 1:  # Exclude target column
            numeric_features = [col for col in numeric_columns if col != target_column]
            if numeric_features:
                imputer = SimpleImputer(strategy='median')
                data[numeric_features] = imputer.fit_transform(data[numeric_features])
        
        # Impute categorical features with mode
        for col in categorical_columns:
            if col != target_column:
                mode_value = data[col].mode()
                if not mode_value.empty:
                    data[col] = data[col].fillna(mode_value.iloc[0])
                else:
                    data[col] = data[col].fillna("unknown")
        
        logger.debug(f"Missing value handling completed, remaining samples: {len(data)}")
        
        return data
    
    def _remove_outliers(
        self, 
        data: pd.DataFrame, 
        target_column: str, 
        method: str = "iqr",
        threshold: float = 1.5
    ) -> pd.DataFrame:
        """Remove outliers from the dataset."""
        
        logger.debug("Removing outliers")
        original_length = len(data)
        
        if method == "iqr":
            # Remove outliers using IQR method
            numeric_columns = data.select_dtypes(include=[np.number]).columns
            
            for col in numeric_columns:
                Q1 = data[col].quantile(0.25)
                Q3 = data[col].quantile(0.75)
                IQR = Q3 - Q1
                
                # Define outlier bounds
                lower_bound = Q1 - threshold * IQR
                upper_bound = Q3 + threshold * IQR
                
                # Remove outliers
                data = data[(data[col] >= lower_bound) & (data[col] <= upper_bound)]
        
        elif method == "zscore":
            # Remove outliers using Z-score method
            numeric_columns = data.select_dtypes(include=[np.number]).columns
            
            for col in numeric_columns:
                z_scores = np.abs((data[col] - data[col].mean()) / data[col].std())
                data = data[z_scores < threshold]
        
        removed_count = original_length - len(data)
        if removed_count > 0:
            logger.debug(f"Removed {removed_count} outliers ({removed_count/original_length*100:.1f}%)")
        
        return data
    
    def _select_features(
        self, 
        X: pd.DataFrame, 
        y: pd.Series, 
        n_features: int,
        method: str = "f_regression"
    ) -> Tuple[List[str], Dict[str, float]]:
        """Select top features based on statistical tests."""
        
        logger.debug(f"Selecting top {n_features} features from {len(X.columns)}")
        
        try:
            # Ensure we don't select more features than available
            n_features = min(n_features, len(X.columns))
            
            if method == "f_regression":
                selector = SelectKBest(score_func=f_regression, k=n_features)
            elif method == "mutual_info":
                selector = SelectKBest(score_func=mutual_info_regression, k=n_features)
            else:
                # Default to f_regression
                selector = SelectKBest(score_func=f_regression, k=n_features)
            
            # Fit selector
            X_selected = selector.fit_transform(X, y)
            
            # Get selected feature names
            selected_indices = selector.get_support(indices=True)
            selected_features = [X.columns[i] for i in selected_indices]
            
            # Get feature scores
            feature_scores = {}
            if hasattr(selector, 'scores_'):
                for i, feature in enumerate(X.columns):
                    if i in selected_indices:
                        feature_scores[feature] = float(selector.scores_[i])
            
            logger.debug(f"Feature selection completed, selected {len(selected_features)} features")
            
            return selected_features, feature_scores
            
        except Exception as e:
            logger.warning(f"Feature selection failed: {e}, using all features")
            return list(X.columns), {}
    
    def _scale_features(
        self, 
        X: pd.DataFrame, 
        scaling_method: str
    ) -> Tuple[Any, np.ndarray]:
        """Scale features using specified method."""
        
        logger.debug(f"Scaling features using {scaling_method}")
        
        scaler_class = self.scalers[scaling_method]
        scaler = scaler_class()
        
        # Fit and transform
        X_scaled = scaler.fit_transform(X)
        
        logger.debug("Feature scaling completed")
        
        return scaler, X_scaled
    
    def _create_time_aware_split(
        self, 
        X: pd.DataFrame, 
        y: pd.Series, 
        validation_ratio: float = 0.2
    ) -> Dict[str, Any]:
        """Create time-aware split information for time series data."""
        
        split_point = int(len(X) * (1 - validation_ratio))
        
        split_info = {
            "split_method": "time_series",
            "split_point": split_point,
            "train_size": split_point,
            "validation_size": len(X) - split_point,
            "validation_ratio": validation_ratio
        }
        
        return split_info
    
    async def create_training_dataset(
        self,
        features_data: List[Dict[str, Any]],
        target_definition: Dict[str, Any],
        lookback_window: int = 30,
        prediction_horizon: int = 1
    ) -> pd.DataFrame:
        """Create training dataset from feature data with target generation."""
        
        try:
            logger.info(
                "Creating training dataset",
                n_feature_records=len(features_data),
                lookback_window=lookback_window,
                prediction_horizon=prediction_horizon
            )
            
            if not features_data:
                raise InsufficientDataException("No feature data provided")
            
            # Convert feature data to DataFrame
            records = []
            for feature_record in features_data:
                if "features" in feature_record and "metadata" in feature_record:
                    record = {
                        "symbol": feature_record["metadata"].get("symbol"),
                        "timestamp": feature_record["metadata"].get("extraction_timestamp"),
                        **feature_record["features"]
                    }
                    records.append(record)
            
            if not records:
                raise InvalidFeatureDataException("No valid feature records found")
            
            df = pd.DataFrame(records)
            
            # Sort by symbol and timestamp for proper sequence
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            df = df.sort_values(["symbol", "timestamp"])
            
            # Generate target variable
            df = self._generate_target_variable(df, target_definition, prediction_horizon)
            
            # Create sequences for time-series learning
            if lookback_window > 1:
                df = self._create_sequences(df, lookback_window)
            
            # Remove rows with missing targets
            df = df.dropna(subset=[target_definition["column"]])
            
            logger.info(
                "Training dataset created",
                final_shape=df.shape,
                target_column=target_definition["column"]
            )
            
            return df
            
        except Exception as e:
            logger.error(f"Training dataset creation failed: {e}")
            if isinstance(e, (InsufficientDataException, InvalidFeatureDataException)):
                raise
            raise InvalidFeatureDataException(f"Dataset creation failed: {str(e)}")
    
    def _generate_target_variable(
        self, 
        df: pd.DataFrame, 
        target_definition: Dict[str, Any], 
        prediction_horizon: int
    ) -> pd.DataFrame:
        """Generate target variable based on definition."""
        
        target_type = target_definition.get("type", "price_return")
        target_column = target_definition.get("column", "target")
        
        if target_type == "price_return":
            # Calculate future price return
            if "price_current_price" in df.columns:
                df[target_column] = df.groupby("symbol")["price_current_price"].pct_change(periods=prediction_horizon).shift(-prediction_horizon)
        
        elif target_type == "price_direction":
            # Binary classification: up/down
            if "price_current_price" in df.columns:
                future_price = df.groupby("symbol")["price_current_price"].shift(-prediction_horizon)
                current_price = df["price_current_price"]
                df[target_column] = (future_price > current_price).astype(int)
        
        elif target_type == "volatility":
            # Future volatility prediction
            if "price_current_price" in df.columns:
                returns = df.groupby("symbol")["price_current_price"].pct_change()
                df[target_column] = returns.rolling(window=prediction_horizon).std().shift(-prediction_horizon)
        
        elif target_type == "custom":
            # Custom target calculation
            custom_func = target_definition.get("function")
            if custom_func and callable(custom_func):
                df[target_column] = df.groupby("symbol").apply(lambda x: custom_func(x, prediction_horizon))
        
        return df
    
    def _create_sequences(
        self, 
        df: pd.DataFrame, 
        lookback_window: int
    ) -> pd.DataFrame:
        """Create sequential features for time-series learning."""
        
        logger.debug(f"Creating sequences with lookback window: {lookback_window}")
        
        # Group by symbol and create lagged features
        sequence_features = []
        
        for symbol in df["symbol"].unique():
            symbol_data = df[df["symbol"] == symbol].copy()
            
            # Create lagged features
            numeric_columns = symbol_data.select_dtypes(include=[np.number]).columns
            numeric_columns = [col for col in numeric_columns if not col.startswith("target")]
            
            for col in numeric_columns:
                for lag in range(1, lookback_window + 1):
                    symbol_data[f"{col}_lag_{lag}"] = symbol_data[col].shift(lag)
            
            sequence_features.append(symbol_data)
        
        result_df = pd.concat(sequence_features, ignore_index=True)
        
        logger.debug("Sequence creation completed")
        
        return result_df
    
    def validate_training_data(
        self, 
        X: pd.DataFrame, 
        y: pd.Series,
        min_samples: int = 100,
        max_missing_ratio: float = 0.1
    ) -> Dict[str, Any]:
        """Validate prepared training data quality."""
        
        validation_result = {
            "is_valid": True,
            "issues": [],
            "warnings": [],
            "statistics": {}
        }
        
        # Check sample size
        if len(X) < min_samples:
            validation_result["is_valid"] = False
            validation_result["issues"].append(f"Insufficient samples: {len(X)} < {min_samples}")
        
        # Check missing values
        missing_ratio = X.isnull().sum().sum() / (len(X) * len(X.columns))
        if missing_ratio > max_missing_ratio:
            validation_result["is_valid"] = False
            validation_result["issues"].append(f"Too many missing values: {missing_ratio:.3f} > {max_missing_ratio}")
        
        # Check target distribution
        if y.nunique() < 2:
            validation_result["is_valid"] = False
            validation_result["issues"].append("Target variable has insufficient variation")
        
        # Check for constant features
        constant_features = X.columns[X.nunique() <= 1].tolist()
        if constant_features:
            validation_result["warnings"].append(f"Constant features found: {constant_features}")
        
        # Statistics
        validation_result["statistics"] = {
            "n_samples": len(X),
            "n_features": len(X.columns),
            "missing_ratio": missing_ratio,
            "target_mean": float(y.mean()),
            "target_std": float(y.std()),
            "constant_features": len(constant_features)
        }
        
        return validation_result