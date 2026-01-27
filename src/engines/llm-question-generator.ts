/**
 * LLM Question Generator Engine
 *
 * Uses Claude to generate CONTEXTUAL, ADAPTIVE questions based on:
 * - Epic content (references specific parts)
 * - Quality tier (foundation → refinement → validation)
 * - Previous Q&A (never repeats, builds on context)
 * - Detected signals (gaps, tensions, assumptions)
 * - Coverage gaps (missing areas)
 *
 * This replaces template-based questions with semantic understanding.
 *
 * When LLM unavailable: Returns null so callers can fall back to templates.
 */

import { callLLM, isLLMAvailable } from './llm-client.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Question area (mapped to spec sections)
 */
export type QuestionArea = 'scope' | 'success' | 'constraint' | 'risk' | 'technical';

/**
 * Question priority
 */
export type QuestionPriority = 'critical' | 'high' | 'medium';

/**
 * Quality tier (1=vague, 5=complete)
 */
export type QualityTier = 1 | 2 | 3 | 4 | 5;

/**
 * Generated question with metadata
 */
export interface LLMGeneratedQuestion {
  question: string;
  area: QuestionArea;
  reason: string;        // Why this specific question matters for THIS epic
  priority: QuestionPriority;
  basedOn: string;       // What signal/gap/answer triggered this question
}

/**
 * Result from LLM question generation
 */
export interface LLMQuestionGenerationResult {
  questions: LLMGeneratedQuestion[];
}

/**
 * Previous Q&A pair for context
 */
export interface PreviousQA {
  area: string;
  question: string;
  answer: string;
  score?: number;
}

/**
 * Signal detected in epic
 */
export interface Signal {
  type: string;
  content: string;
  severity: string;
}

/**
 * Parameters for LLM question generation
 */
export interface GenerateQuestionsParams {
  epicContent: string;
  tier: QualityTier;
  strategy: string;
  previousQA: PreviousQA[];
  signals: Signal[];
  coverageGaps: string[];
  maxQuestions: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Tier-specific question strategies
 */
const TIER_STRATEGIES = {
  1: {
    name: 'Foundation',
    description: 'Establish basics (who/what/why)',
    examples: [
      'Who will use this? What problem does it solve?',
      'How will you know it works? What would you test?',
      'What constraints exist? Timeline, budget, technology?',
    ],
  },
  2: {
    name: 'Extraction',
    description: 'Get specifics from vague statements',
    examples: [
      'You mentioned "fast" - what does that mean in numbers?',
      'You said "users" - who exactly? What are their roles?',
      'You want "good UX" - what specific behaviors define that?',
    ],
  },
  3: {
    name: 'Gap-Filling',
    description: 'Target specific missing areas',
    examples: [
      'You described the happy path - what about edge cases?',
      'Auth is mentioned - what about authorization and permissions?',
      'Data is stored - how is it backed up? What about recovery?',
    ],
  },
  4: {
    name: 'Refinement',
    description: 'Add depth and probe edge cases',
    examples: [
      'At 10x scale, what breaks first? How do you handle it?',
      'Feature A and B interact - are there conflicts?',
      'You assume X is true - what if that assumption is wrong?',
    ],
  },
  5: {
    name: 'Validation',
    description: 'Confirm completeness, probe assumptions',
    examples: [
      'You said X must happen before Y - what if X fails?',
      'Potential conflict: requirement A vs B - how do they coexist?',
      'What would make you change requirement X? What\'s non-negotiable?',
    ],
  },
};

/**
 * System prompt for question generation
 */
const SYSTEM_PROMPT = `You are a senior requirements analyst conducting a Socratic interrogation.

Your job is to generate contextual, targeted questions that help refine vague epics into concrete specifications.

CRITICAL RULES:
1. **Understand the Tier**: Each tier has a different focus:
   - Tier 1 (Vague): Foundation questions - establish who/what/why, no technical details
   - Tier 2 (Minimal): Extraction questions - turn vague statements into specifics
   - Tier 3 (Partial): Gap-filling questions - target specific missing areas
   - Tier 4 (Detailed): Refinement questions - edge cases, interactions, scale
   - Tier 5 (Complete): Validation questions - test assumptions, probe contradictions

2. **Read ALL Context**: Review the epic and EVERY previous Q&A to understand what's known

3. **NEVER Repeat**: Don't ask questions that have already been answered

4. **Be Specific**: Reference exact parts of the epic or specific previous answers
   - Bad: "What about users?"
   - Good: "You mentioned 'admin users' - do they have different permissions than regular users?"

5. **Clear Reason**: Each question must have a clear reason tied to a specific gap/signal/vague answer

6. **Appropriate Count**: Generate the right number for the tier:
   - Tier 1: 5-7 questions
   - Tier 2: 4-6 questions
   - Tier 3: 3-5 questions
   - Tier 4: 2-4 questions
   - Tier 5: 2-3 questions

7. **Priority Assignment**:
   - critical: Must answer for spec to make sense
   - high: Important for implementation
   - medium: Nice to have, improves quality

OUTPUT FORMAT (JSON):
{
  "questions": [
    {
      "question": "The actual question text",
      "area": "scope|success|constraint|risk|technical",
      "reason": "Why this question matters for THIS epic",
      "priority": "critical|high|medium",
      "basedOn": "What triggered this question (signal/gap/vague answer)"
    }
  ]
}`;

// =============================================================================
// Main Function
// =============================================================================

/**
 * Generate contextual questions using LLM.
 *
 * Returns null when LLM is unavailable (caller should fall back to templates).
 *
 * @param params - Generation parameters
 * @returns Generated questions or null if LLM unavailable
 */
export async function generateQuestionsWithLLM(
  params: GenerateQuestionsParams
): Promise<LLMQuestionGenerationResult | null> {
  const {
    epicContent,
    tier,
    strategy,
    previousQA,
    signals,
    coverageGaps,
    maxQuestions,
  } = params;

  // Check if LLM is available
  if (!isLLMAvailable()) {
    logger.info('LLM not available for question generation, will use template fallback');
    return null;
  }

  try {
    // Build the user prompt with all context
    const userPrompt = buildUserPrompt({
      epicContent,
      tier,
      strategy,
      previousQA,
      signals,
      coverageGaps,
      maxQuestions,
    });

    logger.debug('Generating questions with LLM', {
      tier,
      strategy,
      previousQACount: previousQA.length,
      signalCount: signals.length,
      promptLength: userPrompt.length,
    });

    // Call LLM with system and user prompts
    const response = await callLLM<{ questions: unknown[] }>(
      SYSTEM_PROMPT,
      userPrompt,
      {
        maxTokens: 2000,
        temperature: 0.5, // Moderate temperature for focused creativity
      }
    );

    if (!response) {
      logger.warn('LLM returned null response for question generation');
      return null;
    }

    // Parse and validate the response
    const parsed = parseQuestionsResponse(response);

    logger.info('LLM generated questions', {
      tier,
      questionCount: parsed.questions.length,
    });

    return parsed;

  } catch (error) {
    logger.error('Failed to generate questions with LLM', error, {
      tier,
      strategy,
      epicLength: epicContent.length,
    });

    // Return null so caller can fall back to templates
    return null;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build the user prompt with all context
 */
function buildUserPrompt(params: GenerateQuestionsParams): string {
  const {
    epicContent,
    tier,
    strategy,
    previousQA,
    signals,
    coverageGaps,
    maxQuestions,
  } = params;

  const tierInfo = TIER_STRATEGIES[tier];

  const sections: string[] = [];

  // Tier and strategy
  sections.push(`# Current Tier: ${tier} - ${tierInfo.name}`);
  sections.push(`Strategy: ${strategy}`);
  sections.push(`Description: ${tierInfo.description}`);
  sections.push('');
  sections.push('Example questions for this tier:');
  tierInfo.examples.forEach(ex => sections.push(`- ${ex}`));
  sections.push('');

  // Epic content
  sections.push('# Epic Content');
  sections.push('```');
  sections.push(epicContent.trim());
  sections.push('```');
  sections.push('');

  // Previous Q&A
  if (previousQA.length > 0) {
    sections.push('# Previous Q&A (DO NOT REPEAT THESE QUESTIONS)');
    previousQA.forEach((qa, i) => {
      sections.push(`\n## Q${i + 1} [${qa.area}]${qa.score ? ` (score: ${qa.score}/5)` : ''}`);
      sections.push(`Q: ${qa.question}`);
      sections.push(`A: ${qa.answer}`);
    });
    sections.push('');
  } else {
    sections.push('# Previous Q&A');
    sections.push('(No previous Q&A - this is the first round)');
    sections.push('');
  }

  // Signals
  if (signals.length > 0) {
    sections.push('# Detected Signals (gaps/tensions/assumptions to address)');
    signals.forEach(signal => {
      sections.push(`- [${signal.severity.toUpperCase()}] ${signal.type}: ${signal.content}`);
    });
    sections.push('');
  }

  // Coverage gaps
  if (coverageGaps.length > 0) {
    sections.push('# Coverage Gaps (areas with no answers yet)');
    coverageGaps.forEach(gap => sections.push(`- ${gap}`));
    sections.push('');
  }

  // Instructions
  sections.push('# Instructions');
  sections.push(`Generate ${maxQuestions} questions appropriate for Tier ${tier}.`);
  sections.push('');
  sections.push('Requirements:');
  sections.push('- Reference specific parts of the epic or previous answers');
  sections.push('- Focus on the tier\'s strategy (see examples above)');
  sections.push('- Address signals and coverage gaps when relevant');
  sections.push('- Never repeat questions that have been asked');
  sections.push('- Each question must have a clear, specific reason');
  sections.push('- Output valid JSON matching the format in the system prompt');

  return sections.join('\n');
}

/**
 * Parse questions from LLM response
 */
function parseQuestionsResponse(
  response: { questions: unknown[] }
): LLMQuestionGenerationResult {
  try {
    // Validate structure (callLLM already parsed JSON)
    if (!Array.isArray(response.questions)) {
      throw new Error('Response missing "questions" array');
    }

    // Validate each question
    const questions: LLMGeneratedQuestion[] = response.questions.map((q, i) => {
      if (!q || typeof q !== 'object') {
        throw new Error(`Question ${i} is not an object`);
      }

      const question = q as Record<string, unknown>;

      if (typeof question.question !== 'string' || !question.question) {
        throw new Error(`Question ${i} missing "question" string`);
      }

      if (!isValidArea(question.area)) {
        throw new Error(`Question ${i} has invalid area: ${question.area}`);
      }

      if (typeof question.reason !== 'string' || !question.reason) {
        throw new Error(`Question ${i} missing "reason" string`);
      }

      if (!isValidPriority(question.priority)) {
        throw new Error(`Question ${i} has invalid priority: ${question.priority}`);
      }

      if (typeof question.basedOn !== 'string' || !question.basedOn) {
        throw new Error(`Question ${i} missing "basedOn" string`);
      }

      return {
        question: question.question,
        area: question.area,
        reason: question.reason,
        priority: question.priority,
        basedOn: question.basedOn,
      };
    });

    return { questions };

  } catch (error) {
    logger.error('Failed to parse LLM question response', error, {
      responseKeys: Object.keys(response),
    });
    throw new Error(
      `Invalid response structure from LLM: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Type guard for question area
 */
function isValidArea(value: unknown): value is QuestionArea {
  return (
    typeof value === 'string' &&
    ['scope', 'success', 'constraint', 'risk', 'technical'].includes(value)
  );
}

/**
 * Type guard for question priority
 */
function isValidPriority(value: unknown): value is QuestionPriority {
  return (
    typeof value === 'string' &&
    ['critical', 'high', 'medium'].includes(value)
  );
}

// Re-export isLLMAvailable for convenience
export { isLLMAvailable };
