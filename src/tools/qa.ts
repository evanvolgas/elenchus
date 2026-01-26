import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Question, Answer, Signal, AnswerEvaluation, Premise, Contradiction } from '../types/index.js';
import { generateId } from '../utils/id.js';

/**
 * elenchus_qa - Submit Q&A with Socratic premise tracking
 *
 * This is the main interrogation loop implementing TRUE Socratic elenchus:
 * - Extract premises (logical commitments) from answers
 * - Detect contradictions between premises
 * - Force resolution before spec generation
 */
export const qaTool: Tool = {
  name: 'elenchus_qa',
  description: `Submit Q&A and get Socratic quality assessment with contradiction detection.

## The Socratic Method (Elenchus)

This tool implements TRUE Socratic elenchus, not just Q&A tracking:

1. **Premise Extraction**: From each answer, extract the logical commitments
2. **Contradiction Detection**: Check if accumulated premises conflict
3. **Aporia Forcing**: If contradictions exist, they MUST be resolved before spec

## Input

Submit Q&A pairs. Include premises you extracted from each answer:

\`\`\`json
{
  "sessionId": "session-xxx",
  "qa": [
    {
      "area": "scope",
      "question": "Who can export data?",
      "answer": "All users can export their data to Excel",
      "score": 4,
      "premises": ["All users have export access", "Exports go to Excel format"]
    },
    {
      "area": "constraint",
      "question": "What about data security?",
      "answer": "PII must be protected, no unauthorized access",
      "score": 4,
      "premises": ["PII requires access control", "Unauthorized access forbidden"]
    }
  ],
  "contradictions": [
    {
      "premiseIds": ["prem-1", "prem-3"],
      "description": "All users can export (including PII) conflicts with PII access control",
      "severity": "critical"
    }
  ]
}
\`\`\`

## Premise Types

- **capability** - "Users can X"
- **constraint** - "System must not X"
- **requirement** - "X is required"
- **assumption** - "Assuming X is true"
- **preference** - "We prefer X"

## Contradiction Severity

- **critical** - Cannot proceed until resolved
- **high** - Should resolve before spec
- **medium** - Note for implementation
- **low** - Minor tension

## What You Get Back

- **premises** - All extracted premises with IDs
- **contradictions** - Detected conflicts between premises
- **contradictionCheckPrompt** - Prompt to run for detecting contradictions
- **readyForSpec** - False if unresolved critical contradictions
- **suggestedChallengeQuestion** - Socratic question to force aporia

## The Key Insight

Cannot generate spec until contradictions are resolved. This is TRUE elenchus:
asking questions that EXPOSE logical inconsistency, not just gather information.

When contradictions exist, ask the user: "You said X and Y. Both cannot be true. Which is essential?"`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID from elenchus_start',
      },
      qa: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            area: {
              type: 'string',
              enum: ['scope', 'success', 'constraint', 'risk', 'technical'],
              description: 'Category of the Q&A',
            },
            question: {
              type: 'string',
              description: 'The question you asked',
            },
            answer: {
              type: 'string',
              description: 'The user\'s answer',
            },
            score: {
              type: 'number',
              enum: [1, 2, 3, 4, 5],
              description: 'Optional: your assessment of answer quality (1-5)',
            },
            premises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  statement: {
                    type: 'string',
                    description: 'The logical commitment extracted from the answer',
                  },
                  type: {
                    type: 'string',
                    enum: ['capability', 'constraint', 'requirement', 'assumption', 'preference'],
                  },
                },
                required: ['statement', 'type'],
              },
              description: 'Premises (logical commitments) extracted from this answer',
            },
          },
          required: ['area', 'question', 'answer'],
        },
        description: 'Array of Q&A pairs with extracted premises',
      },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            premiseIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              description: 'IDs of premises that conflict',
            },
            description: {
              type: 'string',
              description: 'Why these premises cannot both be true',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
          required: ['premiseIds', 'description', 'severity'],
        },
        description: 'Contradictions detected between premises',
      },
      resolutions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            contradictionId: {
              type: 'string',
              description: 'ID of the contradiction being resolved',
            },
            resolution: {
              type: 'string',
              description: 'How the contradiction was resolved',
            },
          },
          required: ['contradictionId', 'resolution'],
        },
        description: 'Resolutions for previously detected contradictions',
      },
      signals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['claim', 'gap', 'tension', 'assumption'],
            },
            content: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
          required: ['type', 'content', 'severity'],
        },
        description: 'Optional: signals detected from analysis',
      },
    },
    required: ['sessionId', 'qa'],
  },
};

/**
 * Input premise (extracted from an answer)
 */
interface PremiseInput {
  statement: string;
  type: 'capability' | 'constraint' | 'requirement' | 'assumption' | 'preference';
}

/**
 * Input Q&A item with premises
 */
interface QAInput {
  area: 'scope' | 'success' | 'constraint' | 'risk' | 'technical';
  question: string;
  answer: string;
  score?: 1 | 2 | 3 | 4 | 5;
  premises?: PremiseInput[];
}

/**
 * Input contradiction between premises
 */
interface ContradictionInput {
  premiseIds: string[];
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Input resolution for a contradiction
 */
interface ResolutionInput {
  contradictionId: string;
  resolution: string;
}

/**
 * Input signal
 */
interface SignalInput {
  type: 'claim' | 'gap' | 'tension' | 'assumption';
  content: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Suggested follow-up question
 */
interface SuggestedQuestion {
  question: string;
  area: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
}

/**
 * Result from elenchus_qa
 */
export interface QAResult {
  session: {
    id: string;
    round: number;
  };
  quality: {
    averageScore: number;
    totalAnswered: number;
    lowQualityCount: number;
    issues: Array<{
      answerId: string;
      question: string;
      score: number;
      problem: string;
    }>;
  };
  coverage: {
    scope: boolean;
    success: boolean;
    constraint: boolean;
    risk: boolean;
    technical: boolean;
    missing: string[];
  };
  // Socratic elenchus state
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
    }>;
    unresolvedCritical: number;
    aporiaReached: boolean;
  };
  // Prompt for calling LLM to detect contradictions
  contradictionCheckPrompt: string;
  signals: {
    total: number;
    critical: number;
    addressed: number;
  };
  readyForSpec: boolean;
  blockers: string[];
  suggestedQuestions: SuggestedQuestion[];
  // Socratic challenge question if contradictions exist
  challengeQuestion: string | undefined;
  nextStep: string;
}

/**
 * Handle Q&A submission with Socratic premise tracking
 */
export async function handleQA(
  args: Record<string, unknown>,
  storage: Storage
): Promise<QAResult> {
  const sessionId = args.sessionId as string;
  const qaInputs = args.qa as QAInput[];
  const contradictionInputs = (args.contradictions as ContradictionInput[]) || [];
  const resolutionInputs = (args.resolutions as ResolutionInput[]) || [];
  const signalInputs = (args.signals as SignalInput[]) || [];

  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!qaInputs || !Array.isArray(qaInputs) || qaInputs.length === 0) {
    throw new Error('qa array is required and must not be empty');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const now = new Date().toISOString();
  const validAreas = ['scope', 'success', 'constraint', 'risk', 'technical'];

  // Process Q&A pairs and extract premises
  const newAnswerIds: string[] = [];
  const newPremiseIds: string[] = [];

  for (const qa of qaInputs) {
    if (!validAreas.includes(qa.area)) {
      throw new Error(`Invalid area: ${qa.area}. Must be one of: ${validAreas.join(', ')}`);
    }

    // Create question
    const questionId = generateId('q');
    const question: Question = {
      id: questionId,
      type: qa.area,
      priority: 'important',
      question: qa.question,
      context: 'Submitted via elenchus_qa',
      targetAudience: 'both',
      source: 'llm',
    };
    session.questions.push(question);

    // Create answer
    const answer: Answer = {
      questionId,
      answer: qa.answer,
      usedDefault: false,
      answeredAt: now,
    };
    session.answers.push(answer);
    newAnswerIds.push(questionId);

    // Store evaluation if score provided
    if (qa.score !== undefined) {
      const evaluation: AnswerEvaluation = {
        id: generateId('eval'),
        sessionId,
        answerId: questionId,
        score: qa.score,
        reasoning: scoreToReasoning(qa.score),
        evaluatedAt: now,
        addressesSignals: [],
      };
      storage.saveEvaluation(evaluation);
    }

    // Store premises if provided (Socratic elenchus)
    if (qa.premises && qa.premises.length > 0) {
      for (const p of qa.premises) {
        const premise: Premise = {
          id: generateId('prem'),
          sessionId,
          statement: p.statement,
          extractedFrom: questionId,
          type: p.type,
          confidence: 'high',
          createdAt: now,
        };
        storage.savePremise(premise);
        newPremiseIds.push(premise.id);
      }
    }
  }

  // Store contradictions if provided
  if (contradictionInputs.length > 0) {
    for (const c of contradictionInputs) {
      const contradiction: Contradiction = {
        id: generateId('contra'),
        sessionId,
        premiseIds: c.premiseIds,
        description: c.description,
        severity: c.severity,
        resolved: false,
        createdAt: now,
      };
      storage.saveContradiction(contradiction);
    }
  }

  // Process resolutions for existing contradictions
  if (resolutionInputs.length > 0) {
    for (const r of resolutionInputs) {
      storage.resolveContradiction(r.contradictionId, r.resolution);
    }
  }

  // Store signals if provided
  if (signalInputs.length > 0) {
    const signals: Signal[] = signalInputs.map(s => ({
      id: generateId('sig'),
      epicId: session.epicId,
      type: s.type,
      content: s.content,
      severity: s.severity,
      addressed: false,
      createdAt: now,
    }));
    storage.saveSignals(signals);
  }

  // Update session
  session.round += 1;
  session.updatedAt = now;

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
    missing,
  };

  // Get quality metrics
  const evaluations = storage.getEvaluationsForSession(sessionId);
  const scores = evaluations.map(e => e.score);
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;
  const lowQualityCount = scores.filter(s => s < 3).length;

  // Get issues (low-scoring answers)
  const issues = evaluations
    .filter(e => e.score < 3)
    .map(e => {
      const q = session.questions.find(q => q.id === e.answerId);
      return {
        answerId: e.answerId,
        question: q?.question || '',
        score: e.score,
        problem: e.reasoning,
      };
    });

  // Get premises (Socratic elenchus)
  const allPremises = storage.getPremisesForSession(sessionId);
  const premises = allPremises.map(p => ({
    id: p.id,
    statement: p.statement,
    type: p.type,
    extractedFrom: p.extractedFrom,
  }));

  // Get contradictions (Socratic elenchus)
  const allContradictions = storage.getContradictionsForSession(sessionId);
  const contradictions = allContradictions.map(c => ({
    id: c.id,
    premiseIds: c.premiseIds,
    description: c.description,
    severity: c.severity,
    resolved: c.resolved,
  }));
  const unresolvedCriticalContradictions = allContradictions.filter(
    c => !c.resolved && c.severity === 'critical'
  ).length;

  // Get signals
  const allSignals = storage.getSignalsForEpic(session.epicId);
  const criticalUnaddressed = allSignals.filter(s => s.severity === 'critical' && !s.addressed).length;

  // Build contradiction check prompt for calling LLM
  const contradictionCheckPrompt = buildContradictionCheckPrompt(allPremises);

  // Determine readiness - NOW INCLUDES CONTRADICTION CHECK
  const blockers: string[] = [];
  if (missing.length > 0) {
    blockers.push(`Missing coverage: ${missing.join(', ')}`);
  }
  if (lowQualityCount > 0) {
    blockers.push(`${lowQualityCount} answer(s) scored below 3`);
  }
  if (unresolvedCriticalContradictions > 0) {
    blockers.push(`${unresolvedCriticalContradictions} unresolved critical contradiction(s) - MUST resolve before spec`);
  }
  if (criticalUnaddressed > 0) {
    blockers.push(`${criticalUnaddressed} critical signal(s) not addressed`);
  }

  const readyForSpec = blockers.length === 0 && session.answers.length >= 4;

  // Generate challenge question if contradictions exist (Socratic aporia)
  const challengeQuestion = generateChallengeQuestion(allContradictions.filter(c => !c.resolved), allPremises);

  // Update session state
  session.clarityScore = Math.round((requiredAreas.length - missing.length) / requiredAreas.length * 100);
  session.readyForSpec = readyForSpec;
  session.blockers = blockers;
  storage.saveSession(session);

  // Generate suggested follow-up questions
  const suggestedQuestions = generateFollowUpQuestions(
    missing,
    issues,
    allContradictions.filter(c => !c.resolved),
    allSignals.filter(s => !s.addressed)
  );

  // Determine next step
  let nextStep: string;
  if (readyForSpec) {
    nextStep = 'Quality threshold met. Call elenchus_spec to generate the specification.';
  } else if (blockers.length > 0) {
    nextStep = `Address blockers: ${blockers[0]}. Ask follow-up questions and submit via elenchus_qa.`;
  } else {
    nextStep = 'Continue asking questions until coverage and quality thresholds are met.';
  }

  return {
    session: {
      id: session.id,
      round: session.round,
    },
    quality: {
      averageScore,
      totalAnswered: session.answers.length,
      lowQualityCount,
      issues,
    },
    coverage,
    // Socratic elenchus state
    elenchus: {
      premises,
      contradictions,
      unresolvedCritical: unresolvedCriticalContradictions,
      aporiaReached: unresolvedCriticalContradictions > 0,
    },
    contradictionCheckPrompt,
    signals: {
      total: allSignals.length,
      critical: allSignals.filter(s => s.severity === 'critical').length,
      addressed: allSignals.filter(s => s.addressed).length,
    },
    readyForSpec,
    blockers,
    suggestedQuestions,
    challengeQuestion,
    nextStep,
  };
}

/**
 * Convert score to reasoning
 */
function scoreToReasoning(score: number): string {
  switch (score) {
    case 1: return 'Completely vague - no actionable information';
    case 2: return 'Somewhat vague - needs more specifics';
    case 3: return 'Partially specific - acceptable but could be clearer';
    case 4: return 'Mostly specific - good actionable detail';
    case 5: return 'Fully specific with edge cases addressed';
    default: return 'Unknown score';
  }
}

/**
 * Generate follow-up questions based on gaps
 */
function generateFollowUpQuestions(
  missingAreas: string[],
  lowQualityAnswers: Array<{ question: string; score: number }>,
  unresolvedContradictions: Contradiction[],
  unaddressedSignals: Signal[]
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];

  // Questions for missing coverage
  for (const area of missingAreas) {
    questions.push({
      question: getAreaQuestion(area),
      area,
      reason: `No coverage in ${area} area`,
      priority: 'critical',
    });
  }

  // Follow-ups for vague answers
  for (const answer of lowQualityAnswers.slice(0, 2)) {
    questions.push({
      question: `You mentioned "${answer.question.slice(0, 50)}..." - can you be more specific? Numbers, examples, or concrete criteria?`,
      area: 'scope',
      reason: `Previous answer scored ${answer.score}/5`,
      priority: 'high',
    });
  }

  // Questions for contradictions (Socratic elenchus)
  for (const contradiction of unresolvedContradictions.slice(0, 1)) {
    questions.push({
      question: `Contradiction: "${contradiction.description}". These premises cannot both be true. Which is essential?`,
      area: 'scope',
      reason: `Unresolved ${contradiction.severity}-severity contradiction`,
      priority: contradiction.severity === 'critical' ? 'critical' : 'high',
    });
  }

  // Questions for critical signals
  for (const signal of unaddressedSignals.filter(s => s.severity === 'critical').slice(0, 1)) {
    questions.push({
      question: `Critical gap: ${signal.content}. How should this be handled?`,
      area: 'risk',
      reason: 'Critical signal unaddressed',
      priority: 'critical',
    });
  }

  return questions.slice(0, 5);
}

/**
 * Build prompt for the calling LLM to detect contradictions between premises
 */
function buildContradictionCheckPrompt(premises: Premise[]): string {
  if (premises.length < 2) {
    return 'Not enough premises to check for contradictions yet.';
  }

  const premiseList = premises
    .map((p, i) => `${i + 1}. [${p.id}] (${p.type}) "${p.statement}"`)
    .join('\n');

  return `## Contradiction Detection (Socratic Elenchus)

You have accumulated the following premises from the user's answers:

${premiseList}

## Your Task

Analyze these premises for LOGICAL CONTRADICTIONS. A contradiction exists when:
- Two premises cannot BOTH be true simultaneously
- One premise implies something that violates another
- Premises create impossible requirements when combined

## Examples of Contradictions

- "All users can export" + "PII must be protected" = Contradiction if export includes PII
- "Real-time processing" + "Batch uploads of 10GB" = Contradiction (can't be both real-time)
- "No external dependencies" + "Use AWS S3" = Contradiction

## Output Format

If you find contradictions, report them in your next elenchus_qa call:

\`\`\`json
{
  "contradictions": [
    {
      "premiseIds": ["prem-xxx", "prem-yyy"],
      "description": "Why these premises conflict",
      "severity": "critical|high|medium|low"
    }
  ]
}
\`\`\`

If no contradictions found, proceed with more questions.

## Severity Guide

- **critical**: Impossible to implement if both are required
- **high**: Significant tension that needs resolution
- **medium**: Minor tension, may need clarification
- **low**: Stylistic or preference conflict`;
}

/**
 * Generate a Socratic challenge question to force aporia
 */
function generateChallengeQuestion(
  unresolvedContradictions: Contradiction[],
  premises: Premise[]
): string | undefined {
  if (unresolvedContradictions.length === 0) {
    return undefined;
  }

  const firstContradiction = unresolvedContradictions[0];
  if (!firstContradiction) {
    return undefined;
  }

  const conflictingPremises = premises.filter(p => firstContradiction.premiseIds.includes(p.id));

  if (conflictingPremises.length < 2) {
    return `Contradiction detected: ${firstContradiction.description}. How should this be resolved?`;
  }

  const p1 = conflictingPremises[0];
  const p2 = conflictingPremises[1];

  if (!p1 || !p2) {
    return `Contradiction detected: ${firstContradiction.description}. How should this be resolved?`;
  }

  return `You said "${p1.statement}" AND "${p2.statement}". ${firstContradiction.description}. ` +
    `These cannot both be true. Which is ESSENTIAL, or how do they work together?`;
}

/**
 * Get default question for an area
 */
function getAreaQuestion(area: string): string {
  switch (area) {
    case 'scope':
      return 'What is explicitly IN scope and OUT of scope for this work?';
    case 'success':
      return 'How will you verify this works? What are the acceptance criteria?';
    case 'constraint':
      return 'What are the constraints? Timeline, budget, technology, compliance?';
    case 'risk':
      return 'What could go wrong? What are the risks and how do we mitigate them?';
    case 'technical':
      return 'What technology choices or architectural decisions need to be made?';
    default:
      return `What about ${area}?`;
  }
}
