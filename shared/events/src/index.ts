/**
 * Shared event definitions and message schemas for the ML Trading Platform
 */

import { z } from 'zod';

// Base event schema
export const BaseEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string().datetime(),
  source: z.string(),
  version: z.string().default('1.0'),
});

// Trading events
export const TradeExecutedEventSchema = BaseEventSchema.extend({
  type: z.literal('trade.executed'),
  data: z.object({
    tradeId: z.string(),
    userId: z.string(),
    symbol: z.string(),
    side: z.enum(['buy', 'sell']),
    quantity: z.number().positive(),
    price: z.number().positive(),
    executedAt: z.string().datetime(),
  }),
});

export const OrderCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('order.created'),
  data: z.object({
    orderId: z.string(),
    userId: z.string(),
    symbol: z.string(),
    side: z.enum(['buy', 'sell']),
    quantity: z.number().positive(),
    orderType: z.enum(['market', 'limit', 'stop']),
    price: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
  }),
});

// Market data events
export const PriceUpdateEventSchema = BaseEventSchema.extend({
  type: z.literal('price.updated'),
  data: z.object({
    symbol: z.string(),
    price: z.number().positive(),
    volume: z.number().nonnegative(),
    timestamp: z.string().datetime(),
  }),
});

// ML events
export const PredictionGeneratedEventSchema = BaseEventSchema.extend({
  type: z.literal('prediction.generated'),
  data: z.object({
    modelId: z.string(),
    symbol: z.string(),
    prediction: z.number(),
    confidence: z.number().min(0).max(1),
    features: z.record(z.number()),
    timestamp: z.string().datetime(),
  }),
});

// Risk events
export const RiskAlertEventSchema = BaseEventSchema.extend({
  type: z.literal('risk.alert'),
  data: z.object({
    alertId: z.string(),
    userId: z.string(),
    riskType: z.enum(['position_limit', 'loss_limit', 'exposure_limit']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    message: z.string(),
    currentValue: z.number(),
    threshold: z.number(),
  }),
});

// User events
export const UserCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('user.created'),
  data: z.object({
    userId: z.string(),
    email: z.string().email(),
    role: z.string(),
    permissions: z.array(z.string()),
    createdAt: z.string().datetime(),
  }),
});

// Type exports
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type TradeExecutedEvent = z.infer<typeof TradeExecutedEventSchema>;
export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
export type PriceUpdateEvent = z.infer<typeof PriceUpdateEventSchema>;
export type PredictionGeneratedEvent = z.infer<typeof PredictionGeneratedEventSchema>;
export type RiskAlertEvent = z.infer<typeof RiskAlertEventSchema>;
export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;

// Union type for all events
export type TradingPlatformEvent = 
  | TradeExecutedEvent
  | OrderCreatedEvent
  | PriceUpdateEvent
  | PredictionGeneratedEvent
  | RiskAlertEvent
  | UserCreatedEvent;

// Event type constants
export const EventTypes = {
  TRADE_EXECUTED: 'trade.executed',
  ORDER_CREATED: 'order.created',
  PRICE_UPDATED: 'price.updated',
  PREDICTION_GENERATED: 'prediction.generated',
  RISK_ALERT: 'risk.alert',
  USER_CREATED: 'user.created',
} as const;

// Event validation helpers
export const validateEvent = (event: unknown): TradingPlatformEvent => {
  const baseEvent = BaseEventSchema.parse(event);
  
  switch (baseEvent.type) {
    case EventTypes.TRADE_EXECUTED:
      return TradeExecutedEventSchema.parse(event);
    case EventTypes.ORDER_CREATED:
      return OrderCreatedEventSchema.parse(event);
    case EventTypes.PRICE_UPDATED:
      return PriceUpdateEventSchema.parse(event);
    case EventTypes.PREDICTION_GENERATED:
      return PredictionGeneratedEventSchema.parse(event);
    case EventTypes.RISK_ALERT:
      return RiskAlertEventSchema.parse(event);
    case EventTypes.USER_CREATED:
      return UserCreatedEventSchema.parse(event);
    default:
      throw new Error(`Unknown event type: ${baseEvent.type}`);
  }
};

// Event creation helpers
export const createEvent = <T extends TradingPlatformEvent>(
  type: T['type'],
  data: T['data'],
  source: string
): T => {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source,
    version: '1.0',
    data,
  } as T;
};