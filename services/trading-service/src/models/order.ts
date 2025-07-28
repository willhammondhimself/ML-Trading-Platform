import { z } from 'zod';
import Decimal from 'decimal.js';
import { getDatabase, withTransaction, monitorQuery } from '../database/connection';
import { 
  Order, OrderId, OrderSide, OrderType, OrderStatus, 
  UserId, Symbol, Price, Quantity 
} from '@ml-trading/domain';

// Order status enum for database
export enum DbOrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancelled
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
  DAY = 'DAY'  // Good for Day
}

// Validation schemas
export const createOrderSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']),
  quantity: z.string().refine(val => {
    const decimal = new Decimal(val);
    return decimal.gt(0) && decimal.lte(1000000);
  }, 'Quantity must be positive and not exceed 1,000,000'),
  price: z.string().optional().refine(val => {
    if (!val) return true;
    const decimal = new Decimal(val);
    return decimal.gt(0);
  }, 'Price must be positive'),
  stopPrice: z.string().optional().refine(val => {
    if (!val) return true;
    const decimal = new Decimal(val);
    return decimal.gt(0);
  }, 'Stop price must be positive'),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'DAY']).default('GTC')
});

export const updateOrderSchema = z.object({
  quantity: z.string().optional().refine(val => {
    if (!val) return true;
    const decimal = new Decimal(val);
    return decimal.gt(0) && decimal.lte(1000000);
  }),
  price: z.string().optional().refine(val => {
    if (!val) return true;
    const decimal = new Decimal(val);
    return decimal.gt(0);
  })
});

// Database order interface
export interface DbOrder {
  id: string;
  user_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: string;
  price: string | null;
  stop_price: string | null;
  status: DbOrderStatus;
  filled_quantity: string;
  average_price: string | null;
  commission: string;
  time_in_force: TimeInForce;
  placed_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  metadata: any | null;
}

// Order event interface
export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  old_status: DbOrderStatus | null;
  new_status: DbOrderStatus;
  quantity_delta: string | null;
  price: string | null;
  reason: string | null;
  occurred_at: Date;
  metadata: any | null;
}

export class OrderModel {
  private static tableName = 'orders';
  private static eventsTableName = 'order_events';

  // Create new order
  static async create(
    userId: string, 
    orderData: z.infer<typeof createOrderSchema>
  ): Promise<DbOrder> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      // Validate order data
      const validatedData = createOrderSchema.parse(orderData);
      
      // Create order
      const [order] = await trx(this.tableName)
        .insert({
          user_id: userId,
          symbol: validatedData.symbol.toUpperCase(),
          side: validatedData.side,
          type: validatedData.type,
          quantity: validatedData.quantity,
          price: validatedData.price || null,
          stop_price: validatedData.stopPrice || null,
          time_in_force: validatedData.timeInForce,
          status: DbOrderStatus.PENDING,
          filled_quantity: '0',
          commission: '0',
          expires_at: this.calculateExpiryTime(validatedData.timeInForce)
        })
        .returning('*');

      // Log order creation event
      await this.logOrderEvent(trx, order.id, 'CREATED', null, DbOrderStatus.PENDING, 'Order created');

      return order;
    });
  }

  // Find order by ID
  static async findById(orderId: string): Promise<DbOrder | null> {
    const db = getDatabase();
    
    return monitorQuery('findOrderById', 
      db(this.tableName)
        .where({ id: orderId })
        .first()
    );
  }

  // Find order by ID and user ID (for authorization)
  static async findByIdAndUserId(orderId: string, userId: string): Promise<DbOrder | null> {
    const db = getDatabase();
    
    return monitorQuery('findOrderByIdAndUserId',
      db(this.tableName)
        .where({ id: orderId, user_id: userId })
        .first()
    );
  }

  // Get user orders with pagination and filtering
  static async findByUserId(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: DbOrderStatus;
      symbol?: string;
      side?: 'BUY' | 'SELL';
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ orders: DbOrder[]; total: number }> {
    const db = getDatabase();
    const {
      limit = 50,
      offset = 0,
      status,
      symbol,
      side,
      sortBy = 'placed_at',
      sortOrder = 'desc'
    } = options;

    let query = db(this.tableName).where({ user_id: userId });
    
    // Apply filters
    if (status) query = query.where({ status });
    if (symbol) query = query.where({ symbol: symbol.toUpperCase() });
    if (side) query = query.where({ side });

    // Get total count
    const [{ count }] = await query.clone().count('* as count');
    
    // Get orders with pagination
    const orders = await monitorQuery('findOrdersByUserId',
      query
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset)
    );

    return {
      orders,
      total: parseInt(count as string)
    };
  }

  // Get open orders for a user
  static async findOpenOrdersByUserId(userId: string): Promise<DbOrder[]> {
    const db = getDatabase();
    
    return monitorQuery('findOpenOrdersByUserId',
      db(this.tableName)
        .where({
          user_id: userId,
          status: DbOrderStatus.OPEN
        })
        .orderBy('placed_at', 'desc')
    );
  }

  // Get pending orders for processing
  static async findPendingOrders(limit: number = 100): Promise<DbOrder[]> {
    const db = getDatabase();
    
    return monitorQuery('findPendingOrders',
      db(this.tableName)
        .where({ status: DbOrderStatus.PENDING })
        .orderBy('placed_at', 'asc')
        .limit(limit)
    );
  }

  // Update order status
  static async updateStatus(
    orderId: string,
    newStatus: DbOrderStatus,
    reason?: string,
    additionalUpdates?: Partial<DbOrder>
  ): Promise<DbOrder | null> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      // Get current order
      const currentOrder = await trx(this.tableName)
        .where({ id: orderId })
        .first();

      if (!currentOrder) {
        return null;
      }

      // Update order
      const [updatedOrder] = await trx(this.tableName)
        .where({ id: orderId })
        .update({
          status: newStatus,
          updated_at: new Date(),
          ...additionalUpdates
        })
        .returning('*');

      // Log status change event
      await this.logOrderEvent(
        trx,
        orderId,
        'STATUS_CHANGE',
        currentOrder.status,
        newStatus,
        reason
      );

      return updatedOrder;
    });
  }

  // Execute order (partial or full fill)
  static async executeOrder(
    orderId: string,
    executionQuantity: string,
    executionPrice: string,
    commission: string = '0'
  ): Promise<{ order: DbOrder; isFullyFilled: boolean } | null> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      const order = await trx(this.tableName)
        .where({ id: orderId })
        .first();

      if (!order) {
        return null;
      }

      const currentFilled = new Decimal(order.filled_quantity);
      const executionQty = new Decimal(executionQuantity);
      const newFilledQuantity = currentFilled.add(executionQty);
      const totalQuantity = new Decimal(order.quantity);
      
      // Calculate average price
      let newAveragePrice = executionPrice;
      if (order.average_price) {
        const currentValue = currentFilled.mul(order.average_price);
        const executionValue = executionQty.mul(executionPrice);
        const totalValue = currentValue.add(executionValue);
        newAveragePrice = totalValue.div(newFilledQuantity).toString();
      }

      // Determine new status
      const isFullyFilled = newFilledQuantity.gte(totalQuantity);
      const newStatus = isFullyFilled ? DbOrderStatus.FILLED : DbOrderStatus.PARTIALLY_FILLED;

      // Update order
      const [updatedOrder] = await trx(this.tableName)
        .where({ id: orderId })
        .update({
          filled_quantity: newFilledQuantity.toString(),
          average_price: newAveragePrice,
          commission: new Decimal(order.commission).add(commission).toString(),
          status: newStatus,
          updated_at: new Date()
        })
        .returning('*');

      // Log execution event
      await this.logOrderEvent(
        trx,
        orderId,
        'EXECUTION',
        order.status,
        newStatus,
        `Executed ${executionQuantity} at ${executionPrice}`,
        {
          execution_quantity: executionQuantity,
          execution_price: executionPrice,
          commission
        }
      );

      return {
        order: updatedOrder,
        isFullyFilled
      };
    });
  }

  // Cancel order
  static async cancelOrder(orderId: string, reason: string = 'User cancelled'): Promise<DbOrder | null> {
    return this.updateStatus(orderId, DbOrderStatus.CANCELLED, reason);
  }

  // Reject order
  static async rejectOrder(orderId: string, reason: string): Promise<DbOrder | null> {
    return this.updateStatus(orderId, DbOrderStatus.REJECTED, reason);
  }

  // Mark order as open (after validation)
  static async markAsOpen(orderId: string): Promise<DbOrder | null> {
    return this.updateStatus(orderId, DbOrderStatus.OPEN, 'Order validated and opened');
  }

  // Update order (for open orders only)
  static async updateOrder(
    orderId: string,
    updates: z.infer<typeof updateOrderSchema>
  ): Promise<DbOrder | null> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      const order = await trx(this.tableName)
        .where({ id: orderId })
        .first();

      if (!order || order.status !== DbOrderStatus.OPEN) {
        return null;
      }

      const validatedUpdates = updateOrderSchema.parse(updates);
      const updateData: any = { updated_at: new Date() };

      if (validatedUpdates.quantity) {
        updateData.quantity = validatedUpdates.quantity;
      }
      if (validatedUpdates.price) {
        updateData.price = validatedUpdates.price;
      }

      const [updatedOrder] = await trx(this.tableName)
        .where({ id: orderId })
        .update(updateData)
        .returning('*');

      // Log update event
      await this.logOrderEvent(
        trx,
        orderId,
        'UPDATED',
        order.status,
        order.status,
        'Order updated',
        validatedUpdates
      );

      return updatedOrder;
    });
  }

  // Get order events (for audit trail)
  static async getOrderEvents(orderId: string): Promise<OrderEvent[]> {
    const db = getDatabase();
    
    return monitorQuery('getOrderEvents',
      db(this.eventsTableName)
        .where({ order_id: orderId })
        .orderBy('occurred_at', 'asc')
    );
  }

  // Clean up expired orders
  static async expireOrders(): Promise<number> {
    const db = getDatabase();
    
    return withTransaction(async (trx) => {
      const now = new Date();
      
      // Find expired orders
      const expiredOrders = await trx(this.tableName)
        .where('expires_at', '<=', now)
        .whereIn('status', [DbOrderStatus.OPEN, DbOrderStatus.PARTIALLY_FILLED]);

      // Update status to expired
      let expiredCount = 0;
      for (const order of expiredOrders) {
        await trx(this.tableName)
          .where({ id: order.id })
          .update({
            status: DbOrderStatus.EXPIRED,
            updated_at: now
          });

        await this.logOrderEvent(
          trx,
          order.id,
          'EXPIRED',
          order.status,
          DbOrderStatus.EXPIRED,
          'Order expired'
        );

        expiredCount++;
      }

      return expiredCount;
    });
  }

  // Helper methods
  private static calculateExpiryTime(timeInForce: TimeInForce): Date | null {
    switch (timeInForce) {
      case TimeInForce.DAY:
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // End of trading day
        return tomorrow;
      case TimeInForce.IOC:
      case TimeInForce.FOK:
        const immediate = new Date();
        immediate.setSeconds(immediate.getSeconds() + 30); // 30 second expiry
        return immediate;
      default:
        return null; // GTC orders don't expire
    }
  }

  private static async logOrderEvent(
    trx: any,
    orderId: string,
    eventType: string,
    oldStatus: DbOrderStatus | null,
    newStatus: DbOrderStatus,
    reason?: string,
    metadata?: any
  ): Promise<void> {
    await trx(this.eventsTableName).insert({
      order_id: orderId,
      event_type: eventType,
      old_status: oldStatus,
      new_status: newStatus,
      reason,
      metadata: metadata ? JSON.stringify(metadata) : null
    });
  }
}