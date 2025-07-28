import Decimal from 'decimal.js';

// Core Trading Types
export interface Price {
  value: Decimal;
  timestamp: number;
  currency: string;
}

export interface Volume {
  value: Decimal;
  timestamp: number;
}

export interface Symbol {
  id: string;
  name: string;
  exchange: string;
  currency: string;
  type: 'stock' | 'crypto' | 'forex' | 'commodity' | 'option' | 'future';
}

// Market Data Types
export interface TickData {
  symbol: string;
  price: Price;
  volume: Volume;
  bid: Decimal;
  ask: Decimal;
  spread: Decimal;
  timestamp: number;
  sequence: number;
}

export interface OrderBookLevel {
  price: Decimal;
  volume: Decimal;
  count: number;
  timestamp: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  sequence: number;
}

export interface MarketDepth {
  symbol: string;
  levels: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  totalBidVolume: Decimal;
  totalAskVolume: Decimal;
  timestamp: number;
}

// Trading Data Types
export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: Decimal;
  avgPrice: Decimal;
  currentPrice: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  timestamp: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: Decimal;
  price?: Decimal;
  stopPrice?: Decimal;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  filledQuantity: Decimal;
  remainingQuantity: Decimal;
  avgFillPrice?: Decimal;
  timestamp: number;
  expiryTime?: number;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: Decimal;
  price: Decimal;
  fee: Decimal;
  timestamp: number;
}

// Portfolio Types
export interface PortfolioValue {
  totalValue: Decimal;
  cashBalance: Decimal;
  positionsValue: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  dayPnL: Decimal;
  dayPnLPercent: Decimal;
  timestamp: number;
}

export interface RiskMetrics {
  var95: Decimal; // Value at Risk 95%
  var99: Decimal; // Value at Risk 99%
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  exposure: Decimal;
  leverage: Decimal;
  timestamp: number;
}

// ML Prediction Types
export interface MLPrediction {
  symbol: string;
  predictionType: 'price' | 'trend' | 'volatility' | 'volume';
  value: Decimal;
  confidence: number; // 0-1
  horizon: number; // minutes
  modelName: string;
  features: Record<string, number>;
  timestamp: number;
  expiryTime: number;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'tick' | 'orderbook' | 'trade' | 'order' | 'position' | 'portfolio' | 'prediction' | 'heartbeat' |
        'ml_prediction' | 'ml_metrics' | 'ml_features' | 'ml_accuracy' | 'ml_comparison' | 'ml_summary' | 'ml_alert';
  data: any;
  timestamp: number;
  sequence?: number;
}

export interface WebSocketConnection {
  id: string;
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastHeartbeat: number;
  reconnectAttempts: number;
  subscriptions: Set<string>;
}

// ML Analytics WebSocket Message Types
export interface MLPredictionMessage extends WebSocketMessage {
  type: 'ml_prediction';
  data: {
    action: 'new' | 'update' | 'resolve' | 'expire';
    prediction: MLPrediction;
    actualValue?: Decimal;
  };
}

export interface MLMetricsMessage extends WebSocketMessage {
  type: 'ml_metrics';
  data: {
    modelName: string;
    symbol?: string;
    timeframe: string;
    metrics: {
      accuracy: number;
      precision: number;
      recall: number;
      f1Score: number;
      roi: number;
      sharpeRatio: number;
      totalPredictions: number;
      calculatedAt: number;
    };
  };
}

export interface MLFeaturesMessage extends WebSocketMessage {
  type: 'ml_features';
  data: {
    modelName: string;
    features: Array<{
      name: string;
      importance: number;
      category: string;
      value: number;
    }>;
  };
}

export interface MLAccuracyMessage extends WebSocketMessage {
  type: 'ml_accuracy';
  data: {
    modelName: string;
    symbol: string;
    timeframe: string;
    accuracyPoint: {
      timestamp: number;
      accuracy: number;
      predictions: number;
      sampleSize: number;
    };
  };
}

export interface MLComparisonMessage extends WebSocketMessage {
  type: 'ml_comparison';
  data: {
    comparisonId: string;
    models: Array<{
      modelName: string;
      accuracy: number;
      roi: number;
      rank: number;
      tier: 'A' | 'B' | 'C' | 'D';
    }>;
    generatedAt: number;
  };
}

export interface MLSummaryMessage extends WebSocketMessage {
  type: 'ml_summary';
  data: {
    totalPredictions: number;
    activePredictions: number;
    overallAccuracy: number;
    bestModel: string;
    recentActivity: number;
    alerts: number;
  };
}

export interface MLAlertMessage extends WebSocketMessage {
  type: 'ml_alert';
  data: {
    alertType: 'accuracy_drop' | 'model_error' | 'feature_drift' | 'performance_improvement';
    severity: 'low' | 'medium' | 'high' | 'critical';
    modelName: string;
    symbol?: string;
    message: string;
    threshold?: number;
    currentValue?: number;
    recommendedAction?: string;
  };
}

// Chart Types
export interface CandlestickData {
  timestamp: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export interface VolumeProfileLevel {
  price: Decimal;
  volume: Decimal;
  buyVolume: Decimal;
  sellVolume: Decimal;
  trades: number;
}

export interface VolumeProfile {
  symbol: string;
  timeframe: string;
  levels: VolumeProfileLevel[];
  totalVolume: Decimal;
  poc: Decimal; // Point of Control
  vah: Decimal; // Value Area High
  val: Decimal; // Value Area Low
  timestamp: number;
}

// Performance Monitoring Types
export interface PerformanceMetrics {
  frameRate: number;
  updateRate: number;
  latency: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: number;
}

// State Management Types
export interface PriceStore {
  prices: Map<string, TickData>;
  subscribe: (symbol: string, callback: (tick: TickData) => void) => () => void;
  updatePrice: (tick: TickData) => void;
  getPrice: (symbol: string) => TickData | undefined;
  getPriceHistory: (symbol: string, limit: number) => TickData[];
}

export interface OrderBookStore {
  orderBooks: Map<string, OrderBook>;
  subscribe: (symbol: string, callback: (book: OrderBook) => void) => () => void;
  updateOrderBook: (book: OrderBook) => void;
  getOrderBook: (symbol: string) => OrderBook | undefined;
  getMarketDepth: (symbol: string, levels: number) => MarketDepth | undefined;
}

export interface PortfolioStore {
  positions: Map<string, Position>;
  orders: Map<string, Order>;
  trades: Trade[];
  portfolioValue: PortfolioValue;
  riskMetrics: RiskMetrics;
  updatePosition: (position: Position) => void;
  updateOrder: (order: Order) => void;
  addTrade: (trade: Trade) => void;
  updatePortfolioValue: (value: PortfolioValue) => void;
  updateRiskMetrics: (metrics: RiskMetrics) => void;
}

// Component Props Types
export interface TradingDashboardProps {
  className?: string;
  symbols: string[];
  defaultSymbol?: string;
  layout?: 'standard' | 'compact' | 'mobile';
  enableML?: boolean;
  enableRealTime?: boolean;
}

export interface PriceGridProps {
  symbols: string[];
  maxRows?: number;
  enableVirtualScrolling?: boolean;
  updateRate?: number; // ms
  className?: string;
}

export interface OrderBookProps {
  symbol: string;
  levels?: number;
  enableMarketDepth?: boolean;
  enableVolumeProfile?: boolean;
  className?: string;
}

export interface ChartProps {
  symbol: string;
  timeframe: string;
  height?: number;
  enableVolume?: boolean;
  enableIndicators?: boolean;
  enableDrawing?: boolean;
  className?: string;
}

// Error Types
export interface TradingError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  component?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Configuration Types
export interface TradingConfig {
  websocket: {
    urls: {
      market: string;
      trading: string;
      portfolio: string;
    };
    reconnectDelay: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
  };
  performance: {
    maxUpdateRate: number; // updates per second
    targetFrameRate: number; // fps
    maxHistorySize: number; // number of records
    enableVirtualScrolling: boolean;
    enableWebWorkers: boolean;
  };
  ui: {
    theme: 'dark' | 'light';
    compactMode: boolean;
    showAdvancedFeatures: boolean;
    defaultTimeframe: string;
  };
}