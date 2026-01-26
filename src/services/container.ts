/**
 * Dependency injection container for Elenchus services.
 *
 * V3 Architecture: Elenchus is pure infrastructure.
 * The calling LLM IS Socrates - we just provide storage.
 */

import type { Storage } from '../storage/index.js';
import type { logger as Logger } from '../utils/logger.js';

type LoggerType = typeof Logger;

/**
 * Service configuration options
 */
export interface ServiceConfig {
  /** Database path for storage */
  dbPath?: string;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Service container interface for dependency injection
 *
 * V3: No more LLM client - the calling LLM provides all intelligence.
 */
export interface Services {
  storage: Storage;
  logger: LoggerType;
}

/**
 * Service factory functions for lazy initialization
 */
export interface ServiceFactories {
  createStorage: (config: ServiceConfig) => Storage;
  getLogger: () => LoggerType;
}

/**
 * Default service factories using real implementations
 */
let defaultFactories: ServiceFactories | null = null;

/**
 * Get default factories (lazy loaded to avoid circular imports)
 */
async function getDefaultFactories(): Promise<ServiceFactories> {
  if (!defaultFactories) {
    const [{ Storage }, { logger }] = await Promise.all([
      import('../storage/index.js'),
      import('../utils/logger.js'),
    ]);

    defaultFactories = {
      createStorage: (config) => new Storage(config.dbPath),
      getLogger: () => logger,
    };
  }
  return defaultFactories;
}

/**
 * Service container that manages service lifecycles
 */
export class ServiceContainer {
  private services: Partial<Services> = {};
  private config: ServiceConfig;
  private factories: ServiceFactories | null = null;
  private customFactories: Partial<ServiceFactories> = {};

  constructor(config: ServiceConfig = {}) {
    this.config = config;
  }

  /**
   * Override a factory for testing
   */
  setFactory<K extends keyof ServiceFactories>(
    key: K,
    factory: ServiceFactories[K]
  ): this {
    this.customFactories[key] = factory;
    return this;
  }

  /**
   * Get or create the storage service
   */
  async getStorage(): Promise<Storage> {
    if (!this.services.storage) {
      const factories = await this.getFactories();
      const storage = factories.createStorage(this.config);
      this.services = { ...this.services, storage };
    }
    return this.services.storage as Storage;
  }

  /**
   * Get the logger
   */
  async getLogger(): Promise<LoggerType> {
    if (!this.services.logger) {
      const factories = await this.getFactories();
      const logger = factories.getLogger();
      this.services = { ...this.services, logger };
    }
    return this.services.logger as LoggerType;
  }

  /**
   * Get all services (for tool handlers)
   */
  async getAll(): Promise<Services> {
    const [storage, logger] = await Promise.all([
      this.getStorage(),
      this.getLogger(),
    ]);
    return { storage, logger };
  }

  /**
   * Clear all services (for cleanup/testing)
   */
  clear(): void {
    this.services = {};
  }

  /**
   * Update configuration
   */
  configure(config: Partial<ServiceConfig>): this {
    this.config = { ...this.config, ...config };
    // Clear services so they're recreated with new config
    this.clear();
    return this;
  }

  private async getFactories(): Promise<ServiceFactories> {
    if (!this.factories) {
      const defaults = await getDefaultFactories();
      this.factories = {
        ...defaults,
        ...this.customFactories,
      };
    }
    return this.factories;
  }
}

/**
 * Global container instance
 */
let globalContainer: ServiceContainer | null = null;

/**
 * Get the global service container
 */
export function getContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
  }
  return globalContainer;
}

/**
 * Create a new container (useful for testing)
 */
export function createContainer(config?: ServiceConfig): ServiceContainer {
  return new ServiceContainer(config);
}

/**
 * Reset the global container (for testing)
 */
export function resetContainer(): void {
  if (globalContainer) {
    globalContainer.clear();
  }
  globalContainer = null;
}
