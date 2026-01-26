/**
 * Question Generator for Interrogation Engine V2
 *
 * Generates questions using a two-tier approach:
 * 1. Template Scaffold - Deterministic baseline questions (always runs first)
 * 2. LLM Question Enhancer - Context-aware, semantic question generation (when API available)
 */

import type {
  Epic,
  CodebaseContext,
  Question,
  QuestionType,
  QuestionPriority,
  Answer,
} from '../types/index.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

/**
 * Source of question generation
 */
export type QuestionSource = 'template' | 'llm' | 'follow-up' | 'challenge';

/**
 * Enhanced Question interface with V2 additions
 */
export interface EnhancedQuestion extends Question {
  source: QuestionSource;
  generatedFrom?: string;  // Answer ID that triggered this question
  confidence?: number;     // LLM confidence in question relevance (0-1)
}

/**
 * Context for question generation
 */
export interface QuestionContext {
  epic: Epic;
  codebaseContext?: CodebaseContext;
  previousAnswers?: Answer[];
  round: number;
  maxRounds: number;
  challengeMode?: boolean;
}

/**
 * Gap analysis result
 */
interface GapAnalysis {
  missingGoals: boolean;
  missingConstraints: boolean;
  missingAcceptanceCriteria: boolean;
  missingStakeholders: boolean;
  gaps: string[];
}

/**
 * Question Generator class
 */
export class QuestionGenerator {
  /**
   * Generate questions using template scaffold and optional LLM enhancement
   *
   * @param context - Question generation context
   * @param useLLM - Whether to use LLM enhancement (requires API key)
   * @returns Array of enhanced questions
   */
  async generate(
    context: QuestionContext,
    useLLM = false
  ): Promise<EnhancedQuestion[]> {
    logger.debug('Generating questions', {
      epicId: context.epic.id,
      round: context.round,
      useLLM,
      challengeMode: context.challengeMode ?? false,
    });

    // Step 1: Always generate template questions as baseline
    const gaps = this.analyzeGaps(context.epic);
    const templateQuestions = this.generateTemplateQuestions(context.epic, gaps, context.round);

    logger.info(`Generated ${templateQuestions.length} template questions`, {
      epicId: context.epic.id,
      gaps: gaps.gaps,
    });

    // Step 2: Enhance with LLM if available
    let enhancedQuestions = templateQuestions;
    if (useLLM) {
      try {
        const llmQuestions = await this.enhanceWithLLM(templateQuestions, context);
        enhancedQuestions = llmQuestions;
        logger.info(`Enhanced questions with LLM: ${llmQuestions.length} questions`, {
          epicId: context.epic.id,
        });
      } catch (error) {
        logger.warn('LLM enhancement failed, using template questions only', error, {
          epicId: context.epic.id,
        });
        // Fall back to template questions
      }
    }

    // Step 3: Generate follow-up questions if we have previous answers
    if (context.previousAnswers && context.previousAnswers.length > 0) {
      const followUpQuestions = this.generateFollowUpQuestions(
        context.previousAnswers,
        context,
        useLLM
      );
      enhancedQuestions.push(...followUpQuestions);
    }

    return enhancedQuestions;
  }

  /**
   * Analyze gaps in the epic to determine what questions to ask
   */
  private analyzeGaps(epic: Epic): GapAnalysis {
    const gaps: string[] = [];
    const analysis: GapAnalysis = {
      missingGoals: epic.extractedGoals.length === 0,
      missingConstraints: epic.extractedConstraints.length === 0,
      missingAcceptanceCriteria: epic.extractedAcceptanceCriteria.length === 0,
      missingStakeholders: !epic.extractedStakeholders || epic.extractedStakeholders.length === 0,
      gaps: [],
    };

    if (analysis.missingGoals) {
      gaps.push('goals');
    }
    if (analysis.missingConstraints) {
      gaps.push('constraints');
    }
    if (analysis.missingAcceptanceCriteria) {
      gaps.push('acceptance-criteria');
    }
    if (analysis.missingStakeholders) {
      gaps.push('stakeholders');
    }

    analysis.gaps = gaps;
    return analysis;
  }

  /**
   * Generate template questions based on epic gaps
   * These are deterministic and serve as fallback when LLM unavailable
   */
  generateTemplateQuestions(
    _epic: Epic,
    gaps: GapAnalysis,
    round: number
  ): EnhancedQuestion[] {
    const questions: EnhancedQuestion[] = [];

    // Goals questions
    if (gaps.missingGoals) {
      questions.push(this.createTemplateQuestion(
        'scope',
        'critical',
        'What are the primary goals of this epic? What problem does it solve?',
        'No explicit goals were found in the epic. Clear goals help focus the POC.',
        round,
        [
          'Improve user experience for...',
          'Reduce costs by...',
          'Enable new capability for...',
        ],
        'pm'
      ));
    }

    // Acceptance criteria questions
    if (gaps.missingAcceptanceCriteria) {
      questions.push(this.createTemplateQuestion(
        'success',
        'critical',
        'How will we know the POC is successful? What are the acceptance criteria?',
        'No acceptance criteria found. These are essential for validating the POC.',
        round,
        [
          'User can successfully...',
          'System responds within...',
          'All tests pass for...',
        ],
        'both'
      ));
    }

    // Constraint questions
    if (gaps.missingConstraints) {
      questions.push(this.createTemplateQuestion(
        'constraint',
        'important',
        'Are there any technical constraints or requirements? (tech stack, performance, security)',
        'No explicit constraints found. Understanding constraints prevents wasted effort.',
        round,
        [
          'Must use existing tech stack',
          'Must handle X requests per second',
          'Must comply with GDPR/SOC2',
        ],
        'dev'
      ));
    }

    // Scope boundary questions (always ask)
    questions.push(this.createTemplateQuestion(
      'scope',
      'important',
      'What is explicitly OUT of scope for this POC?',
      'Defining what NOT to build prevents scope creep and focuses effort.',
      round,
      [
        'Mobile support (desktop only)',
        'Full production hardening',
        'Migration of existing data',
      ],
      'pm'
    ));

    // Stakeholder questions
    if (gaps.missingStakeholders) {
      questions.push(this.createTemplateQuestion(
        'stakeholder',
        'important',
        'Who is the primary user of this feature? What is their context?',
        'Understanding the user helps shape UX decisions.',
        round,
        [
          'Internal team member (power user)',
          'External customer (new user)',
          'Admin/operator',
        ],
        'pm'
      ));
    }

    // Timeline questions (always ask)
    questions.push(this.createTemplateQuestion(
      'timeline',
      'nice-to-have',
      'What is the timeline expectation for this POC?',
      'Timeline affects scope and technical decisions.',
      round,
      [
        '1-2 days (quick spike)',
        '1 week (focused POC)',
        '2 weeks (comprehensive POC)',
      ],
      'both',
      '1 week'
    ));

    // Risk questions (always ask)
    questions.push(this.createTemplateQuestion(
      'risk',
      'nice-to-have',
      'What could go wrong? What are the biggest risks or unknowns?',
      'Identifying risks early allows for mitigation.',
      round,
      [
        'External API reliability',
        'Performance at scale',
        'User adoption',
      ],
      'both'
    ));

    // Sort by priority
    return this.sortByPriority(questions);
  }

  /**
   * Create a template question with standard structure
   */
  private createTemplateQuestion(
    type: QuestionType,
    priority: QuestionPriority,
    question: string,
    context: string,
    round: number,
    suggestedAnswers?: string[],
    targetAudience: 'pm' | 'dev' | 'both' = 'both',
    inferredDefault?: string
  ): EnhancedQuestion {
    const id = generateId(`q-${type}-r${round}`);

    return {
      id,
      type,
      priority,
      question,
      context,
      suggestedAnswers,
      inferredDefault,
      targetAudience,
      source: 'template' as const,
    };
  }

  /**
   * Enhance template questions with LLM-generated context-aware questions
   *
   * NOTE: This is a placeholder for LLM integration.
   * In V2 implementation, this will use the LLM client to:
   * 1. Analyze epic content semantically
   * 2. Generate questions specific to detected technologies
   * 3. Create context-aware follow-ups
   * 4. Respect question type taxonomy
   */
  async enhanceWithLLM(
    templateQuestions: EnhancedQuestion[],
    context: QuestionContext
  ): Promise<EnhancedQuestion[]> {
    // TODO: Integrate with LLM client when implemented
    // For now, return template questions as-is
    logger.debug('LLM enhancement not yet implemented, using template questions', {
      epicId: context.epic.id,
    });

    // Placeholder: In real implementation, this would:
    // 1. Call Claude Sonnet with epic + codebase context
    // 2. Generate semantically-informed questions
    // 3. Detect tech stack conflicts (e.g., epic says Postgres, codebase has MongoDB)
    // 4. Create challenge mode questions if enabled

    return templateQuestions;
  }

  /**
   * Generate follow-up questions based on previous answers
   *
   * Detects vague answers and generates clarifying questions
   */
  private generateFollowUpQuestions(
    answers: Answer[],
    context: QuestionContext,
    _useLLM: boolean
  ): EnhancedQuestion[] {
    const followUps: EnhancedQuestion[] = [];

    for (const answer of answers) {
      // Simple vagueness detection (will be enhanced with LLM in V2)
      if (this.isVagueAnswer(answer.answer)) {
        const originalQuestion = this.findQuestionById(answer.questionId, context);
        if (originalQuestion) {
          followUps.push(this.createFollowUpQuestion(answer, originalQuestion, context.round));
        }
      }
    }

    return followUps;
  }

  /**
   * Simple vagueness detection
   * TODO: Replace with LLM-based validation in V2
   */
  private isVagueAnswer(answer: string): boolean {
    const vaguePatterns = [
      /\bstuff\b/i,
      /\bthing\b/i,
      /\bsomething\b/i,
      /\betc\.?\b/i,
      /^.{0,20}$/,  // Very short answers
    ];

    return vaguePatterns.some(pattern => pattern.test(answer));
  }

  /**
   * Create a follow-up question for a vague answer
   */
  private createFollowUpQuestion(
    answer: Answer,
    originalQuestion: Question,
    round: number
  ): EnhancedQuestion {
    const id = generateId(`q-followup-r${round}`);

    return {
      id,
      type: 'clarification',
      priority: 'important',
      question: `Can you provide more specific details about: "${originalQuestion.question}"?`,
      context: `Your previous answer was "${answer.answer}". We need more specific information to proceed.`,
      targetAudience: originalQuestion.targetAudience,
      source: 'follow-up' as const,
      generatedFrom: answer.questionId,
    };
  }

  /**
   * Find a question by ID from context
   */
  private findQuestionById(
    _questionId: string,
    _context: QuestionContext
  ): Question | undefined {
    // In real implementation, this would search through session questions
    // For now, return undefined as placeholder
    return undefined;
  }

  /**
   * Sort questions by priority
   */
  private sortByPriority(questions: EnhancedQuestion[]): EnhancedQuestion[] {
    const priorityOrder: Record<QuestionPriority, number> = {
      critical: 0,
      important: 1,
      'nice-to-have': 2,
    };

    return questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }
}

/**
 * Factory function for creating a question generator instance
 */
export function createQuestionGenerator(): QuestionGenerator {
  return new QuestionGenerator();
}
