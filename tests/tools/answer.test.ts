import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleAnswer } from '../../src/tools/answer.js';
import type { Storage } from '../../src/storage/index.js';
import type { Epic, InterrogationSession, Question } from '../../src/types/index.js';

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
};

// Test fixtures
const createMockEpic = (): Epic => ({
  id: 'epic-1',
  source: 'text',
  sourceId: undefined,
  title: 'Test Epic',
  description: 'A test epic for unit tests',
  rawContent: 'Build a user authentication system',
  extractedGoals: [],
  extractedConstraints: [],
  extractedAcceptanceCriteria: [],
  extractedStakeholders: [],
  linkedResources: [],
  status: 'interrogating',
  createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
});

const createMockQuestion = (overrides?: Partial<Question>): Question => ({
  id: 'q-1',
  type: 'scope',
  priority: 'critical',
  question: 'What authentication methods should be supported?',
  context: 'Understanding authentication scope',
  targetAudience: 'both',
  ...overrides,
});

const createMockSession = (overrides?: Partial<InterrogationSession>): InterrogationSession => ({
  id: 'session-1',
  epicId: 'epic-1',
  status: 'in-progress',
  questions: [
    createMockQuestion(),
    createMockQuestion({
      id: 'q-2',
      type: 'success',
      priority: 'important',
      question: 'How will we measure authentication success?',
    }),
    createMockQuestion({
      id: 'q-3',
      type: 'constraint',
      priority: 'critical',
      question: 'Are there regulatory constraints?',
    }),
  ],
  answers: [],
  clarityScore: 30,
  completenessScore: 40,
  readyForSpec: false,
  blockers: [],
  round: 1,
  maxRounds: 3,
  startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  ...overrides,
});

describe('Answer Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successfully answering questions', () => {
    it('should add new answers to a session', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              questionId: 'q-1',
              answer: 'OAuth 2.0 and JWT tokens',
              notes: 'Industry standard',
            },
          ],
          answeredBy: 'pm',
        },
        mockStorage
      );

      // Should have one answer
      expect(result.session.answers).toHaveLength(1);
      expect(result.session.answers[0]).toMatchObject({
        questionId: 'q-1',
        answer: 'OAuth 2.0 and JWT tokens',
        notes: 'Industry standard',
        answeredBy: 'pm',
        usedDefault: false,
      });

      // Should update timestamps
      expect(result.session.updatedAt).toBeDefined();
      expect(result.session.answers[0].answeredAt).toBeDefined();

      // Should save session and epic
      expect(mockStorage.saveSession).toHaveBeenCalledWith(session);
      expect(mockStorage.saveEpic).toHaveBeenCalledWith(epic);
    });

    it('should handle multiple answers at once', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'OAuth 2.0' },
            { questionId: 'q-2', answer: '99.9% uptime' },
            { questionId: 'q-3', answer: 'GDPR compliance required' },
          ],
        },
        mockStorage
      );

      expect(result.session.answers).toHaveLength(3);
      expect(result.session.answers.map(a => a.questionId)).toEqual(['q-1', 'q-2', 'q-3']);
    });

    it('should detect when default answer is used', async () => {
      const question = createMockQuestion({
        inferredDefault: 'OAuth 2.0',
        inferredFrom: 'industry standard',
      });
      const session = createMockSession({ questions: [question] });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'OAuth 2.0' }],
        },
        mockStorage
      );

      expect(result.session.answers[0].usedDefault).toBe(true);
    });
  });

  describe('Updating existing answers (idempotency)', () => {
    it('should update existing answer when answering same question again', async () => {
      const session = createMockSession({
        answers: [
          {
            questionId: 'q-1',
            answer: 'Basic Auth',
            usedDefault: false,
            answeredAt: new Date('2024-01-01T00:00:00Z').toISOString(),
          },
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              questionId: 'q-1',
              answer: 'OAuth 2.0 and JWT',
              notes: 'Changed after review',
            },
          ],
          answeredBy: 'dev',
        },
        mockStorage
      );

      // Should still have only one answer
      expect(result.session.answers).toHaveLength(1);

      // Answer should be updated
      expect(result.session.answers[0]).toMatchObject({
        questionId: 'q-1',
        answer: 'OAuth 2.0 and JWT',
        notes: 'Changed after review',
        answeredBy: 'dev',
      });

      // Timestamp should be updated
      expect(new Date(result.session.answers[0].answeredAt).getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00Z').getTime()
      );
    });
  });

  describe('Clarity score calculation', () => {
    it('should increase clarity score when critical questions are answered', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', priority: 'critical' }),
        ],
        clarityScore: 30, // Initial score
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Detailed answer to critical question' },
          ],
        },
        mockStorage
      );

      // Clarity score should increase (30 base + 40 * 0.5 for 1/2 critical answered + 30 for no important)
      expect(result.session.clarityScore).toBeGreaterThan(30);
      expect(result.session.clarityScore).toBe(80); // 30 + 20 + 30 (no important questions)
    });

    it('should calculate maximum clarity score when all questions answered', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', priority: 'important' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Answer 1' },
            { questionId: 'q-2', answer: 'Answer 2' },
          ],
        },
        mockStorage
      );

      // 30 base + 40 (all critical) + 30 (all important) = 100
      expect(result.session.clarityScore).toBe(100);
    });

    it('should handle sessions with only important questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'important' }),
          createMockQuestion({ id: 'q-2', priority: 'important' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Answer' }],
        },
        mockStorage
      );

      // 30 base + 40 (no critical, so get full) + 15 (half of important answered)
      expect(result.session.clarityScore).toBe(85);
    });
  });

  describe('Completeness score calculation', () => {
    it('should increase completeness when required question types are answered', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope' }),
          createMockQuestion({ id: 'q-2', type: 'success' }),
          createMockQuestion({ id: 'q-3', type: 'constraint' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Scope defined' }],
        },
        mockStorage
      );

      // 40 base + 20 (1/3 required types answered)
      expect(result.session.completenessScore).toBe(60);
    });

    it('should achieve 100% completeness when all required types covered', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope' }),
          createMockQuestion({ id: 'q-2', type: 'success' }),
          createMockQuestion({ id: 'q-3', type: 'constraint' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Scope' },
            { questionId: 'q-2', answer: 'Success' },
            { questionId: 'q-3', answer: 'Constraint' },
          ],
        },
        mockStorage
      );

      // 40 base + 60 (all required types) = 100
      expect(result.session.completenessScore).toBe(100);
    });

    it('should not exceed 100 for completeness score', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope' }),
          createMockQuestion({ id: 'q-2', type: 'success' }),
          createMockQuestion({ id: 'q-3', type: 'constraint' }),
          createMockQuestion({ id: 'q-4', type: 'stakeholder' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Scope' },
            { questionId: 'q-2', answer: 'Success' },
            { questionId: 'q-3', answer: 'Constraint' },
            { questionId: 'q-4', answer: 'Stakeholder' },
          ],
        },
        mockStorage
      );

      expect(result.session.completenessScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Follow-up question generation', () => {
    it('should generate follow-up for vague critical answers', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Yes' }], // Very short
        },
        mockStorage
      );

      // Should have original question + follow-up
      expect(result.session.questions).toHaveLength(2);

      const followUp = result.session.questions.find(q => q.id === 'q-followup-q-1');
      expect(followUp).toBeDefined();
      expect(followUp?.type).toBe('clarification');
      expect(followUp?.priority).toBe('important');
      expect(followUp?.question).toContain('elaborate');
      expect(followUp?.context).toContain('Yes');
    });

    it('should not generate follow-up for detailed answers', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            {
              questionId: 'q-1',
              answer: 'We need OAuth 2.0 with JWT tokens for secure authentication',
            },
          ],
        },
        mockStorage
      );

      // Should only have original question
      expect(result.session.questions).toHaveLength(1);
    });

    it('should not generate duplicate follow-up questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
          createMockQuestion({ id: 'q-followup-q-1', type: 'clarification' }), // Already exists
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Yes' }], // Short again
        },
        mockStorage
      );

      // Should not duplicate the follow-up
      expect(result.session.questions).toHaveLength(2);
    });

    it('should not generate follow-up for non-critical questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'important' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Yes' }],
        },
        mockStorage
      );

      // Should not generate follow-up for important priority
      expect(result.session.questions).toHaveLength(1);
    });
  });

  describe('Session readiness and status', () => {
    it('should mark session as ready when scores >= 70', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', type: 'success', priority: 'critical' }),
          createMockQuestion({ id: 'q-3', type: 'constraint', priority: 'important' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Detailed scope definition here' },
            { questionId: 'q-2', answer: 'Success criteria defined in detail' },
            { questionId: 'q-3', answer: 'Constraints specified clearly' },
          ],
        },
        mockStorage
      );

      expect(result.session.readyForSpec).toBe(true);
      expect(result.session.status).toBe('complete');
      expect(result.session.completedAt).toBeDefined();
      expect(result.readyForSpec).toBe(true);
    });

    it('should not mark ready if clarity score too low', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', priority: 'critical' }),
          createMockQuestion({ id: 'q-3', priority: 'critical' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Only one answer' }],
        },
        mockStorage
      );

      expect(result.session.readyForSpec).toBe(false);
      expect(result.session.status).toBe('in-progress');
      expect(result.session.completedAt).toBeUndefined();
    });

    it('should identify unanswered critical questions as blockers', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical', question: 'Critical Q1' }),
          createMockQuestion({ id: 'q-2', priority: 'critical', question: 'Critical Q2' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Answer to Q1' }],
        },
        mockStorage
      );

      expect(result.session.blockers).toHaveLength(1);
      expect(result.session.blockers[0]).toContain('Critical Q2');
    });
  });

  describe('Epic updates from answers', () => {
    it('should update epic goals from scope questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-goals-1', type: 'scope' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-goals-1', answer: 'Implement user authentication' },
          ],
        },
        mockStorage
      );

      expect(epic.extractedGoals).toContain('Implement user authentication');
      expect(epic.updatedAt).toBeDefined();
    });

    it('should update epic acceptance criteria from success questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'success' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: '99.9% uptime' }],
        },
        mockStorage
      );

      expect(epic.extractedAcceptanceCriteria).toContain('99.9% uptime');
    });

    it('should update epic constraints from constraint questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'constraint' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Must be GDPR compliant' }],
        },
        mockStorage
      );

      expect(epic.extractedConstraints).toContain('Must be GDPR compliant');
    });

    it('should update epic stakeholders from stakeholder questions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'stakeholder' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Product Manager, Engineering Lead' }],
        },
        mockStorage
      );

      expect(epic.extractedStakeholders).toContain('Product Manager, Engineering Lead');
    });
  });

  describe('Recommendations', () => {
    it('should recommend answering more questions when clarity low', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', priority: 'critical' }),
          createMockQuestion({ id: 'q-3', priority: 'critical' }),
          createMockQuestion({ id: 'q-4', priority: 'important' }),
        ],
        clarityScore: 30,
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Brief answer' }],
        },
        mockStorage
      );

      // With 1/3 critical answered (13.3%) and 0/1 important answered (0%)
      // clarity should be: 30 + (40 * 0.33) + (30 * 0) = 43.3, which is < 50
      expect(result.recommendations).toContain('Answer more questions to improve clarity');
    });

    it('should recommend generating spec when ready', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope', priority: 'critical' }),
          createMockQuestion({ id: 'q-2', type: 'success', priority: 'critical' }),
          createMockQuestion({ id: 'q-3', type: 'constraint', priority: 'important' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [
            { questionId: 'q-1', answer: 'Detailed scope answer' },
            { questionId: 'q-2', answer: 'Detailed success answer' },
            { questionId: 'q-3', answer: 'Detailed constraint answer' },
          ],
        },
        mockStorage
      );

      expect(result.recommendations).toContain(
        'Ready to generate specification! Use elenchus_generate_spec'
      );
    });

    it('should show remaining question count when not ready for spec', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', type: 'scope' }),
          createMockQuestion({ id: 'q-2', type: 'success' }),
          createMockQuestion({ id: 'q-3', type: 'constraint' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Short answer' }], // Not enough for readiness
        },
        mockStorage
      );

      // Since session won't be ready (low clarity), should show remaining questions
      expect(result.recommendations.some(r => r.includes('question(s) remaining'))).toBe(true);
    });
  });

  describe('Next questions', () => {
    it('should return only unanswered questions in nextQuestions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'important' }), // Non-critical to avoid follow-ups
          createMockQuestion({ id: 'q-2' }),
          createMockQuestion({ id: 'q-3' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Detailed enough answer to avoid follow-ups' }],
        },
        mockStorage
      );

      expect(result.nextQuestions).toHaveLength(2);
      expect(result.nextQuestions.map(q => q.id)).toEqual(['q-2', 'q-3']);
    });

    it('should include follow-up questions in nextQuestions', async () => {
      const session = createMockSession({
        questions: [
          createMockQuestion({ id: 'q-1', priority: 'critical' }),
        ],
      });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Yes' }], // Vague
        },
        mockStorage
      );

      // Should have the follow-up in next questions
      expect(result.nextQuestions).toHaveLength(1);
      expect(result.nextQuestions[0].id).toBe('q-followup-q-1');
    });
  });

  describe('Error handling', () => {
    it('should throw error when session not found', async () => {
      vi.mocked(mockStorage.getSession).mockReturnValue(undefined);

      await expect(
        handleAnswer(
          {
            sessionId: 'nonexistent',
            answers: [{ questionId: 'q-1', answer: 'Answer' }],
          },
          mockStorage
        )
      ).rejects.toThrow('Session not found: nonexistent');
    });

    it('should throw error when epic not found', async () => {
      const session = createMockSession();
      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(undefined);

      await expect(
        handleAnswer(
          {
            sessionId: 'session-1',
            answers: [{ questionId: 'q-1', answer: 'Answer' }],
          },
          mockStorage
        )
      ).rejects.toThrow('Epic not found: epic-1');
    });

    it('should throw error when question ID not found', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      await expect(
        handleAnswer(
          {
            sessionId: 'session-1',
            answers: [{ questionId: 'invalid-id', answer: 'Answer' }],
          },
          mockStorage
        )
      ).rejects.toThrow('Question not found: invalid-id');
    });

    it('should validate input schema', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      // Missing required field
      await expect(
        handleAnswer(
          {
            sessionId: 'session-1',
            // Missing answers array
          },
          mockStorage
        )
      ).rejects.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty answers array gracefully', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [],
        },
        mockStorage
      );

      // Should not error, just return current state
      expect(result.session.answers).toHaveLength(0);
      expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should handle session with no questions', async () => {
      const session = createMockSession({ questions: [] });
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [],
        },
        mockStorage
      );

      // Scores should still be calculated
      expect(result.session.clarityScore).toBeDefined();
      expect(result.session.completenessScore).toBeDefined();
    });

    it('should handle answers with very long text', async () => {
      const session = createMockSession();
      const epic = createMockEpic();
      const longAnswer = 'A'.repeat(10000);

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: longAnswer }],
        },
        mockStorage
      );

      expect(result.session.answers[0].answer).toBe(longAnswer);
      // Should not generate follow-up for long answers
      expect(result.session.questions).toHaveLength(3); // Original 3 questions
    });

    it('should handle special characters in answers', async () => {
      const session = createMockSession();
      const epic = createMockEpic();
      const specialAnswer = 'OAuth 2.0 "Bearer" & <JWT> tokens';

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: specialAnswer }],
        },
        mockStorage
      );

      expect(result.session.answers[0].answer).toBe(specialAnswer);
    });

    it('should handle answers without optional answeredBy field', async () => {
      const session = createMockSession();
      const epic = createMockEpic();

      vi.mocked(mockStorage.getSession).mockReturnValue(session);
      vi.mocked(mockStorage.getEpic).mockReturnValue(epic);

      const result = await handleAnswer(
        {
          sessionId: 'session-1',
          answers: [{ questionId: 'q-1', answer: 'Answer' }],
          // No answeredBy field
        },
        mockStorage
      );

      expect(result.session.answers[0].answeredBy).toBeUndefined();
    });
  });
});
