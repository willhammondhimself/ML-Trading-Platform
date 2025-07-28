'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WebSocketMetrics {
  messagesPerSecond: number;
  averageLatency: number;
  totalMessages: number;
  connectionTime: number;
}

export interface UseWebSocketReturn {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  subscribe: (symbols: string[], types: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  send: (event: string, data: any) => void;
  metrics: WebSocketMetrics;
}

export function useWebSocket(enabled = true): UseWebSocketReturn {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [metrics, setMetrics] = useState<WebSocketMetrics>({
    messagesPerSecond: 0,
    averageLatency: 0,
    totalMessages: 0,
    connectionTime: 0,
  });

  const socketRef = useRef<Socket | null>(null);
  const metricsRef = useRef({
    messageCount: 0,
    latencySum: 0,
    startTime: Date.now(),
    lastSecondMessages: 0,
    lastSecondTime: Date.now(),
  });

  const connect = useCallback(() => {
    if (!enabled || socketRef.current?.connected) return;

    setStatus('connecting');
    
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setStatus('connected');
      metricsRef.current.startTime = Date.now();
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (error) => {
      setStatus('error');
      console.error('WebSocket connection error:', error);
    });

    // Handle market data messages
    socket.on('quote', (data) => {
      updateMetrics();
      // Emit custom event for components to listen to
      window.dispatchEvent(new CustomEvent('market-quote', { detail: data }));
    });

    socket.on('trade', (data) => {
      updateMetrics();
      window.dispatchEvent(new CustomEvent('market-trade', { detail: data }));
    });

    socket.on('orderbook', (data) => {
      updateMetrics();
      window.dispatchEvent(new CustomEvent('market-orderbook', { detail: data }));
    });

    socket.on('ml-prediction', (data) => {
      updateMetrics();
      window.dispatchEvent(new CustomEvent('ml-prediction', { detail: data }));
    });

    socketRef.current = socket;
  }, [enabled]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    }
  }, []);

  const subscribe = useCallback((symbols: string[], types: string[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbols, types });
      console.log('Subscribed to:', symbols, types);
    }
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', { symbols });
      console.log('Unsubscribed from:', symbols);
    }
  }, []);

  const send = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const updateMetrics = useCallback(() => {
    const now = Date.now();
    const metrics = metricsRef.current;
    
    metrics.messageCount++;
    
    // Calculate messages per second
    if (now - metrics.lastSecondTime >= 1000) {
      const messagesThisSecond = metrics.messageCount - metrics.lastSecondMessages;
      metrics.lastSecondMessages = metrics.messageCount;
      metrics.lastSecondTime = now;
      
      setMetrics(prev => ({
        ...prev,
        messagesPerSecond: messagesThisSecond,
        totalMessages: metrics.messageCount,
        connectionTime: now - metrics.startTime,
      }));
    }
  }, []);

  // Connect on mount if enabled
  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Update metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (status === 'connected') {
        const now = Date.now();
        const metrics = metricsRef.current;
        
        setMetrics(prev => ({
          ...prev,
          connectionTime: now - metrics.startTime,
          averageLatency: metrics.messageCount > 0 ? metrics.latencySum / metrics.messageCount : 0,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  return {
    status,
    subscribe,
    unsubscribe,
    send,
    metrics,
  };
}