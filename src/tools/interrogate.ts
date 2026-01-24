import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  type Question,
  type InterrogationResult,
  InterrogateInputSchema,
} from '../types/index.js';

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
    },
    required: ['epicId'],
  },
};

/**
 * Handle interrogation
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

  // Generate questions based on current state
  const questions = generateQuestions(epic, session);

  // Update session
  session.questions = [...session.questions, ...questions.filter(q =>
    !session.questions.some(existing => existing.id === q.id)
  )];
  session.status = 'waiting';
  session.updatedAt = new Date().toISOString();

  // Calculate scores
  const { clarityScore, completenessScore } = calculateScores(session);
  session.clarityScore = clarityScore;
  session.completenessScore = completenessScore;
  session.readyForSpec = clarityScore >= 70 && completenessScore >= 70;
  session.blockers = getBlockers(session);

  // Save session
  storage.saveSession(session);

  // Get unanswered questions
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const nextQuestions = session.questions.filter(q => !answeredIds.has(q.id));

  return {
    session,
    nextQuestions,
    readyForSpec: session.readyForSpec,
    recommendations: getRecommendations(session),
  };
}

function createNewSession(epicId: string): InterrogationSession {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    maxRounds: 3,
    startedAt: now,
    updatedAt: now,
  };
}

function generateQuestions(
  epic: ReturnType<Storage['getEpic']> & {},
  session: InterrogationSession
): Question[] {
  const questions: Question[] = [];
  const existingIds = new Set(session.questions.map(q => q.id));

  // Check what's missing from the epic

  // Scope questions
  if (epic.extractedGoals.length === 0) {
    const id = `q-scope-goals-${session.round}`;
    if (!existingIds.has(id)) {
      questions.push({
        id,
        type: 'scope',
        priority: 'critical',
        question: 'What are the primary goals of this epic? What problem does it solve?',
        context: 'No explicit goals were found in the epic. Clear goals help focus the POC.',
        suggestedAnswers: [
          'Improve user experience for...',
          'Reduce costs by...',
          'Enable new capability for...',
        ],
        targetAudience: 'pm',
      });
    }
  }

  // Success criteria questions
  if (epic.extractedAcceptanceCriteria.length === 0) {
    const id = `q-success-criteria-${session.round}`;
    if (!existingIds.has(id)) {
      questions.push({
        id,
        type: 'success',
        priority: 'critical',
        question: 'How will we know the POC is successful? What are the acceptance criteria?',
        context: 'No acceptance criteria found. These are essential for validating the POC.',
        suggestedAnswers: [
          'User can successfully...',
          'System responds within...',
          'All tests pass for...',
        ],
        targetAudience: 'both',
      });
    }
  }

  // Constraint questions
  if (epic.extractedConstraints.length === 0) {
    const id = `q-constraint-tech-${session.round}`;
    if (!existingIds.has(id)) {
      questions.push({
        id,
        type: 'constraint',
        priority: 'important',
        question: 'Are there any technical constraints or requirements? (tech stack, performance, security)',
        context: 'No explicit constraints found. Understanding constraints prevents wasted effort.',
        suggestedAnswers: [
          'Must use existing tech stack',
          'Must handle X requests per second',
          'Must comply with GDPR/SOC2',
        ],
        targetAudience: 'dev',
      });
    }
  }

  // Scope boundary questions
  const id1 = `q-scope-out-${session.round}`;
  if (!existingIds.has(id1)) {
    questions.push({
      id: id1,
      type: 'scope',
      priority: 'important',
      question: 'What is explicitly OUT of scope for this POC?',
      context: 'Defining what NOT to build prevents scope creep and focuses effort.',
      suggestedAnswers: [
        'Mobile support (desktop only)',
        'Full production hardening',
        'Migration of existing data',
      ],
      targetAudience: 'pm',
    });
  }

  // User persona questions
  if (!epic.extractedStakeholders || epic.extractedStakeholders.length === 0) {
    const id = `q-stakeholder-user-${session.round}`;
    if (!existingIds.has(id)) {
      questions.push({
        id,
        type: 'stakeholder',
        priority: 'important',
        question: 'Who is the primary user of this feature? What is their context?',
        context: 'Understanding the user helps shape UX decisions.',
        suggestedAnswers: [
          'Internal team member (power user)',
          'External customer (new user)',
          'Admin/operator',
        ],
        targetAudience: 'pm',
      });
    }
  }

  // Timeline questions
  const id2 = `q-timeline-${session.round}`;
  if (!existingIds.has(id2)) {
    questions.push({
      id: id2,
      type: 'timeline',
      priority: 'nice-to-have',
      question: 'What is the timeline expectation for this POC?',
      context: 'Timeline affects scope and technical decisions.',
      suggestedAnswers: [
        '1-2 days (quick spike)',
        '1 week (focused POC)',
        '2 weeks (comprehensive POC)',
      ],
      inferredDefault: '1 week',
      targetAudience: 'both',
    });
  }

  // Risk questions
  const id3 = `q-risk-${session.round}`;
  if (!existingIds.has(id3)) {
    questions.push({
      id: id3,
      type: 'risk',
      priority: 'nice-to-have',
      question: 'What could go wrong? What are the biggest risks or unknowns?',
      context: 'Identifying risks early allows for mitigation.',
      suggestedAnswers: [
        'External API reliability',
        'Performance at scale',
        'User adoption',
      ],
      targetAudience: 'both',
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, important: 1, 'nice-to-have': 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return questions;
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

  const requiredTypes = ['scope', 'success', 'constraint'];
  const hasRequired = requiredTypes.filter(t => answeredTypes.has(t as any)).length;
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

function getRecommendations(session: InterrogationSession): string[] {
  const recommendations: string[] = [];

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

  return recommendations;
}
