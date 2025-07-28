/**
 * Graceful Shutdown Handler for API Gateway
 * 
 * Handles process termination signals gracefully, ensuring all resources
 * are properly cleaned up and in-flight requests are completed.
 */

import { logger } from './logger';

type ShutdownHandler = (signal: string) => Promise<void>;

let isShuttingDown = false;
let shutdownHandlers: ShutdownHandler[] = [];

/**
 * Register a graceful shutdown handler
 */
export function addShutdownHandler(handler: ShutdownHandler): void {
    shutdownHandlers.push(handler);
}

/**
 * Remove a shutdown handler
 */
export function removeShutdownHandler(handler: ShutdownHandler): void {
    const index = shutdownHandlers.indexOf(handler);
    if (index > -1) {
        shutdownHandlers.splice(index, 1);
    }
}

/**
 * Setup graceful shutdown handling
 */
export function gracefulShutdown(customHandler?: ShutdownHandler): void {
    if (customHandler) {
        addShutdownHandler(customHandler);
    }
    
    // Handle termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach((signal) => {
        process.on(signal, async () => {
            if (isShuttingDown) {
                logger.warn(`🔄 Received ${signal} during shutdown, forcing exit...`);
                process.exit(1);
                return;
            }
            
            isShuttingDown = true;
            logger.info(`🛑 Received ${signal}, initiating graceful shutdown...`);
            
            try {
                // Set a timeout for shutdown process
                const shutdownTimeout = setTimeout(() => {
                    logger.error('⏱️ Shutdown timeout exceeded, forcing exit...');
                    process.exit(1);
                }, 30000); // 30 seconds timeout
                
                // Execute all shutdown handlers
                await Promise.all(
                    shutdownHandlers.map(async (handler, index) => {
                        try {
                            logger.info(`🔧 Executing shutdown handler ${index + 1}/${shutdownHandlers.length}...`);
                            await handler(signal);
                            logger.info(`✅ Shutdown handler ${index + 1} completed`);
                        } catch (error) {
                            logger.error(`❌ Shutdown handler ${index + 1} failed:`, error);
                        }
                    })
                );
                
                clearTimeout(shutdownTimeout);
                logger.info('✅ API Gateway shutdown completed successfully');
                process.exit(0);
                
            } catch (error) {
                logger.error('❌ Error during graceful shutdown:', error);
                process.exit(1);
            }
        });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('💥 Uncaught Exception:', error);
        
        if (!isShuttingDown) {
            isShuttingDown = true;
            
            // Try to cleanup and exit
            setTimeout(() => {
                logger.error('🚨 Force exit after uncaught exception');
                process.exit(1);
            }, 5000);
            
            // Attempt graceful shutdown
            Promise.all(
                shutdownHandlers.map(handler => 
                    handler('UNCAUGHT_EXCEPTION').catch(err => 
                        logger.error('Shutdown handler failed during uncaught exception:', err)
                    )
                )
            ).finally(() => {
                process.exit(1);
            });
        } else {
            process.exit(1);
        }
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('🔥 Unhandled Promise Rejection:', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : undefined,
            promise: promise.toString()
        });
        
        if (!isShuttingDown) {
            isShuttingDown = true;
            
            // Try to cleanup and exit
            setTimeout(() => {
                logger.error('🚨 Force exit after unhandled rejection');
                process.exit(1);
            }, 5000);
            
            // Attempt graceful shutdown
            Promise.all(
                shutdownHandlers.map(handler => 
                    handler('UNHANDLED_REJECTION').catch(err => 
                        logger.error('Shutdown handler failed during unhandled rejection:', err)
                    )
                )
            ).finally(() => {
                process.exit(1);
            });
        } else {
            process.exit(1);
        }
    });
    
    // Handle warning events
    process.on('warning', (warning) => {
        logger.warn('⚠️ Process Warning:', {
            name: warning.name,
            message: warning.message,
            stack: warning.stack
        });
    });
    
    logger.info('🛡️ Graceful shutdown handlers registered');
}

/**
 * Check if the process is currently shutting down
 */
export function isGracefulShutdownInProgress(): boolean {
    return isShuttingDown;
}

/**
 * Wait for all in-flight operations to complete
 */
export async function waitForInFlightOperations(
    checkFunction: () => boolean,
    timeoutMs: number = 10000,
    intervalMs: number = 100
): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (!checkFunction()) {
                clearInterval(checkInterval);
                resolve();
                return;
            }
            
            if (Date.now() - startTime > timeoutMs) {
                clearInterval(checkInterval);
                reject(new Error(`Timeout waiting for in-flight operations to complete after ${timeoutMs}ms`));
                return;
            }
        }, intervalMs);
    });
}

/**
 * Create a shutdown-aware async operation wrapper
 */
export function createShutdownAwareOperation<T>(
    operation: () => Promise<T>,
    timeoutMs: number = 10000
): () => Promise<T> {
    return async (): Promise<T> => {
        if (isShuttingDown) {
            throw new Error('Cannot start operation: service is shutting down');
        }
        
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Operation timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        
        const shutdownPromise = new Promise<never>((_, reject) => {
            if (isShuttingDown) {
                reject(new Error('Operation cancelled: service is shutting down'));
                return;
            }
            
            const checkShutdown = setInterval(() => {
                if (isShuttingDown) {
                    clearInterval(checkShutdown);
                    reject(new Error('Operation cancelled: service is shutting down'));
                }
            }, 100);
        });
        
        try {
            return await Promise.race([
                operation(),
                timeoutPromise,
                shutdownPromise
            ]);
        } finally {
            // Cleanup any remaining timers or intervals
        }
    };
}

/**
 * Resource cleanup tracker
 */
class ResourceTracker {
    private resources: Set<string> = new Set();
    
    register(resourceId: string): void {
        this.resources.add(resourceId);
        logger.debug(`📝 Resource registered: ${resourceId}`);
    }
    
    unregister(resourceId: string): void {
        this.resources.delete(resourceId);
        logger.debug(`🗑️ Resource unregistered: ${resourceId}`);
    }
    
    hasActiveResources(): boolean {
        return this.resources.size > 0;
    }
    
    getActiveResources(): string[] {
        return Array.from(this.resources);
    }
    
    async waitForCleanup(timeoutMs: number = 10000): Promise<void> {
        if (this.resources.size === 0) {
            return;
        }
        
        logger.info(`⏳ Waiting for ${this.resources.size} resources to cleanup...`);
        
        await waitForInFlightOperations(
            () => this.hasActiveResources(),
            timeoutMs
        );
        
        logger.info('✅ All resources cleaned up');
    }
}

export const resourceTracker = new ResourceTracker();

/**
 * Register a resource for tracking during shutdown
 */
export function trackResource(resourceId: string): () => void {
    resourceTracker.register(resourceId);
    
    return () => {
        resourceTracker.unregister(resourceId);
    };
}