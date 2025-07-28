import { z } from 'zod';
import Decimal from 'decimal.js';
import { getDatabase, withTransaction, monitorQuery } from '../database/connection';

// Database position interface
export interface DbPosition {
  id: string;
  user_id: string;
  symbol: string;
  quantity: string; // Can be negative for short positions
  average_price: string;
  market_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  opened_at: Date;
  updated_at: Date;
  metadata: any | null;
}

// Position update data
export interface PositionUpdateData {
  quantity: string;
  averagePrice: string;
  marketValue: string;
  unrealizedPnl: string;
  realizedPnl?: string;
}

export class PositionModel {
  private static tableName = 'positions';

  // Create or update position
  static async createOrUpdate(
    userId: string,
    symbol: string,
    tradeQuantity: string,
    tradePrice: string,
    tradeSide: 'BUY' | 'SELL',
    currentMarketPrice: string
  ): Promise<DbPosition> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      // Try to find existing position
      const existingPosition = await trx(this.tableName)
        .where({ user_id: userId, symbol: symbol.toUpperCase() })
        .first();

      const tradeQty = new Decimal(tradeQuantity);
      const adjustedTradeQty = tradeSide === 'BUY' ? tradeQty : tradeQty.neg();
      const marketPrice = new Decimal(currentMarketPrice);

      if (existingPosition) {
        // Update existing position
        return this.updateExistingPosition(
          trx,
          existingPosition,
          adjustedTradeQty,
          new Decimal(tradePrice),
          marketPrice
        );
      } else {
        // Create new position
        return this.createNewPosition(
          trx,
          userId,
          symbol.toUpperCase(),
          adjustedTradeQty,
          new Decimal(tradePrice),
          marketPrice
        );
      }
    });
  }

  // Find position by ID
  static async findById(positionId: string): Promise<DbPosition | null> {
    const db = getDatabase();
    
    return monitorQuery('findPositionById',
      db(this.tableName)
        .where({ id: positionId })
        .first()
    );
  }

  // Find position by user and symbol
  static async findByUserAndSymbol(userId: string, symbol: string): Promise<DbPosition | null> {
    const db = getDatabase();
    
    return monitorQuery('findPositionByUserAndSymbol',
      db(this.tableName)
        .where({ user_id: userId, symbol: symbol.toUpperCase() })
        .first()
    );
  }

  // Get all positions for a user
  static async findByUserId(userId: string): Promise<DbPosition[]> {
    const db = getDatabase();
    
    return monitorQuery('findPositionsByUserId',
      db(this.tableName)
        .where({ user_id: userId })
        .orderBy('updated_at', 'desc')
    );
  }

  // Get active positions (non-zero quantity)
  static async findActivePositionsByUserId(userId: string): Promise<DbPosition[]> {
    const db = getDatabase();
    
    return monitorQuery('findActivePositionsByUserId',
      db(this.tableName)
        .where({ user_id: userId })
        .whereNot({ quantity: '0' })
        .orderBy('updated_at', 'desc')
    );
  }

  // Get positions by symbol
  static async findBySymbol(symbol: string): Promise<DbPosition[]> {
    const db = getDatabase();
    
    return monitorQuery('findPositionsBySymbol',
      db(this.tableName)
        .where({ symbol: symbol.toUpperCase() })
        .whereNot({ quantity: '0' })
        .orderBy('updated_at', 'desc')
    );
  }

  // Update position market values with current prices
  static async updateMarketValues(
    userId: string,
    priceUpdates: Array<{ symbol: string; price: string }>
  ): Promise<DbPosition[]> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      const updatedPositions: DbPosition[] = [];

      for (const priceUpdate of priceUpdates) {
        const position = await trx(this.tableName)
          .where({
            user_id: userId,
            symbol: priceUpdate.symbol.toUpperCase()
          })
          .whereNot({ quantity: '0' })
          .first();

        if (position) {
          const quantity = new Decimal(position.quantity);
          const marketPrice = new Decimal(priceUpdate.price);
          const averagePrice = new Decimal(position.average_price);

          // Calculate new market value and unrealized P&L
          const marketValue = quantity.mul(marketPrice);
          const costBasis = quantity.mul(averagePrice);
          const unrealizedPnl = marketValue.sub(costBasis);

          const [updatedPosition] = await trx(this.tableName)
            .where({ id: position.id })
            .update({
              market_value: marketValue.toString(),
              unrealized_pnl: unrealizedPnl.toString(),
              updated_at: new Date()
            })
            .returning('*');

          updatedPositions.push(updatedPosition);
        }
      }

      return updatedPositions;
    });
  }

  // Close position (set quantity to 0)
  static async closePosition(
    userId: string,
    symbol: string,
    realizePnl: boolean = true
  ): Promise<DbPosition | null> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      const position = await trx(this.tableName)
        .where({ user_id: userId, symbol: symbol.toUpperCase() })
        .first();

      if (!position) {
        return null;
      }

      const updateData: any = {
        quantity: '0',
        market_value: '0',
        unrealized_pnl: '0',
        updated_at: new Date()
      };

      // Add unrealized P&L to realized P&L if closing
      if (realizePnl) {
        const currentRealized = new Decimal(position.realized_pnl);
        const unrealized = new Decimal(position.unrealized_pnl);
        updateData.realized_pnl = currentRealized.add(unrealized).toString();
      }

      const [updatedPosition] = await trx(this.tableName)
        .where({ id: position.id })
        .update(updateData)
        .returning('*');

      return updatedPosition;
    });
  }

  // Get portfolio summary for a user
  static async getPortfolioSummary(userId: string): Promise<{
    totalValue: string;
    totalUnrealizedPnl: string;
    totalRealizedPnl: string;
    positionCount: number;
    positions: DbPosition[];
  }> {
    const db = getDatabase();
    
    const positions = await this.findByUserId(userId);
    
    let totalValue = new Decimal(0);
    let totalUnrealizedPnl = new Decimal(0);
    let totalRealizedPnl = new Decimal(0);
    let activePositionCount = 0;

    for (const position of positions) {
      totalValue = totalValue.add(position.market_value);
      totalUnrealizedPnl = totalUnrealizedPnl.add(position.unrealized_pnl);
      totalRealizedPnl = totalRealizedPnl.add(position.realized_pnl);
      
      if (new Decimal(position.quantity).ne(0)) {
        activePositionCount++;
      }
    }

    return {
      totalValue: totalValue.toString(),
      totalUnrealizedPnl: totalUnrealizedPnl.toString(),
      totalRealizedPnl: totalRealizedPnl.toString(),
      positionCount: activePositionCount,
      positions: positions.filter(p => new Decimal(p.quantity).ne(0))
    };
  }

  // Get position performance analytics
  static async getPositionAnalytics(
    userId: string,
    symbol?: string
  ): Promise<{
    totalPositions: number;
    profitablePositions: number;
    losingPositions: number;
    totalPnl: string;
    avgPnl: string;
    bestPosition: string;
    worstPosition: string;
  }> {
    const db = getDatabase();
    
    let query = db(this.tableName).where({ user_id: userId });
    
    if (symbol) {
      query = query.where({ symbol: symbol.toUpperCase() });
    }

    const positions = await query;
    
    let profitableCount = 0;
    let losingCount = 0;
    let totalPnl = new Decimal(0);
    let bestPnl = new Decimal(0);
    let worstPnl = new Decimal(0);

    for (const position of positions) {
      const pnl = new Decimal(position.unrealized_pnl).add(position.realized_pnl);
      totalPnl = totalPnl.add(pnl);
      
      if (pnl.gt(0)) profitableCount++;
      else if (pnl.lt(0)) losingCount++;
      
      if (pnl.gt(bestPnl)) bestPnl = pnl;
      if (pnl.lt(worstPnl)) worstPnl = pnl;
    }

    const avgPnl = positions.length > 0 ? totalPnl.div(positions.length) : new Decimal(0);

    return {
      totalPositions: positions.length,
      profitablePositions: profitableCount,
      losingPositions: losingCount,
      totalPnl: totalPnl.toString(),
      avgPnl: avgPnl.toString(),
      bestPosition: bestPnl.toString(),
      worstPosition: worstPnl.toString()
    };
  }

  // Get largest positions by value
  static async getLargestPositions(
    userId: string,
    limit: number = 10
  ): Promise<DbPosition[]> {
    const db = getDatabase();
    
    return monitorQuery('getLargestPositions',
      db(this.tableName)
        .where({ user_id: userId })
        .whereNot({ quantity: '0' })
        .orderByRaw('ABS(CAST(market_value AS DECIMAL)) DESC')
        .limit(limit)
    );
  }

  // Private helper methods
  private static async createNewPosition(
    trx: any,
    userId: string,
    symbol: string,
    quantity: Decimal,
    price: Decimal,
    marketPrice: Decimal
  ): Promise<DbPosition> {
    const marketValue = quantity.mul(marketPrice);
    const costBasis = quantity.mul(price);
    const unrealizedPnl = marketValue.sub(costBasis);

    const [position] = await trx(this.tableName)
      .insert({
        user_id: userId,
        symbol,
        quantity: quantity.toString(),
        average_price: price.toString(),
        market_value: marketValue.toString(),
        unrealized_pnl: unrealizedPnl.toString(),
        realized_pnl: '0'
      })
      .returning('*');

    return position;
  }

  private static async updateExistingPosition(
    trx: any,
    existingPosition: DbPosition,
    tradeQuantity: Decimal,
    tradePrice: Decimal,
    marketPrice: Decimal
  ): Promise<DbPosition> {
    const currentQuantity = new Decimal(existingPosition.quantity);
    const currentAvgPrice = new Decimal(existingPosition.average_price);
    const currentRealizedPnl = new Decimal(existingPosition.realized_pnl);

    const newQuantity = currentQuantity.add(tradeQuantity);
    let newAvgPrice = currentAvgPrice;
    let newRealizedPnl = currentRealizedPnl;

    // If we're adding to the position (same direction)
    if (currentQuantity.isZero() || currentQuantity.sign() === tradeQuantity.sign()) {
      // Calculate new average price
      if (!newQuantity.isZero()) {
        const currentValue = currentQuantity.mul(currentAvgPrice);
        const tradeValue = tradeQuantity.mul(tradePrice);
        const totalValue = currentValue.add(tradeValue);
        newAvgPrice = totalValue.div(newQuantity);
      }
    } 
    // If we're reducing or reversing the position
    else {
      // Calculate realized P&L for the portion being closed
      const closingQuantity = Decimal.min(currentQuantity.abs(), tradeQuantity.abs());
      const realizedPnlDelta = closingQuantity.mul(tradePrice.sub(currentAvgPrice));
      
      if (currentQuantity.isNegative()) {
        newRealizedPnl = currentRealizedPnl.sub(realizedPnlDelta);
      } else {
        newRealizedPnl = currentRealizedPnl.add(realizedPnlDelta);
      }

      // If completely reversing position, use trade price as new average
      if (currentQuantity.sign() !== newQuantity.sign() && !newQuantity.isZero()) {
        newAvgPrice = tradePrice;
      }
    }

    // Calculate market value and unrealized P&L
    const marketValue = newQuantity.mul(marketPrice);
    const costBasis = newQuantity.mul(newAvgPrice);
    const unrealizedPnl = marketValue.sub(costBasis);

    const [updatedPosition] = await trx(this.tableName)
      .where({ id: existingPosition.id })
      .update({
        quantity: newQuantity.toString(),
        average_price: newAvgPrice.toString(),
        market_value: marketValue.toString(),
        unrealized_pnl: unrealizedPnl.toString(),
        realized_pnl: newRealizedPnl.toString(),
        updated_at: new Date()
      })
      .returning('*');

    return updatedPosition;
  }

  // Delete positions with zero quantity (cleanup)
  static async cleanupZeroPositions(userId?: string): Promise<number> {
    const db = getDatabase();
    
    let query = db(this.tableName).where({ quantity: '0' });
    
    if (userId) {
      query = query.where({ user_id: userId });
    }

    return query.del();
  }

  // Bulk update positions (for performance)
  static async bulkUpdateMarketValues(
    positionUpdates: Array<{
      id: string;
      marketValue: string;
      unrealizedPnl: string;
    }>
  ): Promise<void> {
    const db = getDatabase();
    
    if (positionUpdates.length === 0) return;

    await withTransaction(async (trx) => {
      for (const update of positionUpdates) {
        await trx(this.tableName)
          .where({ id: update.id })
          .update({
            market_value: update.marketValue,
            unrealized_pnl: update.unrealizedPnl,
            updated_at: new Date()
          });
      }
    });
  }
}