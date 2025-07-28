import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnL: number;
  realizedPnL: number;
  timestamp: number;
  strategyId?: string;
}

export interface RiskLimits {
  maxPositionSize: number; // Maximum position size as % of portfolio
  maxPortfolioRisk: number; // Maximum portfolio risk (% of NAV)
  maxDrawdown: number; // Maximum allowed drawdown
  maxLeverage: number; // Maximum leverage ratio
  maxConcentration: number; // Max % in single symbol
  maxDailyLoss: number; // Max daily loss limit
  maxVaR: number; // Value at Risk limit (95% confidence)
}

export interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  dailyPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  drawdown: number;
  maxDrawdown: number;
  leverage: number;
  concentration: Record<string, number>; // Symbol concentration %
  var95: number; // Value at Risk (95% confidence)
  var99: number; // Value at Risk (99% confidence)
  expectedShortfall: number; // Expected Shortfall (CVaR)
  sharpeRatio: number;
  volatility: number;
  beta: number;
  riskAdjustedReturn: number;
}

export interface RiskAlert {
  id: string;
  type: 'limit_breach' | 'var_breach' | 'drawdown_alert' | 'concentration_alert' | 'margin_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  symbol?: string;
  currentValue: number;
  limitValue: number;
  timestamp: number;
  acknowledged: boolean;
}

export interface PositionSizeRecommendation {
  symbol: string;
  recommendedSize: number;
  maxAllowedSize: number;
  riskScore: number; // 0-1
  kellyFraction: number;
  confidenceLevel: number;
  reasoning: string;
  riskFactors: string[];
}

export interface StressTestScenario {
  name: string;
  description: string;
  marketShock: number; // % market decline
  volatilityMultiplier: number;
  correlationIncrease: number;
  estimatedLoss: number;
  worstCaseDrawdown: number;
}

export class RiskManagementService extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private portfolioHistory: PortfolioMetrics[] = [];
  private riskAlerts: RiskAlert[] = [];
  private priceHistory: Map<string, number[]> = new Map(); // For volatility calculations
  
  // Default risk limits (can be customized per user)
  private riskLimits: RiskLimits = {
    maxPositionSize: 0.05, // 5% max position size
    maxPortfolioRisk: 0.02, // 2% portfolio risk
    maxDrawdown: 0.15, // 15% max drawdown
    maxLeverage: 3.0, // 3x max leverage
    maxConcentration: 0.25, // 25% max in single symbol
    maxDailyLoss: 0.05, // 5% max daily loss
    maxVaR: 0.03 // 3% VaR limit
  };

  private readonly INITIAL_CAPITAL = 100000; // $100k starting capital
  private currentCapital = this.INITIAL_CAPITAL;
  private peakCapital = this.INITIAL_CAPITAL;

  constructor() {
    super();
    this.initializeMockData();
    logger.info('Risk Management Service initialized');
  }

  /**
   * Initialize with mock positions and historical data
   */
  private initializeMockData(): void {
    // Add some mock positions
    const mockPositions: Position[] = [
      {
        id: 'pos_1',
        symbol: 'AAPL',
        side: 'long',
        quantity: 100,
        entryPrice: 150.00,
        currentPrice: 155.50,
        stopLoss: 145.00,
        takeProfit: 165.00,
        unrealizedPnL: 550,
        realizedPnL: 0,
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
        strategyId: 'momentum_v1'
      },
      {
        id: 'pos_2',
        symbol: 'GOOGL',
        side: 'long',
        quantity: 25,
        entryPrice: 2800.00,
        currentPrice: 2750.00,
        stopLoss: 2700.00,
        unrealizedPnL: -1250,
        realizedPnL: 0,
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 day ago
        strategyId: 'mean_reversion_v1'
      },
      {
        id: 'pos_3',
        symbol: 'TSLA',
        side: 'short',
        quantity: 50,
        entryPrice: 220.00,
        currentPrice: 215.00,
        stopLoss: 230.00,
        takeProfit: 200.00,
        unrealizedPnL: 250,
        realizedPnL: 0,
        timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
        strategyId: 'momentum_v1'
      }
    ];

    mockPositions.forEach(pos => {
      this.positions.set(pos.id, pos);
    });

    // Generate mock price history for volatility calculations
    this.generateMockPriceHistory();
    
    // Generate historical portfolio metrics
    this.generateHistoricalMetrics();
  }

  /**
   * Generate mock historical price data for risk calculations
   */
  private generateMockPriceHistory(): void {
    const symbols = ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN', 'META', 'NVDA'];
    
    symbols.forEach(symbol => {
      const prices: number[] = [];
      let basePrice = 100 + Math.random() * 200;
      
      // Generate 252 days of price history (1 trading year)
      for (let i = 0; i < 252; i++) {
        const volatility = 0.25; // 25% annualized volatility
        const dailyReturn = (Math.random() - 0.5) * 2 * (volatility / Math.sqrt(252));
        basePrice *= (1 + dailyReturn);
        prices.push(basePrice);
      }
      
      this.priceHistory.set(symbol, prices);
    });
  }

  /**
   * Generate historical portfolio metrics for performance tracking
   */
  private generateHistoricalMetrics(): void {
    const now = Date.now();
    
    for (let i = 30; i >= 0; i--) {
      const timestamp = now - (i * 24 * 60 * 60 * 1000);
      const randomPnL = (Math.random() - 0.5) * 2000; // Random daily P&L
      
      this.portfolioHistory.push({
        totalValue: this.INITIAL_CAPITAL + randomPnL * (30 - i),
        totalPnL: randomPnL * (30 - i),
        dailyPnL: randomPnL,
        unrealizedPnL: 0,
        realizedPnL: randomPnL * (30 - i),
        drawdown: Math.max(0, -randomPnL * (30 - i) / this.INITIAL_CAPITAL),
        maxDrawdown: 0.08,
        leverage: 1.2 + Math.random() * 0.8,
        concentration: { 'AAPL': 0.15, 'GOOGL': 0.12, 'TSLA': 0.08 },
        var95: 0.018 + Math.random() * 0.012,
        var99: 0.025 + Math.random() * 0.015,
        expectedShortfall: 0.032 + Math.random() * 0.018,
        sharpeRatio: 1.2 + Math.random() * 0.8,
        volatility: 0.15 + Math.random() * 0.1,
        beta: 0.8 + Math.random() * 0.4,
        riskAdjustedReturn: (randomPnL * (30 - i)) / (this.INITIAL_CAPITAL * 0.15)
      });
    }
  }

  /**
   * Calculate position size recommendation based on Kelly Criterion and risk limits
   */
  calculatePositionSize(
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    winRate: number = 0.55,
    avgWin: number = 1.5,
    avgLoss: number = 1.0
  ): PositionSizeRecommendation {
    const currentMetrics = this.getPortfolioMetrics();
    const availableCapital = currentMetrics.totalValue;
    
    // Calculate Kelly Fraction
    const b = avgWin; // odds received on the wager
    const p = winRate; // probability of winning
    const q = 1 - p; // probability of losing
    const kellyFraction = (b * p - q) / b;
    
    // Risk per share
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const riskPercent = riskPerShare / entryPrice;
    
    // Portfolio risk-based sizing
    const maxRiskAmount = availableCapital * this.riskLimits.maxPortfolioRisk;
    const maxSharesRisk = Math.floor(maxRiskAmount / riskPerShare);
    
    // Position size limit-based sizing
    const maxPositionValue = availableCapital * this.riskLimits.maxPositionSize;
    const maxSharesPosition = Math.floor(maxPositionValue / entryPrice);
    
    // Kelly-based sizing (with fraction for safety)
    const kellyPositionValue = availableCapital * Math.max(0, Math.min(kellyFraction * 0.25, 0.1)); // Max 10%, Kelly/4 for safety
    const maxSharesKelly = Math.floor(kellyPositionValue / entryPrice);
    
    // Take the minimum for conservative sizing
    const recommendedShares = Math.max(0, Math.min(maxSharesRisk, maxSharesPosition, maxSharesKelly));
    const maxAllowedShares = Math.max(0, Math.min(maxSharesRisk, maxSharesPosition));
    
    // Calculate risk score (0 = low risk, 1 = high risk)
    const volatility = this.calculateVolatility(symbol);
    const concentration = this.calculateConcentration(symbol, recommendedShares * entryPrice);
    const leverageImpact = (recommendedShares * entryPrice) / availableCapital;
    
    const riskScore = Math.min(1, (
      volatility * 0.3 +
      concentration * 0.3 +
      leverageImpact * 0.2 +
      riskPercent * 0.2
    ));
    
    // Generate risk factors
    const riskFactors: string[] = [];
    if (volatility > 0.3) riskFactors.push('High volatility');
    if (concentration > this.riskLimits.maxConcentration) riskFactors.push('Concentration risk');
    if (leverageImpact > 0.1) riskFactors.push('High leverage impact');
    if (riskPercent > 0.05) riskFactors.push('Large stop loss distance');
    if (kellyFraction < 0) riskFactors.push('Negative expected value');
    
    return {
      symbol,
      recommendedSize: recommendedShares,
      maxAllowedSize: maxAllowedShares,
      riskScore,
      kellyFraction: Math.max(0, kellyFraction),
      confidenceLevel: winRate,
      reasoning: this.generateSizingReasoning(recommendedShares, maxAllowedShares, riskScore),
      riskFactors
    };
  }

  /**
   * Generate reasoning for position sizing recommendation
   */
  private generateSizingReasoning(recommended: number, maxAllowed: number, riskScore: number): string {
    if (recommended === 0) {
      return 'Position not recommended due to high risk or negative expected value';
    }
    
    if (recommended === maxAllowed) {
      return 'Sized at maximum allowed limit based on risk constraints';
    }
    
    if (riskScore > 0.7) {
      return 'Conservative sizing due to elevated risk factors';
    } else if (riskScore > 0.4) {
      return 'Moderate sizing considering balanced risk-reward profile';
    } else {
      return 'Aggressive sizing given favorable risk-reward characteristics';
    }
  }

  /**
   * Calculate volatility for a symbol using historical prices
   */
  private calculateVolatility(symbol: string): number {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < 30) return 0.25; // Default volatility
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    
    return Math.sqrt(variance * 252); // Annualized volatility
  }

  /**
   * Calculate concentration risk for adding a position
   */
  private calculateConcentration(symbol: string, additionalValue: number): number {
    const currentMetrics = this.getPortfolioMetrics();
    const existingConcentration = currentMetrics.concentration[symbol] || 0;
    const newConcentration = (existingConcentration * currentMetrics.totalValue + additionalValue) / currentMetrics.totalValue;
    
    return newConcentration;
  }

  /**
   * Get current portfolio metrics
   */
  getPortfolioMetrics(): PortfolioMetrics {
    const positions = Array.from(this.positions.values());
    
    // Calculate total values
    const totalValue = this.currentCapital + positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const unrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const realizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
    const totalPnL = unrealizedPnL + realizedPnL;
    
    // Calculate drawdown
    this.peakCapital = Math.max(this.peakCapital, totalValue);
    const drawdown = (this.peakCapital - totalValue) / this.peakCapital;
    
    // Calculate leverage
    const grossExposure = positions.reduce((sum, pos) => sum + Math.abs(pos.quantity * pos.currentPrice), 0);
    const leverage = grossExposure / totalValue;
    
    // Calculate concentration
    const concentration: Record<string, number> = {};
    positions.forEach(pos => {
      const positionValue = Math.abs(pos.quantity * pos.currentPrice);
      concentration[pos.symbol] = (concentration[pos.symbol] || 0) + positionValue / totalValue;
    });
    
    // Calculate VaR and other risk metrics
    const var95 = this.calculateVaR(0.05);
    const var99 = this.calculateVaR(0.01);
    const expectedShortfall = this.calculateExpectedShortfall(0.05);
    
    // Get today's P&L
    const today = new Date().toDateString();
    const todayPositions = positions.filter(pos => new Date(pos.timestamp).toDateString() === today);
    const dailyPnL = todayPositions.reduce((sum, pos) => sum + pos.unrealizedPnL + pos.realizedPnL, 0);
    
    // Calculate Sharpe ratio and other performance metrics
    const returns = this.portfolioHistory.map(h => h.dailyPnL / this.INITIAL_CAPITAL);
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1)) * Math.sqrt(252);
    const sharpeRatio = avgReturn * 252 / volatility;
    
    return {
      totalValue,
      totalPnL,
      dailyPnL,
      unrealizedPnL,
      realizedPnL,
      drawdown,
      maxDrawdown: Math.max(drawdown, ...this.portfolioHistory.map(h => h.drawdown)),
      leverage,
      concentration,
      var95,
      var99,
      expectedShortfall,
      sharpeRatio,
      volatility,
      beta: 1.0, // Simplified - would calculate vs market
      riskAdjustedReturn: totalPnL / (totalValue * volatility)
    };
  }

  /**
   * Calculate Value at Risk using historical simulation
   */
  private calculateVaR(confidence: number): number {
    const returns = this.portfolioHistory.map(h => h.dailyPnL / h.totalValue);
    returns.sort((a, b) => a - b);
    
    const index = Math.floor(confidence * returns.length);
    return Math.abs(returns[index] || 0);
  }

  /**
   * Calculate Expected Shortfall (Conditional VaR)
   */
  private calculateExpectedShortfall(confidence: number): number {
    const returns = this.portfolioHistory.map(h => h.dailyPnL / h.totalValue);
    returns.sort((a, b) => a - b);
    
    const cutoff = Math.floor(confidence * returns.length);
    const tailReturns = returns.slice(0, cutoff);
    
    return Math.abs(tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length);
  }

  /**
   * Run stress tests on the portfolio
   */
  runStressTests(): StressTestScenario[] {
    const currentMetrics = this.getPortfolioMetrics();
    
    const scenarios: StressTestScenario[] = [
      {
        name: '2008 Financial Crisis',
        description: 'Market decline similar to 2008 financial crisis',
        marketShock: -0.37, // 37% market decline
        volatilityMultiplier: 2.5,
        correlationIncrease: 0.3,
        estimatedLoss: currentMetrics.totalValue * 0.25,
        worstCaseDrawdown: 0.35
      },
      {
        name: 'Black Monday 1987',
        description: 'Single day market crash scenario',
        marketShock: -0.22, // 22% single day decline
        volatilityMultiplier: 5.0,
        correlationIncrease: 0.5,
        estimatedLoss: currentMetrics.totalValue * 0.18,
        worstCaseDrawdown: 0.20
      },
      {
        name: 'COVID-19 March 2020',
        description: 'Pandemic-induced market volatility',
        marketShock: -0.34, // 34% decline over weeks
        volatilityMultiplier: 3.0,
        correlationIncrease: 0.4,
        estimatedLoss: currentMetrics.totalValue * 0.22,
        worstCaseDrawdown: 0.28
      },
      {
        name: 'Interest Rate Shock',
        description: 'Rapid rise in interest rates',
        marketShock: -0.15, // 15% market decline
        volatilityMultiplier: 1.8,
        correlationIncrease: 0.2,
        estimatedLoss: currentMetrics.totalValue * 0.12,
        worstCaseDrawdown: 0.18
      },
      {
        name: 'Sector Rotation',
        description: 'Major sector rotation scenario',
        marketShock: -0.08, // 8% overall decline
        volatilityMultiplier: 1.5,
        correlationIncrease: -0.1, // Some decorrelation
        estimatedLoss: currentMetrics.totalValue * 0.06,
        worstCaseDrawdown: 0.10
      }
    ];
    
    return scenarios;
  }

  /**
   * Check risk limits and generate alerts
   */
  checkRiskLimits(): RiskAlert[] {
    const metrics = this.getPortfolioMetrics();
    const newAlerts: RiskAlert[] = [];
    
    // Check drawdown limit
    if (metrics.drawdown > this.riskLimits.maxDrawdown) {
      newAlerts.push({
        id: `alert_${Date.now()}_drawdown`,
        type: 'drawdown_alert',
        severity: 'critical',
        message: `Portfolio drawdown (${(metrics.drawdown * 100).toFixed(1)}%) exceeds limit (${(this.riskLimits.maxDrawdown * 100).toFixed(1)}%)`,
        currentValue: metrics.drawdown,
        limitValue: this.riskLimits.maxDrawdown,
        timestamp: Date.now(),
        acknowledged: false
      });
    }
    
    // Check VaR limit
    if (metrics.var95 > this.riskLimits.maxVaR) {
      newAlerts.push({
        id: `alert_${Date.now()}_var`,
        type: 'var_breach',
        severity: 'high',
        message: `Value at Risk (${(metrics.var95 * 100).toFixed(1)}%) exceeds limit (${(this.riskLimits.maxVaR * 100).toFixed(1)}%)`,
        currentValue: metrics.var95,
        limitValue: this.riskLimits.maxVaR,
        timestamp: Date.now(),
        acknowledged: false
      });
    }
    
    // Check leverage limit
    if (metrics.leverage > this.riskLimits.maxLeverage) {
      newAlerts.push({
        id: `alert_${Date.now()}_leverage`,
        type: 'limit_breach',
        severity: 'medium',
        message: `Portfolio leverage (${metrics.leverage.toFixed(1)}x) exceeds limit (${this.riskLimits.maxLeverage.toFixed(1)}x)`,
        currentValue: metrics.leverage,
        limitValue: this.riskLimits.maxLeverage,
        timestamp: Date.now(),
        acknowledged: false
      });
    }
    
    // Check concentration limits
    Object.entries(metrics.concentration).forEach(([symbol, concentration]) => {
      if (concentration > this.riskLimits.maxConcentration) {
        newAlerts.push({
          id: `alert_${Date.now()}_${symbol}`,
          type: 'concentration_alert',
          severity: 'medium',
          message: `${symbol} concentration (${(concentration * 100).toFixed(1)}%) exceeds limit (${(this.riskLimits.maxConcentration * 100).toFixed(1)}%)`,
          symbol,
          currentValue: concentration,
          limitValue: this.riskLimits.maxConcentration,
          timestamp: Date.now(),
          acknowledged: false
        });
      }
    });
    
    // Check daily loss limit
    if (metrics.dailyPnL < -this.currentCapital * this.riskLimits.maxDailyLoss) {
      newAlerts.push({
        id: `alert_${Date.now()}_daily_loss`,
        type: 'limit_breach',
        severity: 'critical',
        message: `Daily loss ($${Math.abs(metrics.dailyPnL).toFixed(0)}) exceeds limit ($${(this.currentCapital * this.riskLimits.maxDailyLoss).toFixed(0)})`,
        currentValue: Math.abs(metrics.dailyPnL) / this.currentCapital,
        limitValue: this.riskLimits.maxDailyLoss,
        timestamp: Date.now(),
        acknowledged: false
      });
    }
    
    // Add new alerts and emit events
    newAlerts.forEach(alert => {
      this.riskAlerts.unshift(alert);
      this.emit('risk-alert', alert);
      
      if (alert.severity === 'critical') {
        this.emit('critical-alert', alert);
      }
    });
    
    // Keep only recent alerts (last 100)
    this.riskAlerts = this.riskAlerts.slice(0, 100);
    
    return newAlerts;
  }

  /**
   * Get current risk alerts
   */
  getRiskAlerts(unacknowledgedOnly: boolean = false): RiskAlert[] {
    return unacknowledgedOnly 
      ? this.riskAlerts.filter(alert => !alert.acknowledged)
      : this.riskAlerts;
  }

  /**
   * Acknowledge a risk alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.riskAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(newLimits: Partial<RiskLimits>): RiskLimits {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    logger.info('Risk limits updated', this.riskLimits);
    return this.riskLimits;
  }

  /**
   * Get current risk limits
   */
  getRiskLimits(): RiskLimits {
    return { ...this.riskLimits };
  }

  /**
   * Add a new position
   */
  addPosition(position: Omit<Position, 'id'>): Position {
    const newPosition: Position = {
      ...position,
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.positions.set(newPosition.id, newPosition);
    this.emit('position-added', newPosition);
    
    // Check risk limits after adding position
    this.checkRiskLimits();
    
    return newPosition;
  }

  /**
   * Update position (e.g., current price, P&L)
   */
  updatePosition(positionId: string, updates: Partial<Position>): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;
    
    const updatedPosition = { ...position, ...updates };
    this.positions.set(positionId, updatedPosition);
    
    this.emit('position-updated', updatedPosition);
    return updatedPosition;
  }

  /**
   * Close position
   */
  closePosition(positionId: string, exitPrice: number): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;
    
    // Calculate final P&L
    const pnl = position.side === 'long' 
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;
    
    const closedPosition = {
      ...position,
      currentPrice: exitPrice,
      unrealizedPnL: 0,
      realizedPnL: position.realizedPnL + pnl
    };
    
    this.positions.delete(positionId);
    this.currentCapital += pnl;
    
    this.emit('position-closed', closedPosition);
    return closedPosition;
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get positions for a specific symbol
   */
  getPositionsBySymbol(symbol: string): Position[] {
    return Array.from(this.positions.values()).filter(pos => pos.symbol === symbol);
  }

  /**
   * Start real-time risk monitoring
   */
  startRiskMonitoring(intervalMs: number = 30000): void {
    logger.info('Starting real-time risk monitoring');
    
    const monitorRisk = () => {
      try {
        const metrics = this.getPortfolioMetrics();
        const alerts = this.checkRiskLimits();
        
        // Emit metrics update
        this.emit('metrics-updated', metrics);
        
        // Log critical alerts
        alerts.forEach(alert => {
          if (alert.severity === 'critical') {
            logger.warn(`CRITICAL RISK ALERT: ${alert.message}`);
          }
        });
        
        // Update portfolio history
        this.portfolioHistory.push(metrics);
        if (this.portfolioHistory.length > 365) {
          this.portfolioHistory = this.portfolioHistory.slice(-365); // Keep 1 year
        }
        
      } catch (error) {
        logger.error('Error in risk monitoring:', error);
      }
    };
    
    // Initial check
    monitorRisk();
    
    // Set up interval
    setInterval(monitorRisk, intervalMs);
  }
}