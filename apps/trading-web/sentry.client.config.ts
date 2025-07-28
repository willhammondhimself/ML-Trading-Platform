import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session replay for financial audit purposes
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Environment configuration
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development',
  
  // Enhanced debugging
  debug: process.env.NODE_ENV === 'development',
  
  // Financial-specific configuration
  beforeSend(event, hint) {
    // Scrub sensitive financial data
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    
    // Remove sensitive context data
    if (event.contexts) {
      delete event.contexts.device?.name;
      delete event.contexts.os?.name;
    }
    
    // Scrub financial data from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
        if (breadcrumb.data) {
          const sensitiveFields = ['amount', 'balance', 'price', 'total', 'cost', 'profit', 'loss'];
          sensitiveFields.forEach(field => {
            if (breadcrumb.data[field]) {
              breadcrumb.data[field] = '[Redacted]';
            }
          });
        }
        return breadcrumb;
      });
    }
    
    // Remove sensitive tags
    if (event.tags) {
      delete event.tags.userId;
      delete event.tags.userEmail;
      delete event.tags.accountId;
    }
    
    // For trading operations, add special handling
    if (event.transaction?.includes('trading') || event.transaction?.includes('order')) {
      event.level = 'warning'; // Elevate trading-related errors
    }
    
    return event;
  },
  
  // Capture unhandled promise rejections
  captureUnhandledRejections: true,
  
  // Performance monitoring for trading operations
  beforeSendTransaction(event) {
    // Add financial context
    if (event.transaction?.includes('trading')) {
      event.tags = {
        ...event.tags,
        critical: 'true',
        component: 'trading',
      };
    }
    
    if (event.transaction?.includes('ml-prediction')) {
      event.tags = {
        ...event.tags,
        component: 'ml',
      };
    }
    
    return event;
  },
  
  // Integrations
  integrations: [
    new Sentry.Replay({
      // Mask sensitive elements
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      
      // Block sensitive selectors
      block: [
        '.trading-input',
        '.price-input',
        '.order-form',
        '[data-sensitive]',
        '.account-balance',
        '.portfolio-value',
      ],
      
      // Mask by class
      mask: [
        '.user-info',
        '.financial-data',
        '.trading-data',
      ],
    }),
    
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.nextRouterInstrumentation,
      
      // Track specific trading operations
      tracePropagationTargets: [
        /^https:\/\/api\.ml-trading-platform\./,
        /^\/api\//,
      ],
      
      // Performance thresholds for financial operations
      finalTimeout: 30000, // 30 seconds for complex calculations
      
      // Custom sampling based on route
      beforeNavigate: context => {
        const name = context.location?.pathname;
        
        // Higher sampling for critical trading routes
        if (name?.includes('/trading') || name?.includes('/orders')) {
          return {
            ...context,
            name,
            tags: { critical: 'true' },
          };
        }
        
        return context;
      },
    }),
  ],
  
  // Additional tags for financial context
  initialScope: {
    tags: {
      application: 'ml-trading-platform',
      component: 'frontend',
      compliance: 'financial-services',
    },
    contexts: {
      app: {
        name: 'ML Trading Platform',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      },
    },
  },
  
  // Allowed URLs for security
  allowUrls: [
    /https:\/\/ml-trading-platform\./,
    /http:\/\/localhost/,
  ],
  
  // Deny URLs to prevent data leakage
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^moz-extension:\/\//i,
  ],
  
  // Transport options for financial compliance
  transportOptions: {
    headers: {
      'X-Compliance': 'financial-services',
    },
  },
});

// Add custom error boundary for trading components
export const TradingErrorBoundary = Sentry.withErrorBoundary;

// Custom hooks for financial error tracking
export const captureFinancialError = (error: Error, context: Record<string, any> = {}) => {
  // Scrub sensitive data from context
  const sanitizedContext = Object.keys(context).reduce((acc, key) => {
    const sensitiveFields = ['amount', 'balance', 'price', 'total', 'cost', 'profit', 'loss', 'userId', 'accountId'];
    if (sensitiveFields.includes(key)) {
      acc[key] = '[Redacted]';
    } else {
      acc[key] = context[key];
    }
    return acc;
  }, {} as Record<string, any>);
  
  Sentry.withScope(scope => {
    scope.setTag('component', 'financial');
    scope.setLevel('error');
    scope.setContext('financial_operation', sanitizedContext);
    Sentry.captureException(error);
  });
};

export const captureOrderEvent = (orderId: string, action: string, metadata: Record<string, any> = {}) => {
  Sentry.addBreadcrumb({
    category: 'order',
    message: `Order ${action}`,
    level: 'info',
    data: {
      orderId: orderId.slice(-8), // Only last 8 characters for privacy
      action,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  });
};

export const captureTradeEvent = (tradeId: string, symbol: string, side: string) => {
  Sentry.addBreadcrumb({
    category: 'trade',
    message: `Trade executed: ${side} ${symbol}`,
    level: 'info',
    data: {
      tradeId: tradeId.slice(-8), // Only last 8 characters for privacy
      symbol,
      side,
      timestamp: new Date().toISOString(),
    },
  });
};