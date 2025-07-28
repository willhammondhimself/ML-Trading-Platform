import { TechnicalIndicatorConfig, IChartingLibraryWidget } from '@/types/tradingview';

export interface IndicatorPreset {
  id: string;
  name: string;
  description: string;
  indicators: IndicatorConfig[];
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'custom';
}

export interface IndicatorConfig {
  name: string;
  forceOverlay: boolean;
  lock: boolean;
  inputs: any[];
  styles?: Record<string, any>;
}

export class TechnicalIndicatorsManager {
  private chart: IChartingLibraryWidget;
  private addedIndicators: Map<string, string> = new Map(); // indicator name -> study id

  constructor(chart: IChartingLibraryWidget) {
    this.chart = chart;
  }

  // Predefined indicator presets
  static readonly PRESETS: IndicatorPreset[] = [
    {
      id: 'trend-following',
      name: 'Trend Following',
      description: 'Multiple EMAs with Bollinger Bands for trend identification',
      category: 'trend',
      indicators: [
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [9], // 9-period EMA
        },
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [21], // 21-period EMA
        },
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [50], // 50-period EMA
        },
        {
          name: 'Bollinger Bands',
          forceOverlay: true,
          lock: false,
          inputs: [20, 2], // 20-period, 2 std dev
        },
      ],
    },
    {
      id: 'momentum-analysis',
      name: 'Momentum Analysis',
      description: 'RSI and MACD for momentum and divergence analysis',
      category: 'momentum',
      indicators: [
        {
          name: 'Relative Strength Index',
          forceOverlay: false,
          lock: false,
          inputs: [14], // 14-period RSI
        },
        {
          name: 'MACD',
          forceOverlay: false,
          lock: false,
          inputs: [12, 26, 9], // Fast: 12, Slow: 26, Signal: 9
        },
        {
          name: 'Stochastic',
          forceOverlay: false,
          lock: false,
          inputs: [14, 3, 3], // %K: 14, %K smooth: 3, %D: 3
        },
      ],
    },
    {
      id: 'volatility-suite',
      name: 'Volatility Suite',
      description: 'Bollinger Bands with ATR and volatility indicators',
      category: 'volatility',
      indicators: [
        {
          name: 'Bollinger Bands',
          forceOverlay: true,
          lock: false,
          inputs: [20, 2],
        },
        {
          name: 'Average True Range',
          forceOverlay: false,
          lock: false,
          inputs: [14],
        },
        {
          name: 'Bollinger Bands %B',
          forceOverlay: false,
          lock: false,
          inputs: [20, 2],
        },
        {
          name: 'Bollinger Bands Width',
          forceOverlay: false,
          lock: false,
          inputs: [20, 2],
        },
      ],
    },
    {
      id: 'volume-analysis',
      name: 'Volume Analysis',
      description: 'Volume-based indicators for confirmation',
      category: 'volume',
      indicators: [
        {
          name: 'Volume',
          forceOverlay: false,
          lock: false,
          inputs: [],
        },
        {
          name: 'Volume MA',
          forceOverlay: false,
          lock: false,
          inputs: [20],
        },
        {
          name: 'On Balance Volume',
          forceOverlay: false,
          lock: false,
          inputs: [],
        },
        {
          name: 'Accumulation/Distribution',
          forceOverlay: false,
          lock: false,
          inputs: [],
        },
      ],
    },
    {
      id: 'scalping-setup',
      name: 'Scalping Setup',
      description: 'Fast-moving indicators for short-term trading',
      category: 'custom',
      indicators: [
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [5], // 5-period EMA
        },
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [13], // 13-period EMA
        },
        {
          name: 'Relative Strength Index',
          forceOverlay: false,
          lock: false,
          inputs: [7], // 7-period RSI for quick signals
        },
        {
          name: 'MACD',
          forceOverlay: false,
          lock: false,
          inputs: [5, 13, 4], // Faster MACD settings
        },
        {
          name: 'Volume',
          forceOverlay: false,
          lock: false,
          inputs: [],
        },
      ],
    },
    {
      id: 'swing-trading',
      name: 'Swing Trading',
      description: 'Medium-term indicators for swing trading strategies',
      category: 'custom',
      indicators: [
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [20], // 20-period EMA
        },
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [50], // 50-period EMA
        },
        {
          name: 'Exponential Moving Average',
          forceOverlay: true,
          lock: false,
          inputs: [200], // 200-period EMA
        },
        {
          name: 'Relative Strength Index',
          forceOverlay: false,
          lock: false,
          inputs: [14], // Standard RSI
        },
        {
          name: 'MACD',
          forceOverlay: false,
          lock: false,
          inputs: [12, 26, 9], // Standard MACD
        },
        {
          name: 'Bollinger Bands',
          forceOverlay: true,
          lock: false,
          inputs: [20, 2],
        },
      ],
    },
  ];

  // Individual indicator configurations
  static readonly INDICATORS: Record<string, TechnicalIndicatorConfig> = {
    EMA_9: {
      id: 'ema_9',
      name: 'EMA 9',
      inputs: [
        { id: 'period', name: 'Period', type: 'integer', defval: 9, min: 1, max: 500 },
        { id: 'source', name: 'Source', type: 'source', defval: 'close' },
      ],
      plots: [
        { id: 'plot', type: 'line', title: 'EMA 9', color: '#10b981' },
      ],
      defaults: {
        styles: {
          plot: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
        },
        inputs: {
          period: 9,
          source: 'close',
        },
      },
    },
    EMA_21: {
      id: 'ema_21',
      name: 'EMA 21',
      inputs: [
        { id: 'period', name: 'Period', type: 'integer', defval: 21, min: 1, max: 500 },
        { id: 'source', name: 'Source', type: 'source', defval: 'close' },
      ],
      plots: [
        { id: 'plot', type: 'line', title: 'EMA 21', color: '#3b82f6' },
      ],
      defaults: {
        styles: {
          plot: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
        },
        inputs: {
          period: 21,
          source: 'close',
        },
      },
    },
    RSI: {
      id: 'rsi',
      name: 'RSI',
      inputs: [
        { id: 'period', name: 'RSI Length', type: 'integer', defval: 14, min: 1, max: 500 },
        { id: 'source', name: 'Source', type: 'source', defval: 'close' },
        { id: 'upper', name: 'Upper Band', type: 'integer', defval: 70, min: 50, max: 95 },
        { id: 'lower', name: 'Lower Band', type: 'integer', defval: 30, min: 5, max: 50 },
      ],
      plots: [
        { id: 'plot', type: 'line', title: 'RSI', color: '#8b5cf6' },
      ],
      defaults: {
        styles: {
          plot: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
        },
        inputs: {
          period: 14,
          source: 'close',
          upper: 70,
          lower: 30,
        },
      },
    },
    MACD: {
      id: 'macd',
      name: 'MACD',
      inputs: [
        { id: 'fast_length', name: 'Fast Length', type: 'integer', defval: 12, min: 1, max: 500 },
        { id: 'slow_length', name: 'Slow Length', type: 'integer', defval: 26, min: 1, max: 500 },
        { id: 'signal_length', name: 'Signal Smoothing', type: 'integer', defval: 9, min: 1, max: 50 },
        { id: 'source', name: 'Source', type: 'source', defval: 'close' },
      ],
      plots: [
        { id: 'macd', type: 'line', title: 'MACD', color: '#3b82f6' },
        { id: 'signal', type: 'line', title: 'Signal', color: '#f59e0b' },
        { id: 'histogram', type: 'histogram', title: 'Histogram', color: '#6b7280' },
      ],
      defaults: {
        styles: {
          macd: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
          signal: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
          histogram: {
            linestyle: 0,
            linewidth: 1,
            plottype: 'histogram',
          },
        },
        inputs: {
          fast_length: 12,
          slow_length: 26,
          signal_length: 9,
          source: 'close',
        },
      },
    },
    BOLLINGER_BANDS: {
      id: 'bollinger_bands',
      name: 'Bollinger Bands',
      inputs: [
        { id: 'length', name: 'Length', type: 'integer', defval: 20, min: 1, max: 500 },
        { id: 'source', name: 'Source', type: 'source', defval: 'close' },
        { id: 'stddev', name: 'StdDev', type: 'float', defval: 2.0, min: 0.1, max: 10.0 },
      ],
      plots: [
        { id: 'upper', type: 'line', title: 'Upper', color: '#8b5cf6' },
        { id: 'middle', type: 'line', title: 'Basis', color: '#3b82f6' },
        { id: 'lower', type: 'line', title: 'Lower', color: '#8b5cf6' },
      ],
      defaults: {
        styles: {
          upper: {
            linestyle: 0,
            linewidth: 1,
            plottype: 'line',
          },
          middle: {
            linestyle: 0,
            linewidth: 2,
            plottype: 'line',
          },
          lower: {
            linestyle: 0,
            linewidth: 1,
            plottype: 'line',
          },
        },
        inputs: {
          length: 20,
          source: 'close',
          stddev: 2.0,
        },
      },
    },
  };

  /**
   * Apply a predefined indicator preset
   */
  applyPreset(presetId: string): Promise<string[]> {
    const preset = TechnicalIndicatorsManager.PRESETS.find(p => p.id === presetId);
    if (!preset) {
      throw new Error(`Preset ${presetId} not found`);
    }

    console.log(`[TechnicalIndicators] Applying preset: ${preset.name}`);
    
    return this.addIndicators(preset.indicators);
  }

  /**
   * Add multiple indicators
   */
  async addIndicators(indicators: IndicatorConfig[]): Promise<string[]> {
    const studyIds: string[] = [];
    
    for (const indicator of indicators) {
      try {
        const studyId = await this.addIndicator(indicator);
        studyIds.push(studyId);
      } catch (error) {
        console.warn(`[TechnicalIndicators] Failed to add ${indicator.name}:`, error);
      }
    }
    
    return studyIds;
  }

  /**
   * Add a single indicator
   */
  addIndicator(config: IndicatorConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const studyId = this.chart.createStudy(
          config.name,
          config.forceOverlay,
          config.lock,
          config.inputs,
          (id: string) => {
            console.log(`[TechnicalIndicators] Added ${config.name} with ID: ${id}`);
            this.addedIndicators.set(config.name, id);
            resolve(id);
          }
        );

        // If callback is not called, resolve with the returned ID
        if (studyId) {
          this.addedIndicators.set(config.name, studyId);
          resolve(studyId);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Remove an indicator by name
   */
  removeIndicator(indicatorName: string): boolean {
    const studyId = this.addedIndicators.get(indicatorName);
    if (studyId) {
      try {
        this.chart.removeEntity(studyId);
        this.addedIndicators.delete(indicatorName);
        console.log(`[TechnicalIndicators] Removed ${indicatorName}`);
        return true;
      } catch (error) {
        console.error(`[TechnicalIndicators] Error removing ${indicatorName}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Remove all indicators
   */
  removeAllIndicators(): void {
    const indicators = Array.from(this.addedIndicators.keys());
    indicators.forEach(name => this.removeIndicator(name));
  }

  /**
   * Get list of applied indicators
   */
  getAppliedIndicators(): string[] {
    return Array.from(this.addedIndicators.keys());
  }

  /**
   * Check if an indicator is applied
   */
  hasIndicator(indicatorName: string): boolean {
    return this.addedIndicators.has(indicatorName);
  }

  /**
   * Add common trading indicators quickly
   */
  async addBasicTradingSetup(): Promise<void> {
    const basicIndicators: IndicatorConfig[] = [
      {
        name: 'Volume',
        forceOverlay: false,
        lock: false,
        inputs: [],
      },
      {
        name: 'Exponential Moving Average',
        forceOverlay: true,
        lock: false,
        inputs: [21],
      },
      {
        name: 'Exponential Moving Average',
        forceOverlay: true,
        lock: false,
        inputs: [50],
      },
      {
        name: 'Relative Strength Index',
        forceOverlay: false,
        lock: false,
        inputs: [14],
      },
    ];

    await this.addIndicators(basicIndicators);
  }

  /**
   * Add scalping indicators for short-term trading
   */
  async addScalpingSetup(): Promise<void> {
    await this.applyPreset('scalping-setup');
  }

  /**
   * Add swing trading indicators
   */
  async addSwingTradingSetup(): Promise<void> {
    await this.applyPreset('swing-trading');
  }

  /**
   * Add momentum indicators
   */
  async addMomentumIndicators(): Promise<void> {
    await this.applyPreset('momentum-analysis');
  }

  /**
   * Add volatility indicators
   */
  async addVolatilityIndicators(): Promise<void> {
    await this.applyPreset('volatility-suite');
  }

  /**
   * Get indicator configuration by name
   */
  static getIndicatorConfig(name: string): TechnicalIndicatorConfig | undefined {
    return this.INDICATORS[name.toUpperCase().replace(/\s+/g, '_')];
  }

  /**
   * Get available presets by category
   */
  static getPresetsByCategory(category: string): IndicatorPreset[] {
    return this.PRESETS.filter(preset => preset.category === category);
  }

  /**
   * Get all available categories
   */
  static getCategories(): string[] {
    return [...new Set(this.PRESETS.map(preset => preset.category))];
  }
}