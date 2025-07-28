# Shared UI Library

## Purpose
Shared React component library for consistent UI across trading platform applications.

## Features (Planned)
- Trading-specific components (OrderBook, PriceChart, etc.)
- Form components with validation
- Layout components (Dashboard, Sidebar, etc.)
- Utility components (Loading, Error boundaries)
- Design system with Tailwind CSS
- Storybook for component documentation

## Development Status
🚧 **In Development** - Package structure ready for implementation

## Usage
```typescript
import { Button, OrderBook, PriceChart } from '@ml-trading/ui';

function TradingDashboard() {
  return (
    <div>
      <PriceChart symbol="AAPL" />
      <OrderBook symbol="AAPL" />
      <Button variant="primary">Place Order</Button>
    </div>
  );
}
```