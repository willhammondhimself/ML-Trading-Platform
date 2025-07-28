import { Router } from 'express';
import { SatelliteAnalysisService } from '../services/satelliteAnalysis';
import { logger } from '../utils/logger';

const router = Router();
const satelliteService = new SatelliteAnalysisService();

// Start real-time updates
satelliteService.startRealTimeUpdates();

// Get satellite analysis report for a specific symbol
router.get('/analysis/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const report = satelliteService.generateAnalysisReport(symbol.toUpperCase());
    
    if (!report) {
      return res.status(404).json({
        error: 'No satellite analysis available for this symbol',
        availableSymbols: [...new Set(satelliteService.getMonitoredLocations().map(loc => loc.symbol))]
      });
    }
    
    res.json({
      success: true,
      report,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching satellite analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch satellite analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all satellite analysis reports
router.get('/analysis', (req, res) => {
  try {
    const reports = satelliteService.getAllAnalysisReports();
    
    // Calculate summary statistics
    const summary = {
      totalSymbols: reports.length,
      totalLocations: reports.reduce((sum, r) => sum + r.aggregateMetrics.totalLocations, 0),
      bullishSignals: reports.filter(r => r.tradingSignal.signal === 'buy').length,
      bearishSignals: reports.filter(r => r.tradingSignal.signal === 'sell').length,
      averageConfidence: reports.reduce((sum, r) => sum + r.aggregateMetrics.confidenceLevel, 0) / reports.length,
      strongSignals: reports.filter(r => r.tradingSignal.strength > 0.7).length
    };
    
    res.json({
      success: true,
      reports,
      summary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching all satellite analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch satellite analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get foot traffic data for a specific location
router.get('/foot-traffic/:locationId', (req, res) => {
  try {
    const { locationId } = req.params;
    const { days } = req.query;
    
    const daysToFetch = days ? parseInt(days as string) : 7;
    if (isNaN(daysToFetch) || daysToFetch < 1 || daysToFetch > 90) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 90'
      });
    }
    
    const footTrafficData = satelliteService.getFootTrafficData(locationId, daysToFetch);
    const locations = satelliteService.getMonitoredLocations();
    const location = locations.find(loc => loc.id === locationId);
    
    if (!location) {
      return res.status(404).json({
        error: 'Location not found',
        availableLocations: locations.map(loc => ({ id: loc.id, name: loc.name, symbol: loc.symbol }))
      });
    }
    
    res.json({
      success: true,
      location,
      footTrafficData,
      count: footTrafficData.length,
      dateRange: {
        from: new Date(Date.now() - daysToFetch * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching foot traffic data:', error);
    res.status(500).json({
      error: 'Failed to fetch foot traffic data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get location insights
router.get('/insights', (req, res) => {
  try {
    const { symbol } = req.query;
    const insights = satelliteService.getLocationInsights(symbol as string);
    
    // Group insights by symbol for easier consumption
    const insightsBySymbol = insights.reduce((acc, insight) => {
      if (!acc[insight.symbol]) {
        acc[insight.symbol] = [];
      }
      acc[insight.symbol].push(insight);
      return acc;
    }, {} as Record<string, typeof insights>);
    
    // Calculate aggregate metrics
    const aggregateMetrics = {
      totalLocations: insights.length,
      averageActivity: insights.reduce((sum, ins) => sum + ins.activityScore, 0) / insights.length,
      positiveLocations: insights.filter(ins => ins.revenueImpact === 'positive').length,
      negativeLocations: insights.filter(ins => ins.revenueImpact === 'negative').length,
      highActivityLocations: insights.filter(ins => ins.currentActivity === 'high' || ins.currentActivity === 'peak').length,
      increasingTrendLocations: insights.filter(ins => ins.trend === 'increasing').length
    };
    
    res.json({
      success: true,
      insights: symbol ? insights : insightsBySymbol,
      aggregateMetrics,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching location insights:', error);
    res.status(500).json({
      error: 'Failed to fetch location insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get monitored locations
router.get('/locations', (req, res) => {
  try {
    const { symbol } = req.query;
    const locations = satelliteService.getMonitoredLocations(symbol as string);
    
    // Group locations by symbol and type
    const locationsBySymbol = locations.reduce((acc, location) => {
      if (!acc[location.symbol]) {
        acc[location.symbol] = [];
      }
      acc[location.symbol].push(location);
      return acc;
    }, {} as Record<string, typeof locations>);
    
    const locationsByType = locations.reduce((acc, location) => {
      if (!acc[location.type]) {
        acc[location.type] = [];
      }
      acc[location.type].push(location);
      return acc;
    }, {} as Record<string, typeof locations>);
    
    const summary = {
      totalLocations: locations.length,
      symbolsTracked: Object.keys(locationsBySymbol).length,
      locationTypes: Object.keys(locationsByType),
      averageImportance: locations.reduce((sum, loc) => sum + loc.importance, 0) / locations.length,
      topLocations: locations
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map(loc => ({ id: loc.id, name: loc.name, symbol: loc.symbol, importance: loc.importance }))
    };
    
    res.json({
      success: true,
      locations: symbol ? locations : locationsBySymbol,
      locationsByType,
      summary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching monitored locations:', error);
    res.status(500).json({
      error: 'Failed to fetch monitored locations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get macro economic indicators
router.get('/macro-indicators', (req, res) => {
  try {
    const indicators = satelliteService.getMacroIndicators();
    
    // Categorize indicators
    const positiveIndicators = indicators.filter(ind => ind.impact === 'positive');
    const negativeIndicators = indicators.filter(ind => ind.impact === 'negative');
    const neutralIndicators = indicators.filter(ind => ind.impact === 'neutral');
    
    const summary = {
      totalIndicators: indicators.length,
      positiveCount: positiveIndicators.length,
      negativeCount: negativeIndicators.length,
      neutralCount: neutralIndicators.length,
      overallSentiment: positiveIndicators.length > negativeIndicators.length ? 'positive' : 
                      negativeIndicators.length > positiveIndicators.length ? 'negative' : 'neutral',
      averageChange: indicators.reduce((sum, ind) => sum + ind.changePercent, 0) / indicators.length,
      lastUpdated: Math.max(...indicators.map(ind => ind.timestamp))
    };
    
    res.json({
      success: true,
      indicators,
      summary,
      categorized: {
        positive: positiveIndicators,
        negative: negativeIndicators,
        neutral: neutralIndicators
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching macro indicators:', error);
    res.status(500).json({
      error: 'Failed to fetch macro indicators',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get trading signals from satellite analysis
router.get('/signals', (req, res) => {
  try {
    const reports = satelliteService.getAllAnalysisReports();
    
    const signals = reports.map(report => ({
      symbol: report.symbol,
      signal: report.tradingSignal.signal,
      strength: report.tradingSignal.strength,
      timeframe: report.tradingSignal.timeframe,
      reasoning: report.tradingSignal.reasoning,
      confidence: report.aggregateMetrics.confidenceLevel,
      overallTrend: report.aggregateMetrics.overallTrend,
      avgActivity: report.aggregateMetrics.averageActivity,
      locationCount: report.aggregateMetrics.totalLocations,
      keyInsight: report.keyInsights[0] || 'No specific insights available',
      lastUpdated: report.analysisDate
    }));
    
    // Sort by signal strength (descending)
    signals.sort((a, b) => b.strength - a.strength);
    
    const signalSummary = {
      totalSignals: signals.length,
      buySignals: signals.filter(s => s.signal === 'buy').length,
      sellSignals: signals.filter(s => s.signal === 'sell').length,
      holdSignals: signals.filter(s => s.signal === 'hold').length,
      strongSignals: signals.filter(s => s.strength > 0.7).length,
      averageStrength: signals.reduce((sum, s) => sum + s.strength, 0) / signals.length,
      topSignal: signals[0] || null,
      bullishSymbols: signals.filter(s => s.overallTrend === 'bullish').map(s => s.symbol),
      bearishSymbols: signals.filter(s => s.overallTrend === 'bearish').map(s => s.symbol)
    };
    
    res.json({
      success: true,
      signals,
      summary: signalSummary,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching satellite trading signals:', error);
    res.status(500).json({
      error: 'Failed to fetch satellite trading signals',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get dashboard data (comprehensive overview)
router.get('/dashboard', (req, res) => {
  try {
    const { symbol } = req.query;
    
    // Get analysis reports
    const allReports = satelliteService.getAllAnalysisReports();
    const reports = symbol ? allReports.filter(r => r.symbol === symbol.toString().toUpperCase()) : allReports;
    
    // Get location insights
    const insights = satelliteService.getLocationInsights(symbol as string);
    
    // Get macro indicators
    const macroIndicators = satelliteService.getMacroIndicators();
    
    // Get monitored locations
    const locations = satelliteService.getMonitoredLocations(symbol as string);
    
    // Calculate dashboard metrics
    const dashboardMetrics = {
      totalSymbols: [...new Set(locations.map(loc => loc.symbol))].length,
      totalLocations: locations.length,
      averageActivity: insights.reduce((sum, ins) => sum + ins.activityScore, 0) / insights.length,
      positiveSignals: reports.filter(r => r.tradingSignal.signal === 'buy').length,
      negativeSignals: reports.filter(r => r.tradingSignal.signal === 'sell').length,
      strongSignals: reports.filter(r => r.tradingSignal.strength > 0.7).length,
      bullishTrends: reports.filter(r => r.aggregateMetrics.overallTrend === 'bullish').length,
      bearishTrends: reports.filter(r => r.aggregateMetrics.overallTrend === 'bearish').length,
      highActivityLocations: insights.filter(ins => ins.currentActivity === 'high' || ins.currentActivity === 'peak').length,
      anomalousLocations: insights.filter(ins => ins.anomalyScore > 0.5).length,
      positiveMacroIndicators: macroIndicators.filter(ind => ind.impact === 'positive').length,
      negativeMacroIndicators: macroIndicators.filter(ind => ind.impact === 'negative').length
    };
    
    // Get top insights
    const topInsights = reports.flatMap(r => r.keyInsights).slice(0, 10);
    
    // Get latest foot traffic trends
    const latestTrends = insights.map(insight => ({
      symbol: insight.symbol,
      location: insight.name,
      activity: insight.activityScore,
      trend: insight.trend,
      weekOverWeekChange: insight.weekOverWeekChange,
      revenueImpact: insight.revenueImpact
    })).sort((a, b) => Math.abs(b.weekOverWeekChange) - Math.abs(a.weekOverWeekChange)).slice(0, 20);
    
    res.json({
      success: true,
      dashboard: {
        metrics: dashboardMetrics,
        reports: reports.slice(0, 10), // Top 10 reports
        insights: insights.slice(0, 20), // Top 20 insights
        macroIndicators,
        locations: locations.slice(0, 30), // Top 30 locations
        topInsights,
        latestTrends
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating satellite dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate satellite dashboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const reports = satelliteService.getAllAnalysisReports();
    const insights = satelliteService.getLocationInsights();
    const locations = satelliteService.getMonitoredLocations();
    const macroIndicators = satelliteService.getMacroIndicators();
    
    const health = {
      status: 'healthy',
      symbolsTracked: [...new Set(locations.map(loc => loc.symbol))].length,
      locationsMonitored: locations.length,
      reportsGenerated: reports.length,
      insightsAvailable: insights.length,
      macroIndicators: macroIndicators.length,
      averageConfidence: reports.reduce((sum, r) => sum + r.aggregateMetrics.confidenceLevel, 0) / reports.length,
      lastAnalysisUpdate: Math.max(...reports.map(r => r.analysisDate)),
      tradingSignalsAvailable: reports.filter(r => r.tradingSignal.strength > 0.3).length,
      dataFreshness: Date.now() - Math.max(...reports.map(r => r.analysisDate)) < 6 * 60 * 60 * 1000 ? 'fresh' : 'stale',
      timestamp: Date.now()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Error checking satellite analysis health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as satelliteAnalysisRoutes };