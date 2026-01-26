import { describe, it, expect } from 'vitest';
import { organizeAnswers } from './answer-extractor.js';
import type { InterrogationSession } from '../types/index.js';

/**
 * Create a mock session with the given answers
 */
function createMockSession(
  answers: Array<{
    questionId: string;
    questionType: string;
    question: string;
    answer: string;
  }>
): InterrogationSession {
  const now = new Date().toISOString();

  return {
    id: 'test-session',
    epicId: 'test-epic',
    status: 'complete',
    questions: answers.map((a) => ({
      id: a.questionId,
      type: a.questionType as 'scope' | 'constraint' | 'success' | 'technical' | 'risk' | 'clarification' | 'stakeholder' | 'timeline',
      priority: 'critical' as const,
      question: a.question,
      context: 'Test context',
      targetAudience: 'both' as const,
    })),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
      usedDefault: false,
      answeredAt: now,
    })),
    clarityScore: 100,
    completenessScore: 100,
    readyForSpec: true,
    blockers: [],
    round: 1,
    maxRounds: 3,
    startedAt: now,
    updatedAt: now,
  };
}

describe('organizeAnswers', () => {
  it('organizes answers by question type', () => {
    const session = createMockSession([
      { questionId: 'q-1', questionType: 'scope', question: 'Scope Q1', answer: 'Scope A1' },
      { questionId: 'q-2', questionType: 'scope', question: 'Scope Q2', answer: 'Scope A2' },
      { questionId: 'q-3', questionType: 'technical', question: 'Tech Q1', answer: 'Tech A1' },
      { questionId: 'q-4', questionType: 'success', question: 'Success Q1', answer: 'Success A1' },
    ]);

    const result = organizeAnswers(session);

    expect(result.scope).toHaveLength(2);
    expect(result.technical).toHaveLength(1);
    expect(result.success).toHaveLength(1);
    expect(result.all).toHaveLength(4);
  });

  it('includes question context in organized answers', () => {
    const session = createMockSession([
      {
        questionId: 'q-1',
        questionType: 'scope',
        question: 'What problem does this solve?',
        answer: 'It manages hybrid human-AI teams.',
      },
    ]);

    const result = organizeAnswers(session);

    expect(result.scope[0]?.question).toBe('What problem does this solve?');
    expect(result.scope[0]?.answer).toBe('It manages hybrid human-AI teams.');
    expect(result.scope[0]?.questionContext).toBe('Test context');
  });

  it('includes session metadata', () => {
    const session = createMockSession([
      { questionId: 'q-1', questionType: 'scope', question: 'Q1', answer: 'A1' },
    ]);

    const result = organizeAnswers(session);

    expect(result.sessionId).toBe('test-session');
    expect(result.epicId).toBe('test-epic');
    expect(result.clarityScore).toBe(100);
    expect(result.completenessScore).toBe(100);
  });

  it('handles empty sessions', () => {
    const session = createMockSession([]);

    const result = organizeAnswers(session);

    expect(result.scope).toHaveLength(0);
    expect(result.technical).toHaveLength(0);
    expect(result.all).toHaveLength(0);
  });

  it('preserves raw answer content without modification', () => {
    const rawAnswer = `This is a complex answer with:
- Multiple lines
- Technical terms like PostgreSQL, Claude API
- Numbers like 99.9% uptime
- Special chars: <>&"'`;

    const session = createMockSession([
      { questionId: 'q-1', questionType: 'technical', question: 'Details?', answer: rawAnswer },
    ]);

    const result = organizeAnswers(session);

    // Answer should be exactly preserved - no parsing, no extraction
    expect(result.technical[0]?.answer).toBe(rawAnswer);
  });

  it('groups constraint answers correctly', () => {
    const session = createMockSession([
      { questionId: 'q-1', questionType: 'constraint', question: 'Constraints?', answer: 'SOC2 ready' },
    ]);

    const result = organizeAnswers(session);

    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0]?.answer).toBe('SOC2 ready');
  });

  it('groups all question types', () => {
    const session = createMockSession([
      { questionId: 'q-1', questionType: 'scope', question: 'Q', answer: 'A' },
      { questionId: 'q-2', questionType: 'constraint', question: 'Q', answer: 'A' },
      { questionId: 'q-3', questionType: 'success', question: 'Q', answer: 'A' },
      { questionId: 'q-4', questionType: 'technical', question: 'Q', answer: 'A' },
      { questionId: 'q-5', questionType: 'risk', question: 'Q', answer: 'A' },
      { questionId: 'q-6', questionType: 'stakeholder', question: 'Q', answer: 'A' },
      { questionId: 'q-7', questionType: 'timeline', question: 'Q', answer: 'A' },
      { questionId: 'q-8', questionType: 'clarification', question: 'Q', answer: 'A' },
    ]);

    const result = organizeAnswers(session);

    expect(result.scope).toHaveLength(1);
    expect(result.constraints).toHaveLength(1);
    expect(result.success).toHaveLength(1);
    expect(result.technical).toHaveLength(1);
    expect(result.risk).toHaveLength(1);
    expect(result.stakeholder).toHaveLength(1);
    expect(result.timeline).toHaveLength(1);
    expect(result.clarification).toHaveLength(1);
  });
});
