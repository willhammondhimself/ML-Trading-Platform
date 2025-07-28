import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import Decimal from 'decimal.js';
import { OrderBook, OrderBookLevel, MarketDepth, VolumeProfile } from '@/types/trading';

interface OrderBookState {
  // Hot data - current order books
  orderBooks: Map<string, OrderBook>;
  
  // Market depth cache
  marketDepth: Map<string, MarketDepth>;
  
  // Volume profile cache
  volumeProfiles: Map<string, VolumeProfile>;
  
  // Performance tracking
  updateCount: number;
  lastUpdate: number;
  
  // Configuration
  maxLevels: number;
  
  // Actions
  updateOrderBook: (orderBook: OrderBook) => void;
  updateOrderBookLevels: (symbol: string, bids: OrderBookLevel[], asks: OrderBookLevel[]) => void;
  updateMarketDepth: (depth: MarketDepth) => void;
  updateVolumeProfile: (profile: VolumeProfile) => void;
  
  // Getters
  getOrderBook: (symbol: string) => OrderBook | undefined;
  getMarketDepth: (symbol: string, levels?: number) => MarketDepth | undefined;
  getVolumeProfile: (symbol: string) => VolumeProfile | undefined;
  getBestBid: (symbol: string) => OrderBookLevel | undefined;
  getBestAsk: (symbol: string) => OrderBookLevel | undefined;
  getSpread: (symbol: string) => Decimal | undefined;
  getMidPrice: (symbol: string) => Decimal | undefined;
  getTotalBidVolume: (symbol: string, levels?: number) => Decimal;
  getTotalAskVolume: (symbol: string, levels?: number) => Decimal;
  
  // Utilities
  cleanup: () => void;
  computeMarketDepth: (symbol: string, levels: number) => MarketDepth | undefined;
}

// Utility functions for order book operations
function sortOrderBookLevels(levels: OrderBookLevel[], isAscending: boolean): OrderBookLevel[] {
  return [...levels].sort((a, b) => {
    const comparison = a.price.comparedTo(b.price);
    return isAscending ? comparison : -comparison;
  });
}

function mergeLevels(existing: OrderBookLevel[], updates: OrderBookLevel[]): OrderBookLevel[] {
  const levelMap = new Map<string, OrderBookLevel>();
  
  // Add existing levels
  existing.forEach(level => {
    levelMap.set(level.price.toString(), level);
  });
  
  // Apply updates (zero volume = remove level)
  updates.forEach(level => {
    if (level.volume.isZero()) {
      levelMap.delete(level.price.toString());
    } else {
      levelMap.set(level.price.toString(), level);
    }
  });
  
  return Array.from(levelMap.values());
}

function trimLevels(levels: OrderBookLevel[], maxLevels: number): OrderBookLevel[] {
  return levels.slice(0, maxLevels);
}

function computeTotalVolume(levels: OrderBookLevel[], maxLevels?: number): Decimal {
  const actualLevels = maxLevels ? levels.slice(0, maxLevels) : levels;
  return actualLevels.reduce((total, level) => total.add(level.volume), new Decimal(0));
}

export const useOrderBookStore = create<OrderBookState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      orderBooks: new Map(),
      marketDepth: new Map(),
      volumeProfiles: new Map(),
      updateCount: 0,
      lastUpdate: 0,
      maxLevels: 20,

      // Actions
      updateOrderBook: (orderBook: OrderBook) => {
        set((state) => {
          // Sort and trim levels
          const sortedBids = sortOrderBookLevels(orderBook.bids, false); // Descending
          const sortedAsks = sortOrderBookLevels(orderBook.asks, true);  // Ascending
          
          const processedOrderBook: OrderBook = {
            ...orderBook,
            bids: trimLevels(sortedBids, state.maxLevels),
            asks: trimLevels(sortedAsks, state.maxLevels),
          };
          
          state.orderBooks.set(orderBook.symbol, processedOrderBook);
          state.updateCount++;
          state.lastUpdate = orderBook.timestamp;
          
          // Invalidate cached market depth
          state.marketDepth.delete(orderBook.symbol);
        });
      },

      updateOrderBookLevels: (symbol: string, bids: OrderBookLevel[], asks: OrderBookLevel[]) => {
        set((state) => {
          const existing = state.orderBooks.get(symbol);
          if (!existing) {
            // Create new order book if it doesn't exist
            const newOrderBook: OrderBook = {
              symbol,
              bids: trimLevels(sortOrderBookLevels(bids, false), state.maxLevels),
              asks: trimLevels(sortOrderBookLevels(asks, true), state.maxLevels),
              timestamp: Date.now(),
              sequence: 0,
            };
            state.orderBooks.set(symbol, newOrderBook);
          } else {
            // Merge with existing levels
            const mergedBids = mergeLevels(existing.bids, bids);
            const mergedAsks = mergeLevels(existing.asks, asks);
            
            const updatedOrderBook: OrderBook = {
              ...existing,
              bids: trimLevels(sortOrderBookLevels(mergedBids, false), state.maxLevels),
              asks: trimLevels(sortOrderBookLevels(mergedAsks, true), state.maxLevels),
              timestamp: Date.now(),
              sequence: existing.sequence + 1,
            };
            
            state.orderBooks.set(symbol, updatedOrderBook);
          }
          
          state.updateCount++;
          state.lastUpdate = Date.now();
          
          // Invalidate cached market depth
          state.marketDepth.delete(symbol);
        });
      },

      updateMarketDepth: (depth: MarketDepth) => {
        set((state) => {
          state.marketDepth.set(depth.symbol, depth);
        });
      },

      updateVolumeProfile: (profile: VolumeProfile) => {
        set((state) => {
          state.volumeProfiles.set(profile.symbol, profile);
        });
      },

      // Getters
      getOrderBook: (symbol: string) => {
        return get().orderBooks.get(symbol);
      },

      getMarketDepth: (symbol: string, levels = 10) => {
        const state = get();
        const cached = state.marketDepth.get(symbol);
        
        if (cached && cached.levels >= levels) {
          return cached;
        }
        
        // Compute market depth if not cached or insufficient levels
        return state.computeMarketDepth(symbol, levels);
      },

      getVolumeProfile: (symbol: string) => {
        return get().volumeProfiles.get(symbol);
      },

      getBestBid: (symbol: string) => {
        const orderBook = get().orderBooks.get(symbol);
        return orderBook?.bids[0];
      },

      getBestAsk: (symbol: string) => {
        const orderBook = get().orderBooks.get(symbol);
        return orderBook?.asks[0];
      },

      getSpread: (symbol: string) => {
        const state = get();
        const bestBid = state.getBestBid(symbol);
        const bestAsk = state.getBestAsk(symbol);
        
        if (!bestBid || !bestAsk) return undefined;
        return bestAsk.price.sub(bestBid.price);
      },

      getMidPrice: (symbol: string) => {
        const state = get();
        const bestBid = state.getBestBid(symbol);
        const bestAsk = state.getBestAsk(symbol);
        
        if (!bestBid || !bestAsk) return undefined;
        return bestBid.price.add(bestAsk.price).div(2);
      },

      getTotalBidVolume: (symbol: string, levels?: number) => {
        const orderBook = get().orderBooks.get(symbol);
        if (!orderBook) return new Decimal(0);
        return computeTotalVolume(orderBook.bids, levels);
      },

      getTotalAskVolume: (symbol: string, levels?: number) => {
        const orderBook = get().orderBooks.get(symbol);
        if (!orderBook) return new Decimal(0);
        return computeTotalVolume(orderBook.asks, levels);
      },

      // Utilities
      cleanup: () => {
        set((state) => {
          const cutoffTime = Date.now() - 60 * 60 * 1000; // 1 hour
          
          // Clean up stale order books
          state.orderBooks.forEach((orderBook, symbol) => {
            if (orderBook.timestamp < cutoffTime) {
              state.orderBooks.delete(symbol);
              state.marketDepth.delete(symbol);
              state.volumeProfiles.delete(symbol);
            }
          });
        });
      },

      computeMarketDepth: (symbol: string, levels: number) => {
        const orderBook = get().orderBooks.get(symbol);
        if (!orderBook) return undefined;
        
        const bids = orderBook.bids.slice(0, levels);
        const asks = orderBook.asks.slice(0, levels);
        
        const totalBidVolume = computeTotalVolume(bids);
        const totalAskVolume = computeTotalVolume(asks);
        
        const depth: MarketDepth = {
          symbol,
          levels,
          bids,
          asks,
          totalBidVolume,
          totalAskVolume,
          timestamp: orderBook.timestamp,
        };
        
        // Cache the computed depth
        set((state) => {
          state.marketDepth.set(symbol, depth);
        });
        
        return depth;
      },
    }))
  )
);

// Selectors for optimized subscriptions
export const selectOrderBook = (symbol: string) => (state: OrderBookState) =>
  state.orderBooks.get(symbol);

export const selectBestBid = (symbol: string) => (state: OrderBookState) => {
  const orderBook = state.orderBooks.get(symbol);
  return orderBook?.bids[0];
};

export const selectBestAsk = (symbol: string) => (state: OrderBookState) => {
  const orderBook = state.orderBooks.get(symbol);
  return orderBook?.asks[0];
};

export const selectSpread = (symbol: string) => (state: OrderBookState) => {
  const orderBook = state.orderBooks.get(symbol);
  if (!orderBook?.bids[0] || !orderBook?.asks[0]) return undefined;
  return orderBook.asks[0].price.sub(orderBook.bids[0].price);
};

export const selectMidPrice = (symbol: string) => (state: OrderBookState) => {
  const orderBook = state.orderBooks.get(symbol);
  if (!orderBook?.bids[0] || !orderBook?.asks[0]) return undefined;
  return orderBook.bids[0].price.add(orderBook.asks[0].price).div(2);
};

export const selectMarketDepth = (symbol: string, levels: number = 10) => (state: OrderBookState) =>
  state.getMarketDepth(symbol, levels);

export const selectTopOfBook = (symbol: string) => (state: OrderBookState) => {
  const orderBook = state.orderBooks.get(symbol);
  if (!orderBook) return null;
  
  return {
    bid: orderBook.bids[0],
    ask: orderBook.asks[0],
    spread: orderBook.bids[0] && orderBook.asks[0] 
      ? orderBook.asks[0].price.sub(orderBook.bids[0].price)
      : undefined,
    midPrice: orderBook.bids[0] && orderBook.asks[0]
      ? orderBook.bids[0].price.add(orderBook.asks[0].price).div(2)
      : undefined,
  };
};

// Custom hooks for React components
export function useOrderBook(symbol: string) {
  return useOrderBookStore(selectOrderBook(symbol));
}

export function useBestBid(symbol: string) {
  return useOrderBookStore(selectBestBid(symbol));
}

export function useBestAsk(symbol: string) {
  return useOrderBookStore(selectBestAsk(symbol));
}

export function useSpread(symbol: string) {
  return useOrderBookStore(selectSpread(symbol));
}

export function useMidPrice(symbol: string) {
  return useOrderBookStore(selectMidPrice(symbol));
}

export function useMarketDepth(symbol: string, levels: number = 10) {
  return useOrderBookStore(selectMarketDepth(symbol, levels));
}

export function useTopOfBook(symbol: string) {
  return useOrderBookStore(selectTopOfBook(symbol));
}