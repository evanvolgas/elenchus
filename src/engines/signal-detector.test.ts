import { describe, it, expect } from 'vitest';
import {
  detectVagueness,
  detectContradictions,
  detectCoverageGaps,
  detectAssumptions,
  detectStack,
  extractSpecificityMarkers,
  extractTechnicalDecisions,
  detectSignals,
} from './signal-detector.js';
import type { Answer, Question } from '../types/interrogation.js';
import type { Epic } from '../types/index.js';

/**
 * Helper to create a mock question
 */
function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    type: 'scope',
    priority: 'critical',
    question: 'What problem are we solving?',
    context: 'Understanding the problem',
    targetAudience: 'both',
    ...overrides,
  };
}

/**
 * Helper to create a mock answer
 */
function createAnswer(text: string, questionId = 'q-1'): Answer {
  return {
    questionId,
    answer: text,
    usedDefault: false,
    answeredAt: new Date().toISOString(),
  };
}

/**
 * Helper to create a mock epic
 */
function createEpic(description: string, title?: string): Epic {
  return {
    id: 'epic-1',
    source: 'text',
    description,
    title,
    extractedGoals: [],
    extractedConstraints: [],
    createdAt: new Date().toISOString(),
  };
}

describe('detectVagueness', () => {
  it('detects hedging words', () => {
    const question = createQuestion();
    const answer = createAnswer('We will maybe use PostgreSQL, probably with some caching.');

    const indicators = detectVagueness(answer, question);

    expect(indicators.some(i => i.type === 'hedging')).toBe(true);
    expect(indicators.some(i => i.evidence.includes('maybe'))).toBe(true);
    expect(indicators.some(i => i.evidence.includes('probably'))).toBe(true);
  });

  it('detects generic terms', () => {
    const question = createQuestion();
    const answer = createAnswer('The dashboard will show stuff about users and things.');

    const indicators = detectVagueness(answer, question);

    expect(indicators.some(i => i.type === 'generic-term')).toBe(true);
    expect(indicators.some(i => i.evidence.includes('stuff'))).toBe(true);
    expect(indicators.some(i => i.evidence.includes('things'))).toBe(true);
  });

  it('detects short answers to critical questions', () => {
    const question = createQuestion({ priority: 'critical' });
    const answer = createAnswer('Yes.');

    const indicators = detectVagueness(answer, question);

    expect(indicators.some(i => i.type === 'short-answer')).toBe(true);
    expect(indicators.some(i => i.severity === 'high')).toBe(true);
  });

  it('detects deferral language', () => {
    const question = createQuestion();
    const answer = createAnswer('We will figure it out later. TBD on the database choice.');

    const indicators = detectVagueness(answer, question);

    expect(indicators.some(i => i.type === 'deferral')).toBe(true);
    expect(indicators.some(i => i.evidence.includes('later'))).toBe(true);
    expect(indicators.some(i => i.evidence.includes('TBD'))).toBe(true);
  });

  it('returns empty for specific answers', () => {
    const question = createQuestion();
    const answer = createAnswer(
      'We will use PostgreSQL 15 with connection pooling via PgBouncer. ' +
      'The API will be built with FastAPI and Python 3.11. ' +
      'Target response time is under 100ms for 95th percentile.'
    );

    const indicators = detectVagueness(answer, question);

    // Should have no high-severity vagueness
    expect(indicators.filter(i => i.severity === 'high')).toHaveLength(0);
  });
});

describe('extractSpecificityMarkers', () => {
  it('extracts numbers and metrics', () => {
    const answer = createAnswer('We need 99.9% uptime with response times under 200ms for 10000 requests per second.');

    const markers = extractSpecificityMarkers(answer);

    expect(markers.some(m => m.includes('99.9%'))).toBe(true);
    expect(markers.some(m => m.includes('200ms'))).toBe(true);
    expect(markers.some(m => m.includes('10000'))).toBe(true);
  });

  it('extracts technology mentions', () => {
    const answer = createAnswer('We will use React for the frontend, Node.js for the backend, and PostgreSQL for the database.');

    const markers = extractSpecificityMarkers(answer);

    expect(markers.some(m => m.includes('React'))).toBe(true);
    expect(markers.some(m => m.toLowerCase().includes('node'))).toBe(true);
    expect(markers.some(m => m.toLowerCase().includes('postgres'))).toBe(true);
  });
});

describe('extractTechnicalDecisions', () => {
  it('extracts decision language', () => {
    const answer = createAnswer('We will use GraphQL for the API. Going with AWS for hosting.');

    const decisions = extractTechnicalDecisions(answer);

    expect(decisions.some(d => d.includes('GraphQL'))).toBe(true);
    expect(decisions.some(d => d.includes('AWS'))).toBe(true);
  });

  it('detects architecture patterns', () => {
    const answer = createAnswer('The system will be built as microservices.');

    const decisions = extractTechnicalDecisions(answer);

    expect(decisions.some(d => d.includes('Microservices'))).toBe(true);
  });
});

describe('detectContradictions', () => {
  it('detects real-time vs batch contradiction', () => {
    const answers = [
      createAnswer('We need real-time updates for the dashboard.', 'q-1'),
      createAnswer('Data will be processed in a daily batch job.', 'q-2'),
    ];
    const questions = [
      createQuestion({ id: 'q-1' }),
      createQuestion({ id: 'q-2', type: 'technical' }),
    ];

    const contradictions = detectContradictions(answers, questions);

    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0]?.pattern).toContain('real-time vs batch');
  });

  it('detects SQL vs NoSQL contradiction', () => {
    const answers = [
      createAnswer('We will use SQL databases for relational data storage.', 'q-1'),
      createAnswer('The data model is document-based, so NoSQL makes sense.', 'q-2'),
    ];
    const questions = [
      createQuestion({ id: 'q-1' }),
      createQuestion({ id: 'q-2', type: 'technical' }),
    ];

    const contradictions = detectContradictions(answers, questions);

    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0]?.pattern).toContain('SQL vs NoSQL');
  });

  it('returns empty when no contradictions', () => {
    const answers = [
      createAnswer('We will use PostgreSQL for relational data.', 'q-1'),
      createAnswer('Redis will handle caching for performance.', 'q-2'),
    ];
    const questions = [
      createQuestion({ id: 'q-1' }),
      createQuestion({ id: 'q-2', type: 'technical' }),
    ];

    const contradictions = detectContradictions(answers, questions);

    expect(contradictions).toHaveLength(0);
  });
});

describe('detectCoverageGaps', () => {
  it('detects missing critical question types', () => {
    const answers: Answer[] = [];
    const questions = [
      createQuestion({ id: 'q-1', type: 'technical' }),
    ];

    const gaps = detectCoverageGaps(answers, questions);

    // Should detect scope, success, constraint as missing
    expect(gaps.some(g => g.questionType === 'scope')).toBe(true);
    expect(gaps.some(g => g.questionType === 'success')).toBe(true);
    expect(gaps.some(g => g.questionType === 'constraint')).toBe(true);
  });

  it('detects unanswered questions', () => {
    const questions = [
      createQuestion({ id: 'q-1', type: 'scope' }),
      createQuestion({ id: 'q-2', type: 'success' }),
    ];
    const answers = [
      createAnswer('Building a dashboard', 'q-1'),
      // q-2 not answered
    ];

    const gaps = detectCoverageGaps(answers, questions);

    expect(gaps.some(g => g.questionType === 'success')).toBe(true);
  });

  it('returns empty when all critical types covered', () => {
    const questions = [
      createQuestion({ id: 'q-1', type: 'scope' }),
      createQuestion({ id: 'q-2', type: 'success' }),
      createQuestion({ id: 'q-3', type: 'constraint' }),
    ];
    const answers = [
      createAnswer('Building a dashboard', 'q-1'),
      createAnswer('Users can view metrics', 'q-2'),
      createAnswer('Must use existing tech stack', 'q-3'),
    ];

    const gaps = detectCoverageGaps(answers, questions);

    // Should not have critical gaps
    const criticalGaps = gaps.filter(g => g.priority === 'critical');
    expect(criticalGaps.every(g =>
      !['scope', 'success', 'constraint'].includes(g.questionType)
    )).toBe(true);
  });
});

describe('detectAssumptions', () => {
  it('detects user authentication assumption', () => {
    const epic = createEpic('Build a web dashboard for users to view their data.');
    const answers: Answer[] = [];

    const assumptions = detectAssumptions(epic, answers);

    // Should detect assumptions about users (no guest mention) and web (no mobile mention)
    expect(assumptions.length).toBeGreaterThan(0);
    // Check we detect at least one implicit assumption
    expect(assumptions.some(a =>
      a.assumption.includes('authenticated') ||
      a.assumption.includes('Web-only') ||
      a.assumption.includes('rate limit') ||
      a.assumption.includes('backup')
    )).toBe(true);
  });

  it('detects web-only assumption', () => {
    const epic = createEpic('Build a web application for data visualization.');
    const answers: Answer[] = [];

    const assumptions = detectAssumptions(epic, answers);

    expect(assumptions.some(a => a.assumption.includes('Web-only'))).toBe(true);
  });

  it('does not flag when alternatives are mentioned', () => {
    const epic = createEpic('Build an app for users and anonymous guests to view data on web and mobile.');
    const answers: Answer[] = [];

    const assumptions = detectAssumptions(epic, answers);

    // Should NOT flag user auth assumption since "guests" is mentioned
    expect(assumptions.some(a => a.assumption.includes('authenticated'))).toBe(false);
    // Should NOT flag web-only since "mobile" is mentioned
    expect(assumptions.some(a => a.assumption.includes('Web-only'))).toBe(false);
  });
});

describe('detectStack', () => {
  it('detects database technologies', () => {
    const epic = createEpic('Build a dashboard using PostgreSQL.');
    const answers = [
      createAnswer('We will also use Redis for caching.'),
    ];

    const stack = detectStack(epic, answers);

    expect(stack).toContain('PostgreSQL');
    expect(stack).toContain('Redis');
  });

  it('detects frontend and backend technologies', () => {
    const epic = createEpic('Build a React frontend with Node.js backend.');
    const answers: Answer[] = [];

    const stack = detectStack(epic, answers);

    expect(stack).toContain('React');
    expect(stack).toContain('Node.js');
  });

  it('detects cloud providers', () => {
    const epic = createEpic('Deploy on AWS with Vercel for the frontend.');
    const answers: Answer[] = [];

    const stack = detectStack(epic, answers);

    expect(stack).toContain('AWS');
    expect(stack).toContain('Vercel');
  });
});

describe('detectSignals (integration)', () => {
  it('produces complete signal report', () => {
    const epic = createEpic('Build a user dashboard', 'Dashboard Project');
    const questions = [
      createQuestion({ id: 'q-1', type: 'scope' }),
      createQuestion({ id: 'q-2', type: 'technical' }),
    ];
    const answers = [
      createAnswer('Show stuff to users, maybe with charts.', 'q-1'),
      createAnswer('We will use React and PostgreSQL.', 'q-2'),
    ];

    const signals = detectSignals(epic, questions, answers);

    // Should have answer signals
    expect(signals.answerSignals).toHaveLength(2);

    // Should detect vagueness in first answer
    expect(signals.metrics.vagueAnswerCount).toBeGreaterThan(0);

    // Should detect stack
    expect(signals.detectedStack).toContain('React');
    expect(signals.detectedStack).toContain('PostgreSQL');

    // Should have coverage gaps for unanswered critical types
    expect(signals.coverageGaps.length).toBeGreaterThan(0);

    // Should have metrics summary
    expect(signals.metrics.totalAnswers).toBe(2);
  });

  it('handles empty answers gracefully', () => {
    const epic = createEpic('Build something');
    const questions: Question[] = [];
    const answers: Answer[] = [];

    const signals = detectSignals(epic, questions, answers);

    expect(signals.answerSignals).toHaveLength(0);
    expect(signals.contradictions).toHaveLength(0);
    expect(signals.metrics.totalAnswers).toBe(0);
  });
});
