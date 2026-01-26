import { z } from 'zod';

/**
 * Types of questions Elenchus can ask
 */
export const QuestionTypeSchema = z.enum([
  'scope',        // What's in/out of scope?
  'constraint',   // What are non-negotiable requirements?
  'success',      // How do we measure success?
  'technical',    // Technical decisions needing input
  'risk',         // What could go wrong?
  'clarification', // Clarify ambiguous requirements
  'stakeholder',  // Who are the stakeholders?
  'timeline'      // What are time constraints?
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * Question priority levels
 */
export const QuestionPrioritySchema = z.enum([
  'critical',     // Must be answered before proceeding
  'important',    // Should be answered, but has reasonable default
  'nice-to-have'  // Optional, helps refine but not blocking
]);

export type QuestionPriority = z.infer<typeof QuestionPrioritySchema>;

/**
 * A single clarifying question
 */
export const QuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  priority: QuestionPrioritySchema,

  // The question itself
  question: z.string(),
  context: z.string(), // Why we're asking this

  // Help the user answer
  suggestedAnswers: z.array(z.string()).optional(),
  inferredDefault: z.string().optional(), // Our best guess
  inferredFrom: z.string().optional(), // Where we got the default

  // Dependencies
  dependsOn: z.array(z.string()).optional(), // Other question IDs

  // Targeting
  targetAudience: z.enum(['pm', 'dev', 'both']).default('both'),

  // V2: Question provenance and confidence (optional for backward compat)
  source: z.enum(['template', 'llm', 'follow-up', 'challenge']).optional(),
  generatedFrom: z.string().optional(), // Answer ID that triggered this
  confidence: z.number().min(0).max(1).optional(), // LLM confidence in question relevance
});

export type Question = z.infer<typeof QuestionSchema>;

/**
 * An answer to a question
 */
export const AnswerSchema = z.object({
  questionId: z.string(),
  answer: z.string(),
  usedDefault: z.boolean().default(false),
  answeredBy: z.string().optional(),
  answeredAt: z.string().datetime(),
  notes: z.string().optional(),
});

export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Status of an interrogation session
 */
export const InterrogationStatusSchema = z.enum([
  'pending',      // Not started
  'in-progress',  // Questions being asked
  'waiting',      // Waiting for answers
  'complete',     // All questions answered
  'abandoned'     // User gave up
]);

export type InterrogationStatus = z.infer<typeof InterrogationStatusSchema>;

/**
 * Interrogation session - tracks the Q&A process
 */
export const InterrogationSessionSchema = z.object({
  id: z.string(),
  epicId: z.string(),

  // State
  status: InterrogationStatusSchema,

  // Questions and answers
  questions: z.array(QuestionSchema),
  answers: z.array(AnswerSchema),

  // Metrics
  clarityScore: z.number().min(0).max(100), // How clear is our understanding?
  completenessScore: z.number().min(0).max(100), // How complete is the info?

  // Readiness
  readyForSpec: z.boolean(),
  blockers: z.array(z.string()), // What's preventing readiness?

  // Iteration tracking
  round: z.number().default(1), // Which round of questions
  maxRounds: z.number().default(3), // Limit to prevent infinite loops

  // Timestamps
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export type InterrogationSession = z.infer<typeof InterrogationSessionSchema>;

/**
 * Input for starting/continuing interrogation
 */
export const InterrogateInputSchema = z.object({
  epicId: z.string(),
  sessionId: z.string().optional(), // Continue existing session
  forceNewRound: z.boolean().default(false), // Force a new round of questions

  // V2: Enhanced control options
  forceReady: z.boolean().default(false), // Escape hatch (requires 80%+ clarity)
  challengeMode: z.boolean().default(false), // Enable devil's advocate
  config: z.object({
    maxRounds: z.number().min(1).max(20).default(10),
    escapeThreshold: z.number().min(0).max(100).default(80),
  }).optional(),
});

export type InterrogateInput = z.infer<typeof InterrogateInputSchema>;

/**
 * Input for answering questions
 */
export const AnswerInputSchema = z.object({
  sessionId: z.string(),
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string(),
    notes: z.string().optional(),
  })),
  answeredBy: z.string().optional(),
});

export type AnswerInput = z.infer<typeof AnswerInputSchema>;

/**
 * V2: Validation issue types
 */
export const ValidationIssueSchema = z.object({
  type: z.enum(['vague', 'incomplete', 'incoherent', 'contradiction']),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  relatedAnswerId: z.string().optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/**
 * V2: Answer validation results
 */
export const AnswerValidationSchema = z.object({
  answerId: z.string(),
  isVague: z.boolean(),
  isComplete: z.boolean(),
  isCoherent: z.boolean(),
  vaguenessScore: z.number().min(0).max(1),
  issues: z.array(ValidationIssueSchema),
  suggestedFollowUp: z.string().optional(),
});

export type AnswerValidation = z.infer<typeof AnswerValidationSchema>;

/**
 * V2: Detected contradictions between answers
 */
export const ContradictionSchema = z.object({
  answerId1: z.string(),
  answerId2: z.string(),
  description: z.string(),
  severity: z.enum(['potential', 'likely', 'definite']),
});

export type Contradiction = z.infer<typeof ContradictionSchema>;

/**
 * V2: Interrogation warnings
 */
export const InterrogationWarningSchema = z.object({
  type: z.enum(['incomplete-clarity', 'max-rounds-reached']),
  message: z.string(),
  gaps: z.array(z.string()),
  severity: z.enum(['info', 'warning', 'error']),
});

export type InterrogationWarning = z.infer<typeof InterrogationWarningSchema>;

/**
 * V2: Round summary metrics
 */
export const RoundSummarySchema = z.object({
  round: z.number(),
  questionsAsked: z.number(),
  questionsAnswered: z.number(),
  clarityDelta: z.number(),
  readyForSpec: z.boolean(),
  canEscape: z.boolean(),
});

export type RoundSummary = z.infer<typeof RoundSummarySchema>;

/**
 * Result of interrogation
 */
export interface InterrogationResult {
  session: InterrogationSession;
  nextQuestions: Question[];
  readyForSpec: boolean;
  recommendations: string[];

  // V2: Enhanced validation and tracking
  validationResults?: AnswerValidation[];
  contradictions?: Contradiction[];
  roundSummary?: RoundSummary;
  warnings?: InterrogationWarning[];
}
