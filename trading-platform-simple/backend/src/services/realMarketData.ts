import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { Quote, OrderBook, OHLCV, NewsItem } from '../types';
import { logger } from '../utils/logger';

interface DataProvider {
  name: string;
  apiKey?: string;
  baseUrl: string;
  rateLimits: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
}

interface IEXQuoteResponse {
  symbol: string;
  latestPrice: number;
  change: number;
  changePercent: number;
  latestVolume: number;
  marketCap: number;
  peRatio: number;
  week52High: number;
  week52Low: number;
  ytdChange: number;
  iexBidPrice: number;
  iexBidSize: number;
  iexAskPrice: number;
  iexAskSize: number;
  avgTotalVolume: number;
  previousClose: number;
}

interface AlphaVantageQuoteResponse {
  'Global Quote': {
    '01. symbol': string;
    '05. price': string;
    '09. change': string;
    '10. change percent': string;
    '06. volume': string;
    '08. previous close': string;
  };
}

export class RealMarketDataService extends EventEmitter {
  private iexClient!: AxiosInstance;
  private alphaVantageClient!: AxiosInstance;
  private wsConnections: Map<string, WebSocket> = new Map();
  private quotesCache: Map<string, Quote> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  
  private readonly providers: Record<string, DataProvider> = {
    iex: {
      name: 'IEX Cloud',
      apiKey: process.env.IEX_CLOUD_API_KEY,
      baseUrl: 'https://cloud.iexapis.com/stable',
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerMinute: 500,
      }
    },
    alphavantage: {
      name: 'Alpha Vantage',
      apiKey: process.env.ALPHA_VANTAGE_API_KEY,
      baseUrl: 'https://www.alphavantage.co',
      rateLimits: {
        requestsPerSecond: 1,
        requestsPerMinute: 5,
      }
    }
  };

  constructor() {
    super();
    this.initializeClients();
  }

  private initializeClients(): void {
    // Initialize IEX Cloud client
    this.iexClient = axios.create({
      baseURL: this.providers.iex.baseUrl,
      timeout: 10000,
      params: {
        token: this.providers.iex.apiKey || 'demo'
      }
    });

    // Initialize Alpha Vantage client
    this.alphaVantageClient = axios.create({
      baseURL: this.providers.alphavantage.baseUrl,
      timeout: 15000,
      params: {
        apikey: this.providers.alphavantage.apiKey || 'demo'
      }
    });

    // Add request interceptors for rate limiting
    this.addRateLimitingInterceptors();

    logger.info('Real market data service initialized', {
      iexAvailable: !!this.providers.iex.apiKey,
      alphaVantageAvailable: !!this.providers.alphavantage.apiKey
    });
  }

  private addRateLimitingInterceptors(): void {
    // IEX Cloud rate limiting
    this.iexClient.interceptors.request.use(async (config) => {
      await this.enforceRateLimit('iex');
      return config;
    });

    // Alpha Vantage rate limiting
    this.alphaVantageClient.interceptors.request.use(async (config) => {
      await this.enforceRateLimit('alphavantage');
      return config;
    });
  }

  private async enforceRateLimit(provider: string): Promise<void> {
    const lastRequest = this.lastRequestTime.get(provider) || 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;
    const minInterval = 1000 / this.providers[provider].rateLimits.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime.set(provider, Date.now());
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    try {
      // Try IEX Cloud first (more reliable for stocks)
      if (this.providers.iex.apiKey && this.providers.iex.apiKey !== 'demo') {
        return await this.getIEXQuote(symbol);
      }
      
      // Fallback to Alpha Vantage
      if (this.providers.alphavantage.apiKey && this.providers.alphavantage.apiKey !== 'demo') {
        return await this.getAlphaVantageQuote(symbol);
      }

      // If no API keys, return cached quote or null
      return this.quotesCache.get(symbol) || null;
    } catch (error) {
      logger.error(`Error fetching quote for ${symbol}:`, error);
      return this.quotesCache.get(symbol) || null;
    }
  }

  private async getIEXQuote(symbol: string): Promise<Quote | null> {
    try {
      const response = await this.iexClient.get<IEXQuoteResponse>(`/stock/${symbol}/quote`);
      const data = response.data;

      const quote: Quote = {
        symbol: data.symbol,
        price: data.latestPrice,
        change: data.change,
        changePercent: data.changePercent * 100, // IEX returns decimal, we want percentage
        volume: data.latestVolume,
        marketCap: data.marketCap,
        bid: data.iexBidPrice,
        ask: data.iexAskPrice,
        bidSize: data.iexBidSize,
        askSize: data.iexAskSize,
        timestamp: Date.now(),
      };

      // Cache the quote
      this.quotesCache.set(symbol, quote);
      
      // Emit update
      this.emit('quote', quote);

      return quote;
    } catch (error) {
      logger.error(`IEX Cloud error for ${symbol}:`, error);
      throw error;
    }
  }

  private async getAlphaVantageQuote(symbol: string): Promise<Quote | null> {
    try {
      const response = await this.alphaVantageClient.get<AlphaVantageQuoteResponse>('/query', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol
        }
      });

      const data = response.data['Global Quote'];
      if (!data) {
        throw new Error('No data returned from Alpha Vantage');
      }

      const price = parseFloat(data['05. price']);
      const change = parseFloat(data['09. change']);
      const changePercent = parseFloat(data['10. change percent'].replace('%', ''));
      const volume = parseInt(data['06. volume']);

      const quote: Quote = {
        symbol: data['01. symbol'],
        price,
        change,
        changePercent,
        volume,
        timestamp: Date.now(),
      };

      // Cache the quote
      this.quotesCache.set(symbol, quote);
      
      // Emit update
      this.emit('quote', quote);

      return quote;
    } catch (error) {
      logger.error(`Alpha Vantage error for ${symbol}:`, error);
      throw error;
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    const promises = symbols.map(symbol => this.getQuote(symbol));
    const results = await Promise.allSettled(promises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<Quote | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);
  }

  async getHistoricalData(symbol: string, range = '1y'): Promise<OHLCV[]> {
    try {
      if (this.providers.iex.apiKey && this.providers.iex.apiKey !== 'demo') {
        return await this.getIEXHistoricalData(symbol, range);
      }
      
      if (this.providers.alphavantage.apiKey && this.providers.alphavantage.apiKey !== 'demo') {
        return await this.getAlphaVantageHistoricalData(symbol);
      }

      // Return empty array if no API keys
      return [];
    } catch (error) {
      logger.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  }

  private async getIEXHistoricalData(symbol: string, range: string): Promise<OHLCV[]> {
    try {
      const response = await this.iexClient.get(`/stock/${symbol}/chart/${range}`);
      const data = response.data;

      return data.map((item: any) => ({
        timestamp: new Date(item.date).getTime(),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));
    } catch (error) {
      logger.error(`IEX historical data error for ${symbol}:`, error);
      throw error;
    }
  }

  private async getAlphaVantageHistoricalData(symbol: string): Promise<OHLCV[]> {
    try {
      const response = await this.alphaVantageClient.get('/query', {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          outputsize: 'compact'
        }
      });

      const timeSeries = response.data['Time Series (Daily)'];
      if (!timeSeries) {
        throw new Error('No time series data returned');
      }

      const data: OHLCV[] = [];
      for (const [date, values] of Object.entries(timeSeries)) {
        const dayData = values as any;
        data.push({
          timestamp: new Date(date).getTime(),
          open: parseFloat(dayData['1. open']),
          high: parseFloat(dayData['2. high']),
          low: parseFloat(dayData['3. low']),
          close: parseFloat(dayData['4. close']),
          volume: parseInt(dayData['5. volume']),
        });
      }

      return data.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      logger.error(`Alpha Vantage historical data error for ${symbol}:`, error);
      throw error;
    }
  }

  async getNews(symbols: string[], limit = 10): Promise<NewsItem[]> {
    try {
      if (this.providers.iex.apiKey && this.providers.iex.apiKey !== 'demo') {
        return await this.getIEXNews(symbols, limit);
      }

      return [];
    } catch (error) {
      logger.error('Error fetching news:', error);
      return [];
    }
  }

  private async getIEXNews(symbols: string[], limit: number): Promise<NewsItem[]> {
    try {
      const symbolsParam = symbols.slice(0, 5).join(','); // Limit to 5 symbols
      const response = await this.iexClient.get(`/stock/market/news/last/${limit}`, {
        params: {
          symbols: symbolsParam
        }
      });

      const data = response.data;
      return data.map((item: any) => ({
        id: `iex-${item.datetime}-${Math.random()}`,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        timestamp: item.datetime,
        symbols: item.related ? item.related.split(',') : symbols,
        url: item.url,
        imageUrl: item.image,
      }));
    } catch (error) {
      logger.error('IEX news error:', error);
      return [];
    }
  }

  startRealTimeUpdates(symbols: string[], intervalMs = 5000): void {
    logger.info(`Starting real-time updates for ${symbols.length} symbols`);
    
    const updateQuotes = async () => {
      try {
        await this.getMultipleQuotes(symbols);
      } catch (error) {
        logger.error('Error in real-time update:', error);
      }
    };

    // Initial update
    updateQuotes();

    // Set up interval
    setInterval(updateQuotes, intervalMs);
  }

  getProviderStatus() {
    return {
      iex: {
        available: !!this.providers.iex.apiKey && this.providers.iex.apiKey !== 'demo',
        name: this.providers.iex.name
      },
      alphavantage: {
        available: !!this.providers.alphavantage.apiKey && this.providers.alphavantage.apiKey !== 'demo',
        name: this.providers.alphavantage.name
      }
    };
  }

  getCachedQuotes(): Quote[] {
    return Array.from(this.quotesCache.values());
  }
}