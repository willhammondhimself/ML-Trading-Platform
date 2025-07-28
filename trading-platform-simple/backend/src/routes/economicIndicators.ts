import { Router } from 'express';
import { EconomicIndicatorsService } from '../services/economicIndicators';
import { logger } from '../utils/logger';

const router = Router();
const economicService = new EconomicIndicatorsService();

// Start real-time updates
economicService.startRealTimeUpdates();

// Get all economic indicators
router.get('/indicators', (req, res) => {
  try {
    const { category, importance } = req.query;
    
    let indicators = economicService.getAllIndicators();
    
    // Filter by category if specified
    if (category && typeof category === 'string') {
      const validCategories = ['monetary', 'fiscal', 'employment', 'inflation', 'growth', 'consumer', 'housing', 'trade'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Invalid category',
          validCategories
        });
      }
      indicators = economicService.getIndicatorsByCategory(category);
    }
    
    // Filter by importance if specified
    if (importance && typeof importance === 'string') {
      const validImportance = ['low', 'medium', 'high', 'critical'];
      if (!validImportance.includes(importance)) {
        return res.status(400).json({
          error: 'Invalid importance level',
          validImportance
        });
      }
      indicators = indicators.filter(ind => ind.importance === importance);
    }
    
    // Calculate summary statistics
    const summary = {
      totalIndicators: indicators.length,
      byCategory: indicators.reduce((acc, ind) => {
        acc[ind.category] = (acc[ind.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byImportance: indicators.reduce((acc, ind) => {
        acc[ind.importance] = (acc[ind.importance] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      positiveImpact: indicators.filter(ind => ind.marketImpact === 'positive').length,
      negativeImpact: indicators.filter(ind => ind.marketImpact === 'negative').length,
      neutralImpact: indicators.filter(ind => ind.marketImpact === 'neutral').length,
      averageChange: indicators.reduce((sum, ind) => sum + Math.abs(ind.changePercent), 0) / indicators.length,
      recentUpdates: indicators.filter(ind => Date.now() - ind.timestamp < 24 * 60 * 60 * 1000).length
    };
    
    res.json({
      success: true,
      indicators,
      summary,
      filters: {
        category: category || 'all',
        importance: importance || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching economic indicators:', error);
    res.status(500).json({
      error: 'Failed to fetch economic indicators',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific indicator
router.get('/indicators/:id', (req, res) => {
  try {
    const { id } = req.params;
    const indicator = economicService.getIndicator(id);
    
    if (!indicator) {
      return res.status(404).json({
        error: 'Indicator not found',
        availableIndicators: economicService.getAllIndicators().map(ind => ({
          id: ind.id,
          name: ind.name,
          category: ind.category
        }))
      });
    }
    
    res.json({
      success: true,
      indicator,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching indicator:', error);
    res.status(500).json({
      error: 'Failed to fetch indicator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get macro trends
router.get('/trends', (req, res) => {
  try {
    const trends = economicService.getMacroTrends();
    
    // Categorize trends by direction
    const bullishTrends = trends.filter(t => t.direction === 'bullish');
    const bearishTrends = trends.filter(t => t.direction === 'bearish');
    const neutralTrends = trends.filter(t => t.direction === 'neutral');
    
    // Calculate trend statistics
    const trendStats = {
      totalTrends: trends.length,
      bullishCount: bullishTrends.length,
      bearishCount: bearishTrends.length,
      neutralCount: neutralTrends.length,
      averageStrength: trends.reduce((sum, t) => sum + t.strength, 0) / trends.length,
      averageConfidence: trends.reduce((sum, t) => sum + t.confidence, 0) / trends.length,
      strongestTrend: trends.reduce((strongest, current) => 
        current.strength > strongest.strength ? current : strongest, trends[0]
      ),
      mostConfidentTrend: trends.reduce((mostConfident, current) => 
        current.confidence > mostConfident.confidence ? current : mostConfident, trends[0]
      )
    };
    
    res.json({
      success: true,
      trends,
      categorized: {
        bullish: bullishTrends,
        bearish: bearishTrends,
        neutral: neutralTrends
      },
      statistics: trendStats,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching macro trends:', error);
    res.status(500).json({
      error: 'Failed to fetch macro trends',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get economic alerts
router.get('/alerts', (req, res) => {
  try {
    const { acknowledged } = req.query;
    
    let alerts = economicService.getAlerts();
    
    // Filter by acknowledged status if specified
    if (acknowledged !== undefined) {
      const isAcknowledged = acknowledged === 'true';
      alerts = economicService.getAlerts(isAcknowledged);
    }
    
    // Sort by severity and timestamp
    const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    alerts.sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.timestamp - a.timestamp;
    });
    
    // Calculate alert statistics
    const alertStats = {
      totalAlerts: alerts.length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length,
      bySeverity: alerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byType: alerts.reduce((acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      actionRequired: alerts.filter(a => a.actionRequired).length,
      recentAlerts: alerts.filter(a => Date.now() - a.timestamp < 24 * 60 * 60 * 1000).length
    };
    
    res.json({
      success: true,
      alerts,
      statistics: alertStats,
      filters: {
        acknowledged: acknowledged || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching economic alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch economic alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Acknowledge alert
router.post('/alerts/:id/acknowledge', (req, res) => {
  try {
    const { id } = req.params;
    const success = economicService.acknowledgeAlert(id);
    
    if (!success) {
      return res.status(404).json({
        error: 'Alert not found',
        alertId: id
      });
    }
    
    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      alertId: id,
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

// Get economic calendar
router.get('/calendar', (req, res) => {
  try {
    const { days } = req.query;
    
    const daysToFetch = days ? parseInt(days as string) : 7;
    if (isNaN(daysToFetch) || daysToFetch < 1 || daysToFetch > 30) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 30'
      });
    }
    
    const calendar = economicService.getEconomicCalendar(daysToFetch);
    
    // Calculate calendar statistics
    const totalEvents = calendar.reduce((sum, day) => sum + day.events.length, 0);
    const eventsByImportance = calendar.reduce((acc, day) => {
      day.events.forEach(event => {
        acc[event.importance] = (acc[event.importance] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    
    const upcomingCriticalEvents = calendar
      .flatMap(day => day.events.filter(event => event.importance === 'critical'))
      .slice(0, 5);
    
    const calendarStats = {
      totalDays: calendar.length,
      totalEvents,
      eventsByImportance,
      averageEventsPerDay: totalEvents / calendar.length,
      upcomingCriticalEvents: upcomingCriticalEvents.length,
      countries: [...new Set(calendar.flatMap(day => day.events.map(event => event.country)))],
      currencies: [...new Set(calendar.flatMap(day => day.events.map(event => event.currency)))]
    };
    
    res.json({
      success: true,
      calendar,
      statistics: calendarStats,
      upcomingCritical: upcomingCriticalEvents,
      dateRange: {
        from: calendar[0]?.date,
        to: calendar[calendar.length - 1]?.date
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching economic calendar:', error);
    res.status(500).json({
      error: 'Failed to fetch economic calendar',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get economic summary
router.get('/summary', (req, res) => {
  try {
    const summary = economicService.generateEconomicSummary();
    
    // Get supporting data
    const indicators = economicService.getAllIndicators();
    const trends = economicService.getMacroTrends();
    const alerts = economicService.getAlerts(false); // Unacknowledged alerts
    
    // Key metrics for dashboard
    const keyMetrics = {
      gdpGrowth: summary.gdpGrowth,
      inflationRate: indicators.find(ind => ind.id === 'cpi_yoy')?.value || 3.2,
      unemploymentRate: indicators.find(ind => ind.id === 'unemployment_rate')?.value || 3.7,
      fedFundsRate: indicators.find(ind => ind.id === 'fed_funds_rate')?.value || 5.25,
      consumerConfidence: indicators.find(ind => ind.id === 'consumer_confidence')?.value || 102.5,
      retailSales: indicators.find(ind => ind.id === 'retail_sales')?.value || 0.7
    };
    
    // Recent changes
    const recentChanges = indicators
      .filter(ind => Math.abs(ind.changePercent) > 1)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 5)
      .map(ind => ({
        indicator: ind.name,
        change: ind.changePercent,
        impact: ind.marketImpact,
        importance: ind.importance
      }));
    
    res.json({
      success: true,
      summary,
      keyMetrics,
      supportingData: {
        totalIndicators: indicators.length,
        activeTrends: trends.length,
        activeAlerts: alerts.length,
        recentChanges
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating economic summary:', error);
    res.status(500).json({
      error: 'Failed to generate economic summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get dashboard data (comprehensive overview)
router.get('/dashboard', (req, res) => {
  try {
    // Get all core data
    const indicators = economicService.getAllIndicators();
    const trends = economicService.getMacroTrends();
    const alerts = economicService.getAlerts();
    const calendar = economicService.getEconomicCalendar(7);
    const summary = economicService.generateEconomicSummary();
    
    // Key indicators for quick view
    const keyIndicators = [
      'fed_funds_rate',
      'unemployment_rate', 
      'cpi_yoy',
      'gdp_growth',
      'consumer_confidence'
    ].map(id => indicators.find(ind => ind.id === id)).filter(Boolean);
    
    // Market movers (indicators with significant changes)
    const marketMovers = indicators
      .filter(ind => Math.abs(ind.changePercent) > 2 || ind.impactMagnitude > 0.5)
      .sort((a, b) => b.impactMagnitude - a.impactMagnitude)
      .slice(0, 10);
    
    // Upcoming events (next 3 days)
    const upcomingEvents = calendar
      .slice(0, 3)
      .flatMap(day => day.events.map(event => ({ ...event, date: day.date })))
      .filter(event => event.importance === 'high' || event.importance === 'critical')
      .slice(0, 8);
    
    // Trend summary
    const trendSummary = {
      bullish: trends.filter(t => t.direction === 'bullish').length,
      bearish: trends.filter(t => t.direction === 'bearish').length,
      neutral: trends.filter(t => t.direction === 'neutral').length,
      strongTrends: trends.filter(t => t.strength > 0.7).length
    };
    
    // Alert summary
    const alertSummary = {
      total: alerts.length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      actionRequired: alerts.filter(a => a.actionRequired).length
    };
    
    // Create dashboard metrics
    const dashboardMetrics = {
      economicHealth: summary.overallHealth,
      marketSentiment: summary.marketSentiment,
      fedPolicy: summary.fedPolicy,
      inflationTrend: summary.inflationTrend,
      employmentHealth: summary.employmentHealth,
      consumerConfidence: summary.consumerConfidence,
      indicatorsTracked: indicators.length,
      trendsIdentified: trends.length,
      activeAlerts: alertSummary.unacknowledged,
      upcomingEvents: upcomingEvents.length,
      dataFreshness: indicators.filter(ind => Date.now() - ind.timestamp < 6 * 60 * 60 * 1000).length > indicators.length * 0.8 ? 'fresh' : 'stale'
    };
    
    res.json({
      success: true,
      dashboard: {
        metrics: dashboardMetrics,
        summary,
        keyIndicators,
        marketMovers,
        trends: trends.slice(0, 10),
        alerts: alerts.filter(a => !a.acknowledged).slice(0, 10),
        upcomingEvents,
        trendSummary,
        alertSummary
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating economic dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate economic dashboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const indicators = economicService.getAllIndicators();
    const trends = economicService.getMacroTrends();
    const alerts = economicService.getAlerts();
    
    const health = {
      status: 'healthy',
      indicatorsTracked: indicators.length,
      trendsAnalyzed: trends.length,
      activeAlerts: alerts.filter(a => !a.acknowledged).length,
      totalAlerts: alerts.length,
      lastUpdate: Math.max(...indicators.map(ind => ind.timestamp)),
      dataCategories: [...new Set(indicators.map(ind => ind.category))],
      importanceLevels: [...new Set(indicators.map(ind => ind.importance))],
      averageImpactMagnitude: indicators.reduce((sum, ind) => sum + ind.impactMagnitude, 0) / indicators.length,
      recentUpdates: indicators.filter(ind => Date.now() - ind.timestamp < 24 * 60 * 60 * 1000).length,
      dataFreshness: indicators.filter(ind => Date.now() - ind.timestamp < 6 * 60 * 60 * 1000).length > indicators.length * 0.8 ? 'fresh' : 'stale',
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking economic indicators health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as economicIndicatorsRoutes };