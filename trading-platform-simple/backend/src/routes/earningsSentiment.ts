import { Router } from 'express';
import { EarningsSentimentService } from '../services/earningsSentiment';
import { logger } from '../utils/logger';

const router = Router();
const earningsService = new EarningsSentimentService();

// Start real-time updates
earningsService.startRealTimeUpdates();

// Get all earnings calls
router.get('/calls', (req, res) => {
  try {
    const { status, symbol } = req.query;
    
    let calls = earningsService.getAllEarningsCalls();
    
    // Filter by status if specified
    if (status && typeof status === 'string') {
      const validStatuses = ['scheduled', 'live', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          validStatuses
        });
      }
      calls = earningsService.getEarningsCallsByStatus(status as any);
    }
    
    // Filter by symbol if specified
    if (symbol && typeof symbol === 'string') {
      calls = calls.filter(call => call.symbol === symbol.toUpperCase());
    }
    
    // Calculate summary statistics
    const summary = {
      totalCalls: calls.length,
      byStatus: calls.reduce((acc, call) => {
        acc[call.status] = (acc[call.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      bySymbol: calls.reduce((acc, call) => {
        acc[call.symbol] = (acc[call.symbol] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      upcomingCalls: calls.filter(call => call.status === 'scheduled').length,
      completedCalls: calls.filter(call => call.status === 'completed').length,
      averageDuration: calls.reduce((sum, call) => sum + call.callDuration, 0) / calls.length,
      averageAnalysts: calls.reduce((sum, call) => sum + call.analystCount, 0) / calls.length
    };
    
    res.json({
      success: true,
      calls,
      summary,
      filters: {
        status: status || 'all',
        symbol: symbol || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching earnings calls:', error);
    res.status(500).json({
      error: 'Failed to fetch earnings calls',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific earnings call
router.get('/calls/:callId', (req, res) => {
  try {
    const { callId } = req.params;
    const call = earningsService.getEarningsCall(callId);
    
    if (!call) {
      return res.status(404).json({
        error: 'Earnings call not found',
        availableCalls: earningsService.getAllEarningsCalls().map(c => ({
          id: c.id,
          symbol: c.symbol,
          quarter: c.quarter,
          status: c.status
        }))
      });
    }
    
    // Get associated sentiment analysis if available
    const sentimentAnalysis = earningsService.getSentimentAnalysis(callId);
    
    res.json({
      success: true,
      call,
      sentimentAnalysis,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching earnings call:', error);
    res.status(500).json({
      error: 'Failed to fetch earnings call',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get sentiment analysis for a specific call
router.get('/sentiment/:callId', (req, res) => {
  try {
    const { callId } = req.params;
    const analysis = earningsService.getSentimentAnalysis(callId);
    
    if (!analysis) {
      return res.status(404).json({
        error: 'Sentiment analysis not found for this call',
        availableAnalyses: earningsService.getAllSentimentAnalyses().map(a => ({
          callId: a.callId,
          symbol: a.symbol,
          overallSentiment: a.overallSentiment
        }))
      });
    }
    
    res.json({
      success: true,
      analysis,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching sentiment analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all sentiment analyses
router.get('/sentiment', (req, res) => {
  try {
    const { symbol } = req.query;
    
    let analyses = earningsService.getAllSentimentAnalyses();
    
    // Filter by symbol if specified
    if (symbol && typeof symbol === 'string') {
      analyses = earningsService.getSentimentAnalysesBySymbol(symbol.toUpperCase());
    }
    
    // Calculate sentiment statistics
    const sentimentStats = {
      totalAnalyses: analyses.length,
      bySentiment: analyses.reduce((acc, analysis) => {
        acc[analysis.overallSentiment] = (acc[analysis.overallSentiment] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      bySymbol: analyses.reduce((acc, analysis) => {
        acc[analysis.symbol] = (acc[analysis.symbol] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      averageSentimentScore: analyses.reduce((sum, a) => sum + a.sentimentScore, 0) / analyses.length,
      averageConfidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length,
      positiveAnalyses: analyses.filter(a => a.sentimentScore > 0.2).length,
      negativeAnalyses: analyses.filter(a => a.sentimentScore < -0.2).length,
      neutralAnalyses: analyses.filter(a => Math.abs(a.sentimentScore) <= 0.2).length,
      highConfidenceAnalyses: analyses.filter(a => a.confidence > 0.8).length
    };
    
    // Get top themes across all analyses
    const allThemes = analyses.flatMap(a => a.keyThemes);
    const themeFrequency = allThemes.reduce((acc, theme) => {
      acc[theme.theme] = (acc[theme.theme] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topThemes = Object.entries(themeFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([theme, count]) => ({ theme, count }));
    
    res.json({
      success: true,
      analyses,
      statistics: sentimentStats,
      topThemes,
      filters: {
        symbol: symbol || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching sentiment analyses:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment analyses',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get earnings calendar
router.get('/calendar', (req, res) => {
  try {
    const { days } = req.query;
    
    const daysToFetch = days ? parseInt(days as string) : 7;
    if (isNaN(daysToFetch) || daysToFetch < 1 || daysToFetch > 30) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 30'
      });
    }
    
    const calendar = earningsService.getEarningsCalendar(daysToFetch);
    
    // Calculate calendar statistics
    const totalCalls = calendar.reduce((sum, day) => sum + day.calls.length, 0);
    const callsByImportance = calendar.reduce((acc, day) => {
      day.calls.forEach(call => {
        acc[call.importance] = (acc[call.importance] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    
    const upcomingHighImportance = calendar
      .flatMap(day => day.calls.filter(call => call.importance === 'high' || call.importance === 'market_moving'))
      .slice(0, 10);
    
    const calendarStats = {
      totalDays: calendar.length,
      totalCalls,
      callsByImportance,
      averageCallsPerDay: totalCalls / calendar.length,
      upcomingHighImportance: upcomingHighImportance.length,
      symbols: [...new Set(calendar.flatMap(day => day.calls.map(call => call.symbol)))],
      marketMovingCalls: calendar.flatMap(day => 
        day.calls.filter(call => call.importance === 'market_moving')
      ).length
    };
    
    res.json({
      success: true,
      calendar,
      statistics: calendarStats,
      upcomingHighImportance,
      dateRange: {
        from: calendar[0]?.date,
        to: calendar[calendar.length - 1]?.date
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching earnings calendar:', error);
    res.status(500).json({
      error: 'Failed to fetch earnings calendar',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get executive profiles
router.get('/executives', (req, res) => {
  try {
    const { symbol } = req.query;
    
    let profiles = earningsService.getExecutiveProfiles();
    
    // Filter by symbol if specified
    if (symbol && typeof symbol === 'string') {
      profiles = earningsService.getExecutiveProfiles(symbol.toUpperCase());
    }
    
    // Sort by credibility score
    profiles.sort((a, b) => b.credibilityScore - a.credibilityScore);
    
    // Calculate executive statistics
    const execStats = {
      totalExecutives: profiles.length,
      byRole: profiles.reduce((acc, profile) => {
        acc[profile.role] = (acc[profile.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      bySymbol: profiles.reduce((acc, profile) => {
        acc[profile.symbol] = (acc[profile.symbol] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      averageCredibility: profiles.reduce((sum, p) => sum + p.credibilityScore, 0) / profiles.length,
      averageConfidence: profiles.reduce((sum, p) => sum + p.historicalTone.averageConfidence, 0) / profiles.length,
      averageOptimism: profiles.reduce((sum, p) => sum + p.historicalTone.averageOptimism, 0) / profiles.length,
      highCredibility: profiles.filter(p => p.credibilityScore > 0.8).length,
      mostOptimistic: profiles.reduce((most, current) => 
        current.historicalTone.averageOptimism > most.historicalTone.averageOptimism ? current : most
      ),
      mostConfident: profiles.reduce((most, current) => 
        current.historicalTone.averageConfidence > most.historicalTone.averageConfidence ? current : most
      )
    };
    
    res.json({
      success: true,
      profiles,
      statistics: execStats,
      filters: {
        symbol: symbol || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching executive profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch executive profiles',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get earnings alerts
router.get('/alerts', (req, res) => {
  try {
    const { acknowledged } = req.query;
    
    let alerts = earningsService.getEarningsAlerts();
    
    // Filter by acknowledged status if specified
    if (acknowledged !== undefined) {
      const isAcknowledged = acknowledged === 'true';
      alerts = earningsService.getEarningsAlerts(isAcknowledged);
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
      bySymbol: alerts.reduce((acc, alert) => {
        acc[alert.symbol] = (acc[alert.symbol] || 0) + 1;
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
    logger.error('Error fetching earnings alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch earnings alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Acknowledge alert
router.post('/alerts/:id/acknowledge', (req, res) => {
  try {
    const { id } = req.params;
    const success = earningsService.acknowledgeAlert(id);
    
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

// Get dashboard data (comprehensive overview)
router.get('/dashboard', (req, res) => {
  try {
    const { symbol } = req.query;
    
    // Get all core data
    const allCalls = earningsService.getAllEarningsCalls();
    const calls = symbol ? allCalls.filter(c => c.symbol === symbol.toString().toUpperCase()) : allCalls;
    
    const allAnalyses = earningsService.getAllSentimentAnalyses();
    const analyses = symbol ? allAnalyses.filter(a => a.symbol === symbol.toString().toUpperCase()) : allAnalyses;
    
    const alerts = earningsService.getEarningsAlerts(false); // Unacknowledged only
    const calendar = earningsService.getEarningsCalendar(7);
    const executives = earningsService.getExecutiveProfiles(symbol as string);
    
    // Upcoming calls (next 7 days)
    const upcomingCalls = calls
      .filter(call => call.status === 'scheduled' && call.callDate < Date.now() + 7 * 24 * 60 * 60 * 1000)
      .sort((a, b) => a.callDate - b.callDate)
      .slice(0, 10);
    
    // Recent sentiment trends
    const recentAnalyses = analyses
      .filter(a => Date.now() - a.analysisTimestamp < 30 * 24 * 60 * 60 * 1000) // Last 30 days
      .sort((a, b) => b.analysisTimestamp - a.analysisTimestamp)
      .slice(0, 20);
    
    // Sentiment distribution
    const sentimentDistribution = {
      veryPositive: analyses.filter(a => a.overallSentiment === 'very_positive').length,
      positive: analyses.filter(a => a.overallSentiment === 'positive').length,
      neutral: analyses.filter(a => a.overallSentiment === 'neutral').length,
      negative: analyses.filter(a => a.overallSentiment === 'negative').length,
      veryNegative: analyses.filter(a => a.overallSentiment === 'very_negative').length
    };
    
    // Key themes across recent calls
    const allThemes = recentAnalyses.flatMap(a => a.keyThemes);
    const topThemes = allThemes
      .reduce((acc, theme) => {
        acc[theme.theme] = (acc[theme.theme] || 0) + theme.mentions;
        return acc;
      }, {} as Record<string, number>);
    
    const keyThemes = Object.entries(topThemes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([theme, mentions]) => ({ theme, mentions }));
    
    // Market movers (calls with significant market reaction)
    const marketMovers = recentAnalyses
      .filter(a => a.marketReaction.nextDayMove && Math.abs(a.marketReaction.nextDayMove) > 3)
      .sort((a, b) => Math.abs(b.marketReaction.nextDayMove || 0) - Math.abs(a.marketReaction.nextDayMove || 0))
      .slice(0, 10);
    
    // Create dashboard metrics
    const dashboardMetrics = {
      totalCalls: calls.length,
      completedCalls: calls.filter(c => c.status === 'completed').length,
      upcomingCalls: upcomingCalls.length,
      totalAnalyses: analyses.length,
      averageSentiment: analyses.reduce((sum, a) => sum + a.sentimentScore, 0) / analyses.length,
      positiveAnalyses: analyses.filter(a => a.sentimentScore > 0.2).length,
      negativeAnalyses: analyses.filter(a => a.sentimentScore < -0.2).length,
      activeAlerts: alerts.filter(a => a.symbol === symbol || !symbol).length,
      executivesTracked: executives.length,
      averageConfidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length,
      guidanceRaised: analyses.filter(a => a.guidance.tone === 'raised').length,
      guidanceLowered: analyses.filter(a => a.guidance.tone === 'lowered').length,
      highImpactCalls: calls.filter(c => c.analystCount > 25).length
    };
    
    res.json({
      success: true,
      dashboard: {
        metrics: dashboardMetrics,
        upcomingCalls,
        recentAnalyses: recentAnalyses.slice(0, 15),
        alerts: alerts.slice(0, 10),
        sentimentDistribution,
        keyThemes,
        marketMovers,
        executives: executives.slice(0, 8),
        calendar: calendar.slice(0, 5)
      },
      filters: {
        symbol: symbol || 'all'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating earnings dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate earnings dashboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const calls = earningsService.getAllEarningsCalls();
    const analyses = earningsService.getAllSentimentAnalyses();
    const alerts = earningsService.getEarningsAlerts();
    const executives = earningsService.getExecutiveProfiles();
    
    const health = {
      status: 'healthy',
      callsTracked: calls.length,
      analysesProcessed: analyses.length,
      alertsActive: alerts.filter(a => !a.acknowledged).length,
      totalAlerts: alerts.length,
      executiveProfiles: executives.length,
      completedCalls: calls.filter(c => c.status === 'completed').length,
      upcomingCalls: calls.filter(c => c.status === 'scheduled').length,
      averageSentiment: analyses.reduce((sum, a) => sum + a.sentimentScore, 0) / analyses.length,
      averageConfidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length,
      lastAnalysis: Math.max(...analyses.map(a => a.analysisTimestamp)),
      symbolsCovered: [...new Set(calls.map(c => c.symbol))].length,
      dataFreshness: analyses.filter(a => Date.now() - a.analysisTimestamp < 24 * 60 * 60 * 1000).length > 0 ? 'fresh' : 'stale',
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking earnings sentiment health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as earningsSentimentRoutes };