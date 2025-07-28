# Market Data Service

Enterprise-grade real-time market data service providing comprehensive financial data integration with WebSocket feeds, REST APIs, and intelligent caching.

## 🚀 Features

### Core Capabilities
- ✅ **Real-time WebSocket Feeds** - Live market data streaming with Socket.IO
- ✅ **REST API Endpoints** - Historical and current market data access
- ✅ **Multi-Provider Support** - IEX Cloud integration with extensible provider system
- ✅ **Intelligent Caching** - Redis-based caching with compression and TTL management
- ✅ **Rate Limiting** - Per-endpoint and per-client rate limiting
- ✅ **Circuit Breakers** - Provider failover and fault tolerance
- ✅ **Type Safety** - Full TypeScript implementation with Zod validation
- ✅ **Connection Pooling** - WebSocket connection management and monitoring

### Data Types Supported
- **Quotes** - Real-time bid/ask with spread calculation
- **Trades** - Trade history and tick data
- **Order Books** - Market depth and level 2 data
- **OHLCV** - Historical candlestick data
- **News** - Financial news and sentiment data

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   REST API      │    │  WebSocket Feed  │    │  Provider       │
│   (Express)     │    │   Manager        │    │  Manager        │
└─────────┬───────┘    └────────┬─────────┘    └─────────┬───────┘
          │                     │                        │
          └─────────────────────┼────────────────────────┘
                                │
          ┌─────────────────────▼─────────────────────────┐
          │              Core Services                    │
          │  ┌─────────────┐  ┌─────────────────────────┐ │
          │  │ Cache       │  │ Data Providers          │ │
          │  │ Service     │  │ - IEX Cloud             │ │
          │  │ (Redis)     │  │ - Alpha Vantage         │ │
          │  │             │  │ - Finnhub               │ │
          │  └─────────────┘  └─────────────────────────┘ │
          └───────────────────────────────────────────────┘
```

## 📡 API Reference

### REST Endpoints

#### Market Data
- `GET /api/v1/market-data/quotes/:symbol` - Real-time quote
- `GET /api/v1/market-data/trades/:symbol` - Recent trades
- `GET /api/v1/market-data/orderbook/:symbol` - Order book
- `GET /api/v1/market-data/historical/:symbol` - Historical OHLCV data
- `GET /api/v1/market-data/news/:symbol` - Financial news
- `GET /api/v1/market-data/batch/quotes?symbols=AAPL,MSFT` - Batch quotes

#### System
- `GET /health` - Service health status
- `GET /` - Service information

### WebSocket Events

#### Client → Server
```typescript
// Subscribe to market data
socket.emit('subscribe', {
  symbols: ['AAPL', 'MSFT'],
  dataTypes: ['quote', 'trade'],
  provider: 'IEX_CLOUD' // optional
});

// Unsubscribe
socket.emit('unsubscribe', {
  symbols: ['AAPL'],
  dataTypes: ['quote']
});

// Ping for connection health
socket.emit('ping', (response) => {
  console.log('Server time:', response.serverTime);
});
```

#### Server → Client
```typescript
// Market data updates
socket.on('market_data', (data) => {
  console.log(data.type); // 'quote', 'trade', 'orderbook', 'news'
  console.log(data.symbol); // 'AAPL'
  console.log(data.data); // Quote, Trade, OrderBook, or NewsItem
});

// System events
socket.on('provider_switch', (data) => {
  console.log(`Provider switched: ${data.from} → ${data.to}`);
});

socket.on('server_shutdown', (data) => {
  console.log('Server maintenance:', data.reason);
});
```

## 🛠️ Configuration

### Environment Variables

```bash
# Service Configuration
SERVICE_PORT=3001
SERVICE_WS_PORT=3002
SERVICE_HOST=0.0.0.0
SERVICE_ENVIRONMENT=development
ENABLE_WEBSOCKET=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0

# Provider Configuration
IEX_CLOUD_API_KEY=your_iex_cloud_token
IEX_CLOUD_ENABLED=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Caching
CACHE_DEFAULT_TTL=300
CACHE_REALTIME_TTL=30
CACHE_HISTORICAL_TTL=3600
CACHE_COMPRESSION_ENABLED=true
```

## 🚀 Getting Started

### Prerequisites
- Node.js ≥18.0.0
- Redis server
- Valid API keys for data providers

### Installation

```bash
# Navigate to service directory
cd services/market-data-service

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Development mode
npm run dev

# Production build
npm run build
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t market-data-service .

# Run with Docker Compose
docker-compose up -d
```

## 📊 Monitoring & Observability

### Health Checks
```bash
curl http://localhost:3001/health
```

### WebSocket Statistics
The service provides real-time statistics:
- Active connections count
- Subscriptions per data type
- Messages per second
- Provider health status

### Logging
Structured logging with Winston:
- API request/response logging
- Provider connection events
- WebSocket connection management
- Error tracking with stack traces

## 🔧 Development

### Project Structure
```
src/
├── config/           # Configuration management
├── providers/        # Data provider implementations
│   ├── base-provider.ts
│   └── iex-cloud-provider.ts
├── routes/          # REST API routes
├── services/        # Core services
│   ├── cache-service.ts
│   ├── provider-manager.ts
│   └── websocket-feed-manager.ts
├── types/           # TypeScript type definitions
├── utils/           # Utility functions and logging
├── server.ts        # Main server application
└── index.ts         # Entry point
```

### Adding New Data Providers
1. Extend `BaseDataProvider` class
2. Implement required abstract methods
3. Add provider to `createProvider()` in `provider-manager.ts`
4. Update configuration types

### Testing
```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 🔒 Security

- **Rate Limiting**: Multiple layers of rate limiting
- **Input Validation**: Zod schema validation
- **CORS Protection**: Configurable CORS policies
- **Helmet**: Security headers middleware
- **Connection Limits**: WebSocket connection throttling
- **Circuit Breakers**: Provider fault isolation

## 📈 Performance

- **Caching Strategy**: Multi-level caching with Redis
- **Connection Pooling**: Efficient WebSocket management
- **Compression**: Automatic data compression for large payloads
- **Request Queuing**: Provider request queuing and prioritization
- **Memory Management**: Automatic cleanup and monitoring

## 🚨 Error Handling

- **Circuit Breaker Pattern**: Automatic provider failover
- **Exponential Backoff**: Intelligent retry strategies  
- **Graceful Degradation**: Fallback mechanisms
- **Comprehensive Logging**: Full error context tracking

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Follow existing code patterns
5. Use conventional commit messages

## 📄 License

MIT License - see LICENSE file for details