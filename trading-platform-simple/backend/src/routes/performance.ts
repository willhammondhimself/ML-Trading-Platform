import { Router } from 'express';
import { PerformanceAnalysisService } from '../services/performanceAnalysis';
import { logger } from '../utils/logger';

const router = Router();
const performanceService = new PerformanceAnalysisService();

// Get comprehensive performance metrics
router.get('/metrics', (req, res) => {
  try {
    const { period = '1Y' } = req.query;
    
    if (!['1M', '3M', '6M', '1Y'].includes(period as string)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: 1M, 3M, 6M, 1Y' 
      });
    }
    
    const metrics = performanceService.calculatePerformanceMetrics(
      period as '1M' | '3M' | '6M' | '1Y'
    );
    
    res.json({
      period,
      metrics,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error calculating performance metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get attribution analysis
router.get('/attribution', (req, res) => {
  try {
    const { benchmark = 'SPY' } = req.query;
    
    const attribution = performanceService.calculateAttribution(benchmark as string);
    
    res.json({
      benchmark,
      attribution,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error calculating attribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get risk metrics
router.get('/risk', (req, res) => {
  try {
    const { benchmark = 'SPY' } = req.query;
    
    const riskMetrics = performanceService.calculateRiskMetrics(benchmark as string);
    
    res.json({
      benchmark,
      riskMetrics,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error calculating risk metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance time series
router.get('/timeseries', (req, res) => {
  try {
    const { period = '1Y' } = req.query;
    
    if (!['1M', '3M', '6M', '1Y'].includes(period as string)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: 1M, 3M, 6M, 1Y' 
      });
    }
    
    const timeSeries = performanceService.getPerformanceTimeSeries(
      period as '1M' | '3M' | '6M' | '1Y'
    );
    
    res.json({
      period,
      data: timeSeries,
      count: timeSeries.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching performance time series:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available benchmarks
router.get('/benchmarks', (req, res) => {
  try {
    const benchmarks = performanceService.getBenchmarks();
    
    res.json({
      benchmarks,
      count: benchmarks.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching benchmarks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current portfolio positions
router.get('/positions', (req, res) => {
  try {
    const positions = performanceService.getPortfolioPositions();
    
    // Calculate summary stats
    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalRealizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
    
    res.json({
      positions,
      summary: {
        totalValue,
        totalUnrealizedPnL,
        totalRealizedPnL,
        totalPnL: totalUnrealizedPnL + totalRealizedPnL,
        positionCount: positions.length
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching portfolio positions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rolling performance metrics
router.get('/rolling', (req, res) => {
  try {
    const { window = '22' } = req.query;
    const windowDays = parseInt(window as string);
    
    if (isNaN(windowDays) || windowDays < 5 || windowDays > 252) {
      return res.status(400).json({ 
        error: 'Window must be between 5 and 252 days' 
      });
    }
    
    const rollingMetrics = performanceService.calculateRollingMetrics(windowDays);
    
    res.json({
      window: windowDays,
      data: rollingMetrics,
      count: rollingMetrics.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error calculating rolling metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance dashboard summary
router.get('/dashboard', (req, res) => {
  try {
    const { period = '1Y', benchmark = 'SPY' } = req.query;
    
    if (!['1M', '3M', '6M', '1Y'].includes(period as string)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: 1M, 3M, 6M, 1Y' 
      });
    }
    
    // Get all performance data
    const metrics = performanceService.calculatePerformanceMetrics(
      period as '1M' | '3M' | '6M' | '1Y'
    );
    const attribution = performanceService.calculateAttribution(benchmark as string);
    const riskMetrics = performanceService.calculateRiskMetrics(benchmark as string);
    const positions = performanceService.getPortfolioPositions();
    const timeSeries = performanceService.getPerformanceTimeSeries(
      period as '1M' | '3M' | '6M' | '1Y'
    );
    
    // Calculate additional summary stats
    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const topPositions = positions
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(pos => ({
        symbol: pos.symbol,
        weight: pos.weight * 100,
        pnl: pos.unrealizedPnL,
        sector: pos.sector
      }));
    
    // Sector allocation
    const sectorAllocation: Record<string, number> = {};
    positions.forEach(pos => {
      sectorAllocation[pos.sector] = (sectorAllocation[pos.sector] || 0) + pos.weight * 100;
    });
    
    res.json({
      period,
      benchmark,
      performance: {
        metrics,
        attribution,
        riskMetrics
      },
      portfolio: {
        totalValue,
        positionCount: positions.length,
        topPositions,
        sectorAllocation
      },
      timeSeries: {
        data: timeSeries.slice(-50), // Last 50 data points for chart
        latest: timeSeries[timeSeries.length - 1]
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating performance dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance comparison
router.get('/compare', (req, res) => {
  try {
    const { benchmarks = 'SPY,QQQ', period = '1Y' } = req.query;
    
    if (!['1M', '3M', '6M', '1Y'].includes(period as string)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: 1M, 3M, 6M, 1Y' 
      });
    }
    
    const benchmarkList = (benchmarks as string).split(',').map(b => b.trim());
    const portfolioMetrics = performanceService.calculatePerformanceMetrics(
      period as '1M' | '3M' | '6M' | '1Y'
    );
    
    const comparisons = benchmarkList.map(benchmark => {
      try {
        const attribution = performanceService.calculateAttribution(benchmark);
        const riskMetrics = performanceService.calculateRiskMetrics(benchmark);
        const benchmarkData = performanceService.getBenchmarks().find(b => b.symbol === benchmark);
        
        return {
          benchmark,
          benchmarkName: benchmarkData?.name || benchmark,
          portfolioReturn: attribution.totalPortfolioReturn,
          benchmarkReturn: attribution.benchmarkReturn,
          alpha: attribution.totalAlpha,
          beta: riskMetrics.beta,
          trackingError: riskMetrics.trackingError,
          informationRatio: riskMetrics.informationRatio,
          correlation: riskMetrics.correlationWithBenchmark
        };
      } catch (error) {
        logger.warn(`Error comparing to benchmark ${benchmark}:`, error);
        return null;
      }
    }).filter(Boolean);
    
    res.json({
      period,
      portfolioMetrics,
      comparisons,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error generating performance comparison:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as performanceRoutes };