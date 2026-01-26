/**
 * Engines Index
 *
 * Exports all V2 interrogation engine modules.
 */

// LLM Client for Claude API integration
export {
  LLMClient,
  createClient,
  LLMError,
  LLMErrorCode,
  type LLMClientConfig,
  type LLMResponse,
  type LLMModel,
  type GenerateOptions,
} from './llm-client.js';

// Question Generator for template + LLM-enhanced questions
export {
  QuestionGenerator,
  createQuestionGenerator,
  type QuestionSource,
  type EnhancedQuestion,
  type QuestionContext,
} from './question-generator.js';

// Answer Validator for vagueness, completeness, and contradiction detection
export {
  AnswerValidator,
  answerValidator,
  type ValidationIssue,
  type ValidationIssueType,
  type ValidationIssueSeverity,
  type AnswerValidation,
  type Contradiction,
  type ValidationContext,
} from './answer-validator.js';

// Round Controller for multi-round progression and escape hatch
export {
  RoundController,
  DEFAULT_ROUND_CONFIG,
  type RoundConfig,
  type RoundSummary,
  type InterrogationWarning,
  type InterrogationWarningType,
  type WarningLevel,
} from './round-controller.js';

// Challenge Mode for devil's advocate and assumption surfacing
export {
  ChallengeModeEngine,
  type ChallengeType,
  type ChallengeQuestion,
} from './challenge-mode.js';

// V2: Signal Detector - pattern detection for LLM-guided interrogation
export {
  detectSignals,
  detectVagueness,
  detectContradictions,
  detectCoverageGaps,
  detectAssumptions,
  detectStack,
  extractSpecificityMarkers,
  extractTechnicalDecisions,
  type InterrogationSignals,
  type AnswerSignals,
  type VaguenessIndicator,
  type ContradictionSignal,
  type CoverageGap,
  type AssumptionSignal,
} from './signal-detector.js';

// V2: Interrogation Engine - LLM-powered Socratic guidance
export {
  runInterrogationV2,
  generateGuidance,
  type SocraticGuidance,
  type FocusArea,
  type ProbeTarget,
  type InterrogationContext,
  type ReadinessAssessment,
  type InterrogationResultV2,
} from './interrogation-v2.js';

// Answer Extractor - organizes answers by type (no fake intelligence)
export {
  organizeAnswers,
  type OrganizedAnswers,
  type AnswerWithContext,
} from './answer-extractor.js';
