import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { handleToolCall } from './index.js';
import { Storage } from '../storage/index.js';

/** Parse the JSON from a tool call result */
function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('elenchus_session', () => {
  let storage: Storage;
  let originalApiKey: string | undefined;

  beforeAll(() => {
    // Remove API key to force structural-only mode (faster tests)
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    // Restore API key
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  beforeEach(() => {
    storage = new Storage(':memory:');
  });

  // ============================================================================
  // ACTION VALIDATION
  // ============================================================================

  describe('action validation', () => {
    it('should error on missing action', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {}, storage));
      expect(response['error']).toBe(true);
      expect(response['message']).toContain('action is required');
    });

    it('should error on unknown action', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', { action: 'unknown' }, storage));
      expect(response['error']).toBe(true);
      expect(response['message']).toContain('Unknown action');
    });
  });

  // ============================================================================
  // LIST ACTION
  // ============================================================================

  describe('list action', () => {
    it('should list epics', async () => {
      // Create an epic first
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage);

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'list',
        type: 'epics',
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['type']).toBe('epics');
      expect((response['data'] as Record<string, unknown>)['count']).toBeGreaterThanOrEqual(1);
    });

    it('should list sessions', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'list',
        type: 'sessions',
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['type']).toBe('sessions');
    });

    it('should list specs', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'list',
        type: 'specs',
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['type']).toBe('specs');
    });

    it('should error on missing type for list', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'list',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('type is required');
    });
  });

  // ============================================================================
  // DELETE ACTION
  // ============================================================================

  describe('delete action', () => {
    it('should error on missing deleteType', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'delete',
        id: 'some-id',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('deleteType is required');
    });

    it('should error on missing id', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'delete',
        deleteType: 'epic',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('id is required');
    });

    it('should return not found for nonexistent epic', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'delete',
        deleteType: 'epic',
        id: 'nonexistent',
      }, storage));

      expect(response['success']).toBe(false);
      expect(response['message']).toContain('not found');
    });

    it('should fail to delete epic with session due to FK constraint', async () => {
      // Create an epic (which also creates a session)
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const epicId = startResponse['epicId'] as string;

      // Trying to delete epic with existing session fails due to FK constraint
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'delete',
        deleteType: 'epic',
        id: epicId,
      }, storage));

      // The storage throws FOREIGN KEY constraint error which becomes an error response
      expect(response['error']).toBe(true);
      expect(response['message']).toContain('FOREIGN KEY');
    });
  });

  // ============================================================================
  // RESUME ACTION
  // ============================================================================

  describe('resume action', () => {
    it('should error when sessionId missing', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'resume',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('sessionId is required');
    });

    it('should error when session not found', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'resume',
        sessionId: 'nonexistent',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('Session not found');
    });

    it('should resume an existing session', async () => {
      // Create a session
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'resume',
        sessionId,
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['sessionId']).toBe(sessionId);
      expect((response['data'] as Record<string, unknown>)['epicTitle']).toBeTruthy();
    });
  });

  // ============================================================================
  // PREMISES ACTION
  // ============================================================================

  describe('premises action', () => {
    it('should error when sessionId missing', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'premises',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('sessionId is required');
    });

    it('should error when session not found', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'premises',
        sessionId: 'nonexistent',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('Session not found');
    });

    it('should list premises for a session', async () => {
      // Create a session
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'premises',
        sessionId,
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['sessionId']).toBe(sessionId);
      expect(typeof (response['data'] as Record<string, unknown>)['total']).toBe('number');
    });
  });

  // ============================================================================
  // CONTRADICTIONS ACTION
  // ============================================================================

  describe('contradictions action', () => {
    it('should error when sessionId missing', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'contradictions',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('sessionId is required');
    });

    it('should error when session not found', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'contradictions',
        sessionId: 'nonexistent',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('Session not found');
    });

    it('should list contradictions for a session', async () => {
      // Create a session
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'contradictions',
        sessionId,
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['sessionId']).toBe(sessionId);
      expect(typeof (response['data'] as Record<string, unknown>)['count']).toBe('number');
    });
  });

  // ============================================================================
  // EXPORT ACTION
  // ============================================================================

  describe('export action', () => {
    it('should error when sessionId missing', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        what: 'session',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('sessionId is required');
    });

    it('should error when what missing', async () => {
      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        sessionId: 'some-id',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('what is required');
    });

    it('should export session as json', async () => {
      // Create a session
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        sessionId,
        what: 'session',
        format: 'json',
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['what']).toBe('session');
      expect((response['data'] as Record<string, unknown>)['format']).toBe('json');
      expect((response['data'] as Record<string, unknown>)['content']).toBeTruthy();
    });

    it('should export session as markdown', async () => {
      // Create a session
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        sessionId,
        what: 'session',
        format: 'markdown',
      }, storage));

      expect(response['success']).toBe(true);
      expect((response['data'] as Record<string, unknown>)['what']).toBe('session');
      expect((response['data'] as Record<string, unknown>)['format']).toBe('markdown');
      expect((response['data'] as Record<string, unknown>)['content']).toContain('#');
    });

    it('should error when spec not found for spec export', async () => {
      // Create a session (no spec generated)
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a todo app',
      }, storage));
      const sessionId = startResponse['sessionId'] as string;

      const response = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        sessionId,
        what: 'spec',
      }, storage));

      expect(response['error']).toBe(true);
      expect(response['message']).toContain('No specification found');
    });
  });

  // ============================================================================
  // INTEGRATION TEST
  // ============================================================================

  describe('integration - full workflow', () => {
    it('should complete workflow: start → list → resume → export', async () => {
      // 1. Start interrogation
      const startResponse = parseResult(await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a library management system with book checkout functionality',
      }, storage));
      expect(startResponse['sessionId']).toBeTruthy();
      const { sessionId, epicId } = startResponse as { sessionId: string; epicId: string };

      // 2. List sessions
      const listResponse = parseResult(await handleToolCall('elenchus_session', {
        action: 'list',
        type: 'sessions',
      }, storage));
      expect(listResponse['success']).toBe(true);
      expect((listResponse['data'] as Record<string, unknown>)['count']).toBeGreaterThanOrEqual(1);

      // 3. Resume the session
      const resumeResponse = parseResult(await handleToolCall('elenchus_session', {
        action: 'resume',
        sessionId,
      }, storage));
      expect(resumeResponse['success']).toBe(true);
      expect((resumeResponse['data'] as Record<string, unknown>)['epicId']).toBe(epicId);

      // 4. Export session data
      const exportResponse = parseResult(await handleToolCall('elenchus_session', {
        action: 'export',
        sessionId,
        what: 'session',
        format: 'summary',
      }, storage));
      expect(exportResponse['success']).toBe(true);
      expect((exportResponse['data'] as Record<string, unknown>)['content']).toContain('Session');
    });
  });
});
