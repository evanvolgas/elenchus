import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleStatus } from '../../src/tools/status.js';
import type { Storage } from '../../src/storage/index.js';
import type { Epic, InterrogationSession, Specification } from '../../src/types/index.js';

// Mock storage with all required methods
const createMockStorage = (): Storage => ({
  saveEpic: vi.fn(),
  getEpic: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  getSessionsForEpic: vi.fn(),
  saveSpec: vi.fn(),
  getSpec: vi.fn(),
  getLatestSpecForEpic: vi.fn(),
  listEpics: vi.fn(),
  saveContext: vi.fn(),
  getContextForPath: vi.fn(),
  transaction: vi.fn((fn) => fn()),
  close: vi.fn(),
});

describe('Status Tool', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.clearAllMocks();
  });

  describe('Epic Status', () => {
    it('should return status for an epic in ingested state', async () => {
      const mockEpic: Epic = {
        id: 'epic-123',
        title: 'Build User Authentication',
        source: 'text',
        sourceId: 'JIRA-123',
        rawContent: 'Build authentication...',
        status: 'ingested',
        extractedGoals: ['Secure login', 'User management'],
        extractedConstraints: ['Must use OAuth2'],
        extractedAcceptanceCriteria: ['Login works', 'Sessions persist'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getEpic).mockReturnValue(mockEpic);
      vi.mocked(mockStorage.getSessionsForEpic).mockReturnValue([]);
      vi.mocked(mockStorage.getLatestSpecForEpic).mockReturnValue(undefined);

      const result = await handleStatus({ epicId: 'epic-123' }, mockStorage);

      expect(result.type).toBe('epic');
      expect(result.data).toMatchObject({
        epic: {
          id: 'epic-123',
          title: 'Build User Authentication',
          status: 'ingested',
          goals: 2,
          constraints: 1,
          acceptanceCriteria: 2,
        },
        sessions: [],
        latestSpec: null,
      });
      expect(result.nextSteps).toContain('Run elenchus_analyze to understand codebase context');
      expect(result.nextSteps).toContain('Run elenchus_interrogate to start clarification');
    });

    it('should return status for an epic in interrogating state', async () => {
      const mockEpic: Epic = {
        id: 'epic-456',
        title: 'API Integration',
        source: 'github',
        sourceId: 'owner/repo#42',
        rawContent: 'Integrate third-party API...',
        status: 'interrogating',
        extractedGoals: ['Connect to API'],
        extractedConstraints: ['Rate limiting'],
        extractedAcceptanceCriteria: ['API calls work'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      };

      const mockSession: InterrogationSession = {
        id: 'sess-789',
        epicId: 'epic-456',
        status: 'active',
        round: 1,
        questions: [
          {
            id: 'q1',
            type: 'scope',
            priority: 'critical',
            question: 'Which API endpoints?',
            context: 'Need to know scope',
          },
        ],
        answers: [],
        clarityScore: 0.3,
        completenessScore: 0.2,
        blockers: [],
        readyForSpec: false,
        startedAt: '2025-01-01T01:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      };

      vi.mocked(mockStorage.getEpic).mockReturnValue(mockEpic);
      vi.mocked(mockStorage.getSessionsForEpic).mockReturnValue([mockSession]);
      vi.mocked(mockStorage.getLatestSpecForEpic).mockReturnValue(undefined);

      const result = await handleStatus({ epicId: 'epic-456' }, mockStorage);

      expect(result.type).toBe('epic');
      expect(result.nextSteps).toContain('Continue answering questions with elenchus_answer');
      expect(result.data).toMatchObject({
        epic: {
          status: 'interrogating',
        },
        sessions: [
          {
            id: 'sess-789',
            status: 'active',
            clarityScore: 0.3,
            completenessScore: 0.2,
            readyForSpec: false,
            questionsAnswered: 0,
            questionsTotal: 1,
          },
        ],
      });
    });

    it('should return status for an epic in ready state with spec', async () => {
      const mockEpic: Epic = {
        id: 'epic-789',
        title: 'Dashboard Feature',
        source: 'text',
        sourceId: null,
        rawContent: 'Add dashboard...',
        status: 'ready',
        extractedGoals: ['User dashboard'],
        extractedConstraints: [],
        extractedAcceptanceCriteria: ['Dashboard displays'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T02:00:00.000Z',
      };

      const mockSpec: Specification = {
        id: 'spec-001',
        epicId: 'epic-789',
        sessionId: 'sess-001',
        version: 1,
        title: 'Dashboard Implementation',
        description: 'Implement user dashboard',
        phases: [],
        checkpoints: [],
        acceptanceCriteria: [],
        estimatedDuration: {
          phases: [],
          totalMinutes: 120,
        },
        estimatedCost: {
          phases: [],
          totalTokens: 50000,
          estimatedCostUSD: 0.75,
        },
        risks: [],
        readinessScore: 85,
        readinessIssues: [],
        createdAt: '2025-01-01T02:00:00.000Z',
        updatedAt: '2025-01-01T02:00:00.000Z',
      };

      vi.mocked(mockStorage.getEpic).mockReturnValue(mockEpic);
      vi.mocked(mockStorage.getSessionsForEpic).mockReturnValue([]);
      vi.mocked(mockStorage.getLatestSpecForEpic).mockReturnValue(mockSpec);

      const result = await handleStatus({ epicId: 'epic-789' }, mockStorage);

      expect(result.type).toBe('epic');
      expect(result.nextSteps).toContain('Start execution with elenchus_execute');
      expect(result.data).toMatchObject({
        latestSpec: {
          id: 'spec-001',
          version: 1,
          readinessScore: 85,
        },
      });
    });

    it('should throw error for non-existent epic', async () => {
      vi.mocked(mockStorage.getEpic).mockReturnValue(undefined);

      await expect(handleStatus({ epicId: 'epic-999' }, mockStorage)).rejects.toThrow(
        'Epic not found: epic-999'
      );
    });
  });

  describe('Session Status', () => {
    it('should return status for active interrogation session', async () => {
      const mockSession: InterrogationSession = {
        id: 'sess-123',
        epicId: 'epic-001',
        status: 'active',
        round: 2,
        questions: [
          {
            id: 'q1',
            type: 'scope',
            priority: 'critical',
            question: 'What is the scope?',
            context: 'Need clarity',
          },
          {
            id: 'q2',
            type: 'technical',
            priority: 'high',
            question: 'Which framework?',
            context: 'Tech stack',
          },
          {
            id: 'q3',
            type: 'constraint',
            priority: 'medium',
            question: 'Any restrictions?',
            context: 'Constraints',
          },
        ],
        answers: [
          {
            questionId: 'q1',
            answer: 'Full user auth system',
            answeredBy: 'pm',
            answeredAt: '2025-01-01T00:30:00.000Z',
          },
        ],
        clarityScore: 0.6,
        completenessScore: 0.5,
        blockers: ['Need API documentation'],
        readyForSpec: false,
        startedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:30:00.000Z',
      };

      vi.mocked(mockStorage.getSession).mockReturnValue(mockSession);

      const result = await handleStatus({ sessionId: 'sess-123' }, mockStorage);

      expect(result.type).toBe('session');
      expect(result.data).toMatchObject({
        id: 'sess-123',
        epicId: 'epic-001',
        status: 'active',
        round: 2,
        clarityScore: 0.6,
        completenessScore: 0.5,
        readyForSpec: false,
        blockers: ['Need API documentation'],
        questions: {
          total: 3,
          answered: 1,
          critical: 1,
          criticalAnswered: 1,
        },
      });
      expect(result.data.unansweredQuestions).toHaveLength(2);
      expect(result.nextSteps).toContain('Answer 2 remaining question(s)');
    });

    it('should prioritize critical unanswered questions in next steps', async () => {
      const mockSession: InterrogationSession = {
        id: 'sess-456',
        epicId: 'epic-002',
        status: 'active',
        round: 1,
        questions: [
          {
            id: 'q1',
            type: 'scope',
            priority: 'critical',
            question: 'Critical question 1?',
            context: 'Important',
          },
          {
            id: 'q2',
            type: 'scope',
            priority: 'critical',
            question: 'Critical question 2?',
            context: 'Very important',
          },
          {
            id: 'q3',
            type: 'technical',
            priority: 'high',
            question: 'High priority question?',
            context: 'Tech',
          },
        ],
        answers: [],
        clarityScore: 0.2,
        completenessScore: 0.1,
        blockers: [],
        readyForSpec: false,
        startedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSession).mockReturnValue(mockSession);

      const result = await handleStatus({ sessionId: 'sess-456' }, mockStorage);

      expect(result.nextSteps).toContain('Answer 2 critical question(s)');
    });

    it('should suggest spec generation when session is ready', async () => {
      const mockSession: InterrogationSession = {
        id: 'sess-789',
        epicId: 'epic-003',
        status: 'active',
        round: 3,
        questions: [
          {
            id: 'q1',
            type: 'scope',
            priority: 'critical',
            question: 'Question?',
            context: 'Context',
          },
        ],
        answers: [
          {
            questionId: 'q1',
            answer: 'Answer',
            answeredBy: 'dev',
            answeredAt: '2025-01-01T00:30:00.000Z',
          },
        ],
        clarityScore: 0.9,
        completenessScore: 0.95,
        blockers: [],
        readyForSpec: true,
        startedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      };

      vi.mocked(mockStorage.getSession).mockReturnValue(mockSession);

      const result = await handleStatus({ sessionId: 'sess-789' }, mockStorage);

      expect(result.nextSteps).toContain('Generate specification with elenchus_generate_spec');
    });

    it('should throw error for non-existent session', async () => {
      vi.mocked(mockStorage.getSession).mockReturnValue(undefined);

      await expect(handleStatus({ sessionId: 'sess-999' }, mockStorage)).rejects.toThrow(
        'Session not found: sess-999'
      );
    });

    it('should limit unanswered questions preview to 5', async () => {
      const questions = Array.from({ length: 10 }, (_, i) => ({
        id: `q${i}`,
        type: 'scope' as const,
        priority: 'medium' as const,
        question: `Question ${i}?`,
        context: `Context ${i}`,
      }));

      const mockSession: InterrogationSession = {
        id: 'sess-many',
        epicId: 'epic-004',
        status: 'active',
        round: 1,
        questions,
        answers: [],
        clarityScore: 0.1,
        completenessScore: 0.1,
        blockers: [],
        readyForSpec: false,
        startedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSession).mockReturnValue(mockSession);

      const result = await handleStatus({ sessionId: 'sess-many' }, mockStorage);

      expect(result.data.unansweredQuestions).toHaveLength(5);
      expect(result.data.questions.total).toBe(10);
    });
  });

  describe('Specification Status', () => {
    it('should return status for high-readiness spec', async () => {
      const mockSpec: Specification = {
        id: 'spec-123',
        epicId: 'epic-001',
        sessionId: 'sess-001',
        version: 1,
        title: 'Feature Implementation',
        description: 'Implement the feature',
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            description: 'Initial setup',
            tasks: [
              {
                id: 'task-1',
                description: 'Configure environment',
                estimatedMinutes: 30,
                dependencies: [],
              },
            ],
            checkpointAfter: true,
            estimatedMinutes: 30,
          },
        ],
        checkpoints: [
          {
            id: 'cp-1',
            afterPhaseId: 'phase-1',
            name: 'Setup Complete',
            verificationSteps: ['Check config'],
            artifacts: ['config.json'],
          },
        ],
        acceptanceCriteria: [
          {
            id: 'ac-1',
            description: 'Feature works',
            testable: true,
            testStrategy: 'Manual testing',
          },
        ],
        estimatedDuration: {
          phases: [{ phaseId: 'phase-1', minutes: 30 }],
          totalMinutes: 30,
        },
        estimatedCost: {
          phases: [{ phaseId: 'phase-1', tokens: 10000, costUSD: 0.15 }],
          totalTokens: 10000,
          estimatedCostUSD: 0.15,
        },
        risks: [
          {
            id: 'risk-1',
            description: 'API might be down',
            severity: 'medium',
            mitigation: 'Add retry logic',
          },
        ],
        readinessScore: 85,
        readinessIssues: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSpec).mockReturnValue(mockSpec);

      const result = await handleStatus({ specId: 'spec-123' }, mockStorage);

      expect(result.type).toBe('spec');
      expect(result.data).toMatchObject({
        id: 'spec-123',
        epicId: 'epic-001',
        sessionId: 'sess-001',
        version: 1,
        readinessScore: 85,
        readinessIssues: [],
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            tasks: 1,
            checkpointAfter: true,
          },
        ],
        checkpoints: 1,
        acceptanceCriteria: 1,
        estimatedDuration: '30 minutes',
        estimatedCost: '$0.15',
        risks: 1,
      });
      expect(result.nextSteps).toContain('Validate specification with elenchus_validate');
      expect(result.nextSteps).toContain('Start execution with elenchus_execute');
    });

    it('should suggest improvements for low-readiness spec', async () => {
      const mockSpec: Specification = {
        id: 'spec-456',
        epicId: 'epic-002',
        sessionId: 'sess-002',
        version: 1,
        title: 'Incomplete Spec',
        description: 'Needs work',
        phases: [],
        checkpoints: [],
        acceptanceCriteria: [],
        estimatedDuration: {
          phases: [],
          totalMinutes: 0,
        },
        estimatedCost: {
          phases: [],
          totalTokens: 0,
          estimatedCostUSD: 0,
        },
        risks: [],
        readinessScore: 45,
        readinessIssues: [
          'Missing phases',
          'No acceptance criteria defined',
          'No checkpoints configured',
          'No risk assessment',
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSpec).mockReturnValue(mockSpec);

      const result = await handleStatus({ specId: 'spec-456' }, mockStorage);

      expect(result.type).toBe('spec');
      expect(result.nextSteps).toContain('Improve specification completeness');
      expect(result.nextSteps).toContain('Fix: Missing phases');
      expect(result.nextSteps).toContain('Fix: No acceptance criteria defined');
      expect(result.nextSteps).toContain('Fix: No checkpoints configured');
      expect(result.nextSteps).not.toContain('Fix: No risk assessment'); // Only first 3 issues
    });

    it('should throw error for non-existent spec', async () => {
      vi.mocked(mockStorage.getSpec).mockReturnValue(undefined);

      await expect(handleStatus({ specId: 'spec-999' }, mockStorage)).rejects.toThrow(
        'Specification not found: spec-999'
      );
    });
  });

  describe('System Summary', () => {
    it('should return summary with multiple epics', async () => {
      const mockEpics: Epic[] = [
        {
          id: 'epic-1',
          title: 'Feature A',
          source: 'text',
          sourceId: null,
          rawContent: 'Content A',
          status: 'ready',
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T03:00:00.000Z',
        },
        {
          id: 'epic-2',
          title: 'Feature B',
          source: 'text',
          sourceId: null,
          rawContent: 'Content B',
          status: 'interrogating',
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T02:00:00.000Z',
        },
        {
          id: 'epic-3',
          title: 'Feature C',
          source: 'text',
          sourceId: null,
          rawContent: 'Content C',
          status: 'ingested',
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T01:00:00.000Z',
        },
      ];

      vi.mocked(mockStorage.listEpics).mockReturnValue(mockEpics);

      const result = await handleStatus({}, mockStorage);

      expect(result.type).toBe('summary');
      expect(result.data).toMatchObject({
        totalEpics: 3,
        byStatus: {
          ready: 1,
          interrogating: 1,
          ingested: 1,
        },
        recentEpics: [
          {
            id: 'epic-1',
            title: 'Feature A',
            status: 'ready',
          },
          {
            id: 'epic-2',
            title: 'Feature B',
            status: 'interrogating',
          },
          {
            id: 'epic-3',
            title: 'Feature C',
            status: 'ingested',
          },
        ],
      });
      expect(result.nextSteps).toContain('Continue work on 2 in-progress epic(s)');
    });

    it('should suggest ingesting epic when system is empty', async () => {
      vi.mocked(mockStorage.listEpics).mockReturnValue([]);

      const result = await handleStatus({}, mockStorage);

      expect(result.type).toBe('summary');
      expect(result.data).toMatchObject({
        totalEpics: 0,
        byStatus: {},
        recentEpics: [],
      });
      expect(result.nextSteps).toContain('Ingest an epic with elenchus_ingest to get started');
    });

    it('should limit recent epics to 5', async () => {
      const mockEpics: Epic[] = Array.from({ length: 10 }, (_, i) => ({
        id: `epic-${i}`,
        title: `Epic ${i}`,
        source: 'text' as const,
        sourceId: null,
        rawContent: `Content ${i}`,
        status: 'ingested' as const,
        extractedGoals: [],
        extractedConstraints: [],
        extractedAcceptanceCriteria: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: `2025-01-01T0${i}:00:00.000Z`,
      }));

      vi.mocked(mockStorage.listEpics).mockReturnValue(mockEpics);

      const result = await handleStatus({}, mockStorage);

      expect(result.data.recentEpics).toHaveLength(5);
      expect(result.data.totalEpics).toBe(10);
    });

    it('should count epics by status correctly', async () => {
      const mockEpics: Epic[] = [
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `epic-ingested-${i}`,
          title: `Ingested ${i}`,
          source: 'text' as const,
          sourceId: null,
          rawContent: 'Content',
          status: 'ingested' as const,
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          id: `epic-ready-${i}`,
          title: `Ready ${i}`,
          source: 'text' as const,
          sourceId: null,
          rawContent: 'Content',
          status: 'ready' as const,
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        })),
        {
          id: 'epic-analyzing',
          title: 'Analyzing',
          source: 'text' as const,
          sourceId: null,
          rawContent: 'Content',
          status: 'analyzing' as const,
          extractedGoals: [],
          extractedConstraints: [],
          extractedAcceptanceCriteria: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      vi.mocked(mockStorage.listEpics).mockReturnValue(mockEpics);

      const result = await handleStatus({}, mockStorage);

      expect(result.data.byStatus).toEqual({
        ingested: 3,
        ready: 2,
        analyzing: 1,
      });
    });
  });

  describe('Input Validation', () => {
    it('should handle invalid input gracefully', async () => {
      await expect(
        handleStatus({ epicId: 123 as any }, mockStorage)
      ).rejects.toThrow();
    });

    it('should prioritize specId over sessionId and epicId', async () => {
      const mockSpec: Specification = {
        id: 'spec-priority',
        epicId: 'epic-001',
        sessionId: 'sess-001',
        version: 1,
        title: 'Priority Test',
        description: 'Test',
        phases: [],
        checkpoints: [],
        acceptanceCriteria: [],
        estimatedDuration: { phases: [], totalMinutes: 0 },
        estimatedCost: { phases: [], totalTokens: 0, estimatedCostUSD: 0 },
        risks: [],
        readinessScore: 70,
        readinessIssues: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSpec).mockReturnValue(mockSpec);

      const result = await handleStatus(
        {
          specId: 'spec-priority',
          sessionId: 'sess-001',
          epicId: 'epic-001',
        },
        mockStorage
      );

      expect(result.type).toBe('spec');
      expect(mockStorage.getSpec).toHaveBeenCalledWith('spec-priority');
      expect(mockStorage.getSession).not.toHaveBeenCalled();
      expect(mockStorage.getEpic).not.toHaveBeenCalled();
    });

    it('should prioritize sessionId over epicId', async () => {
      const mockSession: InterrogationSession = {
        id: 'sess-priority',
        epicId: 'epic-001',
        status: 'active',
        round: 1,
        questions: [],
        answers: [],
        clarityScore: 0.5,
        completenessScore: 0.5,
        blockers: [],
        readyForSpec: false,
        startedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(mockStorage.getSession).mockReturnValue(mockSession);

      const result = await handleStatus(
        {
          sessionId: 'sess-priority',
          epicId: 'epic-001',
        },
        mockStorage
      );

      expect(result.type).toBe('session');
      expect(mockStorage.getSession).toHaveBeenCalledWith('sess-priority');
      expect(mockStorage.getEpic).not.toHaveBeenCalled();
    });
  });
});
