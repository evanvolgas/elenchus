import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleAnswer } from '../../src/tools/answer.js';
import type { Storage } from '../../src/storage/index.js';
import type { InterrogationSession } from '../../src/types/index.js';

// Mock storage
const mockStorage: Storage = {
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
};

// Test fixtures
const createMockSession = (overrides?: Partial<InterrogationSession>): InterrogationSession => ({
  id: 'session-1',
  epicId: 'epic-1',
  status: 'in-progress',
  questions: [],
  answers: [],
  clarityScore: 0,
  completenessScore: 0,
  readyForSpec: false,
  blockers: [],
  round: 1,
  maxRounds: 10,
  startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  ...overrides,
});

describe('Answer Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('V3 Architecture: LLM submits categorized Q&A', () => {
    it('should accept answers with type, question, and answer', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              type: 'scope',
              question: 'What is the core problem we are solving?',
              answer: 'Users need a way to authenticate securely',
            },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.addedAnswers).toBe(1);
      expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should track coverage by area', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              type: 'scope',
              question: 'What is the problem?',
              answer: 'Authentication is hard',
            },
            {
              type: 'success',
              question: 'How do we know we succeeded?',
              answer: 'Users can log in',
            },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.coverage.scope.covered).toBe(true);
      expect(result.coverage.success.covered).toBe(true);
      expect(result.coverage.constraint.covered).toBe(false);
      expect(result.coverage.risk.covered).toBe(false);
    });

    it('should calculate clarity score based on required coverage', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      // Cover all 4 required areas: scope, success, constraint, risk
      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'success', question: 'Q2', answer: 'A2' },
            { type: 'constraint', question: 'Q3', answer: 'A3' },
            { type: 'risk', question: 'Q4', answer: 'A4' },
          ],
        },
        mockStorage as unknown as Storage
      );

      // All 4 required areas covered = 100% clarity
      expect(result.metrics.clarityScore).toBe(100);
      expect(result.metrics.readyForSpec).toBe(true);
    });

    it('should mark session ready when clarity >= 80%', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      // Cover all 4 required areas
      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'success', question: 'Q2', answer: 'A2' },
            { type: 'constraint', question: 'Q3', answer: 'A3' },
            { type: 'risk', question: 'Q4', answer: 'A4' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.metrics.readyForSpec).toBe(true);
      expect(result.nextStep).toContain('elenchus_generate_spec');
    });

    it('should identify missing coverage areas', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      // Only cover 2 of 4 required areas
      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'success', question: 'Q2', answer: 'A2' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.metrics.missingAreas).toContain('constraint');
      expect(result.metrics.missingAreas).toContain('risk');
      expect(result.metrics.readyForSpec).toBe(false);
    });

    it('should accept optional coverage areas', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'stakeholder', question: 'Who uses this?', answer: 'Developers' },
            { type: 'technical', question: 'What tech stack?', answer: 'TypeScript' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.coverage.stakeholder.covered).toBe(true);
      expect(result.coverage.technical.covered).toBe(true);
      // But still missing required areas
      expect(result.metrics.readyForSpec).toBe(false);
    });

    it('should support priority field', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              type: 'scope',
              question: 'What is the problem?',
              answer: 'Auth is hard',
              priority: 'critical',
            },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.addedAnswers).toBe(1);
    });

    it('should increment round counter', async () => {
      const session = createMockSession({ round: 3 });
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ type: 'scope', question: 'Q', answer: 'A' }],
        },
        mockStorage as unknown as Storage
      );

      expect(result.session.round).toBe(4);
    });
  });

  describe('Error handling', () => {
    it('should throw error when session not found', async () => {
      vi.mocked(mockStorage.getSession).mockReturnValue(null);

      await expect(
        handleAnswer(
          {
            sessionId: 'invalid-session',
            answers: [{ type: 'scope', question: 'Q', answer: 'A' }],
          },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('Session not found: invalid-session');
    });

    it('should throw error for invalid answer type', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      await expect(
        handleAnswer(
          {
            sessionId: 'session-1',
            answers: [{ type: 'invalid-type', question: 'Q', answer: 'A' }],
          },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('Invalid answer type');
    });

    it('should throw error when sessionId missing', async () => {
      await expect(
        handleAnswer(
          { answers: [{ type: 'scope', question: 'Q', answer: 'A' }] },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('sessionId is required');
    });

    it('should throw error when answers array is empty', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      await expect(
        handleAnswer(
          { sessionId: 'session-1', answers: [] },
          mockStorage as unknown as Storage
        )
      ).rejects.toThrow('answers array is required and must not be empty');
    });
  });

  describe('Recommendations', () => {
    it('should recommend spec generation when ready', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'success', question: 'Q2', answer: 'A2' },
            { type: 'constraint', question: 'Q3', answer: 'A3' },
            { type: 'risk', question: 'Q4', answer: 'A4' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.recommendations).toContain('Ready for spec generation! Call elenchus_generate_spec.');
    });

    it('should recommend covering missing areas when not ready', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ type: 'scope', question: 'Q', answer: 'A' }],
        },
        mockStorage as unknown as Storage
      );

      expect(result.recommendations.some(r => r.includes('Still need answers for'))).toBe(true);
    });
  });

  describe('Session state updates', () => {
    it('should save session after processing answers', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ type: 'scope', question: 'Q', answer: 'A' }],
        },
        mockStorage as unknown as Storage
      );

      expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should update session status to complete when ready', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'success', question: 'Q2', answer: 'A2' },
            { type: 'constraint', question: 'Q3', answer: 'A3' },
            { type: 'risk', question: 'Q4', answer: 'A4' },
          ],
        },
        mockStorage as unknown as Storage
      );

      const savedSession = vi.mocked(mockStorage.saveSession).mock.calls[0][0];
      expect(savedSession.status).toBe('complete');
      expect(savedSession.readyForSpec).toBe(true);
    });

    it('should track blockers as missing coverage areas', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ type: 'scope', question: 'Q', answer: 'A' }],
        },
        mockStorage as unknown as Storage
      );

      const savedSession = vi.mocked(mockStorage.saveSession).mock.calls[0][0];
      expect(savedSession.blockers.length).toBeGreaterThan(0);
      expect(savedSession.blockers.some((b: string) => b.includes('Missing coverage'))).toBe(true);
    });
  });

  describe('Multiple answers in single call', () => {
    it('should process all answers and create question entries', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'scope', question: 'Q2', answer: 'A2' },
            { type: 'success', question: 'Q3', answer: 'A3' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.addedAnswers).toBe(3);
      expect(result.metrics.totalQuestions).toBe(3);
      expect(result.metrics.totalAnswered).toBe(3);
    });

    it('should correctly count questions per area', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { type: 'scope', question: 'Q1', answer: 'A1' },
            { type: 'scope', question: 'Q2', answer: 'A2' },
            { type: 'success', question: 'Q3', answer: 'A3' },
          ],
        },
        mockStorage as unknown as Storage
      );

      expect(result.coverage.scope.questionCount).toBe(2);
      expect(result.coverage.scope.answeredCount).toBe(2);
      expect(result.coverage.success.questionCount).toBe(1);
    });
  });
});
