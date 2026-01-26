/**
 * Signal Detection and Answer Evaluation Types
 *
 * Types for the smart interrogation system that tracks:
 * - Signals extracted from epics (claims, gaps, tensions, assumptions)
 * - Answer quality evaluations (1-5 specificity scores)
 * - Conflicts between contradictory answers
 */

import { z } from 'zod';

// =============================================================================
// Signal Types - Extracted from Epic Analysis
// =============================================================================

/**
 * Types of signals that can be detected in an epic
 */
export const SignalTypeSchema = z.enum(['claim', 'gap', 'tension', 'assumption']);
export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Severity levels for signals
 */
export const SignalSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/**
 * A signal detected in an epic through LLM analysis
 *
 * - claim: Explicit statement about what the system should do
 * - gap: Important aspect not mentioned (error handling, auth, scale, etc.)
 * - tension: Requirements that might conflict with each other
 * - assumption: Things taken for granted that should be verified
 */
export const SignalSchema = z.object({
  id: z.string(),
  epicId: z.string(),
  type: SignalTypeSchema,
  content: z.string(),
  quote: z.string().optional(), // Quote from epic if applicable
  severity: SignalSeveritySchema,
  addressed: z.boolean().default(false),
  addressedBy: z.string().optional(), // answerId that addressed this signal
  createdAt: z.string(),
});
export type Signal = z.infer<typeof SignalSchema>;

/**
 * Input for storing signals (from Claude's analysis)
 */
export const StoreSignalsInputSchema = z.object({
  epicId: z.string(),
  signals: z.array(z.object({
    type: SignalTypeSchema,
    content: z.string(),
    quote: z.string().optional(),
    severity: SignalSeveritySchema,
  })),
});
export type StoreSignalsInput = z.infer<typeof StoreSignalsInputSchema>;

// =============================================================================
// Answer Evaluation Types
// =============================================================================

/**
 * Specificity score for an answer (1-5)
 *
 * 1 = Completely vague ("it should work", "yes")
 * 2 = Somewhat vague ("it should be fast", "users")
 * 3 = Partially specific ("response under 1 second", "admins and regular users")
 * 4 = Mostly specific ("search returns <200ms for up to 100k records")
 * 5 = Fully specific with edge cases addressed
 */
export const SpecificityScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type SpecificityScore = z.infer<typeof SpecificityScoreSchema>;

/**
 * Evaluation of an answer's quality
 */
export const AnswerEvaluationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  answerId: z.string(),
  score: SpecificityScoreSchema,
  reasoning: z.string(),
  followUp: z.string().optional(), // Suggested follow-up question if score < 4
  addressesSignals: z.array(z.string()).default([]), // Signal IDs this answer addresses
  evaluatedAt: z.string(),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

/**
 * Input for storing evaluations (from Claude's evaluation)
 */
export const StoreEvaluationsInputSchema = z.object({
  sessionId: z.string(),
  evaluations: z.array(z.object({
    answerId: z.string(),
    score: SpecificityScoreSchema,
    reasoning: z.string(),
    followUp: z.string().optional(),
    addressesSignals: z.array(z.string()).optional(),
  })),
  conflicts: z.array(z.object({
    answerIds: z.tuple([z.string(), z.string()]),
    description: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
  })).optional(),
});
export type StoreEvaluationsInput = z.infer<typeof StoreEvaluationsInputSchema>;

// =============================================================================
// Conflict Types
// =============================================================================

/**
 * Conflict severity
 */
export const ConflictSeveritySchema = z.enum(['high', 'medium', 'low']);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

/**
 * A detected conflict between two answers
 */
export const ConflictSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  answerIds: z.tuple([z.string(), z.string()]),
  description: z.string(),
  severity: ConflictSeveritySchema,
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),
  resolvedAt: z.string().optional(),
  createdAt: z.string(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

/**
 * Decision type for conflict resolution
 */
export const ConflictResolutionDecisionSchema = z.enum([
  'keep_both',      // Both are valid in different contexts
  'supersede_first', // Second answer supersedes the first
  'supersede_second', // First answer supersedes the second
  'clarify',        // User provided clarification that resolves the conflict
]);
export type ConflictResolutionDecision = z.infer<typeof ConflictResolutionDecisionSchema>;

/**
 * Input for resolving a conflict
 */
export const ResolveConflictInputSchema = z.object({
  sessionId: z.string(),
  conflictId: z.string(),
  resolution: z.string(),
  decision: ConflictResolutionDecisionSchema,
  notes: z.string().optional(),
});
export type ResolveConflictInput = z.infer<typeof ResolveConflictInputSchema>;

// =============================================================================
// Quality Metrics and Advisory
// =============================================================================

/**
 * Issue identified during quality assessment
 */
export const QualityIssueSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  issue: z.string(),
  suggestion: z.string(),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

/**
 * Advisory output for readiness assessment
 */
export const ReadinessAdvisorySchema = z.object({
  recommendation: z.string(),
  issues: z.array(QualityIssueSchema),
  canForce: z.boolean(),
  forceWarning: z.string(),
});
export type ReadinessAdvisory = z.infer<typeof ReadinessAdvisorySchema>;

/**
 * Quality metrics for a session
 */
export const QualityMetricsSchema = z.object({
  averageScore: z.number(),
  lowQualityCount: z.number(), // Answers with score < 3
  highQualityCount: z.number(), // Answers with score >= 4
  totalEvaluated: z.number(),
  unresolvedConflicts: z.number(),
  unaddressedCriticalSignals: z.number(),
  readyForSpec: z.boolean(),
  advisory: ReadinessAdvisorySchema.optional(),
});
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

// =============================================================================
// Premise Types - For True Socratic Elenchus
// =============================================================================

/**
 * A premise is a logical commitment extracted from an answer.
 *
 * Unlike Q&A pairs which track questions/answers, premises track the logical
 * statements the user has committed to. These can then be checked for
 * contradictions (the core of Socratic elenchus).
 *
 * Example: If user answers "All users can export data", the premise is:
 * "All users have export access"
 */
export const PremiseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  statement: z.string(),          // The logical commitment
  extractedFrom: z.string(),      // answerId that this was extracted from
  type: z.enum([
    'capability',     // "Users can X"
    'constraint',     // "System must not X"
    'requirement',    // "X is required"
    'assumption',     // "Assuming X is true"
    'preference',     // "We prefer X"
  ]),
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
  createdAt: z.string(),
});
export type Premise = z.infer<typeof PremiseSchema>;

/**
 * A contradiction between two or more premises.
 *
 * This is the core of Socratic elenchus: detecting when the user has
 * committed to premises that cannot all be true simultaneously.
 */
export const ContradictionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  premiseIds: z.array(z.string()).min(2), // At least 2 premises must conflict
  description: z.string(),               // Why they conflict
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),     // How it was resolved
  resolvedAt: z.string().optional(),
  createdAt: z.string(),
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

/**
 * Aporia state - the productive state of puzzlement in Socratic dialogue.
 *
 * When contradictions are detected and acknowledged, the user reaches
 * aporia - recognizing that their initial beliefs were inconsistent.
 * This is where real specification improvement happens.
 */
export const AporiaSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  contradictionId: z.string(),
  recognized: z.boolean(),              // Has user acknowledged the contradiction?
  refinedStatement: z.string().optional(), // What emerged from the aporia
  createdAt: z.string(),
});
export type Aporia = z.infer<typeof AporiaSchema>;
