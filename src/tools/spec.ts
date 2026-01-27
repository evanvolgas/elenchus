import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

/**
 * elenchus_spec - Generate specification from interrogation
 *
 * Takes all the Q&A from a session and organizes it into a structured
 * specification that an AI agent can execute.
 */
export const specTool: Tool = {
  name: 'elenchus_spec',
  description: `Generate a specification from the interrogation session.

Call this when \`elenchus_qa\` returns \`readyForSpec: true\`.

## What You Get

A structured specification containing:
- **problemStatement** - What we're building
- **scope** - What's in and out
- **successCriteria** - How to verify it works
- **constraints** - Limits and requirements
- **risks** - What could go wrong and mitigation
- **technicalDecisions** - Architecture choices made
- **qaLog** - Full Q&A history for reference

## What YOU Do With It

This tool returns ORGANIZED DATA, not a finished spec document.

YOUR job is to:
1. Read through the Q&A log
2. Synthesize it into a coherent problem statement
3. Extract concrete decisions from technical answers
4. Derive testable success criteria
5. Build an execution plan based on what was discussed

The spec should be grounded in what the user actually said, not template boilerplate.

## If Not Ready

If quality thresholds aren't met, you'll get blockers instead of a spec.
Address those via more elenchus_qa rounds first.`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID from elenchus_start',
      },
      force: {
        type: 'boolean',
        description: 'Force spec generation even if quality thresholds not met',
        default: false,
      },
    },
    required: ['sessionId'],
  },
};

import type { StructuredSpec } from '../engines/spec-synthesizer.js';
import type { Specification } from '../types/spec.js';
import type { SpecEnhancement } from '../engines/llm-spec-enhancer.js';

/**
 * Result from elenchus_spec
 */
export interface SpecResult {
  ready: boolean;
  blockers?: string[];
  structuredSpec?: StructuredSpec;
  specification?: Specification;
  synthesisPrompt?: string;
  /** LLM-powered enhancement with inferred requirements, risks, and unknowns */
  enhancement?: SpecEnhancement | undefined;
  /** Whether LLM enhancement was applied */
  llmEnhanced?: boolean | undefined;
}

import { SpecSynthesizer } from '../engines/spec-synthesizer.js';
import { enhanceSpecWithLLM } from '../engines/llm-spec-enhancer.js';

/**
 * Handle spec generation
 */
export async function handleSpec(
  args: Record<string, unknown>,
  storage: Storage
): Promise<SpecResult> {
  const sessionId = args.sessionId as string;
  const force = (args.force as boolean) ?? false;

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
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  // Check readiness
  if (!session.readyForSpec && !force) {
    return {
      ready: false,
      blockers: session.blockers.length > 0
        ? session.blockers
        : ['Session not marked ready. Continue interrogation or use force=true.'],
    };
  }

  // Get all the data needed for synthesis
  const evaluations = storage.getEvaluationsForSession(sessionId);
  const signals = storage.getSignalsForEpic(epic.id);
  const conflicts = storage.getConflictsForSession(sessionId);

  // Use the spec synthesizer engine
  const synthesizer = new SpecSynthesizer();
  const structuredSpec = synthesizer.synthesize(epic, session, evaluations, signals, conflicts);

  // Convert to Specification type for storage
  const specification = synthesizer.toSpecification(structuredSpec, epic);

  // Store the specification
  storage.saveSpec(specification);

  // Build synthesis prompt for Claude (for transparency)
  const synthesisPrompt = buildSynthesisPrompt(epic, structuredSpec);

  // ========================================================================
  // LLM-ENHANCED: Enhance the spec with semantic intelligence
  // Adds inferred requirements, risks, unknowns, and executive summary
  // ========================================================================
  const qaLog = session.questions.map((q, i) => {
    const answer = session.answers[i];
    return {
      question: q.question,
      answer: answer?.answer ?? '(no answer)',
      area: q.type,
    };
  });

  const specSummary = `Tier: ${structuredSpec.metadata.tier}/5, ` +
    `Confidence: ${Math.round(structuredSpec.metadata.confidence * 100)}%, ` +
    `Requirements: ${structuredSpec.requirements.length}, ` +
    `Constraints: ${structuredSpec.constraints.length}, ` +
    `Risks: ${structuredSpec.risks.length}, ` +
    `Unknowns: ${structuredSpec.unknowns.length}`;

  const enhancement = await enhanceSpecWithLLM(
    epic.rawContent,
    qaLog,
    specSummary,
  );

  return {
    ready: true,
    structuredSpec,
    specification,
    synthesisPrompt,
    enhancement: enhancement ?? undefined,
    llmEnhanced: enhancement !== null,
  };
}

/**
 * Build synthesis prompt for transparency
 *
 * This shows what the synthesizer extracted and how it structured the spec.
 */
function buildSynthesisPrompt(
  epic: { title: string; rawContent: string },
  spec: StructuredSpec
): string {
  return `The spec synthesizer has analyzed the interrogation and created a structured specification.

## ORIGINAL EPIC
${epic.rawContent}

## SYNTHESIS RESULTS

**Quality Tier**: ${spec.metadata.tier}/5
**Confidence**: ${Math.round(spec.metadata.confidence * 100)}%

### Requirements Extracted: ${spec.requirements.length}
${spec.requirements.slice(0, 5).map(r =>
  `- [${r.priority.toUpperCase()}] ${r.description} (certainty: ${r.certainty})`
).join('\n')}
${spec.requirements.length > 5 ? `\n... and ${spec.requirements.length - 5} more` : ''}

### Constraints: ${spec.constraints.length}
${spec.constraints.slice(0, 3).map(c => `- [${c.type}] ${c.description}`).join('\n')}
${spec.constraints.length > 3 ? `\n... and ${spec.constraints.length - 3} more` : ''}

### Risks: ${spec.risks.length}
${spec.risks.slice(0, 3).map(r =>
  `- ${r.risk} (${r.likelihood} likelihood, ${r.impact} impact)\n  Mitigation: ${r.mitigation}`
).join('\n')}
${spec.risks.length > 3 ? `\n... and ${spec.risks.length - 3} more` : ''}

### Unknowns: ${spec.unknowns.length}
${spec.unknowns.slice(0, 3).map(u =>
  `- [${u.impact.toUpperCase()}] ${u.question}\n  Recommendation: ${u.recommendation}`
).join('\n')}
${spec.unknowns.length > 3 ? `\n... and ${spec.unknowns.length - 3} more` : ''}

### Execution Plan
${spec.executionGuidance.phases.map(p =>
  `**${p.name}**: ${p.tasks.length} tasks${p.parallel ? ' (parallel)' : ' (sequential)'}`
).join('\n')}

**Critical Path**: ${spec.executionGuidance.criticalPath.join(' → ')}

## NEXT STEPS

The specification is ready for execution. You can now:

1. Review the structured spec for accuracy
2. Address any unknowns that have high impact
3. Begin execution using the generated phases and tasks
4. Use checkpoints to validate progress

All detail from the interrogation has been preserved in the structured format.
Requirements are hierarchical, with relationships tracked between related items.`;
}
