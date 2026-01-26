/**
 * Tests for error classification utilities
 */

import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import {
  ElenchusError,
  NotFoundError,
  ValidationError,
  SecurityError,
  ExternalServiceError,
  classifyError,
  createErrorResponse,
  isRetryableError,
  ErrorCode,
  HttpStatus,
} from './errors.js';
import { PathTraversalError, InvalidPathError } from './path-security.js';

describe('errors', () => {
  describe('ElenchusError', () => {
    it('should create error with code and message', () => {
      const error = new ElenchusError('Test error', ErrorCode.INTERNAL_ERROR);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('ElenchusError');
    });

    it('should set default HTTP status based on code', () => {
      expect(
        new ElenchusError('', ErrorCode.VALIDATION_ERROR).httpStatus
      ).toBe(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(
        new ElenchusError('', ErrorCode.NOT_FOUND).httpStatus
      ).toBe(HttpStatus.NOT_FOUND);

      expect(
        new ElenchusError('', ErrorCode.SECURITY_ERROR).httpStatus
      ).toBe(HttpStatus.FORBIDDEN);

      expect(
        new ElenchusError('', ErrorCode.INTERNAL_ERROR).httpStatus
      ).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should allow custom HTTP status', () => {
      const error = new ElenchusError('Test', ErrorCode.INTERNAL_ERROR, {
        httpStatus: 418,
      });
      expect(error.httpStatus).toBe(418);
    });

    it('should set retryable flag appropriately', () => {
      expect(
        new ElenchusError('', ErrorCode.SERVICE_UNAVAILABLE).isRetryable
      ).toBe(true);

      expect(
        new ElenchusError('', ErrorCode.EXTERNAL_SERVICE_ERROR).isRetryable
      ).toBe(true);

      expect(
        new ElenchusError('', ErrorCode.VALIDATION_ERROR).isRetryable
      ).toBe(false);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ElenchusError('Test error', ErrorCode.NOT_FOUND, {
        details: { resourceId: '123' },
      });

      const json = error.toJSON();

      expect(json.error).toBe(true);
      expect(json.code).toBe(ErrorCode.NOT_FOUND);
      expect(json.message).toBe('Test error');
      expect(json.httpStatus).toBe(HttpStatus.NOT_FOUND);
      expect(json.details).toEqual({ resourceId: '123' });
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource info', () => {
      const error = new NotFoundError('Epic', 'epic-123');

      expect(error.message).toBe('Epic not found: epic-123');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.httpStatus).toBe(HttpStatus.NOT_FOUND);
      expect(error.details).toEqual({
        resourceType: 'Epic',
        resourceId: 'epic-123',
      });
    });
  });

  describe('ValidationError', () => {
    it('should create error with validation details', () => {
      const error = new ValidationError('Invalid input', [
        { path: 'email', message: 'Invalid email format' },
        { path: 'age', message: 'Must be positive' },
      ]);

      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details?.errors).toHaveLength(2);
    });

    it('should create from ZodError', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().positive(),
      });

      try {
        schema.parse({ name: '', age: -1 });
      } catch (zodError) {
        const error = ValidationError.fromZodError(zodError as ZodError);

        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(error.message).toContain('Validation failed');
        expect(error.details?.errors).toBeDefined();
      }
    });
  });

  describe('SecurityError', () => {
    it('should create security error', () => {
      const error = new SecurityError('Access denied', {
        attemptedResource: '/admin',
      });

      expect(error.code).toBe(ErrorCode.SECURITY_ERROR);
      expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
      expect(error.details?.attemptedResource).toBe('/admin');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create retryable external service error', () => {
      const error = new ExternalServiceError('Claude API', 'Rate limited');

      expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.isRetryable).toBe(true);
      expect(error.message).toContain('Claude API');
      expect(error.details?.serviceName).toBe('Claude API');
    });
  });

  describe('classifyError', () => {
    it('should pass through ElenchusError unchanged', () => {
      const original = new ElenchusError('Test', ErrorCode.INTERNAL_ERROR);
      const classified = classifyError(original);

      expect(classified).toBe(original);
    });

    it('should convert ZodError to ValidationError', () => {
      const schema = z.string().min(5);
      try {
        schema.parse('abc');
      } catch (zodError) {
        const classified = classifyError(zodError);

        expect(classified).toBeInstanceOf(ValidationError);
        expect(classified.code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });

    it('should convert PathTraversalError to SecurityError', () => {
      const error = new PathTraversalError('../etc', '/etc', '/home/user');
      const classified = classifyError(error);

      expect(classified).toBeInstanceOf(SecurityError);
      expect(classified.code).toBe(ErrorCode.SECURITY_ERROR);
      expect(classified.details?.attemptedPath).toBe('../etc');
    });

    it('should convert InvalidPathError to ValidationError', () => {
      const error = new InvalidPathError('/path', 'too long');
      const classified = classifyError(error);

      expect(classified.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should detect not found patterns in messages', () => {
      const error = new Error('Epic not found');
      const classified = classifyError(error);

      expect(classified.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should detect validation patterns in messages', () => {
      const error = new Error('Name is required');
      const classified = classifyError(error);

      expect(classified.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should detect security patterns in messages', () => {
      const error = new Error('Permission denied');
      const classified = classifyError(error);

      expect(classified.code).toBe(ErrorCode.SECURITY_ERROR);
    });

    it('should default to internal error for unknown errors', () => {
      const error = new Error('Something went wrong');
      const classified = classifyError(error);

      expect(classified.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should handle non-Error objects', () => {
      const classified = classifyError('string error');

      expect(classified.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(classified.details?.originalError).toBe('string error');
    });
  });

  describe('createErrorResponse', () => {
    it('should create structured error response', () => {
      const error = new NotFoundError('Session', 'session-456');
      const response = createErrorResponse(error, 'req-123');

      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.message).toContain('Session not found');
      expect(response.requestId).toBe('req-123');
    });

    it('should classify unknown errors', () => {
      const error = new Error('Unknown error');
      const response = createErrorResponse(error);

      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      const error = new ExternalServiceError('API', 'timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new ValidationError('Invalid input');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-ElenchusError', () => {
      expect(isRetryableError(new Error('test'))).toBe(false);
      expect(isRetryableError('string')).toBe(false);
    });
  });
});
