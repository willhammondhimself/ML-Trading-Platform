/**
 * Market Data Service Entry Point
 * Application bootstrap and initialization
 */

import { config } from './config';
import { MarketDataServer } from './server';
import { serverLogger, logError } from './utils/logger';

/**
 * Bootstrap and start the market data service
 */
async function bootstrap(): Promise<void> {
  try {
    // Log startup information
    serverLogger.info('Bootstrapping Market Data Service', {
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      environment: config.service.environment,
      pid: process.pid
    });

    // Validate configuration
    validateConfiguration();

    // Create and start server
    const server = new MarketDataServer();
    await server.start();

    // Log successful startup
    serverLogger.info('Market Data Service is ready to handle requests', {
      httpPort: config.service.port,
      wsPort: config.service.wsPort,
      environment: config.service.environment,
      providers: config.providers.map(p => p.provider)
    });

  } catch (error) {
    logError(error as Error, 'bootstrap', { operation: 'startup' });
    process.exit(1);
  }
}

/**
 * Validate required configuration
 */
function validateConfiguration(): void {
  const required = [
    'service.port',
    'service.host',
    'redis.host',
    'redis.port'
  ];

  for (const path of required) {
    const value = getNestedValue(config, path);
    if (value === undefined || value === null) {
      throw new Error(`Required configuration missing: ${path}`);
    }
  }

  // Validate providers
  if (!config.providers || config.providers.length === 0) {
    throw new Error('At least one data provider must be configured');
  }

  // Validate provider API keys
  for (const provider of config.providers) {
    if (provider.enabled && !provider.apiKey) {
      serverLogger.warn(`Provider ${provider.provider} is enabled but missing API key`);
    }
  }

  serverLogger.info('Configuration validation passed');
}

/**
 * Get nested object value by dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Start the application
if (require.main === module) {
  bootstrap();
}

export { bootstrap };