import { knex, Knex } from 'knex';
import { getEnvironment } from '../config/environment';
import { logger } from '../utils/logger';

let database: Knex;

const createKnexConfig = (): Knex.Config => {
  const env = getEnvironment();
  
  return {
    client: 'postgresql',
    connection: env.DATABASE_URL,
    pool: {
      min: 5, // Higher minimum for trading service
      max: 20, // Higher maximum for concurrent operations
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './seeds',
      extension: 'ts'
    },
    debug: env.NODE_ENV === 'development',
    asyncStackTraces: env.NODE_ENV === 'development',
    log: {
      warn(message) {
        logger.warn('Database warning:', message);
      },
      error(message) {
        logger.error('Database error:', message);
      },
      deprecate(message) {
        logger.warn('Database deprecation:', message);
      },
      debug(message) {
        if (env.NODE_ENV === 'development') {
          logger.debug('Database debug:', message);
        }
      }
    }
  };
};

export const initializeDatabase = async (): Promise<Knex> => {
  try {
    const config = createKnexConfig();
    database = knex(config);

    // Test the connection
    await database.raw('SELECT 1');
    logger.info('Trading Service database connection established successfully');

    // Run migrations in production
    if (getEnvironment().NODE_ENV === 'production') {
      logger.info('Running database migrations...');
      await database.migrate.latest();
      logger.info('Database migrations completed');
    }

    return database;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
};

export const getDatabase = (): Knex => {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return database;
};

export const closeDatabase = async (): Promise<void> => {
  if (database) {
    await database.destroy();
    logger.info('Trading Service database connection closed');
  }
};

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await database.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  const db = getDatabase();
  return db.transaction(callback);
};

// Query performance monitoring
export const monitorQuery = <T>(
  queryName: string,
  query: Promise<T>
): Promise<T> => {
  const startTime = Date.now();
  
  return query
    .then((result) => {
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Log slow queries
        logger.warn(`Slow query detected: ${queryName}`, { duration });
      }
      return result;
    })
    .catch((error) => {
      const duration = Date.now() - startTime;
      logger.error(`Query failed: ${queryName}`, { error, duration });
      throw error;
    });
};

