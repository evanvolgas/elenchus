/**
 * Tier-Based Interrogation Type System
 *
 * Implements progressive refinement through quality-aware interrogation.
 * Instead of fixed question counts, we assess answer quality and depth,
 * moving through tiers from foundation to validation.
 *
 * Tier 1 (Foundation): Get basic facts - who, what, why
 * Tier 2 (Extract): Pull out concrete requirements, metrics, entities
 * Tier 3 (Target): Address gaps and tensions with focused questions
 * Tier 4 (Refine): Resolve ambiguities and edge cases
 * Tier 5 (Validate): Confirm completeness and consistency
 */

import { z } from 'zod';

// =============================================================================
// Quality Tier Types
// =============================================================================

/**
 * Quality tier determines interrogation strategy.
 *
 * Not a simple score - it's a measure of specification maturity:
 * - Tier 1: Vague, missing basics (need foundation questions)
 * - Tier 2: Has basics but lacks depth (need extraction)
 * - Tier 3: Good coverage but has gaps (need targeted questions)
 * - Tier 4: Detailed but has edge cases (need refinement)
 * - Tier 5: Complete and consistent (need validation only)
 */
export const QualityTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type QualityTier = z.infer<typeof QualityTierSchema>;

/**
 * Interrogation strategy determines what kind of questions to ask
 */
export const InterrogationStrategySchema = z.enum([
  'foundation',  // Tier 1: Basic who/what/why questions
  'extract',     // Tier 2: Pull out concrete requirements
  'target',      // Tier 3: Address specific gaps/tensions
  'refine',      // Tier 4: Resolve ambiguities
  'validate',    // Tier 5: Confirm completeness
]);
export type InterrogationStrategy = z.infer<typeof InterrogationStrategySchema>;

/**
 * Maps quality tiers to interrogation strategies
 */
export const TIER_TO_STRATEGY: Record<QualityTier, InterrogationStrategy> = {
  1: 'foundation',
  2: 'extract',
  3: 'target',
  4: 'refine',
  5: 'validate',
};

// =============================================================================
// Specificity Metrics - What We Measure
// =============================================================================

/**
 * Binary checks for requirement coverage
 */
export const BinaryCheckSchema = z.object({
  hasQuantifiableGoals: z.boolean(),
  hasDefinedScope: z.boolean(),
  hasSuccessCriteria: z.boolean(),
  hasConstraints: z.boolean(),
  hasRisks: z.boolean(),
  hasTechnicalDecisions: z.boolean(),
  hasUserPersonas: z.boolean(),
  hasPerformanceTargets: z.boolean(),
  hasSecurityRequirements: z.boolean(),
  hasIntegrationPoints: z.boolean(),
});
export type BinaryCheck = z.infer<typeof BinaryCheckSchema>;

/**
 * Depth score (1-5) for different aspects
 */
export const DepthScoreSchema = z.object({
  goalSpecificity: z.number().min(1).max(5),
  scopeSpecificity: z.number().min(1).max(5),
  criteriaSpecificity: z.number().min(1).max(5),
  constraintSpecificity: z.number().min(1).max(5),
  technicalSpecificity: z.number().min(1).max(5),
  riskSpecificity: z.number().min(1).max(5),
});
export type DepthScore = z.infer<typeof DepthScoreSchema>;

/**
 * Coverage analysis - which areas are addressed
 */
export const CoverageAreaSchema = z.enum([
  'scope',
  'success',
  'constraint',
  'risk',
  'technical',
  'users',
  'performance',
  'security',
  'integration',
  'data',
]);
export type CoverageArea = z.infer<typeof CoverageAreaSchema>;

export const CoverageAnalysisSchema = z.object({
  explicit: z.array(CoverageAreaSchema),    // Clearly stated
  implicit: z.array(CoverageAreaSchema),    // Implied but not stated
  missing: z.array(CoverageAreaSchema),     // Not addressed at all
  contradictory: z.array(CoverageAreaSchema), // Conflicting statements
});
export type CoverageAnalysis = z.infer<typeof CoverageAnalysisSchema>;

/**
 * Signal counts by type and severity
 */
export const SignalCountsSchema = z.object({
  totalSignals: z.number(),
  criticalGaps: z.number(),
  highSeverityTensions: z.number(),
  unvalidatedAssumptions: z.number(),
  explicitClaims: z.number(),
  addressedSignals: z.number(),
  unaddressedSignals: z.number(),
});
export type SignalCounts = z.infer<typeof SignalCountsSchema>;

/**
 * Complete specificity metrics for tier determination
 */
export const SpecificityMetricsSchema = z.object({
  binaryChecks: BinaryCheckSchema,
  depthScores: DepthScoreSchema,
  coverage: CoverageAnalysisSchema,
  signals: SignalCountsSchema,
  averageAnswerQuality: z.number().min(1).max(5),
  totalQuestionsAnswered: z.number(),
  computedAt: z.string().datetime(),
});
export type SpecificityMetrics = z.infer<typeof SpecificityMetricsSchema>;

// =============================================================================
// Extracted Facts - Semantic Extraction
// =============================================================================

/**
 * Type of extracted fact
 */
export const ExtractedFactTypeSchema = z.enum([
  'metric',       // Numeric measurement (response time, user count, etc.)
  'threshold',    // Limit or boundary (max file size, timeout, etc.)
  'constraint',   // Hard requirement or limitation
  'entity',       // Domain object (User, Product, Order, etc.)
  'relationship', // How entities relate (User has Orders, etc.)
  'decision',     // Explicit choice made (use PostgreSQL, etc.)
  'rule',         // Business rule (admins can delete, etc.)
  'flow',         // Process or workflow step
]);
export type ExtractedFactType = z.infer<typeof ExtractedFactTypeSchema>;

/**
 * A fact extracted from a user's answer
 *
 * Facts are concrete, verifiable statements that can be used to build
 * requirements. Unlike raw answers, facts are normalized and structured.
 */
export const ExtractedFactSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: ExtractedFactTypeSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().optional(), // For metrics: 'ms', 'MB', 'users', etc.
  context: z.string(), // Where/why this fact matters
  sourceAnswerId: z.string(),
  confidence: z.number().min(0).max(1), // 0-1 confidence in extraction
  relatedFactIds: z.array(z.string()).default([]), // Facts that relate to this one
  extractedAt: z.string().datetime(),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

// =============================================================================
// Hierarchical Requirements - Not Flat Arrays
// =============================================================================

/**
 * Requirement category
 */
export const RequirementCategorySchema = z.enum([
  'functional',    // What the system does
  'performance',   // How fast/efficient it is
  'security',      // How it protects data/access
  'ux',            // User experience requirements
  'integration',   // External system connections
  'constraint',    // Limitations and boundaries
  'quality',       // Code quality, maintainability
  'operational',   // Deployment, monitoring, etc.
]);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

/**
 * Requirement priority (MoSCoW method)
 */
export const RequirementPrioritySchema = z.enum([
  'must',   // Non-negotiable
  'should', // Important but has workarounds
  'could',  // Nice to have
  'wont',   // Explicitly out of scope
]);
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

/**
 * Certainty level of a requirement
 */
export const RequirementCertaintySchema = z.enum([
  'certain',    // Explicitly stated and confirmed
  'likely',     // Strongly implied or inferred
  'uncertain',  // Mentioned but needs clarification
  'unknown',    // Not addressed yet
]);
export type RequirementCertainty = z.infer<typeof RequirementCertaintySchema>;

/**
 * Acceptance test for a requirement (simpler than spec.ts version)
 */
export const RequirementTestSchema = z.object({
  id: z.string(),
  description: z.string(),
  testable: z.boolean(), // Can this be objectively verified?
  metrics: z.array(z.string()).default([]), // IDs of related ExtractedFacts
  createdAt: z.string().datetime(),
});
export type RequirementTest = z.infer<typeof RequirementTestSchema>;

/**
 * A hierarchical requirement
 *
 * Requirements form a tree:
 * - Top-level: Major features or capabilities
 * - Children: Specific aspects or sub-requirements
 *
 * Example:
 * - "User authentication" (parent)
 *   - "Email/password login" (child)
 *   - "OAuth integration" (child)
 *   - "Password reset flow" (child)
 */
export const RequirementSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  category: RequirementCategorySchema,
  description: z.string(),
  priority: RequirementPrioritySchema,
  certainty: RequirementCertaintySchema,

  // Hierarchy
  parentId: z.string().optional(),
  childIds: z.array(z.string()).default([]),
  depth: z.number().min(0), // 0 = top-level, 1 = child, etc.

  // Evidence
  tests: z.array(RequirementTestSchema).default([]),
  factIds: z.array(z.string()).default([]), // ExtractedFact IDs supporting this
  sourceAnswerIds: z.array(z.string()).default([]), // Answers that led to this requirement

  // Traceability
  addressesSignalIds: z.array(z.string()).default([]), // Signals this resolves
  conflictsWith: z.array(z.string()).default([]), // Other requirement IDs that conflict

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

// =============================================================================
// Tier-Specific Question Templates
// =============================================================================

/**
 * Question focus area
 */
export const QuestionFocusSchema = z.enum([
  'scope',
  'success',
  'constraint',
  'risk',
  'technical',
  'users',
  'performance',
  'security',
  'integration',
  'edge-case',
  'clarification',
]);
export type QuestionFocus = z.infer<typeof QuestionFocusSchema>;

/**
 * Template for generating tier-specific questions
 */
export const QuestionTemplateSchema = z.object({
  id: z.string(),
  tier: QualityTierSchema,
  strategy: InterrogationStrategySchema,
  focus: QuestionFocusSchema,
  template: z.string(), // Template with {placeholders}
  priority: z.number().min(1).max(10), // 10 = ask first
  conditions: z.object({
    requiresMissing: z.array(CoverageAreaSchema).optional(),
    requiresLowScore: z.array(z.string()).optional(), // Depth score keys
    requiresSignalType: z.array(z.string()).optional(), // Signal types
  }).optional(),
  exampleQuestion: z.string(),
});
export type QuestionTemplate = z.infer<typeof QuestionTemplateSchema>;

/**
 * Predefined question templates by tier
 */
export const TIER_TEMPLATES: Record<InterrogationStrategy, QuestionTemplate[]> = {
  foundation: [
    {
      id: 'found-1',
      tier: 1,
      strategy: 'foundation',
      focus: 'scope',
      template: 'Who will use this system and what are their primary goals?',
      priority: 10,
      exampleQuestion: 'Who will use this system and what are their primary goals?',
    },
    {
      id: 'found-2',
      tier: 1,
      strategy: 'foundation',
      focus: 'success',
      template: 'How will you know if this is successful? What are the key outcomes?',
      priority: 9,
      exampleQuestion: 'How will you know if this is successful? What are the key outcomes?',
    },
    {
      id: 'found-3',
      tier: 1,
      strategy: 'foundation',
      focus: 'constraint',
      template: 'What are the main constraints or limitations (time, budget, technology, compliance)?',
      priority: 8,
      exampleQuestion: 'What are the main constraints or limitations (time, budget, technology, compliance)?',
    },
    {
      id: 'found-4',
      tier: 1,
      strategy: 'foundation',
      focus: 'scope',
      template: 'What is explicitly OUT of scope for this project?',
      priority: 7,
      exampleQuestion: 'What is explicitly OUT of scope for this project?',
    },
  ],
  extract: [
    {
      id: 'ext-1',
      tier: 2,
      strategy: 'extract',
      focus: 'performance',
      template: 'What are the specific performance requirements (response time, throughput, load)?',
      priority: 9,
      conditions: { requiresMissing: ['performance'] },
      exampleQuestion: 'What are the specific performance requirements (response time, throughput, load)?',
    },
    {
      id: 'ext-2',
      tier: 2,
      strategy: 'extract',
      focus: 'security',
      template: 'What security and access control requirements must be met?',
      priority: 9,
      conditions: { requiresMissing: ['security'] },
      exampleQuestion: 'What security and access control requirements must be met?',
    },
    {
      id: 'ext-3',
      tier: 2,
      strategy: 'extract',
      focus: 'integration',
      template: 'What external systems or APIs will this integrate with?',
      priority: 8,
      conditions: { requiresMissing: ['integration'] },
      exampleQuestion: 'What external systems or APIs will this integrate with?',
    },
    {
      id: 'ext-4',
      tier: 2,
      strategy: 'extract',
      focus: 'users',
      template: 'Can you describe the specific user roles and their permissions?',
      priority: 7,
      conditions: { requiresLowScore: ['scopeSpecificity'] },
      exampleQuestion: 'Can you describe the specific user roles and their permissions?',
    },
  ],
  target: [
    {
      id: 'tgt-1',
      tier: 3,
      strategy: 'target',
      focus: 'edge-case',
      template: 'What should happen when {specific_scenario}?',
      priority: 8,
      exampleQuestion: 'What should happen when a user tries to access a deleted resource?',
    },
    {
      id: 'tgt-2',
      tier: 3,
      strategy: 'target',
      focus: 'clarification',
      template: 'You mentioned {claim}, but also {tension}. How should these be reconciled?',
      priority: 9,
      conditions: { requiresSignalType: ['tension'] },
      exampleQuestion: 'You mentioned "fast response times" but also "complex analytics". How should these be balanced?',
    },
    {
      id: 'tgt-3',
      tier: 3,
      strategy: 'target',
      focus: 'risk',
      template: 'What could go wrong with {specific_feature} and how should it be mitigated?',
      priority: 7,
      exampleQuestion: 'What could go wrong with the payment processing flow and how should it be mitigated?',
    },
  ],
  refine: [
    {
      id: 'ref-1',
      tier: 4,
      strategy: 'refine',
      focus: 'clarification',
      template: 'For {ambiguous_requirement}, what is the exact threshold or boundary?',
      priority: 8,
      exampleQuestion: 'For "fast search", what is the exact maximum acceptable response time?',
    },
    {
      id: 'ref-2',
      tier: 4,
      strategy: 'refine',
      focus: 'edge-case',
      template: 'How should the system handle {edge_case} if {condition}?',
      priority: 7,
      exampleQuestion: 'How should the system handle concurrent updates if two users edit the same record?',
    },
    {
      id: 'ref-3',
      tier: 4,
      strategy: 'refine',
      focus: 'technical',
      template: 'What are the specific technical requirements for {technical_aspect}?',
      priority: 6,
      exampleQuestion: 'What are the specific technical requirements for data backup and recovery?',
    },
  ],
  validate: [
    {
      id: 'val-1',
      tier: 5,
      strategy: 'validate',
      focus: 'success',
      template: 'Have we covered all critical success criteria? Is anything missing?',
      priority: 10,
      exampleQuestion: 'Have we covered all critical success criteria? Is anything missing?',
    },
    {
      id: 'val-2',
      tier: 5,
      strategy: 'validate',
      focus: 'scope',
      template: 'Looking at the full scope, are there any conflicts or inconsistencies?',
      priority: 9,
      exampleQuestion: 'Looking at the full scope, are there any conflicts or inconsistencies?',
    },
    {
      id: 'val-3',
      tier: 5,
      strategy: 'validate',
      focus: 'risk',
      template: 'What is the biggest risk we haven\'t adequately addressed?',
      priority: 8,
      exampleQuestion: 'What is the biggest risk we haven\'t adequately addressed?',
    },
  ],
};

// =============================================================================
// Quality Assessment Result
// =============================================================================

/**
 * Blocker preventing spec generation
 */
export const SpecBlockerSchema = z.object({
  type: z.enum(['missing_critical', 'low_quality', 'unresolved_conflict', 'insufficient_coverage']),
  severity: z.enum(['critical', 'high', 'medium']),
  description: z.string(),
  affectedAreas: z.array(CoverageAreaSchema),
  suggestedQuestions: z.array(z.string()),
});
export type SpecBlocker = z.infer<typeof SpecBlockerSchema>;

/**
 * Complete quality assessment result
 */
export const QualityAssessmentSchema = z.object({
  sessionId: z.string(),
  currentTier: QualityTierSchema,
  targetTier: QualityTierSchema, // Usually 5, but can be lower if user is satisfied
  recommendedStrategy: InterrogationStrategySchema,

  // Metrics that determined the tier
  metrics: SpecificityMetricsSchema,

  // Requirements extracted so far
  requirementCount: z.number(),
  factCount: z.number(),

  // Readiness assessment
  readyForSpec: z.boolean(),
  blockers: z.array(SpecBlockerSchema).default([]),
  confidence: z.number().min(0).max(1), // 0-1 confidence in assessment

  // Next steps
  suggestedQuestions: z.array(z.string()),
  estimatedQuestionsRemaining: z.number(),

  // Metadata
  assessedAt: z.string().datetime(),
});
export type QualityAssessment = z.infer<typeof QualityAssessmentSchema>;

/**
 * Input for requesting quality assessment
 */
export const AssessQualityInputSchema = z.object({
  sessionId: z.string(),
  targetTier: QualityTierSchema.optional(), // Default: 5
  forceAssessment: z.boolean().optional(), // Assess even if recently assessed
});
export type AssessQualityInput = z.infer<typeof AssessQualityInputSchema>;

// =============================================================================
// Tier Progression Tracking
// =============================================================================

/**
 * Snapshot of quality at a point in time
 */
export const TierSnapshotSchema = z.object({
  tier: QualityTierSchema,
  metrics: SpecificityMetricsSchema,
  questionCount: z.number(),
  answerCount: z.number(),
  timestamp: z.string().datetime(),
});
export type TierSnapshot = z.infer<typeof TierSnapshotSchema>;

/**
 * Progression history for a session
 */
export const TierProgressionSchema = z.object({
  sessionId: z.string(),
  startingTier: QualityTierSchema,
  currentTier: QualityTierSchema,
  snapshots: z.array(TierSnapshotSchema),
  tiersAchieved: z.array(QualityTierSchema), // Tiers reached during session
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TierProgression = z.infer<typeof TierProgressionSchema>;

// =============================================================================
// Utility Functions and Constants
// =============================================================================

/**
 * Minimum thresholds for each tier
 */
export const TIER_THRESHOLDS = {
  1: {
    minQuestions: 0,
    minAverageQuality: 0,
    minCoverage: 0,
    description: 'Starting point - need foundation',
  },
  2: {
    minQuestions: 3,
    minAverageQuality: 2.0,
    minCoverage: 0.3, // 30% of areas covered
    description: 'Basic understanding established',
  },
  3: {
    minQuestions: 6,
    minAverageQuality: 3.0,
    minCoverage: 0.6, // 60% of areas covered
    description: 'Good coverage, addressing gaps',
  },
  4: {
    minQuestions: 10,
    minAverageQuality: 4.0,
    minCoverage: 0.8, // 80% of areas covered
    description: 'Detailed specification, refining edge cases',
  },
  5: {
    minQuestions: 12,
    minAverageQuality: 4.5,
    minCoverage: 0.9, // 90% of areas covered
    description: 'Complete and consistent specification',
  },
} as const;

/**
 * Get the strategy for a given tier
 */
export function getStrategyForTier(tier: QualityTier): InterrogationStrategy {
  return TIER_TO_STRATEGY[tier];
}

/**
 * Get question templates for a strategy
 */
export function getTemplatesForStrategy(strategy: InterrogationStrategy): QuestionTemplate[] {
  return TIER_TEMPLATES[strategy];
}

/**
 * Check if metrics meet tier threshold
 */
export function meetsTierThreshold(tier: QualityTier, metrics: SpecificityMetrics): boolean {
  const threshold = TIER_THRESHOLDS[tier];
  const coverageRatio = metrics.coverage.explicit.length /
    (metrics.coverage.explicit.length + metrics.coverage.missing.length);

  return (
    metrics.totalQuestionsAnswered >= threshold.minQuestions &&
    metrics.averageAnswerQuality >= threshold.minAverageQuality &&
    coverageRatio >= threshold.minCoverage
  );
}

/**
 * Determine current tier from metrics
 */
export function determineTier(metrics: SpecificityMetrics): QualityTier {
  // Check from highest to lowest tier
  for (let tier = 5; tier >= 1; tier--) {
    if (meetsTierThreshold(tier as QualityTier, metrics)) {
      return tier as QualityTier;
    }
  }
  return 1; // Default to tier 1
}
