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

/**
 * Q&A entry in the spec
 */
interface QAEntry {
  area: string;
  question: string;
  answer: string;
  score?: number | undefined;
}

/**
 * Result from elenchus_spec
 */
export interface SpecResult {
  ready: boolean;
  blockers?: string[];
  spec?: {
    epicId: string;
    sessionId: string;
    title: string;
    problemStatement: string;
    scope: {
      inScope: string[];
      outOfScope: string[];
      boundaries: string[];
    };
    successCriteria: string[];
    constraints: string[];
    risks: Array<{
      risk: string;
      mitigation: string;
    }>;
    technicalDecisions: string[];
    qaLog: QAEntry[];
    metadata: {
      totalQuestions: number;
      totalAnswers: number;
      averageScore: number;
      generatedAt: string;
      forced: boolean;
    };
  };
  synthesisPrompt?: string;
}

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

  // Get evaluations for scoring
  const evaluations = storage.getEvaluationsForSession(sessionId);
  const scoreMap = new Map(evaluations.map(e => [e.answerId, e.score]));

  // Build Q&A log organized by area
  const qaLog: QAEntry[] = session.questions.map(q => {
    const answer = session.answers.find(a => a.questionId === q.id);
    return {
      area: q.type,
      question: q.question,
      answer: answer?.answer || '[No answer]',
      score: scoreMap.get(q.id),
    };
  });

  // Extract by area
  const byArea = (area: string) => qaLog.filter(qa => qa.area === area);

  // Build scope from scope answers
  const scopeAnswers = byArea('scope');
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  const boundaries: string[] = [];

  for (const qa of scopeAnswers) {
    const lower = qa.answer.toLowerCase();
    if (lower.includes('not') || lower.includes('out of scope') || lower.includes("won't") || lower.includes("don't")) {
      outOfScope.push(qa.answer);
    } else {
      inScope.push(qa.answer);
    }
    boundaries.push(`Q: ${qa.question}\nA: ${qa.answer}`);
  }

  // Build success criteria from success answers
  const successCriteria = byArea('success').map(qa => qa.answer);

  // Build constraints from constraint answers
  const constraints = byArea('constraint').map(qa => qa.answer);

  // Build risks from risk answers
  const riskAnswers = byArea('risk');
  const risks = riskAnswers.map(qa => ({
    risk: qa.question,
    mitigation: qa.answer,
  }));

  // Build technical decisions from technical answers
  const technicalDecisions = byArea('technical').map(qa => `${qa.question}: ${qa.answer}`);

  // Calculate metadata
  const scores = evaluations.map(e => e.score);
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;

  // Build problem statement from epic + answers
  const problemStatement = buildProblemStatement(epic.rawContent, qaLog);

  // Build synthesis prompt for Claude
  const synthesisPrompt = buildSynthesisPrompt(epic, qaLog);

  return {
    ready: true,
    spec: {
      epicId: epic.id,
      sessionId: session.id,
      title: epic.title,
      problemStatement,
      scope: {
        inScope,
        outOfScope,
        boundaries,
      },
      successCriteria,
      constraints,
      risks,
      technicalDecisions,
      qaLog,
      metadata: {
        totalQuestions: session.questions.length,
        totalAnswers: session.answers.length,
        averageScore,
        generatedAt: new Date().toISOString(),
        forced: force,
      },
    },
    synthesisPrompt,
  };
}

/**
 * Build problem statement from epic and Q&A
 */
function buildProblemStatement(rawContent: string, qaLog: QAEntry[]): string {
  // Start with the epic's first sentence/paragraph
  const firstPara = rawContent.split('\n')[0] || rawContent.slice(0, 200);

  // Add key scope clarifications
  const scopeItems = qaLog
    .filter(qa => qa.area === 'scope' && qa.score && qa.score >= 3)
    .map(qa => qa.answer)
    .slice(0, 3);

  if (scopeItems.length > 0) {
    return `${firstPara}\n\nKey clarifications:\n- ${scopeItems.join('\n- ')}`;
  }

  return firstPara;
}

/**
 * Build synthesis prompt for Claude to create the final spec
 */
function buildSynthesisPrompt(
  epic: { title: string; rawContent: string },
  qaLog: QAEntry[]
): string {
  const qaByArea: Record<string, QAEntry[]> = {};
  for (const qa of qaLog) {
    const area = qa.area;
    if (!qaByArea[area]) {
      qaByArea[area] = [];
    }
    qaByArea[area]!.push(qa);
  }

  const formatQA = (entries: QAEntry[] | undefined) =>
    entries?.map(qa => `Q: ${qa.question}\nA: ${qa.answer}${qa.score ? ` [${qa.score}/5]` : ''}`).join('\n\n') ?? 'None';

  return `You have completed a Socratic interrogation. Now synthesize the results into a specification.

## ORIGINAL EPIC
${epic.rawContent}

## INTERROGATION RESULTS

### Scope (${qaByArea['scope']?.length || 0} Q&A)
${qaByArea['scope'] ? formatQA(qaByArea['scope']) : 'None'}

### Success Criteria (${qaByArea['success']?.length || 0} Q&A)
${qaByArea['success'] ? formatQA(qaByArea['success']) : 'None'}

### Constraints (${qaByArea['constraint']?.length || 0} Q&A)
${qaByArea['constraint'] ? formatQA(qaByArea['constraint']) : 'None'}

### Risks (${qaByArea['risk']?.length || 0} Q&A)
${qaByArea['risk'] ? formatQA(qaByArea['risk']) : 'None'}

### Technical (${qaByArea['technical']?.length || 0} Q&A)
${qaByArea['technical'] ? formatQA(qaByArea['technical']) : 'None'}

## YOUR TASK

Synthesize this into a coherent specification. The spec should:

1. **Problem Statement**: What are we building and why?
2. **Scope**: Clear boundaries - what's in, what's out
3. **Success Criteria**: Testable conditions for "done"
4. **Technical Approach**: Key decisions and their rationale
5. **Risks**: What could go wrong and how we'll handle it
6. **Execution Plan**: High-level phases/milestones

Ground everything in the actual Q&A. Don't invent requirements not discussed.
If something is unclear, note it as a known gap rather than guessing.`;
}
