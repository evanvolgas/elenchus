import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage, type ExecutionRecord, type PromptInsight } from './index.js';
import { existsSync, unlinkSync } from 'node:fs';
import type { Epic, InterrogationSession, Specification, CodebaseContext } from '../types/index.js';
import type { Delivery } from '../types/delivery.js';

describe('Storage - ExecutionRecord operations', () => {
  let storage: Storage;
  const testDbPath = './test-exec-records.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testDbPath + '-shm')) {
      unlinkSync(testDbPath + '-shm');
    }
    if (existsSync(testDbPath + '-wal')) {
      unlinkSync(testDbPath + '-wal');
    }
  });

  it('should save and retrieve execution records', () => {
    // Create test epic first (required by foreign key)
    const epic: Epic = {
      id: 'epic-1',
      source: 'text',
      title: 'Test Epic',
      description: 'Test description',
      rawContent: 'Test content',
      extractedGoals: ['goal1'],
      extractedConstraints: ['constraint1'],
      extractedAcceptanceCriteria: ['criteria1'],
      linkedResources: [],
      status: 'ingested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveEpic(epic);

    // Create test session (required by specs foreign key)
    const session: InterrogationSession = {
      id: 'session-1',
      epicId: 'epic-1',
      status: 'complete',
      questions: [],
      answers: [],
      clarityScore: 80,
      completenessScore: 75,
      readyForSpec: true,
      blockers: [],
      round: 1,
      maxRounds: 3,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    // Create test spec (required by execution records foreign key)
    const spec: Specification = {
      id: 'spec-1',
      epicId: 'epic-1',
      sessionId: 'session-1',
      version: 1,
      problem: 'Test problem',
      userPersona: 'Test user',
      successMetrics: [],
      outOfScope: [],
      constraints: [],
      integrations: [],
      phases: [],
      checkpoints: [],
      acceptanceCriteria: [],
      testStrategy: {
        unitTests: true,
        integrationTests: false,
        e2eTests: false,
        coverageTarget: 80,
        notes: [],
      },
      estimatedCost: {
        totalTokens: 1000,
        estimatedCostUSD: 0.01,
        breakdown: {},
        confidence: 'medium',
      },
      estimatedDuration: {
        totalMinutes: 30,
        breakdown: {},
        parallelizable: 10,
        confidence: 'medium',
      },
      risks: [],
      readinessScore: 85,
      readinessIssues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSpec(spec);

    // Save execution record
    const record: ExecutionRecord = {
      id: 'rec-1',
      specId: 'spec-1',
      epicId: 'epic-1',
      phase: 'implementation',
      taskId: 'task-1',
      status: 'success',
      output: 'Test output',
      errors: ['error1', 'error2'],
      tokensUsed: 500,
      durationMs: 1000,
      timestamp: new Date().toISOString(),
    };

    storage.saveExecutionRecord(record);

    // Retrieve records
    const records = storage.getExecutionRecordsForSpec('spec-1');

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('rec-1');
    expect(records[0].status).toBe('success');
    expect(records[0].errors).toEqual(['error1', 'error2']);
    expect(records[0].tokensUsed).toBe(500);
    expect(records[0].durationMs).toBe(1000);
  });

  it('should save execution record without optional fields', () => {
    // Setup required entities
    const epic: Epic = {
      id: 'epic-2',
      source: 'text',
      title: 'Test Epic 2',
      description: 'Test description',
      rawContent: 'Test content',
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
      id: 'session-2',
      epicId: 'epic-2',
      status: 'complete',
      questions: [],
      answers: [],
      clarityScore: 80,
      completenessScore: 75,
      readyForSpec: true,
      blockers: [],
      round: 1,
      maxRounds: 3,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSession(session);

    const spec: Specification = {
      id: 'spec-2',
      epicId: 'epic-2',
      sessionId: 'session-2',
      version: 1,
      problem: 'Test problem',
      userPersona: 'Test user',
      successMetrics: [],
      outOfScope: [],
      constraints: [],
      integrations: [],
      phases: [],
      checkpoints: [],
      acceptanceCriteria: [],
      testStrategy: {
        unitTests: true,
        integrationTests: false,
        e2eTests: false,
        coverageTarget: 80,
        notes: [],
      },
      estimatedCost: {
        totalTokens: 1000,
        estimatedCostUSD: 0.01,
        breakdown: {},
        confidence: 'medium',
      },
      estimatedDuration: {
        totalMinutes: 30,
        breakdown: {},
        parallelizable: 10,
        confidence: 'medium',
      },
      risks: [],
      readinessScore: 85,
      readinessIssues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSpec(spec);

    // Save minimal execution record
    const record: ExecutionRecord = {
      id: 'rec-2',
      specId: 'spec-2',
      epicId: 'epic-2',
      phase: 'testing',
      taskId: 'task-2',
      status: 'failure',
      output: 'Test failed',
      timestamp: new Date().toISOString(),
    };

    storage.saveExecutionRecord(record);

    const records = storage.getExecutionRecordsForSpec('spec-2');

    expect(records).toHaveLength(1);
    expect(records[0].errors).toBeUndefined();
    expect(records[0].tokensUsed).toBeUndefined();
    expect(records[0].durationMs).toBeUndefined();
  });
});

describe('Storage - PromptInsight operations', () => {
  let storage: Storage;
  const testDbPath = './test-insights.db';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    storage = new Storage(testDbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testDbPath + '-shm')) {
      unlinkSync(testDbPath + '-shm');
    }
    if (existsSync(testDbPath + '-wal')) {
      unlinkSync(testDbPath + '-wal');
    }
  });

  it('should save and retrieve prompt insights', () => {
    const insight: PromptInsight = {
      id: 'insight-1',
      pattern: 'test-pattern',
      description: 'Test pattern description',
      context: 'Test context',
      successRate: 0.85,
      usageCount: 10,
      examples: [
        { specId: 'spec-1', outcome: 'success' },
        { specId: 'spec-2', outcome: 'success' },
      ],
      tags: ['testing', 'pattern'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storage.savePromptInsight(insight);

    const retrieved = storage.getPromptInsight('test-pattern');

    expect(retrieved).toBeDefined();
    expect(retrieved?.pattern).toBe('test-pattern');
    expect(retrieved?.successRate).toBe(0.85);
    expect(retrieved?.usageCount).toBe(10);
    expect(retrieved?.examples).toHaveLength(2);
    expect(retrieved?.tags).toEqual(['testing', 'pattern']);
  });

  it('should list insights sorted by success rate and usage', () => {
    const insights: PromptInsight[] = [
      {
        id: 'insight-1',
        pattern: 'pattern-1',
        description: 'Pattern 1',
        context: 'Context 1',
        successRate: 0.7,
        usageCount: 5,
        examples: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'insight-2',
        pattern: 'pattern-2',
        description: 'Pattern 2',
        context: 'Context 2',
        successRate: 0.9,
        usageCount: 3,
        examples: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'insight-3',
        pattern: 'pattern-3',
        description: 'Pattern 3',
        context: 'Context 3',
        successRate: 0.9,
        usageCount: 10,
        examples: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    insights.forEach((i) => storage.savePromptInsight(i));

    const list = storage.listPromptInsights();

    expect(list).toHaveLength(3);
    // Should be sorted by success_rate DESC, then usage_count DESC
    expect(list[0].pattern).toBe('pattern-3'); // 0.9 success, 10 usage
    expect(list[1].pattern).toBe('pattern-2'); // 0.9 success, 3 usage
    expect(list[2].pattern).toBe('pattern-1'); // 0.7 success, 5 usage
  });

  it('should update existing insight when pattern is the same', () => {
    const insight1: PromptInsight = {
      id: 'insight-1',
      pattern: 'update-test',
      description: 'Original description',
      context: 'Original context',
      successRate: 0.5,
      usageCount: 5,
      examples: [],
      tags: ['v1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storage.savePromptInsight(insight1);

    // Update with same pattern
    const insight2: PromptInsight = {
      id: 'insight-2',
      pattern: 'update-test', // Same pattern
      description: 'Updated description',
      context: 'Updated context',
      successRate: 0.8,
      usageCount: 15,
      examples: [{ specId: 'spec-1', outcome: 'success' }],
      tags: ['v2'],
      createdAt: insight1.createdAt,
      updatedAt: new Date().toISOString(),
    };

    storage.savePromptInsight(insight2);

    const retrieved = storage.getPromptInsight('update-test');

    expect(retrieved).toBeDefined();
    expect(retrieved?.description).toBe('Updated description');
    expect(retrieved?.successRate).toBe(0.8);
    expect(retrieved?.usageCount).toBe(15);
    expect(retrieved?.tags).toEqual(['v2']);

    // Should only have one record
    const list = storage.listPromptInsights();
    expect(list).toHaveLength(1);
  });
});
