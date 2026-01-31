import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Premise } from '../types/index.js';

/**
 * elenchus_premises - View and manage premises for a session
 *
 * Premises are the logical commitments extracted from user answers.
 * This tool lets you inspect them directly.
 */
export const premisesTool: Tool = {
  name: 'elenchus_premises',
  description: `View premises (logical commitments) for a session.

Premises are extracted from user answers during interrogation:
- **capability** - "Users can X"
- **constraint** - "System must not X"
- **requirement** - "X is required"
- **assumption** - "Assuming X is true"
- **preference** - "We prefer X"

## Use Cases

- Review all premises before checking for contradictions
- Understand what logical commitments have been made
- Debug contradiction detection

## Example

\`\`\`json
{ "sessionId": "session-xxx" }
\`\`\`

Filter by type:
\`\`\`json
{ "sessionId": "session-xxx", "type": "constraint" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID',
      },
      type: {
        type: 'string',
        enum: ['capability', 'constraint', 'requirement', 'assumption', 'preference'],
        description: 'Filter by premise type (optional)',
      },
    },
    required: ['sessionId'],
  },
};

/**
 * Premise with related answer context
 */
interface PremiseWithContext {
  id: string;
  statement: string;
  type: string;
  confidence: string;
  extractedFrom: string;
  sourceQuestion: string | undefined;
  sourceAnswer: string | undefined;
  createdAt: string;
}

/**
 * Result from elenchus_premises
 */
export interface PremisesResult {
  sessionId: string;
  count: number;
  byType: {
    capability: number;
    constraint: number;
    requirement: number;
    assumption: number;
    preference: number;
  };
  premises: PremiseWithContext[];
  contradictionCheckHint: string;
}

/**
 * Handle premises requests
 */
export function handlePremises(
  args: Record<string, unknown>,
  storage: Storage
): PremisesResult {
  const sessionId = args.sessionId as string;
  const typeFilter = args.type as string | undefined;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  // Get session for Q&A context
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get all premises
  let allPremises = storage.getPremisesForSession(sessionId);

  // Filter by type if specified
  if (typeFilter) {
    allPremises = allPremises.filter((p: Premise) => p.type === typeFilter);
  }

  // Count by type
  const allPremisesUnfiltered = storage.getPremisesForSession(sessionId);
  const byType = {
    capability: allPremisesUnfiltered.filter((p: Premise) => p.type === 'capability').length,
    constraint: allPremisesUnfiltered.filter((p: Premise) => p.type === 'constraint').length,
    requirement: allPremisesUnfiltered.filter((p: Premise) => p.type === 'requirement').length,
    assumption: allPremisesUnfiltered.filter((p: Premise) => p.type === 'assumption').length,
    preference: allPremisesUnfiltered.filter((p: Premise) => p.type === 'preference').length,
  };

  // Build premises with context
  const premises: PremiseWithContext[] = allPremises.map((p: Premise) => {
    const question = session.questions.find(q => q.id === p.extractedFrom);
    const answerIndex = session.questions.findIndex(q => q.id === p.extractedFrom);
    const answer = answerIndex >= 0 ? session.answers[answerIndex] : undefined;

    return {
      id: p.id,
      statement: p.statement,
      type: p.type,
      confidence: p.confidence,
      extractedFrom: p.extractedFrom,
      sourceQuestion: question?.question,
      sourceAnswer: answer?.answer,
      createdAt: p.createdAt,
    };
  });

  // Generate hint for contradiction checking
  const contradictionCheckHint = allPremisesUnfiltered.length >= 2
    ? `You have ${allPremisesUnfiltered.length} premises. Check for logical contradictions:\n` +
      `- Capabilities vs Constraints (can users do X while X is forbidden?)\n` +
      `- Requirements vs Assumptions (is X required but assumed to exist?)\n` +
      `- Constraints vs Constraints (mutually exclusive limits?)`
    : 'Not enough premises to check for contradictions yet.';

  return {
    sessionId,
    count: premises.length,
    byType,
    premises,
    contradictionCheckHint,
  };
}
