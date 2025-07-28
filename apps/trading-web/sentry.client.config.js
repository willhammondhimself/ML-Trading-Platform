"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureTradeEvent = exports.captureOrderEvent = exports.captureFinancialError = exports.TradingErrorBoundary = void 0;
const tslib_1 = require("tslib");
const Sentry = tslib_1.__importStar(require("@sentry/nextjs"));
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development',
    debug: process.env.NODE_ENV === 'development',
    beforeSend(event, hint) {
        if (event.user) {
            delete event.user.email;
            delete event.user.ip_address;
        }
        if (event.contexts) {
            delete event.contexts.device?.name;
            delete event.contexts.os?.name;
        }
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
        if (event.tags) {
            delete event.tags.userId;
            delete event.tags.userEmail;
            delete event.tags.accountId;
        }
        if (event.transaction?.includes('trading') || event.transaction?.includes('order')) {
            event.level = 'warning';
        }
        return event;
    },
    captureUnhandledRejections: true,
    beforeSendTransaction(event) {
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
    integrations: [
        new Sentry.Replay({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
            block: [
                '.trading-input',
                '.price-input',
                '.order-form',
                '[data-sensitive]',
                '.account-balance',
                '.portfolio-value',
            ],
            mask: [
                '.user-info',
                '.financial-data',
                '.trading-data',
            ],
        }),
        new Sentry.BrowserTracing({
            routingInstrumentation: Sentry.nextRouterInstrumentation,
            tracePropagationTargets: [
                /^https:\/\/api\.ml-trading-platform\./,
                /^\/api\//,
            ],
            finalTimeout: 30000,
            beforeNavigate: context => {
                const name = context.location?.pathname;
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
    allowUrls: [
        /https:\/\/ml-trading-platform\./,
        /http:\/\/localhost/,
    ],
    denyUrls: [
        /extensions\//i,
        /^chrome:\/\//i,
        /^moz-extension:\/\//i,
    ],
    transportOptions: {
        headers: {
            'X-Compliance': 'financial-services',
        },
    },
});
exports.TradingErrorBoundary = Sentry.withErrorBoundary;
const captureFinancialError = (error, context = {}) => {
    const sanitizedContext = Object.keys(context).reduce((acc, key) => {
        const sensitiveFields = ['amount', 'balance', 'price', 'total', 'cost', 'profit', 'loss', 'userId', 'accountId'];
        if (sensitiveFields.includes(key)) {
            acc[key] = '[Redacted]';
        }
        else {
            acc[key] = context[key];
        }
        return acc;
    }, {});
    Sentry.withScope(scope => {
        scope.setTag('component', 'financial');
        scope.setLevel('error');
        scope.setContext('financial_operation', sanitizedContext);
        Sentry.captureException(error);
    });
};
exports.captureFinancialError = captureFinancialError;
const captureOrderEvent = (orderId, action, metadata = {}) => {
    Sentry.addBreadcrumb({
        category: 'order',
        message: `Order ${action}`,
        level: 'info',
        data: {
            orderId: orderId.slice(-8),
            action,
            timestamp: new Date().toISOString(),
            ...metadata,
        },
    });
};
exports.captureOrderEvent = captureOrderEvent;
const captureTradeEvent = (tradeId, symbol, side) => {
    Sentry.addBreadcrumb({
        category: 'trade',
        message: `Trade executed: ${side} ${symbol}`,
        level: 'info',
        data: {
            tradeId: tradeId.slice(-8),
            symbol,
            side,
            timestamp: new Date().toISOString(),
        },
    });
};
exports.captureTradeEvent = captureTradeEvent;
//# sourceMappingURL=sentry.client.config.js.map