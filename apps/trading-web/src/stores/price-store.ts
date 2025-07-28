import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import Decimal from 'decimal.js';
import { TickData, Symbol, PerformanceMetrics } from '@/types/trading';

interface CircularBuffer<T> {
  data: T[];
  size: number;
  head: number;
  tail: number;
  count: number;
}

interface PriceState {
  // Hot data - current prices
  prices: Map<string, TickData>;
  
  // Historical data - circular buffers for memory efficiency
  priceHistory: Map<string, CircularBuffer<TickData>>;
  
  // Metadata
  symbols: Map<string, Symbol>;
  subscriptions: Map<string, Set<string>>;
  lastUpdate: number;
  
  // Performance tracking
  updateRate: number;
  totalUpdates: number;
  performanceMetrics: PerformanceMetrics;
  
  // Actions
  updatePrice: (tick: TickData) => void;
  updatePrices: (ticks: TickData[]) => void;
  addSymbol: (symbol: Symbol) => void;
  removeSymbol: (symbolId: string) => void;
  subscribe: (symbolId: string, subscriberId: string) => void;
  unsubscribe: (symbolId: string, subscriberId: string) => void;
  
  // Getters
  getPrice: (symbolId: string) => TickData | undefined;
  getPriceHistory: (symbolId: string, limit?: number) => TickData[];
  getSymbol: (symbolId: string) => Symbol | undefined;
  getSpread: (symbolId: string) => Decimal | undefined;
  getSubscribers: (symbolId: string) => Set<string>;
  
  // Utilities
  cleanup: () => void;
  getPerformanceMetrics: () => PerformanceMetrics;
}

// Circular buffer utilities
function createCircularBuffer<T>(size: number): CircularBuffer<T> {
  return {
    data: new Array(size),
    size,
    head: 0,
    tail: 0,
    count: 0,
  };
}

function addToCircularBuffer<T>(buffer: CircularBuffer<T>, item: T): void {
  buffer.data[buffer.head] = item;
  buffer.head = (buffer.head + 1) % buffer.size;
  
  if (buffer.count < buffer.size) {
    buffer.count++;
  } else {
    buffer.tail = (buffer.tail + 1) % buffer.size;
  }
}

function getFromCircularBuffer<T>(buffer: CircularBuffer<T>, limit?: number): T[] {
  const result: T[] = [];
  const actualLimit = limit ? Math.min(limit, buffer.count) : buffer.count;
  
  for (let i = 0; i < actualLimit; i++) {
    const index = (buffer.head - 1 - i + buffer.size) % buffer.size;
    if (buffer.data[index]) {
      result.push(buffer.data[index]);
    }
  }
  
  return result;
}

export const usePriceStore = create<PriceState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      prices: new Map(),
      priceHistory: new Map(),
      symbols: new Map(),
      subscriptions: new Map(),
      lastUpdate: 0,
      updateRate: 0,
      totalUpdates: 0,
      performanceMetrics: {
        frameRate: 60,
        updateRate: 0,
        latency: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        timestamp: Date.now(),
      },

      // Actions
      updatePrice: (tick: TickData) => {
        set((state) => {
          // Update current price
          state.prices.set(tick.symbol, tick);
          
          // Add to history buffer
          if (!state.priceHistory.has(tick.symbol)) {
            state.priceHistory.set(tick.symbol, createCircularBuffer<TickData>(1000));
          }
          const buffer = state.priceHistory.get(tick.symbol)!;
          addToCircularBuffer(buffer, tick);
          
          // Update performance metrics
          state.totalUpdates++;
          state.lastUpdate = tick.timestamp;
          
          // Calculate update rate (updates per second)
          const now = Date.now();
          if (state.performanceMetrics.timestamp) {
            const timeDiff = now - state.performanceMetrics.timestamp;
            if (timeDiff >= 1000) {
              state.updateRate = (state.totalUpdates / timeDiff) * 1000;
              state.performanceMetrics.updateRate = state.updateRate;
              state.performanceMetrics.timestamp = now;
              state.totalUpdates = 0;
            }
          }
        });
      },

      updatePrices: (ticks: TickData[]) => {
        set((state) => {
          const now = Date.now();
          
          ticks.forEach((tick) => {
            // Update current price
            state.prices.set(tick.symbol, tick);
            
            // Add to history buffer
            if (!state.priceHistory.has(tick.symbol)) {
              state.priceHistory.set(tick.symbol, createCircularBuffer<TickData>(1000));
            }
            const buffer = state.priceHistory.get(tick.symbol)!;
            addToCircularBuffer(buffer, tick);
          });
          
          // Update performance metrics
          state.totalUpdates += ticks.length;
          state.lastUpdate = now;
          
          // Calculate batch update rate
          if (state.performanceMetrics.timestamp) {
            const timeDiff = now - state.performanceMetrics.timestamp;
            if (timeDiff >= 1000) {
              state.updateRate = (state.totalUpdates / timeDiff) * 1000;
              state.performanceMetrics.updateRate = state.updateRate;
              state.performanceMetrics.timestamp = now;
              state.totalUpdates = 0;
            }
          }
        });
      },

      addSymbol: (symbol: Symbol) => {
        set((state) => {
          state.symbols.set(symbol.id, symbol);
          if (!state.subscriptions.has(symbol.id)) {
            state.subscriptions.set(symbol.id, new Set());
          }
          if (!state.priceHistory.has(symbol.id)) {
            state.priceHistory.set(symbol.id, createCircularBuffer<TickData>(1000));
          }
        });
      },

      removeSymbol: (symbolId: string) => {
        set((state) => {
          state.symbols.delete(symbolId);
          state.prices.delete(symbolId);
          state.priceHistory.delete(symbolId);
          state.subscriptions.delete(symbolId);
        });
      },

      subscribe: (symbolId: string, subscriberId: string) => {
        set((state) => {
          if (!state.subscriptions.has(symbolId)) {
            state.subscriptions.set(symbolId, new Set());
          }
          state.subscriptions.get(symbolId)!.add(subscriberId);
        });
      },

      unsubscribe: (symbolId: string, subscriberId: string) => {
        set((state) => {
          const subscribers = state.subscriptions.get(symbolId);
          if (subscribers) {
            subscribers.delete(subscriberId);
            if (subscribers.size === 0) {
              state.subscriptions.delete(symbolId);
            }
          }
        });
      },

      // Getters
      getPrice: (symbolId: string) => {
        return get().prices.get(symbolId);
      },

      getPriceHistory: (symbolId: string, limit?: number) => {
        const buffer = get().priceHistory.get(symbolId);
        if (!buffer) return [];
        return getFromCircularBuffer(buffer, limit);
      },

      getSymbol: (symbolId: string) => {
        return get().symbols.get(symbolId);
      },

      getSpread: (symbolId: string) => {
        const tick = get().prices.get(symbolId);
        if (!tick) return undefined;
        return tick.ask.sub(tick.bid);
      },

      getSubscribers: (symbolId: string) => {
        return get().subscriptions.get(symbolId) || new Set();
      },

      // Utilities
      cleanup: () => {
        set((state) => {
          // Clean up old data to prevent memory leaks
          const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
          
          state.priceHistory.forEach((buffer, symbol) => {
            const recentData = getFromCircularBuffer(buffer).filter(
              tick => tick.timestamp > cutoffTime
            );
            
            if (recentData.length === 0) {
              state.priceHistory.delete(symbol);
            } else {
              // Rebuild buffer with recent data
              const newBuffer = createCircularBuffer<TickData>(1000);
              recentData.forEach(tick => addToCircularBuffer(newBuffer, tick));
              state.priceHistory.set(symbol, newBuffer);
            }
          });
        });
      },

      getPerformanceMetrics: () => {
        const state = get();
        return {
          ...state.performanceMetrics,
          updateRate: state.updateRate,
          timestamp: Date.now(),
        };
      },
    }))
  )
);

// Selectors for optimized subscriptions
export const selectPrice = (symbolId: string) => (state: PriceState) => 
  state.prices.get(symbolId);

export const selectPriceValue = (symbolId: string) => (state: PriceState) => 
  state.prices.get(symbolId)?.price.value;

export const selectSpread = (symbolId: string) => (state: PriceState) => {
  const tick = state.prices.get(symbolId);
  return tick ? tick.ask.sub(tick.bid) : undefined;
};

export const selectPriceHistory = (symbolId: string, limit?: number) => (state: PriceState) => {
  const buffer = state.priceHistory.get(symbolId);
  return buffer ? getFromCircularBuffer(buffer, limit) : [];
};

export const selectPerformanceMetrics = (state: PriceState) => state.performanceMetrics;

// Custom hooks for React components
export function usePriceUpdates(symbolId: string) {
  return usePriceStore(selectPrice(symbolId));
}

export function usePriceValue(symbolId: string) {
  return usePriceStore(selectPriceValue(symbolId));
}

export function useSpread(symbolId: string) {
  return usePriceStore(selectSpread(symbolId));
}

export function usePriceHistory(symbolId: string, limit?: number) {
  return usePriceStore(selectPriceHistory(symbolId, limit));
}

export function usePerformanceMetrics() {
  return usePriceStore(selectPerformanceMetrics);
}