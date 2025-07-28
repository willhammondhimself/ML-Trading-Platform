/**
 * Logging Utilities for Notification Service
 * 
 * Structured logging with Winston for notification events,
 * delivery tracking, and performance monitoring.
 */

import winston from 'winston';
import { config } from '../config';
import { NotificationChannel, NotificationStatus, NotificationType, NotificationPriority } from '../types';

// Custom log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Create logger instance
export const logger = winston.createLogger({
  level: config.MONITORING.LOG_LEVEL,
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        service: 'notification-service',
        message,
        ...meta
      });
    })
  ),
  defaultMeta: {
    service: 'notification-service',
    version: config.VERSION,
    environment: config.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      format: config.NODE_ENV === 'development' 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.json()
    })
  ]
});

// Specialized loggers for different notification aspects
export const notificationLogger = {
  /**
   * Log notification creation
   */
  created: (notificationId: string, userId: string, type: NotificationType, channels: NotificationChannel[], metadata?: Record<string, any>) => {
    logger.info('Notification created', {
      notificationId,
      userId,
      type,
      channels,
      category: 'notification',
      action: 'created',
      ...metadata
    });
  },

  /**
   * Log notification sending
   */
  sending: (notificationId: string, userId: string, channel: NotificationChannel, provider: string, metadata?: Record<string, any>) => {
    logger.info('Notification sending', {
      notificationId,
      userId,
      channel,
      provider,
      category: 'notification',
      action: 'sending',
      ...metadata
    });
  },

  /**
   * Log notification sent successfully
   */
  sent: (notificationId: string, userId: string, channel: NotificationChannel, provider: string, duration: number, metadata?: Record<string, any>) => {
    logger.info('Notification sent', {
      notificationId,
      userId,
      channel,
      provider,
      duration,
      category: 'notification',
      action: 'sent',
      ...metadata
    });
  },

  /**
   * Log notification delivery
   */
  delivered: (notificationId: string, userId: string, channel: NotificationChannel, provider: string, metadata?: Record<string, any>) => {
    logger.info('Notification delivered', {
      notificationId,
      userId,
      channel,
      provider,
      category: 'notification',
      action: 'delivered',
      ...metadata
    });
  },

  /**
   * Log notification failure
   */
  failed: (notificationId: string, userId: string, channel: NotificationChannel, provider: string, error: string, attempt: number, metadata?: Record<string, any>) => {
    logger.error('Notification failed', {
      notificationId,
      userId,
      channel,
      provider,
      error,
      attempt,
      category: 'notification',
      action: 'failed',
      ...metadata
    });
  },

  /**
   * Log notification retry
   */
  retry: (notificationId: string, userId: string, channel: NotificationChannel, attempt: number, delay: number, metadata?: Record<string, any>) => {
    logger.warn('Notification retry', {
      notificationId,
      userId,
      channel,
      attempt,
      delay,
      category: 'notification',
      action: 'retry',
      ...metadata
    });
  },

  /**
   * Log notification status update
   */
  statusUpdate: (notificationId: string, userId: string, oldStatus: NotificationStatus, newStatus: NotificationStatus, metadata?: Record<string, any>) => {
    logger.info('Notification status updated', {
      notificationId,
      userId,
      oldStatus,
      newStatus,
      category: 'notification',
      action: 'status_update',
      ...metadata
    });
  }
};

export const channelLogger = {
  /**
   * Log email processing
   */
  email: (action: string, notificationId: string, recipient: string, metadata?: Record<string, any>) => {
    logger.info('Email channel processing', {
      action,
      notificationId,
      recipient,
      channel: 'email',
      category: 'channel',
      ...metadata
    });
  },

  /**
   * Log SMS processing
   */
  sms: (action: string, notificationId: string, recipient: string, metadata?: Record<string, any>) => {
    logger.info('SMS channel processing', {
      action,
      notificationId,
      recipient,
      channel: 'sms',
      category: 'channel',
      ...metadata
    });
  },

  /**
   * Log push notification processing
   */
  push: (action: string, notificationId: string, recipient: string, metadata?: Record<string, any>) => {
    logger.info('Push notification channel processing', {
      action,
      notificationId,
      recipient,
      channel: 'push',
      category: 'channel',
      ...metadata
    });
  },

  /**
   * Log webhook processing
   */
  webhook: (action: string, notificationId: string, url: string, statusCode?: number, metadata?: Record<string, any>) => {
    logger.info('Webhook channel processing', {
      action,
      notificationId,
      url,
      statusCode,
      channel: 'webhook',
      category: 'channel',
      ...metadata
    });
  }
};

export const templateLogger = {
  /**
   * Log template rendering
   */
  render: (templateId: string, type: NotificationType, channel: NotificationChannel, variables: Record<string, any>, duration: number, metadata?: Record<string, any>) => {
    logger.info('Template rendered', {
      templateId,
      type,
      channel,
      variables: Object.keys(variables),
      duration,
      category: 'template',
      action: 'render',
      ...metadata
    });
  },

  /**
   * Log template error
   */
  error: (templateId: string, type: NotificationType, channel: NotificationChannel, error: string, metadata?: Record<string, any>) => {
    logger.error('Template error', {
      templateId,
      type,
      channel,
      error,
      category: 'template',
      action: 'error',
      ...metadata
    });
  }
};

export const queueLogger = {
  /**
   * Log job added to queue
   */
  jobAdded: (queueName: string, jobId: string, jobType: string, priority: NotificationPriority, delay?: number, metadata?: Record<string, any>) => {
    logger.info('Job added to queue', {
      queueName,
      jobId,
      jobType,
      priority,
      delay,
      category: 'queue',
      action: 'job_added',
      ...metadata
    });
  },

  /**
   * Log job processing started
   */
  jobStarted: (queueName: string, jobId: string, jobType: string, attempt: number, metadata?: Record<string, any>) => {
    logger.info('Job processing started', {
      queueName,
      jobId,
      jobType,
      attempt,
      category: 'queue',
      action: 'job_started',
      ...metadata
    });
  },

  /**
   * Log job completed
   */
  jobCompleted: (queueName: string, jobId: string, jobType: string, duration: number, metadata?: Record<string, any>) => {
    logger.info('Job completed', {
      queueName,
      jobId,
      jobType,
      duration,
      category: 'queue',
      action: 'job_completed',
      ...metadata
    });
  },

  /**
   * Log job failed
   */
  jobFailed: (queueName: string, jobId: string, jobType: string, error: string, attempt: number, metadata?: Record<string, any>) => {
    logger.error('Job failed', {
      queueName,
      jobId,
      jobType,
      error,
      attempt,
      category: 'queue',
      action: 'job_failed',
      ...metadata
    });
  },

  /**
   * Log job stalled
   */
  jobStalled: (queueName: string, jobId: string, jobType: string, metadata?: Record<string, any>) => {
    logger.warn('Job stalled', {
      queueName,
      jobId,
      jobType,
      category: 'queue',
      action: 'job_stalled',
      ...metadata
    });
  }
};

export const performanceLogger = {
  /**
   * Log performance metrics
   */
  metrics: (metricName: string, value: number, unit: string, metadata?: Record<string, any>) => {
    logger.info('Performance metric', {
      metricName,
      value,
      unit,
      category: 'performance',
      ...metadata
    });
  },

  /**
   * Log database query performance
   */
  dbQuery: (query: string, duration: number, rowCount?: number, metadata?: Record<string, any>) => {
    logger.debug('Database query', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      duration,
      rowCount,
      category: 'performance',
      subcategory: 'database',
      ...metadata
    });
  },

  /**
   * Log external API call performance
   */
  apiCall: (service: string, endpoint: string, method: string, statusCode: number, duration: number, metadata?: Record<string, any>) => {
    logger.info('External API call', {
      service,
      endpoint,
      method,
      statusCode,
      duration,
      category: 'performance',
      subcategory: 'api',
      ...metadata
    });
  }
};

export const securityLogger = {
  /**
   * Log authentication events
   */
  auth: (action: string, userId?: string, ip?: string, success: boolean = true, metadata?: Record<string, any>) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, 'Authentication event', {
      action,
      userId,
      ip,
      success,
      category: 'security',
      subcategory: 'authentication',
      ...metadata
    });
  },

  /**
   * Log rate limiting events
   */
  rateLimit: (ip: string, endpoint: string, limit: number, current: number, metadata?: Record<string, any>) => {
    logger.warn('Rate limit triggered', {
      ip,
      endpoint,
      limit,
      current,
      category: 'security',
      subcategory: 'rate_limit',
      ...metadata
    });
  },

  /**
   * Log suspicious activities
   */
  suspicious: (activity: string, userId?: string, ip?: string, severity: 'low' | 'medium' | 'high' = 'medium', metadata?: Record<string, any>) => {
    logger.warn('Suspicious activity detected', {
      activity,
      userId,
      ip,
      severity,
      category: 'security',
      subcategory: 'suspicious',
      ...metadata
    });
  }
};

export const kafkaLogger = {
  /**
   * Log Kafka connection events
   */
  connection: (status: string, metadata?: Record<string, any>) => {
    logger.info('Kafka connection status', {
      status,
      category: 'kafka',
      subcategory: 'connection',
      ...metadata
    });
  },

  /**
   * Log message production
   */
  messageProduced: (topic: string, partition: number, offset: string, messageSize: number, metadata?: Record<string, any>) => {
    logger.debug('Kafka message produced', {
      topic,
      partition,
      offset,
      messageSize,
      category: 'kafka',
      subcategory: 'producer',
      ...metadata
    });
  },

  /**
   * Log message consumption
   */
  messageConsumed: (topic: string, partition: number, offset: string, messageSize: number, processingTime: number, metadata?: Record<string, any>) => {
    logger.debug('Kafka message consumed', {
      topic,
      partition,
      offset,
      messageSize,
      processingTime,
      category: 'kafka',
      subcategory: 'consumer',
      ...metadata
    });
  },

  /**
   * Log Kafka errors
   */
  error: (action: string, topic: string, error: string, metadata?: Record<string, any>) => {
    logger.error('Kafka error', {
      action,
      topic,
      error,
      category: 'kafka',
      subcategory: 'error',
      ...metadata
    });
  }
};

export const healthLogger = {
  /**
   * Log health check results
   */
  check: (component: string, status: 'healthy' | 'unhealthy' | 'degraded', duration: number, metadata?: Record<string, any>) => {
    const level = status === 'healthy' ? 'info' : 'warn';
    logger.log(level, 'Health check', {
      component,
      status,
      duration,
      category: 'health',
      ...metadata
    });
  }
};

/**
 * Create a timer for measuring operation duration
 */
export const createTimer = (operation: string, metadata?: Record<string, any>) => {
  const startTime = Date.now();
  
  return {
    end: (additionalMetadata?: Record<string, any>) => {
      const duration = Date.now() - startTime;
      performanceLogger.metrics(operation, duration, 'ms', {
        ...metadata,
        ...additionalMetadata
      });
      return duration;
    }
  };
};

/**
 * Log error with context
 */
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

/**
 * Log warning with context
 */
export const logWarning = (message: string, context?: Record<string, any>) => {
  logger.warn(message, context);
};

/**
 * Log info with context
 */
export const logInfo = (message: string, context?: Record<string, any>) => {
  logger.info(message, context);
};

/**
 * Log debug with context
 */
export const logDebug = (message: string, context?: Record<string, any>) => {
  logger.debug(message, context);
};