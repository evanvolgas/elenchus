/**
 * LLM Client for Elenchus Interrogation Engine V2
 *
 * Provides abstraction over Claude API with intelligent model routing:
 * - Haiku: Fast validation checks
 * - Sonnet: Question generation and semantic analysis
 *
 * API Key Resolution Order:
 * 1. Environment variable: ANTHROPIC_API_KEY
 * 2. Config file: elenchus.config.json → anthropicApiKey
 * 3. Returns null if no key (caller handles MCP fallback or prompts)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';

/**
 * Configuration for the LLM client
 */
export interface LLMClientConfig {
  /** Anthropic API key (optional - will try environment/config if not provided) */
  anthropicApiKey?: string;
  /** Enable MCP fallback if no API key available */
  mcpFallback?: boolean;
}

/**
 * Response from LLM generation
 */
export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Token usage statistics (if available) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Model selection for different tasks
 */
export type LLMModel = 'haiku' | 'sonnet';

/**
 * Generation options
 */
export interface GenerateOptions {
  /** Model to use for this generation */
  model: LLMModel;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** System prompt to set context */
  systemPrompt?: string;
}

/**
 * Error codes for LLM client operations
 */
export enum LLMErrorCode {
  NO_API_KEY = 'NO_API_KEY',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * Custom error class for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public code: LLMErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Model name mapping for Anthropic API
 */
const MODEL_NAMES: Record<LLMModel, string> = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-3-5-sonnet-20241022',
};

/**
 * Default token limits for each model
 */
const DEFAULT_MAX_TOKENS: Record<LLMModel, number> = {
  haiku: 4096,
  sonnet: 8192,
};

/**
 * Configuration file structure
 */
interface ElenchusConfig {
  anthropicApiKey?: string;
  [key: string]: unknown;
}

/**
 * LLM Client for interacting with Claude API
 */
export class LLMClient {
  private apiKey: string | null = null;
  private mcpFallback: boolean;
  private anthropicClient: any = null; // Will be lazily loaded

  /**
   * Create a new LLM client
   *
   * @param config - Optional configuration
   */
  constructor(config?: LLMClientConfig) {
    this.mcpFallback = config?.mcpFallback ?? false;
    this.apiKey = this.resolveApiKey(config?.anthropicApiKey);

    if (this.apiKey) {
      logger.info('LLM client initialized with API key', {
        source: config?.anthropicApiKey ? 'provided' : 'environment/config',
      });
    } else {
      logger.warn('LLM client initialized without API key', {
        mcpFallback: this.mcpFallback,
      });
    }
  }

  /**
   * Resolve API key from multiple sources
   * Priority: config param > env var > config file
   */
  private resolveApiKey(providedKey?: string): string | null {
    // 1. Use provided key if available
    if (providedKey) {
      return providedKey;
    }

    // 2. Check environment variable
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) {
      logger.debug('Using API key from ANTHROPIC_API_KEY environment variable');
      return envKey;
    }

    // 3. Try loading from config file
    try {
      const configPath = resolve(process.cwd(), 'elenchus.config.json');
      const configContent = readFileSync(configPath, 'utf-8');
      const config: ElenchusConfig = JSON.parse(configContent);

      if (config.anthropicApiKey) {
        logger.debug('Using API key from elenchus.config.json');
        return config.anthropicApiKey;
      }
    } catch (error) {
      // Config file doesn't exist or is invalid - this is okay
      logger.debug('No config file found or invalid', { error });
    }

    return null;
  }

  /**
   * Lazy-load the Anthropic SDK
   * Only imports when needed to avoid dependency issues
   */
  private async getAnthropicClient(): Promise<any> {
    if (!this.apiKey) {
      throw new LLMError(
        'No API key available. Set ANTHROPIC_API_KEY or provide in config.',
        LLMErrorCode.NO_API_KEY
      );
    }

    if (!this.anthropicClient) {
      try {
        // Dynamic import to avoid requiring the SDK if not used
        const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default || m);
        this.anthropicClient = new Anthropic({
          apiKey: this.apiKey,
        });
        logger.debug('Anthropic client initialized');
      } catch (error) {
        throw new LLMError(
          'Failed to initialize Anthropic SDK. Is @anthropic-ai/sdk installed?',
          LLMErrorCode.CONFIGURATION_ERROR,
          error
        );
      }
    }

    return this.anthropicClient;
  }

  /**
   * Check if the LLM client is available (has API key)
   */
  public isAvailable(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Generate content using Claude API
   *
   * @param prompt - The prompt to send to the model
   * @param options - Generation options including model selection
   * @returns Generated response
   * @throws {LLMError} If generation fails
   */
  public async generate(prompt: string, options: GenerateOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const modelName = MODEL_NAMES[options.model];
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS[options.model];

    logger.info('Starting LLM generation', {
      model: options.model,
      modelName,
      maxTokens,
      promptLength: prompt.length,
    });

    try {
      const client = await this.getAnthropicClient();

      // Build messages array
      const messages = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      // Make API call
      const response = await client.messages.create({
        model: modelName,
        max_tokens: maxTokens,
        temperature: options.temperature ?? 1.0,
        system: options.systemPrompt,
        messages,
      });

      // Extract content from response
      const content = this.extractContent(response);
      const usage = response.usage ? {
        inputTokens: response.usage.input_tokens as number,
        outputTokens: response.usage.output_tokens as number,
      } : null;

      const elapsedMs = Date.now() - startTime;

      logger.info('LLM generation completed', {
        model: options.model,
        elapsedMs,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        contentLength: content.length,
      });

      const result: LLMResponse = {
        content,
        model: modelName,
      };
      if (usage) {
        result.usage = usage;
      }
      return result;

    } catch (error: any) {
      const elapsedMs = Date.now() - startTime;

      // Handle rate limiting
      if (error?.status === 429) {
        logger.warn('Rate limit exceeded', { elapsedMs, error });
        throw new LLMError(
          'Rate limit exceeded. Please try again later.',
          LLMErrorCode.RATE_LIMIT,
          error
        );
      }

      // Handle other API errors
      if (error?.status) {
        logger.error('API error during generation', error, {
          status: error.status,
          elapsedMs,
        });
        throw new LLMError(
          `API error: ${error.message || 'Unknown error'}`,
          LLMErrorCode.API_ERROR,
          error
        );
      }

      // Unknown error
      logger.error('Unknown error during generation', error, { elapsedMs });
      throw new LLMError(
        'Failed to generate response',
        LLMErrorCode.API_ERROR,
        error
      );
    }
  }

  /**
   * Extract text content from Claude API response
   */
  private extractContent(response: any): string {
    if (!response?.content || !Array.isArray(response.content)) {
      throw new LLMError(
        'Invalid API response: missing or invalid content',
        LLMErrorCode.INVALID_RESPONSE,
        response
      );
    }

    // Find the first text content block
    const textBlock = response.content.find((block: any) => block.type === 'text');
    if (!textBlock?.text) {
      throw new LLMError(
        'Invalid API response: no text content found',
        LLMErrorCode.INVALID_RESPONSE,
        response
      );
    }

    return textBlock.text;
  }

  /**
   * Validate a prompt before sending (basic checks)
   * @internal Used internally before API calls
   */
  public validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim().length === 0) {
      throw new LLMError(
        'Prompt cannot be empty',
        LLMErrorCode.CONFIGURATION_ERROR
      );
    }

    // Check for extremely long prompts that might cause issues
    if (prompt.length > 100000) {
      logger.warn('Very long prompt detected', { length: prompt.length });
    }
  }

  /**
   * Get recommended model for a specific task type
   */
  public static getRecommendedModel(taskType: 'validation' | 'generation'): LLMModel {
    return taskType === 'validation' ? 'haiku' : 'sonnet';
  }
}

/**
 * Create a new LLM client instance
 *
 * @param config - Optional configuration
 * @returns Configured LLM client
 */
export function createClient(config?: LLMClientConfig): LLMClient {
  return new LLMClient(config);
}
