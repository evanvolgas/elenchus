/**
 * Simple logger utility for Elenchus
 * Provides structured logging with context
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errorMessage: error.message, errorStack: error.stack };
  }
  return { errorValue: String(error) };
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, error?: unknown, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug') {
      const fullContext = error ? { ...context, ...formatError(error) } : context;
      console.debug(formatMessage('debug', message, fullContext));
    }
  },

  info(message: string, context?: LogContext): void {
    console.info(formatMessage('info', message, context));
  },

  warn(message: string, error?: unknown, context?: LogContext): void {
    const fullContext = error ? { ...context, ...formatError(error) } : context;
    console.warn(formatMessage('warn', message, fullContext));
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    const fullContext = error ? { ...context, ...formatError(error) } : context;
    console.error(formatMessage('error', message, fullContext));
  },
};
