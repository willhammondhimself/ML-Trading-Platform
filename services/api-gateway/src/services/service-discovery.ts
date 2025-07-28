/**
 * Service Discovery for API Gateway
 * 
 * Dynamic service discovery with health checking, load balancing,
 * and circuit breaker patterns for downstream services.
 */

import axios, { AxiosInstance } from 'axios';
import { config, ServiceConfig } from '../config';
import { redisService } from './redis-service';
import { logger, gatewayLogger, performanceLogger } from '../utils/logger';
import { addShutdownHandler, trackResource } from '../utils/graceful-shutdown';

interface ServiceInstance {
    id: string;
    name: string;
    url: string;
    healthPath: string;
    timeout: number;
    retries: number;
    isHealthy: boolean;
    lastHealthCheck: Date;
    consecutiveFailures: number;
    responseTime: number;
    weight: number;
}

interface CircuitBreakerState {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    lastFailureTime: Date;
    nextAttemptTime: Date;
}

class ServiceDiscoveryManager {
    private services: Map<string, ServiceInstance[]> = new Map();
    private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private loadBalancerCounters: Map<string, number> = new Map();
    private httpClient: AxiosInstance;
    private isRunning = false;
    
    constructor() {
        this.httpClient = axios.create({
            timeout: 5000,
            headers: {
                'User-Agent': 'API-Gateway/1.0.0',
                'X-Service-Name': 'api-gateway'
            }
        });
        
        this.setupShutdownHandler();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('⚠️ Service discovery is already running');
            return;
        }
        
        logger.info('🔍 Starting service discovery...');
        
        // Initialize services from configuration
        await this.initializeServices();
        
        // Start health checking
        if (config.SERVICE_DISCOVERY.ENABLED) {
            this.startHealthChecking();
        }
        
        this.isRunning = true;
        logger.info('✅ Service discovery started successfully');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping service discovery...');
        
        this.isRunning = false;
        
        // Stop health checking
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        
        logger.info('✅ Service discovery stopped');
    }
    
    private async initializeServices(): Promise<void> {
        const serviceConfigs = config.SERVICES;
        
        for (const [serviceName, serviceConfig] of Object.entries(serviceConfigs)) {
            const instance: ServiceInstance = {
                id: `${serviceConfig.NAME}-1`,
                name: serviceConfig.NAME,
                url: serviceConfig.URL,
                healthPath: serviceConfig.HEALTH_PATH,
                timeout: serviceConfig.TIMEOUT,
                retries: serviceConfig.RETRIES,
                isHealthy: true, // Assume healthy initially
                lastHealthCheck: new Date(),
                consecutiveFailures: 0,
                responseTime: 0,
                weight: 1
            };
            
            if (!this.services.has(serviceConfig.NAME)) {
                this.services.set(serviceConfig.NAME, []);
            }
            
            this.services.get(serviceConfig.NAME)!.push(instance);
            
            // Initialize circuit breaker
            this.circuitBreakers.set(serviceConfig.NAME, {
                state: 'CLOSED',
                failureCount: 0,
                lastFailureTime: new Date(0),
                nextAttemptTime: new Date(0)
            });
            
            logger.debug('🔍 Service registered', {
                serviceName: serviceConfig.NAME,
                url: serviceConfig.URL,
                healthPath: serviceConfig.HEALTH_PATH
            });
        }
    }
    
    private startHealthChecking(): void {
        this.healthCheckTimer = setInterval(
            () => this.performHealthChecks(),
            config.SERVICE_DISCOVERY.HEALTH_CHECK_INTERVAL
        );
        
        // Perform initial health check
        this.performHealthChecks();
    }
    
    private async performHealthChecks(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        const timer = performanceLogger.time('health_checks');
        
        try {
            const healthCheckPromises: Promise<void>[] = [];
            
            for (const [serviceName, instances] of this.services.entries()) {
                for (const instance of instances) {
                    healthCheckPromises.push(
                        this.checkInstanceHealth(serviceName, instance)
                    );
                }
            }
            
            await Promise.allSettled(healthCheckPromises);
            
            timer.end();
            
        } catch (error) {
            logger.error('❌ Error during health checks:', error);
            timer.end();
        }
    }
    
    private async checkInstanceHealth(serviceName: string, instance: ServiceInstance): Promise<void> {
        const untrack = trackResource(`health_check:${serviceName}:${instance.id}`);
        
        try {
            const startTime = Date.now();
            const healthUrl = `${instance.url}${instance.healthPath}`;
            
            const response = await this.httpClient.get(healthUrl, {
                timeout: instance.timeout
            });
            
            const responseTime = Date.now() - startTime;
            
            // Update instance health status
            const wasHealthy = instance.isHealthy;
            instance.isHealthy = response.status >= 200 && response.status < 300;
            instance.lastHealthCheck = new Date();
            instance.responseTime = responseTime;
            
            if (instance.isHealthy) {
                instance.consecutiveFailures = 0;
                
                // Reset circuit breaker if it was open
                const circuitBreaker = this.circuitBreakers.get(serviceName);
                if (circuitBreaker && circuitBreaker.state !== 'CLOSED') {
                    circuitBreaker.state = 'CLOSED';
                    circuitBreaker.failureCount = 0;
                    
                    gatewayLogger.circuitBreaker(
                        serviceName,
                        'CLOSED',
                        circuitBreaker.failureCount
                    );
                }
                
                if (!wasHealthy) {
                    logger.info('✅ Service instance recovered', {
                        serviceName,
                        instanceId: instance.id,
                        url: instance.url,
                        responseTime
                    });
                }
            } else {
                this.handleInstanceFailure(serviceName, instance, 'Unhealthy response');
            }
            
            // Cache health status in Redis
            await this.cacheServiceHealth(serviceName, instance);
            
        } catch (error) {
            this.handleInstanceFailure(serviceName, instance, error as Error);
        } finally {
            untrack();
        }
    }
    
    private handleInstanceFailure(serviceName: string, instance: ServiceInstance, error: Error | string): void {
        instance.isHealthy = false;
        instance.lastHealthCheck = new Date();
        instance.consecutiveFailures++;
        
        const errorMessage = error instanceof Error ? error.message : error;
        
        logger.warn('⚠️ Service instance health check failed', {
            serviceName,
            instanceId: instance.id,
            url: instance.url,
            consecutiveFailures: instance.consecutiveFailures,
            error: errorMessage
        });
        
        // Update circuit breaker
        const circuitBreaker = this.circuitBreakers.get(serviceName);
        if (circuitBreaker) {
            circuitBreaker.failureCount++;
            circuitBreaker.lastFailureTime = new Date();
            
            // Open circuit breaker if threshold exceeded
            if (circuitBreaker.failureCount >= config.SERVICE_DISCOVERY.CIRCUIT_BREAKER_THRESHOLD) {
                if (circuitBreaker.state !== 'OPEN') {
                    circuitBreaker.state = 'OPEN';
                    circuitBreaker.nextAttemptTime = new Date(
                        Date.now() + config.SERVICE_DISCOVERY.CIRCUIT_BREAKER_TIMEOUT
                    );
                    
                    gatewayLogger.circuitBreaker(
                        serviceName,
                        'OPEN',
                        circuitBreaker.failureCount
                    );
                    
                    logger.error('🚨 Circuit breaker opened for service', {
                        serviceName,
                        failureCount: circuitBreaker.failureCount,
                        nextAttemptTime: circuitBreaker.nextAttemptTime
                    });
                }
            }
        }
    }
    
    private async cacheServiceHealth(serviceName: string, instance: ServiceInstance): Promise<void> {
        try {
            const cacheKey = `service_health:${serviceName}:${instance.id}`;
            const healthData = {
                isHealthy: instance.isHealthy,
                lastHealthCheck: instance.lastHealthCheck.toISOString(),
                consecutiveFailures: instance.consecutiveFailures,
                responseTime: instance.responseTime
            };
            
            await redisService.setJSON(cacheKey, healthData, 300); // 5 minutes TTL
            
        } catch (error) {
            logger.debug('⚠️ Failed to cache service health:', error);
        }
    }
    
    // Service discovery methods
    getServiceInstance(serviceName: string): ServiceInstance | null {
        const instances = this.getHealthyInstances(serviceName);
        
        if (instances.length === 0) {
            return null;
        }
        
        // Check circuit breaker
        const circuitBreaker = this.circuitBreakers.get(serviceName);
        if (circuitBreaker && circuitBreaker.state === 'OPEN') {
            // Check if we should try half-open
            if (new Date() > circuitBreaker.nextAttemptTime) {
                circuitBreaker.state = 'HALF_OPEN';
                
                gatewayLogger.circuitBreaker(
                    serviceName,
                    'HALF_OPEN',
                    circuitBreaker.failureCount
                );
            } else {
                throw new Error(`Circuit breaker is OPEN for service: ${serviceName}`);
            }
        }
        
        // Apply load balancing strategy
        return this.selectInstanceByStrategy(serviceName, instances);
    }
    
    private getHealthyInstances(serviceName: string): ServiceInstance[] {
        const instances = this.services.get(serviceName) || [];
        return instances.filter(instance => instance.isHealthy);
    }
    
    private selectInstanceByStrategy(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
        switch (config.LOAD_BALANCING.STRATEGY) {
            case 'round-robin':
                return this.selectRoundRobin(serviceName, instances);
            case 'least-connections':
                return this.selectLeastConnections(instances);
            case 'weighted':
                return this.selectWeighted(instances);
            case 'ip-hash':
                return this.selectRoundRobin(serviceName, instances); // Fallback to round-robin
            default:
                return this.selectRoundRobin(serviceName, instances);
        }
    }
    
    private selectRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
        const counter = this.loadBalancerCounters.get(serviceName) || 0;
        const selectedIndex = counter % instances.length;
        
        this.loadBalancerCounters.set(serviceName, counter + 1);
        
        const selectedInstance = instances[selectedIndex];
        
        gatewayLogger.loadBalancer(
            serviceName,
            selectedInstance.id,
            'round-robin',
            instances.length,
            this.services.get(serviceName)?.length || 0
        );
        
        return selectedInstance;
    }
    
    private selectLeastConnections(instances: ServiceInstance[]): ServiceInstance {
        // For simplicity, select based on response time (lower is better)
        return instances.reduce((best, current) => 
            current.responseTime < best.responseTime ? current : best
        );
    }
    
    private selectWeighted(instances: ServiceInstance[]): ServiceInstance {
        const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const instance of instances) {
            random -= instance.weight;
            if (random <= 0) {
                return instance;
            }
        }
        
        return instances[0]; // Fallback
    }
    
    // Service management methods
    getServiceInfo(serviceName: string): {
        instances: ServiceInstance[];
        circuitBreaker: CircuitBreakerState | null;
        healthyCount: number;
        totalCount: number;
    } {
        const instances = this.services.get(serviceName) || [];
        const circuitBreaker = this.circuitBreakers.get(serviceName) || null;
        const healthyInstances = this.getHealthyInstances(serviceName);
        
        return {
            instances,
            circuitBreaker,
            healthyCount: healthyInstances.length,
            totalCount: instances.length
        };
    }
    
    getAllServices(): Record<string, {
        instances: ServiceInstance[];
        circuitBreaker: CircuitBreakerState | null;
        healthyCount: number;
        totalCount: number;
    }> {
        const result: any = {};
        
        for (const serviceName of this.services.keys()) {
            result[serviceName] = this.getServiceInfo(serviceName);
        }
        
        return result;
    }
    
    async addServiceInstance(serviceName: string, instanceConfig: Partial<ServiceInstance>): Promise<void> {
        const instance: ServiceInstance = {
            id: instanceConfig.id || `${serviceName}-${Date.now()}`,
            name: serviceName,
            url: instanceConfig.url || '',
            healthPath: instanceConfig.healthPath || '/health',
            timeout: instanceConfig.timeout || 5000,
            retries: instanceConfig.retries || 3,
            isHealthy: true,
            lastHealthCheck: new Date(),
            consecutiveFailures: 0,
            responseTime: 0,
            weight: instanceConfig.weight || 1
        };
        
        if (!this.services.has(serviceName)) {
            this.services.set(serviceName, []);
        }
        
        this.services.get(serviceName)!.push(instance);
        
        logger.info('🔍 Service instance added', {
            serviceName,
            instanceId: instance.id,
            url: instance.url
        });
    }
    
    async removeServiceInstance(serviceName: string, instanceId: string): Promise<boolean> {
        const instances = this.services.get(serviceName);
        
        if (!instances) {
            return false;
        }
        
        const index = instances.findIndex(instance => instance.id === instanceId);
        
        if (index === -1) {
            return false;
        }
        
        instances.splice(index, 1);
        
        logger.info('🗑️ Service instance removed', {
            serviceName,
            instanceId
        });
        
        return true;
    }
    
    // Circuit breaker methods
    recordSuccess(serviceName: string): void {
        const circuitBreaker = this.circuitBreakers.get(serviceName);
        
        if (circuitBreaker && circuitBreaker.state === 'HALF_OPEN') {
            circuitBreaker.state = 'CLOSED';
            circuitBreaker.failureCount = 0;
            
            gatewayLogger.circuitBreaker(
                serviceName,
                'CLOSED',
                circuitBreaker.failureCount
            );
        }
    }
    
    recordFailure(serviceName: string): void {
        const circuitBreaker = this.circuitBreakers.get(serviceName);
        
        if (circuitBreaker) {
            circuitBreaker.failureCount++;
            circuitBreaker.lastFailureTime = new Date();
            
            if (circuitBreaker.state === 'HALF_OPEN' || 
                circuitBreaker.failureCount >= config.SERVICE_DISCOVERY.CIRCUIT_BREAKER_THRESHOLD) {
                
                circuitBreaker.state = 'OPEN';
                circuitBreaker.nextAttemptTime = new Date(
                    Date.now() + config.SERVICE_DISCOVERY.CIRCUIT_BREAKER_TIMEOUT
                );
                
                gatewayLogger.circuitBreaker(
                    serviceName,
                    'OPEN',
                    circuitBreaker.failureCount
                );
            }
        }
    }
    
    private setupShutdownHandler(): void {
        addShutdownHandler(async () => {
            await this.stop();
        });
    }
    
    get isActive(): boolean {
        return this.isRunning;
    }
}

// Global service discovery instance
export const serviceDiscovery = new ServiceDiscoveryManager();