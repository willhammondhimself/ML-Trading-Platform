import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import Decimal from 'decimal.js';
import { 
  Position, 
  Order, 
  Trade, 
  PortfolioValue, 
  RiskMetrics,
  PortfolioStore 
} from '@/types/trading';

interface PortfolioState {
  // Core portfolio data
  positions: Map<string, Position>;
  orders: Map<string, Order>;
  trades: Trade[];
  portfolioValue: PortfolioValue;
  riskMetrics: RiskMetrics;
  
  // Performance tracking
  lastUpdate: number;
  updateCount: number;
  
  // Configuration
  maxTradeHistory: number;
  
  // Actions
  updatePosition: (position: Position) => void;
  updateOrder: (order: Order) => void;
  addTrade: (trade: Trade) => void;
  updatePortfolioValue: (value: PortfolioValue) => void;
  updateRiskMetrics: (metrics: RiskMetrics) => void;
  removePosition: (positionId: string) => void;
  removeOrder: (orderId: string) => void;
  
  // Getters
  getPosition: (symbol: string) => Position | undefined;
  getPositions: () => Position[];
  getOpenOrders: () => Order[];
  getOrdersBySymbol: (symbol: string) => Order[];
  getTradesBySymbol: (symbol: string) => Trade[];
  getRecentTrades: (limit?: number) => Trade[];
  getTotalPnL: () => Decimal;
  getDayPnL: () => Decimal;
  getTotalValue: () => Decimal;
  getExposure: () => Decimal;
  
  // Calculations
  calculatePositionPnL: (symbol: string, currentPrice: Decimal) => Decimal;
  calculatePortfolioValue: (prices: Map<string, Decimal>) => PortfolioValue;
  calculateRiskMetrics: () => RiskMetrics;
  
  // Utilities
  cleanup: () => void;
  reset: () => void;
}

// Initial state values
const initialPortfolioValue: PortfolioValue = {
  totalValue: new Decimal(100000), // Starting with 100k
  cashBalance: new Decimal(100000),
  positionsValue: new Decimal(0),
  unrealizedPnL: new Decimal(0),
  realizedPnL: new Decimal(0),
  dayPnL: new Decimal(0),
  dayPnLPercent: new Decimal(0),
  timestamp: Date.now(),
};

const initialRiskMetrics: RiskMetrics = {
  var95: new Decimal(0),
  var99: new Decimal(0),
  sharpeRatio: new Decimal(0),
  maxDrawdown: new Decimal(0),
  exposure: new Decimal(0),
  leverage: new Decimal(1),
  timestamp: Date.now(),
};

export const usePortfolioStore = create<PortfolioState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      positions: new Map(),
      orders: new Map(),
      trades: [],
      portfolioValue: initialPortfolioValue,
      riskMetrics: initialRiskMetrics,
      lastUpdate: 0,
      updateCount: 0,
      maxTradeHistory: 1000,

      // Actions
      updatePosition: (position: Position) => {
        set((state) => {
          state.positions.set(position.id, position);
          state.lastUpdate = position.timestamp;
          state.updateCount++;
        });
      },

      updateOrder: (order: Order) => {
        set((state) => {
          state.orders.set(order.id, order);
          state.lastUpdate = order.timestamp;
          state.updateCount++;
        });
      },

      addTrade: (trade: Trade) => {
        set((state) => {
          state.trades.unshift(trade); // Add to beginning for chronological order
          
          // Limit trade history
          if (state.trades.length > state.maxTradeHistory) {
            state.trades = state.trades.slice(0, state.maxTradeHistory);
          }
          
          state.lastUpdate = trade.timestamp;
          state.updateCount++;
        });
      },

      updatePortfolioValue: (value: PortfolioValue) => {
        set((state) => {
          state.portfolioValue = value;
          state.lastUpdate = value.timestamp;
          state.updateCount++;
        });
      },

      updateRiskMetrics: (metrics: RiskMetrics) => {
        set((state) => {
          state.riskMetrics = metrics;
          state.lastUpdate = metrics.timestamp;
        });
      },

      removePosition: (positionId: string) => {
        set((state) => {
          state.positions.delete(positionId);
          state.lastUpdate = Date.now();
        });
      },

      removeOrder: (orderId: string) => {
        set((state) => {
          state.orders.delete(orderId);
          state.lastUpdate = Date.now();
        });
      },

      // Getters
      getPosition: (symbol: string) => {
        const state = get();
        return Array.from(state.positions.values()).find(p => p.symbol === symbol);
      },

      getPositions: () => {
        return Array.from(get().positions.values());
      },

      getOpenOrders: () => {
        return Array.from(get().orders.values()).filter(order => 
          order.status === 'open' || order.status === 'pending'
        );
      },

      getOrdersBySymbol: (symbol: string) => {
        return Array.from(get().orders.values()).filter(order => order.symbol === symbol);
      },

      getTradesBySymbol: (symbol: string) => {
        return get().trades.filter(trade => trade.symbol === symbol);
      },

      getRecentTrades: (limit = 50) => {
        return get().trades.slice(0, limit);
      },

      getTotalPnL: () => {
        const state = get();
        return state.portfolioValue.unrealizedPnL.add(state.portfolioValue.realizedPnL);
      },

      getDayPnL: () => {
        return get().portfolioValue.dayPnL;
      },

      getTotalValue: () => {
        return get().portfolioValue.totalValue;
      },

      getExposure: () => {
        return get().riskMetrics.exposure;
      },

      // Calculations
      calculatePositionPnL: (symbol: string, currentPrice: Decimal) => {
        const position = get().getPosition(symbol);
        if (!position) return new Decimal(0);
        
        const priceDiff = currentPrice.sub(position.avgPrice);
        const multiplier = position.side === 'long' ? 1 : -1;
        
        return priceDiff.mul(position.quantity).mul(multiplier);
      },

      calculatePortfolioValue: (prices: Map<string, Decimal>) => {
        const state = get();
        let totalPositionsValue = new Decimal(0);
        let totalUnrealizedPnL = new Decimal(0);
        
        // Calculate total value of all positions
        state.positions.forEach((position) => {
          const currentPrice = prices.get(position.symbol);
          if (currentPrice) {
            const positionValue = currentPrice.mul(position.quantity);
            totalPositionsValue = totalPositionsValue.add(positionValue);
            
            const unrealizedPnL = state.calculatePositionPnL(position.symbol, currentPrice);
            totalUnrealizedPnL = totalUnrealizedPnL.add(unrealizedPnL);
          }
        });
        
        const totalValue = state.portfolioValue.cashBalance.add(totalPositionsValue);
        const dayPnLPercent = totalValue.gt(0) 
          ? state.portfolioValue.dayPnL.div(totalValue).mul(100)
          : new Decimal(0);
        
        return {
          totalValue,
          cashBalance: state.portfolioValue.cashBalance,
          positionsValue: totalPositionsValue,
          unrealizedPnL: totalUnrealizedPnL,
          realizedPnL: state.portfolioValue.realizedPnL,
          dayPnL: state.portfolioValue.dayPnL,
          dayPnLPercent,
          timestamp: Date.now(),
        };
      },

      calculateRiskMetrics: () => {
        const state = get();
        const positions = Array.from(state.positions.values());
        
        // Calculate total exposure
        const totalExposure = positions.reduce((sum, position) => {
          const positionValue = position.avgPrice.mul(position.quantity);
          return sum.add(positionValue);
        }, new Decimal(0));
        
        // Calculate leverage
        const leverage = state.portfolioValue.totalValue.gt(0)
          ? totalExposure.div(state.portfolioValue.totalValue)
          : new Decimal(1);
        
        // Simplified risk calculations (in production, use more sophisticated models)
        const var95 = totalExposure.mul(0.05); // 5% of exposure
        const var99 = totalExposure.mul(0.01); // 1% of exposure
        
        // Calculate Sharpe ratio (simplified)
        const totalReturn = state.getTotalPnL();
        const sharpeRatio = totalReturn.div(Math.max(totalExposure.toNumber(), 1));
        
        // Calculate max drawdown (simplified)
        const maxDrawdown = state.portfolioValue.dayPnL.isNegative() 
          ? state.portfolioValue.dayPnL.abs()
          : new Decimal(0);
        
        return {
          var95,
          var99,
          sharpeRatio,
          maxDrawdown,
          exposure: totalExposure,
          leverage,
          timestamp: Date.now(),
        };
      },

      // Utilities
      cleanup: () => {
        set((state) => {
          const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
          
          // Clean up old trades
          state.trades = state.trades.filter(trade => trade.timestamp > cutoffTime);
          
          // Clean up filled/cancelled orders
          const activeStatuses = new Set(['open', 'pending']);
          state.orders.forEach((order, orderId) => {
            if (!activeStatuses.has(order.status) && order.timestamp < cutoffTime) {
              state.orders.delete(orderId);
            }
          });
        });
      },

      reset: () => {
        set((state) => {
          state.positions.clear();
          state.orders.clear();
          state.trades = [];
          state.portfolioValue = initialPortfolioValue;
          state.riskMetrics = initialRiskMetrics;
          state.lastUpdate = 0;
          state.updateCount = 0;
        });
      },
    }))
  )
);

// Selectors for optimized subscriptions
export const selectPositions = (state: PortfolioState) => Array.from(state.positions.values());
export const selectOpenOrders = (state: PortfolioState) => 
  Array.from(state.orders.values()).filter(order => 
    order.status === 'open' || order.status === 'pending'
  );
export const selectRecentTrades = (limit: number = 10) => (state: PortfolioState) =>
  state.trades.slice(0, limit);
export const selectPortfolioValue = (state: PortfolioState) => state.portfolioValue;
export const selectRiskMetrics = (state: PortfolioState) => state.riskMetrics;
export const selectTotalPnL = (state: PortfolioState) => 
  state.portfolioValue.unrealizedPnL.add(state.portfolioValue.realizedPnL);
export const selectPositionBySymbol = (symbol: string) => (state: PortfolioState) =>
  Array.from(state.positions.values()).find(p => p.symbol === symbol);

// Custom hooks for React components
export function usePositions() {
  return usePortfolioStore(selectPositions);
}

export function useOpenOrders() {
  return usePortfolioStore(selectOpenOrders);
}

export function useRecentTrades(limit?: number) {
  return usePortfolioStore(selectRecentTrades(limit || 10));
}

export function usePortfolioValue() {
  return usePortfolioStore(selectPortfolioValue);
}

export function useRiskMetrics() {
  return usePortfolioStore(selectRiskMetrics);
}

export function useTotalPnL() {
  return usePortfolioStore(selectTotalPnL);
}

export function usePositionBySymbol(symbol: string) {
  return usePortfolioStore(selectPositionBySymbol(symbol));
}