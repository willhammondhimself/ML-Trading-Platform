import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  weight: number;
  sector: string;
  beta: number;
}

interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  var95: number; // Value at Risk 95%
  cvar95: number; // Conditional Value at Risk 95%
}

interface BenchmarkData {
  name: string;
  symbol: string;
  returns: number[];
  currentPrice: number;
  totalReturn: number;
  volatility: number;
  sharpeRatio: number;
}

interface AttributionAnalysis {
  totalPortfolioReturn: number;
  benchmarkReturn: number;
  totalAlpha: number;
  selections: {
    security: number;
    sector: number;
    interaction: number;
  };
  allocations: {
    asset: number;
    sector: number;
    security: number;
  };
  factorExposure: {
    market: number;
    size: number;
    value: number;
    momentum: number;
    quality: number;
    lowVolatility: number;
  };
}

interface RiskMetrics {
  trackingError: number;
  informationRatio: number;
  beta: number;
  correlationWithBenchmark: number;
  activeShare: number;
  concentrationRisk: number;
  sectorExposure: Record<string, number>;
}

interface PerformanceTimeSeries {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  alpha: number;
  drawdown: number;
}

export class PerformanceAnalysisService extends EventEmitter {
  private performanceHistory: PerformanceTimeSeries[] = [];
  private benchmarks: Map<string, BenchmarkData> = new Map();
  private positions: Map<string, PortfolioPosition> = new Map();
  private riskFreeRate = 0.05; // 5% risk-free rate

  // Sector classifications
  private readonly sectorMap: Record<string, string> = {
    'AAPL': 'Technology',
    'GOOGL': 'Technology',
    'MSFT': 'Technology',
    'AMZN': 'Consumer Discretionary',
    'TSLA': 'Consumer Discretionary',
    'META': 'Technology',
    'NVDA': 'Technology',
    'AMD': 'Technology',
    'NFLX': 'Communication Services',
    'CRM': 'Technology',
    'UBER': 'Consumer Discretionary',
    'COIN': 'Financial Services',
    'SNOW': 'Technology',
    'ZM': 'Technology',
    'PLTR': 'Technology',
    'SQ': 'Financial Services'
  };

  // Historical beta estimates
  private readonly betaMap: Record<string, number> = {
    'AAPL': 1.24,
    'GOOGL': 1.05,
    'MSFT': 0.90,
    'AMZN': 1.15,
    'TSLA': 2.03,
    'META': 1.35,
    'NVDA': 1.65,
    'AMD': 1.82,
    'NFLX': 1.25,
    'CRM': 1.18,
    'UBER': 1.45,
    'COIN': 3.25,
    'SNOW': 1.88,
    'ZM': 1.75,
    'PLTR': 2.15,
    'SQ': 2.35
  };

  constructor() {
    super();
    this.initializeBenchmarks();
    this.initializeMockPortfolio();
    this.generateMockHistory();
    logger.info('Performance analysis service initialized');
  }

  /**
   * Initialize benchmark data
   */
  private initializeBenchmarks(): void {
    // S&P 500
    this.benchmarks.set('SPY', {
      name: 'S&P 500',
      symbol: 'SPY',
      returns: this.generateBenchmarkReturns(0.10, 0.16), // 10% return, 16% volatility
      currentPrice: 445.50,
      totalReturn: 12.8,
      volatility: 16.2,
      sharpeRatio: 0.61
    });

    // NASDAQ-100
    this.benchmarks.set('QQQ', {
      name: 'NASDAQ-100',
      symbol: 'QQQ',
      returns: this.generateBenchmarkReturns(0.14, 0.22), // 14% return, 22% volatility
      currentPrice: 385.25,
      totalReturn: 15.6,
      volatility: 21.8,
      sharpeRatio: 0.54
    });

    // Technology Sector
    this.benchmarks.set('XLK', {
      name: 'Technology Select Sector',
      symbol: 'XLK',
      returns: this.generateBenchmarkReturns(0.18, 0.25), // 18% return, 25% volatility
      currentPrice: 198.75,
      totalReturn: 19.2,
      volatility: 24.5,
      sharpeRatio: 0.58
    });
  }

  /**
   * Generate benchmark returns
   */
  private generateBenchmarkReturns(annualReturn: number, volatility: number): number[] {
    const returns = [];
    const dailyReturn = annualReturn / 252;
    const dailyVol = volatility / Math.sqrt(252);

    for (let i = 0; i < 252; i++) {
      const randomReturn = dailyReturn + (Math.random() - 0.5) * dailyVol * 2;
      returns.push(randomReturn);
    }
    return returns;
  }

  /**
   * Initialize mock portfolio
   */
  private initializeMockPortfolio(): void {
    const mockPositions = [
      { symbol: 'AAPL', quantity: 100, averagePrice: 150.25, currentPrice: 175.30 },
      { symbol: 'GOOGL', quantity: 50, averagePrice: 2800.50, currentPrice: 2950.75 },
      { symbol: 'MSFT', quantity: 75, averagePrice: 320.15, currentPrice: 345.80 },
      { symbol: 'AMZN', quantity: 25, averagePrice: 3200.75, currentPrice: 3145.60 },
      { symbol: 'TSLA', quantity: 60, averagePrice: 220.15, currentPrice: 245.80 },
      { symbol: 'META', quantity: 40, averagePrice: 285.50, currentPrice: 312.25 },
      { symbol: 'NVDA', quantity: 30, averagePrice: 425.75, currentPrice: 485.90 }
    ];

    const totalValue = mockPositions.reduce((sum, pos) => 
      sum + (pos.quantity * pos.currentPrice), 0
    );

    mockPositions.forEach(pos => {
      const marketValue = pos.quantity * pos.currentPrice;
      const unrealizedPnL = pos.quantity * (pos.currentPrice - pos.averagePrice);
      
      this.positions.set(pos.symbol, {
        ...pos,
        marketValue,
        unrealizedPnL,
        realizedPnL: Math.random() * 1000 - 500, // Random realized P&L
        weight: marketValue / totalValue,
        sector: this.sectorMap[pos.symbol] || 'Unknown',
        beta: this.betaMap[pos.symbol] || 1.0
      });
    });
  }

  /**
   * Generate mock performance history
   */
  private generateMockHistory(): void {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    
    let portfolioValue = 500000; // Starting portfolio value
    let benchmarkValue = 500000;
    let maxValue = portfolioValue;

    for (let i = 0; i < 252; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Generate correlated returns
      const marketReturn = (Math.random() - 0.5) * 0.04; // ±2% daily moves
      const portfolioReturn = marketReturn * 1.2 + (Math.random() - 0.5) * 0.02; // Higher beta + alpha
      const benchmarkReturn = marketReturn;

      portfolioValue *= (1 + portfolioReturn);
      benchmarkValue *= (1 + benchmarkReturn);

      maxValue = Math.max(maxValue, portfolioValue);
      const drawdown = (portfolioValue - maxValue) / maxValue;

      this.performanceHistory.push({
        date: date.toISOString().split('T')[0],
        portfolioValue,
        benchmarkValue,
        portfolioReturn,
        benchmarkReturn,
        alpha: portfolioReturn - benchmarkReturn,
        drawdown
      });
    }
  }

  /**
   * Calculate comprehensive performance metrics
   */
  calculatePerformanceMetrics(period: '1M' | '3M' | '6M' | '1Y' = '1Y'): PerformanceMetrics {
    const periodDays = period === '1M' ? 22 : period === '3M' ? 66 : period === '6M' ? 132 : 252;
    const history = this.performanceHistory.slice(-periodDays);
    
    if (history.length === 0) {
      throw new Error('No performance history available');
    }

    const returns = history.map(h => h.portfolioReturn);
    const startValue = history[0].portfolioValue;
    const endValue = history[history.length - 1].portfolioValue;
    
    // Basic metrics
    const totalReturn = (endValue - startValue) / startValue;
    const annualizedReturn = Math.pow(1 + totalReturn, 252 / history.length) - 1;
    const volatility = this.calculateVolatility(returns) * Math.sqrt(252);
    const sharpeRatio = (annualizedReturn - this.riskFreeRate) / volatility;
    
    // Downside metrics
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVolatility = this.calculateVolatility(downsideReturns) * Math.sqrt(252);
    const sortinoRatio = downsideVolatility > 0 ? (annualizedReturn - this.riskFreeRate) / downsideVolatility : 0;
    
    // Drawdown metrics
    const maxDrawdown = Math.min(...history.map(h => h.drawdown));
    const calmarRatio = maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : 0;
    
    // Win/Loss metrics
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0);
    const winRate = wins.length / returns.length;
    const averageWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const profitFactor = averageLoss < 0 ? Math.abs(averageWin * wins.length / (averageLoss * losses.length)) : 0;
    
    // Risk metrics
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95Index = Math.floor(returns.length * 0.05);
    const var95 = sortedReturns[var95Index] || 0;
    const cvar95 = sortedReturns.slice(0, var95Index + 1).reduce((a, b) => a + b, 0) / (var95Index + 1);

    return {
      totalReturn: totalReturn * 100,
      annualizedReturn: annualizedReturn * 100,
      volatility: volatility * 100,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      calmarRatio,
      winRate: winRate * 100,
      averageWin: averageWin * 100,
      averageLoss: averageLoss * 100,
      profitFactor,
      var95: var95 * 100,
      cvar95: cvar95 * 100
    };
  }

  /**
   * Calculate portfolio attribution analysis
   */
  calculateAttribution(benchmarkSymbol: string = 'SPY'): AttributionAnalysis {
    const benchmark = this.benchmarks.get(benchmarkSymbol);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkSymbol} not found`);
    }

    const portfolioPositions = Array.from(this.positions.values());
    const totalPortfolioReturn = portfolioPositions.reduce((sum, pos) => 
      sum + (pos.weight * (pos.unrealizedPnL / (pos.averagePrice * pos.quantity))), 0
    );

    // Sector analysis
    const sectorExposure: Record<string, number> = {};
    portfolioPositions.forEach(pos => {
      sectorExposure[pos.sector] = (sectorExposure[pos.sector] || 0) + pos.weight;
    });

    // Mock factor exposures (would be calculated from factor model in real implementation)
    const factorExposure = {
      market: 1.15, // Portfolio beta
      size: -0.25, // Slight tilt toward large cap
      value: 0.12, // Slight value tilt
      momentum: 0.35, // Momentum exposure
      quality: 0.18, // Quality factor
      lowVolatility: -0.22 // Higher volatility stocks
    };

    // Attribution calculations (simplified Brinson model)
    const benchmarkReturn = benchmark.totalReturn / 100;
    const totalAlpha = totalPortfolioReturn - benchmarkReturn;

    return {
      totalPortfolioReturn: totalPortfolioReturn * 100,
      benchmarkReturn: benchmarkReturn * 100,
      totalAlpha: totalAlpha * 100,
      selections: {
        security: totalAlpha * 0.6 * 100, // 60% from security selection
        sector: totalAlpha * 0.3 * 100,   // 30% from sector allocation
        interaction: totalAlpha * 0.1 * 100 // 10% interaction effect
      },
      allocations: {
        asset: totalAlpha * 0.4 * 100,
        sector: totalAlpha * 0.4 * 100,
        security: totalAlpha * 0.2 * 100
      },
      factorExposure
    };
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(benchmarkSymbol: string = 'SPY'): RiskMetrics {
    const benchmark = this.benchmarks.get(benchmarkSymbol);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkSymbol} not found`);
    }

    const portfolioPositions = Array.from(this.positions.values());
    const portfolioReturns = this.performanceHistory.map(h => h.portfolioReturn);
    const benchmarkReturns = this.performanceHistory.map(h => h.benchmarkReturn);
    
    // Calculate tracking error
    const activeReturns = portfolioReturns.map((pr, i) => pr - benchmarkReturns[i]);
    const trackingError = this.calculateVolatility(activeReturns) * Math.sqrt(252) * 100;
    
    // Information ratio
    const averageActiveReturn = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
    const informationRatio = trackingError > 0 ? (averageActiveReturn * 252 * 100) / trackingError : 0;
    
    // Portfolio beta
    const beta = this.calculateBeta(portfolioReturns, benchmarkReturns);
    
    // Correlation
    const correlation = this.calculateCorrelation(portfolioReturns, benchmarkReturns);
    
    // Active share (simplified)
    const activeShare = 0.65; // Mock value - would calculate from benchmark weights
    
    // Concentration risk (Herfindahl index)
    const concentrationRisk = portfolioPositions.reduce((sum, pos) => sum + pos.weight * pos.weight, 0);
    
    // Sector exposure
    const sectorExposure: Record<string, number> = {};
    portfolioPositions.forEach(pos => {
      sectorExposure[pos.sector] = (sectorExposure[pos.sector] || 0) + pos.weight * 100;
    });

    return {
      trackingError,
      informationRatio,
      beta,
      correlationWithBenchmark: correlation,
      activeShare,
      concentrationRisk,
      sectorExposure
    };
  }

  /**
   * Get performance time series
   */
  getPerformanceTimeSeries(period: '1M' | '3M' | '6M' | '1Y' = '1Y'): PerformanceTimeSeries[] {
    const periodDays = period === '1M' ? 22 : period === '3M' ? 66 : period === '6M' ? 132 : 252;
    return this.performanceHistory.slice(-periodDays);
  }

  /**
   * Get available benchmarks
   */
  getBenchmarks(): BenchmarkData[] {
    return Array.from(this.benchmarks.values());
  }

  /**
   * Get current portfolio positions
   */
  getPortfolioPositions(): PortfolioPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate beta
   */
  private calculateBeta(portfolioReturns: number[], benchmarkReturns: number[]): number {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
      return 1.0;
    }

    const portfolioMean = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const benchmarkMean = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;

    let covariance = 0;
    let benchmarkVariance = 0;

    for (let i = 0; i < portfolioReturns.length; i++) {
      const portfolioDiff = portfolioReturns[i] - portfolioMean;
      const benchmarkDiff = benchmarkReturns[i] - benchmarkMean;
      
      covariance += portfolioDiff * benchmarkDiff;
      benchmarkVariance += benchmarkDiff * benchmarkDiff;
    }

    return benchmarkVariance > 0 ? covariance / benchmarkVariance : 1.0;
  }

  /**
   * Calculate correlation
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const xMean = x.reduce((a, b) => a + b, 0) / x.length;
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;

    let numerator = 0;
    let xVariance = 0;
    let yVariance = 0;

    for (let i = 0; i < x.length; i++) {
      const xDiff = x[i] - xMean;
      const yDiff = y[i] - yMean;
      
      numerator += xDiff * yDiff;
      xVariance += xDiff * xDiff;
      yVariance += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xVariance * yVariance);
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate rolling metrics
   */
  calculateRollingMetrics(windowDays: number = 22): Array<{
    date: string;
    sharpeRatio: number;
    volatility: number;
    beta: number;
    alpha: number;
  }> {
    const results = [];
    
    for (let i = windowDays; i < this.performanceHistory.length; i++) {
      const window = this.performanceHistory.slice(i - windowDays, i);
      const portfolioReturns = window.map(h => h.portfolioReturn);
      const benchmarkReturns = window.map(h => h.benchmarkReturn);
      
      const volatility = this.calculateVolatility(portfolioReturns) * Math.sqrt(252);
      const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length * 252;
      const sharpeRatio = volatility > 0 ? (meanReturn - this.riskFreeRate) / volatility : 0;
      const beta = this.calculateBeta(portfolioReturns, benchmarkReturns);
      const alpha = meanReturn - (this.riskFreeRate + beta * 0.10); // Assuming 10% market return
      
      results.push({
        date: window[window.length - 1].date,
        sharpeRatio,
        volatility: volatility * 100,
        beta,
        alpha: alpha * 100
      });
    }
    
    return results;
  }
}