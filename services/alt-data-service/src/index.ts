/**
 * @fileoverview Alternative Data Service
 * Provides news, social sentiment, and external data feeds
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger } from './utils/logger';

const app: Express = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'alt-data-service',
    timestamp: new Date().toISOString()
  });
});

// Alternative data routes
app.get('/api/news', (req, res) => {
  res.json({ message: 'News endpoint - implementation pending' });
});

app.get('/api/sentiment', (req, res) => {
  res.json({ message: 'Sentiment analysis endpoint - implementation pending' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Alt Data Service running on port ${PORT}`);
});

export default app;