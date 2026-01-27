/**
 * Spec Synthesizer Engine
 *
 * Transforms Q&A logs and extracted facts into structured, hierarchical specifications.
 *
 * This engine:
 * 1. Builds requirement hierarchies from related facts
 * 2. Extracts specific metrics and relationships from answers
 * 3. Structures specs appropriately based on quality tier
 * 4. Preserves all detail from interrogation
 * 5. Creates executable specifications for agents
 */

import type {
  Specification,
  Phase,
  Task,
  Metric,
  AcceptanceCriterion,
  TestStrategy,
  CostEstimate,
  DurationEstimate,
  Checkpoint,
} from '../types/spec.js';
import type {
  InterrogationSession,
  Question,
  Answer,
} from '../types/interrogation.js';
import type { Epic } from '../types/epic.js';
import type {
  AnswerEvaluation,
  Signal,
  Conflict,
} from '../types/signals.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

/**
 * Quality tier based on average answer score
 */
export type QualityTier = 1 | 2 | 3 | 4 | 5;

/**
 * Extended Q&A entry with evaluation data
 */
export interface EnrichedQA {
  question: Question;
  answer: Answer;
  evaluation?: AnswerEvaluation | undefined;
}

/**
 * Extracted fact from an answer
 */
export interface ExtractedFact {
  source: string; // Answer ID
  area: string; // Question type
  fact: string;
  specificity: number; // 1-5 score
  metadata?: {
    numbers?: number[];
    technologies?: string[];
    stakeholders?: string[];
    timeframes?: string[];
  } | undefined;
}

/**
 * Hierarchical requirement
 */
export interface Requirement {
  id: string;
  type: 'functional' | 'non-functional' | 'constraint' | 'assumption';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  source: string; // Answer ID
  certainty: 'confirmed' | 'inferred' | 'assumed' | 'unknown';
  children?: Requirement[] | undefined;
  relatedTo?: string[] | undefined; // Other requirement IDs
  acceptanceCriteria?: string[] | undefined;
  metrics?: { name: string; target: string }[] | undefined;
}

/**
 * Structured specification output
 */
export interface StructuredSpec {
  metadata: {
    tier: QualityTier;
    confidence: number;
    generatedAt: string;
    sessionId: string;
    epicId: string;
  };

  problemStatement: {
    summary: string;
    context: string;
    stakeholders: string[];
    userPersona: string;
  };

  requirements: Requirement[];

  constraints: Array<{
    type: 'technical' | 'business' | 'security' | 'performance' | 'compliance';
    description: string;
    source: string;
    rationale?: string | undefined;
  }>;

  risks: Array<{
    risk: string;
    likelihood: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
    source: string;
  }>;

  unknowns: Array<{
    area: string;
    question: string;
    impact: 'low' | 'medium' | 'high';
    recommendation: string;
  }>;

  executionGuidance: {
    phases: Phase[];
    criticalPath: string[];
    dependencies: Record<string, string[]>;
    estimatedDuration?: DurationEstimate;
    estimatedCost?: CostEstimate;
  };

  technicalDecisions: Array<{
    decision: string;
    rationale: string;
    alternatives?: string[] | undefined;
    source: string;
  }>;

  successMetrics: Metric[];

  testStrategy: TestStrategy;

  acceptanceCriteria: AcceptanceCriterion[];

  qaLog: EnrichedQA[];
}

/**
 * Main synthesizer engine
 */
export class SpecSynthesizer {
  /**
   * Synthesize a structured specification from interrogation data
   */
  synthesize(
    epic: Epic,
    session: InterrogationSession,
    evaluations: AnswerEvaluation[],
    signals: Signal[],
    conflicts: Conflict[]
  ): StructuredSpec {
    logger.info('Starting spec synthesis', {
      epicId: epic.id,
      sessionId: session.id,
      qaCount: session.answers.length,
    });

    // Enrich Q&A with evaluation data
    const enrichedQA = this.enrichQA(session, evaluations);

    // Calculate quality tier
    const tier = this.calculateTier(evaluations);
    const confidence = this.calculateConfidence(enrichedQA, signals, conflicts);

    // Extract facts from answers
    const facts = this.extractFacts(enrichedQA);

    // Build hierarchical requirements
    const requirements = this.buildRequirementTree(facts, enrichedQA, tier);

    // Build problem statement
    const problemStatement = this.buildProblemStatement(epic, enrichedQA, facts);

    // Extract constraints
    const constraints = this.extractConstraints(enrichedQA, facts);

    // Extract risks
    const risks = this.extractRisks(enrichedQA);

    // Identify unknowns
    const unknowns = this.identifyUnknowns(enrichedQA, signals, tier);

    // Extract technical decisions
    const technicalDecisions = this.extractTechnicalDecisions(enrichedQA);

    // Build success metrics
    const successMetrics = this.buildSuccessMetrics(enrichedQA, facts);

    // Build test strategy
    const testStrategy = this.buildTestStrategy(enrichedQA, requirements);

    // Build acceptance criteria
    const acceptanceCriteria = this.buildAcceptanceCriteria(requirements, enrichedQA);

    // Build execution guidance
    const executionGuidance = this.buildExecutionGuidance(
      requirements,
      constraints,
      risks,
      enrichedQA
    );

    return {
      metadata: {
        tier,
        confidence,
        generatedAt: new Date().toISOString(),
        sessionId: session.id,
        epicId: epic.id,
      },
      problemStatement,
      requirements,
      constraints,
      risks,
      unknowns,
      executionGuidance,
      technicalDecisions,
      successMetrics,
      testStrategy,
      acceptanceCriteria,
      qaLog: enrichedQA,
    };
  }

  /**
   * Convert structured spec to Specification type for storage
   */
  toSpecification(structured: StructuredSpec, _epic: Epic): Specification {
    const now = new Date().toISOString();

    return {
      id: generateId('spec'),
      epicId: structured.metadata.epicId,
      sessionId: structured.metadata.sessionId,
      version: 1,

      // Business context
      problem: structured.problemStatement.summary,
      userPersona: structured.problemStatement.userPersona,
      successMetrics: structured.successMetrics,
      outOfScope: this.extractOutOfScope(structured.qaLog),

      // Technical context
      constraints: structured.constraints.map(c => ({
        type: c.type,
        description: c.description,
        rationale: c.rationale,
        source: c.source,
      })),
      integrations: [], // TODO: Extract from technical decisions

      // Execution plan
      phases: structured.executionGuidance.phases,
      checkpoints: this.buildCheckpoints(structured.executionGuidance.phases),

      // Validation
      acceptanceCriteria: structured.acceptanceCriteria,
      testStrategy: structured.testStrategy,

      // Estimates
      estimatedCost: structured.executionGuidance.estimatedCost || {
        totalTokens: 0,
        estimatedCostUSD: 0,
        breakdown: {},
        confidence: 'low' as const,
      },
      estimatedDuration: structured.executionGuidance.estimatedDuration || {
        totalMinutes: 0,
        breakdown: {},
        parallelizable: 0,
        confidence: 'low' as const,
      },
      risks: structured.risks.map(r => ({
        id: generateId('risk'),
        description: r.risk,
        likelihood: r.likelihood,
        impact: r.impact,
        mitigation: r.mitigation,
      })),

      // Readiness
      readinessScore: Math.round(structured.metadata.confidence * 100),
      readinessIssues: structured.unknowns.map(u => u.question),

      // Known ambiguities
      knownAmbiguities: structured.unknowns.map(u => ({
        area: u.area,
        description: u.question,
        impact: u.impact,
        recommendation: u.recommendation,
      })),

      // Timestamps
      createdAt: now,
      updatedAt: now,
    };
  }

  // =============================================================================
  // Private implementation
  // =============================================================================

  private enrichQA(
    session: InterrogationSession,
    evaluations: AnswerEvaluation[]
  ): EnrichedQA[] {
    const evalMap = new Map(evaluations.map(e => [e.answerId, e]));

    return session.questions.map(q => {
      const answer = session.answers.find(a => a.questionId === q.id);
      return {
        question: q,
        answer: answer || {
          questionId: q.id,
          answer: '[No answer provided]',
          usedDefault: false,
          answeredAt: new Date().toISOString(),
        },
        evaluation: answer ? evalMap.get(q.id) : undefined,
      };
    });
  }

  private calculateTier(evaluations: AnswerEvaluation[]): QualityTier {
    if (evaluations.length === 0) return 1;

    const avg = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;

    if (avg >= 4.5) return 5;
    if (avg >= 3.5) return 4;
    if (avg >= 2.5) return 3;
    if (avg >= 1.5) return 2;
    return 1;
  }

  private calculateConfidence(
    qa: EnrichedQA[],
    signals: Signal[],
    conflicts: Conflict[]
  ): number {
    let confidence = 0.5;

    // Boost for answered questions
    const answerRate = qa.filter(q => q.answer.answer !== '[No answer provided]').length / qa.length;
    confidence += answerRate * 0.2;

    // Boost for addressed signals
    const addressedSignals = signals.filter(s => s.addressed).length;
    if (signals.length > 0) {
      confidence += (addressedSignals / signals.length) * 0.2;
    }

    // Penalty for unresolved conflicts
    const unresolvedConflicts = conflicts.filter(c => !c.resolved).length;
    confidence -= unresolvedConflicts * 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  private extractFacts(qa: EnrichedQA[]): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    for (const entry of qa) {
      if (entry.answer.answer === '[No answer provided]') continue;

      const fact: ExtractedFact = {
        source: entry.question.id,
        area: entry.question.type,
        fact: entry.answer.answer,
        specificity: entry.evaluation?.score || 1,
        metadata: this.extractMetadata(entry.answer.answer),
      };

      facts.push(fact);
    }

    return facts;
  }

  private extractMetadata(text: string): ExtractedFact['metadata'] {
    const metadata: ExtractedFact['metadata'] = {};

    // Extract numbers
    const numbers = text.match(/\d+(\.\d+)?/g);
    if (numbers) {
      metadata.numbers = numbers.map(n => parseFloat(n));
    }

    // Extract common technologies
    const techPattern = /\b(React|Vue|Angular|Node|Python|Java|TypeScript|JavaScript|SQL|MongoDB|Redis|Docker|Kubernetes|AWS|Azure|GCP)\b/gi;
    const technologies = text.match(techPattern);
    if (technologies) {
      metadata.technologies = [...new Set(technologies.map(t => t.toLowerCase()))];
    }

    // Extract stakeholder types
    const stakeholderPattern = /\b(user|admin|customer|manager|developer|team|stakeholder|client)\b/gi;
    const stakeholders = text.match(stakeholderPattern);
    if (stakeholders) {
      metadata.stakeholders = [...new Set(stakeholders.map(s => s.toLowerCase()))];
    }

    // Extract timeframes
    const timePattern = /\b(\d+\s*(second|minute|hour|day|week|month|year)s?|real-?time|async|synchronous)\b/gi;
    const timeframes = text.match(timePattern);
    if (timeframes) {
      metadata.timeframes = timeframes;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private buildRequirementTree(
    facts: ExtractedFact[],
    _qa: EnrichedQA[],
    tier: QualityTier
  ): Requirement[] {
    // Group facts by area
    const byArea = this.groupByArea(facts);

    const requirements: Requirement[] = [];

    // Build requirements from scope facts
    if (byArea.scope) {
      requirements.push(...this.buildScopeRequirements(byArea.scope, tier));
    }

    // Build requirements from success criteria
    if (byArea.success) {
      requirements.push(...this.buildSuccessRequirements(byArea.success, tier));
    }

    // Build requirements from technical decisions
    if (byArea.technical) {
      requirements.push(...this.buildTechnicalRequirements(byArea.technical, tier));
    }

    // Establish relationships between requirements
    this.linkRequirements(requirements, facts);

    return requirements;
  }

  private groupByArea(facts: ExtractedFact[]): Record<string, ExtractedFact[]> {
    const groups: Record<string, ExtractedFact[]> = {};

    for (const fact of facts) {
      if (!groups[fact.area]) {
        groups[fact.area] = [];
      }
      groups[fact.area]!.push(fact);
    }

    return groups;
  }

  private buildScopeRequirements(facts: ExtractedFact[], tier: QualityTier): Requirement[] {
    const requirements: Requirement[] = [];

    for (const fact of facts) {
      const isNegative = /\b(not|won't|don't|exclude|out of scope)\b/i.test(fact.fact);

      if (isNegative) {
        // Out of scope items become constraints
        continue;
      }

      const req: Requirement = {
        id: generateId('req'),
        type: 'functional',
        priority: this.inferPriority(fact),
        description: fact.fact,
        source: fact.source,
        certainty: this.inferCertainty(fact, tier),
        acceptanceCriteria: this.extractAcceptanceCriteria(fact.fact),
      };

      requirements.push(req);
    }

    return requirements;
  }

  private buildSuccessRequirements(facts: ExtractedFact[], tier: QualityTier): Requirement[] {
    const requirements: Requirement[] = [];

    for (const fact of facts) {
      const req: Requirement = {
        id: generateId('req'),
        type: 'non-functional',
        priority: 'high',
        description: fact.fact,
        source: fact.source,
        certainty: this.inferCertainty(fact, tier),
        metrics: this.extractMetricsFromFact(fact),
      };

      requirements.push(req);
    }

    return requirements;
  }

  private buildTechnicalRequirements(facts: ExtractedFact[], tier: QualityTier): Requirement[] {
    const requirements: Requirement[] = [];

    for (const fact of facts) {
      const req: Requirement = {
        id: generateId('req'),
        type: fact.fact.includes('must') ? 'constraint' : 'functional',
        priority: this.inferPriority(fact),
        description: fact.fact,
        source: fact.source,
        certainty: this.inferCertainty(fact, tier),
      };

      requirements.push(req);
    }

    return requirements;
  }

  private inferPriority(fact: ExtractedFact): Requirement['priority'] {
    const text = fact.fact.toLowerCase();

    if (text.includes('must') || text.includes('critical') || text.includes('required')) {
      return 'critical';
    }
    if (text.includes('should') || text.includes('important')) {
      return 'high';
    }
    if (text.includes('nice to have') || text.includes('optional')) {
      return 'low';
    }

    // Higher specificity = higher priority
    return fact.specificity >= 4 ? 'high' : 'medium';
  }

  private inferCertainty(fact: ExtractedFact, tier: QualityTier): Requirement['certainty'] {
    if (tier >= 4 && fact.specificity >= 4) return 'confirmed';
    if (tier >= 3 && fact.specificity >= 3) return 'inferred';
    if (fact.specificity >= 2) return 'assumed';
    return 'unknown';
  }

  private extractAcceptanceCriteria(text: string): string[] {
    const criteria: string[] = [];

    // Look for Given/When/Then patterns
    const gwtMatch = text.match(/given\s+(.+?)\s+when\s+(.+?)\s+then\s+(.+)/i);
    if (gwtMatch) {
      criteria.push(text);
    }

    // Look for "can", "should", "must" statements
    const modalMatch = text.match(/\b(can|should|must)\s+(.+)/gi);
    if (modalMatch) {
      criteria.push(...modalMatch);
    }

    return criteria;
  }

  private extractMetricsFromFact(fact: ExtractedFact): Requirement['metrics'] {
    if (!fact.metadata?.numbers || !fact.metadata?.timeframes) return undefined;

    const metrics: Requirement['metrics'] = [];

    // Extract performance metrics
    const perfMatch = fact.fact.match(/(&lt;|under|within|less than)\s*(\d+)\s*(ms|second|minute)/i);
    if (perfMatch) {
      metrics.push({
        name: 'Response Time',
        target: `${perfMatch[2]} ${perfMatch[3]}`,
      });
    }

    return metrics.length > 0 ? metrics : undefined;
  }

  private linkRequirements(requirements: Requirement[], _facts: ExtractedFact[]): void {
    // Build simple keyword-based relationships
    for (let i = 0; i < requirements.length; i++) {
      for (let j = i + 1; j < requirements.length; j++) {
        const req1 = requirements[i]!;
        const req2 = requirements[j]!;

        if (this.areRelated(req1.description, req2.description)) {
          if (!req1.relatedTo) req1.relatedTo = [];
          if (!req2.relatedTo) req2.relatedTo = [];

          req1.relatedTo.push(req2.id);
          req2.relatedTo.push(req1.id);
        }
      }
    }
  }

  private areRelated(text1: string, text2: string): boolean {
    // Extract significant words (nouns, verbs)
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 4));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 4));

    // Check for overlap
    const overlap = [...words1].filter(w => words2.has(w));
    return overlap.length >= 2;
  }

  private buildProblemStatement(
    epic: Epic,
    qa: EnrichedQA[],
    facts: ExtractedFact[]
  ): StructuredSpec['problemStatement'] {
    // Extract stakeholders
    const stakeholders = new Set<string>();
    for (const fact of facts) {
      if (fact.metadata?.stakeholders) {
        fact.metadata.stakeholders.forEach(s => stakeholders.add(s));
      }
    }

    // Build user persona from stakeholder answers
    const stakeholderQA = qa.filter(q => q.question.type === 'scope' &&
      q.answer.answer.toLowerCase().includes('user'));

    const userPersona = stakeholderQA.length > 0
      ? stakeholderQA[0]!.answer.answer
      : 'End users of the system';

    return {
      summary: epic.description || epic.title,
      context: epic.rawContent.split('\n')[0] || epic.description,
      stakeholders: [...stakeholders],
      userPersona,
    };
  }

  private extractConstraints(
    _qa: EnrichedQA[],
    facts: ExtractedFact[]
  ): StructuredSpec['constraints'] {
    const constraints: StructuredSpec['constraints'] = [];

    const constraintFacts = facts.filter(f => f.area === 'constraint');

    for (const fact of constraintFacts) {
      const type = this.inferConstraintType(fact.fact);

      constraints.push({
        type,
        description: fact.fact,
        source: fact.source,
        rationale: this.extractRationale(fact.fact),
      });
    }

    return constraints;
  }

  private inferConstraintType(text: string): StructuredSpec['constraints'][0]['type'] {
    const lower = text.toLowerCase();

    if (lower.includes('security') || lower.includes('auth') || lower.includes('encrypt')) {
      return 'security';
    }
    if (lower.includes('performance') || lower.includes('speed') || lower.includes('time')) {
      return 'performance';
    }
    if (lower.includes('compliance') || lower.includes('gdpr') || lower.includes('regulation')) {
      return 'compliance';
    }
    if (lower.includes('technical') || lower.includes('technology') || lower.includes('framework')) {
      return 'technical';
    }

    return 'business';
  }

  private extractRationale(text: string): string | undefined {
    // Look for "because", "since", "to" patterns
    const match = text.match(/\b(because|since|to|in order to)\s+(.+)/i);
    return match ? match[2] : undefined;
  }

  private extractRisks(qa: EnrichedQA[]): StructuredSpec['risks'] {
    const risks: StructuredSpec['risks'] = [];

    const riskQA = qa.filter(q => q.question.type === 'risk');

    for (const entry of riskQA) {
      if (entry.answer.answer === '[No answer provided]') continue;

      risks.push({
        risk: entry.question.question,
        likelihood: 'medium',
        impact: 'medium',
        mitigation: entry.answer.answer,
        source: entry.question.id,
      });
    }

    return risks;
  }

  private identifyUnknowns(
    qa: EnrichedQA[],
    signals: Signal[],
    _tier: QualityTier
  ): StructuredSpec['unknowns'] {
    const unknowns: StructuredSpec['unknowns'] = [];

    // Low-scored answers indicate unknowns
    for (const entry of qa) {
      if (!entry.evaluation || entry.evaluation.score >= 3) continue;

      unknowns.push({
        area: entry.question.type,
        question: entry.question.question,
        impact: this.inferImpact(entry.question.priority),
        recommendation: entry.evaluation.followUp || 'Clarify this requirement before implementation',
      });
    }

    // Unaddressed signals are unknowns
    const unaddressed = signals.filter(s => !s.addressed && s.severity !== 'low');
    for (const signal of unaddressed) {
      unknowns.push({
        area: signal.type,
        question: signal.content,
        impact: signal.severity === 'critical' ? 'high' : 'medium',
        recommendation: `Address this ${signal.type} before proceeding`,
      });
    }

    return unknowns;
  }

  private inferImpact(priority: string): 'low' | 'medium' | 'high' {
    if (priority === 'critical') return 'high';
    if (priority === 'important') return 'medium';
    return 'low';
  }

  private extractTechnicalDecisions(qa: EnrichedQA[]): StructuredSpec['technicalDecisions'] {
    const decisions: StructuredSpec['technicalDecisions'] = [];

    const technicalQA = qa.filter(q => q.question.type === 'technical');

    for (const entry of technicalQA) {
      if (entry.answer.answer === '[No answer provided]') continue;

      decisions.push({
        decision: entry.answer.answer,
        rationale: this.extractRationale(entry.answer.answer) || 'As specified',
        source: entry.question.id,
      });
    }

    return decisions;
  }

  private buildSuccessMetrics(_qa: EnrichedQA[], facts: ExtractedFact[]): Metric[] {
    const metrics: Metric[] = [];

    const successFacts = facts.filter(f => f.area === 'success');

    for (const fact of successFacts) {
      // Extract metrics with targets
      const metricData = this.extractMetricsFromFact(fact);

      if (metricData) {
        for (const m of metricData) {
          metrics.push({
            name: m.name,
            description: fact.fact,
            target: m.target,
            measurement: 'Measure via automated tests',
            priority: 'primary',
          });
        }
      } else {
        // Generic success metric
        metrics.push({
          name: 'Success Criterion',
          description: fact.fact,
          target: 'Meet requirement',
          measurement: 'Manual verification',
          priority: 'secondary',
        });
      }
    }

    return metrics;
  }

  private buildTestStrategy(_qa: EnrichedQA[], requirements: Requirement[]): TestStrategy {
    // Infer test strategy from requirements and Q&A
    const needsE2E = requirements.some(r => r.type === 'functional');
    const needsIntegration = requirements.some(r => r.description.toLowerCase().includes('api') ||
      r.description.toLowerCase().includes('database'));

    return {
      unitTests: true,
      integrationTests: needsIntegration,
      e2eTests: needsE2E,
      coverageTarget: 80,
      notes: ['Automated testing required for all critical paths'],
    };
  }

  private buildAcceptanceCriteria(
    requirements: Requirement[],
    _qa: EnrichedQA[]
  ): AcceptanceCriterion[] {
    const criteria: AcceptanceCriterion[] = [];

    for (const req of requirements) {
      if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
        for (const ac of req.acceptanceCriteria) {
          criteria.push({
            id: generateId('ac'),
            description: ac,
            given: 'System is operational',
            when: 'User performs action',
            then: ac,
            priority: req.priority === 'critical' ? 'must-have' : 'should-have',
            testable: true,
            automatable: true,
          });
        }
      }
    }

    return criteria;
  }

  private buildExecutionGuidance(
    requirements: Requirement[],
    constraints: StructuredSpec['constraints'],
    _risks: StructuredSpec['risks'],
    _qa: EnrichedQA[]
  ): StructuredSpec['executionGuidance'] {
    // Build phases based on requirement types
    const phases: Phase[] = [];

    // Research phase
    phases.push({
      id: generateId('phase'),
      name: 'Research',
      description: 'Gather context and validate technical approach',
      tasks: [
        {
          id: generateId('task'),
          type: 'research',
          description: 'Review codebase and identify integration points',
          agentType: 'researcher',
          files: [],
          acceptanceCriteria: ['Integration points documented'],
          constraints: [],
          dependsOn: [],
        },
      ],
      parallel: false,
      dependencies: [],
      checkpointAfter: true,
      checkpointReason: 'Validate technical approach before implementation',
    });

    // Implementation phase
    const implTasks: Task[] = [];
    for (const req of requirements.filter(r => r.type === 'functional')) {
      implTasks.push({
        id: generateId('task'),
        type: 'implement',
        description: req.description,
        agentType: 'coder',
        files: [],
        acceptanceCriteria: req.acceptanceCriteria || [],
        constraints: constraints.map(c => c.description),
        dependsOn: [],
      });
    }

    phases.push({
      id: generateId('phase'),
      name: 'Implementation',
      description: 'Build core functionality',
      tasks: implTasks,
      parallel: true,
      dependencies: [phases[0]!.id],
      checkpointAfter: true,
      checkpointReason: 'Review implementation before testing',
    });

    // Critical path: research -> implement -> test
    const criticalPath = [
      'Research and validate approach',
      'Implement core requirements',
      'Test and validate',
    ];

    return {
      phases,
      criticalPath,
      dependencies: this.buildDependencyGraph(phases),
    };
  }

  private buildDependencyGraph(phases: Phase[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {};

    for (const phase of phases) {
      graph[phase.id] = phase.dependencies;
    }

    return graph;
  }

  private buildCheckpoints(phases: Phase[]): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];

    for (const phase of phases) {
      if (phase.checkpointAfter) {
        checkpoints.push({
          id: generateId('checkpoint'),
          type: this.inferCheckpointType(phase.name),
          phase: phase.id,
          required: true,
          autoApprove: false,
          description: phase.checkpointReason || `Review ${phase.name} phase`,
          artifactTypes: this.inferArtifactTypes(phase),
          questionsToAsk: [
            'Does this meet the requirements?',
            'Should we proceed to the next phase?',
          ],
        });
      }
    }

    return checkpoints;
  }

  private inferCheckpointType(phaseName: string): Checkpoint['type'] {
    const lower = phaseName.toLowerCase();

    if (lower.includes('research')) return 'post-research';
    if (lower.includes('architecture')) return 'post-architecture';
    if (lower.includes('implement')) return 'post-implementation';

    return 'pre-delivery';
  }

  private inferArtifactTypes(phase: Phase): string[] {
    const artifacts: string[] = [];

    for (const task of phase.tasks) {
      if (task.type === 'implement') artifacts.push('code');
      if (task.type === 'test') artifacts.push('tests');
      if (task.type === 'design') artifacts.push('architecture');
      if (task.type === 'document') artifacts.push('documentation');
    }

    return [...new Set(artifacts)];
  }

  private extractOutOfScope(qa: EnrichedQA[]): string[] {
    const outOfScope: string[] = [];

    for (const entry of qa) {
      if (entry.question.type !== 'scope') continue;

      const lower = entry.answer.answer.toLowerCase();
      if (lower.includes('not') || lower.includes('out of scope') ||
          lower.includes("won't") || lower.includes("don't")) {
        outOfScope.push(entry.answer.answer);
      }
    }

    return outOfScope;
  }
}
