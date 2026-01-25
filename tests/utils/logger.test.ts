import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  describe('basic logging', () => {
    it('should log info messages', () => {
      logger.info('Test message');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('[INFO]');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Test message');
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Warning message');
    });

    it('should log error messages', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error message');
    });

    it('should not log debug messages by default', () => {
      logger.debug('Debug message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when LOG_LEVEL=debug', () => {
      process.env.LOG_LEVEL = 'debug';
      logger.debug('Debug message');
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
    });
  });

  describe('context logging', () => {
    it('should include context in log message', () => {
      logger.info('Test message', { userId: '123', action: 'test' });
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('"userId":"123"');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('"action":"test"');
    });

    it('should format error objects', () => {
      const error = new Error('Test error');
      logger.error('Something failed', error);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"errorName":"Error"');
      expect(logOutput).toContain('"errorMessage":"Test error"');
      expect(logOutput).toContain('"errorStack"');
    });

    it('should handle non-Error error values', () => {
      logger.error('Something failed', 'string error');
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"errorValue":"string error"');
    });
  });

  describe('request context', () => {
    it('should include requestId in logs within context', async () => {
      await logger.withRequestContext({ toolName: 'test_tool' }, async () => {
        logger.info('Test message');
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('"requestId":"req-');
      expect(logOutput).toContain('"tool":"test_tool"');
    });

    it('should include custom requestId when provided', async () => {
      await logger.withRequestContext(
        { requestId: 'custom-req-123', toolName: 'test_tool' },
        async () => {
          logger.info('Test message');
        }
      );

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('"requestId":"custom-req-123"');
    });

    it('should include epicId and sessionId when provided', async () => {
      await logger.withRequestContext(
        { toolName: 'test_tool', epicId: 'epic-123', sessionId: 'session-456' },
        async () => {
          logger.info('Test message');
        }
      );

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('"epicId":"epic-123"');
      expect(logOutput).toContain('"sessionId":"session-456"');
    });

    it('should return the result of the wrapped function', async () => {
      const result = await logger.withRequestContext({}, async () => {
        return 'test result';
      });

      expect(result).toBe('test result');
    });

    it('should propagate errors from wrapped function', async () => {
      await expect(
        logger.withRequestContext({}, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should provide access to requestId via getRequestId', async () => {
      let capturedRequestId: string | undefined;

      await logger.withRequestContext({ requestId: 'test-req-id' }, async () => {
        capturedRequestId = logger.getRequestId();
      });

      expect(capturedRequestId).toBe('test-req-id');
    });

    it('should return undefined for getRequestId outside context', () => {
      expect(logger.getRequestId()).toBeUndefined();
    });

    it('should track elapsed time', async () => {
      let elapsedMs: number | undefined;

      await logger.withRequestContext({}, async () => {
        // Small delay to ensure some time passes
        await new Promise((resolve) => setTimeout(resolve, 10));
        elapsedMs = logger.getElapsedMs();
      });

      expect(elapsedMs).toBeDefined();
      expect(elapsedMs).toBeGreaterThanOrEqual(10);
    });

    it('should allow updating context after creation', async () => {
      await logger.withRequestContext({ toolName: 'test_tool' }, async () => {
        logger.updateContext({ epicId: 'epic-added-later' });
        logger.info('After update');
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('"epicId":"epic-added-later"');
    });

    it('should not include context fields in logs outside request context', () => {
      logger.info('No context');
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('requestId');
      expect(logOutput).not.toContain('tool');
    });

    it('should handle nested request contexts', async () => {
      await logger.withRequestContext(
        { requestId: 'outer-req', toolName: 'outer_tool' },
        async () => {
          await logger.withRequestContext(
            { requestId: 'inner-req', toolName: 'inner_tool' },
            async () => {
              logger.info('Inner message');
            }
          );
          logger.info('Outer message');
        }
      );

      // Inner message should have inner context
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('"requestId":"inner-req"');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('"tool":"inner_tool"');

      // Outer message should have outer context (restored after inner completes)
      expect(consoleInfoSpy.mock.calls[1][0]).toContain('"requestId":"outer-req"');
      expect(consoleInfoSpy.mock.calls[1][0]).toContain('"tool":"outer_tool"');
    });
  });

  describe('timestamp format', () => {
    it('should include ISO timestamp', () => {
      logger.info('Test message');
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      // Match ISO timestamp pattern: [YYYY-MM-DDTHH:mm:ss.sssZ]
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('generated request IDs', () => {
    it('should generate unique request IDs', async () => {
      const requestIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        await logger.withRequestContext({}, async () => {
          const id = logger.getRequestId();
          if (id) requestIds.push(id);
        });
      }

      // All IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should generate request IDs with correct format', async () => {
      await logger.withRequestContext({}, async () => {
        const id = logger.getRequestId();
        expect(id).toMatch(/^req-[A-Za-z0-9_-]{8}$/);
      });
    });
  });
});
