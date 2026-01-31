import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Premise, Contradiction } from '../types/index.js';

/**
 * elenchus_contradictions - View and resolve contradictions
 *
 * Contradictions are conflicts between premises that must be resolved
 * before a specification can be generated.
 */
export const contradictionsTool: Tool = {
  name: 'elenchus_contradictions',
  description: `View and resolve contradictions for a session.

Contradictions block spec generation until resolved. This tool lets you:
- View all detected contradictions
- See the conflicting premises
- Resolve contradictions directly

## Severity Levels

- **critical** - Cannot proceed until resolved
- **high** - Should resolve before spec
- **medium** - Note for implementation
- **low** - Minor tension

## Examples

View contradictions:
\`\`\`json
{ "sessionId": "session-xxx", "action": "list" }
\`\`\`

Resolve a contradiction:
\`\`\`json
{
  "sessionId": "session-xxx",
  "action": "resolve",
  "contradictionId": "contra-xxx",
  "resolution": "Clarified: regular users can checkout non-rare books only"
}
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID',
      },
      action: {
        type: 'string',
        enum: ['list', 'resolve'],
        description: 'Action to perform',
      },
      contradictionId: {
        type: 'string',
        description: 'Contradiction ID (required for resolve action)',
      },
      resolution: {
        type: 'string',
        description: 'How the contradiction was resolved (required for resolve action)',
      },
      showResolved: {
        type: 'boolean',
        description: 'Include resolved contradictions in list (default: false)',
      },
    },
    required: ['sessionId', 'action'],
  },
};

/**
 * Contradiction with full premise details
 */
interface ContradictionWithPremises {
  id: string;
  description: string;
  severity: string;
  resolved: boolean;
  resolution: string | undefined;
  resolvedAt: string | undefined;
  createdAt: string;
  premises: Array<{
    id: string;
    statement: string;
    type: string;
  }>;
  challengeQuestion: string;
}

/**
 * Result from elenchus_contradictions
 */
export interface ContradictionsResult {
  sessionId: string;
  action: 'list' | 'resolve';
  count: number;
  unresolvedCritical: number;
  blocksSpec: boolean;
  contradictions?: ContradictionWithPremises[];
  resolved?: {
    contradictionId: string;
    resolution: string;
    success: boolean;
  };
  nextStep: string;
}

/**
 * Handle contradictions requests
 */
export function handleContradictions(
  args: Record<string, unknown>,
  storage: Storage
): ContradictionsResult {
  const sessionId = args.sessionId as string;
  const action = args.action as 'list' | 'resolve';
  const contradictionId = args.contradictionId as string | undefined;
  const resolution = args.resolution as string | undefined;
  const showResolved = (args.showResolved as boolean) ?? false;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!action) {
    throw new Error('action is required (list or resolve)');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get premises for context
  const allPremises = storage.getPremisesForSession(sessionId);

  if (action === 'resolve') {
    if (!contradictionId) {
      throw new Error('contradictionId is required for resolve action');
    }
    if (!resolution) {
      throw new Error('resolution is required for resolve action');
    }

    const success = storage.resolveContradiction(contradictionId, resolution);

    // Recalculate blockers
    const remaining = storage.getUnresolvedContradictionsForSession(sessionId);
    const unresolvedCritical = remaining.filter((c: Contradiction) => c.severity === 'critical').length;

    return {
      sessionId,
      action: 'resolve',
      count: remaining.length,
      unresolvedCritical,
      blocksSpec: unresolvedCritical > 0,
      resolved: {
        contradictionId,
        resolution,
        success,
      },
      nextStep: unresolvedCritical > 0
        ? `${unresolvedCritical} critical contradiction(s) remain. Resolve them to unblock spec.`
        : 'No critical contradictions. Session may be ready for spec generation.',
    };
  }

  // List action
  let contradictions = showResolved
    ? storage.getContradictionsForSession(sessionId)
    : storage.getUnresolvedContradictionsForSession(sessionId);

  const unresolvedCritical = storage.getUnresolvedContradictionsForSession(sessionId)
    .filter((c: Contradiction) => c.severity === 'critical').length;

  // Build contradictions with premise details
  const contradictionsWithPremises: ContradictionWithPremises[] = contradictions.map((c: Contradiction) => {
    const relatedPremises = allPremises.filter((p: Premise) => c.premiseIds.includes(p.id));

    // Generate challenge question
    let challengeQuestion = `Contradiction: ${c.description}. How should this be resolved?`;
    if (relatedPremises.length >= 2) {
      const p1 = relatedPremises[0];
      const p2 = relatedPremises[1];
      if (p1 && p2) {
        challengeQuestion = `You said "${p1.statement}" AND "${p2.statement}". ` +
          `${c.description}. Which is ESSENTIAL, or how do they work together?`;
      }
    }

    return {
      id: c.id,
      description: c.description,
      severity: c.severity,
      resolved: c.resolved,
      resolution: c.resolution,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
      premises: relatedPremises.map((p: Premise) => ({
        id: p.id,
        statement: p.statement,
        type: p.type,
      })),
      challengeQuestion,
    };
  });

  return {
    sessionId,
    action: 'list',
    count: contradictionsWithPremises.length,
    unresolvedCritical,
    blocksSpec: unresolvedCritical > 0,
    contradictions: contradictionsWithPremises,
    nextStep: unresolvedCritical > 0
      ? `${unresolvedCritical} critical contradiction(s) block spec generation. Use the challenge questions to force resolution.`
      : contradictionsWithPremises.length > 0
        ? `${contradictionsWithPremises.length} non-critical contradiction(s) exist. Consider resolving them for a cleaner spec.`
        : 'No contradictions detected. Proceed with elenchus_qa or elenchus_spec.',
  };
}
