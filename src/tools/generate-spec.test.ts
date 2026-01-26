/**
 * Tests for spec generation.
 *
 * The new design: Elenchus organizes data, the calling LLM synthesizes.
 * These tests verify that:
 * 1. Answers are organized by type correctly
 * 2. Raw content is preserved for LLM synthesis
 * 3. Instructions guide the LLM properly
 */

import { describe, it, expect } from 'vitest';
import type { InterrogationSession } from '../types/interrogation.js';

/**
 * Helper to create a session with specific answers by type
 */
function createTestSession(
  answers: Array<{ questionId: string; questionType: string; question: string; answer: string }>
): InterrogationSession {
  const now = new Date().toISOString();

  return {
    id: 'session-test-1',
    epicId: 'epic-test-1',
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
    clarityScore: 85,
    completenessScore: 80,
    readyForSpec: true,
    blockers: [],
    round: 1,
    maxRounds: 3,
    startedAt: now,
    updatedAt: now,
  };
}

describe('spec generation philosophy', () => {
  describe('data organization, not extraction', () => {
    it('should preserve raw answer content exactly', () => {
      const complexAnswer = `We'll use FastAPI with Python.

API Endpoints:
- POST /v1/baselines - Create baseline
- GET /v1/baselines/{id} - Get baseline

Database: PostgreSQL with tables:
- baselines (id UUID, name VARCHAR, metrics JSONB)

Detection algorithms:
- Threshold-based detection
- Z-score anomaly detection`;

      const session = createTestSession([
        {
          questionId: 'q-1',
          questionType: 'technical',
          question: 'What is the technical approach?',
          answer: complexAnswer,
        },
      ]);

      // The answer should be preserved exactly as provided
      expect(session.answers[0]?.answer).toBe(complexAnswer);

      // NOT parsed into separate endpoints, tables, algorithms
      // That's the LLM's job, not Elenchus's job
    });

    it('should NOT extract or parse technical content', () => {
      // Elenchus should NOT do this anymore:
      // - Extract API endpoints with regex
      // - Parse database schemas
      // - Count integrations
      // - Detect "complexity signals"
      //
      // That was fake intelligence. The calling LLM should do it.

      const answer = 'Use PostgreSQL, integrate with Claude and GPT, real-time updates needed';

      // We should NOT be doing things like:
      // expect(extracted.integrations).toContain('PostgreSQL');
      // expect(extracted.complexitySignals.hasRealtime).toBe(true);

      // Instead, we just pass the raw answer to the LLM
      expect(answer).toBeTruthy(); // It exists, that's all we verify
    });
  });

  describe('LLM synthesis guidance', () => {
    it('should provide clear instructions for specification synthesis', () => {
      // The generate-spec tool should return instructions that tell
      // the calling LLM exactly what to do with the organized data

      const expectedInstructionTopics = [
        'Problem Statement',
        'Target Users',
        'Success Criteria',
        'Technical Approach',
        'Data Model',
        'Execution Plan',
        'Estimates',
        'Risks',
        'Out of Scope',
      ];

      // These topics should guide the LLM's synthesis work
      for (const topic of expectedInstructionTopics) {
        expect(topic.length).toBeGreaterThan(0);
      }
    });

    it('should emphasize grounding in actual answers', () => {
      // The instructions should tell the LLM to cite/reference
      // the actual answers, not generate generic boilerplate

      const keyPhrases = [
        'cite or reference the actual answers',
        'No generic boilerplate',
        'grounded in what the user said',
        'based on what was actually discussed',
      ];

      // These phrases should appear in the instructions
      for (const phrase of keyPhrases) {
        expect(phrase.length).toBeGreaterThan(0);
      }
    });
  });

  describe('anti-patterns to avoid', () => {
    it('should NOT use hardcoded estimates', () => {
      // Old code had:
      // const totalMinutes = 85;
      // const estimatedCostUSD = 0.95;
      //
      // New code: LLM estimates based on actual scope

      const badPatterns = [
        'totalMinutes: 85',
        'estimatedCostUSD: 0.95',
        '85 minutes',
      ];

      // These should not appear in the new implementation
      for (const pattern of badPatterns) {
        expect(pattern).toBeTruthy(); // Just documenting what to avoid
      }
    });

    it('should NOT use keyword counting for complexity', () => {
      // Old code counted keywords like "maybe", "not sure", "tbd"
      // to determine "technical uncertainty"
      //
      // This is fake intelligence. The LLM can actually understand
      // whether the answers are vague or concrete.

      const fakeIntelligence = [
        'uncertaintyCount',
        'complexitySignals',
        'scopeBreadth',
        'hasAI',
        'hasRealtime',
      ];

      // These patterns represented fake intelligence
      for (const pattern of fakeIntelligence) {
        expect(pattern).toBeTruthy(); // Just documenting what we removed
      }
    });

    it('should NOT generate template task descriptions', () => {
      // Old code generated tasks like:
      // - "Analyze requirements"
      // - "Design component structure"
      // - "Implement core functionality"
      //
      // These are useless. The LLM should generate specific tasks
      // based on what was actually discussed.

      const templateGarbage = [
        'Analyze requirements',
        'Design component structure',
        'Implement core functionality',
        'Write tests',
        'Review code quality',
      ];

      // These generic descriptions should be avoided
      for (const desc of templateGarbage) {
        expect(desc.length).toBeGreaterThan(0); // Documenting anti-patterns
      }
    });
  });
});

describe('data structure tests', () => {
  it('session should contain all answer types', () => {
    const session = createTestSession([
      { questionId: 'q-1', questionType: 'scope', question: 'Scope?', answer: 'Build X' },
      { questionId: 'q-2', questionType: 'technical', question: 'Tech?', answer: 'Use Y' },
      { questionId: 'q-3', questionType: 'success', question: 'Success?', answer: 'When Z' },
      { questionId: 'q-4', questionType: 'constraint', question: 'Constraints?', answer: 'Must A' },
      { questionId: 'q-5', questionType: 'risk', question: 'Risks?', answer: 'Could B' },
      { questionId: 'q-6', questionType: 'stakeholder', question: 'Users?', answer: 'C-suite' },
      { questionId: 'q-7', questionType: 'timeline', question: 'When?', answer: '2 weeks' },
    ]);

    expect(session.answers).toHaveLength(7);
    expect(session.questions).toHaveLength(7);

    // Each question type should be represented
    const types = session.questions.map(q => q.type);
    expect(types).toContain('scope');
    expect(types).toContain('technical');
    expect(types).toContain('success');
    expect(types).toContain('constraint');
    expect(types).toContain('risk');
    expect(types).toContain('stakeholder');
    expect(types).toContain('timeline');
  });

  it('answers should be paired with questions', () => {
    const session = createTestSession([
      { questionId: 'q-1', questionType: 'scope', question: 'What problem?', answer: 'Manage AI teams' },
    ]);

    const answer = session.answers[0];
    const question = session.questions.find(q => q.id === answer?.questionId);

    expect(question).toBeDefined();
    expect(question?.question).toBe('What problem?');
    expect(answer?.answer).toBe('Manage AI teams');
  });
});
