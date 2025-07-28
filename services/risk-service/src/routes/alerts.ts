/**
 * Alert Management Routes
 * Handles risk alerts, notifications, and alert configuration endpoints
 */

import { Router as ExpressRouter, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

/**
 * Get all alerts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      severity, 
      status, 
      type, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50 
    } = req.query;

    const alerts = {
      alerts: [
        {
          id: 'ALERT-001',
          type: 'POSITION_LIMIT_EXCEEDED',
          severity: 'HIGH',
          status: 'ACTIVE',
          title: 'Position Limit Exceeded - AAPL',
          description: 'Position size for AAPL has exceeded the maximum allowed limit',
          details: {
            symbol: 'AAPL',
            currentPosition: 1500000,
            limit: 1000000,
            excess: 500000,
            portfolioId: 'PORTFOLIO-001'
          },
          triggeredAt: new Date().toISOString(),
          acknowledgedAt: null,
          resolvedAt: null,
          assignedTo: 'risk-team@company.com',
          escalationLevel: 1
        },
        {
          id: 'ALERT-002',
          type: 'VAR_THRESHOLD_BREACHED',
          severity: 'MEDIUM',
          status: 'ACKNOWLEDGED',
          title: 'VaR Threshold Breached',
          description: 'Portfolio VaR has exceeded the warning threshold',
          details: {
            portfolioId: 'PORTFOLIO-002',
            currentVaR: 125000,
            threshold: 120000,
            breach: 5000
          },
          triggeredAt: new Date(Date.now() - 3600000).toISOString(),
          acknowledgedAt: new Date(Date.now() - 1800000).toISOString(),
          acknowledgedBy: 'trader1@company.com',
          resolvedAt: null,
          assignedTo: 'risk-team@company.com',
          escalationLevel: 0
        }
      ],
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: 2,
        totalPages: 1
      },
      filters: {
        severity,
        status,
        type,
        startDate,
        endDate
      },
      summary: {
        total: 2,
        active: 1,
        acknowledged: 1,
        resolved: 0,
        bySeverity: {
          HIGH: 1,
          MEDIUM: 1,
          LOW: 0
        }
      },
      timestamp: new Date().toISOString()
    };

    res.json(alerts);
  } catch (error) {
    logger.error('Error retrieving alerts:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve alerts'
    });
  }
});

/**
 * Get specific alert by ID
 */
router.get('/:alertId', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;

    const alert = {
      id: alertId,
      type: 'POSITION_LIMIT_EXCEEDED',
      severity: 'HIGH',
      status: 'ACTIVE',
      title: 'Position Limit Exceeded - AAPL',
      description: 'Position size for AAPL has exceeded the maximum allowed limit',
      details: {
        symbol: 'AAPL',
        currentPosition: 1500000,
        limit: 1000000,
        excess: 500000,
        portfolioId: 'PORTFOLIO-001'
      },
      triggeredAt: new Date().toISOString(),
      rule: {
        id: 'RULE-001',
        name: 'Position Size Limit',
        threshold: 1000000,
        action: 'ALERT'
      },
      history: [
        {
          timestamp: new Date().toISOString(),
          action: 'TRIGGERED',
          user: 'system',
          details: 'Alert triggered due to position limit breach'
        }
      ],
      relatedAlerts: [],
      escalationLevel: 1,
      assignedTo: 'risk-team@company.com'
    };

    res.json(alert);
  } catch (error) {
    logger.error('Error retrieving alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve alert'
    });
  }
});

/**
 * Acknowledge an alert
 */
router.patch('/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { comment } = req.body;
    const userId = req.headers.authorization || 'unknown';

    const acknowledgment = {
      alertId,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId,
      comment,
      status: 'ACKNOWLEDGED'
    };

    logger.info(`Alert acknowledged: ${alertId}`, acknowledgment);
    res.json(acknowledgment);
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge alert'
    });
  }
});

/**
 * Resolve an alert
 */
router.patch('/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { resolution, comment } = req.body;
    const userId = req.headers.authorization || 'unknown';

    const resolutionData = {
      alertId,
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
      resolution,
      comment,
      status: 'RESOLVED'
    };

    logger.info(`Alert resolved: ${alertId}`, resolutionData);
    res.json(resolutionData);
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resolve alert'
    });
  }
});

/**
 * Create a manual alert
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const alertData = {
      id: `ALERT-${Date.now()}`,
      ...req.body,
      triggeredAt: new Date().toISOString(),
      status: 'ACTIVE',
      createdBy: req.headers.authorization || 'unknown',
      escalationLevel: 0
    };

    logger.info('Manual alert created:', alertData);
    res.status(201).json(alertData);
  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create alert'
    });
  }
});

/**
 * Get alert configuration
 */
router.get('/config/rules', async (req: Request, res: Response) => {
  try {
    const alertRules = {
      rules: [
        {
          id: 'RULE-001',
          name: 'Position Size Limit',
          type: 'POSITION_LIMIT',
          enabled: true,
          severity: 'HIGH',
          threshold: 1000000,
          action: 'ALERT',
          escalation: {
            enabled: true,
            levels: [
              { level: 1, delayMinutes: 15, recipients: ['risk-team@company.com'] },
              { level: 2, delayMinutes: 30, recipients: ['risk-manager@company.com'] }
            ]
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'RULE-002',
          name: 'VaR Warning Threshold',
          type: 'VAR_THRESHOLD',
          enabled: true,
          severity: 'MEDIUM',
          threshold: 120000,
          action: 'ALERT',
          escalation: {
            enabled: false
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: new Date().toISOString()
        }
      ],
      total: 2,
      timestamp: new Date().toISOString()
    };

    res.json(alertRules);
  } catch (error) {
    logger.error('Error retrieving alert rules:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve alert rules'
    });
  }
});

/**
 * Update alert rule
 */
router.put('/config/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const updateData = req.body;

    const updatedRule = {
      id: ruleId,
      ...updateData,
      updatedAt: new Date().toISOString(),
      updatedBy: req.headers.authorization || 'unknown'
    };

    logger.info(`Alert rule updated: ${ruleId}`, updatedRule);
    res.json(updatedRule);
  } catch (error) {
    logger.error('Error updating alert rule:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update alert rule'
    });
  }
});

/**
 * Get alert statistics
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const { period = '7d' } = req.query;

    const statistics = {
      period,
      totalAlerts: 45,
      activeAlerts: 5,
      resolvedAlerts: 40,
      averageResolutionTime: '2.5 hours',
      bySeverity: {
        HIGH: 8,
        MEDIUM: 20,
        LOW: 17
      },
      byType: {
        'POSITION_LIMIT_EXCEEDED': 15,
        'VAR_THRESHOLD_BREACHED': 12,
        'CONCENTRATION_RISK': 8,
        'LIQUIDITY_RISK': 6,
        'OTHER': 4
      },
      byStatus: {
        ACTIVE: 5,
        ACKNOWLEDGED: 3,
        RESOLVED: 37
      },
      escalationStats: {
        totalEscalations: 12,
        level1: 8,
        level2: 4,
        level3: 0
      },
      timestamp: new Date().toISOString()
    };

    res.json(statistics);
  } catch (error) {
    logger.error('Error retrieving alert statistics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve alert statistics'
    });
  }
});

export const alertRouter: ExpressRouter = router;