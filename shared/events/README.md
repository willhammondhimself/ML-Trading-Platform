# Shared Events Library

## Purpose
Shared event definitions and message schemas for inter-service communication via Kafka.

## Features (Planned)
- Event type definitions
- Message schemas with Zod validation
- Event builders and publishers
- Event consumers and handlers
- Serialization utilities

## Development Status
🚧 **In Development** - Package structure ready for implementation

## Usage
```typescript
import { OrderCreatedEvent, OrderFilledEvent } from '@ml-trading/events';

// Create event
const event: OrderCreatedEvent = {
  type: 'order.created',
  orderId: 'order-123',
  userId: 'user-456',
  timestamp: new Date()
};
```