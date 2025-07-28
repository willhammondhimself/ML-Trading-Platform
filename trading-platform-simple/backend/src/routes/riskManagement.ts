import { Router } from 'express';
import { RiskManagementService } from '../services/riskManagement';
import { logger } from '../utils/logger';

const router = Router();
const riskService = new RiskManagementService();

// Start risk monitoring
riskService.startRiskMonitoring();

// Get portfolio metrics
router.get('/metrics', (req, res) => {
  try {
    const metrics = riskService.getPortfolioMetrics();
    
    res.json({
      success: true,
      metrics,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching portfolio metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch portfolio metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get position size recommendation
router.post('/position-size', (req, res) => {
  try {
    const {
      symbol,
      entryPrice,
      stopLoss,
      winRate = 0.55,
      avgWin = 1.5,
      avgLoss = 1.0
    } = req.body;

    // Validation
    if (!symbol || !entryPrice || !stopLoss) {
      return res.status(400).json({
        error: 'Symbol, entry price, and stop loss are required'
      });
    }

    if (entryPrice <= 0 || stopLoss <= 0) {
      return res.status(400).json({
        error: 'Entry price and stop loss must be positive numbers'
      });
    }

    if (winRate < 0 || winRate > 1) {
      return res.status(400).json({
        error: 'Win rate must be between 0 and 1'
      });
    }

    const recommendation = riskService.calculatePositionSize(
      symbol.toUpperCase(),
      entryPrice,
      stopLoss,
      winRate,
      avgWin,
      avgLoss
    );

    res.json({
      success: true,
      recommendation,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error calculating position size:', error);
    res.status(500).json({
      error: 'Failed to calculate position size',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Run stress tests
router.get('/stress-tests', (req, res) => {
  try {
    const scenarios = riskService.runStressTests();
    
    res.json({
      success: true,
      scenarios,
      count: scenarios.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error running stress tests:', error);
    res.status(500).json({
      error: 'Failed to run stress tests',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get risk alerts
router.get('/alerts', (req, res) => {
  try {
    const { unacknowledged } = req.query;
    const alerts = riskService.getRiskAlerts(unacknowledged === 'true');
    
    res.json({
      success: true,
      alerts,
      count: alerts.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching risk alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch risk alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Acknowledge risk alert
router.post('/alerts/:alertId/acknowledge', (req, res) => {
  try {
    const { alertId } = req.params;
    const success = riskService.acknowledgeAlert(alertId);
    
    if (!success) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Alert acknowledged',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({
      error: 'Failed to acknowledge alert',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get risk limits
router.get('/limits', (req, res) => {
  try {
    const limits = riskService.getRiskLimits();
    
    res.json({
      success: true,
      limits,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching risk limits:', error);
    res.status(500).json({
      error: 'Failed to fetch risk limits',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update risk limits
router.put('/limits', (req, res) => {
  try {
    const updates = req.body;
    
    // Validate limits
    const validFields = [
      'maxPositionSize', 'maxPortfolioRisk', 'maxDrawdown', 
      'maxLeverage', 'maxConcentration', 'maxDailyLoss', 'maxVaR'
    ];
    
    const invalidFields = Object.keys(updates).filter(field => !validFields.includes(field));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid fields: ${invalidFields.join(', ')}`
      });
    }
    
    // Validate ranges
    Object.entries(updates).forEach(([field, value]) => {
      if (typeof value !== 'number' || value < 0) {
        throw new Error(`${field} must be a positive number`);
      }
      
      if (['maxPositionSize', 'maxPortfolioRisk', 'maxDrawdown', 'maxConcentration', 'maxDailyLoss', 'maxVaR'].includes(field)) {
        if (value > 1) {
          throw new Error(`${field} must be between 0 and 1 (percentage)`);
        }
      }
      
      if (field === 'maxLeverage' && value > 10) {
        throw new Error('Maximum leverage cannot exceed 10x');
      }
    });
    
    const updatedLimits = riskService.updateRiskLimits(updates);
    
    res.json({
      success: true,
      limits: updatedLimits,
      message: 'Risk limits updated successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error updating risk limits:', error);
    res.status(500).json({
      error: 'Failed to update risk limits',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all positions
router.get('/positions', (req, res) => {
  try {
    const { symbol } = req.query;
    
    const positions = symbol 
      ? riskService.getPositionsBySymbol(symbol as string)
      : riskService.getPositions();
    
    res.json({
      success: true,
      positions,
      count: positions.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({
      error: 'Failed to fetch positions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add new position
router.post('/positions', (req, res) => {
  try {
    const {
      symbol,
      side,
      quantity,
      entryPrice,
      currentPrice,
      stopLoss,
      takeProfit,
      strategyId
    } = req.body;

    // Validation
    if (!symbol || !side || !quantity || !entryPrice) {
      return res.status(400).json({
        error: 'Symbol, side, quantity, and entry price are required'
      });
    }

    if (!['long', 'short'].includes(side)) {
      return res.status(400).json({
        error: 'Side must be either "long" or "short"'
      });
    }

    if (quantity <= 0 || entryPrice <= 0) {
      return res.status(400).json({
        error: 'Quantity and entry price must be positive numbers'
      });
    }

    // Calculate P&L
    const current = currentPrice || entryPrice;
    const unrealizedPnL = side === 'long' 
      ? (current - entryPrice) * quantity
      : (entryPrice - current) * quantity;

    const position = riskService.addPosition({
      symbol: symbol.toUpperCase(),
      side,
      quantity,
      entryPrice,
      currentPrice: current,
      stopLoss,
      takeProfit,
      unrealizedPnL,
      realizedPnL: 0,
      timestamp: Date.now(),
      strategyId
    });

    res.status(201).json({
      success: true,
      position,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error adding position:', error);
    res.status(500).json({
      error: 'Failed to add position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update position
router.put('/positions/:positionId', (req, res) => {
  try {
    const { positionId } = req.params;
    const updates = req.body;

    // Validate updates
    const allowedFields = [
      'currentPrice', 'stopLoss', 'takeProfit', 'unrealizedPnL', 'realizedPnL'
    ];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid fields: ${invalidFields.join(', ')}`
      });
    }

    const position = riskService.updatePosition(positionId, updates);
    
    if (!position) {
      return res.status(404).json({
        error: 'Position not found'
      });
    }

    res.json({
      success: true,
      position,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error updating position:', error);
    res.status(500).json({
      error: 'Failed to update position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Close position
router.post('/positions/:positionId/close', (req, res) => {
  try {
    const { positionId } = req.params;
    const { exitPrice } = req.body;

    if (!exitPrice || exitPrice <= 0) {
      return res.status(400).json({
        error: 'Valid exit price is required'
      });
    }

    const position = riskService.closePosition(positionId, exitPrice);
    
    if (!position) {
      return res.status(404).json({
        error: 'Position not found'
      });
    }

    res.json({
      success: true,
      closedPosition: position,
      message: 'Position closed successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error closing position:', error);
    res.status(500).json({
      error: 'Failed to close position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Risk analysis for potential trade
router.post('/analyze-trade', (req, res) => {
  try {
    const {
      symbol,
      side,
      quantity,
      entryPrice,
      stopLoss,
      takeProfit
    } = req.body;

    // Validation
    if (!symbol || !side || !quantity || !entryPrice) {
      return res.status(400).json({
        error: 'Symbol, side, quantity, and entry price are required'
      });
    }

    // Get current portfolio metrics
    const metrics = riskService.getPortfolioMetrics();
    
    // Calculate trade impact
    const tradeValue = quantity * entryPrice;
    const riskAmount = stopLoss ? Math.abs(entryPrice - stopLoss) * quantity : 0;
    const rewardAmount = takeProfit ? Math.abs(takeProfit - entryPrice) * quantity : 0;
    
    // Calculate new portfolio values
    const newLeverage = (metrics.leverage * metrics.totalValue + tradeValue) / metrics.totalValue;
    const newConcentration = (metrics.concentration[symbol.toUpperCase()] || 0) + (tradeValue / metrics.totalValue);
    const riskPercent = riskAmount / metrics.totalValue;
    
    // Risk score calculation
    let riskScore = 0;
    const riskFactors: string[] = [];
    
    if (newLeverage > riskService.getRiskLimits().maxLeverage) {
      riskScore += 0.3;
      riskFactors.push('Exceeds leverage limit');
    }
    
    if (newConcentration > riskService.getRiskLimits().maxConcentration) {
      riskScore += 0.3;
      riskFactors.push('Exceeds concentration limit');
    }
    
    if (riskPercent > riskService.getRiskLimits().maxPortfolioRisk) {
      riskScore += 0.4;
      riskFactors.push('Exceeds portfolio risk limit');
    }

    const analysis = {
      symbol: symbol.toUpperCase(),
      side,
      quantity,
      entryPrice,
      tradeValue,
      riskAmount,
      rewardAmount,
      riskRewardRatio: rewardAmount / Math.max(riskAmount, 1),
      riskPercent,
      newLeverage,
      newConcentration,
      riskScore: Math.min(1, riskScore),
      riskFactors,
      recommendation: riskScore > 0.7 ? 'HIGH_RISK' : riskScore > 0.4 ? 'MEDIUM_RISK' : 'LOW_RISK',
      approved: riskScore <= 0.7
    };

    res.json({
      success: true,
      analysis,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error analyzing trade:', error);
    res.status(500).json({
      error: 'Failed to analyze trade',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get risk dashboard summary
router.get('/dashboard', (req, res) => {
  try {
    const metrics = riskService.getPortfolioMetrics();
    const alerts = riskService.getRiskAlerts(true); // Unacknowledged only
    const positions = riskService.getPositions();
    const limits = riskService.getRiskLimits();
    const stressTests = riskService.runStressTests();

    // Calculate summary statistics
    const summary = {
      totalPositions: positions.length,
      activeAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      riskUtilization: {
        leverage: metrics.leverage / limits.maxLeverage,
        drawdown: metrics.drawdown / limits.maxDrawdown,
        var: metrics.var95 / limits.maxVaR,
        concentration: Math.max(...Object.values(metrics.concentration)) / limits.maxConcentration
      },
      worstCaseScenario: stressTests.reduce((worst, scenario) => 
        scenario.worstCaseDrawdown > worst.worstCaseDrawdown ? scenario : worst
      )
    };

    res.json({
      success: true,
      dashboard: {
        metrics,
        alerts: alerts.slice(0, 10), // Recent alerts only
        positions: positions.slice(0, 20), // Recent positions only
        limits,
        stressTests,
        summary
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating risk dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate risk dashboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const metrics = riskService.getPortfolioMetrics();
    const alerts = riskService.getRiskAlerts(true);
    
    const health = {
      status: 'healthy',
      totalValue: metrics.totalValue,
      positions: riskService.getPositions().length,
      activeAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      riskScore: Math.min(1, (
        metrics.drawdown / riskService.getRiskLimits().maxDrawdown * 0.4 +
        metrics.leverage / riskService.getRiskLimits().maxLeverage * 0.3 +
        metrics.var95 / riskService.getRiskLimits().maxVaR * 0.3
      )),
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking risk management health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

export { router as riskManagementRoutes };