import { 
  MLPredictionOverlay, 
  MLPredictionPoint, 
  IChartingLibraryWidget,
  DrawingToolOptions,
  DrawingPoint 
} from '@/types/tradingview';

export interface MLPredictionConfig {
  modelName: string;
  symbol: string;
  timeframe: string;
  predictionHorizon: number; // minutes
  confidenceThreshold: number; // 0-1
  showConfidenceBands: boolean;
  showPredictionLine: boolean;
  showSupportResistance: boolean;
  updateInterval: number; // ms
}

export interface MLPredictionStyle {
  predictionLine: {
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
  };
  confidenceBands: {
    upperColor: string;
    lowerColor: string;
    fillColor: string;
    transparency: number;
  };
  supportResistance: {
    supportColor: string;
    resistanceColor: string;
    width: number;
  };
  labels: {
    showConfidence: boolean;
    showAccuracy: boolean;
    fontSize: number;
    color: string;
  };
}

export class MLOverlaysManager {
  private chart: IChartingLibraryWidget;
  private overlays: Map<string, MLPredictionOverlay> = new Map();
  private drawnShapes: Map<string, string[]> = new Map(); // overlay id -> shape ids
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Default ML prediction styles
  private static readonly DEFAULT_STYLES: MLPredictionStyle = {
    predictionLine: {
      color: '#fbbf24', // Amber for predictions
      width: 2,
      style: 'solid',
    },
    confidenceBands: {
      upperColor: '#10b981', // Green for upper confidence
      lowerColor: '#ef4444', // Red for lower confidence
      fillColor: '#6b7280', // Gray fill
      transparency: 80,
    },
    supportResistance: {
      supportColor: '#10b981', // Green for support
      resistanceColor: '#ef4444', // Red for resistance
      width: 1,
    },
    labels: {
      showConfidence: true,
      showAccuracy: true,
      fontSize: 12,
      color: '#f8fafc',
    },
  };

  constructor(chart: IChartingLibraryWidget) {
    this.chart = chart;
  }

  /**
   * Add ML prediction overlay to the chart
   */
  async addPredictionOverlay(
    config: MLPredictionConfig,
    predictions: MLPredictionPoint[],
    style: Partial<MLPredictionStyle> = {}
  ): Promise<string> {
    const overlayId = `ml_${config.modelName}_${config.symbol}_${Date.now()}`;
    const mergedStyle = { ...MLOverlaysManager.DEFAULT_STYLES, ...style };

    const overlay: MLPredictionOverlay = {
      id: overlayId,
      symbol: config.symbol,
      timeframe: config.timeframe,
      modelName: config.modelName,
      predictions: predictions.filter(p => p.confidence >= config.confidenceThreshold),
      confidenceBands: this.calculateConfidenceBands(predictions),
      accuracy: this.calculateModelAccuracy(predictions),
      lastUpdate: Date.now(),
    };

    this.overlays.set(overlayId, overlay);

    // Draw prediction visualizations
    await this.drawPredictionOverlay(overlay, config, mergedStyle);

    // Set up real-time updates if needed
    if (config.updateInterval > 0) {
      this.setupRealTimeUpdates(overlayId, config);
    }

    console.log(`[MLOverlays] Added prediction overlay: ${overlayId}`);
    return overlayId;
  }

  /**
   * Update existing prediction overlay
   */
  async updatePredictionOverlay(
    overlayId: string,
    predictions: MLPredictionPoint[]
  ): Promise<void> {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) {
      throw new Error(`Overlay ${overlayId} not found`);
    }

    // Update predictions
    overlay.predictions = predictions;
    overlay.confidenceBands = this.calculateConfidenceBands(predictions);
    overlay.accuracy = this.calculateModelAccuracy(predictions);
    overlay.lastUpdate = Date.now();

    // Redraw overlay
    await this.redrawOverlay(overlayId);

    console.log(`[MLOverlays] Updated prediction overlay: ${overlayId}`);
  }

  /**
   * Remove prediction overlay
   */
  removePredictionOverlay(overlayId: string): boolean {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) {
      return false;
    }

    // Stop real-time updates
    const interval = this.updateIntervals.get(overlayId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(overlayId);
    }

    // Remove drawn shapes
    this.removeOverlayShapes(overlayId);

    // Remove overlay
    this.overlays.delete(overlayId);

    console.log(`[MLOverlays] Removed prediction overlay: ${overlayId}`);
    return true;
  }

  /**
   * Remove all prediction overlays
   */
  removeAllOverlays(): void {
    const overlayIds = Array.from(this.overlays.keys());
    overlayIds.forEach(id => this.removePredictionOverlay(id));
  }

  /**
   * Get overlay information
   */
  getOverlay(overlayId: string): MLPredictionOverlay | undefined {
    return this.overlays.get(overlayId);
  }

  /**
   * Get all overlays
   */
  getAllOverlays(): MLPredictionOverlay[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Get overlays for a specific symbol
   */
  getOverlaysForSymbol(symbol: string): MLPredictionOverlay[] {
    return Array.from(this.overlays.values()).filter(overlay => overlay.symbol === symbol);
  }

  /**
   * Draw prediction overlay on chart
   */
  private async drawPredictionOverlay(
    overlay: MLPredictionOverlay,
    config: MLPredictionConfig,
    style: MLPredictionStyle
  ): Promise<void> {
    const shapeIds: string[] = [];

    try {
      // Draw prediction line if enabled
      if (config.showPredictionLine && overlay.predictions.length > 1) {
        const predictionLineId = await this.drawPredictionLine(overlay, style);
        if (predictionLineId) shapeIds.push(predictionLineId);
      }

      // Draw confidence bands if enabled
      if (config.showConfidenceBands && overlay.confidenceBands) {
        const bandIds = await this.drawConfidenceBands(overlay, style);
        shapeIds.push(...bandIds);
      }

      // Draw support and resistance levels if enabled
      if (config.showSupportResistance) {
        const srIds = await this.drawSupportResistanceLevels(overlay, style);
        shapeIds.push(...srIds);
      }

      // Add prediction labels
      const labelIds = await this.drawPredictionLabels(overlay, style);
      shapeIds.push(...labelIds);

      // Store shape IDs for cleanup
      this.drawnShapes.set(overlay.id, shapeIds);

    } catch (error) {
      console.error(`[MLOverlays] Error drawing overlay ${overlay.id}:`, error);
    }
  }

  /**
   * Draw prediction line
   */
  private async drawPredictionLine(
    overlay: MLPredictionOverlay,
    style: MLPredictionStyle
  ): Promise<string | null> {
    if (overlay.predictions.length < 2) return null;

    try {
      // Create points for the prediction line
      const points: DrawingPoint[] = overlay.predictions
        .filter(p => p.type === 'price')
        .map(p => ({
          time: p.time,
          price: p.value,
        }));

      if (points.length < 2) return null;

      const options: DrawingToolOptions = {
        shape: 'trend_line',
        overrides: {
          'linecolor': style.predictionLine.color,
          'linewidth': style.predictionLine.width,
          'linestyle': this.getLineStyle(style.predictionLine.style),
        },
        lock: true,
        disableSelection: true,
        disableSave: true,
        disableUndo: true,
      };

      // Draw trend line connecting prediction points
      const shapeId = this.chart.createMultipointShape(points, options);
      
      console.log(`[MLOverlays] Drew prediction line: ${shapeId}`);
      return shapeId;

    } catch (error) {
      console.error('[MLOverlays] Error drawing prediction line:', error);
      return null;
    }
  }

  /**
   * Draw confidence bands
   */
  private async drawConfidenceBands(
    overlay: MLPredictionOverlay,
    style: MLPredictionStyle
  ): Promise<string[]> {
    const shapeIds: string[] = [];

    try {
      if (!overlay.confidenceBands.upper.length || !overlay.confidenceBands.lower.length) {
        return shapeIds;
      }

      // Create upper confidence band
      const upperPoints: DrawingPoint[] = overlay.predictions.map((p, index) => ({
        time: p.time,
        price: overlay.confidenceBands.upper[index] || p.value,
      }));

      // Create lower confidence band
      const lowerPoints: DrawingPoint[] = overlay.predictions.map((p, index) => ({
        time: p.time,
        price: overlay.confidenceBands.lower[index] || p.value,
      }));

      // Draw upper band
      if (upperPoints.length > 1) {
        const upperBandId = this.chart.createMultipointShape(upperPoints, {
          shape: 'trend_line',
          overrides: {
            'linecolor': style.confidenceBands.upperColor,
            'linewidth': 1,
            'linestyle': 2, // Dashed line
            'transparency': style.confidenceBands.transparency,
          },
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
        });
        shapeIds.push(upperBandId);
      }

      // Draw lower band
      if (lowerPoints.length > 1) {
        const lowerBandId = this.chart.createMultipointShape(lowerPoints, {
          shape: 'trend_line',
          overrides: {
            'linecolor': style.confidenceBands.lowerColor,
            'linewidth': 1,
            'linestyle': 2, // Dashed line
            'transparency': style.confidenceBands.transparency,
          },
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
        });
        shapeIds.push(lowerBandId);
      }

      // TODO: Draw filled area between bands (requires custom shape or advanced drawing tools)

    } catch (error) {
      console.error('[MLOverlays] Error drawing confidence bands:', error);
    }

    return shapeIds;
  }

  /**
   * Draw support and resistance levels
   */
  private async drawSupportResistanceLevels(
    overlay: MLPredictionOverlay,
    style: MLPredictionStyle
  ): Promise<string[]> {
    const shapeIds: string[] = [];

    try {
      const supportLevels = overlay.predictions.filter(p => p.type === 'support');
      const resistanceLevels = overlay.predictions.filter(p => p.type === 'resistance');

      // Draw support levels
      for (const support of supportLevels) {
        const supportId = this.chart.createShape(
          { time: support.time, price: support.value },
          {
            shape: 'horizontal_line',
            overrides: {
              'linecolor': style.supportResistance.supportColor,
              'linewidth': style.supportResistance.width,
              'linestyle': 0, // Solid line
            },
            text: `Support: ${support.value.toFixed(2)} (${(support.confidence * 100).toFixed(1)}%)`,
            lock: true,
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
          }
        );
        shapeIds.push(supportId);
      }

      // Draw resistance levels
      for (const resistance of resistanceLevels) {
        const resistanceId = this.chart.createShape(
          { time: resistance.time, price: resistance.value },
          {
            shape: 'horizontal_line',
            overrides: {
              'linecolor': style.supportResistance.resistanceColor,
              'linewidth': style.supportResistance.width,
              'linestyle': 0, // Solid line
            },
            text: `Resistance: ${resistance.value.toFixed(2)} (${(resistance.confidence * 100).toFixed(1)}%)`,
            lock: true,
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
          }
        );
        shapeIds.push(resistanceId);
      }

    } catch (error) {
      console.error('[MLOverlays] Error drawing support/resistance levels:', error);
    }

    return shapeIds;
  }

  /**
   * Draw prediction labels
   */
  private async drawPredictionLabels(
    overlay: MLPredictionOverlay,
    style: MLPredictionStyle
  ): Promise<string[]> {
    const shapeIds: string[] = [];

    try {
      if (!style.labels.showConfidence && !style.labels.showAccuracy) {
        return shapeIds;
      }

      // Create a label with model information
      const labelText = [
        `Model: ${overlay.modelName}`,
        style.labels.showAccuracy ? `Accuracy: ${(overlay.accuracy * 100).toFixed(1)}%` : '',
        style.labels.showConfidence ? `Predictions: ${overlay.predictions.length}` : '',
        `Updated: ${new Date(overlay.lastUpdate).toLocaleTimeString()}`,
      ].filter(Boolean).join('\n');

      // Position label in the top-right corner of visible range
      const visibleRange = this.chart.getVisibleRange();
      const labelPosition = {
        time: visibleRange.to - (visibleRange.to - visibleRange.from) * 0.02,
        price: 0, // Will be positioned relative to current price
      };

      const labelId = this.chart.createShape(labelPosition, {
        shape: 'text',
        text: labelText,
        overrides: {
          'color': style.labels.color,
          'fontsize': style.labels.fontSize,
          'bold': true,
        },
        lock: true,
        disableSelection: true,
        disableSave: true,
        disableUndo: true,
      });

      shapeIds.push(labelId);

    } catch (error) {
      console.error('[MLOverlays] Error drawing prediction labels:', error);
    }

    return shapeIds;
  }

  /**
   * Remove all shapes for an overlay
   */
  private removeOverlayShapes(overlayId: string): void {
    const shapeIds = this.drawnShapes.get(overlayId);
    if (shapeIds) {
      shapeIds.forEach(shapeId => {
        try {
          this.chart.removeEntity(shapeId);
        } catch (error) {
          console.warn(`[MLOverlays] Error removing shape ${shapeId}:`, error);
        }
      });
      this.drawnShapes.delete(overlayId);
    }
  }

  /**
   * Redraw overlay (remove and draw again)
   */
  private async redrawOverlay(overlayId: string): Promise<void> {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) return;

    // Remove existing shapes
    this.removeOverlayShapes(overlayId);

    // Redraw with updated data
    const config: MLPredictionConfig = {
      modelName: overlay.modelName,
      symbol: overlay.symbol,
      timeframe: overlay.timeframe,
      predictionHorizon: 60, // Default 1 hour
      confidenceThreshold: 0.5,
      showConfidenceBands: true,
      showPredictionLine: true,
      showSupportResistance: true,
      updateInterval: 0,
    };

    await this.drawPredictionOverlay(overlay, config, MLOverlaysManager.DEFAULT_STYLES);
  }

  /**
   * Set up real-time updates for an overlay
   */
  private setupRealTimeUpdates(overlayId: string, config: MLPredictionConfig): void {
    const interval = setInterval(async () => {
      try {
        // Fetch new predictions from ML service
        const newPredictions = await this.fetchMLPredictions(config);
        if (newPredictions.length > 0) {
          await this.updatePredictionOverlay(overlayId, newPredictions);
        }
      } catch (error) {
        console.error(`[MLOverlays] Error updating overlay ${overlayId}:`, error);
      }
    }, config.updateInterval);

    this.updateIntervals.set(overlayId, interval);
  }

  /**
   * Fetch ML predictions from service (mock implementation)
   */
  private async fetchMLPredictions(config: MLPredictionConfig): Promise<MLPredictionPoint[]> {
    // TODO: Implement actual ML service integration
    // This is a mock implementation
    
    const now = Date.now();
    const predictions: MLPredictionPoint[] = [];

    for (let i = 1; i <= config.predictionHorizon / 15; i++) { // 15-minute intervals
      const time = now + (i * 15 * 60 * 1000); // 15 minutes ahead
      const basePrice = 150; // Mock base price
      const randomWalk = (Math.random() - 0.5) * 10;
      
      predictions.push({
        time,
        value: basePrice + randomWalk,
        confidence: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
        type: 'price',
      });
    }

    return predictions;
  }

  /**
   * Calculate confidence bands
   */
  private calculateConfidenceBands(predictions: MLPredictionPoint[]): {
    upper: number[];
    lower: number[];
  } {
    const upper: number[] = [];
    const lower: number[] = [];

    predictions.forEach(prediction => {
      const volatility = prediction.value * 0.02; // 2% volatility
      const confidenceMultiplier = prediction.confidence;
      
      upper.push(prediction.value + volatility * confidenceMultiplier);
      lower.push(prediction.value - volatility * confidenceMultiplier);
    });

    return { upper, lower };
  }

  /**
   * Calculate model accuracy (mock implementation)
   */
  private calculateModelAccuracy(predictions: MLPredictionPoint[]): number {
    // TODO: Implement actual accuracy calculation based on historical predictions
    return Math.random() * 0.3 + 0.7; // Mock accuracy between 70-100%
  }

  /**
   * Convert line style string to TradingView line style number
   */
  private getLineStyle(style: string): number {
    switch (style) {
      case 'solid': return 0;
      case 'dashed': return 2;
      case 'dotted': return 3;
      default: return 0;
    }
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Clear all update intervals
    this.updateIntervals.forEach(interval => clearInterval(interval));
    this.updateIntervals.clear();

    // Remove all overlays
    this.removeAllOverlays();

    console.log('[MLOverlays] Manager destroyed');
  }
}