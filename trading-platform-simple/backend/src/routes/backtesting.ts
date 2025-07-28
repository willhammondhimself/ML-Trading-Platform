import { Router } from 'express';
import { BacktestingEngine } from '../services/backtesting';
import { logger } from '../utils/logger';

const router = Router();
const backtestingEngine = new BacktestingEngine();

// Get available trading strategies
router.get('/strategies', (req, res) => {
  try {
    const strategies = backtestingEngine.getStrategies();
    
    res.json({
      strategies: strategies.map(strategy => ({
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        parameters: strategy.parameters
      })),
      count: strategies.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching strategies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get historical data for symbols
router.get('/data/:symbols', (req, res) => {
  try {
    const symbols = req.params.symbols.split(',').map(s => s.trim().toUpperCase());
    const { startDate, endDate } = req.query;
    
    const historicalData = backtestingEngine.getHistoricalData(symbols);
    const result: any = {};
    
    historicalData.forEach((data, symbol) => {
      let filteredData = data;
      
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate as string).getTime() : 0;
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();
        
        filteredData = data.filter(d => 
          d.timestamp >= start && d.timestamp <= end
        );
      }
      
      result[symbol] = {
        data: filteredData,
        count: filteredData.length,
        startDate: filteredData.length > 0 ? new Date(filteredData[0].timestamp).toISOString() : null,
        endDate: filteredData.length > 0 ? new Date(filteredData[filteredData.length - 1].timestamp).toISOString() : null
      };
    });
    
    res.json({
      symbols: result,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Run backtest
router.post('/run', async (req, res) => {
  try {
    const {
      strategyId,
      symbols = ['AAPL'],
      startDate,
      endDate,
      initialCapital = 100000,
      timeframe = '1d',
      commission = 5,
      slippage = 0.001,
      maxPositionSize = 0.2,
      riskFreeRate = 0.05,
      strategyParams = {}
    } = req.body;

    // Validate required parameters
    if (!strategyId) {
      return res.status(400).json({ 
        error: 'Strategy ID is required' 
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Start date and end date are required' 
      });
    }

    // Get the strategy
    const strategies = backtestingEngine.getStrategies();
    const strategy = strategies.find(s => s.id === strategyId);
    
    if (!strategy) {
      return res.status(400).json({ 
        error: `Strategy '${strategyId}' not found` 
      });
    }

    // Merge custom parameters with strategy defaults
    const finalStrategy = {
      ...strategy,
      parameters: { ...strategy.parameters, ...strategyParams }
    };

    // Create backtest configuration
    const config = {
      strategy: finalStrategy,
      symbols: symbols.map((s: string) => s.toUpperCase()),
      startDate,
      endDate,
      initialCapital,
      timeframe,
      commission,
      slippage,
      maxPositionSize,
      riskFreeRate
    };

    logger.info(`Starting backtest: ${strategy.name} for ${symbols.join(', ')}`);
    
    // Run the backtest
    const result = await backtestingEngine.runBacktest(config);
    
    res.json({
      success: true,
      result,
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Error running backtest:', error);
    res.status(500).json({ 
      error: 'Failed to run backtest',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Run multiple backtests for comparison
router.post('/compare', async (req, res) => {
  try {
    const { 
      configs = [],
      baseConfig = {}
    } = req.body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ 
        error: 'At least one backtest configuration is required' 
      });
    }

    if (configs.length > 5) {
      return res.status(400).json({ 
        error: 'Maximum 5 backtests can be compared at once' 
      });
    }

    const strategies = backtestingEngine.getStrategies();
    const results = [];

    for (const config of configs) {
      const strategy = strategies.find(s => s.id === config.strategyId);
      if (!strategy) {
        return res.status(400).json({ 
          error: `Strategy '${config.strategyId}' not found` 
        });
      }

      const finalConfig = {
        strategy: {
          ...strategy,
          parameters: { ...strategy.parameters, ...config.strategyParams }
        },
        symbols: (config.symbols || baseConfig.symbols || ['AAPL']).map((s: string) => s.toUpperCase()),
        startDate: config.startDate || baseConfig.startDate,
        endDate: config.endDate || baseConfig.endDate,
        initialCapital: config.initialCapital || baseConfig.initialCapital || 100000,
        timeframe: config.timeframe || baseConfig.timeframe || '1d',
        commission: config.commission || baseConfig.commission || 5,
        slippage: config.slippage || baseConfig.slippage || 0.001,
        maxPositionSize: config.maxPositionSize || baseConfig.maxPositionSize || 0.2,
        riskFreeRate: config.riskFreeRate || baseConfig.riskFreeRate || 0.05
      };

      const result = await backtestingEngine.runBacktest(finalConfig);
      results.push({
        configName: config.name || strategy.name,
        result
      });
    }

    // Calculate comparison metrics
    const comparison = {
      strategies: results.map(r => ({
        name: r.configName,
        totalReturn: r.result.summary.totalReturn,
        sharpeRatio: r.result.summary.sharpeRatio,
        maxDrawdown: r.result.summary.maxDrawdown,
        winRate: r.result.summary.winRate,
        profitFactor: r.result.summary.profitFactor,
        totalTrades: r.result.summary.totalTrades
      })),
      bestPerformer: {
        byReturn: results.reduce((best, current) => 
          current.result.summary.totalReturn > best.result.summary.totalReturn ? current : best
        ).configName,
        bySharpe: results.reduce((best, current) => 
          current.result.summary.sharpeRatio > best.result.summary.sharpeRatio ? current : best
        ).configName,
        byDrawdown: results.reduce((best, current) => 
          current.result.summary.maxDrawdown > best.result.summary.maxDrawdown ? current : best
        ).configName
      }
    };

    res.json({
      success: true,
      results,
      comparison,
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Error running backtest comparison:', error);
    res.status(500).json({ 
      error: 'Failed to run backtest comparison',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get backtest templates/presets
router.get('/presets', (req, res) => {
  try {
    const presets = [
      {
        id: 'conservative',
        name: 'Conservative Portfolio',
        description: 'Low-risk strategy with capital preservation focus',
        config: {
          symbols: ['AAPL', 'MSFT', 'GOOGL'],
          initialCapital: 100000,
          commission: 5,
          slippage: 0.001,
          maxPositionSize: 0.15,
          riskFreeRate: 0.05
        },
        strategies: [
          {
            strategyId: 'ma_crossover',
            params: { fastPeriod: 20, slowPeriod: 50, stopLoss: 0.03, takeProfit: 0.08 }
          },
          {
            strategyId: 'rsi_mean_reversion',
            params: { oversoldThreshold: 25, overboughtThreshold: 75 }
          }
        ]
      },
      {
        id: 'aggressive',
        name: 'Aggressive Growth',
        description: 'High-risk, high-reward momentum strategy',
        config: {
          symbols: ['TSLA', 'NVDA', 'AMD', 'COIN'],
          initialCapital: 100000,
          commission: 5,
          slippage: 0.002,
          maxPositionSize: 0.3,
          riskFreeRate: 0.05
        },
        strategies: [
          {
            strategyId: 'bollinger_bands',
            params: { period: 15, stdDev: 1.8, stopLoss: 0.08, takeProfit: 0.25 }
          },
          {
            strategyId: 'macd',
            params: { fastEMA: 8, slowEMA: 21, signalEMA: 6 }
          }
        ]
      },
      {
        id: 'diversified',
        name: 'Diversified Multi-Strategy',
        description: 'Balanced approach across multiple strategies and sectors',
        config: {
          symbols: ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META'],
          initialCapital: 100000,
          commission: 5,
          slippage: 0.0015,
          maxPositionSize: 0.2,
          riskFreeRate: 0.05
        },
        strategies: [
          {
            strategyId: 'ma_crossover',
            params: { fastPeriod: 12, slowPeriod: 26 }
          },
          {
            strategyId: 'rsi_mean_reversion',
            params: { rsiPeriod: 14 }
          },
          {
            strategyId: 'bollinger_bands',
            params: { period: 20, stdDev: 2 }
          }
        ]
      }
    ];

    res.json({
      presets,
      count: presets.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Performance analytics for backtest results
router.post('/analyze', async (req, res) => {
  try {
    const { backtestResult } = req.body;

    if (!backtestResult) {
      return res.status(400).json({ 
        error: 'Backtest result is required for analysis' 
      });
    }

    // Calculate additional analytics
    const trades = backtestResult.trades || [];
    const equity = backtestResult.equity || [];

    // Trade analysis
    const tradeAnalysis = {
      winningTrades: trades.filter((t: any) => t.pnl && t.pnl > 0),
      losingTrades: trades.filter((t: any) => t.pnl && t.pnl < 0),
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      averageHoldingPeriod: 0,
      winStreaks: [],
      lossStreaks: []
    };

    if (tradeAnalysis.winningTrades.length > 0) {
      tradeAnalysis.averageWin = tradeAnalysis.winningTrades
        .reduce((sum: number, t: any) => sum + t.pnl, 0) / tradeAnalysis.winningTrades.length;
      tradeAnalysis.largestWin = Math.max(...tradeAnalysis.winningTrades.map((t: any) => t.pnl));
    }

    if (tradeAnalysis.losingTrades.length > 0) {
      tradeAnalysis.averageLoss = tradeAnalysis.losingTrades
        .reduce((sum: number, t: any) => sum + t.pnl, 0) / tradeAnalysis.losingTrades.length;
      tradeAnalysis.largestLoss = Math.min(...tradeAnalysis.losingTrades.map((t: any) => t.pnl));
    }

    // Drawdown analysis
    const drawdowns = equity.map((e: any) => e.drawdown).filter((d: number) => d < 0);
    const drawdownAnalysis = {
      maxDrawdown: Math.min(...drawdowns) * 100,
      averageDrawdown: drawdowns.reduce((a: number, b: number) => a + b, 0) / drawdowns.length * 100,
      drawdownFrequency: drawdowns.length / equity.length * 100,
      recoveryTimes: [] // Would calculate actual recovery times in full implementation
    };

    // Monthly/yearly performance breakdown
    const monthlyReturns = backtestResult.monthlyReturns || [];
    const performanceBreakdown = {
      bestMonth: monthlyReturns.reduce((best: any, current: any) => 
        current.return > best.return ? current : best, { return: -Infinity }),
      worstMonth: monthlyReturns.reduce((worst: any, current: any) => 
        current.return < worst.return ? current : worst, { return: Infinity }),
      positiveMonths: monthlyReturns.filter((m: any) => m.return > 0).length,
      negativeMonths: monthlyReturns.filter((m: any) => m.return < 0).length,
      averageMonthlyReturn: monthlyReturns.reduce((sum: number, m: any) => sum + m.return, 0) / monthlyReturns.length
    };

    // Risk metrics
    const riskAnalysis = {
      valueAtRisk: backtestResult.metrics?.var95 || 0,
      conditionalVaR: backtestResult.metrics?.cvar95 || 0,
      beta: backtestResult.metrics?.beta || 1,
      alpha: backtestResult.metrics?.alpha || 0,
      correlationMetrics: {
        // Would calculate correlations with various benchmarks
        spy: 0.85,
        qqq: 0.78,
        xlk: 0.92
      }
    };

    res.json({
      success: true,
      analysis: {
        tradeAnalysis,
        drawdownAnalysis,
        performanceBreakdown,
        riskAnalysis,
        summary: backtestResult.summary
      },
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Error analyzing backtest:', error);
    res.status(500).json({ 
      error: 'Failed to analyze backtest results',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as backtestingRoutes };