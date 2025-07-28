import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { OrderModel, CreateOrderData } from '../models/order';
import { TradeModel } from '../models/trade';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';
import { getProcessingStatus } from '../services/order-processor';
import { logger } from '../utils/logger';

const router: ExpressRouter = ExpressRouter();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const CreateOrderSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']),
  quantity: z.string().refine(val => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Quantity must be a positive number'),
  price: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Price must be a positive number'),
  stopPrice: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Stop price must be a positive number'),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'DAY']).default('GTC'),
  expiresAt: z.string().datetime().optional()
});

const UpdateOrderSchema = z.object({
  quantity: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Quantity must be a positive number'),
  price: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Price must be a positive number'),
  stopPrice: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Stop price must be a positive number')
});

const OrderQuerySchema = z.object({
  status: z.enum(['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']).optional(),
  symbol: z.string().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']).optional(),
  limit: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseInt(val);
    return !isNaN(num) && num > 0 && num <= 100;
  }, 'Limit must be between 1 and 100'),
  offset: z.string().optional().refine(val => {
    if (val === undefined) return true;
    const num = parseInt(val);
    return !isNaN(num) && num >= 0;
  }, 'Offset must be non-negative'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * POST /api/orders
 * Create a new order
 */
router.post('/', validateRequest(CreateOrderSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const orderData = req.body as z.infer<typeof CreateOrderSchema>;

    // Validate order type specific requirements
    if (orderData.type === 'LIMIT' && !orderData.price) {
      return res.status(400).json({
        error: 'Price is required for limit orders'
      });
    }

    if ((orderData.type === 'STOP' || orderData.type === 'STOP_LIMIT') && !orderData.stopPrice) {
      return res.status(400).json({
        error: 'Stop price is required for stop orders'
      });
    }

    if (orderData.type === 'STOP_LIMIT' && !orderData.price) {
      return res.status(400).json({
        error: 'Both price and stop price are required for stop-limit orders'
      });
    }

    // Create order data
    const createData: CreateOrderData = {
      userId,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      quantity: orderData.quantity,
      price: orderData.price,
      stopPrice: orderData.stopPrice,
      timeInForce: orderData.timeInForce,
      expiresAt: orderData.expiresAt ? new Date(orderData.expiresAt) : undefined
    };

    const order = await OrderModel.create(createData);

    logger.info('Order created', {
      orderId: order.id,
      userId,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      quantity: orderData.quantity
    });

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        stopPrice: order.stop_price,
        status: order.status,
        timeInForce: order.time_in_force,
        placedAt: order.placed_at,
        expiresAt: order.expires_at
      }
    });

  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({
      error: 'Failed to create order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders
 * Get user's orders with optional filtering
 */
router.get('/', validateRequest(OrderQuerySchema, 'query'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as z.infer<typeof OrderQuerySchema>;

    const options = {
      status: query.status,
      symbol: query.symbol,
      side: query.side,
      type: query.type,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined
    };

    const result = await OrderModel.findByUserId(userId, options);

    res.json({
      orders: result.orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        stopPrice: order.stop_price,
        filledQuantity: order.filled_quantity,
        averagePrice: order.average_price,
        status: order.status,
        timeInForce: order.time_in_force,
        placedAt: order.placed_at,
        expiresAt: order.expires_at,
        updatedAt: order.updated_at
      })),
      pagination: {
        total: result.total,
        limit: options.limit || 50,
        offset: options.offset || 0,
        hasMore: (options.offset || 0) + result.orders.length < result.total
      }
    });

  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/:id
 * Get specific order by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const orderId = req.params.id;

    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // Ensure user can only access their own orders
    if (order.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Get trades for this order
    const trades = await TradeModel.findByOrderId(orderId);

    res.json({
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        stopPrice: order.stop_price,
        filledQuantity: order.filled_quantity,
        averagePrice: order.average_price,
        status: order.status,
        timeInForce: order.time_in_force,
        placedAt: order.placed_at,
        expiresAt: order.expires_at,
        updatedAt: order.updated_at,
        trades: trades.map(trade => ({
          id: trade.id,
          quantity: trade.quantity,
          price: trade.price,
          commission: trade.commission,
          executedAt: trade.executed_at,
          executionVenue: trade.execution_venue
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching order:', error);
    res.status(500).json({
      error: 'Failed to fetch order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/orders/:id
 * Update order (only certain fields can be updated)
 */
router.patch('/:id', validateRequest(UpdateOrderSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const orderId = req.params.id;
    const updateData = req.body as z.infer<typeof UpdateOrderSchema>;

    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // Ensure user can only update their own orders
    if (order.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Only allow updates to orders that are not filled, cancelled, or rejected
    if (['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status)) {
      return res.status(400).json({
        error: 'Cannot update order in current status',
        status: order.status
      });
    }

    const updatedOrder = await OrderModel.updateOrder(orderId, updateData);

    if (!updatedOrder) {
      return res.status(400).json({
        error: 'Failed to update order'
      });
    }

    logger.info('Order updated', {
      orderId,
      userId,
      updateData
    });

    res.json({
      message: 'Order updated successfully',
      order: {
        id: updatedOrder.id,
        symbol: updatedOrder.symbol,
        side: updatedOrder.side,
        type: updatedOrder.type,
        quantity: updatedOrder.quantity,
        price: updatedOrder.price,
        stopPrice: updatedOrder.stop_price,
        status: updatedOrder.status,
        timeInForce: updatedOrder.time_in_force,
        placedAt: updatedOrder.placed_at,
        expiresAt: updatedOrder.expires_at,
        updatedAt: updatedOrder.updated_at
      }
    });

  } catch (error) {
    logger.error('Error updating order:', error);
    res.status(500).json({
      error: 'Failed to update order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/orders/:id
 * Cancel an order
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const orderId = req.params.id;

    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // Ensure user can only cancel their own orders
    if (order.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    const cancelledOrder = await OrderModel.cancelOrder(orderId, 'User requested cancellation');

    if (!cancelledOrder) {
      return res.status(400).json({
        error: 'Cannot cancel order',
        status: order.status
      });
    }

    logger.info('Order cancelled', {
      orderId,
      userId
    });

    res.json({
      message: 'Order cancelled successfully',
      order: {
        id: cancelledOrder.id,
        status: cancelledOrder.status,
        cancelledAt: cancelledOrder.updated_at
      }
    });

  } catch (error) {
    logger.error('Error cancelling order:', error);
    res.status(500).json({
      error: 'Failed to cancel order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/status
 * Get order processing status
 */
router.get('/status/processing', async (req, res) => {
  try {
    const status = getProcessingStatus();
    
    res.json({
      orderProcessor: status
    });

  } catch (error) {
    logger.error('Error getting processing status:', error);
    res.status(500).json({
      error: 'Failed to get processing status'
    });
  }
});

export default router;