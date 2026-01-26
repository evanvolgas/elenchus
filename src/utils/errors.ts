/**
 * Centralized error classification and handling for Elenchus MCP server.
 *
 * Provides:
 * - Custom error classes with error codes
 * - Error classification for appropriate HTTP-like responses
 * - Structured error responses for MCP tools
 */

import { ZodError } from 'zod';
import { PathTraversalError, InvalidPathError } from './path-security.js';

/**
 * Error codes for programmatic error handling.
 * These map to categories of errors for consistent client handling.
 */
export const ErrorCode = {
  // Client errors (4xx equivalent)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  NOT_FOUND: 'NOT_FOUND',
  SECURITY_ERROR: 'SECURITY_ERROR',
  CONFLICT: 'CONFLICT',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',

  // Server errors (5xx equivalent)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Tool-specific errors
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HTTP-like status codes for error responses
 */
export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Base error class for Elenchus with error code support
 */
export class ElenchusError extends Error {
  public readonly code: ErrorCodeType;
  public readonly httpStatus: number;
  public readonly details: Record<string, unknown> | undefined;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: ErrorCodeType,
    options?: {
      httpStatus?: number;
      details?: Record<string, unknown> | undefined;
      isRetryable?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ElenchusError';
    this.code = code;
    this.httpStatus = options?.httpStatus ?? this.defaultHttpStatus(code);
    this.details = options?.details;
    this.isRetryable = options?.isRetryable ?? this.defaultRetryable(code);
  }

  private defaultHttpStatus(code: ErrorCodeType): number {
    switch (code) {
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.INVALID_ARGUMENTS:
        return HttpStatus.UNPROCESSABLE_ENTITY;
      case ErrorCode.NOT_FOUND:
        return HttpStatus.NOT_FOUND;
      case ErrorCode.SECURITY_ERROR:
        return HttpStatus.FORBIDDEN;
      case ErrorCode.CONFLICT:
        return HttpStatus.CONFLICT;
      case ErrorCode.PRECONDITION_FAILED:
        return HttpStatus.PRECONDITION_FAILED;
      case ErrorCode.SERVICE_UNAVAILABLE:
      case ErrorCode.EXTERNAL_SERVICE_ERROR:
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private defaultRetryable(code: ErrorCodeType): boolean {
    switch (code) {
      case ErrorCode.SERVICE_UNAVAILABLE:
      case ErrorCode.EXTERNAL_SERVICE_ERROR:
        return true;
      default:
        return false;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      isRetryable: this.isRetryable,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends ElenchusError {
  constructor(
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>
  ) {
    super(
      `${resourceType} not found: ${resourceId}`,
      ErrorCode.NOT_FOUND,
      {
        details: {
          resourceType,
          resourceId,
          ...details,
        },
      }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends ElenchusError {
  constructor(
    message: string,
    validationErrors?: Array<{ path: string; message: string }>
  ) {
    const details = validationErrors ? { errors: validationErrors } : undefined;
    super(message, ErrorCode.VALIDATION_ERROR, { details });
    this.name = 'ValidationError';
  }

  static fromZodError(error: ZodError): ValidationError {
    const validationErrors = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return new ValidationError(
      `Validation failed: ${validationErrors.map((e) => e.message).join(', ')}`,
      validationErrors
    );
  }
}

/**
 * Error thrown for security-related issues
 */
export class SecurityError extends ElenchusError {
  constructor(message: string, details?: Record<string, unknown> | undefined) {
    super(message, ErrorCode.SECURITY_ERROR, details ? { details } : undefined);
    this.name = 'SecurityError';
  }
}

/**
 * Error thrown when an external service fails
 */
export class ExternalServiceError extends ElenchusError {
  constructor(
    serviceName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(
      `External service error (${serviceName}): ${message}`,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      {
        isRetryable: true,
        details: { serviceName, ...details },
      }
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Classify an error and return an appropriate ElenchusError.
 * This normalizes all errors to a consistent format.
 */
export function classifyError(error: unknown): ElenchusError {
  // Already an ElenchusError
  if (error instanceof ElenchusError) {
    return error;
  }

  // Zod validation error
  if (error instanceof ZodError) {
    return ValidationError.fromZodError(error);
  }

  // Path security errors
  if (error instanceof PathTraversalError) {
    return new SecurityError(
      `Path traversal attempt detected: ${error.attemptedPath}`,
      {
        attemptedPath: error.attemptedPath,
        resolvedPath: error.resolvedPath,
        allowedRoot: error.allowedRoot,
      }
    );
  }

  if (error instanceof InvalidPathError) {
    return new ValidationError(`Invalid path: ${error.reason}`, [
      { path: 'path', message: error.reason },
    ]);
  }

  // Standard Error with message
  if (error instanceof Error) {
    // Check for common patterns in error messages
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return new ElenchusError(error.message, ErrorCode.NOT_FOUND, {
        cause: error,
      });
    }

    if (
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('must be')
    ) {
      return new ElenchusError(error.message, ErrorCode.VALIDATION_ERROR, {
        cause: error,
      });
    }

    if (
      message.includes('permission') ||
      message.includes('forbidden') ||
      message.includes('unauthorized')
    ) {
      return new ElenchusError(error.message, ErrorCode.SECURITY_ERROR, {
        cause: error,
      });
    }

    // Default to internal error
    return new ElenchusError(error.message, ErrorCode.INTERNAL_ERROR, {
      cause: error,
    });
  }

  // Unknown error type
  return new ElenchusError(
    'An unexpected error occurred',
    ErrorCode.INTERNAL_ERROR,
    {
      details: { originalError: String(error) },
    }
  );
}

/**
 * Create a structured error response for MCP tools.
 */
export function createErrorResponse(
  error: unknown,
  requestId?: string
): Record<string, unknown> {
  const classified = classifyError(error);
  return {
    ...classified.toJSON(),
    ...(requestId && { requestId }),
  };
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ElenchusError) {
    return error.isRetryable;
  }
  return false;
}
