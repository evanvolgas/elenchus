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
 * Result of interrogation
 */
export interface InterrogationResult {
  session: InterrogationSession;
  nextQuestions: Question[];
  readyForSpec: boolean;
  recommendations: string[];
}
