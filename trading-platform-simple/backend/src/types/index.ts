export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
  status: 'pending' | 'filled' | 'canceled';
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  side: 'long' | 'short';
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total?: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MLPrediction {
  symbol: string;
  prediction: number;
  confidence: number;
  direction: 'up' | 'down' | 'sideways';
  timeframe: string;
  features: Record<string, number>;
  timestamp: number;
}

export interface TechnicalIndicator {
  name: string;
  value: number;
  signal?: 'buy' | 'sell' | 'neutral';
  timestamp: number;
}

export interface Portfolio {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  cashBalance: number;
  positions: Position[];
  todaysPnL: number;
  todaysPnLPercent: number;
}

export interface Alert {
  id: string;
  symbol: string;
  type: 'price' | 'volume' | 'ml_signal' | 'technical';
  condition: string;
  target: number;
  currentValue: number;
  status: 'active' | 'triggered' | 'disabled';
  timestamp: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  timestamp: number;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  url?: string;
}

export interface MarketStatus {
  isOpen: boolean;
  nextOpen?: number;
  nextClose?: number;
  session: 'pre' | 'regular' | 'post' | 'closed';
}

export interface WebSocketMessage {
  type: 'quote' | 'trade' | 'orderbook' | 'ml_prediction' | 'alert';
  data: any;
  timestamp: number;
}