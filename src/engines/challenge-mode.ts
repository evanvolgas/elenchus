/**
 * Challenge Mode Engine for Elenchus Interrogation V2
 *
 * Generates devil's advocate questions, surfaces assumptions,
 * and explores alternatives to push for more robust specifications.
 */

import type {
  Question,
  Answer,
  Epic,
  CodebaseContext,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

/**
 * Challenge question types
 */
export type ChallengeType = 'devils-advocate' | 'assumption' | 'alternative';

/**
 * Extended question interface for challenge mode
 */
export interface ChallengeQuestion extends Question {
  source: 'challenge';
  challengeType: ChallengeType;
  assumption?: string;      // The assumption being challenged
  alternative?: string;     // The alternative being proposed
}

/**
 * Identified assumption from answers
 */
interface IdentifiedAssumption {
  assumption: string;
  fromAnswer: string;       // Answer ID
  confidence: number;       // 0-1
  impact: 'low' | 'medium' | 'high';
}

/**
 * Suggested alternative approach
 */
interface Alternative {
  current: string;
  alternative: string;
  rationale: string;
  relevance: number;        // 0-1
}

/**
 * Challenge Mode Engine
 *
 * Generates challenging questions to surface risks, assumptions,
 * and alternative approaches that may not have been considered.
 */
export class ChallengeModeEngine {
  /**
   * Generate challenge questions based on epic, answers, and codebase context
   *
   * @param epic - The epic being interrogated
   * @param answers - Current answers provided
   * @param context - Codebase context for relevant alternatives
   * @returns Array of challenge questions
   */
  async generateChallengeQuestions(
    epic: Epic,
    answers: Answer[],
    context?: CodebaseContext
  ): Promise<ChallengeQuestion[]> {
    logger.debug('Generating challenge questions', {
      epicId: epic.id,
      answerCount: answers.length,
      hasContext: !!context,
    });

    const questions: ChallengeQuestion[] = [];

    // Generate devil's advocate questions
    const devilsAdvocateQuestions = await this.generateDevilsAdvocateQuestions(
      epic,
      answers
    );
    questions.push(...devilsAdvocateQuestions);

    // Generate assumption-surfacing questions
    const assumptions = this.identifyAssumptions(answers);
    const assumptionQuestions = this.generateAssumptionQuestions(
      assumptions,
      epic
    );
    questions.push(...assumptionQuestions);

    // Generate alternative exploration questions
    if (context) {
      const alternatives = this.suggestAlternatives(epic, context);
      const alternativeQuestions = this.generateAlternativeQuestions(
        alternatives,
        epic
      );
      questions.push(...alternativeQuestions);
    }

    logger.info('Generated challenge questions', {
      epicId: epic.id,
      totalQuestions: questions.length,
      breakdown: {
        devilsAdvocate: devilsAdvocateQuestions.length,
        assumptions: assumptionQuestions.length,
        alternatives: context ? questions.length - devilsAdvocateQuestions.length - assumptionQuestions.length : 0,
      },
    });

    return questions;
  }

  /**
   * Generate devil's advocate questions
   *
   * Questions that challenge the approach with failure scenarios:
   * - "What if this fails at 10x scale?"
   * - "What happens when the third-party API is down?"
   * - "How does this work for users with slow connections?"
   */
  private async generateDevilsAdvocateQuestions(
    epic: Epic,
    answers: Answer[]
  ): Promise<ChallengeQuestion[]> {
    const questions: ChallengeQuestion[] = [];

    // Scale challenges
    if (this.mentionsUsers(epic, answers)) {
      questions.push(this.createDevilsAdvocateQuestion(
        'What happens if this feature experiences 10x the expected load?',
        'Scale testing often reveals architectural flaws not visible at normal loads.',
        epic.id,
        'important'
      ));
    }

    // Failure scenario challenges
    if (this.mentionsExternalDependencies(epic, answers)) {
      questions.push(this.createDevilsAdvocateQuestion(
        'What happens when third-party APIs or services are unavailable?',
        'External dependencies introduce failure points that need graceful degradation.',
        epic.id,
        'critical'
      ));
    }

    // Performance challenges
    if (this.mentionsRealtime(epic, answers)) {
      questions.push(this.createDevilsAdvocateQuestion(
        'How does this work for users with slow or unstable network connections?',
        'Real-time features must handle network variability gracefully.',
        epic.id,
        'important'
      ));
    }

    // Data integrity challenges
    if (this.mentionsDataStorage(epic, answers)) {
      questions.push(this.createDevilsAdvocateQuestion(
        'What happens if the database becomes corrupted or data is lost?',
        'Data resilience strategies (backups, replication) should be considered upfront.',
        epic.id,
        'critical'
      ));
    }

    // Concurrency challenges
    if (this.mentionsMultipleUsers(epic, answers)) {
      questions.push(this.createDevilsAdvocateQuestion(
        'What happens when multiple users try to modify the same resource simultaneously?',
        'Concurrent access patterns can lead to race conditions and data conflicts.',
        epic.id,
        'important'
      ));
    }

    return questions;
  }

  /**
   * Identify implicit assumptions from answers
   *
   * Analyzes answers to find unstated assumptions:
   * - "You're assuming users have accounts - is that always true?"
   * - "This assumes data fits in memory - have you validated that?"
   */
  identifyAssumptions(answers: Answer[]): IdentifiedAssumption[] {
    const assumptions: IdentifiedAssumption[] = [];

    for (const answer of answers) {
      const text = answer.answer.toLowerCase();

      // Authentication assumptions
      if ((text.includes('user') || text.includes('account')) &&
          !text.includes('anonymous') && !text.includes('guest')) {
        assumptions.push({
          assumption: 'All users have authenticated accounts',
          fromAnswer: answer.questionId,
          confidence: 0.7,
          impact: 'high',
        });
      }

      // Data size assumptions
      if ((text.includes('load') || text.includes('fetch') || text.includes('cache')) &&
          !text.includes('pagina') && !text.includes('limit')) {
        assumptions.push({
          assumption: 'Data sets fit in memory',
          fromAnswer: answer.questionId,
          confidence: 0.6,
          impact: 'high',
        });
      }

      // Synchronous processing assumptions
      if ((text.includes('process') || text.includes('handle')) &&
          !text.includes('async') && !text.includes('queue') &&
          !text.includes('background')) {
        assumptions.push({
          assumption: 'Processing happens synchronously',
          fromAnswer: answer.questionId,
          confidence: 0.5,
          impact: 'medium',
        });
      }

      // Network reliability assumptions
      if ((text.includes('api') || text.includes('request')) &&
          !text.includes('retry') && !text.includes('timeout') &&
          !text.includes('fallback')) {
        assumptions.push({
          assumption: 'Network requests always succeed',
          fromAnswer: answer.questionId,
          confidence: 0.7,
          impact: 'high',
        });
      }

      // Single-region assumptions
      if (text.includes('deploy') && !text.includes('region') &&
          !text.includes('global')) {
        assumptions.push({
          assumption: 'Single-region deployment is sufficient',
          fromAnswer: answer.questionId,
          confidence: 0.6,
          impact: 'medium',
        });
      }
    }

    // Deduplicate assumptions
    const unique = assumptions.reduce((acc, curr) => {
      if (!acc.some(a => a.assumption === curr.assumption)) {
        acc.push(curr);
      }
      return acc;
    }, [] as IdentifiedAssumption[]);

    return unique;
  }

  /**
   * Generate questions to surface identified assumptions
   */
  private generateAssumptionQuestions(
    assumptions: IdentifiedAssumption[],
    epic: Epic
  ): ChallengeQuestion[] {
    return assumptions.map(assumption => {
      let question: string;
      let context: string;

      switch (assumption.assumption) {
        case 'All users have authenticated accounts':
          question = 'Are you assuming all users will have authenticated accounts? What about guest users or public access?';
          context = 'Many features need to handle both authenticated and unauthenticated states.';
          break;

        case 'Data sets fit in memory':
          question = 'Are you assuming all data will fit in memory? Have you validated data size limits?';
          context = 'Large data sets require pagination, streaming, or distributed processing strategies.';
          break;

        case 'Processing happens synchronously':
          question = 'Are you assuming synchronous processing? Could this benefit from async/background jobs?';
          context = 'Long-running operations may need async processing to avoid blocking user interactions.';
          break;

        case 'Network requests always succeed':
          question = 'Are you assuming network requests will always succeed? What about retries and error handling?';
          context = 'Network failures are common; robust error handling and retry logic are essential.';
          break;

        case 'Single-region deployment is sufficient':
          question = 'Are you assuming single-region deployment? What about latency for global users?';
          context = 'Multi-region deployments may be needed for performance and disaster recovery.';
          break;

        default:
          question = `Are you assuming: ${assumption.assumption}?`;
          context = 'This assumption may not hold in all scenarios.';
      }

      return this.createAssumptionQuestion(
        question,
        context,
        assumption.assumption,
        epic.id,
        assumption.impact === 'high' ? 'critical' : 'important'
      );
    });
  }

  /**
   * Suggest alternative technical approaches based on codebase context
   *
   * Explores alternatives:
   * - "Have you considered GraphQL instead of REST?"
   * - "Would an event-driven architecture fit better here?"
   */
  suggestAlternatives(
    epic: Epic,
    context: CodebaseContext
  ): Alternative[] {
    const alternatives: Alternative[] = [];
    const epicText = `${epic.title} ${epic.description}`.toLowerCase();

    // API style alternatives
    if (epicText.includes('api') || epicText.includes('endpoint')) {
      // REST vs GraphQL
      if (epicText.includes('rest') && !this.hasFramework(context, 'graphql')) {
        alternatives.push({
          current: 'REST API',
          alternative: 'GraphQL',
          rationale: 'GraphQL can reduce over-fetching and provide better flexibility for clients',
          relevance: 0.7,
        });
      }

      // gRPC alternative
      if (epicText.includes('microservice') && !this.hasFramework(context, 'grpc')) {
        alternatives.push({
          current: 'HTTP/REST',
          alternative: 'gRPC',
          rationale: 'gRPC offers better performance and type safety for service-to-service communication',
          relevance: 0.6,
        });
      }
    }

    // Architecture alternatives
    if (epicText.includes('sync') || epicText.includes('process')) {
      // Event-driven
      if (!this.hasFramework(context, 'kafka') && !this.hasFramework(context, 'rabbitmq')) {
        alternatives.push({
          current: 'Synchronous processing',
          alternative: 'Event-driven architecture',
          rationale: 'Event-driven systems provide better decoupling and scalability for async workflows',
          relevance: 0.8,
        });
      }

      // Background jobs
      if (!this.hasFramework(context, 'bull') && !this.hasFramework(context, 'celery')) {
        alternatives.push({
          current: 'Synchronous jobs',
          alternative: 'Background job queue',
          rationale: 'Background jobs prevent blocking and improve user experience for long operations',
          relevance: 0.7,
        });
      }
    }

    // Database alternatives
    if (epicText.includes('database') || epicText.includes('data')) {
      const hasSQL = this.hasFramework(context, 'postgres') || this.hasFramework(context, 'mysql');
      const hasNoSQL = this.hasFramework(context, 'mongodb') || this.hasFramework(context, 'dynamodb');

      if (hasSQL && epicText.includes('unstructured')) {
        alternatives.push({
          current: 'Relational database',
          alternative: 'Document database (MongoDB, DynamoDB)',
          rationale: 'Document databases offer better flexibility for unstructured or evolving schemas',
          relevance: 0.7,
        });
      }

      if (hasNoSQL && epicText.includes('transaction')) {
        alternatives.push({
          current: 'NoSQL database',
          alternative: 'Relational database with ACID transactions',
          rationale: 'Complex transactions are better handled by relational databases with ACID guarantees',
          relevance: 0.8,
        });
      }
    }

    // Caching alternatives
    if (epicText.includes('cache') || epicText.includes('performance')) {
      if (!this.hasFramework(context, 'redis')) {
        alternatives.push({
          current: 'In-memory caching',
          alternative: 'Redis distributed cache',
          rationale: 'Redis provides shared caching across instances and supports complex data structures',
          relevance: 0.8,
        });
      }

      if (this.hasFramework(context, 'redis') && epicText.includes('cdn')) {
        alternatives.push({
          current: 'Server-side caching',
          alternative: 'CDN edge caching',
          rationale: 'CDN caching reduces latency and server load for static and semi-static content',
          relevance: 0.7,
        });
      }
    }

    return alternatives.filter(alt => alt.relevance >= 0.6);
  }

  /**
   * Generate alternative exploration questions
   */
  private generateAlternativeQuestions(
    alternatives: Alternative[],
    epic: Epic
  ): ChallengeQuestion[] {
    return alternatives.map(alt =>
      this.createAlternativeQuestion(
        `Have you considered ${alt.alternative} instead of ${alt.current}?`,
        `${alt.rationale} (Relevance: ${Math.round(alt.relevance * 100)}%)`,
        alt.alternative,
        epic.id,
        alt.relevance >= 0.7 ? 'important' : 'nice-to-have'
      )
    );
  }

  // ========== Helper Methods ==========

  /**
   * Create a devil's advocate challenge question
   */
  private createDevilsAdvocateQuestion(
    question: string,
    context: string,
    _epicId: string,
    priority: 'critical' | 'important' | 'nice-to-have'
  ): ChallengeQuestion {
    return {
      id: `challenge-devils-${randomUUID()}`,
      type: 'risk',
      priority,
      question,
      context,
      source: 'challenge',
      challengeType: 'devils-advocate',
      targetAudience: 'both',
    };
  }

  /**
   * Create an assumption-surfacing question
   */
  private createAssumptionQuestion(
    question: string,
    context: string,
    assumption: string,
    _epicId: string,
    priority: 'critical' | 'important' | 'nice-to-have'
  ): ChallengeQuestion {
    return {
      id: `challenge-assumption-${randomUUID()}`,
      type: 'clarification',
      priority,
      question,
      context,
      source: 'challenge',
      challengeType: 'assumption',
      assumption,
      targetAudience: 'both',
    };
  }

  /**
   * Create an alternative exploration question
   */
  private createAlternativeQuestion(
    question: string,
    context: string,
    alternative: string,
    _epicId: string,
    priority: 'critical' | 'important' | 'nice-to-have'
  ): ChallengeQuestion {
    return {
      id: `challenge-alternative-${randomUUID()}`,
      type: 'technical',
      priority,
      question,
      context,
      source: 'challenge',
      challengeType: 'alternative',
      alternative,
      targetAudience: 'dev',
    };
  }

  /**
   * Check if epic or answers mention users
   */
  private mentionsUsers(epic: Epic, answers: Answer[]): boolean {
    const text = this.getCombinedText(epic, answers);
    return /\b(user|customer|account|visitor)\b/i.test(text);
  }

  /**
   * Check if epic or answers mention external dependencies
   */
  private mentionsExternalDependencies(epic: Epic, answers: Answer[]): boolean {
    const text = this.getCombinedText(epic, answers);
    return /\b(api|service|third[- ]party|external|integration)\b/i.test(text);
  }

  /**
   * Check if epic or answers mention real-time features
   */
  private mentionsRealtime(epic: Epic, answers: Answer[]): boolean {
    const text = this.getCombinedText(epic, answers);
    return /\b(real[- ]time|live|websocket|stream|push)\b/i.test(text);
  }

  /**
   * Check if epic or answers mention data storage
   */
  private mentionsDataStorage(epic: Epic, answers: Answer[]): boolean {
    const text = this.getCombinedText(epic, answers);
    return /\b(database|storage|persist|save|store|cache)\b/i.test(text);
  }

  /**
   * Check if epic or answers mention multiple users
   */
  private mentionsMultipleUsers(epic: Epic, answers: Answer[]): boolean {
    const text = this.getCombinedText(epic, answers);
    return /\b(multi[- ]user|concurrent|collaborate|share|simultaneous)\b/i.test(text);
  }

  /**
   * Check if codebase has a specific framework/tool
   */
  private hasFramework(context: CodebaseContext, name: string): boolean {
    const lowerName = name.toLowerCase();
    return context.dependencies.some(dep =>
      dep.name.toLowerCase().includes(lowerName)
    ) || context.frameworks.some(fw =>
      fw.toLowerCase().includes(lowerName)
    );
  }

  /**
   * Get combined text from epic and answers
   */
  private getCombinedText(epic: Epic, answers: Answer[]): string {
    const epicText = `${epic.title} ${epic.description} ${epic.rawContent}`;
    const answerText = answers.map(a => a.answer).join(' ');
    return `${epicText} ${answerText}`;
  }
}
