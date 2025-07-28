import { ChartTheme, ChartOverrides, StudiesOverrides } from '@/types/tradingview';

/**
 * TradingView Chart Theme Manager
 * Provides professional trading themes optimized for financial analysis
 */
export class ChartThemeManager {
  // Trading color palette
  private static readonly COLORS = {
    // Primary colors
    success: '#10b981', // Green for bullish/gains
    error: '#ef4444',   // Red for bearish/losses
    warning: '#f59e0b', // Amber for warnings/neutral
    info: '#3b82f6',    // Blue for information
    accent: '#8b5cf6',  // Purple for highlights
    
    // Neutral colors
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    
    // Background colors
    bg: {
      primary: '#0a0b0d',
      secondary: '#0f172a',
      tertiary: '#1e293b',
    },
    
    // Text colors
    text: {
      primary: '#f8fafc',
      secondary: '#94a3b8',
      muted: '#64748b',
    },
  };

  // Predefined themes
  public static readonly THEMES: Record<string, ChartTheme> = {
    darkProfessional: {
      name: 'Dark Professional',
      mode: 'dark',
      overrides: {
        // Background and grid
        'paneProperties.background': ChartThemeManager.COLORS.bg.primary,
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': ChartThemeManager.COLORS.neutral[800],
        'paneProperties.vertGridProperties.style': 0,
        'paneProperties.horzGridProperties.color': ChartThemeManager.COLORS.neutral[800],
        'paneProperties.horzGridProperties.style': 0,
        
        // Crosshair
        'paneProperties.crossHairProperties.color': ChartThemeManager.COLORS.neutral[500],
        'paneProperties.crossHairProperties.width': 1,
        'paneProperties.crossHairProperties.style': 2, // Dashed
        
        // Candlestick styling
        'mainSeriesProperties.candleStyle.upColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.downColor': ChartThemeManager.COLORS.error,
        'mainSeriesProperties.candleStyle.drawWick': true,
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.borderDownColor': ChartThemeManager.COLORS.error,
        'mainSeriesProperties.candleStyle.wickUpColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.wickDownColor': ChartThemeManager.COLORS.error,
        
        // Hollow candlesticks
        'mainSeriesProperties.hollowCandleStyle.upColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.hollowCandleStyle.downColor': ChartThemeManager.COLORS.error,
        'mainSeriesProperties.hollowCandleStyle.drawWick': true,
        'mainSeriesProperties.hollowCandleStyle.drawBorder': true,
        
        // Area chart
        'mainSeriesProperties.areaStyle.color1': `${ChartThemeManager.COLORS.info}40`,
        'mainSeriesProperties.areaStyle.color2': `${ChartThemeManager.COLORS.info}10`,
        'mainSeriesProperties.areaStyle.linecolor': ChartThemeManager.COLORS.info,
        'mainSeriesProperties.areaStyle.linewidth': 2,
        
        // Line chart
        'mainSeriesProperties.lineStyle.color': ChartThemeManager.COLORS.info,
        'mainSeriesProperties.lineStyle.linewidth': 2,
        
        // Baseline
        'mainSeriesProperties.baselineStyle.baselineColor': ChartThemeManager.COLORS.neutral[600],
        'mainSeriesProperties.baselineStyle.topFillColor1': `${ChartThemeManager.COLORS.success}20`,
        'mainSeriesProperties.baselineStyle.topFillColor2': `${ChartThemeManager.COLORS.success}05`,
        'mainSeriesProperties.baselineStyle.bottomFillColor1': `${ChartThemeManager.COLORS.error}20`,
        'mainSeriesProperties.baselineStyle.bottomFillColor2': `${ChartThemeManager.COLORS.error}05`,
        
        // Scales and axes
        'scalesProperties.textColor': ChartThemeManager.COLORS.text.secondary,
        'scalesProperties.backgroundColor': ChartThemeManager.COLORS.bg.secondary,
        'scalesProperties.lineColor': ChartThemeManager.COLORS.neutral[800],
        'scalesProperties.scaleSeriesOnly': false,
        
        // Symbol watermark
        'symbolWatermarkProperties.transparency': 90,
        'symbolWatermarkProperties.color': ChartThemeManager.COLORS.neutral[800],
        
        // Volume profile
        'volumeProfile.profile.color': ChartThemeManager.COLORS.neutral[600],
        'volumeProfile.profile.transparency': 70,
        
        // Session breaks
        'paneProperties.sessionBreaksProperties.color': ChartThemeManager.COLORS.neutral[700],
        'paneProperties.sessionBreaksProperties.style': 2,
        'paneProperties.sessionBreaksProperties.width': 1,
      },
      studies_overrides: {
        // Volume
        'volume.volume.color.0': ChartThemeManager.COLORS.error,
        'volume.volume.color.1': ChartThemeManager.COLORS.success,
        'volume.volume.transparency': 70,
        'volume.volume ma.color': ChartThemeManager.COLORS.warning,
        'volume.volume ma.transparency': 30,
        'volume.volume ma.linewidth': 2,
        'volume.show ma': true,
        
        // Moving Averages
        'MA Cross.short:plot.color': ChartThemeManager.COLORS.info,
        'MA Cross.short:plot.linewidth': 2,
        'MA Cross.long:plot.color': ChartThemeManager.COLORS.warning,
        'MA Cross.long:plot.linewidth': 2,
        
        // Exponential Moving Average
        'EMA.plot.color': ChartThemeManager.COLORS.success,
        'EMA.plot.linewidth': 2,
        'EMA.plot.transparency': 0,
        
        // Simple Moving Average
        'SMA.plot.color': ChartThemeManager.COLORS.info,
        'SMA.plot.linewidth': 2,
        'SMA.plot.transparency': 0,
        
        // Bollinger Bands
        'bollinger bands.median.color': ChartThemeManager.COLORS.info,
        'bollinger bands.median.linewidth': 2,
        'bollinger bands.upper.color': ChartThemeManager.COLORS.accent,
        'bollinger bands.upper.linewidth': 1,
        'bollinger bands.lower.color': ChartThemeManager.COLORS.accent,
        'bollinger bands.lower.linewidth': 1,
        'bollinger bands.fill.transparency': 95,
        'bollinger bands.fill.color': ChartThemeManager.COLORS.accent,
        
        // MACD
        'MACD.macd.color': ChartThemeManager.COLORS.info,
        'MACD.macd.linewidth': 2,
        'MACD.signal.color': ChartThemeManager.COLORS.warning,
        'MACD.signal.linewidth': 2,
        'MACD.histogram.color': ChartThemeManager.COLORS.neutral[600],
        'MACD.histogram.transparency': 20,
        
        // RSI
        'RSI.plot.color': ChartThemeManager.COLORS.accent,
        'RSI.plot.linewidth': 2,
        'RSI.hlines.color': ChartThemeManager.COLORS.neutral[600],
        'RSI.hlines.style': 2,
        'RSI.hlines.width': 1,
        'RSI.upper band.color': ChartThemeManager.COLORS.error,
        'RSI.lower band.color': ChartThemeManager.COLORS.success,
        
        // Stochastic
        'Stochastic.%k.color': ChartThemeManager.COLORS.info,
        'Stochastic.%k.linewidth': 2,
        'Stochastic.%d.color': ChartThemeManager.COLORS.warning,
        'Stochastic.%d.linewidth': 2,
        
        // ATR
        'ATR.plot.color': ChartThemeManager.COLORS.warning,
        'ATR.plot.linewidth': 2,
        
        // Williams %R
        'Williams %R.plot.color': ChartThemeManager.COLORS.accent,
        'Williams %R.plot.linewidth': 2,
        
        // CCI
        'CCI.plot.color': ChartThemeManager.COLORS.info,
        'CCI.plot.linewidth': 2,
        
        // Support and Resistance
        'Pivot Points Standard.r3.color': ChartThemeManager.COLORS.error,
        'Pivot Points Standard.r2.color': `${ChartThemeManager.COLORS.error}CC`,
        'Pivot Points Standard.r1.color': `${ChartThemeManager.COLORS.error}99`,
        'Pivot Points Standard.pp.color': ChartThemeManager.COLORS.neutral[500],
        'Pivot Points Standard.s1.color': `${ChartThemeManager.COLORS.success}99`,
        'Pivot Points Standard.s2.color': `${ChartThemeManager.COLORS.success}CC`,
        'Pivot Points Standard.s3.color': ChartThemeManager.COLORS.success,
      },
    },

    lightProfessional: {
      name: 'Light Professional',
      mode: 'light',
      overrides: {
        // Background and grid
        'paneProperties.background': '#ffffff',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': ChartThemeManager.COLORS.neutral[200],
        'paneProperties.vertGridProperties.style': 0,
        'paneProperties.horzGridProperties.color': ChartThemeManager.COLORS.neutral[200],
        'paneProperties.horzGridProperties.style': 0,
        
        // Crosshair
        'paneProperties.crossHairProperties.color': ChartThemeManager.COLORS.neutral[500],
        'paneProperties.crossHairProperties.width': 1,
        'paneProperties.crossHairProperties.style': 2,
        
        // Candlestick styling
        'mainSeriesProperties.candleStyle.upColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.downColor': ChartThemeManager.COLORS.error,
        'mainSeriesProperties.candleStyle.drawWick': true,
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.borderDownColor': ChartThemeManager.COLORS.error,
        'mainSeriesProperties.candleStyle.wickUpColor': ChartThemeManager.COLORS.success,
        'mainSeriesProperties.candleStyle.wickDownColor': ChartThemeManager.COLORS.error,
        
        // Scales and axes
        'scalesProperties.textColor': ChartThemeManager.COLORS.neutral[700],
        'scalesProperties.backgroundColor': ChartThemeManager.COLORS.neutral[50],
        'scalesProperties.lineColor': ChartThemeManager.COLORS.neutral[300],
        
        // Symbol watermark
        'symbolWatermarkProperties.transparency': 95,
        'symbolWatermarkProperties.color': ChartThemeManager.COLORS.neutral[300],
      },
      studies_overrides: {
        // Volume
        'volume.volume.color.0': ChartThemeManager.COLORS.error,
        'volume.volume.color.1': ChartThemeManager.COLORS.success,
        'volume.volume.transparency': 60,
        'volume.volume ma.color': ChartThemeManager.COLORS.warning,
        'volume.volume ma.transparency': 20,
        'volume.volume ma.linewidth': 2,
        
        // Moving Averages and other indicators (similar to dark theme but adapted for light background)
        'EMA.plot.color': '#059669', // Darker green for light background
        'SMA.plot.color': '#2563eb', // Darker blue for light background
        'bollinger bands.median.color': '#2563eb',
        'bollinger bands.upper.color': '#7c3aed',
        'bollinger bands.lower.color': '#7c3aed',
        'MACD.macd.color': '#2563eb',
        'MACD.signal.color': '#d97706',
        'MACD.histogram.color': ChartThemeManager.COLORS.neutral[500],
        'RSI.plot.color': '#7c3aed',
        'RSI.hlines.color': ChartThemeManager.COLORS.neutral[400],
      },
    },

    highContrast: {
      name: 'High Contrast',
      mode: 'dark',
      overrides: {
        'paneProperties.background': '#000000',
        'paneProperties.vertGridProperties.color': '#333333',
        'paneProperties.horzGridProperties.color': '#333333',
        'paneProperties.crossHairProperties.color': '#ffffff',
        'mainSeriesProperties.candleStyle.upColor': '#00ff00',
        'mainSeriesProperties.candleStyle.downColor': '#ff0000',
        'mainSeriesProperties.candleStyle.borderUpColor': '#00ff00',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff0000',
        'mainSeriesProperties.candleStyle.wickUpColor': '#00ff00',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ff0000',
        'scalesProperties.textColor': '#ffffff',
        'scalesProperties.backgroundColor': '#000000',
        'scalesProperties.lineColor': '#333333',
      },
      studies_overrides: {
        'volume.volume.color.0': '#ff0000',
        'volume.volume.color.1': '#00ff00',
        'EMA.plot.color': '#ffff00',
        'bollinger bands.median.color': '#00ffff',
        'bollinger bands.upper.color': '#ff00ff',
        'bollinger bands.lower.color': '#ff00ff',
        'MACD.macd.color': '#00ffff',
        'MACD.signal.color': '#ffff00',
        'RSI.plot.color': '#ff00ff',
      },
    },

    tradingFloor: {
      name: 'Trading Floor',
      mode: 'dark',
      overrides: {
        'paneProperties.background': '#0d1421',
        'paneProperties.vertGridProperties.color': '#1e3a8a20',
        'paneProperties.horzGridProperties.color': '#1e3a8a20',
        'paneProperties.crossHairProperties.color': '#3b82f6',
        'mainSeriesProperties.candleStyle.upColor': '#22c55e',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        'scalesProperties.textColor': '#94a3b8',
        'scalesProperties.backgroundColor': '#1e293b',
        'scalesProperties.lineColor': '#334155',
      },
      studies_overrides: {
        'volume.volume.color.0': '#ef4444',
        'volume.volume.color.1': '#22c55e',
        'volume.volume.transparency': 60,
        'EMA.plot.color': '#fbbf24',
        'bollinger bands.median.color': '#3b82f6',
        'bollinger bands.upper.color': '#8b5cf6',
        'bollinger bands.lower.color': '#8b5cf6',
        'MACD.macd.color': '#06b6d4',
        'MACD.signal.color': '#f59e0b',
        'RSI.plot.color': '#ec4899',
      },
    },
  };

  /**
   * Get theme by name
   */
  static getTheme(themeName: string): ChartTheme | undefined {
    return this.THEMES[themeName];
  }

  /**
   * Get all available themes
   */
  static getAllThemes(): ChartTheme[] {
    return Object.values(this.THEMES);
  }

  /**
   * Get themes by mode
   */
  static getThemesByMode(mode: 'light' | 'dark'): ChartTheme[] {
    return Object.values(this.THEMES).filter(theme => theme.mode === mode);
  }

  /**
   * Create custom theme
   */
  static createCustomTheme(
    name: string,
    mode: 'light' | 'dark',
    overrides: Partial<ChartOverrides>,
    studies_overrides: Partial<StudiesOverrides>
  ): ChartTheme {
    const baseTheme = mode === 'dark' ? this.THEMES.darkProfessional : this.THEMES.lightProfessional;
    
    return {
      name,
      mode,
      overrides: { ...baseTheme.overrides, ...overrides },
      studies_overrides: { ...baseTheme.studies_overrides, ...studies_overrides },
    };
  }

  /**
   * Generate theme from color palette
   */
  static generateThemeFromColors(
    name: string,
    mode: 'light' | 'dark',
    colors: {
      primary: string;
      success: string;
      error: string;
      warning: string;
      background: string;
      surface: string;
      text: string;
    }
  ): ChartTheme {
    const isLight = mode === 'light';
    
    const overrides: ChartOverrides = {
      'paneProperties.background': colors.background,
      'paneProperties.vertGridProperties.color': isLight ? `${colors.text}20` : `${colors.text}30`,
      'paneProperties.horzGridProperties.color': isLight ? `${colors.text}20` : `${colors.text}30`,
      'paneProperties.crossHairProperties.color': colors.text,
      'mainSeriesProperties.candleStyle.upColor': colors.success,
      'mainSeriesProperties.candleStyle.downColor': colors.error,
      'mainSeriesProperties.candleStyle.borderUpColor': colors.success,
      'mainSeriesProperties.candleStyle.borderDownColor': colors.error,
      'mainSeriesProperties.candleStyle.wickUpColor': colors.success,
      'mainSeriesProperties.candleStyle.wickDownColor': colors.error,
      'scalesProperties.textColor': colors.text,
      'scalesProperties.backgroundColor': colors.surface,
      'scalesProperties.lineColor': isLight ? `${colors.text}30` : `${colors.text}40`,
    };

    const studies_overrides: StudiesOverrides = {
      'volume.volume.color.0': colors.error,
      'volume.volume.color.1': colors.success,
      'EMA.plot.color': colors.primary,
      'bollinger bands.median.color': colors.primary,
      'bollinger bands.upper.color': colors.warning,
      'bollinger bands.lower.color': colors.warning,
      'MACD.macd.color': colors.primary,
      'MACD.signal.color': colors.warning,
      'RSI.plot.color': colors.warning,
    };

    return {
      name,
      mode,
      overrides,
      studies_overrides,
    };
  }

  /**
   * Apply theme to widget options
   */
  static applyThemeToOptions(
    options: any,
    theme: ChartTheme
  ): any {
    return {
      ...options,
      theme: theme.mode === 'dark' ? 'Dark' : 'Light',
      overrides: { ...options.overrides, ...theme.overrides },
      studies_overrides: { ...options.studies_overrides, ...theme.studies_overrides },
      loading_screen: {
        backgroundColor: theme.mode === 'dark' ? '#0a0b0d' : '#ffffff',
        foregroundColor: theme.mode === 'dark' ? '#ffffff' : '#000000',
      },
    };
  }

  /**
   * Get recommended theme based on system preference
   */
  static getRecommendedTheme(): ChartTheme {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? this.THEMES.darkProfessional : this.THEMES.lightProfessional;
  }

  /**
   * Get color scheme for theme
   */
  static getColorScheme(theme: ChartTheme): typeof ChartThemeManager.COLORS {
    return this.COLORS;
  }
}