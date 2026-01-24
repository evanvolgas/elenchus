import { z } from 'zod';
import { CodebaseContextSchema } from './context.js';

/**
 * Success metric definition
 */
export const MetricSchema = z.object({
  name: z.string(),
  description: z.string(),
  target: z.string(),
  measurement: z.string(), // How to measure it
  priority: z.enum(['primary', 'secondary']),
});

export type Metric = z.infer<typeof MetricSchema>;

/**
 * Constraint definition
 */
export const ConstraintSchema = z.object({
  type: z.enum(['technical', 'business', 'security', 'performance', 'compliance']),
  description: z.string(),
  rationale: z.string().optional(),
  source: z.string().optional(), // Where this constraint came from
});

export type Constraint = z.infer<typeof ConstraintSchema>;

/**
 * External integration
 */
export const IntegrationSchema = z.object({
  name: z.string(),
  type: z.enum(['api', 'database', 'service', 'library', 'other']),
  description: z.string(),
  authentication: z.string().optional(),
  documentation: z.string().optional(),
  constraints: z.array(z.string()),
});

export type Integration = z.infer<typeof IntegrationSchema>;

/**
 * Acceptance criterion
 */
export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.string(),
  priority: z.enum(['must-have', 'should-have', 'nice-to-have']),
  testable: z.boolean(),
  automatable: z.boolean(),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/**
 * Task types for execution
 */
export const TaskTypeSchema = z.enum([
  'research',     // Gather information
  'design',       // Architecture/design work
  'implement',    // Write code
  'test',         // Write/run tests
  'review',       // Code review
  'document',     // Write documentation
  'integrate',    // Integration work
  'deploy'        // Deployment
]);

export type TaskType = z.infer<typeof TaskTypeSchema>;

/**
 * Individual task in execution plan
 */
export const TaskSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  description: z.string(),

  // Agent assignment
  agentType: z.string(),
  agentModel: z.enum(['haiku', 'sonnet', 'opus']).optional(),

  // Scope
  files: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  constraints: z.array(z.string()),

  // Dependencies
  dependsOn: z.array(z.string()), // Other task IDs

  // Estimation
  estimatedTokens: z.number().optional(),
  estimatedMinutes: z.number().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Execution phase
 */
export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),

  // Tasks in this phase
  tasks: z.array(TaskSchema),

  // Execution
  parallel: z.boolean().default(false), // Can tasks run in parallel?
  dependencies: z.array(z.string()), // Other phase IDs

  // Checkpoint
  checkpointAfter: z.boolean().default(false),
  checkpointReason: z.string().optional(),

  // Estimation
  estimatedDurationMinutes: z.number().optional(),
  estimatedCost: z.number().optional(),
});

export type Phase = z.infer<typeof PhaseSchema>;

/**
 * Risk assessment
 */
export const RiskSchema = z.object({
  id: z.string(),
  description: z.string(),
  likelihood: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['low', 'medium', 'high', 'critical']),
  mitigation: z.string(),
  contingency: z.string().optional(),
});

export type Risk = z.infer<typeof RiskSchema>;

/**
 * Test strategy
 */
export const TestStrategySchema = z.object({
  unitTests: z.boolean(),
  integrationTests: z.boolean(),
  e2eTests: z.boolean(),
  coverageTarget: z.number().min(0).max(100),
  testFramework: z.string().optional(),
  notes: z.array(z.string()),
});

export type TestStrategy = z.infer<typeof TestStrategySchema>;

/**
 * Cost estimate
 */
export const CostEstimateSchema = z.object({
  totalTokens: z.number(),
  estimatedCostUSD: z.number(),
  breakdown: z.record(z.number()), // Phase -> cost
  confidence: z.enum(['low', 'medium', 'high']),
});

export type CostEstimate = z.infer<typeof CostEstimateSchema>;

/**
 * Duration estimate
 */
export const DurationEstimateSchema = z.object({
  totalMinutes: z.number(),
  breakdown: z.record(z.number()), // Phase -> minutes
  parallelizable: z.number(), // Minutes that can be parallelized
  confidence: z.enum(['low', 'medium', 'high']),
});

export type DurationEstimate = z.infer<typeof DurationEstimateSchema>;

/**
 * Checkpoint definition
 */
export const CheckpointSchema = z.object({
  id: z.string(),
  type: z.enum([
    'pre-spec',        // Before generating spec
    'post-research',   // After research phase
    'post-architecture', // After architecture phase
    'post-implementation', // After implementation
    'pre-delivery'     // Before final delivery
  ]),
  phase: z.string(),
  required: z.boolean(),
  autoApprove: z.boolean().default(false),
  description: z.string(),

  // What to present at this checkpoint
  artifactTypes: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

/**
 * Complete specification
 */
export const SpecificationSchema = z.object({
  id: z.string(),
  epicId: z.string(),
  sessionId: z.string(), // Interrogation session
  version: z.number(),

  // Business Context
  problem: z.string(),
  userPersona: z.string(),
  successMetrics: z.array(MetricSchema),
  outOfScope: z.array(z.string()),

  // Technical Context
  codebaseContext: CodebaseContextSchema.optional(),
  constraints: z.array(ConstraintSchema),
  integrations: z.array(IntegrationSchema),

  // Execution Plan
  phases: z.array(PhaseSchema),
  checkpoints: z.array(CheckpointSchema),

  // Validation
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  testStrategy: TestStrategySchema,

  // Estimates
  estimatedCost: CostEstimateSchema,
  estimatedDuration: DurationEstimateSchema,
  risks: z.array(RiskSchema),

  // Readiness
  readinessScore: z.number().min(0).max(100),
  readinessIssues: z.array(z.string()),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Specification = z.infer<typeof SpecificationSchema>;

/**
 * Input for generating a spec
 */
export const GenerateSpecInputSchema = z.object({
  sessionId: z.string(),
  format: z.enum(['yaml', 'markdown', 'json', 'all']).default('all'),
  includeEstimates: z.boolean().default(true),
});

export type GenerateSpecInput = z.infer<typeof GenerateSpecInputSchema>;

/**
 * Output formats for spec
 */
export interface SpecificationOutput {
  spec: Specification;
  yaml: string;
  markdown: string;
  json: string;
}
