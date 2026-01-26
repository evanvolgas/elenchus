import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  type Question,
  type QuestionType,
  type InterrogationResult,
  InterrogateInputSchema,
} from '../types/index.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import {
  QuestionGenerator,
  createQuestionGenerator,
  LLMClient,
  createClient,
  ChallengeModeEngine,
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

// Lazy-initialized singletons
let llmClient: LLMClient | null = null;
let questionGenerator: QuestionGenerator | null = null;
let challengeEngine: ChallengeModeEngine | null = null;

function getLLMClient(): LLMClient {
  if (!llmClient) {
    llmClient = createClient();
  }
  return llmClient;
}

function getQuestionGenerator(): QuestionGenerator {
  if (!questionGenerator) {
    questionGenerator = createQuestionGenerator();
  }
  return questionGenerator;
}

function getChallengeEngine(): ChallengeModeEngine {
  if (!challengeEngine) {
    challengeEngine = new ChallengeModeEngine();
  }
  return challengeEngine;
}

/**
 * Handle interrogation with V2 engine integration
 */
export async function handleInterrogate(
  args: Record<string, unknown>,
  storage: Storage
): Promise<InterrogationResult> {
  const input = InterrogateInputSchema.parse(args);

  // Get epic
  const epic = storage.getEpic(input.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${input.epicId}`);
  }

  // Check LLM availability
  const client = getLLMClient();
  const useLLM = client.isAvailable();

  logger.info('Starting interrogation', {
    epicId: input.epicId,
    useLLM,
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
      session = createNewSession(input.epicId, input.config);
    }
  }

  // Check if we should start a new round based on whether all current questions are answered
  const currentAnsweredIds = new Set(session.answers.map(a => a.questionId));
  const unansweredCount = session.questions.filter(q => !currentAnsweredIds.has(q.id)).length;
  const shouldAdvanceRound = input.forceNewRound || (unansweredCount === 0 && session.questions.length > 0);

  if (shouldAdvanceRound && session.round < session.maxRounds) {
    session.round += 1;
    logger.debug('Starting new round', { round: session.round });
  }

  // Generate questions using V2 QuestionGenerator
  const generator = getQuestionGenerator();
  const generatedQuestions = await generator.generate(
    {
      epic,
      previousAnswers: session.answers,
      round: session.round,
      maxRounds: session.maxRounds,
      challengeMode: input.challengeMode ?? false,
    },
    useLLM
  );

  // Add challenge mode questions if enabled
  let challengeQuestions: Question[] = [];
  if (input.challengeMode && session.answers.length > 0) {
    const engine = getChallengeEngine();
    challengeQuestions = await engine.generateChallengeQuestions(
      epic,
      session.answers
    );
    logger.debug('Generated challenge questions', { count: challengeQuestions.length });
  }

  // Merge new questions (avoid duplicates)
  const allNewQuestions = [...generatedQuestions, ...challengeQuestions];
  const existingIds = new Set(session.questions.map(q => q.id));
  const uniqueNewQuestions = allNewQuestions.filter(q => !existingIds.has(q.id));

  session.questions = [...session.questions, ...uniqueNewQuestions];
  session.status = 'waiting';
  session.updatedAt = new Date().toISOString();

  // Calculate scores using RoundController
  const { clarityScore, completenessScore } = calculateScores(session);
  session.clarityScore = clarityScore;
  session.completenessScore = completenessScore;

  // Check readiness with escape hatch support
  const canEscape = input.forceReady && clarityScore >= (input.config?.escapeThreshold ?? 80);
  session.readyForSpec = (clarityScore >= 70 && completenessScore >= 70) || canEscape;
  session.blockers = getBlockers(session);

  // Generate round summary for V2 response
  const answeredThisRound = session.answers.filter(a => {
    const q = session.questions.find(q => q.id === a.questionId);
    return q !== undefined;
  }).length;

  const roundSummary = {
    round: session.round,
    questionsAsked: session.questions.length,
    questionsAnswered: answeredThisRound,
    clarityDelta: 0, // Would need previous clarity to calculate
    readyForSpec: session.readyForSpec,
    canEscape,
  };

  // Check for max rounds warning
  const warnings = [];
  if (session.round >= session.maxRounds && !session.readyForSpec) {
    warnings.push({
      type: 'max-rounds-reached' as const,
      message: `Maximum rounds (${session.maxRounds}) reached. Consider using forceReady if clarity is sufficient.`,
      gaps: session.blockers,
      severity: 'warning' as const,
    });
  }

  // Save session
  storage.saveSession(session);

  // Get unanswered questions
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const nextQuestions = session.questions.filter(q => !answeredIds.has(q.id));

  const result: InterrogationResult = {
    session,
    nextQuestions,
    readyForSpec: session.readyForSpec,
    recommendations: getRecommendations(session, useLLM),
    roundSummary,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  logger.info('Interrogation complete', {
    epicId: input.epicId,
    sessionId: session.id,
    clarityScore: session.clarityScore,
    questionsGenerated: uniqueNewQuestions.length,
    usedLLM: useLLM,
  });

  return result;
}

function createNewSession(
  epicId: string,
  config?: { maxRounds?: number; escapeThreshold?: number }
): InterrogationSession {
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
    maxRounds: config?.maxRounds ?? 10, // V2 default: 10 rounds
    startedAt: now,
    updatedAt: now,
  };
}

function calculateScores(session: InterrogationSession): {
  clarityScore: number;
  completenessScore: number;
} {
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const criticalQuestions = session.questions.filter(q => q.priority === 'critical');
  const importantQuestions = session.questions.filter(q => q.priority === 'important');

  // Clarity: based on quality of answers (simplified)
  const answeredCritical = criticalQuestions.filter(q => answeredIds.has(q.id)).length;
  const answeredImportant = importantQuestions.filter(q => answeredIds.has(q.id)).length;

  let clarityScore = 30; // Base score
  if (criticalQuestions.length > 0) {
    clarityScore += (answeredCritical / criticalQuestions.length) * 40;
  } else {
    clarityScore += 40;
  }
  if (importantQuestions.length > 0) {
    clarityScore += (answeredImportant / importantQuestions.length) * 30;
  } else {
    clarityScore += 30;
  }

  // Completeness: based on coverage of question types
  const answeredTypes = new Set(
    session.questions
      .filter(q => answeredIds.has(q.id))
      .map(q => q.type)
  );

  const requiredTypes: QuestionType[] = ['scope', 'success', 'constraint'];
  const hasRequired = requiredTypes.filter(t => answeredTypes.has(t)).length;
  const completenessScore = 40 + (hasRequired / requiredTypes.length) * 60;

  return {
    clarityScore: Math.min(Math.round(clarityScore), 100),
    completenessScore: Math.min(Math.round(completenessScore), 100),
  };
}

function getBlockers(session: InterrogationSession): string[] {
  const blockers: string[] = [];
  const answeredIds = new Set(session.answers.map(a => a.questionId));

  const unansweredCritical = session.questions.filter(
    q => q.priority === 'critical' && !answeredIds.has(q.id)
  );

  for (const q of unansweredCritical) {
    blockers.push(`Unanswered critical question: "${q.question}"`);
  }

  return blockers;
}

function getRecommendations(session: InterrogationSession, _useLLM: boolean): string[] {
  const recommendations: string[] = [];

  // Note: Elenchus uses template-based questions by design.
  // When called via MCP, the calling LLM (Claude, etc.) provides the intelligence.
  // No separate API key is needed - Elenchus delegates LLM work to the caller.

  if (session.clarityScore < 50) {
    recommendations.push('Answer more questions to improve clarity');
  }

  if (session.readyForSpec) {
    recommendations.push('Ready to generate specification! Use elenchus_generate_spec');
  } else {
    recommendations.push('Continue answering questions to reach spec-ready state');
  }

  if (session.blockers.length > 0) {
    recommendations.push(`${session.blockers.length} blocking issue(s) need resolution`);
  }

  if (session.round >= session.maxRounds * 0.7) {
    recommendations.push(`Approaching max rounds (${session.round}/${session.maxRounds}). Consider forceReady if clarity >= 80%`);
  }

  return recommendations;
}
