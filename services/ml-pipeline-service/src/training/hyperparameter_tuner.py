"""
Hyperparameter Optimization Module

Advanced hyperparameter tuning using Optuna for ML trading models.
Supports Bayesian optimization, pruning, and multi-objective optimization.
"""

from typing import Dict, Any, List, Optional, Callable, Tuple
import asyncio
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_score, TimeSeriesSplit
from sklearn.metrics import mean_squared_error, r2_score
import optuna
from optuna.samplers import TPESampler, CmaEsSampler
from optuna.pruners import MedianPruner, HyperbandPruner
import structlog

from ..training.model_trainer import ModelType
from ..core.exceptions import ModelTrainingException, InvalidModelConfigException

logger = structlog.get_logger("hyperparameter-tuner")


class HyperparameterTuner:
    """Advanced hyperparameter optimization engine."""
    
    def __init__(self):
        self.thread_pool = ThreadPoolExecutor(max_workers=2)
        
        # Hyperparameter search spaces for different models
        self.search_spaces = {
            ModelType.LINEAR_REGRESSION: self._linear_regression_space,
            ModelType.RIDGE_REGRESSION: self._ridge_regression_space,
            ModelType.LASSO_REGRESSION: self._lasso_regression_space,
            ModelType.RANDOM_FOREST: self._random_forest_space,
            ModelType.GRADIENT_BOOSTING: self._gradient_boosting_space,
            ModelType.SVM: self._svm_space
        }
        
        # Model classes mapping
        self.model_classes = self._get_model_classes()
    
    def _get_model_classes(self):
        """Import model classes dynamically to avoid circular imports."""
        from sklearn.linear_model import LinearRegression, Ridge, Lasso
        from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
        from sklearn.svm import SVR
        
        return {
            ModelType.LINEAR_REGRESSION: LinearRegression,
            ModelType.RIDGE_REGRESSION: Ridge,
            ModelType.LASSO_REGRESSION: Lasso,
            ModelType.RANDOM_FOREST: RandomForestRegressor,
            ModelType.GRADIENT_BOOSTING: GradientBoostingRegressor,
            ModelType.SVM: SVR
        }
    
    async def optimize_hyperparameters(
        self,
        model_type: ModelType,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        n_trials: int = 100,
        optimization_direction: str = "maximize",
        scoring_metric: str = "r2",
        cv_folds: int = 3,
        timeout: Optional[int] = None,
        early_stopping: bool = True
    ) -> Dict[str, Any]:
        """Optimize hyperparameters using Optuna."""
        
        try:
            logger.info(
                "Starting hyperparameter optimization",
                model_type=model_type,
                n_trials=n_trials,
                scoring_metric=scoring_metric
            )
            
            if model_type not in self.search_spaces:
                raise InvalidModelConfigException(f"No search space defined for {model_type}")
            
            # Create study
            study = optuna.create_study(
                direction=optimization_direction,
                sampler=TPESampler(seed=42),
                pruner=MedianPruner(n_startup_trials=10, n_warmup_steps=5) if early_stopping else None
            )
            
            # Define objective function
            def objective(trial):
                return self._objective_function(
                    trial=trial,
                    model_type=model_type,
                    X_train=X_train,
                    y_train=y_train,
                    X_val=X_val,
                    y_val=y_val,
                    scoring_metric=scoring_metric,
                    cv_folds=cv_folds
                )
            
            # Run optimization
            await asyncio.get_event_loop().run_in_executor(
                self.thread_pool,
                lambda: study.optimize(objective, n_trials=n_trials, timeout=timeout)
            )
            
            # Get best parameters
            best_params = study.best_params
            best_score = study.best_value
            
            # Add study statistics
            optimization_result = {
                "best_params": best_params,
                "best_score": float(best_score),
                "n_trials": len(study.trials),
                "optimization_direction": optimization_direction,
                "scoring_metric": scoring_metric,
                "study_statistics": {
                    "n_complete_trials": len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]),
                    "n_pruned_trials": len([t for t in study.trials if t.state == optuna.trial.TrialState.PRUNED]),
                    "n_failed_trials": len([t for t in study.trials if t.state == optuna.trial.TrialState.FAIL])
                }
            }
            
            logger.info(
                "Hyperparameter optimization completed",
                model_type=model_type,
                best_score=best_score,
                n_trials_completed=len(study.trials),
                best_params=best_params
            )
            
            return best_params
            
        except Exception as e:
            logger.error(f"Hyperparameter optimization failed: {e}")
            raise ModelTrainingException(f"Hyperparameter optimization failed: {str(e)}")
    
    def _objective_function(
        self,
        trial,
        model_type: ModelType,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        scoring_metric: str,
        cv_folds: int
    ) -> float:
        """Objective function for hyperparameter optimization."""
        
        try:
            # Get hyperparameter suggestions
            space_func = self.search_spaces[model_type]
            params = space_func(trial)
            
            # Create model with suggested parameters
            model_class = self.model_classes[model_type]
            model = model_class(**params)
            
            # Use cross-validation for robust evaluation
            if cv_folds > 1:
                # Time series split for financial data
                tscv = TimeSeriesSplit(n_splits=cv_folds)
                
                if scoring_metric == "r2":
                    scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring="r2")
                elif scoring_metric == "neg_mse":
                    scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring="neg_mean_squared_error")
                elif scoring_metric == "neg_mae":
                    scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring="neg_mean_absolute_error")
                else:
                    scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring="r2")
                
                score = scores.mean()
            else:
                # Single validation split
                model.fit(X_train, y_train)
                y_pred = model.predict(X_val)
                
                if scoring_metric == "r2":
                    score = r2_score(y_val, y_pred)
                elif scoring_metric == "neg_mse":
                    score = -mean_squared_error(y_val, y_pred)
                elif scoring_metric == "neg_mae":
                    score = -np.mean(np.abs(y_val - y_pred))
                else:
                    score = r2_score(y_val, y_pred)
            
            # Report intermediate value for pruning
            trial.report(score, 0)
            
            # Check if trial should be pruned
            if trial.should_prune():
                raise optuna.exceptions.TrialPruned()
            
            return score
            
        except optuna.exceptions.TrialPruned:
            raise
        except Exception as e:
            logger.warning(f"Trial failed: {e}")
            # Return worst possible score to indicate failure
            return -float('inf') if scoring_metric.startswith("neg_") else float('-inf')
    
    def _linear_regression_space(self, trial) -> Dict[str, Any]:
        """Search space for Linear Regression."""
        return {
            "fit_intercept": trial.suggest_categorical("fit_intercept", [True, False]),
            "positive": trial.suggest_categorical("positive", [True, False])
        }
    
    def _ridge_regression_space(self, trial) -> Dict[str, Any]:
        """Search space for Ridge Regression."""
        return {
            "alpha": trial.suggest_float("alpha", 1e-6, 100.0, log=True),
            "fit_intercept": trial.suggest_categorical("fit_intercept", [True, False]),
            "solver": trial.suggest_categorical("solver", ["auto", "svd", "cholesky", "lsqr", "sparse_cg", "sag", "saga"])
        }
    
    def _lasso_regression_space(self, trial) -> Dict[str, Any]:
        """Search space for Lasso Regression."""
        return {
            "alpha": trial.suggest_float("alpha", 1e-6, 10.0, log=True),
            "fit_intercept": trial.suggest_categorical("fit_intercept", [True, False]),
            "max_iter": trial.suggest_int("max_iter", 100, 2000),
            "selection": trial.suggest_categorical("selection", ["cyclic", "random"])
        }
    
    def _random_forest_space(self, trial) -> Dict[str, Any]:
        """Search space for Random Forest."""
        return {
            "n_estimators": trial.suggest_int("n_estimators", 10, 300),
            "max_depth": trial.suggest_int("max_depth", 3, 20),
            "min_samples_split": trial.suggest_int("min_samples_split", 2, 20),
            "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 10),
            "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2", None]),
            "bootstrap": trial.suggest_categorical("bootstrap", [True, False]),
            "random_state": 42
        }
    
    def _gradient_boosting_space(self, trial) -> Dict[str, Any]:
        """Search space for Gradient Boosting."""
        return {
            "n_estimators": trial.suggest_int("n_estimators", 50, 500),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3),
            "max_depth": trial.suggest_int("max_depth", 3, 10),
            "min_samples_split": trial.suggest_int("min_samples_split", 2, 20),
            "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 10),
            "subsample": trial.suggest_float("subsample", 0.5, 1.0),
            "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2", None]),
            "random_state": 42
        }
    
    def _svm_space(self, trial) -> Dict[str, Any]:
        """Search space for Support Vector Regression."""
        kernel = trial.suggest_categorical("kernel", ["linear", "poly", "rbf", "sigmoid"])
        
        params = {
            "kernel": kernel,
            "C": trial.suggest_float("C", 1e-3, 1000.0, log=True),
            "epsilon": trial.suggest_float("epsilon", 1e-4, 1.0, log=True)
        }
        
        if kernel == "poly":
            params["degree"] = trial.suggest_int("degree", 2, 5)
        
        if kernel in ["poly", "rbf", "sigmoid"]:
            params["gamma"] = trial.suggest_categorical("gamma", ["scale", "auto"])
        
        return params
    
    async def multi_objective_optimization(
        self,
        model_type: ModelType,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        objectives: List[str] = None,
        n_trials: int = 100
    ) -> Dict[str, Any]:
        """Multi-objective hyperparameter optimization."""
        
        objectives = objectives or ["r2", "neg_mse"]
        
        try:
            logger.info(
                "Starting multi-objective optimization",
                model_type=model_type,
                objectives=objectives
            )
            
            # Create multi-objective study
            study = optuna.create_study(
                directions=["maximize" if obj == "r2" else "minimize" for obj in objectives],
                sampler=TPESampler(seed=42)
            )
            
            def multi_objective_function(trial):
                # Get hyperparameter suggestions
                space_func = self.search_spaces[model_type]
                params = space_func(trial)
                
                # Create and train model
                model_class = self.model_classes[model_type]
                model = model_class(**params)
                model.fit(X_train, y_train)
                
                # Make predictions
                y_pred = model.predict(X_val)
                
                # Calculate multiple objectives
                results = []
                for obj in objectives:
                    if obj == "r2":
                        score = r2_score(y_val, y_pred)
                    elif obj == "neg_mse":
                        score = mean_squared_error(y_val, y_pred)
                    elif obj == "neg_mae":
                        score = np.mean(np.abs(y_val - y_pred))
                    else:
                        score = r2_score(y_val, y_pred)
                    
                    results.append(score)
                
                return results
            
            # Run optimization
            await asyncio.get_event_loop().run_in_executor(
                self.thread_pool,
                lambda: study.optimize(multi_objective_function, n_trials=n_trials)
            )
            
            # Get Pareto front solutions
            pareto_solutions = []
            for trial in study.best_trials:
                pareto_solutions.append({
                    "params": trial.params,
                    "values": trial.values,
                    "objectives": dict(zip(objectives, trial.values))
                })
            
            logger.info(
                "Multi-objective optimization completed",
                n_pareto_solutions=len(pareto_solutions)
            )
            
            return {
                "pareto_solutions": pareto_solutions,
                "objectives": objectives,
                "n_trials": len(study.trials)
            }
            
        except Exception as e:
            logger.error(f"Multi-objective optimization failed: {e}")
            raise ModelTrainingException(f"Multi-objective optimization failed: {str(e)}")
    
    async def hyperparameter_sensitivity_analysis(
        self,
        model_type: ModelType,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        n_samples: int = 50
    ) -> Dict[str, Any]:
        """Analyze sensitivity of hyperparameters."""
        
        try:
            logger.info(
                "Starting hyperparameter sensitivity analysis",
                model_type=model_type,
                n_samples=n_samples
            )
            
            # Sample hyperparameter combinations
            space_func = self.search_spaces[model_type]
            model_class = self.model_classes[model_type]
            
            results = []
            
            # Create temporary study to sample parameters
            study = optuna.create_study()
            
            for i in range(n_samples):
                trial = study.ask()
                params = space_func(trial)
                
                try:
                    model = model_class(**params)
                    model.fit(X_train, y_train)
                    y_pred = model.predict(X_val)
                    
                    r2 = r2_score(y_val, y_pred)
                    mse = mean_squared_error(y_val, y_pred)
                    
                    result = {
                        "params": params,
                        "r2": r2,
                        "mse": mse,
                        "trial_id": i
                    }
                    results.append(result)
                    
                except Exception as e:
                    logger.warning(f"Sensitivity analysis trial {i} failed: {e}")
                    continue
            
            # Analyze parameter importance
            parameter_importance = self._analyze_parameter_importance(results)
            
            logger.info(
                "Sensitivity analysis completed",
                successful_trials=len(results),
                parameter_importance=parameter_importance
            )
            
            return {
                "results": results,
                "parameter_importance": parameter_importance,
                "n_successful_trials": len(results)
            }
            
        except Exception as e:
            logger.error(f"Sensitivity analysis failed: {e}")
            raise ModelTrainingException(f"Sensitivity analysis failed: {str(e)}")
    
    def _analyze_parameter_importance(self, results: List[Dict[str, Any]]) -> Dict[str, float]:
        """Analyze the importance of different parameters."""
        
        if not results:
            return {}
        
        # Convert results to DataFrame
        import pandas as pd
        
        # Flatten parameters
        flattened_results = []
        for result in results:
            flat_result = {"r2": result["r2"], "mse": result["mse"]}
            flat_result.update(result["params"])
            flattened_results.append(flat_result)
        
        df = pd.DataFrame(flattened_results)
        
        # Calculate correlation with performance metrics
        parameter_importance = {}
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_columns:
            if col not in ["r2", "mse"]:
                try:
                    correlation = abs(df[col].corr(df["r2"]))
                    if not np.isnan(correlation):
                        parameter_importance[col] = float(correlation)
                except Exception:
                    continue
        
        # Sort by importance
        parameter_importance = dict(
            sorted(parameter_importance.items(), key=lambda x: x[1], reverse=True)
        )
        
        return parameter_importance