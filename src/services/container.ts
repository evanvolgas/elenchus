/**
 * Dependency injection container for Elenchus services.
 *
 * Provides:
 * - Centralized service configuration
 * - Lazy initialization
 * - Easy mocking for tests
 * - Clean separation of concerns
 */

import type { Storage } from '../storage/index.js';
import type { LLMClient } from '../engines/llm-client.js';
import type { logger as Logger } from '../utils/logger.js';

type LoggerType = typeof Logger;

/**
 * Service configuration options
 */
export interface ServiceConfig {
  /** Database path for storage */
  dbPath?: string;
  /** Anthropic API key for LLM client */
  anthropicApiKey?: string;
  /** Enable MCP fallback for LLM */
  mcpFallback?: boolean;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Service container interface for dependency injection
 */
export interface Services {
  storage: Storage;
  llmClient: LLMClient;
  logger: LoggerType;
}

/**
 * Service factory functions for lazy initialization
 */
export interface ServiceFactories {
  createStorage: (config: ServiceConfig) => Storage;
  createLLMClient: (config: ServiceConfig) => LLMClient;
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
    const [{ Storage }, { createClient }, { logger }] = await Promise.all([
      import('../storage/index.js'),
      import('../engines/llm-client.js'),
      import('../utils/logger.js'),
    ]);

    defaultFactories = {
      createStorage: (config) => new Storage(config.dbPath),
      createLLMClient: (config) => {
        const clientConfig: { anthropicApiKey?: string; mcpFallback?: boolean } = {};
        if (config.anthropicApiKey !== undefined) {
          clientConfig.anthropicApiKey = config.anthropicApiKey;
        }
        if (config.mcpFallback !== undefined) {
          clientConfig.mcpFallback = config.mcpFallback;
        }
        return createClient(clientConfig);
      },
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
   * Get or create the LLM client
   */
  async getLLMClient(): Promise<LLMClient> {
    if (!this.services.llmClient) {
      const factories = await this.getFactories();
      const llmClient = factories.createLLMClient(this.config);
      this.services = { ...this.services, llmClient };
    }
    return this.services.llmClient as LLMClient;
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
    const [storage, llmClient, logger] = await Promise.all([
      this.getStorage(),
      this.getLLMClient(),
      this.getLogger(),
    ]);
    return { storage, llmClient, logger };
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
