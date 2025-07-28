import { 
  IDatafeed, 
  DatafeedConfiguration, 
  LibrarySymbolInfo, 
  SearchSymbolResultItem, 
  Bar, 
  HistoryMetadata 
} from '@/types/tradingview';
import { TickData } from '@/types/trading';
import WebSocketManager from '@/utils/websocket-manager';
import Decimal from 'decimal.js';

interface SymbolData {
  name: string;
  full_name: string;
  description: string;
  type: string;
  exchange: string;
  currency: string;
  pricescale: number;
  session: string;
  timezone: string;
  supported_resolutions: string[];
  minmov: number;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
}

export class CustomDatafeed implements IDatafeed {
  private wsManager: WebSocketManager;
  private subscriberMap: Map<string, string> = new Map();
  private symbolsDatabase: Map<string, SymbolData> = new Map();
  private lastBarsCache: Map<string, Bar> = new Map();
  private configuration: DatafeedConfiguration;

  constructor() {
    this.wsManager = WebSocketManager.getInstance();
    this.configuration = {
      supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      supports_group_request: false,
      supports_marks: false,
      supports_search: true,
      supports_timescale_marks: false,
      symbols_types: [
        { name: 'All types', value: '' },
        { name: 'Stock', value: 'stock' },
        { name: 'Crypto', value: 'crypto' },
        { name: 'Forex', value: 'forex' },
        { name: 'Commodity', value: 'commodity' },
      ],
      currency_codes: ['USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH'],
      exchanges: [
        { value: 'NYSE', name: 'New York Stock Exchange', desc: '' },
        { value: 'NASDAQ', name: 'NASDAQ', desc: '' },
        { value: 'BINANCE', name: 'Binance', desc: '' },
        { value: 'COINBASE', name: 'Coinbase', desc: '' },
      ],
    };

    this.initializeSymbolsDatabase();
  }

  private initializeSymbolsDatabase(): void {
    // Initialize with common trading symbols
    const symbols: SymbolData[] = [
      {
        name: 'AAPL',
        full_name: 'NYSE:AAPL',
        description: 'Apple Inc.',
        type: 'stock',
        exchange: 'NYSE',
        currency: 'USD',
        pricescale: 100,
        session: '0930-1600',
        timezone: 'America/New_York',
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
      },
      {
        name: 'GOOGL',
        full_name: 'NASDAQ:GOOGL',
        description: 'Alphabet Inc.',
        type: 'stock',
        exchange: 'NASDAQ',
        currency: 'USD',
        pricescale: 100,
        session: '0930-1600',
        timezone: 'America/New_York',
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
      },
      {
        name: 'BTCUSD',
        full_name: 'BINANCE:BTCUSD',
        description: 'Bitcoin / US Dollar',
        type: 'crypto',
        exchange: 'BINANCE',
        currency: 'USD',
        pricescale: 100,
        session: '24x7',
        timezone: 'UTC',
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
      },
      {
        name: 'ETHUSD',
        full_name: 'BINANCE:ETHUSD',
        description: 'Ethereum / US Dollar',
        type: 'crypto',
        exchange: 'BINANCE',
        currency: 'USD',
        pricescale: 100,
        session: '24x7',
        timezone: 'UTC',
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
      },
      {
        name: 'EURUSD',
        full_name: 'FX:EURUSD',
        description: 'Euro / US Dollar',
        type: 'forex',
        exchange: 'FX',
        currency: 'USD',
        pricescale: 100000,
        session: '24x5',
        timezone: 'UTC',
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
      },
    ];

    symbols.forEach(symbol => {
      this.symbolsDatabase.set(symbol.name, symbol);
    });
  }

  onReady(callback: (configuration: DatafeedConfiguration) => void): void {
    console.log('[CustomDatafeed] onReady called');
    
    // Simulate async initialization
    setTimeout(() => {
      callback(this.configuration);
    }, 0);
  }

  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResultReadyCallback: (symbols: SearchSymbolResultItem[]) => void
  ): void {
    console.log('[CustomDatafeed] searchSymbols called', { userInput, exchange, symbolType });

    const query = userInput.toUpperCase();
    const results: SearchSymbolResultItem[] = [];

    this.symbolsDatabase.forEach((symbolData, symbolName) => {
      const isExchangeMatch = !exchange || symbolData.exchange === exchange;
      const isTypeMatch = !symbolType || symbolData.type === symbolType;
      const isNameMatch = symbolName.includes(query) || 
                         symbolData.description.toUpperCase().includes(query);

      if (isExchangeMatch && isTypeMatch && isNameMatch) {
        results.push({
          symbol: symbolName,
          full_name: symbolData.full_name,
          description: symbolData.description,
          exchange: symbolData.exchange,
          ticker: symbolName,
          type: symbolData.type,
        });
      }
    });

    // Limit results to prevent overwhelming the UI
    const limitedResults = results.slice(0, 20);
    
    setTimeout(() => {
      onResultReadyCallback(limitedResults);
    }, 0);
  }

  resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: (symbolInfo: LibrarySymbolInfo) => void,
    onResolveErrorCallback: (reason: string) => void
  ): void {
    console.log('[CustomDatafeed] resolveSymbol called', symbolName);

    const symbolData = this.symbolsDatabase.get(symbolName);
    
    if (!symbolData) {
      onResolveErrorCallback(`Symbol ${symbolName} not found`);
      return;
    }

    const symbolInfo: LibrarySymbolInfo = {
      name: symbolData.name,
      full_name: symbolData.full_name,
      description: symbolData.description,
      type: symbolData.type,
      session: symbolData.session,
      timezone: symbolData.timezone,
      ticker: symbolData.name,
      exchange: symbolData.exchange,
      listed_exchange: symbolData.exchange,
      format: 'price',
      pricescale: symbolData.pricescale,
      minmov: symbolData.minmov,
      fractional: false,
      currency_code: symbolData.currency,
      supported_resolutions: symbolData.supported_resolutions,
      intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
      has_seconds: false,
      has_ticks: false,
      has_daily: symbolData.has_daily,
      has_weekly_and_monthly: symbolData.has_weekly_and_monthly,
      has_empty_bars: false,
      force_session_rebuild: false,
      has_no_volume: false,
      volume_precision: 0,
      data_status: 'streaming',
      expired: false,
      sector: this.getSectorByType(symbolData.type),
      industry: this.getIndustryBySymbol(symbolData.name),
      update_mode: 'streaming',
    };

    setTimeout(() => {
      onSymbolResolvedCallback(symbolInfo);
    }, 0);
  }

  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    periodParams: any,
    onHistoryCallback: (bars: Bar[], meta?: HistoryMetadata) => void,
    onErrorCallback: (reason: string) => void
  ): void {
    console.log('[CustomDatafeed] getBars called', {
      symbol: symbolInfo.name,
      resolution,
      from: new Date(periodParams.from * 1000),
      to: new Date(periodParams.to * 1000),
    });

    // Generate mock historical data
    this.generateMockBars(
      symbolInfo.name,
      resolution,
      periodParams.from,
      periodParams.to,
      periodParams.countBack
    )
      .then(bars => {
        if (bars.length > 0) {
          // Cache the last bar for real-time updates
          this.lastBarsCache.set(
            `${symbolInfo.name}_${resolution}`,
            bars[bars.length - 1]
          );
        }

        const meta: HistoryMetadata = {
          noData: bars.length === 0,
        };

        onHistoryCallback(bars, meta);
      })
      .catch(error => {
        console.error('[CustomDatafeed] Error generating bars:', error);
        onErrorCallback(error.message);
      });
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void
  ): void {
    console.log('[CustomDatafeed] subscribeBars called', {
      symbol: symbolInfo.name,
      resolution,
      subscriberUID,
    });

    const channelString = `${symbolInfo.name}_${resolution}`;
    this.subscriberMap.set(subscriberUID, channelString);

    // Subscribe to real-time data via WebSocket
    this.subscribeToRealtimeData(
      symbolInfo.name,
      resolution,
      onRealtimeCallback,
      subscriberUID
    );
  }

  unsubscribeBars(subscriberUID: string): void {
    console.log('[CustomDatafeed] unsubscribeBars called', subscriberUID);

    const channelString = this.subscriberMap.get(subscriberUID);
    if (channelString) {
      this.subscriberMap.delete(subscriberUID);
      // Unsubscribe from WebSocket if no more subscribers
      const hasOtherSubscribers = Array.from(this.subscriberMap.values())
        .some(channel => channel === channelString);
      
      if (!hasOtherSubscribers) {
        // Unsubscribe from WebSocket
        // Implementation depends on your WebSocket setup
      }
    }
  }

  private async generateMockBars(
    symbol: string,
    resolution: string,
    from: number,
    to: number,
    countBack?: number
  ): Promise<Bar[]> {
    const bars: Bar[] = [];
    const resolutionMs = this.getResolutionInMS(resolution);
    
    // Calculate time range
    const fromMs = from * 1000;
    const toMs = to * 1000;
    
    // Generate mock data
    let currentTime = fromMs;
    let basePrice = this.getBasePriceForSymbol(symbol);
    let currentPrice = basePrice;
    
    while (currentTime <= toMs) {
      // Simulate price movement
      const change = (Math.random() - 0.5) * basePrice * 0.02; // 2% max change
      currentPrice = Math.max(0.01, currentPrice + change);
      
      const open = currentPrice;
      const volatility = basePrice * 0.01; // 1% volatility
      const high = open + Math.random() * volatility;
      const low = open - Math.random() * volatility;
      const close = low + Math.random() * (high - low);
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      
      bars.push({
        time: Math.floor(currentTime / 1000),
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });
      
      currentPrice = close;
      currentTime += resolutionMs;
    }
    
    return bars;
  }

  private subscribeToRealtimeData(
    symbol: string,
    resolution: string,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string
  ): void {
    // Subscribe to real-time price updates via existing WebSocket manager
    const subscriptionId = this.wsManager.subscribe(
      'market-data',
      `tick:${symbol}`,
      (message) => {
        if (message.type === 'tick' && message.data?.symbol === symbol) {
          const tickData: TickData = message.data;
          const lastBarKey = `${symbol}_${resolution}`;
          const lastBar = this.lastBarsCache.get(lastBarKey);
          
          if (lastBar) {
            // Update the last bar with new tick data
            const updatedBar: Bar = {
              ...lastBar,
              close: tickData.price.value.toNumber(),
              high: Math.max(lastBar.high, tickData.price.value.toNumber()),
              low: Math.min(lastBar.low, tickData.price.value.toNumber()),
              volume: (lastBar.volume || 0) + (tickData.volume?.value.toNumber() || 0),
            };
            
            this.lastBarsCache.set(lastBarKey, updatedBar);
            onRealtimeCallback(updatedBar);
          } else {
            // Create a new bar if no last bar exists
            const newBar: Bar = {
              time: Math.floor(tickData.timestamp / 1000),
              open: tickData.price.value.toNumber(),
              high: tickData.price.value.toNumber(),
              low: tickData.price.value.toNumber(),
              close: tickData.price.value.toNumber(),
              volume: tickData.volume?.value.toNumber() || 0,
            };
            
            this.lastBarsCache.set(lastBarKey, newBar);
            onRealtimeCallback(newBar);
          }
        }
      },
      'high'
    );

    // Store subscription for cleanup
    this.subscriberMap.set(subscriberUID, subscriptionId);
  }

  private getResolutionInMS(resolution: string): number {
    switch (resolution) {
      case '1':
        return 60 * 1000; // 1 minute
      case '5':
        return 5 * 60 * 1000; // 5 minutes
      case '15':
        return 15 * 60 * 1000; // 15 minutes
      case '30':
        return 30 * 60 * 1000; // 30 minutes
      case '60':
        return 60 * 60 * 1000; // 1 hour
      case '240':
        return 4 * 60 * 60 * 1000; // 4 hours
      case '1D':
        return 24 * 60 * 60 * 1000; // 1 day
      case '1W':
        return 7 * 24 * 60 * 60 * 1000; // 1 week
      case '1M':
        return 30 * 24 * 60 * 60 * 1000; // 30 days (approximate)
      default:
        return 60 * 1000; // Default to 1 minute
    }
  }

  private getBasePriceForSymbol(symbol: string): number {
    // Mock base prices for different symbols
    const basePrices: Record<string, number> = {
      AAPL: 150,
      GOOGL: 2500,
      MSFT: 300,
      AMZN: 3000,
      TSLA: 800,
      BTCUSD: 45000,
      ETHUSD: 3000,
      EURUSD: 1.1,
      GBPUSD: 1.3,
    };
    
    return basePrices[symbol] || 100;
  }

  private getSectorByType(type: string): string {
    switch (type) {
      case 'stock':
        return 'Technology';
      case 'crypto':
        return 'Cryptocurrency';
      case 'forex':
        return 'Currency';
      case 'commodity':
        return 'Commodities';
      default:
        return 'Unknown';
    }
  }

  private getIndustryBySymbol(symbol: string): string {
    const industries: Record<string, string> = {
      AAPL: 'Consumer Electronics',
      GOOGL: 'Internet Software & Services',
      MSFT: 'Systems Software',
      AMZN: 'Internet Retail',
      TSLA: 'Auto Manufacturers',
      BTCUSD: 'Digital Currency',
      ETHUSD: 'Digital Currency',
      EURUSD: 'Major Currency Pair',
      GBPUSD: 'Major Currency Pair',
    };
    
    return industries[symbol] || 'Unknown';
  }

  // Optional methods for enhanced functionality
  calculateHistoryDepth(resolution: string, resolutionBack: string, intervalBack: number): any {
    // Return the maximum number of bars for the given resolution
    return undefined; // Let TradingView decide
  }

  getMarks(
    symbolInfo: LibrarySymbolInfo,
    startDate: number,
    endDate: number,
    onDataCallback: (marks: any[]) => void,
    resolution: string
  ): void {
    // Return empty marks array - could be implemented for earnings, dividends, etc.
    onDataCallback([]);
  }

  getTimescaleMarks(
    symbolInfo: LibrarySymbolInfo,
    startDate: number,
    endDate: number,
    onDataCallback: (marks: any[]) => void,
    resolution: string
  ): void {
    // Return empty timescale marks
    onDataCallback([]);
  }

  getServerTime(callback: (time: number) => void): void {
    callback(Math.floor(Date.now() / 1000));
  }
}