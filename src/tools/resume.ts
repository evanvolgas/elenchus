import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Premise, Contradiction } from '../types/index.js';

/**
 * elenchus_resume - Resume an existing interrogation session
 *
 * Get the full state of a session to continue where you left off.
 */
export const resumeTool: Tool = {
  name: 'elenchus_resume',
  description: `Resume an existing interrogation session.

Returns the full session state including:
- Epic details
- All Q&A history
- Extracted premises
- Detected contradictions (resolved and unresolved)
- Current quality assessment
- Suggested next questions

Use this to continue an interrogation you started earlier.

## Example

\`\`\`json
{ "sessionId": "session-xxx" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID to resume',
      },
    },
    required: ['sessionId'],
  },
};

/**
 * Result from elenchus_resume
 */
export interface ResumeResult {
  session: {
    id: string;
    status: string;
    round: number;
    clarityScore: number;
    readyForSpec: boolean;
    blockers: string[];
    startedAt: string;
    updatedAt: string;
  };
  epic: {
    id: string;
    title: string;
    description: string;
    status: string;
  };
  qaHistory: Array<{
    questionId: string;
    question: string;
    area: string;
    answer: string;
    answeredAt: string;
  }>;
  elenchus: {
    premises: Array<{
      id: string;
      statement: string;
      type: string;
      extractedFrom: string;
    }>;
    contradictions: Array<{
      id: string;
      premiseIds: string[];
      description: string;
      severity: string;
      resolved: boolean;
      resolution: string | undefined;
    }>;
    unresolvedCritical: number;
  };
  coverage: {
    scope: boolean;
    success: boolean;
    constraint: boolean;
    risk: boolean;
    technical: boolean;
    missing: string[];
  };
  nextStep: string;
}

/**
 * Handle resume requests
 */
export function handleResume(
  args: Record<string, unknown>,
  storage: Storage
): ResumeResult {
  const sessionId = args.sessionId as string;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get epic
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found for session: ${session.epicId}`);
  }

  // Build Q&A history
  const qaHistory = session.questions.map((q, i) => {
    const answer = session.answers[i];
    return {
      questionId: q.id,
      question: q.question,
      area: q.type,
      answer: answer?.answer ?? '(no answer)',
      answeredAt: answer?.answeredAt ?? '',
    };
  });

  // Get premises
  const allPremises = storage.getPremisesForSession(sessionId);
  const premises = allPremises.map((p: Premise) => ({
    id: p.id,
    statement: p.statement,
    type: p.type,
    extractedFrom: p.extractedFrom,
  }));

  // Get contradictions
  const allContradictions = storage.getContradictionsForSession(sessionId);
  const contradictions = allContradictions.map((c: Contradiction) => ({
    id: c.id,
    premiseIds: c.premiseIds,
    description: c.description,
    severity: c.severity,
    resolved: c.resolved,
    resolution: c.resolution,
  }));

  const unresolvedCritical = allContradictions.filter(
    (c: Contradiction) => !c.resolved && c.severity === 'critical'
  ).length;

  // Calculate coverage
  const areasCovered = new Set<string>(session.questions.map(q => q.type));
  const requiredAreas = ['scope', 'success', 'constraint', 'risk'] as const;
  const missing = requiredAreas.filter(a => !areasCovered.has(a));
  const coverage = {
    scope: areasCovered.has('scope'),
    success: areasCovered.has('success'),
    constraint: areasCovered.has('constraint'),
    risk: areasCovered.has('risk'),
    technical: areasCovered.has('technical'),
    missing: missing as string[],
  };

  // Determine next step
  let nextStep: string;
  if (session.readyForSpec) {
    nextStep = 'Session is ready for spec generation. Call elenchus_spec.';
  } else if (unresolvedCritical > 0) {
    nextStep = `${unresolvedCritical} critical contradiction(s) must be resolved. Use challengeQuestion to force aporia.`;
  } else if (session.blockers.length > 0) {
    nextStep = `Blockers remain: ${session.blockers[0]}. Continue with elenchus_qa.`;
  } else if (missing.length > 0) {
    nextStep = `Missing coverage: ${missing.join(', ')}. Ask questions in these areas.`;
  } else {
    nextStep = 'Continue interrogation with elenchus_qa until quality thresholds are met.';
  }

  return {
    session: {
      id: session.id,
      status: session.status,
      round: session.round,
      clarityScore: session.clarityScore,
      readyForSpec: session.readyForSpec,
      blockers: session.blockers,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
    },
    epic: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      status: epic.status,
    },
    qaHistory,
    elenchus: {
      premises,
      contradictions,
      unresolvedCritical,
    },
    coverage,
    nextStep,
  };
}
