import { useEffect, useRef, useCallback, useState } from 'react';
import { useTransition, useDeferredValue } from 'react';
import WebSocketManager from '@/utils/websocket-manager';
import { usePriceStore } from '@/stores/price-store';
import { useOrderBookStore } from '@/stores/orderbook-store';
import { WebSocketMessage, TickData, OrderBook, TradingError } from '@/types/trading';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  enableAutoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  enableBatching?: boolean;
  batchSize?: number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  error: TradingError | null;
  send: (event: string, data: any) => void;
  subscribe: (channel: string, callback: (message: WebSocketMessage) => void) => string;
  unsubscribe: (subscriptionId: string) => void;
  performanceMetrics: any;
}

export function useWebSocket(
  connectionId: string,
  url: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<TradingError | null>(null);
  const [isPending, startTransition] = useTransition();
  
  const wsManager = useRef<WebSocketManager>();
  const subscriptionsRef = useRef<Set<string>>(new Set());
  
  const {
    enableAutoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    enableBatching = true,
    batchSize = 100,
    priority = 'normal',
  } = options;

  // Initialize WebSocket manager
  useEffect(() => {
    wsManager.current = WebSocketManager.getInstance();
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    if (!wsManager.current) return;

    let mounted = true;

    const connect = async () => {
      try {
        setStatus('connecting');
        setError(null);
        
        await wsManager.current!.connect(connectionId, url, {
          transports: ['websocket'],
          auth: {
            // Add authentication if needed
          },
        });
        
        if (mounted) {
          setStatus('connected');
        }
      } catch (err) {
        if (mounted) {
          setStatus('error');
          setError({
            code: 'CONNECTION_FAILED',
            message: err instanceof Error ? err.message : 'Connection failed',
            timestamp: Date.now(),
            severity: 'high',
          });
        }
      }
    };

    connect();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (wsManager.current) {
        // Unsubscribe all subscriptions
        subscriptionsRef.current.forEach(id => {
          wsManager.current!.unsubscribe(id);
        });
        subscriptionsRef.current.clear();
        
        wsManager.current.disconnect(connectionId);
      }
    };
  }, [connectionId, url]);

  // Monitor connection status
  useEffect(() => {
    if (!wsManager.current) return;

    const interval = setInterval(() => {
      const currentStatus = wsManager.current!.getConnectionStatus(connectionId);
      setStatus(currentStatus);
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionId]);

  const send = useCallback((event: string, data: any) => {
    if (wsManager.current && status === 'connected') {
      wsManager.current.send(connectionId, event, data);
    }
  }, [connectionId, status]);

  const subscribe = useCallback((
    channel: string,
    callback: (message: WebSocketMessage) => void
  ): string => {
    if (!wsManager.current) return '';

    const subscriptionId = wsManager.current.subscribe(
      connectionId,
      channel,
      callback,
      priority
    );
    
    subscriptionsRef.current.add(subscriptionId);
    return subscriptionId;
  }, [connectionId, priority]);

  const unsubscribe = useCallback((subscriptionId: string) => {
    if (wsManager.current) {
      wsManager.current.unsubscribe(subscriptionId);
      subscriptionsRef.current.delete(subscriptionId);
    }
  }, []);

  const performanceMetrics = wsManager.current?.getPerformanceMetrics() || {};

  return {
    status,
    error,
    send,
    subscribe,
    unsubscribe,
    performanceMetrics,
  };
}

// Specialized hook for market data subscriptions
export function useMarketDataWebSocket(symbols: string[] = []) {
  const updatePrice = usePriceStore(state => state.updatePrice);
  const updatePrices = usePriceStore(state => state.updatePrices);
  const updateOrderBook = useOrderBookStore(state => state.updateOrderBook);
  
  const [isPending, startTransition] = useTransition();
  const deferredSymbols = useDeferredValue(symbols);
  
  const wsConnection = useWebSocket('market-data', process.env.NEXT_PUBLIC_MARKET_WS_URL || 'ws://localhost:3001', {
    priority: 'high',
    enableBatching: true,
    batchSize: 100,
  });

  // Batch processing for price updates
  const priceBuffer = useRef<TickData[]>([]);
  const priceBufferTimer = useRef<NodeJS.Timeout>();

  const flushPriceBuffer = useCallback(() => {
    if (priceBuffer.current.length > 0) {
      startTransition(() => {
        updatePrices([...priceBuffer.current]);
        priceBuffer.current = [];
      });
    }
  }, [updatePrices]);

  const processPriceTick = useCallback((tick: TickData) => {
    priceBuffer.current.push(tick);
    
    // Batch updates every 16ms (60fps)
    if (priceBufferTimer.current) {
      clearTimeout(priceBufferTimer.current);
    }
    
    priceBufferTimer.current = setTimeout(flushPriceBuffer, 16);
  }, [flushPriceBuffer]);

  // Subscribe to price updates
  useEffect(() => {
    if (wsConnection.status !== 'connected') return;

    const subscriptionId = wsConnection.subscribe('price-updates', (message: WebSocketMessage) => {
      if (message.type === 'tick' && message.data) {
        const tick: TickData = {
          symbol: message.data.symbol,
          price: {
            value: message.data.price,
            timestamp: message.data.timestamp,
            currency: message.data.currency,
          },
          volume: {
            value: message.data.volume,
            timestamp: message.data.timestamp,
          },
          bid: message.data.bid,
          ask: message.data.ask,
          spread: message.data.spread,
          timestamp: message.data.timestamp,
          sequence: message.data.sequence,
        };
        
        processPriceTick(tick);
      }
    });

    return () => {
      wsConnection.unsubscribe(subscriptionId);
      if (priceBufferTimer.current) {
        clearTimeout(priceBufferTimer.current);
        flushPriceBuffer();
      }
    };
  }, [wsConnection, processPriceTick, flushPriceBuffer]);

  // Subscribe to order book updates
  useEffect(() => {
    if (wsConnection.status !== 'connected') return;

    const subscriptionId = wsConnection.subscribe('orderbook-updates', (message: WebSocketMessage) => {
      if (message.type === 'orderbook' && message.data) {
        startTransition(() => {
          const orderBook: OrderBook = {
            symbol: message.data.symbol,
            bids: message.data.bids,
            asks: message.data.asks,
            timestamp: message.data.timestamp,
            sequence: message.data.sequence,
          };
          
          updateOrderBook(orderBook);
        });
      }
    });

    return () => wsConnection.unsubscribe(subscriptionId);
  }, [wsConnection, updateOrderBook]);

  // Subscribe to symbols
  useEffect(() => {
    if (wsConnection.status === 'connected' && deferredSymbols.length > 0) {
      wsConnection.send('subscribe-symbols', { symbols: deferredSymbols });
    }
  }, [wsConnection, deferredSymbols]);

  return {
    ...wsConnection,
    symbols: deferredSymbols,
    isPending,
  };
}

// Hook for trading data subscriptions (orders, positions, trades)
export function useTradingDataWebSocket() {
  const wsConnection = useWebSocket('trading-data', process.env.NEXT_PUBLIC_TRADING_WS_URL || 'ws://localhost:3002', {
    priority: 'critical',
    enableBatching: false, // Don't batch critical trading updates
  });

  // Subscribe to order updates
  useEffect(() => {
    if (wsConnection.status !== 'connected') return;

    const subscriptionId = wsConnection.subscribe('order-updates', (message: WebSocketMessage) => {
      if (message.type === 'order' && message.data) {
        // Handle order updates immediately (critical data)
        console.log('Order update:', message.data);
        // TODO: Update portfolio store with order data
      }
    });

    return () => wsConnection.unsubscribe(subscriptionId);
  }, [wsConnection]);

  // Subscribe to position updates
  useEffect(() => {
    if (wsConnection.status !== 'connected') return;

    const subscriptionId = wsConnection.subscribe('position-updates', (message: WebSocketMessage) => {
      if (message.type === 'position' && message.data) {
        // Handle position updates immediately (critical data)
        console.log('Position update:', message.data);
        // TODO: Update portfolio store with position data
      }
    });

    return () => wsConnection.unsubscribe(subscriptionId);
  }, [wsConnection]);

  return wsConnection;
}

// Hook for performance monitoring
export function useWebSocketPerformance() {
  const [metrics, setMetrics] = useState<any>({});
  
  useEffect(() => {
    const wsManager = WebSocketManager.getInstance();
    
    const interval = setInterval(() => {
      const currentMetrics = wsManager.getPerformanceMetrics();
      setMetrics(currentMetrics);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}