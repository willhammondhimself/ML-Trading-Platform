import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger';

// Enable default metrics collection
collectDefaultMetrics({
  prefix: 'user_service_',
  register
});

// Custom metrics for user service
export const metrics = {
  // HTTP request metrics
  httpRequestsTotal: new Counter({
    name: 'user_service_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  }),

  httpRequestDuration: new Histogram({
    name: 'user_service_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  // Authentication metrics
  authenticationAttempts: new Counter({
    name: 'user_service_authentication_attempts_total',
    help: 'Total number of authentication attempts',
    labelNames: ['result', 'method'] // result: success|failure|blocked, method: password|mfa|refresh
  }),

  authenticationDuration: new Histogram({
    name: 'user_service_authentication_duration_seconds',
    help: 'Authentication request duration in seconds',
    labelNames: ['result', 'method'],
    buckets: [0.1, 0.5, 1, 2, 5]
  }),

  // User registration metrics
  userRegistrations: new Counter({
    name: 'user_service_user_registrations_total',
    help: 'Total number of user registrations',
    labelNames: ['result'] // result: success|failure
  }),

  // Active users
  activeUsers: new Gauge({
    name: 'user_service_active_users',
    help: 'Number of currently active users',
    labelNames: ['period'] // period: 5m|15m|1h|24h
  }),

  // Session metrics
  activeSessions: new Gauge({
    name: 'user_service_active_sessions',
    help: 'Number of active user sessions'
  }),

  sessionDuration: new Histogram({
    name: 'user_service_session_duration_seconds',
    help: 'User session duration in seconds',
    buckets: [300, 900, 1800, 3600, 7200, 14400, 28800] // 5m to 8h
  }),

  // Security metrics
  securityEvents: new Counter({
    name: 'user_service_security_events_total',
    help: 'Total number of security events',
    labelNames: ['type', 'severity'] // type: failed_login|suspicious_activity|etc, severity: low|medium|high|critical
  }),

  rateLimitHits: new Counter({
    name: 'user_service_rate_limit_hits_total',
    help: 'Total number of rate limit hits',
    labelNames: ['limiter', 'action'] // limiter: auth|global|etc, action: blocked|warned
  }),

  // Database metrics
  databaseQueries: new Counter({
    name: 'user_service_database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table', 'result'] // operation: select|insert|update|delete, result: success|error
  }),

  databaseQueryDuration: new Histogram({
    name: 'user_service_database_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 5]
  }),

  databaseConnections: new Gauge({
    name: 'user_service_database_connections',
    help: 'Number of active database connections',
    labelNames: ['state'] // state: active|idle
  }),

  // Cache metrics
  cacheOperations: new Counter({
    name: 'user_service_cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'result'] // operation: get|set|del, result: hit|miss|error
  }),

  cacheOperationDuration: new Histogram({
    name: 'user_service_cache_operation_duration_seconds',
    help: 'Cache operation duration in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1]
  }),

  // Kafka metrics
  kafkaMessages: new Counter({
    name: 'user_service_kafka_messages_total',
    help: 'Total number of Kafka messages',
    labelNames: ['topic', 'direction', 'result'] // direction: produced|consumed, result: success|error
  }),

  kafkaMessageDuration: new Histogram({
    name: 'user_service_kafka_message_duration_seconds',
    help: 'Kafka message processing duration in seconds',
    labelNames: ['topic', 'direction'],
    buckets: [0.01, 0.1, 0.5, 1, 5]
  }),

  // MFA metrics
  mfaOperations: new Counter({
    name: 'user_service_mfa_operations_total',
    help: 'Total number of MFA operations',
    labelNames: ['operation', 'result'] // operation: setup|verify|disable, result: success|failure
  }),

  // Business metrics
  passwordResets: new Counter({
    name: 'user_service_password_resets_total',
    help: 'Total number of password reset requests',
    labelNames: ['result'] // result: success|failure|expired
  }),

  emailVerifications: new Counter({
    name: 'user_service_email_verifications_total',
    help: 'Total number of email verification attempts',
    labelNames: ['result'] // result: success|failure|expired
  }),

  // Error metrics
  errors: new Counter({
    name: 'user_service_errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'endpoint'] // type: validation|authentication|database|etc
  })
};

// Middleware to track HTTP metrics
export const metricsMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode.toString();

    metrics.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode
    });

    metrics.httpRequestDuration.observe({
      method,
      route,
      status_code: statusCode
    }, duration);
  });

  next();
};

// Helper functions for tracking specific events
export const trackAuthentication = (result: 'success' | 'failure' | 'blocked', method: 'password' | 'mfa' | 'refresh', duration: number) => {
  metrics.authenticationAttempts.inc({ result, method });
  metrics.authenticationDuration.observe({ result, method }, duration);
};

export const trackRegistration = (result: 'success' | 'failure') => {
  metrics.userRegistrations.inc({ result });
};

export const trackSecurityEvent = (type: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
  metrics.securityEvents.inc({ type, severity });
};

export const trackRateLimitHit = (limiter: string, action: 'blocked' | 'warned') => {
  metrics.rateLimitHits.inc({ limiter, action });
};

export const trackDatabaseQuery = (operation: string, table: string, result: 'success' | 'error', duration: number) => {
  metrics.databaseQueries.inc({ operation, table, result });
  metrics.databaseQueryDuration.observe({ operation, table }, duration);
};

export const trackCacheOperation = (operation: 'get' | 'set' | 'del', result: 'hit' | 'miss' | 'error', duration: number) => {
  metrics.cacheOperations.inc({ operation, result });
  metrics.cacheOperationDuration.observe({ operation }, duration);
};

export const trackKafkaMessage = (topic: string, direction: 'produced' | 'consumed', result: 'success' | 'error', duration?: number) => {
  metrics.kafkaMessages.inc({ topic, direction, result });
  if (duration !== undefined) {
    metrics.kafkaMessageDuration.observe({ topic, direction }, duration);
  }
};

export const trackMfaOperation = (operation: 'setup' | 'verify' | 'disable', result: 'success' | 'failure') => {
  metrics.mfaOperations.inc({ operation, result });
};

export const trackPasswordReset = (result: 'success' | 'failure' | 'expired') => {
  metrics.passwordResets.inc({ result });
};

export const trackEmailVerification = (result: 'success' | 'failure' | 'expired') => {
  metrics.emailVerifications.inc({ result });
};

export const trackError = (type: string, endpoint?: string) => {
  metrics.errors.inc({ type, endpoint: endpoint || 'unknown' });
};

// Update active metrics periodically
export const updateActiveMetrics = async () => {
  try {
    // These would be implemented to query actual data sources
    // For now, using placeholder implementations
    
    // Update active sessions
    const activeSessions = await getActiveSessionsCount();
    metrics.activeSessions.set(activeSessions);

    // Update active users for different time periods
    const activeUsers5m = await getActiveUsersCount(5 * 60); // 5 minutes
    const activeUsers15m = await getActiveUsersCount(15 * 60); // 15 minutes
    const activeUsers1h = await getActiveUsersCount(60 * 60); // 1 hour
    const activeUsers24h = await getActiveUsersCount(24 * 60 * 60); // 24 hours

    metrics.activeUsers.set({ period: '5m' }, activeUsers5m);
    metrics.activeUsers.set({ period: '15m' }, activeUsers15m);
    metrics.activeUsers.set({ period: '1h' }, activeUsers1h);
    metrics.activeUsers.set({ period: '24h' }, activeUsers24h);

    // Update database connection metrics
    const dbStats = await getDatabaseStats();
    if (dbStats) {
      metrics.databaseConnections.set({ state: 'active' }, dbStats.activeConnections);
      metrics.databaseConnections.set({ state: 'idle' }, dbStats.idleConnections);
    }
  } catch (error) {
    logger.error('Error updating active metrics:', error);
  }
};

// Placeholder implementations - these would be replaced with actual queries
async function getActiveSessionsCount(): Promise<number> {
  // Query database for active sessions
  return 0;
}

async function getActiveUsersCount(periodSeconds: number): Promise<number> {
  // Query database for active users in the given period
  return 0;
}

async function getDatabaseStats(): Promise<{ activeConnections: number; idleConnections: number } | null> {
  // Query database connection pool stats
  return null;
}

// Export the registry for the metrics endpoint
export const metricsRegistry = register;