import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  type Question,
  InterrogateInputSchema,
} from '../types/index.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import {
  runInterrogationV2,
  type SocraticGuidance,
  type InterrogationSignals,
} from '../engines/index.js';

/**
 * Tool definition for interrogation
 */
export const interrogateTool: Tool = {
  name: 'elenchus_interrogate',
  description: `Start or continue an interrogation session for an epic.

The Socratic engine analyzes the epic and generates clarifying questions to:
- Identify scope boundaries
- Surface constraints and requirements
- Define success criteria
- Uncover technical decisions needing input
- Assess risks

**No API key required**: Elenchus uses template-based questions and delegates
LLM work to the calling agent (Claude, etc.). The calling LLM provides the
intelligence - Elenchus provides the structure and workflow.

Features:
- Structured question generation across key areas
- Context-aware follow-up questions
- Vagueness detection for iterative refinement
- Challenge mode for devil's advocate questions
- Progress tracking with clarity and completeness scores

Returns prioritized questions. Use elenchus_answer to provide responses.`,

  inputSchema: {
    type: 'object',
    properties: {
      epicId: {
        type: 'string',
        description: 'ID of the epic to interrogate',
      },
      sessionId: {
        type: 'string',
        description: 'Continue an existing session (optional)',
      },
      forceNewRound: {
        type: 'boolean',
        description: 'Force a new round of questions',
        default: false,
      },
      forceReady: {
        type: 'boolean',
        description: 'Force spec-ready state if clarity >= 80% (escape hatch)',
        default: false,
      },
      challengeMode: {
        type: 'boolean',
        description: 'Enable devil\'s advocate questions to surface assumptions and alternatives',
        default: false,
      },
    },
    required: ['epicId'],
  },
};

/**
 * Result returned by the interrogate tool
 *
 * V2 Philosophy: We return detection signals and guidance for the CALLING LLM
 * to formulate Socratic questions. Elenchus detects patterns; Claude reasons.
 */
export interface InterrogationToolResult {
  /** The session state */
  session: InterrogationSession;

  /** Detection signals for the LLM to reason about */
  signals: InterrogationSignals;

  /** Structured guidance for Socratic questioning */
  guidance: SocraticGuidance;

  /**
   * Template questions as a fallback/baseline.
   * The calling LLM should use the signals and guidance to formulate
   * better, more contextual questions - but these are available if needed.
   */
  templateQuestions: Question[];

  /** Whether the session is ready for spec generation */
  readyForSpec: boolean;
}

/**
 * Handle interrogation with V2 engine (LLM-powered Socratic guidance)
 */
export async function handleInterrogate(
  args: Record<string, unknown>,
  storage: Storage
): Promise<InterrogationToolResult> {
  const input = InterrogateInputSchema.parse(args);

  // Get epic
  const epic = storage.getEpic(input.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${input.epicId}`);
  }

  logger.info('Starting V2 interrogation', {
    epicId: input.epicId,
    challengeMode: input.challengeMode ?? false,
  });

  // Get or create session
  let session: InterrogationSession;
  if (input.sessionId) {
    const existingSession = storage.getSession(input.sessionId);
    if (!existingSession) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    session = existingSession;
  } else {
    // Check for existing session
    const existingSessions = storage.getSessionsForEpic(input.epicId);
    if (existingSessions.length > 0 && !input.forceNewRound) {
      session = existingSessions[0]!;
    } else {
      session = createNewSession(input.epicId);
    }
  }

  // Generate template questions for baseline (V1 compatibility)
  // These are simple structural questions, not the "intelligence"
  const templateQuestions = generateBaselineQuestions(session);

  // Add new template questions that don't already exist
  const existingIds = new Set(session.questions.map(q => q.id));
  const newQuestions = templateQuestions.filter(q => !existingIds.has(q.id));
  session.questions = [...session.questions, ...newQuestions];

  // Run V2 interrogation engine
  const v2Result = runInterrogationV2(epic, session);

  // Handle forceReady escape hatch
  if (input.forceReady && v2Result.guidance.readinessAssessment.canForceReady) {
    session.readyForSpec = true;
    session.blockers = [];
  }

  // Update session state
  session.status = session.answers.length === 0 ? 'pending' : 'waiting';
  session.updatedAt = new Date().toISOString();

  // Save session
  storage.saveSession(session);

  // Get unanswered template questions for fallback
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const unansweredTemplates = session.questions.filter(q => !answeredIds.has(q.id));

  logger.info('V2 interrogation complete', {
    epicId: input.epicId,
    sessionId: session.id,
    clarityScore: session.clarityScore,
    signalsDetected: {
      vague: v2Result.signals.metrics.vagueAnswerCount,
      contradictions: v2Result.signals.metrics.contradictionCount,
      gaps: v2Result.signals.metrics.gapCount,
      assumptions: v2Result.signals.metrics.assumptionCount,
    },
  });

  return {
    session: v2Result.session,
    signals: v2Result.signals,
    guidance: v2Result.guidance,
    templateQuestions: unansweredTemplates,
    readyForSpec: session.readyForSpec,
  };
}

/**
 * Create a new interrogation session
 */
function createNewSession(epicId: string): InterrogationSession {
  const id = generateId('session');
  const now = new Date().toISOString();

  return {
    id,
    epicId,
    status: 'pending',
    questions: [],
    answers: [],
    clarityScore: 0,
    completenessScore: 0,
    readyForSpec: false,
    blockers: [],
    round: 1,
    maxRounds: 10,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Generate baseline template questions for structural coverage.
 *
 * These are NOT the "intelligence" - they're simple structural questions
 * to ensure basic coverage. The calling LLM should use the signals and
 * guidance to ask better, more contextual follow-up questions.
 */
function generateBaselineQuestions(session: InterrogationSession): Question[] {
  const questions: Question[] = [];

  // Only generate if no questions exist yet
  if (session.questions.length > 0) {
    return [];
  }

  // Minimal set of structural questions by type
  const baselineQuestions: Array<{
    type: Question['type'];
    priority: Question['priority'];
    question: string;
    context: string;
  }> = [
    {
      type: 'scope',
      priority: 'critical',
      question: 'What problem are we solving? What is explicitly OUT of scope?',
      context: 'Understanding scope boundaries prevents feature creep and clarifies priorities.',
    },
    {
      type: 'success',
      priority: 'critical',
      question: 'How will we know this is successful? What are the measurable acceptance criteria?',
      context: 'Concrete success criteria drive implementation decisions.',
    },
    {
      type: 'constraint',
      priority: 'critical',
      question: 'What constraints must we work within? (tech stack, timeline, budget, compliance)',
      context: 'Constraints shape the solution space.',
    },
    {
      type: 'technical',
      priority: 'important',
      question: 'What is the technical approach? What technologies and patterns will be used?',
      context: 'Technical decisions affect implementation and timeline.',
    },
    {
      type: 'stakeholder',
      priority: 'important',
      question: 'Who are the users? Who are the stakeholders?',
      context: 'Understanding users and stakeholders shapes UX and priorities.',
    },
    {
      type: 'risk',
      priority: 'important',
      question: 'What could go wrong? What are the main risks?',
      context: 'Identifying risks early allows for mitigation planning.',
    },
    {
      type: 'timeline',
      priority: 'nice-to-have',
      question: 'What is the timeline? Are there key milestones or deadlines?',
      context: 'Timeline constraints affect scope and approach.',
    },
  ];

  for (const q of baselineQuestions) {
    questions.push({
      id: generateId('q'),
      type: q.type,
      priority: q.priority,
      question: q.question,
      context: q.context,
      targetAudience: 'both',
      source: 'template',
    });
  }

  return questions;
}
