/**
 * Graceful Shutdown Utility
 * Ensures clean shutdown of all services and connections
 */

import { logger } from './logger';

export interface ShutdownHandler {
  name: string;
  cleanup: () => Promise<void> | void;
  timeout?: number;
}

class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds

  /**
   * Setup graceful shutdown handlers
   */
  setup(handlers: ShutdownHandler[]): void {
    this.handlers = handlers;

    // Handle process termination signals
    process.on('SIGTERM', () => this.handleSignal('SIGTERM'));
    process.on('SIGINT', () => this.handleSignal('SIGINT'));
    process.on('SIGUSR2', () => this.handleSignal('SIGUSR2')); // For nodemon

    logger.info(`📋 Registered ${handlers.length} shutdown handlers`);
  }

  /**
   * Handle shutdown signal
   */
  private async handleSignal(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn(`⚠️  Already shutting down, ignoring ${signal}`);
      return;
    }

    this.isShuttingDown = true;
    logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);

    const startTime = Date.now();

    try {
      // Set overall timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Shutdown timeout exceeded (${this.shutdownTimeout}ms)`));
        }, this.shutdownTimeout);
      });

      // Execute all cleanup handlers
      const shutdownPromise = this.executeCleanupHandlers();

      // Wait for either completion or timeout
      await Promise.race([shutdownPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      logger.info(`✅ Graceful shutdown completed in ${duration}ms`);

    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
    } finally {
      // Force exit after cleanup attempt
      const duration = Date.now() - startTime;
      logger.info(`🔚 Process exiting after ${duration}ms`);
      process.exit(0);
    }
  }

  /**
   * Execute all cleanup handlers in reverse order
   */
  private async executeCleanupHandlers(): Promise<void> {
    // Cleanup in reverse order (LIFO)
    const reversedHandlers = [...this.handlers].reverse();

    for (const handler of reversedHandlers) {
      const handlerStartTime = Date.now();
      const timeout = handler.timeout || 5000; // 5 second default

      try {
        logger.debug(`🧹 Cleaning up: ${handler.name}`);

        // Create timeout promise for this specific handler
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Handler timeout: ${handler.name}`));
          }, timeout);
        });

        // Execute cleanup with timeout
        const cleanupPromise = Promise.resolve(handler.cleanup());
        await Promise.race([cleanupPromise, timeoutPromise]);

        const duration = Date.now() - handlerStartTime;
        logger.info(`✅ ${handler.name} cleanup completed in ${duration}ms`);

      } catch (error) {
        const duration = Date.now() - handlerStartTime;
        logger.error(`❌ Failed to cleanup ${handler.name} (${duration}ms):`, error);
        // Continue with other handlers even if one fails
      }
    }
  }

  /**
   * Add a shutdown handler
   */
  addHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    logger.debug(`➕ Added shutdown handler: ${handler.name}`);
  }

  /**
   * Remove a shutdown handler by name
   */
  removeHandler(name: string): boolean {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      logger.debug(`➖ Removed shutdown handler: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Set the overall shutdown timeout
   */
  setTimeout(timeout: number): void {
    this.shutdownTimeout = timeout;
    logger.debug(`⏱️  Shutdown timeout set to ${timeout}ms`);
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Manual shutdown trigger (for testing or programmatic shutdown)
   */
  async shutdown(): Promise<void> {
    if (!this.isShuttingDown) {
      await this.handleSignal('MANUAL');
    }
  }
}

// Export singleton instance
export const gracefulShutdown = new GracefulShutdown();
export default gracefulShutdown;