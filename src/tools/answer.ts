import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  type Answer,
  type Question,
} from '../types/index.js';
import { generateId } from '../utils/id.js';
import { COVERAGE_AREAS, REQUIRED_COVERAGE, type CoverageArea } from './interrogate.js';

/**
 * Input schema for answer submission
 */
export interface AnswerSubmission {
  /** Type/category of the question - MUST be one of the coverage areas */
  type: CoverageArea;
  /** The question that was asked (for traceability) */
  question: string;
  /** The user's answer */
  answer: string;
  /** Priority of this question */
  priority?: 'critical' | 'important' | 'nice-to-have';
  /** Optional notes */
  notes?: string;
}

/**
 * Tool definition for answering questions
 *
 * The calling LLM uses this tool to submit the user's answers, categorized by type.
 * Elenchus tracks coverage and determines when enough areas are covered for spec generation.
 */
export const answerTool: Tool = {
  name: 'elenchus_answer',
  description: `Submit the user's answers to your probing questions.

**YOU are the interrogator.** You asked the user questions based on their epic.
Now submit their answers, categorized by type.

## ANSWER TYPES (Coverage Areas)

Each answer must have a type that maps to a coverage area:

**Required for spec generation:**
- \`scope\` - Problem boundaries, what's in/out
- \`success\` - Acceptance criteria, measurable outcomes
- \`constraint\` - Technical, timeline, budget, compliance limits
- \`risk\` - What could go wrong, mitigation strategies

**Optional but valuable:**
- \`stakeholder\` - Users, decision-makers, affected parties
- \`technical\` - Technology choices, patterns, integrations

## EXAMPLE

If you asked: "You mentioned 'search books by title' - what's an acceptable response time?"

And the user said: "Under 200ms. We might have 100k books max."

Submit:
\`\`\`json
{
  "sessionId": "session-xxx",
  "answers": [{
    "type": "constraint",
    "question": "You mentioned 'search books by title' - what's an acceptable response time?",
    "answer": "Under 200ms. We might have 100k books max.",
    "priority": "critical"
  }]
}
\`\`\`

## COVERAGE TRACKING

After submitting answers, you'll receive updated coverage metrics.
Keep asking questions until all required areas (scope, success, constraint, risk) are covered.

## CRITICAL

- **Categorize accurately** - The type determines coverage tracking
- **Include the question** - Makes the Q&A traceable
- **Preserve user's words** - Don't paraphrase or interpret
- **One answer per topic** - Don't combine unrelated answers`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID of the interrogation session',
      },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['scope', 'success', 'constraint', 'risk', 'stakeholder', 'technical'],
              description: 'Category of the question/answer',
            },
            question: {
              type: 'string',
              description: 'The question that was asked',
            },
            answer: {
              type: 'string',
              description: 'The user\'s answer',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'important', 'nice-to-have'],
              description: 'Priority of this question',
            },
            notes: {
              type: 'string',
              description: 'Optional notes or context',
            },
          },
          required: ['type', 'question', 'answer'],
        },
        description: 'Array of categorized answers to submit',
      },
    },
    required: ['sessionId', 'answers'],
  },
};

/**
 * Result returned by the answer tool
 */
export interface AnswerToolResult {
  /** Session state */
  session: {
    id: string;
    round: number;
    status: InterrogationSession['status'];
  };

  /** Updated coverage by area */
  coverage: Record<CoverageArea, {
    questionCount: number;
    answeredCount: number;
    covered: boolean;
  }>;

  /** Overall metrics */
  metrics: {
    clarityScore: number;
    readyForSpec: boolean;
    missingAreas: CoverageArea[];
    totalQuestions: number;
    totalAnswered: number;
  };

  /** Answers that were just added */
  addedAnswers: number;

  /** What to do next */
  nextStep: string;

  /** Recommendations */
  recommendations: string[];
}

/**
 * Handle answer submission from the calling LLM
 */
export async function handleAnswer(
  args: Record<string, unknown>,
  storage: Storage
): Promise<AnswerToolResult> {
  // Validate input
  const sessionId = args.sessionId as string;
  const answers = args.answers as AnswerSubmission[];

  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    throw new Error('answers array is required and must not be empty');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const now = new Date().toISOString();

  // Process each answer
  for (const submission of answers) {
    // Validate type
    if (!COVERAGE_AREAS.includes(submission.type as CoverageArea)) {
      throw new Error(
        `Invalid answer type: ${submission.type}. Must be one of: ${COVERAGE_AREAS.join(', ')}`
      );
    }

    // Create question entry (the LLM tells us what they asked)
    const questionId = generateId('q');
    const question: Question = {
      id: questionId,
      type: submission.type,
      priority: submission.priority ?? 'important',
      question: submission.question,
      context: submission.notes ?? 'Submitted via elenchus_answer',
      targetAudience: 'both',
      source: 'llm', // This question came from the calling LLM
    };
    session.questions.push(question);

    // Create answer entry
    const answer: Answer = {
      questionId,
      answer: submission.answer,
      usedDefault: false,
      answeredAt: now,
      notes: submission.notes,
    };
    session.answers.push(answer);
  }

  // Calculate coverage
  const coverage = calculateCoverage(session);

  // Calculate clarity score
  const coveredRequired = REQUIRED_COVERAGE.filter(area => coverage[area].covered).length;
  const clarityScore = Math.round((coveredRequired / REQUIRED_COVERAGE.length) * 100);

  // Find missing areas
  const missingAreas = REQUIRED_COVERAGE.filter(area => !coverage[area].covered);

  // Determine if ready for spec
  const readyForSpec = clarityScore >= 80 && missingAreas.length === 0;

  // Update session
  session.clarityScore = clarityScore;
  session.completenessScore = Math.round(
    (Object.values(coverage).filter(c => c.covered).length / COVERAGE_AREAS.length) * 100
  );
  session.readyForSpec = readyForSpec;
  session.status = readyForSpec ? 'complete' : 'in-progress';
  session.round += 1;
  session.updatedAt = now;

  if (readyForSpec) {
    session.completedAt = now;
    session.blockers = [];
  } else {
    session.blockers = missingAreas.map(
      area => `Missing coverage in: ${area}`
    );
  }

  // Save session
  storage.saveSession(session);

  // Build recommendations
  const recommendations: string[] = [];
  if (readyForSpec) {
    recommendations.push('Ready for spec generation! Call elenchus_generate_spec.');
  } else {
    if (missingAreas.length > 0) {
      recommendations.push(`Still need answers for: ${missingAreas.join(', ')}`);
    }
    if (clarityScore < 80 && missingAreas.length === 0) {
      recommendations.push(`Clarity at ${clarityScore}%. Consider more detailed questions.`);
    }
  }

  // Determine next step
  let nextStep: string;
  if (readyForSpec) {
    nextStep = 'Call elenchus_generate_spec to get organized data for spec synthesis.';
  } else if (missingAreas.length > 0) {
    nextStep = `Ask the user probing questions about: ${missingAreas.join(', ')}`;
  } else {
    nextStep = 'Coverage complete. Use forceReady in elenchus_interrogate to proceed.';
  }

  return {
    session: {
      id: session.id,
      round: session.round,
      status: session.status,
    },
    coverage: Object.fromEntries(
      COVERAGE_AREAS.map(area => [
        area,
        {
          questionCount: coverage[area].questionCount,
          answeredCount: coverage[area].answeredCount,
          covered: coverage[area].covered,
        },
      ])
    ) as Record<CoverageArea, { questionCount: number; answeredCount: number; covered: boolean }>,
    metrics: {
      clarityScore,
      readyForSpec,
      missingAreas,
      totalQuestions: session.questions.length,
      totalAnswered: session.answers.length,
    },
    addedAnswers: answers.length,
    nextStep,
    recommendations,
  };
}

/**
 * Calculate coverage by area
 */
function calculateCoverage(session: InterrogationSession): Record<CoverageArea, {
  questionCount: number;
  answeredCount: number;
  covered: boolean;
}> {
  const coverage: Record<CoverageArea, {
    questionCount: number;
    answeredCount: number;
    covered: boolean;
  }> = {} as any;

  for (const area of COVERAGE_AREAS) {
    const questionsInArea = session.questions.filter(q => q.type === area);
    const answeredInArea = questionsInArea.filter(q =>
      session.answers.some(a => a.questionId === q.id)
    );

    coverage[area] = {
      questionCount: questionsInArea.length,
      answeredCount: answeredInArea.length,
      covered: answeredInArea.length > 0,
    };
  }

  return coverage;
}
