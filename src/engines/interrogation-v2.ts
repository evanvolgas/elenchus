/**
 * Interrogation Engine V2: LLM-Powered Socratic Questioning
 *
 * This engine does NOT generate questions. It analyzes the epic and answers,
 * detects signals, and provides structured guidance for the CALLING LLM to
 * formulate Socratic questions.
 *
 * Philosophy:
 * - Elenchus detects patterns (vagueness, contradictions, gaps, assumptions)
 * - Elenchus tracks state (what's been asked, answered, coverage)
 * - The calling LLM reasons about patterns and formulates questions
 * - The calling LLM decides when interrogation is "done"
 */

import type { Epic } from '../types/index.js';
import type {
  InterrogationSession,
  QuestionType,
} from '../types/interrogation.js';
import {
  detectSignals,
  type InterrogationSignals,
  type VaguenessIndicator,
} from './signal-detector.js';
import { organizeAnswers, type OrganizedAnswers } from './answer-extractor.js';

/**
 * Guidance for the calling LLM on how to conduct Socratic interrogation
 */
export interface SocraticGuidance {
  /**
   * Areas that need more depth, with reasons
   */
  focusAreas: FocusArea[];

  /**
   * Specific issues to probe
   */
  probeTargets: ProbeTarget[];

  /**
   * Current interrogation context for the LLM
   */
  context: InterrogationContext;

  /**
   * Whether the interrogation appears ready for spec generation
   */
  readinessAssessment: ReadinessAssessment;

  /**
   * Instructions for the calling LLM
   */
  instructions: string;
}

export interface FocusArea {
  type: QuestionType;
  reason: string;
  currentCoverage: 'none' | 'shallow' | 'moderate' | 'deep';
  priority: 'critical' | 'important' | 'nice-to-have';
}

export interface ProbeTarget {
  category: 'vagueness' | 'contradiction' | 'gap' | 'assumption';
  description: string;
  evidence: string;
  suggestedApproach: string;
  relatedAnswerIds: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface InterrogationContext {
  epic: {
    id: string;
    title: string | undefined;
    description: string;
  };
  previousAnswers: OrganizedAnswers;
  detectedStack: string[];
  round: number;
}

export interface ReadinessAssessment {
  isReady: boolean;
  clarityScore: number;
  completenessScore: number;
  blockers: string[];
  canForceReady: boolean;
  forceReadyReason: string | undefined;
}

/**
 * Result of V2 interrogation - signals + guidance, NOT questions
 */
export interface InterrogationResultV2 {
  session: InterrogationSession;
  signals: InterrogationSignals;
  guidance: SocraticGuidance;
}

/**
 * Generate Socratic guidance from interrogation signals
 */
export function generateGuidance(
  epic: Epic,
  session: InterrogationSession,
  signals: InterrogationSignals
): SocraticGuidance {
  const focusAreas = generateFocusAreas(signals);
  const probeTargets = generateProbeTargets(signals);
  const context = buildContext(epic, session, signals);
  const readiness = assessReadiness(session, signals);
  const instructions = buildInstructions(focusAreas, probeTargets, signals, readiness);

  return {
    focusAreas,
    probeTargets,
    context,
    readinessAssessment: readiness,
    instructions,
  };
}

/**
 * Determine which areas need more focus
 */
function generateFocusAreas(signals: InterrogationSignals): FocusArea[] {
  const areas: FocusArea[] = [];

  // Add focus areas from coverage gaps
  for (const gap of signals.coverageGaps) {
    areas.push({
      type: gap.questionType,
      reason: gap.reason,
      currentCoverage: 'none',
      priority: gap.priority,
    });
  }

  // Note: We could track per-type vagueness here if we had question type
  // in the answer signals. For now, we rely on coverage gaps.

  // Critical types that haven't been deeply covered
  const criticalTypes: QuestionType[] = ['scope', 'success', 'constraint'];
  for (const type of criticalTypes) {
    if (!signals.answeredTypes.includes(type)) {
      if (!areas.some(a => a.type === type)) {
        areas.push({
          type,
          reason: `No ${type} questions have been answered yet`,
          currentCoverage: 'none',
          priority: 'critical',
        });
      }
    }
  }

  return areas;
}

/**
 * Generate specific probe targets from signals
 */
function generateProbeTargets(signals: InterrogationSignals): ProbeTarget[] {
  const targets: ProbeTarget[] = [];

  // Vagueness probes
  for (const answerSignal of signals.answerSignals) {
    const highSeverity = answerSignal.vaguenessIndicators.filter(
      v => v.severity === 'high'
    );
    if (highSeverity.length > 0) {
      targets.push({
        category: 'vagueness',
        description: `Answer contains vague language`,
        evidence: highSeverity.map(v => v.evidence).join('; '),
        suggestedApproach: suggestVaguenessApproach(highSeverity),
        relatedAnswerIds: [answerSignal.questionId],
        priority: 'high',
      });
    }
  }

  // Contradiction probes
  for (const contradiction of signals.contradictions) {
    targets.push({
      category: 'contradiction',
      description: `Potential contradiction: ${contradiction.pattern}`,
      evidence: `"${contradiction.evidence.text1}" vs "${contradiction.evidence.text2}"`,
      suggestedApproach: 'Ask the user to clarify which approach they want, or explain how both can coexist',
      relatedAnswerIds: [contradiction.answerId1, contradiction.answerId2],
      priority: contradiction.severity === 'definite' ? 'high' : 'medium',
    });
  }

  // Assumption probes
  for (const assumption of signals.assumptions) {
    targets.push({
      category: 'assumption',
      description: assumption.assumption,
      evidence: `Detected in ${assumption.source}`,
      suggestedApproach: 'Surface this assumption and ask if it was intentional',
      relatedAnswerIds: assumption.sourceId ? [assumption.sourceId] : [],
      priority: assumption.confidence === 'definite' ? 'high' : 'medium',
    });
  }

  // Gap probes (for critical gaps)
  for (const gap of signals.coverageGaps) {
    if (gap.priority === 'critical') {
      targets.push({
        category: 'gap',
        description: gap.reason,
        evidence: `${gap.questionType} area has no coverage`,
        suggestedApproach: `Ask open-ended questions about ${gap.questionType}`,
        relatedAnswerIds: [],
        priority: 'high',
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  targets.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return targets;
}

/**
 * Suggest how to probe vague answers
 */
function suggestVaguenessApproach(indicators: VaguenessIndicator[]): string {
  const types = new Set(indicators.map(i => i.type));

  if (types.has('generic-term')) {
    return 'Ask for specific examples or concrete details instead of generic terms';
  }
  if (types.has('hedging')) {
    return 'Press for a definite decision or the criteria for making one';
  }
  if (types.has('short-answer')) {
    return 'Ask follow-up questions to understand the full picture';
  }
  if (types.has('deferral')) {
    return 'Probe why the decision is being deferred and what information is needed';
  }
  if (types.has('no-specifics')) {
    return 'Ask for measurable criteria, numbers, or concrete examples';
  }

  return 'Ask for more specific details';
}

/**
 * Build context for the calling LLM
 */
function buildContext(
  epic: Epic,
  session: InterrogationSession,
  signals: InterrogationSignals
): InterrogationContext {
  return {
    epic: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
    },
    previousAnswers: organizeAnswers(session),
    detectedStack: signals.detectedStack,
    round: session.round,
  };
}

/**
 * Assess readiness for spec generation
 */
function assessReadiness(
  _session: InterrogationSession,
  signals: InterrogationSignals
): ReadinessAssessment {
  const blockers: string[] = [];

  // Check critical coverage
  const criticalTypes: QuestionType[] = ['scope', 'success', 'constraint'];
  for (const type of criticalTypes) {
    if (!signals.answeredTypes.includes(type)) {
      blockers.push(`No ${type} questions answered`);
    }
  }

  // Check for high-severity issues
  const highVagueness = signals.answerSignals.filter(
    s => s.vaguenessIndicators.some(v => v.severity === 'high')
  ).length;
  if (highVagueness > 0) {
    blockers.push(`${highVagueness} answers contain high-severity vagueness`);
  }

  const definiteContradictions = signals.contradictions.filter(
    c => c.severity === 'definite'
  ).length;
  if (definiteContradictions > 0) {
    blockers.push(`${definiteContradictions} definite contradictions unresolved`);
  }

  // Calculate scores
  const totalTypes = 7; // scope, success, constraint, technical, risk, stakeholder, timeline
  const completenessScore = Math.round(
    (signals.answeredTypes.length / totalTypes) * 100
  );

  // Clarity based on vagueness ratio
  const vagueRatio = signals.metrics.totalAnswers > 0
    ? signals.metrics.vagueAnswerCount / signals.metrics.totalAnswers
    : 0;
  const clarityScore = Math.round((1 - vagueRatio) * 100);

  const isReady = blockers.length === 0 && clarityScore >= 70 && completenessScore >= 70;

  // Escape hatch: can force ready if clarity >= 80
  const canForceReady = clarityScore >= 80 && signals.answeredTypes.length >= 3;
  const forceReadyReason = canForceReady
    ? `Clarity score (${clarityScore}%) is high enough to proceed despite blockers`
    : undefined;

  return {
    isReady,
    clarityScore,
    completenessScore,
    blockers,
    canForceReady,
    forceReadyReason,
  };
}

/**
 * Build instructions for the calling LLM
 */
function buildInstructions(
  focusAreas: FocusArea[],
  probeTargets: ProbeTarget[],
  signals: InterrogationSignals,
  readiness: ReadinessAssessment
): string {
  const parts: string[] = [];

  parts.push(`## Interrogation Analysis

You have received the detection signals from Elenchus. Your job is to conduct
Socratic interrogation - asking probing questions that drive toward clarity.`);

  // Status summary
  parts.push(`
### Current Status
- **Answers received**: ${signals.metrics.totalAnswers}
- **Clarity score**: ${readiness.clarityScore}%
- **Completeness score**: ${readiness.completenessScore}%
- **Ready for spec**: ${readiness.isReady ? 'Yes' : 'No'}
${readiness.blockers.length > 0 ? `- **Blockers**: ${readiness.blockers.join(', ')}` : ''}`);

  // Priority probes
  if (probeTargets.length > 0) {
    parts.push(`
### Priority Issues to Address

These require your attention:`);

    const highPriority = probeTargets.filter(t => t.priority === 'high').slice(0, 5);
    for (const target of highPriority) {
      parts.push(`
**${target.category.toUpperCase()}**: ${target.description}
- Evidence: ${target.evidence}
- Approach: ${target.suggestedApproach}`);
    }
  }

  // Focus areas
  if (focusAreas.length > 0) {
    parts.push(`
### Areas Needing Depth
${focusAreas.map(a => `- **${a.type}** (${a.priority}): ${a.reason}`).join('\n')}`);
  }

  // Stack context
  if (signals.detectedStack.length > 0) {
    parts.push(`
### Detected Technology Stack
${signals.detectedStack.join(', ')}`);
  }

  // Socratic guidance
  parts.push(`
### Socratic Questioning Guidelines

1. **Challenge vagueness**: When answers use words like "stuff", "things", "maybe" -
   ask for specific examples or measurable criteria.

2. **Surface contradictions**: When you detect conflicting statements, don't ignore them.
   Ask the user to clarify which approach they want.

3. **Probe assumptions**: When users make implicit assumptions (e.g., "users" without
   mentioning "guests"), ask if this was intentional.

4. **Go deeper on critical areas**: Scope, success criteria, and constraints must be
   crystal clear before generating a spec.

5. **Don't ask template questions**: Use the context from previous answers to formulate
   specific, targeted follow-ups.`);

  // Next steps
  if (readiness.isReady) {
    parts.push(`
### Next Step
The interrogation appears ready for specification generation. You can call
\`elenchus_generate_spec\` to proceed.`);
  } else if (readiness.canForceReady) {
    parts.push(`
### Next Step
${readiness.forceReadyReason}
You may call \`elenchus_interrogate\` with \`forceReady: true\` to proceed.`);
  } else {
    parts.push(`
### Next Step
Continue interrogation. Ask 2-4 targeted questions addressing the priority issues above.
Then submit answers via \`elenchus_answer\` and call \`elenchus_interrogate\` again.`);
  }

  return parts.join('\n');
}

/**
 * Main V2 interrogation function
 */
export function runInterrogationV2(
  epic: Epic,
  session: InterrogationSession
): InterrogationResultV2 {
  // Detect signals
  const signals = detectSignals(epic, session.questions, session.answers);

  // Generate guidance
  const guidance = generateGuidance(epic, session, signals);

  // Update session scores based on signals
  session.clarityScore = guidance.readinessAssessment.clarityScore;
  session.completenessScore = guidance.readinessAssessment.completenessScore;
  session.readyForSpec = guidance.readinessAssessment.isReady;
  session.blockers = guidance.readinessAssessment.blockers;

  return {
    session,
    signals,
    guidance,
  };
}
