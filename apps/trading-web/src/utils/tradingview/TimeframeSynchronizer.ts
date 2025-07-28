import { TradingViewWidget } from '@/types/tradingview';

export interface SyncEvent {
  type: 'crosshair' | 'zoom' | 'symbol' | 'time';
  sourceId: string;
  data: any;
  timestamp: number;
}

export interface TimeframeInfo {
  id: string;
  interval: string;
  multiplier: number; // minutes per bar
  widget: TradingViewWidget | null;
}

export interface SyncSettings {
  crosshair: boolean;
  zoom: boolean;
  symbol: boolean;
  time: boolean; // Sync time navigation
}

/**
 * Advanced synchronization manager for multi-timeframe charts
 * Handles crosshair, zoom, symbol, and time synchronization across different timeframes
 */
export class TimeframeSynchronizer {
  private timeframes: Map<string, TimeframeInfo> = new Map();
  private syncSettings: SyncSettings;
  private eventListeners: Map<string, (() => void)[]> = new Map();
  private syncInProgress = false;
  private lastSyncTime = 0;
  private syncDebounceMs = 50;

  constructor(syncSettings: SyncSettings) {
    this.syncSettings = { ...syncSettings };
  }

  /**
   * Add a timeframe to synchronization
   */
  addTimeframe(id: string, interval: string, widget: TradingViewWidget | null): void {
    const multiplier = this.getIntervalMultiplier(interval);
    
    this.timeframes.set(id, {
      id,
      interval,
      multiplier,
      widget,
    });

    if (widget) {
      this.setupEventListeners(id, widget);
    }

    console.log(`[TimeframeSynchronizer] Added timeframe ${id} (${interval})`);
  }

  /**
   * Remove a timeframe from synchronization
   */
  removeTimeframe(id: string): void {
    this.cleanupEventListeners(id);
    this.timeframes.delete(id);
    console.log(`[TimeframeSynchronizer] Removed timeframe ${id}`);
  }

  /**
   * Update widget for existing timeframe
   */
  updateWidget(id: string, widget: TradingViewWidget): void {
    const timeframe = this.timeframes.get(id);
    if (timeframe) {
      this.cleanupEventListeners(id);
      timeframe.widget = widget;
      this.setupEventListeners(id, widget);
    }
  }

  /**
   * Update sync settings
   */
  updateSyncSettings(settings: Partial<SyncSettings>): void {
    this.syncSettings = { ...this.syncSettings, ...settings };
    
    // Re-setup listeners if needed
    this.timeframes.forEach((timeframe, id) => {
      if (timeframe.widget) {
        this.cleanupEventListeners(id);
        this.setupEventListeners(id, timeframe.widget);
      }
    });
  }

  /**
   * Manually trigger crosshair sync
   */
  syncCrosshair(sourceId: string, time: number, price: number): void {
    if (!this.syncSettings.crosshair || this.syncInProgress) return;
    
    this.executeSyncWithDebounce(() => {
      this.timeframes.forEach((timeframe, id) => {
        if (id !== sourceId && timeframe.widget) {
          try {
            const chart = timeframe.widget.activeChart();
            // Convert time to appropriate timeframe if needed
            const adjustedTime = this.adjustTimeForTimeframe(time, sourceId, id);
            chart.setCrosshairXY(adjustedTime, price, true);
          } catch (error) {
            console.warn(`[TimeframeSynchronizer] Crosshair sync error for ${id}:`, error);
          }
        }
      });
    });
  }

  /**
   * Manually trigger zoom sync
   */
  syncZoom(sourceId: string, visibleRange: { from: number; to: number }): void {
    if (!this.syncSettings.zoom || this.syncInProgress) return;
    
    this.executeSyncWithDebounce(() => {
      const sourceTimeframe = this.timeframes.get(sourceId);
      if (!sourceTimeframe) return;

      this.timeframes.forEach((timeframe, id) => {
        if (id !== sourceId && timeframe.widget) {
          try {
            const chart = timeframe.widget.activeChart();
            const adjustedRange = this.adjustRangeForTimeframe(
              visibleRange,
              sourceTimeframe,
              timeframe
            );
            chart.setVisibleRange(adjustedRange);
          } catch (error) {
            console.warn(`[TimeframeSynchronizer] Zoom sync error for ${id}:`, error);
          }
        }
      });
    });
  }

  /**
   * Manually trigger symbol sync
   */
  syncSymbol(sourceId: string, symbol: string): void {
    if (!this.syncSettings.symbol || this.syncInProgress) return;
    
    this.executeSyncWithDebounce(() => {
      this.timeframes.forEach((timeframe, id) => {
        if (id !== sourceId && timeframe.widget) {
          try {
            const chart = timeframe.widget.activeChart();
            chart.setSymbol(symbol, () => {
              console.log(`[TimeframeSynchronizer] Symbol synced to ${symbol} for ${id}`);
            });
          } catch (error) {
            console.warn(`[TimeframeSynchronizer] Symbol sync error for ${id}:`, error);
          }
        }
      });
    });
  }

  /**
   * Get synchronization status
   */
  getSyncStatus(): {
    connectedTimeframes: number;
    totalTimeframes: number;
    syncSettings: SyncSettings;
    lastSyncTime: number;
  } {
    const connectedTimeframes = Array.from(this.timeframes.values())
      .filter(tf => tf.widget !== null).length;
    
    return {
      connectedTimeframes,
      totalTimeframes: this.timeframes.size,
      syncSettings: { ...this.syncSettings },
      lastSyncTime: this.lastSyncTime,
    };
  }

  /**
   * Setup event listeners for a widget
   */
  private setupEventListeners(id: string, widget: TradingViewWidget): void {
    const listeners: (() => void)[] = [];

    try {
      widget.onChartReady(() => {
        const chart = widget.activeChart();

        // Crosshair synchronization
        if (this.syncSettings.crosshair) {
          const crosshairListener = chart.onCrosshairMoved().subscribe(null, (params: any) => {
            if (this.syncInProgress) return;
            
            if (params && params.time !== undefined && params.price !== undefined) {
              this.syncCrosshair(id, params.time, params.price);
            }
          });
          
          if (crosshairListener && typeof crosshairListener.unsubscribe === 'function') {
            listeners.push(() => crosshairListener.unsubscribe());
          }
        }

        // Zoom synchronization
        if (this.syncSettings.zoom) {
          const zoomListener = chart.onVisibleRangeChanged().subscribe(null, (range: any) => {
            if (this.syncInProgress) return;
            
            if (range && range.from !== undefined && range.to !== undefined) {
              this.syncZoom(id, range);
            }
          });
          
          if (zoomListener && typeof zoomListener.unsubscribe === 'function') {
            listeners.push(() => zoomListener.unsubscribe());
          }
        }

        // Symbol synchronization
        if (this.syncSettings.symbol) {
          const symbolListener = chart.onSymbolChanged().subscribe(null, (symbolInfo: any) => {
            if (this.syncInProgress) return;
            
            if (symbolInfo && symbolInfo.name) {
              this.syncSymbol(id, symbolInfo.name);
            }
          });
          
          if (symbolListener && typeof symbolListener.unsubscribe === 'function') {
            listeners.push(() => symbolListener.unsubscribe());
          }
        }
      });
    } catch (error) {
      console.error(`[TimeframeSynchronizer] Error setting up listeners for ${id}:`, error);
    }

    this.eventListeners.set(id, listeners);
  }

  /**
   * Cleanup event listeners for a timeframe
   */
  private cleanupEventListeners(id: string): void {
    const listeners = this.eventListeners.get(id);
    if (listeners) {
      listeners.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.warn(`[TimeframeSynchronizer] Error cleaning up listener for ${id}:`, error);
        }
      });
      this.eventListeners.delete(id);
    }
  }

  /**
   * Execute synchronization with debouncing
   */
  private executeSyncWithDebounce(syncFunction: () => void): void {
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncDebounceMs) {
      return;
    }

    this.syncInProgress = true;
    this.lastSyncTime = now;

    try {
      syncFunction();
    } finally {
      setTimeout(() => {
        this.syncInProgress = false;
      }, this.syncDebounceMs);
    }
  }

  /**
   * Convert interval string to minutes multiplier
   */
  private getIntervalMultiplier(interval: string): number {
    const intervalMap: Record<string, number> = {
      '1': 1,
      '3': 3,
      '5': 5,
      '15': 15,
      '30': 30,
      '45': 45,
      '60': 60,
      '120': 120,
      '180': 180,
      '240': 240,
      '1D': 1440,
      '1W': 10080,
      '1M': 43200, // Approximate
    };

    return intervalMap[interval] || 15;
  }

  /**
   * Adjust time for different timeframes
   */
  private adjustTimeForTimeframe(time: number, sourceId: string, targetId: string): number {
    const sourceTimeframe = this.timeframes.get(sourceId);
    const targetTimeframe = this.timeframes.get(targetId);
    
    if (!sourceTimeframe || !targetTimeframe) return time;
    
    // For most cases, time should be the same across timeframes
    // Only adjust if there's a significant difference in granularity
    const ratio = targetTimeframe.multiplier / sourceTimeframe.multiplier;
    
    if (ratio >= 4) {
      // Round to appropriate timeframe boundary
      const targetBarSize = targetTimeframe.multiplier * 60 * 1000; // ms
      return Math.floor(time / targetBarSize) * targetBarSize;
    }
    
    return time;
  }

  /**
   * Adjust visible range for different timeframes
   */
  private adjustRangeForTimeframe(
    range: { from: number; to: number },
    sourceTimeframe: TimeframeInfo,
    targetTimeframe: TimeframeInfo
  ): { from: number; to: number } {
    const ratio = targetTimeframe.multiplier / sourceTimeframe.multiplier;
    
    if (ratio === 1) {
      return range;
    }
    
    // Calculate the center point and duration
    const center = (range.from + range.to) / 2;
    const duration = range.to - range.from;
    
    // Adjust duration based on timeframe ratio
    // Higher timeframes should show more data points
    const adjustedDuration = duration * Math.sqrt(ratio);
    
    return {
      from: center - adjustedDuration / 2,
      to: center + adjustedDuration / 2,
    };
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.timeframes.forEach((_, id) => {
      this.cleanupEventListeners(id);
    });
    
    this.timeframes.clear();
    this.eventListeners.clear();
    
    console.log('[TimeframeSynchronizer] Destroyed');
  }
}