/**
 * LLM Client for Elenchus Interrogation Engine V2
 *
 * NOTE: This client is OPTIONAL. When Elenchus is used via MCP, the calling
 * LLM (Claude, Cursor, etc.) provides all the intelligence. Elenchus uses
 * template-based questions and structured workflows that don't require
 * internal LLM calls.
 *
 * This client exists for:
 * - Standalone/CLI usage where no calling LLM is available
 * - Future features that may benefit from internal LLM processing
 *
 * For MCP usage: No API key is needed. The calling agent IS the LLM.
 *
 * If you do want internal LLM features, API Key Resolution Order:
 * 1. Environment variable: ANTHROPIC_API_KEY
 * 2. Config file: elenchus.config.json → anthropicApiKey
 * 3. Returns null if no key (falls back to template-based generation)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
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
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: 1000,
  /** Maximum delay in milliseconds */
  maxDelayMs: 30000,
  /** Jitter factor (0-1) to add randomness to delays */
  jitterFactor: 0.3,
} as const;

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @param jitterFactor - Amount of randomness to add (0-1)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = RETRY_CONFIG.baseDelayMs,
  maxDelay: number = RETRY_CONFIG.maxDelayMs,
  jitterFactor: number = RETRY_CONFIG.jitterFactor
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: delay * (1 - jitterFactor/2) + random * jitterFactor
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5);
  const finalDelay = cappedDelay + jitter;

  return Math.max(0, Math.round(finalDelay));
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Zod schema for config file validation
 */
const ElenchusConfigSchema = z.object({
  anthropicApiKey: z.string().min(1).optional(),
}).passthrough();

/**
 * Anthropic API response content block
 */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

/**
 * Anthropic API response structure
 */
interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
  stop_reason?: string;
}

/**
 * Anthropic API error structure
 */
interface AnthropicApiError extends Error {
  status?: number;
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Anthropic client interface (subset of SDK types)
 * Using 'unknown' for flexibility with SDK's actual implementation
 */
interface AnthropicClientInterface {
  messages: {
    create(params: unknown): Promise<AnthropicResponse>;
  };
}

/**
 * LLM Client for interacting with Claude API
 */
export class LLMClient {
  private apiKey: string | null = null;
  private mcpFallback: boolean;
  private anthropicClient: AnthropicClientInterface | null = null;

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

      // Only try to read if file exists
      if (!existsSync(configPath)) {
        logger.debug('No config file found at elenchus.config.json');
        return null;
      }

      const configContent = readFileSync(configPath, 'utf-8');

      // Parse JSON with error handling
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(configContent);
      } catch (parseError) {
        logger.warn('Config file contains invalid JSON', { error: parseError, configPath });
        return null;
      }

      // Validate config structure with Zod
      const configResult = ElenchusConfigSchema.safeParse(parsedJson);
      if (!configResult.success) {
        logger.warn('Config file has invalid structure', {
          error: configResult.error.issues,
          configPath,
        });
        return null;
      }

      const config = configResult.data;
      if (config.anthropicApiKey) {
        logger.debug('Using API key from elenchus.config.json');
        return config.anthropicApiKey;
      }
    } catch (error) {
      // Filesystem error - this is okay
      logger.debug('Could not read config file', { error });
    }

    return null;
  }

  /**
   * Lazy-load the Anthropic SDK
   * Only imports when needed to avoid dependency issues
   */
  private async getAnthropicClient(): Promise<AnthropicClientInterface> {
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
        }) as AnthropicClientInterface;
        logger.debug('Anthropic client initialized');
      } catch (error) {
        throw new LLMError(
          'Failed to initialize Anthropic SDK. Is @anthropic-ai/sdk installed?',
          LLMErrorCode.CONFIGURATION_ERROR,
          error
        );
      }
    }

    return this.anthropicClient as AnthropicClientInterface;
  }

  /**
   * Check if the LLM client is available (has API key)
   */
  public isAvailable(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Generate content using Claude API with automatic retry on transient errors
   *
   * @param prompt - The prompt to send to the model
   * @param options - Generation options including model selection
   * @returns Generated response
   * @throws {LLMError} If generation fails after all retries
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

    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const result = await this.attemptGeneration(prompt, options, modelName, maxTokens, startTime);
        return result;
      } catch (error: unknown) {
        const apiError = error as AnthropicApiError;
        const isRetryable = this.isRetryableError(apiError);

        if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
          // Not retryable or exhausted retries - throw immediately
          throw this.wrapError(error, Date.now() - startTime);
        }

        // Calculate backoff delay
        const delayMs = calculateBackoffDelay(attempt);
        logger.warn('LLM generation failed, retrying', {
          attempt: attempt + 1,
          maxRetries: RETRY_CONFIG.maxRetries,
          delayMs,
          errorStatus: apiError?.status,
          errorMessage: apiError?.message,
        });

        await sleep(delayMs);
        lastError = this.wrapError(error, Date.now() - startTime);
      }
    }

    // Should not reach here, but handle gracefully
    throw lastError ?? new LLMError('Failed to generate response', LLMErrorCode.API_ERROR);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: AnthropicApiError | undefined): boolean {
    if (!error?.status) return false;

    // Rate limiting (429) - always retry with backoff
    if (error.status === 429) return true;

    // Server errors (5xx) - retry
    if (error.status >= 500 && error.status < 600) return true;

    // Request timeout (408) - retry
    if (error.status === 408) return true;

    // Other errors are not retryable
    return false;
  }

  /**
   * Single attempt at generation (no retry logic)
   */
  private async attemptGeneration(
    prompt: string,
    options: GenerateOptions,
    modelName: string,
    maxTokens: number,
    startTime: number
  ): Promise<LLMResponse> {
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
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
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
  }

  /**
   * Wrap an error with appropriate LLMError type
   */
  private wrapError(error: unknown, elapsedMs: number): LLMError {
    const apiError = error as AnthropicApiError;

    // Handle rate limiting
    if (apiError?.status === 429) {
      logger.warn('Rate limit exceeded', { elapsedMs, error: apiError });
      return new LLMError(
        'Rate limit exceeded. Please try again later.',
        LLMErrorCode.RATE_LIMIT,
        apiError
      );
    }

    // Handle other API errors
    if (apiError?.status) {
      logger.error('API error during generation', apiError, {
        status: apiError.status,
        elapsedMs,
      });
      return new LLMError(
        `API error: ${apiError.message || 'Unknown error'}`,
        LLMErrorCode.API_ERROR,
        apiError
      );
    }

    // Unknown error
    logger.error('Unknown error during generation', error, { elapsedMs });
    return new LLMError(
      'Failed to generate response',
      LLMErrorCode.API_ERROR,
      error
    );
  }

  /**
   * Extract text content from Claude API response
   */
  private extractContent(response: AnthropicResponse): string {
    if (!response?.content || !Array.isArray(response.content)) {
      throw new LLMError(
        'Invalid API response: missing or invalid content',
        LLMErrorCode.INVALID_RESPONSE,
        response
      );
    }

    // Find the first text content block
    const textBlock = response.content.find(
      (block: AnthropicContentBlock) => block.type === 'text'
    );
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
