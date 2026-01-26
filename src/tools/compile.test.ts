import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCompile } from './compile.js';
import type { Storage } from '../storage/index.js';
import type { InterrogationSession } from '../types/index.js';

// Mock storage
const mockStorage = {
  saveEpic: vi.fn(),
  getEpic: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  saveContext: vi.fn(),
  getContext: vi.fn(),
  saveSpec: vi.fn(),
  getSpec: vi.fn(),
  listEpics: vi.fn(),
  listSessions: vi.fn(),
  deleteEpic: vi.fn(),
  deleteSession: vi.fn(),
  getSessionsForEpic: vi.fn(),
  getContextForPath: vi.fn(),
  listPromptInsights: vi.fn(),
};

// Test fixtures
const createMockSession = (overrides?: Partial<InterrogationSession>): InterrogationSession => ({
  id: 'session-1',
  epicId: 'epic-1',
  status: 'complete',
  questions: [
    { id: 'q1', type: 'scope', question: 'What is the core problem?', priority: 'critical', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'q2', type: 'success', question: 'How do we measure success?', priority: 'high', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'q3', type: 'constraint', question: 'What are the time constraints?', priority: 'medium', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'q4', type: 'risk', question: 'What could go wrong?', priority: 'high', createdAt: '2024-01-01T00:00:00Z' },
  ],
  answers: [
    { questionId: 'q1', answer: 'Users need secure authentication', answeredAt: '2024-01-01T00:01:00Z' },
    { questionId: 'q2', answer: 'Users can log in within 2 seconds', answeredAt: '2024-01-01T00:02:00Z' },
    { questionId: 'q3', answer: 'Must ship in 2 weeks', answeredAt: '2024-01-01T00:03:00Z' },
    { questionId: 'q4', answer: 'Token expiry and session hijacking', answeredAt: '2024-01-01T00:04:00Z' },
  ],
  clarityScore: 100,
  completenessScore: 100,
  readyForSpec: true,
  blockers: [],
  round: 2,
  maxRounds: 10,
  startedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:05:00Z',
  ...overrides,
});

const createMockEpic = () => ({
  id: 'epic-1',
  source: 'text' as const,
  title: 'User Authentication',
  description: 'Implement secure user authentication',
  rawContent: 'Build a secure authentication system with JWT tokens and refresh token rotation.',
  extractedGoals: ['Secure login', 'Token-based auth'],
  extractedConstraints: ['Must use JWT'],
  extractedAcceptanceCriteria: ['Users can log in', 'Sessions expire after 24h'],
  linkedResources: [],
  status: 'interrogating' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('Compile Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.listPromptInsights.mockReturnValue([]);
  });

  describe('Basic compilation', () => {
    it('should compile a completed session into agent prompts', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);

      const result = await handleCompile(
        { sessionId: 'session-1' },
        mockStorage as unknown as Storage
      );

      expect(result.compilationPrompt).toBeDefined();
      expect(result.compilationPrompt.length).toBeGreaterThan(100);
      expect(result.context.epic.id).toBe('epic-1');
      expect(result.context.facts.length).toBe(4);
      expect(result.expectedOutputSchema).toContain('problemStatement');
      expect(result.expectedOutputSchema).toContain('agentPrompts');
    });

    it('should extract facts from all answered questions', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);

      const result = await handleCompile(
        { sessionId: 'session-1' },
        mockStorage as unknown as Storage
      );

      // Should have facts for each answered question
      expect(result.context.facts.length).toBe(4);

      // Facts should be organized by area
      const factAreas = result.context.facts.map(f => f.area);
      expect(factAreas).toContain('scope');
      expect(factAreas).toContain('success');
      expect(factAreas).toContain('constraint');
      expect(factAreas).toContain('risk');
    });

    it('should include codebase context when available', async () => {
      const session = createMockSession();
      const epic = createMockEpic();
      const context = {
        analyzedAt: '2024-01-01T00:00:00Z',
        rootPath: '.',
        analysisDepth: 'medium' as const,
        maturity: 'established' as const,
        architecture: 'modular-monolith' as const,
        primaryLanguage: 'TypeScript',
        detectedLanguages: [{ name: 'TypeScript', confidence: 95, fileCount: 50, percentage: 80, detectionMethod: 'manifest' as const, frameworks: ['Express'], hasTests: true, hasLinting: true, hasTypeChecking: true }],
        frameworks: ['Express', 'Vitest'],
        conventions: [
          { type: 'error-handling' as const, pattern: 'Result<T, Error>', examples: [], confidence: 90 },
          { type: 'testing' as const, pattern: 'Vitest + describe/it', examples: [], confidence: 85 },
        ],
        suggestedPatterns: [],
        dependencies: [{ name: 'express', version: '4.18.0', type: 'production' as const }],
        testCoverage: { overallPercentage: 75, hasTests: true, testFramework: 'vitest', criticalPathsCovered: true },
        hasTypeScript: true,
        hasLinting: true,
        hasCICD: true,
        riskAreas: [],
        relevantFiles: [
          { path: 'src/auth/login.ts', relevance: 95, reason: 'Authentication entry point' },
        ],
        contextFiles: {},
      };

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(context);

      const result = await handleCompile(
        { sessionId: 'session-1' },
        mockStorage as unknown as Storage
      );

      expect(result.context.codebase).not.toBeNull();
      expect(result.context.codebase?.architecture).toBe('modular-monolith');
      expect(result.context.codebase?.conventions.errorHandling).toBe('Result<T, Error>');
      expect(result.context.codebase?.relevantFiles.length).toBe(1);
    });
  });

  describe('Gating behavior', () => {
    it('should block compilation when required coverage areas are missing', async () => {
      // Session missing risk answers
      const session = createMockSession({
        questions: [
          { id: 'q1', type: 'scope', question: 'What is the problem?', priority: 'critical', createdAt: '2024-01-01T00:00:00Z' },
          { id: 'q2', type: 'success', question: 'How do we measure success?', priority: 'high', createdAt: '2024-01-01T00:00:00Z' },
          { id: 'q3', type: 'constraint', question: 'What are the constraints?', priority: 'medium', createdAt: '2024-01-01T00:00:00Z' },
        ],
        answers: [
          { questionId: 'q1', answer: 'Auth needed', answeredAt: '2024-01-01T00:00:00Z' },
          { questionId: 'q2', answer: 'Fast login', answeredAt: '2024-01-01T00:00:00Z' },
          { questionId: 'q3', answer: '2 weeks', answeredAt: '2024-01-01T00:00:00Z' },
        ],
      });

      mockStorage.getSession.mockReturnValue(session);

      await expect(
        handleCompile(
          { sessionId: 'session-1' },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('BLOCKED');
    });

    it('should throw error when session not found', async () => {
      mockStorage.getSession.mockReturnValue(null);

      await expect(
        handleCompile(
          { sessionId: 'invalid-session' },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('Session not found');
    });

    it('should throw error when sessionId missing', async () => {
      await expect(
        handleCompile(
          {},
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('sessionId is required');
    });
  });

  describe('Insights integration', () => {
    it('should include prompt insights when available', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);
      mockStorage.listPromptInsights.mockReturnValue([
        {
          id: 'insight-1',
          pattern: 'explicit-file-paths',
          description: 'Always include explicit file paths in prompts',
          context: 'implementation',
          successRate: 85,
          usageCount: 20,
          examples: [],
          tags: ['prompts'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await handleCompile(
        { sessionId: 'session-1', includeInsights: true },
        mockStorage as unknown as Storage
      );

      expect(result.context.insights.length).toBe(1);
      expect(result.context.insights[0].pattern).toBe('explicit-file-paths');
    });

    it('should exclude insights when includeInsights is false', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);
      mockStorage.listPromptInsights.mockReturnValue([
        {
          id: 'insight-1',
          pattern: 'test-pattern',
          description: 'Test description',
          context: 'test',
          successRate: 80,
          usageCount: 10,
          examples: [],
          tags: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await handleCompile(
        { sessionId: 'session-1', includeInsights: false },
        mockStorage as unknown as Storage
      );

      expect(result.context.insights.length).toBe(0);
    });
  });

  describe('Output format', () => {
    it('should include expected output schema documentation', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);

      const result = await handleCompile(
        { sessionId: 'session-1' },
        mockStorage as unknown as Storage
      );

      // Schema should document the expected output structure
      expect(result.expectedOutputSchema).toContain('problemStatement');
      expect(result.expectedOutputSchema).toContain('technicalDecisions');
      expect(result.expectedOutputSchema).toContain('agentPrompts');
      expect(result.expectedOutputSchema).toContain('research');
      expect(result.expectedOutputSchema).toContain('design');
      expect(result.expectedOutputSchema).toContain('implementation');
      expect(result.expectedOutputSchema).toContain('test');
      expect(result.expectedOutputSchema).toContain('review');
      expect(result.expectedOutputSchema).toContain('successCriteria');
      expect(result.expectedOutputSchema).toContain('risksAndMitigation');
      expect(result.expectedOutputSchema).toContain('executionPlan');
      expect(result.expectedOutputSchema).toContain('checkpoints');
    });

    it('should include compilation instructions', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      mockStorage.getSession.mockReturnValue(session);
      mockStorage.getEpic.mockReturnValue(epic);
      mockStorage.getContextForPath.mockReturnValue(null);

      const result = await handleCompile(
        { sessionId: 'session-1' },
        mockStorage as unknown as Storage
      );

      expect(result.instructions).toContain('Compilation Instructions');
      expect(result.instructions).toContain('Facts by Area');
      expect(result.instructions).toContain('Requirements');
    });
  });
});
