"""
Feature Validation Module

Validates feature data quality, consistency, and completeness for ML training.
Implements comprehensive validation rules for trading features and market data.
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import pandas as pd
import numpy as np
from pydantic import BaseModel
import structlog

from ..core.exceptions import InvalidFeatureDataException, FeatureEngineeringException

logger = structlog.get_logger("feature-validator")


class ValidationResult(BaseModel):
    """Result of feature validation."""
    is_valid: bool
    quality_score: float
    error_message: Optional[str] = None
    warnings: List[str] = []
    validation_details: Dict[str, Any] = {}
    

class FeatureValidator:
    """Comprehensive feature validation engine."""
    
    def __init__(self):
        self.min_quality_score = 0.7
        self.validation_rules = {
            "completeness": self._validate_completeness,
            "consistency": self._validate_consistency,
            "outliers": self._validate_outliers,
            "range": self._validate_ranges,
            "correlation": self._validate_correlations,
            "distribution": self._validate_distributions
        }
    
    async def validate_features(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool = False
    ) -> ValidationResult:
        """Validate extracted features comprehensively."""
        
        try:
            logger.info(
                "Starting feature validation",
                feature_count=len(features),
                data_points=len(market_data),
                strict_mode=strict_mode
            )
            
            validation_details = {}
            warnings = []
            quality_scores = []
            
            # Run all validation rules
            for rule_name, rule_func in self.validation_rules.items():
                try:
                    score, details, rule_warnings = await rule_func(
                        features, market_data, strict_mode
                    )
                    validation_details[rule_name] = details
                    quality_scores.append(score)
                    warnings.extend(rule_warnings)
                    
                except Exception as e:
                    logger.error(f"Validation rule {rule_name} failed: {e}")
                    if strict_mode:
                        return ValidationResult(
                            is_valid=False,
                            quality_score=0.0,
                            error_message=f"Validation rule {rule_name} failed: {str(e)}",
                            warnings=warnings,
                            validation_details=validation_details
                        )
                    else:
                        warnings.append(f"Validation rule {rule_name} failed: {str(e)}")
                        quality_scores.append(0.5)  # Partial score for failed rule
            
            # Calculate overall quality score
            overall_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0.0
            is_valid = overall_quality >= self.min_quality_score
            
            # Generate error message if validation failed
            error_message = None
            if not is_valid:
                error_message = f"Feature validation failed with quality score {overall_quality:.3f} (minimum: {self.min_quality_score})"
                
                # Add specific issues
                failed_rules = [
                    rule for rule, details in validation_details.items() 
                    if details.get("passed", True) is False
                ]
                if failed_rules:
                    error_message += f". Failed rules: {', '.join(failed_rules)}"
            
            result = ValidationResult(
                is_valid=is_valid,
                quality_score=round(overall_quality, 3),
                error_message=error_message,
                warnings=warnings,
                validation_details=validation_details
            )
            
            logger.info(
                "Feature validation completed",
                is_valid=is_valid,
                quality_score=overall_quality,
                warning_count=len(warnings)
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Feature validation failed: {e}")
            return ValidationResult(
                is_valid=False,
                quality_score=0.0,
                error_message=f"Validation process failed: {str(e)}",
                warnings=[],
                validation_details={}
            )
    
    async def _validate_completeness(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate feature completeness."""
        
        warnings = []
        details = {"rule": "completeness", "passed": True}
        
        # Check for minimum required features
        required_feature_prefixes = ["price_", "volume_", "technical_", "volatility_", "momentum_"]
        missing_categories = []
        
        for prefix in required_feature_prefixes:
            if not any(key.startswith(prefix) for key in features.keys()):
                missing_categories.append(prefix.rstrip("_"))
        
        if missing_categories:
            details["missing_categories"] = missing_categories
            warnings.append(f"Missing feature categories: {', '.join(missing_categories)}")
            if strict_mode:
                details["passed"] = False
        
        # Check for null/NaN values
        null_features = []
        for key, value in features.items():
            if value is None or (isinstance(value, float) and np.isnan(value)):
                null_features.append(key)
        
        if null_features:
            details["null_features"] = null_features
            warnings.append(f"Features with null values: {', '.join(null_features[:5])}")
            if len(null_features) > 5:
                warnings.append(f"... and {len(null_features) - 5} more")
        
        # Check feature count
        expected_min_features = 20  # Minimum expected features
        if len(features) < expected_min_features:
            details["feature_count_low"] = True
            warnings.append(f"Low feature count: {len(features)} (expected: ≥{expected_min_features})")
        
        # Calculate completeness score
        completeness_score = 1.0
        
        # Penalize missing categories
        if missing_categories:
            penalty = len(missing_categories) / len(required_feature_prefixes) * 0.3
            completeness_score -= penalty
        
        # Penalize null features
        if null_features:
            penalty = min(len(null_features) / len(features) * 0.4, 0.4)
            completeness_score -= penalty
        
        # Penalize low feature count
        if len(features) < expected_min_features:
            penalty = (expected_min_features - len(features)) / expected_min_features * 0.3
            completeness_score -= penalty
        
        details["completeness_score"] = max(completeness_score, 0.0)
        
        return max(completeness_score, 0.0), details, warnings
    
    async def _validate_consistency(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate feature consistency."""
        
        warnings = []
        details = {"rule": "consistency", "passed": True}
        
        # Check price consistency
        price_features = {k: v for k, v in features.items() if k.startswith("price_")}
        if price_features:
            current_price = features.get("price_current_price")
            if current_price and not market_data.empty:
                actual_last_price = float(market_data["close"].iloc[-1])
                price_diff = abs(current_price - actual_last_price) / actual_last_price
                
                if price_diff > 0.001:  # 0.1% tolerance
                    warnings.append(f"Price inconsistency: feature={current_price}, actual={actual_last_price}")
                    details["price_inconsistency"] = price_diff
        
        # Check volume consistency
        volume_features = {k: v for k, v in features.items() if k.startswith("volume_")}
        if volume_features:
            current_volume = features.get("volume_current_volume")
            if current_volume and not market_data.empty:
                actual_volume = float(market_data["volume"].iloc[-1])
                if current_volume != actual_volume:
                    warnings.append(f"Volume inconsistency: feature={current_volume}, actual={actual_volume}")
                    details["volume_inconsistency"] = abs(current_volume - actual_volume)
        
        # Check technical indicator ranges
        technical_features = {k: v for k, v in features.items() if k.startswith("technical_")}
        for key, value in technical_features.items():
            if isinstance(value, (int, float)) and not np.isnan(value):
                # RSI should be 0-100
                if "rsi" in key.lower() and (value < 0 or value > 100):
                    warnings.append(f"RSI out of range: {key}={value}")
                    details["rsi_out_of_range"] = True
                
                # Williams %R should be -100 to 0
                if "williams" in key.lower() and (value < -100 or value > 0):
                    warnings.append(f"Williams %R out of range: {key}={value}")
                    details["williams_out_of_range"] = True
        
        # Calculate consistency score
        consistency_score = 1.0
        
        # Penalize inconsistencies
        inconsistency_count = len([d for d in details.values() if str(d).endswith("_inconsistency") or str(d).endswith("_out_of_range")])
        if inconsistency_count > 0:
            penalty = min(inconsistency_count * 0.1, 0.5)
            consistency_score -= penalty
        
        details["consistency_score"] = consistency_score
        
        return consistency_score, details, warnings
    
    async def _validate_outliers(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate for extreme outliers in features."""
        
        warnings = []
        details = {"rule": "outliers", "passed": True}
        
        outlier_features = []
        numeric_features = {k: v for k, v in features.items() 
                          if isinstance(v, (int, float)) and not np.isnan(v)}
        
        if not numeric_features:
            return 1.0, details, warnings
        
        # Group features by type for appropriate outlier detection
        feature_groups = {
            "price": [k for k in numeric_features.keys() if k.startswith("price_")],
            "volume": [k for k in numeric_features.keys() if k.startswith("volume_")],
            "technical": [k for k in numeric_features.keys() if k.startswith("technical_")],
            "volatility": [k for k in numeric_features.keys() if k.startswith("volatility_")],
            "momentum": [k for k in numeric_features.keys() if k.startswith("momentum_")]
        }
        
        for group_name, feature_keys in feature_groups.items():
            if not feature_keys:
                continue
                
            group_values = [features[k] for k in feature_keys]
            
            # Calculate z-scores for the group
            if len(group_values) > 1:
                mean_val = np.mean(group_values)
                std_val = np.std(group_values)
                
                if std_val > 0:
                    z_scores = [(val - mean_val) / std_val for val in group_values]
                    
                    # Flag extreme outliers (|z| > 3)
                    for i, z_score in enumerate(z_scores):
                        if abs(z_score) > 3:
                            outlier_features.append({
                                "feature": feature_keys[i],
                                "value": group_values[i],
                                "z_score": z_score,
                                "group": group_name
                            })
        
        if outlier_features:
            details["outliers"] = outlier_features
            warnings.append(f"Found {len(outlier_features)} potential outliers")
            
            # Show top outliers in warnings
            for outlier in outlier_features[:3]:
                warnings.append(
                    f"Outlier: {outlier['feature']}={outlier['value']:.4f} "
                    f"(z-score: {outlier['z_score']:.2f})"
                )
        
        # Calculate outlier score
        outlier_score = 1.0
        if outlier_features:
            # Penalize based on number and severity of outliers
            severe_outliers = len([o for o in outlier_features if abs(o["z_score"]) > 5])
            moderate_outliers = len(outlier_features) - severe_outliers
            
            penalty = (severe_outliers * 0.1) + (moderate_outliers * 0.05)
            outlier_score = max(1.0 - penalty, 0.0)
        
        details["outlier_score"] = outlier_score
        
        return outlier_score, details, warnings
    
    async def _validate_ranges(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate feature values are within reasonable ranges."""
        
        warnings = []
        details = {"rule": "ranges", "passed": True}
        
        range_violations = []
        
        # Define reasonable ranges for different feature types
        range_rules = {
            # Price features
            "price_current_price": (0.01, 100000),  # $0.01 to $100k
            "price_change_pct": (-50, 50),  # -50% to +50% daily change
            "price_volatility": (0, 5),  # 0% to 500% annualized volatility
            
            # Volume features  
            "volume_ratio": (0, 50),  # Volume ratio 0x to 50x normal
            
            # Technical indicators
            "technical_rsi": (0, 100),  # RSI 0-100
            "technical_stoch": (0, 100),  # Stochastic 0-100
            "technical_williams": (-100, 0),  # Williams %R -100 to 0
            
            # Volatility features
            "volatility_": (0, 10),  # General volatility 0-1000%
            "atr_": (0, None),  # ATR should be positive
            
            # Momentum features
            "momentum_": (-100, 100),  # General momentum features
        }
        
        for feature_key, value in features.items():
            if not isinstance(value, (int, float)) or np.isnan(value):
                continue
            
            # Check specific rules first
            for rule_key, (min_val, max_val) in range_rules.items():
                if feature_key.startswith(rule_key):
                    violated = False
                    
                    if min_val is not None and value < min_val:
                        violated = True
                        range_violations.append({
                            "feature": feature_key,
                            "value": value,
                            "min_expected": min_val,
                            "max_expected": max_val,
                            "violation_type": "below_minimum"
                        })
                    
                    if max_val is not None and value > max_val:
                        violated = True
                        range_violations.append({
                            "feature": feature_key,
                            "value": value,
                            "min_expected": min_val,
                            "max_expected": max_val,
                            "violation_type": "above_maximum"
                        })
                    
                    if violated:
                        warnings.append(
                            f"Range violation: {feature_key}={value} "
                            f"(expected: {min_val}-{max_val})"
                        )
                    break
        
        if range_violations:
            details["range_violations"] = range_violations
            details["passed"] = len(range_violations) == 0 or not strict_mode
        
        # Calculate range score
        range_score = 1.0
        if range_violations:
            penalty = min(len(range_violations) * 0.1, 0.8)
            range_score = max(1.0 - penalty, 0.0)
        
        details["range_score"] = range_score
        
        return range_score, details, warnings
    
    async def _validate_correlations(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate feature correlations for sanity checks."""
        
        warnings = []
        details = {"rule": "correlations", "passed": True}
        
        # This is a simplified correlation check
        # In a full implementation, you might check correlations between
        # features and market data over time, or between related features
        
        correlation_issues = []
        
        # Check if price features correlate with actual price movement
        if not market_data.empty and len(market_data) > 1:
            price_change_actual = float(market_data["close"].iloc[-1] - market_data["close"].iloc[-2])
            price_change_feature = features.get("price_price_change", 0)
            
            if abs(price_change_actual - price_change_feature) > 0.01:
                correlation_issues.append({
                    "issue": "price_change_mismatch",
                    "actual": price_change_actual,
                    "feature": price_change_feature
                })
        
        # Check logical relationships between features
        current_price = features.get("price_current_price")
        high_price = features.get("price_high") if "price_high" in features else None
        low_price = features.get("price_low") if "price_low" in features else None
        
        if all(val is not None for val in [current_price, high_price, low_price]):
            if not (low_price <= current_price <= high_price):
                correlation_issues.append({
                    "issue": "price_relationship_violation",
                    "current": current_price,
                    "high": high_price,
                    "low": low_price
                })
                warnings.append(f"Price relationship violation: low={low_price}, current={current_price}, high={high_price}")
        
        if correlation_issues:
            details["correlation_issues"] = correlation_issues
            details["passed"] = len(correlation_issues) == 0 or not strict_mode
        
        # Calculate correlation score
        correlation_score = 1.0
        if correlation_issues:
            penalty = min(len(correlation_issues) * 0.15, 0.6)
            correlation_score = max(1.0 - penalty, 0.0)
        
        details["correlation_score"] = correlation_score
        
        return correlation_score, details, warnings
    
    async def _validate_distributions(
        self, 
        features: Dict[str, Any], 
        market_data: pd.DataFrame,
        strict_mode: bool
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        """Validate feature distributions for reasonableness."""
        
        warnings = []
        details = {"rule": "distributions", "passed": True}
        
        # This is a basic distribution check
        # In a full implementation, you might check if features follow
        # expected statistical distributions
        
        distribution_issues = []
        
        # Check for features with extreme values that might indicate calculation errors
        numeric_features = {k: v for k, v in features.items() 
                          if isinstance(v, (int, float)) and not np.isnan(v)}
        
        for key, value in numeric_features.items():
            # Check for infinite values
            if np.isinf(value):
                distribution_issues.append({
                    "feature": key,
                    "issue": "infinite_value",
                    "value": value
                })
                warnings.append(f"Infinite value detected: {key}={value}")
            
            # Check for extremely large values that might indicate errors
            if abs(value) > 1e10:
                distribution_issues.append({
                    "feature": key,
                    "issue": "extremely_large_value",
                    "value": value
                })
                warnings.append(f"Extremely large value: {key}={value}")
        
        if distribution_issues:
            details["distribution_issues"] = distribution_issues
            details["passed"] = len(distribution_issues) == 0 or not strict_mode
        
        # Calculate distribution score
        distribution_score = 1.0
        if distribution_issues:
            penalty = min(len(distribution_issues) * 0.2, 0.8)
            distribution_score = max(1.0 - penalty, 0.0)
        
        details["distribution_score"] = distribution_score
        
        return distribution_score, details, warnings
    
    def update_validation_rules(self, new_rules: Dict[str, Any]):
        """Update validation rules dynamically."""
        self.validation_rules.update(new_rules)
        logger.info("Validation rules updated", new_rule_count=len(new_rules))
    
    def set_quality_threshold(self, threshold: float):
        """Set minimum quality score threshold."""
        if 0.0 <= threshold <= 1.0:
            self.min_quality_score = threshold
            logger.info("Quality threshold updated", new_threshold=threshold)
        else:
            raise ValueError("Quality threshold must be between 0.0 and 1.0")