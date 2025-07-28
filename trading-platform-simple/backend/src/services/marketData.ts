import { EventEmitter } from 'events';
import { Quote, OrderBook, OHLCV, OrderBookLevel } from '../types';
import { logger } from '../utils/logger';

export class MarketDataService extends EventEmitter {
  private quotes: Map<string, Quote> = new Map();
  private simulationInterval?: NodeJS.Timeout;
  private readonly symbols = [
    'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 
    'NFLX', 'CRM', 'UBER', 'COIN', 'SNOW', 'ZM', 'PLTR', 'SQ'
  ];

  constructor() {
    super();
    this.initializeQuotes();
  }

  private initializeQuotes(): void {
    this.symbols.forEach(symbol => {
      const basePrice = Math.random() * 200 + 50;
      const change = (Math.random() - 0.5) * 10;
      
      const quote: Quote = {
        symbol,
        price: basePrice,
        change,
        changePercent: (change / basePrice) * 100,
        volume: Math.floor(Math.random() * 10000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        bid: basePrice - 0.05,
        ask: basePrice + 0.05,
        bidSize: Math.floor(Math.random() * 1000) + 100,
        askSize: Math.floor(Math.random() * 1000) + 100,
        timestamp: Date.now(),
      };
      
      this.quotes.set(symbol, quote);
    });

    logger.info(`Initialized quotes for ${this.symbols.length} symbols`);
  }

  startSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }

    this.simulationInterval = setInterval(() => {
      this.updateQuotes();
    }, 1000); // Update every second

    logger.info('Market data simulation started');
  }

  stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = undefined;
    }
    logger.info('Market data simulation stopped');
  }

  private updateQuotes(): void {
    // Update 1-3 random symbols each cycle
    const symbolsToUpdate = this.getRandomSymbols(1, 3);
    
    symbolsToUpdate.forEach(symbol => {
      const currentQuote = this.quotes.get(symbol);
      if (!currentQuote) return;

      // Generate realistic price movement
      const volatility = 0.02; // 2% max change per update
      const changePercent = (Math.random() - 0.5) * 2 * volatility;
      const newPrice = currentQuote.price * (1 + changePercent);
      const change = newPrice - currentQuote.price;

      const updatedQuote: Quote = {
        ...currentQuote,
        price: Math.max(newPrice, 0.01), // Prevent negative prices
        change,
        changePercent: (change / currentQuote.price) * 100,
        volume: currentQuote.volume + Math.floor(Math.random() * 10000),
        bid: newPrice - 0.05,
        ask: newPrice + 0.05,
        timestamp: Date.now(),
      };

      this.quotes.set(symbol, updatedQuote);
      this.emit('quote', updatedQuote);
    });
  }

  private getRandomSymbols(min: number, max: number): string[] {
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffled = [...this.symbols].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  getAllQuotes(): Quote[] {
    return Array.from(this.quotes.values());
  }

  getQuotes(symbols: string[]): Quote[] {
    return symbols
      .map(symbol => this.quotes.get(symbol))
      .filter((quote): quote is Quote => quote !== undefined);
  }

  generateOrderBook(symbol: string, levels = 10): OrderBook {
    const quote = this.quotes.get(symbol);
    if (!quote) {
      throw new Error(`Quote not found for symbol: ${symbol}`);
    }

    const { bid, ask } = quote;
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    // Generate realistic bid levels
    for (let i = 0; i < levels; i++) {
      const price = (bid || quote.price) - (i * 0.01);
      const size = Math.floor(Math.random() * 1000) + 100;
      bids.push({ price, size });
    }

    // Generate realistic ask levels
    for (let i = 0; i < levels; i++) {
      const price = (ask || quote.price) + (i * 0.01);
      const size = Math.floor(Math.random() * 1000) + 100;
      asks.push({ price, size });
    }

    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now(),
    };
  }

  generateHistoricalData(symbol: string, days = 30): OHLCV[] {
    const data: OHLCV[] = [];
    const quote = this.quotes.get(symbol);
    if (!quote) {
      throw new Error(`Quote not found for symbol: ${symbol}`);
    }

    let currentPrice = quote.price;
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (let i = days; i >= 0; i--) {
      const timestamp = Date.now() - (i * oneDayMs);
      
      // Generate realistic OHLCV data
      const volatility = 0.05; // 5% daily volatility
      const change = (Math.random() - 0.5) * 2 * volatility;
      
      const open = currentPrice;
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(Math.random() * 5000000) + 1000000;

      data.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });

      currentPrice = close;
    }

    return data;
  }

  getMarketStatus() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    
    // Simple market hours: Monday-Friday, 9:30 AM - 4:00 PM EST
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isMarketHours = hour >= 9.5 && hour < 16;
    const isOpen = isWeekday && isMarketHours;

    return {
      isOpen,
      session: isOpen ? 'regular' : 'closed',
      nextOpen: isOpen ? undefined : this.getNextMarketOpen(now),
      nextClose: isOpen ? this.getNextMarketClose(now) : undefined,
    };
  }

  private getNextMarketOpen(now: Date): number {
    const next = new Date(now);
    next.setHours(9, 30, 0, 0);
    
    // If it's weekend or past market hours, move to next weekday
    if (now.getDay() === 0 || now.getDay() === 6 || 
        (now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 16)) {
      const daysToAdd = now.getDay() === 0 ? 1 : // Sunday -> Monday
                       now.getDay() === 6 ? 2 : // Saturday -> Monday
                       now.getHours() >= 16 ? 1 : 0; // After hours -> next day
      next.setDate(next.getDate() + daysToAdd);
    }
    
    return next.getTime();
  }

  private getNextMarketClose(now: Date): number {
    const next = new Date(now);
    next.setHours(16, 0, 0, 0);
    return next.getTime();
  }
}