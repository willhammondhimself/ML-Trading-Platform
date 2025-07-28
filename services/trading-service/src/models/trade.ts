import { z } from 'zod';
import Decimal from 'decimal.js';
import { getDatabase, monitorQuery } from '../database/connection';

// Database trade interface
export interface DbTrade {
  id: string;
  order_id: string;
  user_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  commission: string;
  executed_at: Date;
  execution_venue: string | null;
  metadata: any | null;
}

// Trade creation interface
export interface CreateTradeData {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  commission?: string;
  executionVenue?: string;
  metadata?: any;
}

export class TradeModel {
  private static tableName = 'trades';

  // Create new trade
  static async create(tradeData: CreateTradeData): Promise<DbTrade> {
    const db = getDatabase();
    
    const [trade] = await db(this.tableName)
      .insert({
        order_id: tradeData.orderId,
        user_id: tradeData.userId,
        symbol: tradeData.symbol.toUpperCase(),
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price,
        commission: tradeData.commission || '0',
        execution_venue: tradeData.executionVenue || null,
        metadata: tradeData.metadata ? JSON.stringify(tradeData.metadata) : null,
        executed_at: new Date()
      })
      .returning('*');

    return trade;
  }

  // Find trade by ID
  static async findById(tradeId: string): Promise<DbTrade | null> {
    const db = getDatabase();
    
    return monitorQuery('findTradeById',
      db(this.tableName)
        .where({ id: tradeId })
        .first()
    );
  }

  // Get trades for an order
  static async findByOrderId(orderId: string): Promise<DbTrade[]> {
    const db = getDatabase();
    
    return monitorQuery('findTradesByOrderId',
      db(this.tableName)
        .where({ order_id: orderId })
        .orderBy('executed_at', 'asc')
    );
  }

  // Get user trades with pagination and filtering
  static async findByUserId(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      symbol?: string;
      side?: 'BUY' | 'SELL';
      startDate?: Date;
      endDate?: Date;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ trades: DbTrade[]; total: number }> {
    const db = getDatabase();
    const {
      limit = 50,
      offset = 0,
      symbol,
      side,
      startDate,
      endDate,
      sortBy = 'executed_at',
      sortOrder = 'desc'
    } = options;

    let query = db(this.tableName).where({ user_id: userId });
    
    // Apply filters
    if (symbol) query = query.where({ symbol: symbol.toUpperCase() });
    if (side) query = query.where({ side });
    if (startDate) query = query.where('executed_at', '>=', startDate);
    if (endDate) query = query.where('executed_at', '<=', endDate);

    // Get total count
    const [{ count }] = await query.clone().count('* as count');
    
    // Get trades with pagination
    const trades = await monitorQuery('findTradesByUserId',
      query
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset)
    );

    return {
      trades,
      total: parseInt(count as string)
    };
  }

  // Get trades by symbol
  static async findBySymbol(
    symbol: string,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<DbTrade[]> {
    const db = getDatabase();
    const { limit = 100, startDate, endDate } = options;

    let query = db(this.tableName).where({ symbol: symbol.toUpperCase() });
    
    if (startDate) query = query.where('executed_at', '>=', startDate);
    if (endDate) query = query.where('executed_at', '<=', endDate);

    return monitorQuery('findTradesBySymbol',
      query
        .orderBy('executed_at', 'desc')
        .limit(limit)
    );
  }

  // Get user's daily trades
  static async findUserDailyTrades(
    userId: string,
    date: Date = new Date()
  ): Promise<DbTrade[]> {
    const db = getDatabase();
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return monitorQuery('findUserDailyTrades',
      db(this.tableName)
        .where({ user_id: userId })
        .whereBetween('executed_at', [startOfDay, endOfDay])
        .orderBy('executed_at', 'desc')
    );
  }

  // Calculate user's trading volume for a period
  static async calculateUserVolume(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ totalVolume: string; tradeCount: number }> {
    const db = getDatabase();
    
    const result = await monitorQuery('calculateUserVolume',
      db(this.tableName)
        .where({ user_id: userId })
        .whereBetween('executed_at', [startDate, endDate])
        .select([
          db.raw('SUM(CAST(quantity AS DECIMAL) * CAST(price AS DECIMAL)) as total_volume'),
          db.raw('COUNT(*) as trade_count')
        ])
        .first()
    );

    return {
      totalVolume: result?.total_volume || '0',
      tradeCount: parseInt(result?.trade_count) || 0
    };
  }

  // Get trading statistics for a user
  static async getUserTradingStats(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalTrades: number;
    totalVolume: string;
    totalCommissions: string;
    avgTradeSize: string;
    buyTrades: number;
    sellTrades: number;
    uniqueSymbols: number;
  }> {
    const db = getDatabase();
    
    const result = await monitorQuery('getUserTradingStats',
      db(this.tableName)
        .where({ user_id: userId })
        .whereBetween('executed_at', [startDate, endDate])
        .select([
          db.raw('COUNT(*) as total_trades'),
          db.raw('SUM(CAST(quantity AS DECIMAL) * CAST(price AS DECIMAL)) as total_volume'),
          db.raw('SUM(CAST(commission AS DECIMAL)) as total_commissions'),
          db.raw('AVG(CAST(quantity AS DECIMAL) * CAST(price AS DECIMAL)) as avg_trade_size'),
          db.raw(`COUNT(CASE WHEN side = 'BUY' THEN 1 END) as buy_trades`),
          db.raw(`COUNT(CASE WHEN side = 'SELL' THEN 1 END) as sell_trades`),
          db.raw('COUNT(DISTINCT symbol) as unique_symbols')
        ])
        .first()
    );

    return {
      totalTrades: parseInt(result?.total_trades) || 0,
      totalVolume: result?.total_volume || '0',
      totalCommissions: result?.total_commissions || '0',
      avgTradeSize: result?.avg_trade_size || '0',
      buyTrades: parseInt(result?.buy_trades) || 0,
      sellTrades: parseInt(result?.sell_trades) || 0,
      uniqueSymbols: parseInt(result?.unique_symbols) || 0
    };
  }

  // Get recent trades across all users (for market data)
  static async getRecentTrades(
    symbol?: string,
    limit: number = 100
  ): Promise<DbTrade[]> {
    const db = getDatabase();
    
    let query = db(this.tableName);
    
    if (symbol) {
      query = query.where({ symbol: symbol.toUpperCase() });
    }

    return monitorQuery('getRecentTrades',
      query
        .orderBy('executed_at', 'desc')
        .limit(limit)
    );
  }

  // Calculate symbol trading volume for a period
  static async getSymbolVolume(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ volume: string; tradeCount: number }> {
    const db = getDatabase();
    
    const result = await monitorQuery('getSymbolVolume',
      db(this.tableName)
        .where({ symbol: symbol.toUpperCase() })
        .whereBetween('executed_at', [startDate, endDate])
        .select([
          db.raw('SUM(CAST(quantity AS DECIMAL)) as volume'),
          db.raw('COUNT(*) as trade_count')
        ])
        .first()
    );

    return {
      volume: result?.volume || '0',
      tradeCount: parseInt(result?.trade_count) || 0
    };
  }

  // Get top trading symbols by volume
  static async getTopSymbolsByVolume(
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<Array<{ symbol: string; volume: string; tradeCount: number }>> {
    const db = getDatabase();
    
    return monitorQuery('getTopSymbolsByVolume',
      db(this.tableName)
        .whereBetween('executed_at', [startDate, endDate])
        .groupBy('symbol')
        .select([
          'symbol',
          db.raw('SUM(CAST(quantity AS DECIMAL) * CAST(price AS DECIMAL)) as volume'),
          db.raw('COUNT(*) as trade_count')
        ])
        .orderBy('volume', 'desc')
        .limit(limit)
    );
  }

  // Get trades with enhanced data (including order information)
  static async findTradesWithOrderInfo(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      symbol?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<Array<DbTrade & { order_type: string; order_placed_at: Date }>> {
    const db = getDatabase();
    const { limit = 50, offset = 0, symbol, startDate, endDate } = options;

    let query = db(this.tableName)
      .leftJoin('orders', 'trades.order_id', 'orders.id')
      .where('trades.user_id', userId)
      .select([
        'trades.*',
        'orders.type as order_type',
        'orders.placed_at as order_placed_at'
      ]);

    if (symbol) query = query.where('trades.symbol', symbol.toUpperCase());
    if (startDate) query = query.where('trades.executed_at', '>=', startDate);
    if (endDate) query = query.where('trades.executed_at', '<=', endDate);

    return monitorQuery('findTradesWithOrderInfo',
      query
        .orderBy('trades.executed_at', 'desc')
        .limit(limit)
        .offset(offset)
    );
  }
}