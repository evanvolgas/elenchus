/**
 * Answer Validator Engine
 *
 * Validates user answers for vagueness, completeness, coherence, and contradictions.
 * Uses Claude Haiku for fast, cost-effective validation.
 *
 * @module engines/answer-validator
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Answer, Question } from '../types/index.js';

/**
 * Validation issue types
 */
export type ValidationIssueType = 'vague' | 'incomplete' | 'incoherent' | 'contradiction';

/**
 * Issue severity levels
 */
export type ValidationIssueSeverity = 'low' | 'medium' | 'high';

/**
 * A single validation issue found in an answer
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  description: string;
  severity: ValidationIssueSeverity;
  relatedAnswerId?: string; // For contradictions
}

/**
 * Result of validating a single answer
 */
export interface AnswerValidation {
  answerId: string;
  isVague: boolean;
  isComplete: boolean;
  isCoherent: boolean;
  vaguenessScore: number; // 0-1, higher = more vague
  issues: ValidationIssue[];
  suggestedFollowUp?: string;
}

/**
 * Detected contradiction between two answers
 */
export interface Contradiction {
  answerId1: string;
  answerId2: string;
  description: string;
  severity: 'potential' | 'likely' | 'definite';
}

/**
 * Context needed for validating an answer
 */
export interface ValidationContext {
  epic?: {
    title: string;
    goals?: string[];
    constraints?: string[];
  };
  previousAnswers?: Answer[];
  codebaseContext?: {
    technologies?: string[];
    patterns?: string[];
  };
}

/**
 * Zod schema for LLM validation response
 * @internal Used for parsing LLM responses when integrated
 */
const _ValidationResponseSchema = z.object({
  isVague: z.boolean(),
  isComplete: z.boolean(),
  isCoherent: z.boolean(),
  vaguenessScore: z.number().min(0).max(1),
  issues: z.array(z.object({
    type: z.enum(['vague', 'incomplete', 'incoherent', 'contradiction']),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    relatedAnswerId: z.string().optional(),
  })),
  suggestedFollowUp: z.string().optional(),
  reasoning: z.string().optional(),
});

/**
 * Zod schema for contradiction detection response
 * @internal Used for parsing LLM responses when integrated
 */
const _ContradictionResponseSchema = z.object({
  contradictions: z.array(z.object({
    answerId1: z.string(),
    answerId2: z.string(),
    description: z.string(),
    severity: z.enum(['potential', 'likely', 'definite']),
    reasoning: z.string(),
  })),
});

// Export for future LLM integration
export { _ValidationResponseSchema as ValidationResponseSchema };
export { _ContradictionResponseSchema as ContradictionResponseSchema };

/**
 * Answer Validator
 *
 * Validates answers for quality issues and detects contradictions.
 * Uses Claude Haiku for fast, cost-effective validation.
 */
export class AnswerValidator {
  /**
   * Validate a single answer
   *
   * Checks for vagueness, completeness, coherence, and potential contradictions
   * with previous answers.
   *
   * @param answer - The answer to validate
   * @param question - The question being answered
   * @param context - Additional context for validation
   * @returns Validation result with issues and suggestions
   */
  async validateAnswer(
    answer: Answer,
    question: Question,
    context: ValidationContext = {}
  ): Promise<AnswerValidation> {
    logger.debug('Validating answer', {
      questionId: question.id,
      answerLength: answer.answer.length,
      hasPreviousAnswers: !!context.previousAnswers?.length,
    });

    // Build validation prompt for LLM (stored for future LLM integration)
    const _prompt = this.buildValidationPrompt(answer, question, context);
    void _prompt; // Silence unused variable warning until LLM integration

    try {
      // TODO: Call LLM client (Haiku) with prompt
      // For now, use heuristic-based validation as fallback
      const validation = await this.heuristicValidation(answer, question, context);

      logger.debug('Answer validation complete', {
        questionId: question.id,
        isVague: validation.isVague,
        vaguenessScore: validation.vaguenessScore,
        issueCount: validation.issues.length,
      });

      return validation;
    } catch (error) {
      logger.error('Answer validation failed, using fallback', error, {
        questionId: question.id,
      });

      // Fallback to heuristic validation
      return this.heuristicValidation(answer, question, context);
    }
  }

  /**
   * Detect contradictions across multiple answers
   *
   * Analyzes all answers together to find logical inconsistencies,
   * implicit conflicts, and potential contradictions.
   *
   * @param answers - All answers to analyze
   * @returns Array of detected contradictions
   */
  async detectContradictions(answers: Answer[]): Promise<Contradiction[]> {
    if (answers.length < 2) {
      return [];
    }

    logger.debug('Detecting contradictions', {
      answerCount: answers.length,
    });

    try {
      // TODO: Call LLM client (Haiku) with contradiction detection prompt
      // For now, use heuristic-based detection as fallback
      const contradictions = this.heuristicContradictionDetection(answers);

      logger.debug('Contradiction detection complete', {
        contradictionCount: contradictions.length,
      });

      return contradictions;
    } catch (error) {
      logger.error('Contradiction detection failed, using fallback', error);
      return this.heuristicContradictionDetection(answers);
    }
  }

  /**
   * Calculate how much a validation result impacts clarity score
   *
   * Vague or incomplete answers reduce clarity more than coherence issues.
   * High severity issues have larger impact.
   *
   * @param validation - The validation result
   * @returns Clarity score delta (negative value, 0 to -30)
   */
  calculateClarityImpact(validation: AnswerValidation): number {
    let impact = 0;

    // Base impact from vagueness score
    if (validation.isVague) {
      impact -= validation.vaguenessScore * 15; // Up to -15 points
    }

    // Impact from completeness
    if (!validation.isComplete) {
      impact -= 10;
    }

    // Impact from coherence (lower priority)
    if (!validation.isCoherent) {
      impact -= 5;
    }

    // Additional impact from high-severity issues
    const highSeverityCount = validation.issues.filter(
      (issue) => issue.severity === 'high'
    ).length;
    impact -= highSeverityCount * 5;

    // Cap at -30 to prevent single answer from destroying clarity
    return Math.max(impact, -30);
  }

  /**
   * Build LLM prompt for answer validation
   *
   * @private
   */
  private buildValidationPrompt(
    answer: Answer,
    question: Question,
    context: ValidationContext
  ): string {
    let prompt = `You are validating an answer to a specification question. Analyze the answer for:

1. **Vagueness**: Does it use unclear language like "stuff", "things", "some", "maybe"?
2. **Completeness**: Does it fully address all parts of the question?
3. **Coherence**: Is it internally consistent and logically sound?
4. **Contradictions**: Does it conflict with previous answers?

**Question Type**: ${question.type}
**Question**: ${question.question}
**Context**: ${question.context}

**Answer**: ${answer.answer}
`;

    // Add epic context if available
    if (context.epic) {
      prompt += `\n**Epic Goals**: ${context.epic.goals?.join(', ') ?? 'None'}`;
      if (context.epic.constraints?.length) {
        prompt += `\n**Epic Constraints**: ${context.epic.constraints.join(', ')}`;
      }
    }

    // Add previous answers for contradiction detection
    if (context.previousAnswers?.length) {
      prompt += `\n\n**Previous Answers for Contradiction Check**:`;
      context.previousAnswers.forEach((prevAnswer, idx) => {
        prompt += `\n${idx + 1}. (Q: ${prevAnswer.questionId}): ${prevAnswer.answer.substring(0, 200)}${prevAnswer.answer.length > 200 ? '...' : ''}`;
      });
    }

    prompt += `\n\nProvide your analysis as JSON with this structure:
{
  "isVague": boolean,
  "isComplete": boolean,
  "isCoherent": boolean,
  "vaguenessScore": 0-1 (higher = more vague),
  "issues": [
    {
      "type": "vague" | "incomplete" | "incoherent" | "contradiction",
      "description": "specific issue found",
      "severity": "low" | "medium" | "high",
      "relatedAnswerId": "questionId if contradiction"
    }
  ],
  "suggestedFollowUp": "optional follow-up question if answer is vague/incomplete",
  "reasoning": "brief explanation of your assessment"
}`;

    return prompt;
  }

  /**
   * Heuristic-based validation (fallback when LLM unavailable)
   *
   * @private
   */
  private async heuristicValidation(
    answer: Answer,
    question: Question,
    _context: ValidationContext
  ): Promise<AnswerValidation> {
    const text = answer.answer.toLowerCase();
    const issues: ValidationIssue[] = [];
    let vaguenessScore = 0;

    // Vagueness detection patterns
    const vaguePatterns = [
      /\b(stuff|things|some|maybe|probably|might|could|perhaps)\b/gi,
      /\b(etc|and so on|or something)\b/gi,
      /\b(kind of|sort of|basically|generally)\b/gi,
    ];

    let vagueMatches = 0;
    for (const pattern of vaguePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        vagueMatches += matches.length;
      }
    }

    // Calculate vagueness score based on matches and answer length
    const wordsCount = text.split(/\s+/).length;
    vaguenessScore = Math.min(vagueMatches / Math.max(wordsCount / 10, 1), 1);

    const isVague = vaguenessScore > 0.3;

    if (isVague) {
      issues.push({
        type: 'vague',
        description: 'Answer contains vague language that needs clarification',
        severity: vaguenessScore > 0.6 ? 'high' : 'medium',
      });
    }

    // Completeness check (very basic)
    const isComplete = answer.answer.length > 20 && !text.includes('not sure');

    if (!isComplete) {
      issues.push({
        type: 'incomplete',
        description: 'Answer appears incomplete or uncertain',
        severity: 'medium',
      });
    }

    // Coherence check (basic contradiction within answer)
    const hasNegation = /\b(but|however|although|though)\b/gi.test(text);
    const hasContradictoryWords = /\b(yes.*no|no.*yes|always.*never|never.*always)\b/gi.test(text);
    const isCoherent = !(hasNegation && hasContradictoryWords);

    if (!isCoherent) {
      issues.push({
        type: 'incoherent',
        description: 'Answer contains potentially contradictory statements',
        severity: 'low',
      });
    }

    // Generate follow-up if vague or incomplete
    let suggestedFollowUp: string | undefined;
    if (isVague || !isComplete) {
      suggestedFollowUp = this.generateHeuristicFollowUp(question, answer);
    }

    const result: AnswerValidation = {
      answerId: answer.questionId,
      isVague,
      isComplete,
      isCoherent,
      vaguenessScore,
      issues,
    };
    if (suggestedFollowUp) {
      result.suggestedFollowUp = suggestedFollowUp;
    }
    return result;
  }

  /**
   * Heuristic-based contradiction detection
   *
   * @private
   */
  private heuristicContradictionDetection(answers: Answer[]): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // Look for obvious keyword contradictions between answers
    const contradictoryPairs = [
      ['authentication', 'no auth'],
      ['real-time', 'batch'],
      ['synchronous', 'asynchronous'],
      ['sql', 'nosql'],
      ['stateful', 'stateless'],
      ['public', 'private'],
      ['required', 'optional'],
      ['always', 'never'],
    ];

    for (let i = 0; i < answers.length; i++) {
      for (let j = i + 1; j < answers.length; j++) {
        const answer1 = answers[i]!;
        const answer2 = answers[j]!;
        const text1 = answer1.answer.toLowerCase();
        const text2 = answer2.answer.toLowerCase();

        // Check for contradictory keyword pairs
        for (const pair of contradictoryPairs) {
          const term1 = pair[0]!;
          const term2 = pair[1]!;
          if (
            (text1.includes(term1) && text2.includes(term2)) ||
            (text1.includes(term2) && text2.includes(term1))
          ) {
            contradictions.push({
              answerId1: answer1.questionId,
              answerId2: answer2.questionId,
              description: `Potential contradiction: one answer mentions "${term1}" while another mentions "${term2}"`,
              severity: 'potential',
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Generate heuristic follow-up question
   *
   * @private
   */
  private generateHeuristicFollowUp(question: Question, _answer: Answer): string {
    const questionType = question.type;

    // Generate type-specific follow-ups
    switch (questionType) {
      case 'scope':
        return 'Can you provide specific examples of what is and is not included?';
      case 'constraint':
        return 'What specific technical or business constraints must be respected?';
      case 'success':
        return 'What measurable criteria will determine if this is successful?';
      case 'technical':
        return 'Can you specify the exact technology or approach to use?';
      case 'risk':
        return 'What specific risks are you most concerned about and how should they be mitigated?';
      default:
        return 'Can you provide more specific details about your answer?';
    }
  }
}

/**
 * Singleton instance
 */
export const answerValidator = new AnswerValidator();
