/**
 * Answer Organizer
 *
 * Organizes interrogation answers by question type.
 * NO heuristics, NO keyword counting, NO fake intelligence.
 * Just structured data for the calling LLM to reason about.
 */

import type { InterrogationSession, Question } from '../types/index.js';

/**
 * Answers organized by question type - raw content for LLM synthesis
 */
export interface OrganizedAnswers {
  // Answers grouped by question type
  scope: AnswerWithContext[];
  constraints: AnswerWithContext[];
  success: AnswerWithContext[];
  technical: AnswerWithContext[];
  risk: AnswerWithContext[];
  stakeholder: AnswerWithContext[];
  timeline: AnswerWithContext[];
  clarification: AnswerWithContext[];

  // All answers in order (for full context)
  all: AnswerWithContext[];

  // Session metadata
  sessionId: string;
  epicId: string;
  rounds: number;
  clarityScore: number;
  completenessScore: number;
}

export interface AnswerWithContext {
  questionId: string;
  questionType: string;
  question: string;
  questionContext: string;
  answer: string;
  answeredAt: string;
  answeredBy: string | undefined;
}

/**
 * Build a map of question ID to question for lookups
 */
function buildQuestionMap(questions: Question[]): Map<string, Question> {
  const map = new Map<string, Question>();
  for (const q of questions) {
    map.set(q.id, q);
  }
  return map;
}

/**
 * Organize session answers by question type.
 * Returns raw structured data - no analysis, no heuristics.
 */
export function organizeAnswers(session: InterrogationSession): OrganizedAnswers {
  const questionMap = buildQuestionMap(session.questions);

  // Build answers with full context
  const allAnswers: AnswerWithContext[] = session.answers.map(answer => {
    const question = questionMap.get(answer.questionId);
    return {
      questionId: answer.questionId,
      questionType: question?.type ?? 'unknown',
      question: question?.question ?? '',
      questionContext: question?.context ?? '',
      answer: answer.answer,
      answeredAt: answer.answeredAt,
      answeredBy: answer.answeredBy,
    };
  });

  // Group by type
  const byType: Record<string, AnswerWithContext[]> = {
    scope: [],
    constraint: [],
    success: [],
    technical: [],
    risk: [],
    stakeholder: [],
    timeline: [],
    clarification: [],
  };

  for (const awc of allAnswers) {
    const arr = byType[awc.questionType];
    if (arr) {
      arr.push(awc);
    }
  }

  return {
    scope: byType['scope'] ?? [],
    constraints: byType['constraint'] ?? [],
    success: byType['success'] ?? [],
    technical: byType['technical'] ?? [],
    risk: byType['risk'] ?? [],
    stakeholder: byType['stakeholder'] ?? [],
    timeline: byType['timeline'] ?? [],
    clarification: byType['clarification'] ?? [],
    all: allAnswers,
    sessionId: session.id,
    epicId: session.epicId,
    rounds: session.round,
    clarityScore: session.clarityScore,
    completenessScore: session.completenessScore,
  };
}
