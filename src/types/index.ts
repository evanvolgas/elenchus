/**
 * Elenchus Type Definitions
 *
 * Central export for all types used across the system.
 */

// Epic types (including result interfaces)
export {
  type Epic,
  type EpicSource,
  type EpicStatus,
  type Resource,
  type CreateEpicInput,
  type IngestResult,
  EpicSchema,
  EpicSourceSchema,
  EpicStatusSchema,
  ResourceSchema,
  CreateEpicInputSchema,
} from './epic.js';

// Context types
export {
  type CodebaseContext,
  type CodebaseMaturity,
  type ArchitecturePattern,
  type Convention,
  type Dependency,
  type DetectedLanguage,
  type FileReference,
  type RiskAssessment,
  type PatternSuggestion,
  type CoverageReport,
  type AnalyzeInput,
  CodebaseContextSchema,
  CodebaseMaturitySchema,
  ArchitecturePatternSchema,
  ConventionSchema,
  DependencySchema,
  DetectedLanguageSchema,
  FileReferenceSchema,
  RiskAssessmentSchema,
  PatternSuggestionSchema,
  CoverageReportSchema,
  AnalyzeInputSchema,
} from './context.js';

// Interrogation types
export {
  type Question,
  type QuestionType,
  type QuestionPriority,
  type Answer,
  type InterrogationSession,
  type InterrogationStatus,
  type InterrogateInput,
  type AnswerInput,
  type InterrogationResult,
  QuestionSchema,
  QuestionTypeSchema,
  QuestionPrioritySchema,
  AnswerSchema,
  InterrogationSessionSchema,
  InterrogationStatusSchema,
  InterrogateInputSchema,
  AnswerInputSchema,
} from './interrogation.js';

// Specification types (including output interfaces)
export {
  type Specification,
  type Metric,
  type Constraint,
  type Integration,
  type AcceptanceCriterion,
  type Task,
  type TaskType,
  type Phase,
  type Risk,
  type TestStrategy,
  type CostEstimate,
  type DurationEstimate,
  type Checkpoint,
  type GenerateSpecInput,
  type SpecificationOutput,
  SpecificationSchema,
  MetricSchema,
  ConstraintSchema,
  IntegrationSchema,
  AcceptanceCriterionSchema,
  TaskSchema,
  TaskTypeSchema,
  PhaseSchema,
  RiskSchema,
  TestStrategySchema,
  CostEstimateSchema,
  DurationEstimateSchema,
  CheckpointSchema,
  GenerateSpecInputSchema,
} from './spec.js';

// Re-export utility types for convenience
export type {
  // Error types
  ValidationIssue,
  ValidationResult,
} from './validation.js';
