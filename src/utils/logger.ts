/**
 * Structured logging utility for Elenchus
 * Provides context-aware logging with request ID tracking via AsyncLocalStorage
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log context that can be passed to any log method
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Request context stored in AsyncLocalStorage for tracking across async calls
 */
interface RequestContext {
  requestId: string;
  toolName?: string | undefined;
  epicId?: string | undefined;
  sessionId?: string | undefined;
  startTime: number;
}

/**
 * AsyncLocalStorage for request-scoped context
 * Allows tracking request IDs and related metadata across async call chains
 */
const requestStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a short, cryptographically secure request ID
 * Format: req-{8 chars of base64url}
 */
function generateRequestId(): string {
  return `req-${randomBytes(6).toString('base64url')}`;
}

/**
 * Format an error object into a loggable structure
 */
function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  return { errorValue: String(error) };
}

/**
 * Format a log message with timestamp, level, request context, and optional data
 */
function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const reqContext = requestStorage.getStore();

  // Build the full context including request-scoped data
  const fullContext: LogContext = {};

  // Add request context if available
  if (reqContext) {
    fullContext.requestId = reqContext.requestId;
    if (reqContext.toolName) fullContext.tool = reqContext.toolName;
    if (reqContext.epicId) fullContext.epicId = reqContext.epicId;
    if (reqContext.sessionId) fullContext.sessionId = reqContext.sessionId;
  }

  // Merge in any additional context
  if (context) {
    Object.assign(fullContext, context);
  }

  const contextStr = Object.keys(fullContext).length > 0
    ? ` ${JSON.stringify(fullContext)}`
    : '';

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Calculate elapsed time from request start
 */
function getElapsedMs(): number | undefined {
  const reqContext = requestStorage.getStore();
  return reqContext ? Date.now() - reqContext.startTime : undefined;
}

/**
 * Logger with support for structured context and request ID tracking
 */
export const logger = {
  /**
   * Log a debug message (only when LOG_LEVEL=debug)
   */
  debug(message: string, error?: unknown, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug') {
      const fullContext = error ? { ...context, ...formatError(error) } : context;
      console.debug(formatMessage('debug', message, fullContext));
    }
  },

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    console.info(formatMessage('info', message, context));
  },

  /**
   * Log a warning message
   */
  warn(message: string, error?: unknown, context?: LogContext): void {
    const fullContext = error ? { ...context, ...formatError(error) } : context;
    console.warn(formatMessage('warn', message, fullContext));
  },

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    const fullContext = error ? { ...context, ...formatError(error) } : context;
    console.error(formatMessage('error', message, fullContext));
  },

  /**
   * Run a function within a request context.
   * All logs within the callback will include the request ID and other context.
   *
   * @param options - Request context options
   * @param fn - Async function to run within the context
   * @returns The result of the function
   *
   * @example
   * ```typescript
   * const result = await logger.withRequestContext(
   *   { toolName: 'elenchus_ingest', epicId: 'epic-123' },
   *   async () => {
   *     logger.info('Processing epic'); // Automatically includes requestId, tool, epicId
   *     return await processEpic();
   *   }
   * );
   * ```
   */
  async withRequestContext<T>(
    options: {
      requestId?: string | undefined;
      toolName?: string | undefined;
      epicId?: string | undefined;
      sessionId?: string | undefined;
    },
    fn: () => Promise<T>
  ): Promise<T> {
    const context: RequestContext = {
      requestId: options.requestId ?? generateRequestId(),
      toolName: options.toolName,
      epicId: options.epicId,
      sessionId: options.sessionId,
      startTime: Date.now(),
    };

    return requestStorage.run(context, fn);
  },

  /**
   * Get the current request ID, if within a request context
   */
  getRequestId(): string | undefined {
    return requestStorage.getStore()?.requestId;
  },

  /**
   * Get elapsed time since request start in milliseconds
   */
  getElapsedMs,

  /**
   * Update the current request context (e.g., to add epicId after it's created)
   */
  updateContext(updates: Partial<Omit<RequestContext, 'requestId' | 'startTime'>>): void {
    const current = requestStorage.getStore();
    if (current) {
      if (updates.toolName !== undefined) current.toolName = updates.toolName;
      if (updates.epicId !== undefined) current.epicId = updates.epicId;
      if (updates.sessionId !== undefined) current.sessionId = updates.sessionId;
    }
  },
};
