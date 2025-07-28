# Trading Platform Backend

High-performance backend API for real-time trading platform with market data integration, portfolio management, and ML predictions.

## 🚀 Features

- **Real-time Market Data**: IEX Cloud + Alpha Vantage integration with fallback to simulated data
- **WebSocket Streaming**: Live quotes, order books, and market updates
- **Portfolio Management**: Track positions, P&L, and performance metrics
- **ML Predictions**: Integration with Jupyter notebook models
- **Rate Limiting**: Built-in API rate limiting and caching
- **TypeScript**: Full type safety and modern development experience

## 📊 Market Data Providers

### IEX Cloud (Primary)
- Real-time stock quotes
- Historical data (1d, 5d, 1m, 3m, 6m, 1y, 2y, 5y)
- Company financials and news
- Options data
- **Rate Limits**: 500 requests/month (free), 500K requests/month (paid)

### Alpha Vantage (Fallback)
- Global stock quotes
- Technical indicators
- Foreign exchange rates
- Crypto currencies
- **Rate Limits**: 5 API requests/minute (free), 1200/minute (paid)

## 🛠️ Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```bash
# Required for real market data
IEX_CLOUD_API_KEY=your_iex_cloud_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

### 3. Get Free API Keys

#### IEX Cloud (Recommended)
1. Sign up at [iexcloud.io](https://iexcloud.io/)
2. Get 500 free API calls/month
3. Add your publishable token to `.env`

#### Alpha Vantage (Backup)
1. Sign up at [alphavantage.co](https://www.alphavantage.co/support/#api-key)
2. Get 5 free API calls/minute
3. Add your API key to `.env`

### 4. Start Development Server
```bash
npm run dev
```

The server will start on `http://localhost:8000`

## 📡 API Endpoints

### Market Data
```
GET /api/market-data/quote/:symbol       # Single quote
GET /api/market-data/quotes              # Multiple quotes
GET /api/market-data/quotes?symbols=AAPL,GOOGL,MSFT
GET /api/market-data/history/:symbol     # Historical data
GET /api/market-data/orderbook/:symbol   # Order book
GET /api/market-data/news?symbols=AAPL   # News feed
GET /api/market-data/providers           # API status
GET /api/market-data/search?q=apple      # Symbol search
```

### Portfolio
```
GET /api/portfolio/positions             # Current positions
GET /api/portfolio/summary               # Portfolio summary
GET /api/portfolio/performance           # Performance metrics
POST /api/portfolio/orders               # Place order
GET /api/portfolio/orders                # Order history
```

### ML Predictions
```
GET /api/ml/predictions/:symbol          # ML predictions
GET /api/ml/models                       # Available models
POST /api/ml/train                       # Trigger training
```

## 🔌 WebSocket Events

Connect to `ws://localhost:8000` and use these events:

### Client → Server
```javascript
// Subscribe to real-time data
socket.emit('subscribe', { 
  symbols: ['AAPL', 'GOOGL'], 
  types: ['quotes', 'orderbook'] 
});

// Unsubscribe
socket.emit('unsubscribe', { symbols: ['AAPL'] });
```

### Server → Client
```javascript
// Real-time quotes
socket.on('quote', (quote) => {
  console.log('New quote:', quote);
});

// Order book updates
socket.on('orderbook', (orderbook) => {
  console.log('Order book:', orderbook);
});

// Market status
socket.on('market-status', (status) => {
  console.log('Market:', status);
});
```

## 📈 Data Flow

1. **Real Market Data**: API calls to IEX Cloud/Alpha Vantage with rate limiting
2. **Caching**: Quotes cached in memory with TTL
3. **WebSocket Broadcasting**: Real-time updates pushed to subscribed clients
4. **Fallback**: Simulated data when APIs unavailable

## 🔒 Rate Limiting & Caching

- **IEX Cloud**: 10 requests/second, 500/minute
- **Alpha Vantage**: 1 request/second, 5/minute
- **Caching**: 30-second TTL on quotes
- **Graceful Degradation**: Falls back to simulated data

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Lint code
npm run lint
```

## 📦 Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IEX Cloud     │    │  Alpha Vantage  │    │   Simulated     │
│   Real Data     │    │   Real Data     │    │      Data       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                ┌─────────────────▼─────────────────┐
                │     Real Market Data Service      │
                │   • Rate Limiting                 │
                │   • Caching                       │
                │   • Provider Failover             │
                └─────────────────┬─────────────────┘
                                 │
                ┌─────────────────▼─────────────────┐
                │       WebSocket Service           │
                │   • Real-time Broadcasting        │
                │   • Subscription Management       │
                │   • Event Routing                 │
                └─────────────────┬─────────────────┘
                                 │
                ┌─────────────────▼─────────────────┐
                │         API Routes                │
                │   • Market Data                   │
                │   • Portfolio                     │
                │   • ML Predictions                │
                └───────────────────────────────────┘
```

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Real market data integration
- 🔄 Professional TradingView charts
- ⏳ Options pricing engine
- ⏳ Sentiment analysis

### Phase 2
- Advanced ML models (LSTM, Transformers)
- Multi-timeframe backtesting
- Risk management systems

### Phase 3
- Alternative data sources
- Algorithmic trading strategies
- Performance optimization