import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

import { marketDataRoutes } from './routes/marketData';
import { portfolioRoutes } from './routes/portfolio';
import { mlRoutes } from './routes/ml';
import { optionsRoutes } from './routes/options';
import { sentimentRoutes } from './routes/sentiment';
import { performanceRoutes } from './routes/performance';
import { backtestingRoutes } from './routes/backtesting';
import { advancedMLRoutes } from './routes/advancedML';
import { riskManagementRoutes } from './routes/riskManagement';
import { satelliteAnalysisRoutes } from './routes/satelliteAnalysis';
import { socialSentimentRoutes } from './routes/socialSentiment';
import { economicIndicatorsRoutes } from './routes/economicIndicators';
import { earningsSentimentRoutes } from './routes/earningsSentiment';
import { WebSocketService } from './services/websocket';
import { MarketDataService } from './services/marketData';
import { RealMarketDataService } from './services/realMarketData';
import { SentimentAnalysisService } from './services/sentimentAnalysis';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/market-data', marketDataRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/options', optionsRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/backtesting', backtestingRoutes);
app.use('/api/advanced-ml', advancedMLRoutes);
app.use('/api/risk-management', riskManagementRoutes);
app.use('/api/satellite-analysis', satelliteAnalysisRoutes);
app.use('/api/social-sentiment', socialSentimentRoutes);
app.use('/api/economic-indicators', economicIndicatorsRoutes);
app.use('/api/earnings-sentiment', earningsSentimentRoutes);

// Initialize services
const marketDataService = new MarketDataService();
const realMarketDataService = new RealMarketDataService();
const sentimentService = new SentimentAnalysisService();
const websocketService = new WebSocketService(io, marketDataService, realMarketDataService);

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Trading Platform Backend running on port ${PORT}`);
  logger.info(`📊 Market data service initialized`);
  logger.info(`🔌 WebSocket service ready`);
  
  // Start market data services
  marketDataService.startSimulation();
  
  // Start sentiment analysis real-time updates
  sentimentService.startRealTimeUpdates(30000); // Update every 30 seconds
  
  // Forward sentiment events to WebSocket clients
  sentimentService.on('sentiment-update', (data) => {
    io.emit('sentiment-update', data);
  });
  
  sentimentService.on('market-sentiment', (data) => {
    io.emit('market-sentiment', data);
  });
  
  // Start real market data updates if API keys are available
  const providerStatus = realMarketDataService.getProviderStatus();
  if (providerStatus.iex.available || providerStatus.alphavantage.available) {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD'];
    realMarketDataService.startRealTimeUpdates(symbols, 10000); // Update every 10 seconds
    logger.info('🔥 Real market data updates started', providerStatus);
  } else {
    logger.info('📊 Using simulated market data (no API keys provided)');
  }
  
  logger.info('💭 Sentiment analysis real-time updates started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, server, io };