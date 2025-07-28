import PQueue from 'p-queue';
import { PositionModel } from '../models/position';
import { MarketDataCache } from './redis-service';
import { publishPositionEvent, TradingEventTypes } from './kafka-service';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';

let updateQueue: PQueue;
let isRunning = false;
let updateInterval: NodeJS.Timeout | null = null;
let priceSubscriptions: Map<string, NodeJS.Timeout> = new Map();

/**
 * Start the position updater service
 */
export const startPositionUpdater = async (): Promise<void> => {
  if (isRunning) {
    logger.warn('Position updater is already running');
    return;
  }

  const env = getEnvironment();
  
  // Initialize processing queue
  updateQueue = new PQueue({
    concurrency: 5, // Process up to 5 position updates simultaneously
    interval: 1000, // Rate limit to 5 updates per second
    intervalCap: 5
  });

  isRunning = true;
  
  // Start periodic position value updates
  const intervalMs = parseInt(env.POSITION_UPDATE_INTERVAL_MS || '30000'); // Default 30 seconds
  updateInterval = setInterval(async () => {
    try {
      await updateAllPositions();
    } catch (error) {
      logger.error('Error in position update cycle:', error);
    }
  }, intervalMs);

  logger.info('Position updater started', {
    intervalMs,
    concurrency: 5
  });
};

/**
 * Stop the position updater service
 */
export const stopPositionUpdater = async (): Promise<void> => {
  if (!isRunning) {
    return;
  }

  isRunning = false;
  
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  // Clear all price subscriptions
  for (const [symbol, timeout] of priceSubscriptions.entries()) {
    clearTimeout(timeout);
  }
  priceSubscriptions.clear();

  if (updateQueue) {
    await updateQueue.onIdle();
    updateQueue.clear();
  }

  logger.info('Position updater stopped');
};

/**
 * Update all active positions with current market prices
 */
const updateAllPositions = async (): Promise<void> => {
  try {
    // Get all unique symbols from active positions
    const symbols = await getActiveSymbols();
    
    if (symbols.length === 0) {
      return;
    }

    logger.debug(`Updating positions for ${symbols.length} symbols`);

    // Get current prices for all symbols
    const prices = await MarketDataCache.getPrices(symbols);
    
    // Filter out symbols without valid prices
    const priceUpdates = Object.entries(prices)
      .filter(([_, priceData]) => priceData !== null)
      .map(([symbol, priceData]) => ({
        symbol,
        price: priceData!.price
      }));

    if (priceUpdates.length === 0) {
      logger.warn('No valid prices available for position updates');
      return;
    }

    // Get all users with active positions in these symbols
    const usersWithPositions = await getUsersWithActivePositions(priceUpdates.map(p => p.symbol));
    
    // Add position update tasks to queue for each user
    for (const userId of usersWithPositions) {
      updateQueue.add(() => updateUserPositions(userId, priceUpdates));
    }

  } catch (error) {
    logger.error('Error updating all positions:', error);
  }
};

/**
 * Update positions for a specific user
 */
const updateUserPositions = async (
  userId: string,
  priceUpdates: Array<{ symbol: string; price: string }>
): Promise<void> => {
  try {
    const updatedPositions = await PositionModel.updateMarketValues(userId, priceUpdates);
    
    // Publish position update events
    for (const position of updatedPositions) {
      await publishPositionEvent(TradingEventTypes.POSITION_UPDATED, {
        positionId: position.id,
        userId: position.user_id,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.average_price,
        marketValue: position.market_value,
        unrealizedPnl: position.unrealized_pnl
      });
    }

    if (updatedPositions.length > 0) {
      logger.debug(`Updated ${updatedPositions.length} positions for user ${userId}`);
    }

  } catch (error) {
    logger.error(`Error updating positions for user ${userId}:`, error);
  }
};

/**
 * Update positions for a specific symbol when price changes
 */
export const updatePositionsForSymbol = async (
  symbol: string,
  newPrice: string
): Promise<void> => {
  if (!isRunning) {
    return;
  }

  try {
    // Get all users with positions in this symbol
    const usersWithPositions = await getUsersWithActivePositions([symbol]);
    
    const priceUpdate = { symbol, price: newPrice };
    
    // Add update tasks to queue for each user
    for (const userId of usersWithPositions) {
      updateQueue.add(() => updateUserPositions(userId, [priceUpdate]));
    }

  } catch (error) {
    logger.error(`Error updating positions for symbol ${symbol}:`, error);
  }
};

/**
 * Subscribe to real-time price updates for a symbol
 */
export const subscribeToPriceUpdates = async (symbol: string): Promise<void> => {
  if (priceSubscriptions.has(symbol)) {
    return; // Already subscribed
  }

  try {
    await MarketDataCache.subscribeToPrice(symbol, async (price: string, timestamp: number) => {
      logger.debug(`Received price update for ${symbol}: ${price}`);
      await updatePositionsForSymbol(symbol, price);
    });

    logger.info(`Subscribed to price updates for ${symbol}`);
    
    // Set a cleanup timer (remove subscription if no positions after 1 hour)
    const cleanupTimer = setTimeout(async () => {
      const hasPositions = await hasActivePositionsForSymbol(symbol);
      if (!hasPositions) {
        await unsubscribeFromPriceUpdates(symbol);
      }
    }, 3600000); // 1 hour

    priceSubscriptions.set(symbol, cleanupTimer);

  } catch (error) {
    logger.error(`Error subscribing to price updates for ${symbol}:`, error);
  }
};

/**
 * Unsubscribe from price updates for a symbol
 */
export const unsubscribeFromPriceUpdates = async (symbol: string): Promise<void> => {
  const timer = priceSubscriptions.get(symbol);
  if (timer) {
    clearTimeout(timer);
    priceSubscriptions.delete(symbol);
    logger.info(`Unsubscribed from price updates for ${symbol}`);
  }
};

/**
 * Force update positions for a specific user
 */
export const forceUpdateUserPositions = async (userId: string): Promise<void> => {
  try {
    // Get all active positions for the user
    const positions = await PositionModel.findActivePositionsByUserId(userId);
    
    if (positions.length === 0) {
      return;
    }

    // Get unique symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    
    // Get current prices
    const prices = await MarketDataCache.getPrices(symbols);
    
    // Filter valid price updates
    const priceUpdates = Object.entries(prices)
      .filter(([_, priceData]) => priceData !== null)
      .map(([symbol, priceData]) => ({
        symbol,
        price: priceData!.price
      }));

    if (priceUpdates.length > 0) {
      await updateUserPositions(userId, priceUpdates);
      logger.info(`Force updated positions for user ${userId}`);
    }

  } catch (error) {
    logger.error(`Error force updating positions for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get position updater status
 */
export const getUpdaterStatus = () => {
  if (!updateQueue) {
    return { isRunning: false, queueSize: 0, pending: 0, subscriptions: 0 };
  }

  return {
    isRunning,
    queueSize: updateQueue.size,
    pending: updateQueue.pending,
    subscriptions: priceSubscriptions.size
  };
};

// Helper functions

/**
 * Get all unique symbols from active positions
 */
const getActiveSymbols = async (): Promise<string[]> => {
  try {
    const db = require('../database/connection').getDatabase();
    
    const result = await db('positions')
      .distinct('symbol')
      .whereNot({ quantity: '0' });
    
    return result.map((row: any) => row.symbol);
  } catch (error) {
    logger.error('Error getting active symbols:', error);
    return [];
  }
};

/**
 * Get all users with active positions in specified symbols
 */
const getUsersWithActivePositions = async (symbols: string[]): Promise<string[]> => {
  try {
    const db = require('../database/connection').getDatabase();
    
    const result = await db('positions')
      .distinct('user_id')
      .whereIn('symbol', symbols)
      .whereNot({ quantity: '0' });
    
    return result.map((row: any) => row.user_id);
  } catch (error) {
    logger.error('Error getting users with active positions:', error);
    return [];
  }
};

/**
 * Check if there are active positions for a symbol
 */
const hasActivePositionsForSymbol = async (symbol: string): Promise<boolean> => {
  try {
    const positions = await PositionModel.findBySymbol(symbol);
    return positions.length > 0;
  } catch (error) {
    logger.error(`Error checking positions for symbol ${symbol}:`, error);
    return false;
  }
};