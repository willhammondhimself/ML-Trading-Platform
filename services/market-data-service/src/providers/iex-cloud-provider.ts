/**
 * IEX Cloud Data Provider
 * Implementation for IEX Cloud financial data API
 */

import { AxiosRequestConfig } from 'axios';
import WebSocket from 'ws';
import { Decimal } from 'decimal.js';

import {
  DataProvider,
  MarketDataType,
  Quote,
  Trade,
  OrderBook,
  OHLCV,
  NewsItem,
  HistoricalDataRequest,
  DataQuality,
  Symbol,
  Price,
  Volume,
  AssetType,
  TimePeriod,
  TradeSide
} from '../types';
import { BaseDataProvider } from './base-provider';
import { logProviderEvent } from '../utils/logger';

interface IEXQuoteResponse {
  symbol: string;
  latestPrice: number;
  latestTime: number;
  latestUpdate: number;
  latestVolume: number;
  iexBidPrice: number;
  iexBidSize: number;
  iexAskPrice: number;
  iexAskSize: number;
  primaryExchange: string;
  currency: string;
  marketCap: number;
}

interface IEXTradeResponse {
  symbol: string;
  price: number;
  size: number;
  time: number;
  timeLabel: string;
  venue: string;
  venueLabel: string;
}

interface IEXOHLCVResponse {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  uOpen: number;
  uHigh: number;
  uLow: number;
  uClose: number;
  uVolume: number;
}

interface IEXNewsResponse {
  datetime: number;
  headline: string;
  source: string;
  url: string;
  summary: string;
  related: string;
  image: string;
  lang: string;
  hasPaywall: boolean;
}

export class IEXCloudProvider extends BaseDataProvider {
  private wsClient?: WebSocket;
  private wsReconnectAttempts = 0;
  private wsMaxReconnectAttempts = 5;
  private wsReconnectDelay = 1000;
  private subscribedSymbols = new Set<string>();

  constructor(config: any) {
    super({
      ...config,
      provider: DataProvider.IEX_CLOUD,
      baseUrl: 'https://cloud.iexapis.com',
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerMinute: 500,
        requestsPerHour: 10000,
        requestsPerDay: 100000,
        burstSize: 20,
        ...config.rateLimits
      }
    });
  }

  // === Connection Management ===

  protected async connectProvider(): Promise<void> {
    // IEX Cloud uses REST API primarily, but also supports WebSocket
    await this.connectWebSocket();
    logProviderEvent('connect', this.name, { type: 'websocket' });
  }

  protected async disconnectProvider(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = undefined;
    }
    this.subscribedSymbols.clear();
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = `wss://ws-api.iextrading.com/1.0/tops`;
    
    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(wsUrl);

      this.wsClient.on('open', () => {
        this.wsReconnectAttempts = 0;
        logProviderEvent('connect', this.name, { transport: 'websocket' });
        resolve();
      });

      this.wsClient.on('message', (data: Buffer) => {
        this.handleWebSocketMessage(data);
      });

      this.wsClient.on('error', (error: Error) => {
        logProviderEvent('error', this.name, { 
          transport: 'websocket',
          error: error.message 
        });
        
        if (!this.isConnected) {
          reject(error);
        } else {
          this.emit('error', error);
        }
      });

      this.wsClient.on('close', () => {
        logProviderEvent('disconnect', this.name, { transport: 'websocket' });
        this.handleWebSocketDisconnect();
      });
    });
  }

  private handleWebSocketMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (Array.isArray(message)) {
        // Handle quote updates
        for (const item of message) {
          if (item.symbol && item.lastSalePrice) {
            this.emitQuoteUpdate(item);
          }
        }
      }
    } catch (error) {
      logProviderEvent('error', this.name, {
        operation: 'parse_websocket_message',
        error: (error as Error).message
      });
    }
  }

  private emitQuoteUpdate(data: any): void {
    try {
      const quote = this.transformIEXQuoteToQuote(data);
      this.emit('quote', quote);
      
      logProviderEvent('data_received', this.name, {
        type: 'quote',
        symbol: quote.symbol.symbol
      });
    } catch (error) {
      logProviderEvent('error', this.name, {
        operation: 'transform_quote',
        error: (error as Error).message
      });
    }
  }

  private handleWebSocketDisconnect(): void {
    if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
      this.wsReconnectAttempts++;
      
      setTimeout(() => {
        logProviderEvent('connect', this.name, {
          type: 'websocket_reconnect',
          attempt: this.wsReconnectAttempts
        });
        
        this.connectWebSocket().catch((error) => {
          logProviderEvent('error', this.name, {
            operation: 'websocket_reconnect',
            attempt: this.wsReconnectAttempts,
            error: error.message
          });
        });
      }, this.wsReconnectDelay * Math.pow(2, this.wsReconnectAttempts - 1));
    }
  }

  // === Subscription Management ===

  protected async subscribeProvider(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    // Add symbols to subscription set
    symbols.forEach(symbol => this.subscribedSymbols.add(symbol));

    // IEX Cloud WebSocket automatically provides data for subscribed symbols
    // No explicit subscription message needed for basic quote data
    
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      // For some data types, we might need to send subscription messages
      if (dataTypes.includes(MarketDataType.TRADE)) {
        // Subscribe to trades if supported
        const subscribeMessage = {
          type: 'subscribe',
          symbols: symbols.join(',')
        };
        this.wsClient.send(JSON.stringify(subscribeMessage));
      }
    }
  }

  protected async unsubscribeProvider(symbols: string[], dataTypes: MarketDataType[]): Promise<void> {
    // Remove symbols from subscription set
    symbols.forEach(symbol => this.subscribedSymbols.delete(symbol));

    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        symbols: symbols.join(',')
      };
      this.wsClient.send(JSON.stringify(unsubscribeMessage));
    }
  }

  // === Data Fetching Methods ===

  protected async fetchQuote(symbol: string): Promise<Quote | null> {
    try {
      const response = await this.makeRequest<IEXQuoteResponse>({
        method: 'GET',
        url: `/stable/stock/${symbol}/quote`,
        params: {
          token: this.config.apiKey
        }
      });

      return this.transformIEXQuoteToQuote(response);
    } catch (error) {
      if ((error as any).response?.status === 404) {
        return null; // Symbol not found
      }
      throw error;
    }
  }

  protected async fetchTrades(symbol: string, limit = 50): Promise<Trade[]> {
    try {
      const response = await this.makeRequest<IEXTradeResponse[]>({
        method: 'GET',
        url: `/stable/stock/${symbol}/trades`,
        params: {
          token: this.config.apiKey,
          last: Math.min(limit, 500) // IEX Cloud limit
        }
      });

      return response.map(trade => this.transformIEXTradeToTrade(trade));
    } catch (error) {
      return []; // Return empty array on error
    }
  }

  protected async fetchOrderBook(symbol: string, depth = 10): Promise<OrderBook | null> {
    // IEX Cloud doesn't provide full order book data in basic tier
    // We can simulate using bid/ask from quote data
    const quote = await this.fetchQuote(symbol);
    if (!quote) return null;

    return {
      symbol: quote.symbol,
      bids: [{ price: quote.bid, size: quote.bidSize, orderCount: 1 }],
      asks: [{ price: quote.ask, size: quote.askSize, orderCount: 1 }],
      timestamp: Date.now(),
      source: DataProvider.IEX_CLOUD,
      depth: 1,
      quality: this.calculateDataQuality(quote, 'orderbook')
    };
  }

  protected async fetchHistoricalData(request: HistoricalDataRequest): Promise<OHLCV[]> {
    const results: OHLCV[] = [];

    for (const symbol of request.symbols) {
      try {
        const range = this.getIEXRangeFromPeriod(request.period);
        const response = await this.makeRequest<IEXOHLCVResponse[]>({
          method: 'GET',
          url: `/stable/stock/${symbol}/chart/${range}`,
          params: {
            token: this.config.apiKey,
            includeToday: true
          }
        });

        const transformedData = response.map(item => 
          this.transformIEXOHLCVToOHLCV(item, symbol, request.period)
        );

        results.push(...transformedData);
      } catch (error) {
        logProviderEvent('error', this.name, {
          operation: 'fetchHistoricalData',
          symbol,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  protected async fetchNews(symbols: string[], limit = 20): Promise<NewsItem[]> {
    const results: NewsItem[] = [];

    for (const symbol of symbols.slice(0, 5)) { // Limit to 5 symbols to avoid rate limits
      try {
        const response = await this.makeRequest<IEXNewsResponse[]>({
          method: 'GET',
          url: `/stable/stock/${symbol}/news/last/${Math.min(limit, 50)}`,
          params: {
            token: this.config.apiKey
          }
        });

        const transformedNews = response.map(item => 
          this.transformIEXNewsToNewsItem(item, symbol)
        );

        results.push(...transformedNews);
      } catch (error) {
        logProviderEvent('error', this.name, {
          operation: 'fetchNews',
          symbol,
          error: (error as Error).message
        });
      }
    }

    return results.slice(0, limit);
  }

  protected async checkProviderHealth(): Promise<boolean> {
    try {
      await this.makeRequest({
        method: 'GET',
        url: '/stable/account/metadata',
        params: {
          token: this.config.apiKey
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  // === Authentication ===

  protected addAuthentication(config: AxiosRequestConfig): AxiosRequestConfig {
    // IEX Cloud uses token-based authentication
    if (!config.params) {
      config.params = {};
    }
    config.params.token = this.config.apiKey;
    return config;
  }

  // === Data Transformation Methods ===

  private transformIEXQuoteToQuote(data: any): Quote {
    const symbol: Symbol = {
      symbol: data.symbol,
      exchange: data.primaryExchange || 'IEX',
      assetType: AssetType.STOCK,
      currency: data.currency || 'USD',
      name: data.companyName
    };

    const timestamp = data.latestUpdate || data.latestTime || Date.now();

    return {
      symbol,
      bid: this.createPrice(data.iexBidPrice || data.latestPrice, symbol.currency, timestamp),
      ask: this.createPrice(data.iexAskPrice || data.latestPrice, symbol.currency, timestamp),
      bidSize: this.createVolume(data.iexBidSize || 0, timestamp),
      askSize: this.createVolume(data.iexAskSize || 0, timestamp),
      spread: new Decimal((data.iexAskPrice || data.latestPrice) - (data.iexBidPrice || data.latestPrice)),
      timestamp,
      source: DataProvider.IEX_CLOUD,
      quality: this.calculateDataQuality(data, 'quote')
    };
  }

  private transformIEXTradeToTrade(data: IEXTradeResponse): Trade {
    const symbol: Symbol = {
      symbol: data.symbol,
      exchange: 'IEX',
      assetType: AssetType.STOCK,
      currency: 'USD'
    };

    return {
      id: `${data.symbol}-${data.time}`,
      symbol,
      price: this.createPrice(data.price, 'USD', data.time),
      volume: this.createVolume(data.size, data.time),
      side: TradeSide.UNKNOWN,
      timestamp: data.time,
      source: DataProvider.IEX_CLOUD,
      venue: data.venueLabel || data.venue,
      quality: this.calculateDataQuality(data, 'trade')
    };
  }

  private transformIEXOHLCVToOHLCV(data: IEXOHLCVResponse, symbolString: string, period: TimePeriod): OHLCV {
    const symbol: Symbol = {
      symbol: symbolString,
      exchange: 'IEX',
      assetType: AssetType.STOCK,
      currency: 'USD'
    };

    const timestamp = new Date(data.date).getTime();

    return {
      symbol,
      open: this.createPrice(data.open, 'USD', timestamp),
      high: this.createPrice(data.high, 'USD', timestamp),
      low: this.createPrice(data.low, 'USD', timestamp),
      close: this.createPrice(data.close, 'USD', timestamp),
      volume: this.createVolume(data.volume, timestamp),
      timestamp,
      period,
      source: DataProvider.IEX_CLOUD,
      quality: this.calculateDataQuality(data, 'ohlcv')
    };
  }

  private transformIEXNewsToNewsItem(data: IEXNewsResponse, symbol: string): NewsItem {
    return {
      id: `iex-${data.datetime}-${symbol}`,
      headline: data.headline,
      content: data.summary,
      source: data.source,
      timestamp: data.datetime,
      symbols: [symbol, ...(data.related ? data.related.split(',') : [])],
      relevance: 0.8, // IEX news is generally relevant
      tags: [],
      url: data.url,
      imageUrl: data.image
    };
  }

  // === Utility Methods ===

  private createPrice(value: number, currency: string, timestamp: number): Price {
    return {
      value: new Decimal(value || 0),
      currency,
      timestamp,
      source: DataProvider.IEX_CLOUD,
      precision: 2
    };
  }

  private createVolume(value: number, timestamp: number): Volume {
    return {
      value: new Decimal(value || 0),
      timestamp,
      source: DataProvider.IEX_CLOUD
    };
  }

  private calculateDataQuality(data: any, type: string): DataQuality {
    // Basic quality scoring based on data completeness
    let score = 0.8; // Base score for IEX Cloud
    
    if (type === 'quote') {
      if (data.latestPrice) score += 0.1;
      if (data.iexBidPrice && data.iexAskPrice) score += 0.1;
    } else if (type === 'trade') {
      if (data.price && data.size) score += 0.2;
    } else if (type === 'ohlcv') {
      if (data.open && data.high && data.low && data.close && data.volume) score += 0.2;
    }

    return {
      score: Math.min(score, 1.0),
      latency: Date.now() - (data.latestUpdate || data.time || Date.now()),
      completeness: score,
      accuracy: 0.95, // IEX Cloud is generally accurate
      staleness: Date.now() - (data.latestUpdate || data.time || Date.now()),
      provider: DataProvider.IEX_CLOUD,
      timestamp: Date.now()
    };
  }

  private getIEXRangeFromPeriod(period: TimePeriod): string {
    switch (period) {
      case TimePeriod.DAY:
        return '1d';
      case TimePeriod.WEEK:
        return '5d';
      case TimePeriod.MONTH:
        return '1m';
      default:
        return '1m';
    }
  }
}