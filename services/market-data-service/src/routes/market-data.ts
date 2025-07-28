/**
 * Market Data API Routes
 * RESTful endpoints for market data with caching and rate limiting
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Decimal } from 'decimal.js';

import {
  MarketDataType,
  DataProvider,
  TimePeriod,
  HistoricalDataRequest,
  MarketDataResponse,
  ResponseMetadata
} from '../types';
import { ProviderManager } from '../services/provider-manager';
import { CacheService } from '../services/cache-service';
import {
  generateQuoteCacheKey,
  generateTradeCacheKey,
  generateOrderBookCacheKey,
  generateOHLCVCacheKey,
  generateNewsCacheKey
} from '../utils/cache-key';
import { apiLogger, logApiRequest, createPerformanceTimer } from '../utils/logger';

// === Request Validation Schemas ===

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Z0-9._-]+$/)
});

const QuoteQuerySchema = z.object({
  provider: z.nativeEnum(DataProvider).optional(),
  fresh: z.enum(['true', 'false']).optional().default('false')
});

const TradesQuerySchema = z.object({
  provider: z.nativeEnum(DataProvider).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(1000)).optional().default(50),
  fresh: z.enum(['true', 'false']).optional().default('false')
});

const OrderBookQuerySchema = z.object({
  provider: z.nativeEnum(DataProvider).optional(),
  depth: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional().default(10),
  fresh: z.enum(['true', 'false']).optional().default('false')
});

const HistoricalQuerySchema = z.object({
  provider: z.nativeEnum(DataProvider).optional(),
  period: z.nativeEnum(TimePeriod).optional().default(TimePeriod.DAY),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(10000)).optional().default(100),
  adjusted: z.enum(['true', 'false']).optional().default('true')
});

const NewsQuerySchema = z.object({
  provider: z.nativeEnum(DataProvider).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional().default(20),
  since: z.string().datetime().optional(),
  fresh: z.enum(['true', 'false']).optional().default('false')
});

const MultiSymbolQuerySchema = z.object({
  symbols: z.string().transform(str => str.split(',').map(s => s.trim().toUpperCase())).pipe(z.array(z.string()).max(50))
});

// === Rate Limiting Configuration ===

const createRateLimit = (windowMs: number, maxRequests: number, message: string) => 
  rateLimit({
    windowMs,
    max: maxRequests,
    message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logApiRequest(req.method, req.path, 429, 0, { 
        rateLimited: true,
        clientIp: req.ip 
      });
      res.status(429).json({ error: message, code: 'RATE_LIMIT_EXCEEDED' });
    }
  });

// Different rate limits for different endpoint types
const quotesRateLimit = createRateLimit(60000, 1000, 'Too many quote requests'); // 1000 per minute
const tradesRateLimit = createRateLimit(60000, 500, 'Too many trade requests');  // 500 per minute
const historicalRateLimit = createRateLimit(60000, 100, 'Too many historical data requests'); // 100 per minute
const newsRateLimit = createRateLimit(60000, 200, 'Too many news requests');     // 200 per minute

export function createMarketDataRouter(
  providerManager: ProviderManager, 
  cacheService: CacheService
): Router {
  const router = Router();

  // === Middleware ===

  // Request timing middleware
  router.use((req: Request, res: Response, next: NextFunction) => {
    req.startTime = Date.now();
    next();
  });

  // Response timing middleware
  router.use((req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      const duration = Date.now() - req.startTime;
      logApiRequest(req.method, req.path, res.statusCode, duration, {
        clientIp: req.ip,
        userAgent: req.get('User-Agent')
      });
      return originalSend.call(this, data);
    } as any;
    
    next();
  });

  // === Routes ===

  /**
   * GET /quotes/:symbol
   * Get real-time quote for a symbol
   */
  router.get('/quotes/:symbol', quotesRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-quote');
      
      // Validate input
      const { symbol } = SymbolParamSchema.parse(req.params);
      const query = QuoteQuerySchema.parse(req.query);
      
      let cached = false;
      let quote = null;

      // Try cache first (unless fresh data requested)
      if (!query.fresh || query.fresh === 'false') {
        const cacheKey = generateQuoteCacheKey(
          query.provider || DataProvider.IEX_CLOUD,
          symbol
        );
        quote = await cacheService.get(cacheKey);
        cached = !!quote;
      }

      // Fetch from provider if not cached
      if (!quote) {
        quote = await providerManager.getQuote(symbol, query.provider);
        
        // Cache the result
        if (quote) {
          const cacheKey = generateQuoteCacheKey(quote.source, symbol);
          await cacheService.set(cacheKey, quote);
        }
      }

      const duration = timer.end();

      const response: MarketDataResponse<typeof quote> = {
        success: !!quote,
        data: quote,
        error: !quote ? { 
          code: 'NOT_FOUND', 
          message: `Quote not found for symbol: ${symbol}`,
          provider: query.provider || DataProvider.IEX_CLOUD
        } : undefined,
        metadata: {
          timestamp: Date.now(),
          source: quote?.source || query.provider || DataProvider.IEX_CLOUD,
          cached,
          latency: duration,
          dataQuality: quote?.quality || {
            score: 0,
            latency: duration,
            completeness: 0,
            accuracy: 0,
            staleness: 0,
            provider: query.provider || DataProvider.IEX_CLOUD,
            timestamp: Date.now()
          },
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0
        }
      };

      res.status(quote ? 200 : 404).json(response);

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /trades/:symbol
   * Get recent trades for a symbol
   */
  router.get('/trades/:symbol', tradesRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-trades');
      
      const { symbol } = SymbolParamSchema.parse(req.params);
      const query = TradesQuerySchema.parse(req.query);
      
      let cached = false;
      let trades = null;

      // Try cache first
      if (!query.fresh || query.fresh === 'false') {
        const cacheKey = generateTradeCacheKey(
          query.provider || DataProvider.IEX_CLOUD,
          symbol,
          query.limit
        );
        trades = await cacheService.get(cacheKey);
        cached = !!trades;
      }

      // Fetch from provider if not cached
      if (!trades) {
        trades = await providerManager.getTrades(symbol, query.limit, query.provider);
        
        // Cache the result
        if (trades && trades.length > 0) {
          const cacheKey = generateTradeCacheKey(trades[0].source, symbol, query.limit);
          await cacheService.set(cacheKey, trades);
        }
      }

      const duration = timer.end();

      const response: MarketDataResponse<typeof trades> = {
        success: true,
        data: trades,
        metadata: {
          timestamp: Date.now(),
          source: trades && trades.length > 0 ? trades[0].source : query.provider || DataProvider.IEX_CLOUD,
          cached,
          latency: duration,
          dataQuality: trades && trades.length > 0 ? trades[0].quality : {
            score: 0,
            latency: duration,
            completeness: 0,
            accuracy: 0,
            staleness: 0,
            provider: query.provider || DataProvider.IEX_CLOUD,
            timestamp: Date.now()
          },
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0
        }
      };

      res.json(response);

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /orderbook/:symbol
   * Get order book for a symbol
   */
  router.get('/orderbook/:symbol', quotesRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-orderbook');
      
      const { symbol } = SymbolParamSchema.parse(req.params);
      const query = OrderBookQuerySchema.parse(req.query);
      
      let cached = false;
      let orderbook = null;

      // Try cache first
      if (!query.fresh || query.fresh === 'false') {
        const cacheKey = generateOrderBookCacheKey(
          query.provider || DataProvider.IEX_CLOUD,
          symbol,
          query.depth
        );
        orderbook = await cacheService.get(cacheKey);
        cached = !!orderbook;
      }

      // Fetch from provider if not cached
      if (!orderbook) {
        orderbook = await providerManager.getOrderBook(symbol, query.depth, query.provider);
        
        // Cache the result
        if (orderbook) {
          const cacheKey = generateOrderBookCacheKey(orderbook.source, symbol, query.depth);
          await cacheService.set(cacheKey, orderbook);
        }
      }

      const duration = timer.end();

      const response: MarketDataResponse<typeof orderbook> = {
        success: !!orderbook,
        data: orderbook,
        error: !orderbook ? {
          code: 'NOT_FOUND',
          message: `Order book not found for symbol: ${symbol}`,
          provider: query.provider || DataProvider.IEX_CLOUD
        } : undefined,
        metadata: {
          timestamp: Date.now(),
          source: orderbook?.source || query.provider || DataProvider.IEX_CLOUD,
          cached,
          latency: duration,
          dataQuality: orderbook?.quality || {
            score: 0,
            latency: duration,
            completeness: 0,
            accuracy: 0,
            staleness: 0,
            provider: query.provider || DataProvider.IEX_CLOUD,
            timestamp: Date.now()
          },
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0
        }
      };

      res.status(orderbook ? 200 : 404).json(response);

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /historical/:symbol
   * Get historical OHLCV data
   */
  router.get('/historical/:symbol', historicalRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-historical');
      
      const { symbol } = SymbolParamSchema.parse(req.params);
      const query = HistoricalQuerySchema.parse(req.query);
      
      let cached = false;
      let historicalData = null;

      // Create historical data request
      const request: HistoricalDataRequest = {
        symbols: [symbol],
        period: query.period,
        startDate: query.start ? new Date(query.start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: 30 days ago
        endDate: query.end ? new Date(query.end) : new Date(),
        adjustedData: query.adjusted === 'true',
        providers: query.provider ? [query.provider] : undefined
      };

      // Try cache first
      const cacheKey = generateOHLCVCacheKey(
        query.provider || DataProvider.IEX_CLOUD,
        symbol,
        query.period,
        request.startDate.getTime(),
        request.endDate.getTime()
      );
      
      historicalData = await cacheService.get(cacheKey);
      cached = !!historicalData;

      // Fetch from provider if not cached
      if (!historicalData) {
        historicalData = await providerManager.getHistoricalData(request);
        
        // Cache the result
        if (historicalData && historicalData.length > 0) {
          await cacheService.set(cacheKey, historicalData);
        }
      }

      // Apply limit
      if (historicalData && query.limit) {
        historicalData = historicalData.slice(-query.limit); // Get most recent data
      }

      const duration = timer.end();

      const response: MarketDataResponse<typeof historicalData> = {
        success: true,
        data: historicalData,
        metadata: {
          timestamp: Date.now(),
          source: historicalData && historicalData.length > 0 ? 
            historicalData[0].source : query.provider || DataProvider.IEX_CLOUD,
          cached,
          latency: duration,
          dataQuality: historicalData && historicalData.length > 0 ? historicalData[0].quality : {
            score: 0,
            latency: duration,
            completeness: 0,
            accuracy: 0,
            staleness: 0,
            provider: query.provider || DataProvider.IEX_CLOUD,
            timestamp: Date.now()
          },
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0
        }
      };

      res.json(response);

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /news/:symbol
   * Get news for a symbol
   */
  router.get('/news/:symbol', newsRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-news');
      
      const { symbol } = SymbolParamSchema.parse(req.params);
      const query = NewsQuerySchema.parse(req.query);
      
      let cached = false;
      let news = null;

      // Try cache first
      if (!query.fresh || query.fresh === 'false') {
        const cacheKey = generateNewsCacheKey(
          query.provider || DataProvider.IEX_CLOUD,
          [symbol],
          query.limit
        );
        news = await cacheService.get(cacheKey);
        cached = !!news;
      }

      // Fetch from provider if not cached
      if (!news) {
        news = await providerManager.getNews([symbol], query.limit, query.provider);
        
        // Cache the result
        if (news && news.length > 0) {
          const cacheKey = generateNewsCacheKey(
            query.provider || DataProvider.IEX_CLOUD,
            [symbol],
            query.limit
          );
          await cacheService.set(cacheKey, news);
        }
      }

      // Filter by since parameter if provided
      if (news && query.since) {
        const sinceTimestamp = new Date(query.since).getTime();
        news = news.filter((item: any) => item.timestamp >= sinceTimestamp);
      }

      const duration = timer.end();

      const response: MarketDataResponse<typeof news> = {
        success: true,
        data: news,
        metadata: {
          timestamp: Date.now(),
          source: query.provider || DataProvider.IEX_CLOUD,
          cached,
          latency: duration,
          dataQuality: {
            score: news && news.length > 0 ? 0.8 : 0,
            latency: duration,
            completeness: news && news.length > 0 ? 1 : 0,
            accuracy: 0.9,
            staleness: 0,
            provider: query.provider || DataProvider.IEX_CLOUD,
            timestamp: Date.now()
          },
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0
        }
      };

      res.json(response);

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /batch/quotes
   * Get quotes for multiple symbols
   */
  router.get('/batch/quotes', quotesRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const timer = createPerformanceTimer('api-batch-quotes');
      
      const symbolQuery = MultiSymbolQuerySchema.parse(req.query);
      const query = QuoteQuerySchema.parse(req.query);
      
      const quotes = await Promise.allSettled(
        symbolQuery.symbols.map(symbol => 
          providerManager.getQuote(symbol, query.provider)
        )
      );

      const results = quotes.map((result, index) => ({
        symbol: symbolQuery.symbols[index],
        success: result.status === 'fulfilled' && result.value !== null,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? {
          code: 'FETCH_ERROR',
          message: result.reason.message,
          provider: query.provider || DataProvider.IEX_CLOUD
        } : undefined
      }));

      const duration = timer.end();

      const response = {
        success: true,
        data: results,
        metadata: {
          timestamp: Date.now(),
          source: query.provider || DataProvider.IEX_CLOUD,
          cached: false,
          latency: duration,
          rateLimitRemaining: res.get('X-RateLimit-Remaining') ? 
            parseInt(res.get('X-RateLimit-Remaining')!) : 0,
          totalSymbols: symbolQuery.symbols.length,
          successfulFetches: results.filter(r => r.success).length
        }
      };

      res.json(response);

    } catch (error) {
      next(error);
    }
  });

  // === Error Handling Middleware ===

  router.use((error: any, req: Request, res: Response, next: NextFunction) => {
    apiLogger.error('API Error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      query: req.query,
      params: req.params
    });

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: error.errors
        }
      });
    }

    // Handle generic errors
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: statusCode === 500 ? 'Internal server error' : error.message
      }
    });
  });

  return router;
}

// Type declaration to extend Express Request
declare global {
  namespace Express {
    interface Request {
      startTime: number;
    }
  }
}