/**
 * Round Controller
 *
 * Manages multi-round interrogation progression logic including:
 * - Max round limits (Ralph Wiggum termination)
 * - Escape hatch at 80%+ clarity
 * - Round-by-round progression evaluation
 * - Warning generation for incomplete specifications
 */

import { logger } from '../utils/logger.js';
import type { InterrogationSession } from '../types/index.js';

/**
 * Configuration for round control behavior
 */
export interface RoundConfig {
  /** Maximum number of interrogation rounds before termination */
  maxRounds: number;

  /** Clarity threshold (%) required to allow early exit via forceReady flag */
  escapeThreshold: number;

  /** Enable challenge mode for extra rigor (future use) */
  challengeMode: boolean;
}

/**
 * Default round configuration
 */
export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  maxRounds: 10,
  escapeThreshold: 80,
  challengeMode: false,
};

/**
 * Summary of a single interrogation round
 */
export interface RoundSummary {
  /** Current round number */
  round: number;

  /** Total questions asked in this round */
  questionsAsked: number;

  /** Total questions answered in this round */
  questionsAnswered: number;

  /** Change in clarity score from previous round */
  clarityDelta: number;

  /** Whether the session is ready for spec generation */
  readyForSpec: boolean;

  /** Whether escape hatch can be used (clarity >= threshold) */
  canEscape: boolean;
}

/**
 * Warning types for interrogation issues
 */
export type InterrogationWarningType =
  | 'incomplete-clarity'
  | 'max-rounds-reached'
  | 'escape-denied';

/**
 * Warning severity levels
 */
export type WarningLevel = 'info' | 'warning' | 'error';

/**
 * Warning issued during interrogation
 */
export interface InterrogationWarning {
  /** Warning type */
  type: InterrogationWarningType;

  /** Human-readable message */
  message: string;

  /** Specific gaps or issues identified */
  gaps: string[];

  /** Severity level */
  severity: WarningLevel;
}

/**
 * Round Controller - manages interrogation round progression
 */
export class RoundController {
  private readonly config: RoundConfig;
  private previousClarity: number = 0;

  constructor(config: Partial<RoundConfig> = {}) {
    this.config = {
      ...DEFAULT_ROUND_CONFIG,
      ...config,
    };

    logger.debug('RoundController initialized', undefined, {
      maxRounds: this.config.maxRounds,
      escapeThreshold: this.config.escapeThreshold,
      challengeMode: this.config.challengeMode,
    });
  }

  /**
   * Determine if interrogation should continue to the next round
   *
   * @param session - Current interrogation session
   * @param forceReady - User-requested escape hatch
   * @returns True if another round is needed, false otherwise
   */
  shouldContinue(session: InterrogationSession, forceReady: boolean = false): boolean {
    const summary = this.evaluateRound(session);

    // If user requested forceReady, check if they can escape
    if (forceReady) {
      if (summary.canEscape) {
        logger.info('Early exit approved via forceReady flag', {
          round: session.round,
          clarity: session.clarityScore,
          threshold: this.config.escapeThreshold,
        });
        return false;
      } else {
        logger.warn('forceReady flag ignored - clarity below threshold', undefined, {
          round: session.round,
          clarity: session.clarityScore,
          threshold: this.config.escapeThreshold,
        });
        // Continue interrogation despite forceReady
      }
    }

    // Max rounds reached - must stop
    if (session.round >= this.config.maxRounds) {
      logger.warn('Max rounds reached - terminating interrogation', undefined, {
        round: session.round,
        maxRounds: this.config.maxRounds,
        clarity: session.clarityScore,
      });
      return false;
    }

    // Clarity threshold met - can stop
    if (summary.canEscape) {
      logger.info('Clarity threshold met - ready for spec generation', {
        round: session.round,
        clarity: session.clarityScore,
      });
      return false;
    }

    // Need more rounds
    logger.debug('Continuing to next round', undefined, {
      round: session.round,
      clarity: session.clarityScore,
      threshold: this.config.escapeThreshold,
    });
    return true;
  }

  /**
   * Evaluate the current round and generate summary
   *
   * @param session - Current interrogation session
   * @returns Round summary with metrics
   */
  evaluateRound(session: InterrogationSession): RoundSummary {
    const questionsInCurrentRound = session.questions.filter(
      (q) => this.getQuestionRound(q.id, session) === session.round
    );

    const answersInCurrentRound = session.answers.filter(
      (a) => this.getAnswerRound(a.questionId, session) === session.round
    );

    const clarityDelta = session.clarityScore - this.previousClarity;
    this.previousClarity = session.clarityScore;

    const summary: RoundSummary = {
      round: session.round,
      questionsAsked: questionsInCurrentRound.length,
      questionsAnswered: answersInCurrentRound.length,
      clarityDelta,
      readyForSpec: session.readyForSpec,
      canEscape: this.canEscape(session),
    };

    logger.debug('Round evaluated', undefined, {
      round: summary.round,
      clarity: session.clarityScore,
      clarityDelta: summary.clarityDelta,
      canEscape: summary.canEscape,
    });

    return summary;
  }

  /**
   * Check if session can use escape hatch (forceReady)
   *
   * @param session - Current interrogation session
   * @returns True if clarity is at or above escape threshold
   */
  canEscape(session: InterrogationSession): boolean {
    return session.clarityScore >= this.config.escapeThreshold;
  }

  /**
   * Generate warnings for incomplete specifications at max rounds
   *
   * @param session - Current interrogation session
   * @returns Array of warnings about gaps and issues
   */
  generateWarning(session: InterrogationSession): InterrogationWarning[] {
    const warnings: InterrogationWarning[] = [];

    // Max rounds reached warning
    if (session.round >= this.config.maxRounds) {
      const gaps = this.identifyGaps(session);

      warnings.push({
        type: 'max-rounds-reached',
        message: `Clarity at ${session.clarityScore.toFixed(1)}% after ${session.round} rounds. Proceeding with incomplete specification.`,
        gaps,
        severity: session.clarityScore < 50 ? 'error' : 'warning',
      });

      logger.warn('Max rounds reached with incomplete clarity', undefined, {
        round: session.round,
        clarity: session.clarityScore,
        gapsCount: gaps.length,
      });
    }

    // Incomplete clarity warning (not at max rounds yet)
    if (session.clarityScore < this.config.escapeThreshold && session.round < this.config.maxRounds) {
      const gaps = this.identifyGaps(session);

      if (gaps.length > 0) {
        warnings.push({
          type: 'incomplete-clarity',
          message: `Clarity at ${session.clarityScore.toFixed(1)}%. ${gaps.length} area(s) need clarification.`,
          gaps,
          severity: 'info',
        });
      }
    }

    return warnings;
  }

  /**
   * Identify specific gaps in the interrogation session
   *
   * @param session - Current interrogation session
   * @returns Array of gap descriptions
   */
  private identifyGaps(session: InterrogationSession): string[] {
    const gaps: string[] = [];

    // Check for unanswered critical questions
    const unansweredCritical = session.questions.filter(
      (q) => q.priority === 'critical' && !session.answers.some((a) => a.questionId === q.id)
    );

    if (unansweredCritical.length > 0) {
      gaps.push(
        `${unansweredCritical.length} critical question(s) unanswered: ${unansweredCritical
          .map((q) => q.type)
          .join(', ')}`
      );
    }

    // Check for unanswered important questions
    const unansweredImportant = session.questions.filter(
      (q) => q.priority === 'important' && !session.answers.some((a) => a.questionId === q.id)
    );

    if (unansweredImportant.length > 0) {
      gaps.push(
        `${unansweredImportant.length} important question(s) unanswered: ${unansweredImportant
          .map((q) => q.type)
          .join(', ')}`
      );
    }

    // Check blockers
    if (session.blockers.length > 0) {
      gaps.push(...session.blockers);
    }

    // Check clarity score ranges
    if (session.clarityScore < 50) {
      gaps.push('Overall clarity very low - major gaps in understanding');
    } else if (session.clarityScore < this.config.escapeThreshold) {
      gaps.push('Clarity below threshold - some ambiguities remain');
    }

    // Check completeness
    if (session.completenessScore < 50) {
      gaps.push('Information completeness very low - significant details missing');
    } else if (session.completenessScore < 80) {
      gaps.push('Information completeness moderate - some details missing');
    }

    return gaps;
  }

  /**
   * Determine which round a question belongs to
   * (Helper method - in real implementation, questions should track their round)
   *
   * @param questionId - Question ID
   * @param session - Current session
   * @returns Round number (1-indexed)
   */
  private getQuestionRound(questionId: string, session: InterrogationSession): number {
    // This is a simplified implementation
    // In practice, questions should have a 'round' field
    const questionIndex = session.questions.findIndex((q) => q.id === questionId);
    if (questionIndex === -1) return session.round;

    // Rough estimation: divide questions evenly across rounds
    const questionsPerRound = Math.ceil(session.questions.length / session.round);
    return Math.floor(questionIndex / questionsPerRound) + 1;
  }

  /**
   * Determine which round an answer belongs to
   *
   * @param questionId - Question ID for the answer
   * @param session - Current session
   * @returns Round number (1-indexed)
   */
  private getAnswerRound(questionId: string, session: InterrogationSession): number {
    return this.getQuestionRound(questionId, session);
  }

  /**
   * Reset the previous clarity tracking (useful when starting a new session)
   */
  resetClarity(): void {
    this.previousClarity = 0;
  }

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<RoundConfig> {
    return { ...this.config };
  }
}
