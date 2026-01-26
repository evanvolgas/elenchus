import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  InterrogateInputSchema,
} from '../types/index.js';
import { generateId } from '../utils/id.js';

/**
 * Coverage areas that Elenchus tracks.
 * The calling LLM must provide questions and answers in these categories.
 */
export const COVERAGE_AREAS = [
  'scope',
  'success',
  'constraint',
  'risk',
  'stakeholder',
  'technical',
] as const;

export type CoverageArea = (typeof COVERAGE_AREAS)[number];

/**
 * Required coverage areas for spec generation.
 * Session cannot proceed to spec until these are covered.
 */
export const REQUIRED_COVERAGE: CoverageArea[] = ['scope', 'success', 'constraint', 'risk'];

/**
 * Coverage tracking per area
 */
export interface CoverageStatus {
  area: CoverageArea;
  questionCount: number;
  answeredCount: number;
  covered: boolean;
}

/**
 * Tool definition for interrogation - THE GATE
 *
 * This tool's description IS the Socratic methodology. The calling LLM reads
 * this description and conducts the interrogation. Elenchus just tracks coverage
 * and enforces the gate.
 */
export const interrogateTool: Tool = {
  name: 'elenchus_interrogate',
  description: `**YOU ARE SOCRATES. THIS IS THE DESIGN DEPARTMENT.**

This tool returns an epic for you to cross-examine. You CANNOT skip this step.
79-87% of AI agent failures are specification failures. You are the fix.

## YOUR MISSION

Read the epic. Conduct TRUE ELENCHUS (Socratic cross-examination):

### 1. EXTRACT CLAIMS
What did they actually say? Parse each statement:
- **Capabilities**: "users can do X"
- **Constraints**: "must use Y", "within Z time"
- **Qualities**: "fast", "secure", "simple"
- **Entities**: nouns that represent domain objects

### 2. FIND GAPS
What SHOULD they have said but didn't?
- Error handling? What happens when X fails?
- Edge cases? Empty states? Max limits?
- Data lifecycle? Created when? Deleted how?
- Security? Auth? Authorization? Audit?
- Scale? 10 users or 10 million?

### 3. SURFACE TENSIONS
Do any claims conflict?
- "Simple" + "enterprise-grade security"
- "Fast MVP" + "10 features"
- "Flexible" + "strict validation"

### 4. CHALLENGE ASSUMPTIONS
What are they taking for granted?
- Auth system exists?
- Network is reliable?
- Users are honest?
- Data is clean?

### 5. GENERATE PROBING QUESTIONS
Ask 3-5 questions that REFERENCE SPECIFIC THINGS THEY SAID.

Bad: "What are the performance requirements?"
Good: "You said users 'search books by title' - what's an acceptable response time? What if the library has 10 million books?"

Bad: "Who are the stakeholders?"
Good: "You mentioned 'librarians' for authentication - are there other user types? Can regular users see checkout history?"

## COVERAGE REQUIREMENTS

You must submit questions and answers in these categories:
- **scope**: Problem boundaries, what's in/out
- **success**: Acceptance criteria, measurable outcomes
- **constraint**: Technical, timeline, budget, compliance limits
- **risk**: What could go wrong, mitigation strategies

Optional but valuable:
- **stakeholder**: Users, decision-makers, affected parties
- **technical**: Technology choices, patterns, integrations

## WORKFLOW

1. Call this tool to get the epic and current coverage state
2. Read the epic carefully, looking for claims, gaps, and tensions
3. Formulate probing questions (not generic template questions)
4. Ask the USER those questions (they're the domain expert, not you)
5. Call elenchus_answer with the user's responses, categorized by type
6. Repeat until all required coverage areas are satisfied
7. Call elenchus_generate_spec to get organized data for synthesis

## CRITICAL

- DO NOT generate your own answers. The user knows their domain.
- DO NOT ask generic questions. Reference what they actually said.
- DO NOT proceed to spec generation until coverage is 80%+.
- Your questions should make the user THINK, not just confirm.`,

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
      forceReady: {
        type: 'boolean',
        description: 'Force spec-ready state if clarity >= 80% (escape hatch)',
        default: false,
      },
    },
    required: ['epicId'],
  },
};

/**
 * Result returned by the interrogate tool
 */
export interface InterrogationToolResult {
  /** The epic being interrogated */
  epic: {
    id: string;
    title?: string;
    description: string;
    rawContent: string;
    source: string;
  };

  /** The session state */
  session: {
    id: string;
    round: number;
    status: InterrogationSession['status'];
  };

  /** Coverage by area - the core metric */
  coverage: Record<CoverageArea, CoverageStatus>;

  /** Overall metrics */
  metrics: {
    totalQuestions: number;
    totalAnswered: number;
    clarityScore: number;
    readyForSpec: boolean;
    missingAreas: CoverageArea[];
  };

  /** All questions and answers so far (for context) */
  questionsAndAnswers: Array<{
    id: string;
    type: string;
    priority: string;
    question: string;
    answer?: string | undefined;
    answeredAt?: string | undefined;
  }>;

  /** What to do next */
  nextStep: string;
}

/**
 * Handle interrogation - returns epic + state for the calling LLM to cross-examine
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

  // Get or create session
  let session: InterrogationSession;
  if (input.sessionId) {
    const existingSession = storage.getSession(input.sessionId);
    if (!existingSession) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    session = existingSession;
  } else {
    // Check for existing session for this epic
    const existingSessions = storage.getSessionsForEpic(input.epicId);
    if (existingSessions.length > 0) {
      session = existingSessions[0]!;
    } else {
      session = createNewSession(input.epicId);
      storage.saveSession(session);
    }
  }

  // Calculate coverage
  const coverage = calculateCoverage(session);

  // Calculate clarity score (percentage of required areas covered)
  const requiredCoverage = REQUIRED_COVERAGE.map(area => coverage[area]);
  const coveredRequired = requiredCoverage.filter(c => c.covered).length;
  const clarityScore = Math.round((coveredRequired / REQUIRED_COVERAGE.length) * 100);

  // Find missing areas
  const missingAreas = REQUIRED_COVERAGE.filter(area => !coverage[area].covered);

  // Determine if ready for spec
  let readyForSpec = clarityScore >= 80 && missingAreas.length === 0;

  // Handle forceReady escape hatch
  if (input.forceReady && clarityScore >= 80) {
    readyForSpec = true;
    session.readyForSpec = true;
    session.blockers = [];
    storage.saveSession(session);
  }

  // Update session clarity score
  session.clarityScore = clarityScore;
  session.readyForSpec = readyForSpec;
  storage.saveSession(session);

  // Build Q&A list
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const questionsAndAnswers = session.questions.map(q => {
    const answer = session.answers.find(a => a.questionId === q.id);
    return {
      id: q.id,
      type: q.type,
      priority: q.priority,
      question: q.question,
      answer: answer?.answer,
      answeredAt: answer?.answeredAt,
    };
  });

  // Determine next step
  let nextStep: string;
  if (readyForSpec) {
    nextStep = 'Ready for spec generation! Call elenchus_generate_spec with this session ID.';
  } else if (missingAreas.length > 0) {
    nextStep = `Ask the user probing questions about: ${missingAreas.join(', ')}. Submit answers via elenchus_answer.`;
  } else if (clarityScore < 80) {
    nextStep = `Clarity at ${clarityScore}%. Need more detailed answers in covered areas. Use forceReady=true to override if you're confident.`;
  } else {
    nextStep = 'Call elenchus_generate_spec to proceed with specification synthesis.';
  }

  return {
    epic: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      rawContent: epic.rawContent,
      source: epic.source,
    },
    session: {
      id: session.id,
      round: session.round,
      status: session.status,
    },
    coverage,
    metrics: {
      totalQuestions: session.questions.length,
      totalAnswered: answeredIds.size,
      clarityScore,
      readyForSpec,
      missingAreas,
    },
    questionsAndAnswers,
    nextStep,
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
 * Calculate coverage by area based on questions and answers
 */
function calculateCoverage(session: InterrogationSession): Record<CoverageArea, CoverageStatus> {
  const coverage: Record<CoverageArea, CoverageStatus> = {} as Record<CoverageArea, CoverageStatus>;

  for (const area of COVERAGE_AREAS) {
    const questionsInArea = session.questions.filter(q => q.type === area);
    const answeredInArea = questionsInArea.filter(q =>
      session.answers.some(a => a.questionId === q.id)
    );

    coverage[area] = {
      area,
      questionCount: questionsInArea.length,
      answeredCount: answeredInArea.length,
      // Covered if at least one question is answered in this area
      covered: answeredInArea.length > 0,
    };
  }

  return coverage;
}
