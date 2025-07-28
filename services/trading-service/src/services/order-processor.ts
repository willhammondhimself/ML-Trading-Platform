import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { OrderModel, DbOrder, DbOrderStatus } from '../models/order';
import { TradeModel } from '../models/trade';
import { PositionModel } from '../models/position';
import { MarketDataCache, OrderLockService } from './redis-service';
import { publishOrderEvent, publishTradeEvent, publishPositionEvent, TradingEventTypes } from './kafka-service';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';

let processingQueue: PQueue;
let isProcessing = false;
let processingInterval: NodeJS.Timeout | null = null;

/**
 * Start the order processor service
 */
export const startOrderProcessor = async (): Promise<void> => {
  if (isProcessing) {
    logger.warn('Order processor is already running');
    return;
  }

  const env = getEnvironment();
  const processId = `trading-service-${process.pid}-${uuidv4()}`;
  
  // Initialize processing queue with concurrency limit
  processingQueue = new PQueue({
    concurrency: 10, // Process up to 10 orders simultaneously
    interval: 1000, // Rate limit to 10 orders per second
    intervalCap: 10
  });

  isProcessing = true;
  
  // Start periodic processing
  const intervalMs = parseInt(env.ORDER_PROCESSING_INTERVAL_MS);
  processingInterval = setInterval(async () => {
    try {
      await processOrders(processId);
    } catch (error) {
      logger.error('Error in order processing cycle:', error);
    }
  }, intervalMs);

  logger.info('Order processor started', {
    processId,
    intervalMs,
    concurrency: 10
  });
};

/**
 * Stop the order processor service
 */
export const stopOrderProcessor = async (): Promise<void> => {
  if (!isProcessing) {
    return;
  }

  isProcessing = false;
  
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }

  if (processingQueue) {
    await processingQueue.onIdle();
    processingQueue.clear();
  }

  logger.info('Order processor stopped');
};

/**
 * Process pending orders
 */
const processOrders = async (processId: string): Promise<void> => {
  try {
    // Get pending orders
    const pendingOrders = await OrderModel.findPendingOrders(50); // Process up to 50 orders per cycle
    
    if (pendingOrders.length === 0) {
      return;
    }

    logger.debug(`Processing ${pendingOrders.length} pending orders`);

    // Add each order to the processing queue
    for (const order of pendingOrders) {
      processingQueue.add(() => processOrder(order, processId));
    }

    // Clean up expired orders
    const expiredCount = await OrderModel.expireOrders();
    if (expiredCount > 0) {
      logger.info(`Expired ${expiredCount} orders`);
    }

  } catch (error) {
    logger.error('Error processing orders:', error);
  }
};

/**
 * Process a single order
 */
const processOrder = async (order: DbOrder, processId: string): Promise<void> => {
  // Acquire lock for this order to prevent race conditions
  const lockAcquired = await OrderLockService.acquireLock(order.id, processId, 30);
  
  if (!lockAcquired) {
    logger.debug(`Order ${order.id} is already being processed by another instance`);
    return;
  }

  try {
    await pRetry(
      () => processOrderInternal(order),
      {
        retries: 3,
        minTimeout: 100,
        maxTimeout: 1000,
        onFailedAttempt: (error) => {
          logger.warn(`Order processing attempt failed: ${order.id}`, {
            attempt: error.attemptNumber,
            error: error.message
          });
        }
      }
    );
  } catch (error) {
    logger.error(`Failed to process order after retries: ${order.id}`, error);
    
    // Mark order as rejected
    await OrderModel.rejectOrder(order.id, `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Publish rejection event
    await publishOrderEvent(TradingEventTypes.ORDER_REJECTED, {
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      reason: 'Processing failed'
    });
  } finally {
    // Always release the lock
    await OrderLockService.releaseLock(order.id, processId);
  }
};

/**
 * Internal order processing logic
 */
const processOrderInternal = async (order: DbOrder): Promise<void> => {
  logger.debug(`Processing order: ${order.id}`, {
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    quantity: order.quantity
  });

  // Step 1: Validate order
  const validationResult = await validateOrder(order);
  if (!validationResult.isValid) {
    await OrderModel.rejectOrder(order.id, validationResult.reason);
    
    await publishOrderEvent(TradingEventTypes.ORDER_REJECTED, {
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      reason: validationResult.reason
    });
    return;
  }

  // Step 2: Get current market price
  const marketPrice = await getCurrentMarketPrice(order.symbol);
  if (!marketPrice) {
    await OrderModel.rejectOrder(order.id, 'Market price unavailable');
    
    await publishOrderEvent(TradingEventTypes.ORDER_REJECTED, {
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      reason: 'Market price unavailable'
    });
    return;
  }

  // Step 3: Check if order can be executed
  const canExecute = await canOrderBeExecuted(order, marketPrice);
  if (!canExecute.canExecute) {
    // Mark as open if it's a limit order that can't execute yet
    if (order.type === 'LIMIT') {
      await OrderModel.markAsOpen(order.id);
      
      await publishOrderEvent(TradingEventTypes.ORDER_CREATED, {
        orderId: order.id,
        userId: order.user_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price
      });
    } else {
      // Reject market orders that can't execute
      await OrderModel.rejectOrder(order.id, canExecute.reason || 'Cannot execute order');
      
      await publishOrderEvent(TradingEventTypes.ORDER_REJECTED, {
        orderId: order.id,
        userId: order.user_id,
        symbol: order.symbol,
        reason: canExecute.reason
      });
    }
    return;
  }

  // Step 4: Execute the order
  await executeOrder(order, marketPrice);
};

/**
 * Validate order before processing
 */
const validateOrder = async (order: DbOrder): Promise<{ isValid: boolean; reason?: string }> => {
  // Check order quantities and limits
  const env = getEnvironment();
  const maxOrderQuantity = new Decimal(env.MAX_ORDER_QUANTITY);
  const orderQuantity = new Decimal(order.quantity);

  if (orderQuantity.gt(maxOrderQuantity)) {
    return { isValid: false, reason: `Order quantity exceeds maximum limit of ${maxOrderQuantity}` };
  }

  if (orderQuantity.lte(0)) {
    return { isValid: false, reason: 'Order quantity must be positive' };
  }

  // Validate prices for limit orders
  if (order.type === 'LIMIT' && (!order.price || new Decimal(order.price).lte(0))) {
    return { isValid: false, reason: 'Limit orders must have a valid price' };
  }

  // Validate stop prices for stop orders
  if ((order.type === 'STOP' || order.type === 'STOP_LIMIT') && 
      (!order.stop_price || new Decimal(order.stop_price).lte(0))) {
    return { isValid: false, reason: 'Stop orders must have a valid stop price' };
  }

  // Additional validations can be added here
  // - User account balance checks
  // - Risk limit checks
  // - Symbol trading status checks

  return { isValid: true };
};

/**
 * Get current market price for a symbol
 */
const getCurrentMarketPrice = async (symbol: string): Promise<string | null> => {
  try {
    // Try to get from cache first
    const cachedPrice = await MarketDataCache.getPrice(symbol);
    if (cachedPrice && Date.now() - cachedPrice.timestamp < 30000) { // 30 second freshness
      return cachedPrice.price;
    }

    // Fallback: call market data service (this would be implemented)
    // For now, return a mock price
    logger.warn(`No cached price available for ${symbol}, using fallback`);
    return null;

  } catch (error) {
    logger.error('Error getting market price:', { symbol, error });
    return null;
  }
};

/**
 * Check if order can be executed at current market conditions
 */
const canOrderBeExecuted = async (
  order: DbOrder, 
  marketPrice: string
): Promise<{ canExecute: boolean; reason?: string }> => {
  const marketPriceDecimal = new Decimal(marketPrice);

  switch (order.type) {
    case 'MARKET':
      // Market orders can always be executed if there's a market price
      return { canExecute: true };

    case 'LIMIT':
      if (!order.price) {
        return { canExecute: false, reason: 'Limit order missing price' };
      }
      
      const limitPrice = new Decimal(order.price);
      
      if (order.side === 'BUY') {
        // Buy limit order executes when market price <= limit price
        return { 
          canExecute: marketPriceDecimal.lte(limitPrice),
          reason: marketPriceDecimal.gt(limitPrice) ? 'Market price above limit price' : undefined
        };
      } else {
        // Sell limit order executes when market price >= limit price
        return { 
          canExecute: marketPriceDecimal.gte(limitPrice),
          reason: marketPriceDecimal.lt(limitPrice) ? 'Market price below limit price' : undefined
        };
      }

    case 'STOP':
      if (!order.stop_price) {
        return { canExecute: false, reason: 'Stop order missing stop price' };
      }
      
      const stopPrice = new Decimal(order.stop_price);
      
      if (order.side === 'BUY') {
        // Buy stop order executes when market price >= stop price
        return { 
          canExecute: marketPriceDecimal.gte(stopPrice),
          reason: marketPriceDecimal.lt(stopPrice) ? 'Market price below stop price' : undefined
        };
      } else {
        // Sell stop order executes when market price <= stop price
        return { 
          canExecute: marketPriceDecimal.lte(stopPrice),
          reason: marketPriceDecimal.gt(stopPrice) ? 'Market price above stop price' : undefined
        };
      }

    case 'STOP_LIMIT':
      // Stop-limit orders become limit orders when stop price is hit
      // This is simplified - in reality, this would be a two-step process
      if (!order.stop_price || !order.price) {
        return { canExecute: false, reason: 'Stop-limit order missing prices' };
      }
      
      const stopLimitStopPrice = new Decimal(order.stop_price);
      const stopLimitLimitPrice = new Decimal(order.price);
      
      if (order.side === 'BUY') {
        const stopTriggered = marketPriceDecimal.gte(stopLimitStopPrice);
        const limitMet = marketPriceDecimal.lte(stopLimitLimitPrice);
        return { 
          canExecute: stopTriggered && limitMet,
          reason: !stopTriggered ? 'Stop price not triggered' : 
                  !limitMet ? 'Market price above limit price' : undefined
        };
      } else {
        const stopTriggered = marketPriceDecimal.lte(stopLimitStopPrice);
        const limitMet = marketPriceDecimal.gte(stopLimitLimitPrice);
        return { 
          canExecute: stopTriggered && limitMet,
          reason: !stopTriggered ? 'Stop price not triggered' : 
                  !limitMet ? 'Market price below limit price' : undefined
        };
      }

    default:
      return { canExecute: false, reason: 'Unknown order type' };
  }
};

/**
 * Execute order and create trade
 */
const executeOrder = async (order: DbOrder, marketPrice: string): Promise<void> => {
  try {
    const executionPrice = order.type === 'MARKET' ? marketPrice : order.price || marketPrice;
    const executionQuantity = new Decimal(order.quantity).sub(order.filled_quantity);
    
    // Calculate commission (simplified - would typically be more complex)
    const commission = executionQuantity.mul(executionPrice).mul(0.001); // 0.1% commission

    // Execute order in database
    const executionResult = await OrderModel.executeOrder(
      order.id,
      executionQuantity.toString(),
      executionPrice,
      commission.toString()
    );

    if (!executionResult) {
      throw new Error('Failed to execute order in database');
    }

    // Create trade record
    const trade = await TradeModel.create({
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      side: order.side,
      quantity: executionQuantity.toString(),
      price: executionPrice,
      commission: commission.toString(),
      executionVenue: 'internal'
    });

    // Update position
    const position = await PositionModel.createOrUpdate(
      order.user_id,
      order.symbol,
      executionQuantity.toString(),
      executionPrice,
      order.side,
      marketPrice
    );

    // Publish events
    const eventType = executionResult.isFullyFilled ? 
      TradingEventTypes.ORDER_FILLED : 
      TradingEventTypes.ORDER_PARTIALLY_FILLED;

    await publishOrderEvent(eventType, {
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      filledQuantity: executionResult.order.filled_quantity,
      averagePrice: executionResult.order.average_price,
      executionPrice,
      commission: commission.toString()
    });

    await publishTradeEvent(TradingEventTypes.TRADE_EXECUTED, {
      tradeId: trade.id,
      orderId: order.id,
      userId: order.user_id,
      symbol: order.symbol,
      side: order.side,
      quantity: executionQuantity.toString(),
      price: executionPrice,
      commission: commission.toString()
    });

    await publishPositionEvent(TradingEventTypes.POSITION_UPDATED, {
      positionId: position.id,
      userId: order.user_id,
      symbol: order.symbol,
      quantity: position.quantity,
      averagePrice: position.average_price,
      marketValue: position.market_value,
      unrealizedPnl: position.unrealized_pnl
    });

    logger.info(`Order executed successfully: ${order.id}`, {
      symbol: order.symbol,
      side: order.side,
      quantity: executionQuantity.toString(),
      price: executionPrice,
      isFullyFilled: executionResult.isFullyFilled
    });

  } catch (error) {
    logger.error(`Failed to execute order: ${order.id}`, error);
    throw error;
  }
};

/**
 * Get processing queue status
 */
export const getProcessingStatus = () => {
  if (!processingQueue) {
    return { isProcessing: false, queueSize: 0, pending: 0 };
  }

  return {
    isProcessing,
    queueSize: processingQueue.size,
    pending: processingQueue.pending
  };
};