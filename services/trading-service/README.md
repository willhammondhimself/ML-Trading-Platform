# Trading Service

## Purpose
Core trading service responsible for order management, execution, and position tracking.

## Features (Planned)
- Order lifecycle management (creation, validation, execution, cancellation)
- Position tracking and P&L calculations
- Trade execution algorithms
- Risk checks and compliance validation
- Integration with market data service
- Event-driven architecture with Kafka

## Architecture
- **Technology**: TypeScript + Node.js + Express
- **Database**: PostgreSQL for transactional data
- **Cache**: Redis for session and temporary data
- **Messaging**: Kafka for event streaming
- **API**: RESTful endpoints + WebSocket for real-time updates

## API Endpoints (Planned)
- `POST /api/orders` - Create new order
- `GET /api/orders` - List orders with filtering
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Cancel order
- `GET /api/positions` - Get current positions
- `GET /api/trades` - Trade history

## Development Status
🚧 **In Development** - Service structure and package.json ready for implementation

## Getting Started
```bash
cd services/trading-service
pnpm install
pnpm run dev
```

## Next Steps
1. Implement basic Express server structure
2. Set up database schema and migrations
3. Create order management endpoints
4. Integrate with market data service
5. Add comprehensive testing