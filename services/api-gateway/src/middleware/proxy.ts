/**
 * Request Proxy Middleware for API Gateway
 * 
 * Routes and proxies requests to downstream services with service discovery,
 * load balancing, circuit breaker patterns, and request/response transformation.
 */

import { Request, Response, NextFunction } from 'express';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { config } from '../config';
import { serviceDiscovery } from '../services/service-discovery';
import { redisService } from '../services/redis-service';
import { database } from '../database/connection';
import { logger, gatewayLogger, performanceLogger } from '../utils/logger';

interface ProxyOptions {
    service: string;
    pathRewrite?: Record<string, string>;
    timeout?: number;
    retries?: number;
    cacheTTL?: number;
    transformRequest?: (req: Request) => any;
    transformResponse?: (data: any, req: Request) => any;
    requireAuth?: boolean;
    preserveHeaders?: string[];
    additionalHeaders?: Record<string, string>;
}

interface ServiceCall {
    service: string;
    method: string;
    path: string;
    duration: number;
    statusCode: number;
    requestSize: number;
    responseSize: number;
    cached: boolean;
    retryCount: number;
}

class ProxyService {
    private httpClient: AxiosInstance;
    private serviceCallMetrics: Map<string, ServiceCall[]> = new Map();

    constructor() {
        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'API-Gateway/1.0.0',
                'X-Forwarded-By': 'api-gateway'
            }
        });

        // Setup request/response interceptors
        this.setupInterceptors();
    }

    private setupInterceptors(): void {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                config.metadata = { startTime: Date.now() };
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                const duration = Date.now() - response.config.metadata?.startTime;
                response.metadata = { duration };
                return response;
            },
            (error) => {
                if (error.config) {
                    const duration = Date.now() - error.config.metadata?.startTime;
                    error.metadata = { duration };
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Rewrite request path based on rules
     */
    private rewritePath(originalPath: string, pathRewrite?: Record<string, string>): string {
        if (!pathRewrite) return originalPath;

        for (const [pattern, replacement] of Object.entries(pathRewrite)) {
            const regex = new RegExp(pattern);
            if (regex.test(originalPath)) {
                return originalPath.replace(regex, replacement);
            }
        }

        return originalPath;
    }

    /**
     * Generate cache key for request
     */
    private getCacheKey(service: string, method: string, path: string, query: any, userId?: string): string {
        const queryString = new URLSearchParams(query).toString();
        const userPart = userId ? `:user:${userId}` : '';
        return `proxy_cache:${service}:${method}:${path}:${queryString}${userPart}`;
    }

    /**
     * Check if request should be cached
     */
    private shouldCache(method: string, statusCode: number): boolean {
        return method === 'GET' && statusCode >= 200 && statusCode < 300;
    }

    /**
     * Get appropriate cache TTL based on service and path
     */
    private getCacheTTL(service: string, path: string, defaultTTL?: number): number {
        if (defaultTTL) return defaultTTL;

        // Service-specific cache strategies
        if (service.includes('market-data')) {
            return config.CACHING.CACHE_STRATEGIES.MARKET_DATA;
        }
        
        if (service.includes('user') && path.includes('profile')) {
            return config.CACHING.CACHE_STRATEGIES.USER_PROFILE;
        }
        
        if (path.includes('portfolio')) {
            return config.CACHING.CACHE_STRATEGIES.PORTFOLIO_DATA;
        }
        
        if (path.includes('static') || path.includes('config')) {
            return config.CACHING.CACHE_STRATEGIES.STATIC_DATA;
        }

        return config.CACHING.DEFAULT_TTL;
    }

    /**
     * Prepare headers for downstream request
     */
    private prepareHeaders(
        req: Request, 
        options: ProxyOptions
    ): Record<string, string> {
        const headers: Record<string, string> = {
            'X-Request-ID': req.requestId || 'unknown',
            'X-Forwarded-For': req.ip || 'unknown',
            'X-Forwarded-Proto': req.protocol,
            'X-Forwarded-Host': req.get('host') || 'unknown'
        };

        // Add user context if authenticated
        if (req.auth?.userId) {
            headers['X-User-ID'] = req.auth.userId;
            headers['X-User-Tier'] = req.auth.tier;
            headers['X-Auth-Type'] = req.auth.type;
        }

        // Preserve specific headers
        if (options.preserveHeaders) {
            for (const headerName of options.preserveHeaders) {
                const value = req.get(headerName);
                if (value) {
                    headers[headerName] = value;
                }
            }
        }

        // Add additional headers
        if (options.additionalHeaders) {
            Object.assign(headers, options.additionalHeaders);
        }

        return headers;
    }

    /**
     * Log service call metrics
     */
    private async logServiceCall(
        req: Request,
        serviceCall: ServiceCall,
        error?: Error
    ): Promise<void> {
        try {
            // Log to application logs
            gatewayLogger.serviceCall(
                serviceCall.service,
                serviceCall.method,
                serviceCall.path,
                serviceCall.statusCode,
                serviceCall.duration,
                req.requestId
            );

            // Log to database
            await database.query(`
                INSERT INTO gateway.request_logs (
                    request_id, method, path, status_code, duration_ms,
                    user_id, service_name, ip_address, user_agent,
                    request_size, response_size, error_message,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            `, [
                req.requestId || 'unknown',
                serviceCall.method,
                serviceCall.path,
                serviceCall.statusCode,
                serviceCall.duration,
                req.auth?.userId || null,
                serviceCall.service,
                req.ip || null,
                req.headers['user-agent'] || null,
                serviceCall.requestSize,
                serviceCall.responseSize,
                error?.message || null
            ]);

            // Update metrics
            if (!this.serviceCallMetrics.has(serviceCall.service)) {
                this.serviceCallMetrics.set(serviceCall.service, []);
            }
            const metrics = this.serviceCallMetrics.get(serviceCall.service)!;
            metrics.push(serviceCall);

            // Keep only last 100 calls per service
            if (metrics.length > 100) {
                metrics.splice(0, metrics.length - 100);
            }

        } catch (error) {
            logger.error('Failed to log service call:', error);
        }
    }

    /**
     * Make request to downstream service with retries
     */
    private async makeServiceRequest(
        req: Request,
        targetUrl: string,
        options: ProxyOptions,
        retryCount = 0
    ): Promise<AxiosResponse> {
        const maxRetries = options.retries || 3;
        const timeout = options.timeout || 10000;

        try {
            const requestConfig: AxiosRequestConfig = {
                method: req.method as any,
                url: targetUrl,
                headers: this.prepareHeaders(req, options),
                timeout,
                validateStatus: () => true, // Don't throw on HTTP error status
                maxRedirects: 0 // Handle redirects manually
            };

            // Add request body for POST/PUT/PATCH
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                requestConfig.data = options.transformRequest ? 
                    options.transformRequest(req) : req.body;
            }

            // Add query parameters
            if (req.query && Object.keys(req.query).length > 0) {
                requestConfig.params = req.query;
            }

            const response = await this.httpClient.request(requestConfig);

            // Record successful service call
            serviceDiscovery.recordSuccess(options.service);

            return response;

        } catch (error) {
            // Record service failure
            serviceDiscovery.recordFailure(options.service);

            // Retry on network errors or 5xx responses
            if (retryCount < maxRetries && this.shouldRetry(error)) {
                logger.warn(`Service call failed, retrying (${retryCount + 1}/${maxRetries})`, {
                    service: options.service,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    retryCount: retryCount + 1,
                    requestId: req.requestId
                });

                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                
                return this.makeServiceRequest(req, targetUrl, options, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Determine if request should be retried
     */
    private shouldRetry(error: any): boolean {
        // Retry on network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return true;
        }

        // Retry on 5xx server errors
        if (error.response && error.response.status >= 500) {
            return true;
        }

        return false;
    }

    /**
     * Create proxy middleware for a specific service
     */
    createProxyMiddleware(options: ProxyOptions) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const startTime = Date.now();
            const requestId = req.requestId || 'unknown';

            try {
                // Check authentication if required
                if (options.requireAuth && !req.auth?.userId) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED',
                        message: 'This endpoint requires authentication'
                    });
                }

                // Get service instance
                const serviceInstance = serviceDiscovery.getServiceInstance(options.service);
                if (!serviceInstance) {
                    logger.error('No healthy service instance available', {
                        service: options.service,
                        requestId
                    });

                    return res.status(503).json({
                        error: 'Service unavailable',
                        code: 'SERVICE_UNAVAILABLE',
                        message: `Service ${options.service} is currently unavailable`
                    });
                }

                // Rewrite path if needed
                const originalPath = req.path;
                const rewrittenPath = this.rewritePath(originalPath, options.pathRewrite);
                const targetUrl = `${serviceInstance.url}${rewrittenPath}`;

                // Check cache for GET requests
                let cachedResponse: any = null;
                let cacheKey: string | null = null;
                
                if (config.CACHING.ENABLED && req.method === 'GET') {
                    cacheKey = this.getCacheKey(
                        options.service,
                        req.method,
                        rewrittenPath,
                        req.query,
                        req.auth?.userId
                    );
                    
                    cachedResponse = await redisService.getCachedResponse(cacheKey);
                    
                    if (cachedResponse) {
                        logger.debug('Cache hit for request', {
                            service: options.service,
                            path: rewrittenPath,
                            cacheKey,
                            requestId
                        });

                        const duration = Date.now() - startTime;
                        
                        // Log cached service call
                        const serviceCall: ServiceCall = {
                            service: options.service,
                            method: req.method,
                            path: rewrittenPath,
                            duration,
                            statusCode: 200,
                            requestSize: JSON.stringify(req.body || {}).length,
                            responseSize: JSON.stringify(cachedResponse).length,
                            cached: true,
                            retryCount: 0
                        };

                        await this.logServiceCall(req, serviceCall);

                        return res.status(200).json(cachedResponse);
                    }
                }

                // Make request to downstream service
                const timer = performanceLogger.time('proxy_request', {
                    service: options.service,
                    path: rewrittenPath
                });

                const response = await this.makeServiceRequest(req, targetUrl, options);
                const duration = timer.end();

                // Transform response if needed
                let responseData = response.data;
                if (options.transformResponse) {
                    responseData = options.transformResponse(responseData, req);
                }

                // Cache successful GET responses
                if (config.CACHING.ENABLED && 
                    cacheKey && 
                    this.shouldCache(req.method, response.status)) {
                    
                    const cacheTTL = this.getCacheTTL(options.service, rewrittenPath, options.cacheTTL);
                    await redisService.cacheResponse(cacheKey, responseData, cacheTTL);

                    logger.debug('Response cached', {
                        service: options.service,
                        path: rewrittenPath,
                        cacheKey,
                        ttl: cacheTTL,
                        requestId
                    });
                }

                // Log service call
                const serviceCall: ServiceCall = {
                    service: options.service,
                    method: req.method,
                    path: rewrittenPath,
                    duration,
                    statusCode: response.status,
                    requestSize: JSON.stringify(req.body || {}).length,
                    responseSize: JSON.stringify(responseData).length,
                    cached: false,
                    retryCount: 0
                };

                await this.logServiceCall(req, serviceCall);

                // Copy relevant response headers
                const headersToForward = [
                    'content-type',
                    'cache-control',
                    'etag',
                    'last-modified',
                    'location'
                ];

                for (const header of headersToForward) {
                    const value = response.headers[header];
                    if (value) {
                        res.set(header, value);
                    }
                }

                // Send response
                res.status(response.status).json(responseData);

            } catch (error) {
                const duration = Date.now() - startTime;
                logger.error('Proxy middleware error:', error);

                // Log failed service call
                const serviceCall: ServiceCall = {
                    service: options.service,
                    method: req.method,
                    path: req.path,
                    duration,
                    statusCode: error instanceof Error && 'response' in error ? 
                        (error as any).response?.status || 500 : 500,
                    requestSize: JSON.stringify(req.body || {}).length,
                    responseSize: 0,
                    cached: false,
                    retryCount: 0
                };

                await this.logServiceCall(req, serviceCall, error as Error);

                // Handle specific error types
                if (error instanceof Error && 'response' in error) {
                    const axiosError = error as any;
                    if (axiosError.response) {
                        return res.status(axiosError.response.status).json(axiosError.response.data);
                    }
                }

                res.status(500).json({
                    error: 'Proxy error',
                    code: 'PROXY_ERROR',
                    message: 'An error occurred while proxying the request'
                });
            }
        };
    }

    /**
     * Get service call metrics
     */
    getMetrics(service?: string): Record<string, any> {
        if (service) {
            return {
                [service]: this.serviceCallMetrics.get(service) || []
            };
        }

        const metrics: Record<string, any> = {};
        for (const [serviceName, calls] of this.serviceCallMetrics.entries()) {
            metrics[serviceName] = {
                totalCalls: calls.length,
                averageDuration: calls.reduce((sum, call) => sum + call.duration, 0) / calls.length,
                errorRate: calls.filter(call => call.statusCode >= 400).length / calls.length,
                cacheHitRate: calls.filter(call => call.cached).length / calls.length
            };
        }

        return metrics;
    }
}

const proxyService = new ProxyService();

// Export proxy middleware creator
export const createProxy = (options: ProxyOptions) => 
    proxyService.createProxyMiddleware(options);

// Pre-configured proxy middlewares for each service
export const userServiceProxy = createProxy({
    service: 'user-service',
    pathRewrite: { '^/api/v1/users': '/api/v1' },
    requireAuth: true,
    cacheTTL: 300 // 5 minutes
});

export const tradingServiceProxy = createProxy({
    service: 'trading-service',
    pathRewrite: { '^/api/v1/trading': '/api/v1' },
    requireAuth: true,
    cacheTTL: 60 // 1 minute
});

export const marketDataServiceProxy = createProxy({
    service: 'market-data-service',
    pathRewrite: { '^/api/v1/market-data': '/api/v1' },
    cacheTTL: 10 // 10 seconds
});

export const mlAnalyticsServiceProxy = createProxy({
    service: 'ml-analytics-service',
    pathRewrite: { '^/api/v1/ml-analytics': '/api/v1' },
    requireAuth: true,
    cacheTTL: 60 // 1 minute
});

export const riskServiceProxy = createProxy({
    service: 'risk-service',
    pathRewrite: { '^/api/v1/risk': '/api/v1' },
    requireAuth: true,
    cacheTTL: 30 // 30 seconds
});

export const mlPipelineServiceProxy = createProxy({
    service: 'ml-pipeline-service',
    pathRewrite: { '^/api/v1/ml-pipeline': '/api/v1' },
    requireAuth: true,
    cacheTTL: 120 // 2 minutes
});

export const notificationServiceProxy = createProxy({
    service: 'notification-service',
    pathRewrite: { '^/api/v1/notifications': '/api/v1' },
    requireAuth: true
});

export const reportingServiceProxy = createProxy({
    service: 'reporting-service',
    pathRewrite: { '^/api/v1/reports': '/api/v1' },
    requireAuth: true,
    cacheTTL: 300 // 5 minutes
});

export const altDataServiceProxy = createProxy({
    service: 'alt-data-service',
    pathRewrite: { '^/api/v1/alt-data': '/api/v1' },
    requireAuth: true,
    cacheTTL: 120 // 2 minutes
});

// Export metrics
export const getProxyMetrics = (service?: string) => proxyService.getMetrics(service);