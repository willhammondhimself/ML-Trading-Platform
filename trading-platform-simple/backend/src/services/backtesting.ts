import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

interface HistoricalDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
}

interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  signals: (data: HistoricalDataPoint[], params: Record<string, any>) => TradingSignal[];
}

interface TradingSignal {
  timestamp: number;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-1
  quantity?: number;
  price: number;
  reason: string;
}

interface BacktestConfig {
  strategy: TradingStrategy;
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  commission: number; // per trade
  slippage: number; // percentage
  maxPositionSize: number; // percentage of portfolio
  riskFreeRate: number;
}

interface Trade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: number;
  commission: number;
  slippage: number;
  pnl?: number;
  holdingPeriod?: number;
}

interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  weight: number;
}

interface BacktestResult {
  config: BacktestConfig;
  summary: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    averageHoldingPeriod: number;
    totalCommissions: number;
    totalSlippage: number;
  };
  trades: Trade[];
  equity: Array<{
    timestamp: number;
    equity: number;
    drawdown: number;
    positions: Position[];
  }>;
  monthlyReturns: Array<{
    month: string;
    return: number;
  }>;
  metrics: {
    var95: number;
    cvar95: number;
    beta: number;
    alpha: number;
    informationRatio: number;
    treynorRatio: number;
  };
}

export class BacktestingEngine extends EventEmitter {
  private strategies: Map<string, TradingStrategy> = new Map();
  private historicalData: Map<string, HistoricalDataPoint[]> = new Map();

  constructor() {
    super();
    this.initializeStrategies();
    this.generateMockData();
    logger.info('Backtesting engine initialized');
  }

  /**
   * Initialize built-in trading strategies
   */
  private initializeStrategies(): void {
    // Moving Average Crossover Strategy
    this.strategies.set('ma_crossover', {
      id: 'ma_crossover',
      name: 'Moving Average Crossover',
      description: 'Buy when fast MA crosses above slow MA, sell when it crosses below',
      parameters: {
        fastPeriod: 10,
        slowPeriod: 50,
        stopLoss: 0.05, // 5%
        takeProfit: 0.15 // 15%
      },
      signals: (data: HistoricalDataPoint[], params: Record<string, any>) => {
        return this.generateMACrossoverSignals(data, params);
      }
    });

    // RSI Mean Reversion Strategy
    this.strategies.set('rsi_mean_reversion', {
      id: 'rsi_mean_reversion',
      name: 'RSI Mean Reversion',
      description: 'Buy when RSI < 30, sell when RSI > 70',
      parameters: {
        rsiPeriod: 14,
        oversoldThreshold: 30,
        overboughtThreshold: 70,
        stopLoss: 0.08,
        takeProfit: 0.12
      },
      signals: (data: HistoricalDataPoint[], params: Record<string, any>) => {
        return this.generateRSISignals(data, params);
      }
    });

    // Bollinger Bands Strategy
    this.strategies.set('bollinger_bands', {
      id: 'bollinger_bands',
      name: 'Bollinger Bands Breakout',
      description: 'Buy on upper band breakout, sell on lower band breakdown',
      parameters: {
        period: 20,
        stdDev: 2,
        stopLoss: 0.06,
        takeProfit: 0.18
      },
      signals: (data: HistoricalDataPoint[], params: Record<string, any>) => {
        return this.generateBollingerSignals(data, params);
      }
    });

    // MACD Strategy
    this.strategies.set('macd', {
      id: 'macd',
      name: 'MACD Momentum',
      description: 'Buy on MACD bullish crossover, sell on bearish crossover',
      parameters: {
        fastEMA: 12,
        slowEMA: 26,
        signalEMA: 9,
        stopLoss: 0.07,
        takeProfit: 0.20
      },
      signals: (data: HistoricalDataPoint[], params: Record<string, any>) => {
        return this.generateMACDSignals(data, params);
      }
    });
  }

  /**
   * Generate mock historical data for backtesting
   */
  private generateMockData(): void {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'];
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2); // 2 years of data

    symbols.forEach(symbol => {
      const data: HistoricalDataPoint[] = [];
      let currentPrice = 100 + Math.random() * 200; // Random starting price

      for (let i = 0; i < 504; i++) { // 2 years of daily data
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        // Generate realistic OHLCV data
        const volatility = 0.02 + Math.random() * 0.03; // 2-5% daily volatility
        const trend = (Math.random() - 0.5) * 0.001; // Small trend component
        const dailyReturn = trend + (Math.random() - 0.5) * volatility;

        const open = currentPrice;
        const close = open * (1 + dailyReturn);
        const high = Math.max(open, close) * (1 + Math.random() * 0.02);
        const low = Math.min(open, close) * (1 - Math.random() * 0.02);
        const volume = Math.floor(1000000 + Math.random() * 5000000);

        data.push({
          timestamp: date.getTime(),
          open,
          high,
          low,
          close,
          volume,
          symbol
        });

        currentPrice = close;
      }

      this.historicalData.set(symbol, data);
    });

    logger.info(`Generated historical data for ${symbols.length} symbols`);
  }

  /**
   * Run backtest with given configuration
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    logger.info(`Starting backtest: ${config.strategy.name}`);
    
    const startTime = Date.now();
    let equity = config.initialCapital;
    let maxEquity = equity;
    const trades: Trade[] = [];
    const equityHistory: BacktestResult['equity'] = [];
    const positions: Map<string, Position> = new Map();

    // Get historical data for all symbols
    const allData: HistoricalDataPoint[] = [];
    config.symbols.forEach(symbol => {
      const symbolData = this.historicalData.get(symbol) || [];
      allData.push(...symbolData);
    });

    // Sort data by timestamp
    allData.sort((a, b) => a.timestamp - b.timestamp);

    // Filter data by date range
    const startTimestamp = new Date(config.startDate).getTime();
    const endTimestamp = new Date(config.endDate).getTime();
    const filteredData = allData.filter(d => 
      d.timestamp >= startTimestamp && d.timestamp <= endTimestamp
    );

    // Group data by symbol for signal generation
    const dataBySymbol: Map<string, HistoricalDataPoint[]> = new Map();
    config.symbols.forEach(symbol => {
      const symbolData = filteredData.filter(d => d.symbol === symbol);
      dataBySymbol.set(symbol, symbolData);
    });

    // Generate signals for each symbol
    const allSignals: TradingSignal[] = [];
    dataBySymbol.forEach((data, symbol) => {
      const signals = config.strategy.signals(data, config.strategy.parameters);
      allSignals.push(...signals);
    });

    // Sort signals by timestamp
    allSignals.sort((a, b) => a.timestamp - b.timestamp);

    // Execute trades based on signals
    for (const signal of allSignals) {
      if (signal.action === 'HOLD') continue;

      const currentPosition = positions.get(signal.symbol);
      const positionSize = Math.min(
        config.maxPositionSize * equity,
        equity * 0.1 // Max 10% per trade for risk management
      );

      if (signal.action === 'BUY' && !currentPosition) {
        // Open long position
        const quantity = Math.floor(positionSize / signal.price);
        if (quantity > 0) {
          const commission = config.commission;
          const slippageCost = signal.price * config.slippage * quantity;
          const totalCost = quantity * signal.price + commission + slippageCost;

          if (totalCost <= equity) {
            const trade: Trade = {
              id: `${signal.symbol}_${signal.timestamp}_BUY`,
              symbol: signal.symbol,
              action: 'BUY',
              quantity,
              price: signal.price * (1 + config.slippage), // Apply slippage
              timestamp: signal.timestamp,
              commission,
              slippage: slippageCost
            };

            trades.push(trade);
            equity -= totalCost;

            positions.set(signal.symbol, {
              symbol: signal.symbol,
              quantity,
              averagePrice: trade.price,
              currentPrice: signal.price,
              marketValue: quantity * signal.price,
              unrealizedPnL: 0,
              weight: (quantity * signal.price) / equity
            });
          }
        }
      } else if (signal.action === 'SELL' && currentPosition) {
        // Close long position
        const commission = config.commission;
        const slippageCost = signal.price * config.slippage * currentPosition.quantity;
        const grossProceeds = currentPosition.quantity * signal.price;
        const netProceeds = grossProceeds - commission - slippageCost;

        const trade: Trade = {
          id: `${signal.symbol}_${signal.timestamp}_SELL`,
          symbol: signal.symbol,
          action: 'SELL',
          quantity: currentPosition.quantity,
          price: signal.price * (1 - config.slippage), // Apply slippage
          timestamp: signal.timestamp,
          commission,
          slippage: slippageCost,
          pnl: netProceeds - (currentPosition.quantity * currentPosition.averagePrice),
          holdingPeriod: signal.timestamp - trades.find(t => 
            t.symbol === signal.symbol && t.action === 'BUY' && 
            t.timestamp < signal.timestamp
          )?.timestamp || 0
        };

        trades.push(trade);
        equity += netProceeds;
        positions.delete(signal.symbol);
      }

      // Update position values and record equity
      positions.forEach(position => {
        const currentData = filteredData.find(d => 
          d.symbol === position.symbol && d.timestamp <= signal.timestamp
        );
        if (currentData) {
          position.currentPrice = currentData.close;
          position.marketValue = position.quantity * position.currentPrice;
          position.unrealizedPnL = position.marketValue - (position.quantity * position.averagePrice);
        }
      });

      const totalPositionValue = Array.from(positions.values())
        .reduce((sum, pos) => sum + pos.marketValue, 0);
      const currentEquity = equity + totalPositionValue;
      maxEquity = Math.max(maxEquity, currentEquity);

      equityHistory.push({
        timestamp: signal.timestamp,
        equity: currentEquity,
        drawdown: (currentEquity - maxEquity) / maxEquity,
        positions: Array.from(positions.values())
      });
    }

    // Calculate final metrics
    const finalEquity = equity + Array.from(positions.values())
      .reduce((sum, pos) => sum + pos.marketValue, 0);

    const summary = this.calculateSummaryMetrics(
      config,
      trades,
      equityHistory,
      finalEquity
    );

    const result: BacktestResult = {
      config,
      summary,
      trades,
      equity: equityHistory,
      monthlyReturns: this.calculateMonthlyReturns(equityHistory),
      metrics: this.calculateAdvancedMetrics(equityHistory, config.riskFreeRate)
    };

    const duration = Date.now() - startTime;
    logger.info(`Backtest completed in ${duration}ms: ${summary.totalReturn.toFixed(2)}% return`);

    return result;
  }

  /**
   * Generate Moving Average Crossover signals
   */
  private generateMACrossoverSignals(
    data: HistoricalDataPoint[], 
    params: Record<string, any>
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];
    const { fastPeriod, slowPeriod } = params;

    if (data.length < slowPeriod) return signals;

    const fastMA = this.calculateSMA(data.map(d => d.close), fastPeriod);
    const slowMA = this.calculateSMA(data.map(d => d.close), slowPeriod);

    for (let i = slowPeriod; i < data.length - 1; i++) {
      const prevFastMA = fastMA[i - 1];
      const currFastMA = fastMA[i];
      const prevSlowMA = slowMA[i - 1];
      const currSlowMA = slowMA[i];

      // Bullish crossover
      if (prevFastMA <= prevSlowMA && currFastMA > currSlowMA) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'BUY',
          confidence: 0.7,
          price: data[i].close,
          reason: `Fast MA (${currFastMA.toFixed(2)}) crossed above Slow MA (${currSlowMA.toFixed(2)})`
        });
      }
      // Bearish crossover
      else if (prevFastMA >= prevSlowMA && currFastMA < currSlowMA) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'SELL',
          confidence: 0.7,
          price: data[i].close,
          reason: `Fast MA (${currFastMA.toFixed(2)}) crossed below Slow MA (${currSlowMA.toFixed(2)})`
        });
      }
    }

    return signals;
  }

  /**
   * Generate RSI Mean Reversion signals
   */
  private generateRSISignals(
    data: HistoricalDataPoint[], 
    params: Record<string, any>
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];
    const { rsiPeriod, oversoldThreshold, overboughtThreshold } = params;

    if (data.length < rsiPeriod + 1) return signals;

    const rsi = this.calculateRSI(data.map(d => d.close), rsiPeriod);

    for (let i = rsiPeriod; i < data.length; i++) {
      const currentRSI = rsi[i - rsiPeriod];

      if (currentRSI < oversoldThreshold) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'BUY',
          confidence: Math.max(0.5, (oversoldThreshold - currentRSI) / oversoldThreshold),
          price: data[i].close,
          reason: `RSI oversold: ${currentRSI.toFixed(2)} < ${oversoldThreshold}`
        });
      } else if (currentRSI > overboughtThreshold) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'SELL',
          confidence: Math.max(0.5, (currentRSI - overboughtThreshold) / (100 - overboughtThreshold)),
          price: data[i].close,
          reason: `RSI overbought: ${currentRSI.toFixed(2)} > ${overboughtThreshold}`
        });
      }
    }

    return signals;
  }

  /**
   * Generate Bollinger Bands signals
   */
  private generateBollingerSignals(
    data: HistoricalDataPoint[], 
    params: Record<string, any>
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];
    const { period, stdDev } = params;

    if (data.length < period) return signals;

    const closes = data.map(d => d.close);
    const sma = this.calculateSMA(closes, period);
    const { upperBand, lowerBand } = this.calculateBollingerBands(closes, period, stdDev);

    for (let i = period; i < data.length; i++) {
      const price = data[i].close;
      const upper = upperBand[i - period];
      const lower = lowerBand[i - period];
      const middle = sma[i - period];

      // Breakout above upper band
      if (price > upper && data[i - 1].close <= upperBand[i - period - 1]) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'BUY',
          confidence: Math.min(0.9, (price - upper) / (upper - middle)),
          price: data[i].close,
          reason: `Price broke above upper Bollinger Band: ${price.toFixed(2)} > ${upper.toFixed(2)}`
        });
      }
      // Breakdown below lower band
      else if (price < lower && data[i - 1].close >= lowerBand[i - period - 1]) {
        signals.push({
          timestamp: data[i].timestamp,
          symbol: data[i].symbol,
          action: 'SELL',
          confidence: Math.min(0.9, (lower - price) / (middle - lower)),
          price: data[i].close,
          reason: `Price broke below lower Bollinger Band: ${price.toFixed(2)} < ${lower.toFixed(2)}`
        });
      }
    }

    return signals;
  }

  /**
   * Generate MACD signals
   */
  private generateMACDSignals(
    data: HistoricalDataPoint[], 
    params: Record<string, any>
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];
    const { fastEMA, slowEMA, signalEMA } = params;

    if (data.length < slowEMA + signalEMA) return signals;

    const closes = data.map(d => d.close);
    const { macdLine, signalLine } = this.calculateMACD(closes, fastEMA, slowEMA, signalEMA);

    for (let i = 1; i < macdLine.length; i++) {
      const prevMACD = macdLine[i - 1];
      const currMACD = macdLine[i];
      const prevSignal = signalLine[i - 1];
      const currSignal = signalLine[i];

      // Bullish crossover
      if (prevMACD <= prevSignal && currMACD > currSignal) {
        signals.push({
          timestamp: data[i + slowEMA + signalEMA - 1].timestamp,
          symbol: data[i + slowEMA + signalEMA - 1].symbol,
          action: 'BUY',
          confidence: Math.min(0.8, Math.abs(currMACD - currSignal) / Math.abs(currMACD)),
          price: data[i + slowEMA + signalEMA - 1].close,
          reason: `MACD bullish crossover: ${currMACD.toFixed(4)} > ${currSignal.toFixed(4)}`
        });
      }
      // Bearish crossover
      else if (prevMACD >= prevSignal && currMACD < currSignal) {
        signals.push({
          timestamp: data[i + slowEMA + signalEMA - 1].timestamp,
          symbol: data[i + slowEMA + signalEMA - 1].symbol,
          action: 'SELL',
          confidence: Math.min(0.8, Math.abs(currMACD - currSignal) / Math.abs(currMACD)),
          price: data[i + slowEMA + signalEMA - 1].close,
          reason: `MACD bearish crossover: ${currMACD.toFixed(4)} < ${currSignal.toFixed(4)}`
        });
      }
    }

    return signals;
  }

  /**
   * Technical indicator calculations
   */
  private calculateSMA(data: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  private calculateEMA(data: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    ema[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }

    return ema;
  }

  private calculateRSI(data: number[], period: number): number[] {
    const rsi: number[] = [];
    const changes: number[] = [];

    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }

    for (let i = period - 1; i < changes.length; i++) {
      const gains = changes.slice(i - period + 1, i + 1).filter(change => change > 0);
      const losses = changes.slice(i - period + 1, i + 1).filter(change => change < 0);

      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0)) / period : 0;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return rsi;
  }

  private calculateBollingerBands(data: number[], period: number, stdDev: number): {
    upperBand: number[];
    lowerBand: number[];
  } {
    const sma = this.calculateSMA(data, period);
    const upperBand: number[] = [];
    const lowerBand: number[] = [];

    for (let i = 0; i < sma.length; i++) {
      const dataSlice = data.slice(i, i + period);
      const variance = dataSlice.reduce((sum, val) => sum + Math.pow(val - sma[i], 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);

      upperBand.push(sma[i] + (standardDeviation * stdDev));
      lowerBand.push(sma[i] - (standardDeviation * stdDev));
    }

    return { upperBand, lowerBand };
  }

  private calculateMACD(data: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): {
    macdLine: number[];
    signalLine: number[];
  } {
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);

    const macdLine: number[] = [];
    for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }

    const signalLine = this.calculateEMA(macdLine, signalPeriod);

    return { macdLine, signalLine };
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummaryMetrics(
    config: BacktestConfig,
    trades: Trade[],
    equityHistory: BacktestResult['equity'],
    finalEquity: number
  ): BacktestResult['summary'] {
    const totalReturn = ((finalEquity - config.initialCapital) / config.initialCapital) * 100;
    
    // Calculate returns for volatility
    const returns: number[] = [];
    for (let i = 1; i < equityHistory.length; i++) {
      const dayReturn = (equityHistory[i].equity - equityHistory[i - 1].equity) / equityHistory[i - 1].equity;
      returns.push(dayReturn);
    }

    const annualizedReturn = Math.pow(finalEquity / config.initialCapital, 252 / equityHistory.length) - 1;
    const volatility = this.calculateVolatility(returns) * Math.sqrt(252);
    const sharpeRatio = volatility > 0 ? (annualizedReturn - config.riskFreeRate) / volatility : 0;

    // Downside deviation for Sortino ratio
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVolatility = this.calculateVolatility(downsideReturns) * Math.sqrt(252);
    const sortinoRatio = downsideVolatility > 0 ? (annualizedReturn - config.riskFreeRate) / downsideVolatility : 0;

    const maxDrawdown = Math.min(...equityHistory.map(e => e.drawdown)) * 100;
    const calmarRatio = maxDrawdown < 0 ? (annualizedReturn * 100) / Math.abs(maxDrawdown) : 0;

    const winningTrades = trades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl && t.pnl < 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.filter(t => t.pnl !== undefined).length) * 100 : 0;

    const grossWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;

    const totalCommissions = trades.reduce((sum, t) => sum + t.commission, 0);
    const totalSlippage = trades.reduce((sum, t) => sum + t.slippage, 0);

    const avgHoldingPeriod = trades
      .filter(t => t.holdingPeriod)
      .reduce((sum, t) => sum + (t.holdingPeriod || 0), 0) / 
      (trades.filter(t => t.holdingPeriod).length || 1);

    return {
      totalReturn,
      annualizedReturn: annualizedReturn * 100,
      volatility: volatility * 100,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      averageHoldingPeriod: avgHoldingPeriod / (1000 * 60 * 60 * 24), // Convert to days
      totalCommissions,
      totalSlippage
    };
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private calculateMonthlyReturns(equityHistory: BacktestResult['equity']): Array<{
    month: string;
    return: number;
  }> {
    const monthlyReturns: Array<{ month: string; return: number }> = [];
    const monthlyData: Map<string, { start: number; end: number }> = new Map();

    equityHistory.forEach(point => {
      const date = new Date(point.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { start: point.equity, end: point.equity });
      } else {
        monthlyData.get(monthKey)!.end = point.equity;
      }
    });

    monthlyData.forEach((data, month) => {
      const monthReturn = ((data.end - data.start) / data.start) * 100;
      monthlyReturns.push({ month, return: monthReturn });
    });

    return monthlyReturns.sort((a, b) => a.month.localeCompare(b.month));
  }

  private calculateAdvancedMetrics(
    equityHistory: BacktestResult['equity'],
    riskFreeRate: number
  ): BacktestResult['metrics'] {
    const returns = [];
    for (let i = 1; i < equityHistory.length; i++) {
      const dayReturn = (equityHistory[i].equity - equityHistory[i - 1].equity) / equityHistory[i - 1].equity;
      returns.push(dayReturn);
    }

    // Value at Risk (95%)
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95Index = Math.floor(returns.length * 0.05);
    const var95 = sortedReturns[var95Index] || 0;

    // Conditional Value at Risk (95%)
    const cvar95 = sortedReturns.slice(0, var95Index + 1).reduce((a, b) => a + b, 0) / (var95Index + 1);

    // Mock beta and alpha (would calculate against benchmark in real implementation)
    const beta = 1.2 + (Math.random() - 0.5) * 0.4; // Random beta around 1.2
    const alpha = (returns.reduce((a, b) => a + b, 0) / returns.length) * 252 - (riskFreeRate + beta * 0.08);

    // Information ratio (mock calculation)
    const trackingError = this.calculateVolatility(returns) * Math.sqrt(252);
    const informationRatio = trackingError > 0 ? alpha / trackingError : 0;

    // Treynor ratio
    const avgReturn = (returns.reduce((a, b) => a + b, 0) / returns.length) * 252;
    const treynorRatio = beta > 0 ? (avgReturn - riskFreeRate) / beta : 0;

    return {
      var95: var95 * 100,
      cvar95: cvar95 * 100,
      beta,
      alpha: alpha * 100,
      informationRatio,
      treynorRatio
    };
  }

  /**
   * Get available strategies
   */
  getStrategies(): TradingStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get historical data for symbols
   */
  getHistoricalData(symbols: string[]): Map<string, HistoricalDataPoint[]> {
    const result = new Map();
    symbols.forEach(symbol => {
      if (this.historicalData.has(symbol)) {
        result.set(symbol, this.historicalData.get(symbol));
      }
    });
    return result;
  }
}