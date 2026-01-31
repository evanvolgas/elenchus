/**
 * Unit tests for new Elenchus MCP tools:
 * - elenchus_list
 * - elenchus_delete
 * - elenchus_resume
 * - elenchus_premises
 * - elenchus_contradictions
 * - elenchus_export
 * - elenchus_context
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from '../storage/index.js';
import { handleToolCall } from './index.js';
import type { Epic, InterrogationSession, Specification } from '../types/index.js';
import { existsSync, unlinkSync } from 'node:fs';

/** Parse JSON from tool call result */
function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('elenchus_list', () => {
  let storage: Storage;
  const testDbPath = './test-list-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should list empty epics when none exist', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_list', { type: 'epics' }, storage)
    );

    expect(result['type']).toBe('epics');
    expect(result['count']).toBe(0);
    expect(result['epics']).toEqual([]);
  });

  it('should list epics with pagination', async () => {
    // Create test epics
    for (let i = 1; i <= 5; i++) {
      const epic: Epic = {
        id: `epic-${i}`,
        source: 'text',
        title: `Epic ${i}`,
        description: `Description ${i}`,
        rawContent: `Content ${i}`,
        extractedGoals: [],
        extractedConstraints: [],
        extractedAcceptanceCriteria: [],
        linkedResources: [],
        status: 'ingested',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveEpic(epic);
    }

    // List with limit
    const result = parseResult(
      await handleToolCall('elenchus_list', { type: 'epics', limit: 3 }, storage)
    );

    expect(result['count']).toBe(3);
    expect((result['epics'] as unknown[]).length).toBe(3);
  });

  it('should list sessions filtered by epicId', async () => {
    // Create epic first
    const epic: Epic = {
      id: 'epic-for-sessions',
      source: 'text',
      title: 'Test Epic',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    // Create sessions
    for (let i = 1; i <= 3; i++) {
      const session: InterrogationSession = {
        id: `session-${i}`,
        epicId: 'epic-for-sessions',
        status: 'in-progress',
        questions: [],
        answers: [],
        clarityScore: 50,
        completenessScore: 50,
        readyForSpec: false,
        blockers: [],
        round: i,
        maxRounds: 5,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSession(session);
    }

    const result = parseResult(
      await handleToolCall('elenchus_list', { type: 'sessions', epicId: 'epic-for-sessions' }, storage)
    );

    expect(result['type']).toBe('sessions');
    expect(result['count']).toBe(3);
    expect((result['sessions'] as unknown[]).length).toBe(3);
  });

  it('should error on missing type parameter', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_list', {}, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('elenchus_delete', () => {
  let storage: Storage;
  const testDbPath = './test-delete-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should delete an existing epic', async () => {
    // Create epic
    const epic: Epic = {
      id: 'epic-to-delete',
      source: 'text',
      title: 'Deletable Epic',
      description: 'Will be deleted',
      rawContent: 'Content',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    // Verify it exists
    expect(storage.getEpic('epic-to-delete')).toBeDefined();

    // Delete
    const result = parseResult(
      await handleToolCall('elenchus_delete', { type: 'epic', id: 'epic-to-delete' }, storage)
    );

    expect(result['deleted']).toBe(true);
    expect(result['type']).toBe('epic');
    expect(result['id']).toBe('epic-to-delete');

    // Verify it's gone
    expect(storage.getEpic('epic-to-delete')).toBeUndefined();
  });

  it('should return false when epic not found', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_delete', { type: 'epic', id: 'nonexistent' }, storage)
    );

    expect(result['deleted']).toBe(false);
    expect(result['message']).toContain('not found');
  });

  it('should error on missing type', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_delete', { id: 'test' }, storage)
    );

    expect(result['error']).toBeDefined();
  });

  it('should error on missing id', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_delete', { type: 'epic' }, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('elenchus_resume', () => {
  let storage: Storage;
  const testDbPath = './test-resume-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should resume an existing session', async () => {
    // Create epic
    const epic: Epic = {
      id: 'epic-resume',
      source: 'text',
      title: 'Resume Test Epic',
      description: 'Testing resume',
      rawContent: 'Test content',
      extractedGoals: ['goal1'],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    // Create session with Q&A
    const session: InterrogationSession = {
      id: 'session-resume',
      epicId: 'epic-resume',
      status: 'in-progress',
      questions: [
        { id: 'q1', type: 'scope', question: 'What is the scope?', priority: 'critical', context: '' },
      ],
      answers: [
        { questionId: 'q1', answer: 'Limited scope', answeredAt: new Date().toISOString() },
      ],
      clarityScore: 60,
      completenessScore: 50,
      readyForSpec: false,
      blockers: ['Missing success criteria'],
      round: 2,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const result = parseResult(
      await handleToolCall('elenchus_resume', { sessionId: 'session-resume' }, storage)
    );

    expect(result['session']).toBeDefined();
    expect(result['epic']).toBeDefined();
    expect(result['qaHistory']).toBeDefined();
    expect(result['coverage']).toBeDefined();
    expect(result['nextStep']).toBeDefined();

    const sessionData = result['session'] as Record<string, unknown>;
    expect(sessionData['id']).toBe('session-resume');
    expect(sessionData['round']).toBe(2);
    expect(sessionData['clarityScore']).toBe(60);

    const qaHistory = result['qaHistory'] as unknown[];
    expect(qaHistory.length).toBe(1);
  });

  it('should error when session not found', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_resume', { sessionId: 'nonexistent' }, storage)
    );

    expect(result['error']).toBe(true);
    expect(result['message']).toContain('Session not found');
  });

  it('should error when sessionId missing', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_resume', {}, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('elenchus_premises', () => {
  let storage: Storage;
  const testDbPath = './test-premises-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should list premises for a session', async () => {
    // Create epic and session
    const epic: Epic = {
      id: 'epic-premises',
      source: 'text',
      title: 'Premises Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-premises',
      epicId: 'epic-premises',
      status: 'in-progress',
      questions: [],
      answers: [],
      clarityScore: 50,
      completenessScore: 50,
      readyForSpec: false,
      blockers: [],
      round: 1,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    // Add premises
    storage.savePremise({
      id: 'prem-1',
      sessionId: 'session-premises',
      statement: 'Users must authenticate',
      type: 'requirement',
      confidence: 'high',
      extractedFrom: 'answer-1',
      createdAt: new Date().toISOString(),
    });

    storage.savePremise({
      id: 'prem-2',
      sessionId: 'session-premises',
      statement: 'System handles 1000 users',
      type: 'capability',
      confidence: 'medium',
      extractedFrom: 'answer-2',
      createdAt: new Date().toISOString(),
    });

    const result = parseResult(
      await handleToolCall('elenchus_premises', { sessionId: 'session-premises' }, storage)
    );

    expect(result['sessionId']).toBe('session-premises');
    expect(result['count']).toBe(2);
    expect((result['premises'] as unknown[]).length).toBe(2);

    const premises = result['premises'] as Array<Record<string, unknown>>;
    expect(premises.some(p => p['statement'] === 'Users must authenticate')).toBe(true);
    expect(premises.some(p => p['statement'] === 'System handles 1000 users')).toBe(true);
  });

  it('should filter premises by type', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-prem-filter',
      source: 'text',
      title: 'Filter Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-prem-filter',
      epicId: 'epic-prem-filter',
      status: 'in-progress',
      questions: [],
      answers: [],
      clarityScore: 50,
      completenessScore: 50,
      readyForSpec: false,
      blockers: [],
      round: 1,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    // Add mixed premises
    storage.savePremise({
      id: 'prem-req',
      sessionId: 'session-prem-filter',
      statement: 'Required feature',
      type: 'requirement',
      confidence: 'high',
      extractedFrom: 'a1',
      createdAt: new Date().toISOString(),
    });

    storage.savePremise({
      id: 'prem-const',
      sessionId: 'session-prem-filter',
      statement: 'Budget constraint',
      type: 'constraint',
      confidence: 'medium',
      extractedFrom: 'a2',
      createdAt: new Date().toISOString(),
    });

    const result = parseResult(
      await handleToolCall('elenchus_premises', { sessionId: 'session-prem-filter', type: 'requirement' }, storage)
    );

    expect(result['count']).toBe(1);
    const premises = result['premises'] as Array<Record<string, unknown>>;
    expect(premises[0]['type']).toBe('requirement');
  });

  it('should error when session not found', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_premises', { sessionId: 'nonexistent' }, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('elenchus_contradictions', () => {
  let storage: Storage;
  const testDbPath = './test-contradictions-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should list contradictions for a session', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-contra',
      source: 'text',
      title: 'Contra Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-contra',
      epicId: 'epic-contra',
      status: 'in-progress',
      questions: [],
      answers: [],
      clarityScore: 50,
      completenessScore: 50,
      readyForSpec: false,
      blockers: [],
      round: 1,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    // Add premises and contradiction
    storage.savePremise({
      id: 'prem-a',
      sessionId: 'session-contra',
      statement: 'System is simple',
      type: 'capability',
      confidence: 'high',
      extractedFrom: 'a1',
      createdAt: new Date().toISOString(),
    });

    storage.savePremise({
      id: 'prem-b',
      sessionId: 'session-contra',
      statement: 'System handles millions of users',
      type: 'capability',
      confidence: 'high',
      extractedFrom: 'a2',
      createdAt: new Date().toISOString(),
    });

    storage.saveContradiction({
      id: 'contra-1',
      sessionId: 'session-contra',
      premiseIds: ['prem-a', 'prem-b'],
      description: 'Simple systems cannot handle millions of users',
      severity: 'critical',
      resolved: false,
      createdAt: new Date().toISOString(),
    });

    const result = parseResult(
      await handleToolCall('elenchus_contradictions', { sessionId: 'session-contra', action: 'list' }, storage)
    );

    expect(result['sessionId']).toBe('session-contra');
    expect(result['count']).toBe(1);
    expect(result['unresolvedCritical']).toBe(1);
    expect(result['blocksSpec']).toBe(true);

    const contradictions = result['contradictions'] as Array<Record<string, unknown>>;
    expect(contradictions[0]['description']).toContain('Simple systems');
    expect(contradictions[0]['challengeQuestion']).toBeDefined();
  });

  it('should resolve a contradiction', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-resolve',
      source: 'text',
      title: 'Resolve Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-resolve',
      epicId: 'epic-resolve',
      status: 'in-progress',
      questions: [],
      answers: [],
      clarityScore: 50,
      completenessScore: 50,
      readyForSpec: false,
      blockers: [],
      round: 1,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    storage.saveContradiction({
      id: 'contra-to-resolve',
      sessionId: 'session-resolve',
      premiseIds: ['p1', 'p2'],
      description: 'Test contradiction',
      severity: 'critical',
      resolved: false,
      createdAt: new Date().toISOString(),
    });

    const result = parseResult(
      await handleToolCall('elenchus_contradictions', {
        sessionId: 'session-resolve',
        action: 'resolve',
        contradictionId: 'contra-to-resolve',
        resolution: 'Clarified that simple means easy to maintain, not low capacity',
      }, storage)
    );

    expect(result['action']).toBe('resolve');
    expect(result['resolved']).toBeDefined();
    const resolved = result['resolved'] as Record<string, unknown>;
    expect(resolved['success']).toBe(true);
    expect(result['unresolvedCritical']).toBe(0);
    expect(result['blocksSpec']).toBe(false);
  });

  it('should error when session not found', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_contradictions', { sessionId: 'nonexistent', action: 'list' }, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('elenchus_export', () => {
  let storage: Storage;
  const testDbPath = './test-export-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should export session as JSON', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-export',
      source: 'text',
      title: 'Export Test Epic',
      description: 'Testing export',
      rawContent: 'Raw content here',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-export',
      epicId: 'epic-export',
      status: 'complete',
      questions: [
        { id: 'q1', type: 'scope', question: 'What is scope?', priority: 'critical', context: '' },
      ],
      answers: [
        { questionId: 'q1', answer: 'Limited scope', answeredAt: new Date().toISOString() },
      ],
      clarityScore: 80,
      completenessScore: 75,
      readyForSpec: true,
      blockers: [],
      round: 3,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const result = parseResult(
      await handleToolCall('elenchus_export', { sessionId: 'session-export', what: 'session', format: 'json' }, storage)
    );

    expect(result['sessionId']).toBe('session-export');
    expect(result['what']).toBe('session');
    expect(result['format']).toBe('json');
    expect(result['content']).toBeDefined();

    // Parse the content as JSON to verify it's valid
    const content = JSON.parse(result['content'] as string) as Record<string, unknown>;
    expect(content['session']).toBeDefined();
    expect(content['qaHistory']).toBeDefined();
  });

  it('should export session as markdown', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-export-md',
      source: 'text',
      title: 'Markdown Export Test',
      description: 'Testing markdown export',
      rawContent: 'Content',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-export-md',
      epicId: 'epic-export-md',
      status: 'complete',
      questions: [],
      answers: [],
      clarityScore: 80,
      completenessScore: 75,
      readyForSpec: true,
      blockers: [],
      round: 2,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const result = parseResult(
      await handleToolCall('elenchus_export', { sessionId: 'session-export-md', what: 'session', format: 'markdown' }, storage)
    );

    expect(result['format']).toBe('markdown');
    const content = result['content'] as string;
    expect(content).toContain('# Interrogation Session');
    expect(content).toContain('## Summary');
  });

  it('should export audit trail', async () => {
    // Setup
    const epic: Epic = {
      id: 'epic-audit',
      source: 'text',
      title: 'Audit Export Test',
      description: 'Testing audit export',
      rawContent: 'Content',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-audit',
      epicId: 'epic-audit',
      status: 'complete',
      questions: [],
      answers: [],
      clarityScore: 85,
      completenessScore: 80,
      readyForSpec: true,
      blockers: [],
      round: 3,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const result = parseResult(
      await handleToolCall('elenchus_export', { sessionId: 'session-audit', what: 'audit', format: 'json' }, storage)
    );

    expect(result['what']).toBe('audit');
    const content = JSON.parse(result['content'] as string) as Record<string, unknown>;
    expect(content['exportedAt']).toBeDefined();
    expect(content['epic']).toBeDefined();
    expect(content['session']).toBeDefined();
    expect(content['interrogation']).toBeDefined();
    expect(content['elenchus']).toBeDefined();
    expect(content['quality']).toBeDefined();
    expect(content['signals']).toBeDefined();
  });

  it('should error when spec not found for spec export', async () => {
    // Setup (session without spec)
    const epic: Epic = {
      id: 'epic-no-spec',
      source: 'text',
      title: 'No Spec',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-no-spec',
      epicId: 'epic-no-spec',
      status: 'in-progress',
      questions: [],
      answers: [],
      clarityScore: 50,
      completenessScore: 50,
      readyForSpec: false,
      blockers: [],
      round: 1,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const result = parseResult(
      await handleToolCall('elenchus_export', { sessionId: 'session-no-spec', what: 'spec' }, storage)
    );

    expect(result['error']).toBeDefined();
  });

  it('should export spec as markdown', async () => {
    // Setup with spec
    const epic: Epic = {
      id: 'epic-spec-export',
      source: 'text',
      title: 'Spec Export Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    const session: InterrogationSession = {
      id: 'session-spec-export',
      epicId: 'epic-spec-export',
      status: 'complete',
      questions: [],
      answers: [],
      clarityScore: 90,
      completenessScore: 85,
      readyForSpec: true,
      blockers: [],
      round: 3,
      maxRounds: 5,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const spec: Specification = {
      id: 'spec-export',
      epicId: 'epic-spec-export',
      sessionId: 'session-spec-export',
      version: 1,
      problem: 'Build a user authentication system',
      userPersona: 'Developers',
      successMetrics: [
        { name: 'Login success rate', description: 'Percentage of successful logins', target: '99%', measurement: 'Percentage of successful logins / total attempts', priority: 'primary' },
      ],
      outOfScope: ['Password reset via SMS'],
      constraints: [
        { type: 'technical', description: 'Must use OAuth2' },
      ],
      integrations: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Setup OAuth provider',
          tasks: [
            {
              id: 'task-1',
              type: 'implement',
              description: 'Setup OAuth provider',
              agentType: 'coder',
              files: ['src/auth/oauth.ts'],
              acceptanceCriteria: ['OAuth2 provider is configured'],
              constraints: [],
              dependsOn: [],
            },
          ],
          dependencies: [],
        },
      ],
      checkpoints: [],
      acceptanceCriteria: [],
      testStrategy: {
        unitTests: true,
        integrationTests: true,
        e2eTests: false,
        coverageTarget: 80,
        notes: [],
      },
      estimatedCost: {
        totalTokens: 5000,
        estimatedCostUSD: 0.05,
        breakdown: {},
        confidence: 'medium',
      },
      estimatedDuration: {
        totalMinutes: 120,
        breakdown: {},
        parallelizable: 30,
        confidence: 'medium',
      },
      risks: [
        { id: 'risk-1', description: 'Token expiration handling', likelihood: 'medium', impact: 'medium', mitigation: 'Implement refresh tokens' },
      ],
      readinessScore: 85,
      readinessIssues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSpec(spec);

    const result = parseResult(
      await handleToolCall('elenchus_export', { sessionId: 'session-spec-export', what: 'spec', format: 'markdown' }, storage)
    );

    expect(result['what']).toBe('spec');
    expect(result['format']).toBe('markdown');
    const content = result['content'] as string;
    expect(content).toContain('# Spec Export Test');
    expect(content).toContain('## Problem Statement');
    expect(content).toContain('Build a user authentication system');
    expect(content).toContain('## Success Metrics');
    expect(content).toContain('Login success rate');
  });
});

describe('elenchus_context', () => {
  let storage: Storage;
  const testDbPath = './test-context-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should return analysis prompt for analyze action', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_context', { action: 'analyze', path: '.' }, storage)
    );

    expect(result['action']).toBe('analyze');
    expect(result['path']).toBe('.');
    expect(result['analysisPrompt']).toBeDefined();
    expect(result['interrogationHints']).toBeDefined();

    const prompt = result['analysisPrompt'] as string;
    expect(prompt).toContain('Codebase Analysis Request');
    expect(prompt).toContain('Maturity Level');
  });

  it('should store context', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_context', {
        action: 'store',
        path: '/test/project',
        context: {
          maturity: 'established',
          architecture: 'modular-monolith',
          primaryLanguage: 'TypeScript',
          frameworks: ['Express', 'React'],
          hasTypeScript: true,
          hasLinting: true,
          hasCICD: true,
        },
      }, storage)
    );

    expect(result['action']).toBe('store');
    expect(result['stored']).toBe(true);
    expect(result['context']).toBeDefined();

    const context = result['context'] as Record<string, unknown>;
    expect(context['primaryLanguage']).toBe('TypeScript');
    expect(context['maturity']).toBe('established');
  });

  it('should get stored context', async () => {
    // First store context
    await handleToolCall('elenchus_context', {
      action: 'store',
      path: '/test/project2',
      context: {
        maturity: 'early',
        primaryLanguage: 'Python',
        frameworks: ['FastAPI'],
      },
    }, storage);

    // Then get it
    const result = parseResult(
      await handleToolCall('elenchus_context', { action: 'get', path: '/test/project2' }, storage)
    );

    expect(result['action']).toBe('get');
    expect(result['found']).toBe(true);
    expect(result['context']).toBeDefined();

    const context = result['context'] as Record<string, unknown>;
    expect(context['primaryLanguage']).toBe('Python');
  });

  it('should return found=false for nonexistent context', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_context', { action: 'get', path: '/nonexistent' }, storage)
    );

    expect(result['action']).toBe('get');
    expect(result['found']).toBe(false);
  });

  it('should link context to epic', async () => {
    // Create epic first
    const epic: Epic = {
      id: 'epic-context',
      source: 'text',
      title: 'Context Test',
      description: 'Test',
      rawContent: 'Test',
      extractedGoals: [],
      extractedConstraints: [],
      extractedAcceptanceCriteria: [],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    // Store context first
    await handleToolCall('elenchus_context', {
      action: 'store',
      path: '/test/linkable',
      context: {
        maturity: 'greenfield',
        primaryLanguage: 'Go',
      },
    }, storage);

    // Link to epic
    const result = parseResult(
      await handleToolCall('elenchus_context', {
        action: 'link',
        path: '/test/linkable',
        epicId: 'epic-context',
      }, storage)
    );

    expect(result['action']).toBe('link');
    expect(result['linked']).toBeDefined();

    const linked = result['linked'] as Record<string, unknown>;
    expect(linked['epicId']).toBe('epic-context');
    expect(linked['success']).toBe(true);
  });

  it('should error on missing action', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_context', { path: '.' }, storage)
    );

    expect(result['error']).toBeDefined();
  });

  it('should error on missing path', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_context', { action: 'analyze' }, storage)
    );

    expect(result['error']).toBeDefined();
  });
});

describe('Tool integration - full workflow with new tools', { timeout: 30000 }, () => {
  let storage: Storage;
  const testDbPath = './test-integration-tools.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
  });

  it('should complete workflow: start → list → resume → export', async () => {
    // Start a session (this may make LLM calls so we need timeout)
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a simple REST API for notes',
      }, storage)
    );

    const sessionId = startResult['sessionId'] as string;
    const epicId = startResult['epicId'] as string;

    expect(sessionId).toMatch(/^session-/);
    expect(epicId).toMatch(/^epic-/);

    // List epics
    const listResult = parseResult(
      await handleToolCall('elenchus_list', { type: 'epics' }, storage)
    );

    expect(listResult['count']).toBe(1);

    // List sessions
    const sessionsResult = parseResult(
      await handleToolCall('elenchus_list', { type: 'sessions', epicId }, storage)
    );

    expect(sessionsResult['count']).toBe(1);

    // Resume the session
    const resumeResult = parseResult(
      await handleToolCall('elenchus_resume', { sessionId }, storage)
    );

    expect(resumeResult['session']).toBeDefined();
    expect((resumeResult['session'] as Record<string, unknown>)['id']).toBe(sessionId);

    // Export session
    const exportResult = parseResult(
      await handleToolCall('elenchus_export', { sessionId, what: 'session', format: 'summary' }, storage)
    );

    expect(exportResult['what']).toBe('session');
    expect(exportResult['format']).toBe('summary');
    expect(exportResult['content']).toBeDefined();
  });
});
