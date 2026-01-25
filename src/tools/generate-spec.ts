import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type Specification,
  type SpecificationOutput,
  type SpecificationSummary,
  type Phase,
  type Checkpoint,
  type AcceptanceCriterion,
  GenerateSpecInputSchema,
} from '../types/index.js';
import * as yaml from 'yaml';
import { generateId } from '../utils/id.js';

/**
 * Tool definition for spec generation
 */
export const generateSpecTool: Tool = {
  name: 'elenchus_generate_spec',
  description: `Generate an agent-ready specification from an interrogation session.

Produces the specification in multiple formats:
- YAML: Machine-readable, for agent consumption
- Markdown: Human-readable, for review (default, most token-efficient)
- JSON: Structured task graph for orchestration

**Token Optimization**: By default, returns only a summary and markdown format.
Use format='all' and includeRawSpec=true only when you need the full data.

Options:
- compact (default: true): Reduces size by excluding codebaseContext
- includeRawSpec (default: false): Include the full spec object
- format (default: 'markdown'): Only 'all' returns multiple formats`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID of the completed interrogation session',
      },
      format: {
        type: 'string',
        enum: ['yaml', 'markdown', 'json', 'all'],
        description: 'Output format (default: markdown for token efficiency)',
        default: 'markdown',
      },
      includeEstimates: {
        type: 'boolean',
        description: 'Include cost and duration estimates',
        default: true,
      },
      compact: {
        type: 'boolean',
        description: 'Compact mode: excludes codebaseContext, reduces response size',
        default: true,
      },
      includeRawSpec: {
        type: 'boolean',
        description: 'Include raw spec object (significantly increases response size)',
        default: false,
      },
    },
    required: ['sessionId'],
  },
};

/**
 * Create a compact summary of the specification
 */
function createSummary(spec: Specification): SpecificationSummary {
  const taskCount = spec.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);

  return {
    id: spec.id,
    epicId: spec.epicId,
    sessionId: spec.sessionId,
    version: spec.version,
    problem: spec.problem.length > 200 ? spec.problem.slice(0, 197) + '...' : spec.problem,
    readinessScore: spec.readinessScore,
    readinessIssues: spec.readinessIssues,
    phaseCount: spec.phases.length,
    taskCount,
    estimatedMinutes: spec.estimatedDuration.totalMinutes,
    estimatedCostUSD: spec.estimatedCost.estimatedCostUSD,
    createdAt: spec.createdAt,
  };
}

/**
 * Handle spec generation
 */
export async function handleGenerateSpec(
  args: Record<string, unknown>,
  storage: Storage
): Promise<SpecificationOutput> {
  const input = GenerateSpecInputSchema.parse(args);

  // Get session
  const session = storage.getSession(input.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${input.sessionId}`);
  }

  // Check readiness
  if (!session.readyForSpec && session.clarityScore < 50) {
    throw new Error(
      `Session not ready for spec generation. ` +
      `Clarity: ${session.clarityScore}%, Completeness: ${session.completenessScore}%. ` +
      `Answer more questions first.`
    );
  }

  // Get epic
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  // Get codebase context if available
  const context = storage.getContextForPath('.');

  const now = new Date().toISOString();
  const specId = generateId('spec');

  // Build specification
  const spec: Specification = {
    id: specId,
    epicId: epic.id,
    sessionId: session.id,
    version: 1,

    // Business context
    problem: extractProblem(epic, session),
    userPersona: extractUserPersona(epic, session),
    successMetrics: extractSuccessMetrics(epic, session),
    outOfScope: extractOutOfScope(epic, session),

    // Technical context - exclude in compact mode to save tokens
    codebaseContext: input.compact ? undefined : context,
    constraints: extractConstraints(epic, session),
    integrations: [],

    // Execution plan
    phases: buildPhases(epic, session, context),
    checkpoints: buildCheckpoints(),

    // Validation
    acceptanceCriteria: buildAcceptanceCriteria(epic, session),
    testStrategy: {
      unitTests: true,
      integrationTests: true,
      e2eTests: false,
      coverageTarget: 80,
      testFramework: context?.testCoverage.testFramework,
      notes: ['Focus on critical path coverage', 'Mock external dependencies'],
    },

    // Estimates
    estimatedCost: input.includeEstimates ? estimateCost(epic, session) : {
      totalTokens: 0,
      estimatedCostUSD: 0,
      breakdown: {},
      confidence: 'low',
    },
    estimatedDuration: input.includeEstimates ? estimateDuration(epic, session) : {
      totalMinutes: 0,
      breakdown: {},
      parallelizable: 0,
      confidence: 'low',
    },
    risks: extractRisks(session),

    // Readiness
    readinessScore: calculateReadinessScore(session, context),
    readinessIssues: getReadinessIssues(session, context),

    // Timestamps
    createdAt: now,
    updatedAt: now,
  };

  // Save spec (always save the full spec to storage)
  storage.saveSpec(spec);

  // Build output based on requested format(s)
  // Only include what's requested to minimize token usage
  const output: SpecificationOutput = {
    summary: createSummary(spec),
  };

  // Include raw spec only if explicitly requested
  if (input.includeRawSpec) {
    output.spec = spec;
  }

  // Generate only requested format(s)
  // When 'all' is requested, only return markdown to prevent token explosion
  // The full spec is saved to storage and can be retrieved separately
  const { format } = input;

  if (format === 'all') {
    // Override 'all' to just return markdown + a note
    // This prevents the 25k+ token responses that caused truncation
    output.markdown = generateMarkdown(spec);
    output.note = 'Format "all" now returns only markdown to prevent token overflow. ' +
      'Use format="yaml" or format="json" separately if needed, or retrieve the full spec from storage.';
  } else {
    if (format === 'yaml') {
      output.yaml = yaml.stringify(spec);
    }
    if (format === 'markdown') {
      output.markdown = generateMarkdown(spec);
    }
    if (format === 'json') {
      output.json = JSON.stringify(spec, null, 2);
    }
  }

  return output;
}

function extractProblem(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {}
): string {
  // Look for goal-related answers
  const goalAnswer = session.answers.find(a =>
    a.questionId.includes('goals') || a.questionId.includes('problem')
  );

  if (goalAnswer) {
    return goalAnswer.answer;
  }

  // Fall back to epic goals
  if (epic.extractedGoals.length > 0) {
    return epic.extractedGoals.join('. ');
  }

  return epic.description.slice(0, 500);
}

function extractUserPersona(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {}
): string {
  const personaAnswer = session.answers.find(a =>
    a.questionId.includes('user') || a.questionId.includes('stakeholder')
  );

  if (personaAnswer) {
    return personaAnswer.answer;
  }

  if (epic.extractedStakeholders && epic.extractedStakeholders.length > 0) {
    return epic.extractedStakeholders[0] ?? 'Developer or technical user';
  }

  return 'Developer or technical user';
}

function extractSuccessMetrics(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {}
): Specification['successMetrics'] {
  const metrics: Specification['successMetrics'] = [];

  // From acceptance criteria answers
  const successAnswer = session.answers.find(a =>
    a.questionId.includes('success') || a.questionId.includes('criteria')
  );

  if (successAnswer) {
    metrics.push({
      name: 'Primary Success',
      description: successAnswer.answer,
      target: 'Achieved',
      measurement: 'Manual verification',
      priority: 'primary',
    });
  }

  // From extracted acceptance criteria
  for (const criterion of epic.extractedAcceptanceCriteria.slice(0, 3)) {
    metrics.push({
      name: `Criterion: ${criterion.slice(0, 30)}...`,
      description: criterion,
      target: 'Pass',
      measurement: 'Test or manual verification',
      priority: 'secondary',
    });
  }

  return metrics;
}

function extractOutOfScope(
  _epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {}
): string[] {
  const outOfScopeAnswer = session.answers.find(a =>
    a.questionId.includes('out') && a.questionId.includes('scope')
  );

  if (outOfScopeAnswer) {
    // Parse comma or newline separated items
    return outOfScopeAnswer.answer
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  return ['Production hardening', 'Full error handling', 'Documentation'];
}

function extractConstraints(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {}
): Specification['constraints'] {
  const constraints: Specification['constraints'] = [];

  // From constraint answers
  const constraintAnswer = session.answers.find(a =>
    a.questionId.includes('constraint')
  );

  if (constraintAnswer) {
    constraints.push({
      type: 'technical',
      description: constraintAnswer.answer,
    });
  }

  // From extracted constraints
  for (const c of epic.extractedConstraints) {
    constraints.push({
      type: 'business',
      description: c,
    });
  }

  return constraints;
}

function buildPhases(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  _session: ReturnType<Storage['getSession']> & {},
  context: ReturnType<Storage['getContextForPath']>
): Phase[] {
  const phases: Phase[] = [];

  // Phase 1: Research
  phases.push({
    id: 'phase-research',
    name: 'Research',
    description: 'Analyze requirements and codebase patterns',
    tasks: [
      {
        id: 'task-research-requirements',
        type: 'research',
        description: 'Analyze epic requirements and identify implementation approach',
        agentType: 'researcher',
        agentModel: 'haiku',
        files: [],
        acceptanceCriteria: ['Requirements documented', 'Approach identified'],
        constraints: [],
        dependsOn: [],
        estimatedTokens: 10000,
        estimatedMinutes: 5,
      },
      {
        id: 'task-research-codebase',
        type: 'research',
        description: 'Identify relevant existing patterns and files',
        agentType: 'researcher',
        agentModel: 'haiku',
        files: context?.relevantFiles.map(f => f.path) ?? [],
        acceptanceCriteria: ['Relevant files identified', 'Patterns documented'],
        constraints: [],
        dependsOn: [],
        estimatedTokens: 15000,
        estimatedMinutes: 8,
      },
    ],
    parallel: true,
    dependencies: [],
    checkpointAfter: true,
    checkpointReason: 'Validate research findings before architecture',
    estimatedDurationMinutes: 15,
  });

  // Phase 2: Architecture
  phases.push({
    id: 'phase-architecture',
    name: 'Architecture',
    description: 'Design technical approach and component structure',
    tasks: [
      {
        id: 'task-design-architecture',
        type: 'design',
        description: 'Design component structure and data flow',
        agentType: 'system-architect',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: ['Architecture documented', 'Data flow defined'],
        constraints: [],
        dependsOn: ['task-research-requirements', 'task-research-codebase'],
        estimatedTokens: 20000,
        estimatedMinutes: 10,
      },
    ],
    parallel: false,
    dependencies: ['phase-research'],
    checkpointAfter: true,
    checkpointReason: 'Validate architecture before implementation',
    estimatedDurationMinutes: 10,
  });

  // Phase 3: Implementation
  phases.push({
    id: 'phase-implementation',
    name: 'Implementation',
    description: 'Build the POC',
    tasks: [
      {
        id: 'task-implement-core',
        type: 'implement',
        description: 'Implement core functionality',
        agentType: 'coder',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: epic.extractedAcceptanceCriteria.slice(0, 3),
        constraints: epic.extractedConstraints,
        dependsOn: ['task-design-architecture'],
        estimatedTokens: 50000,
        estimatedMinutes: 30,
      },
    ],
    parallel: false,
    dependencies: ['phase-architecture'],
    checkpointAfter: true,
    checkpointReason: 'Review implementation before testing',
    estimatedDurationMinutes: 30,
  });

  // Phase 4: Testing
  phases.push({
    id: 'phase-testing',
    name: 'Testing',
    description: 'Write and run tests',
    tasks: [
      {
        id: 'task-write-tests',
        type: 'test',
        description: 'Write unit and integration tests',
        agentType: 'tester',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: ['Tests written', 'Coverage > 80%'],
        constraints: [],
        dependsOn: ['task-implement-core'],
        estimatedTokens: 30000,
        estimatedMinutes: 20,
      },
    ],
    parallel: false,
    dependencies: ['phase-implementation'],
    checkpointAfter: false,
    estimatedDurationMinutes: 20,
  });

  // Phase 5: Review
  phases.push({
    id: 'phase-review',
    name: 'Review',
    description: 'Code review and final validation',
    tasks: [
      {
        id: 'task-code-review',
        type: 'review',
        description: 'Review code quality, security, and best practices',
        agentType: 'reviewer',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: ['No critical issues', 'Best practices followed'],
        constraints: [],
        dependsOn: ['task-write-tests'],
        estimatedTokens: 15000,
        estimatedMinutes: 10,
      },
    ],
    parallel: false,
    dependencies: ['phase-testing'],
    checkpointAfter: true,
    checkpointReason: 'Final review before delivery',
    estimatedDurationMinutes: 10,
  });

  return phases;
}

function buildCheckpoints(): Checkpoint[] {
  return [
    {
      id: 'checkpoint-post-research',
      type: 'post-research',
      phase: 'phase-research',
      required: true,
      autoApprove: false,
      description: 'Review research findings before proceeding to architecture',
      artifactTypes: ['research-summary', 'relevant-files-list'],
      questionsToAsk: [
        'Are the research findings accurate?',
        'Should we adjust the scope based on findings?',
      ],
    },
    {
      id: 'checkpoint-post-architecture',
      type: 'post-architecture',
      phase: 'phase-architecture',
      required: true,
      autoApprove: false,
      description: 'Validate architecture before implementation',
      artifactTypes: ['architecture-diagram', 'tech-decisions'],
      questionsToAsk: [
        'Does this architecture fit the existing codebase?',
        'Are there any concerns with this approach?',
      ],
    },
    {
      id: 'checkpoint-post-implementation',
      type: 'post-implementation',
      phase: 'phase-implementation',
      required: true,
      autoApprove: false,
      description: 'Review implementation before testing',
      artifactTypes: ['code-diff', 'implementation-summary'],
      questionsToAsk: [
        'Does the implementation meet requirements?',
        'Any obvious issues to fix?',
      ],
    },
    {
      id: 'checkpoint-pre-delivery',
      type: 'pre-delivery',
      phase: 'phase-review',
      required: true,
      autoApprove: false,
      description: 'Final approval before delivery',
      artifactTypes: ['test-results', 'review-summary', 'delivery-package'],
      questionsToAsk: [
        'Is the POC ready for delivery?',
        'Any known issues to document?',
      ],
    },
  ];
}

/**
 * Maximum acceptance criteria to include in spec output.
 * Prevents token bloat from epics with many extracted criteria.
 */
const MAX_ACCEPTANCE_CRITERIA = 5;

/**
 * Filter out items that look like questions or risks rather than acceptance criteria.
 */
function isValidAcceptanceCriterion(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Filter out questions
  if (text.includes('?')) return false;

  // Filter out risk statements
  if (lowerText.startsWith('fatal:') ||
      lowerText.startsWith('high:') ||
      lowerText.startsWith('medium:') ||
      lowerText.startsWith('low:') ||
      lowerText.includes('risk')) return false;

  // Filter out "should we" type discussions
  if (lowerText.startsWith('should we') ||
      lowerText.startsWith('is the') ||
      lowerText.startsWith('what')) return false;

  // Filter out very short criteria (likely not meaningful)
  if (text.length < 10) return false;

  return true;
}

function buildAcceptanceCriteria(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  _session: ReturnType<Storage['getSession']> & {}
): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = [];

  // Filter to valid acceptance criteria only
  const validCriteria = epic.extractedAcceptanceCriteria.filter(isValidAcceptanceCriterion);

  // Limit to prevent token bloat
  const limitedCriteria = validCriteria.slice(0, MAX_ACCEPTANCE_CRITERIA);

  for (let i = 0; i < limitedCriteria.length; i++) {
    const criterion = limitedCriteria[i];
    if (!criterion) continue;

    // Truncate long criteria descriptions
    const description = criterion.length > 200
      ? criterion.slice(0, 197) + '...'
      : criterion;

    criteria.push({
      id: `ac-${i + 1}`,
      description,
      given: 'The POC is implemented',
      when: 'The user interacts with the feature',
      then: 'Criterion is satisfied',  // Don't duplicate description
      priority: i === 0 ? 'must-have' : 'should-have',
      testable: true,
      automatable: true,
    });
  }

  return criteria;
}

function estimateCost(
  _epic: NonNullable<ReturnType<Storage['getEpic']>>,
  _session: ReturnType<Storage['getSession']> & {}
): Specification['estimatedCost'] {
  // Rough estimation based on phases
  const breakdown: Record<string, number> = {
    'phase-research': 0.05,
    'phase-architecture': 0.10,
    'phase-implementation': 0.50,
    'phase-testing': 0.20,
    'phase-review': 0.10,
  };

  const totalTokens = 140000; // Rough estimate
  const estimatedCostUSD = 0.95; // Based on Sonnet pricing

  return {
    totalTokens,
    estimatedCostUSD,
    breakdown,
    confidence: 'medium',
  };
}

function estimateDuration(
  _epic: NonNullable<ReturnType<Storage['getEpic']>>,
  _session: ReturnType<Storage['getSession']> & {}
): Specification['estimatedDuration'] {
  const breakdown: Record<string, number> = {
    'phase-research': 15,
    'phase-architecture': 10,
    'phase-implementation': 30,
    'phase-testing': 20,
    'phase-review': 10,
  };

  return {
    totalMinutes: 85,
    breakdown,
    parallelizable: 25, // Research tasks can run in parallel
    confidence: 'medium',
  };
}

function extractRisks(
  session: ReturnType<Storage['getSession']> & {}
): Specification['risks'] {
  const risks: Specification['risks'] = [];

  // Check for risk answers
  const riskAnswer = session.answers.find(a => a.questionId.includes('risk'));
  if (riskAnswer) {
    risks.push({
      id: 'risk-user-identified',
      description: riskAnswer.answer,
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Monitor during implementation',
    });
  }

  // Add default risks
  risks.push({
    id: 'risk-scope-creep',
    description: 'Scope may expand during implementation',
    likelihood: 'medium',
    impact: 'medium',
    mitigation: 'Use checkpoints to validate scope at each phase',
  });

  return risks;
}

function calculateReadinessScore(
  session: ReturnType<Storage['getSession']> & {},
  context: ReturnType<Storage['getContextForPath']>
): number {
  let score = session.clarityScore * 0.4 + session.completenessScore * 0.4;

  // Bonus for codebase context
  if (context) {
    score += 10;
    if (context.hasTypeScript) score += 5;
    if (context.testCoverage.hasTests) score += 5;
  }

  return Math.min(Math.round(score), 100);
}

function getReadinessIssues(
  session: ReturnType<Storage['getSession']> & {},
  context: ReturnType<Storage['getContextForPath']>
): string[] {
  const issues: string[] = [];

  if (session.clarityScore < 70) {
    issues.push(`Clarity score below 70% (${session.clarityScore}%)`);
  }

  if (session.completenessScore < 70) {
    issues.push(`Completeness score below 70% (${session.completenessScore}%)`);
  }

  if (!context) {
    issues.push('No codebase context available - consider running elenchus_analyze');
  }

  return issues;
}

function generateMarkdown(spec: Specification): string {
  let md = `# Specification: ${spec.problem.slice(0, 50)}...\n\n`;

  md += `## Overview\n\n`;
  md += `- **Epic ID**: ${spec.epicId}\n`;
  md += `- **Version**: ${spec.version}\n`;
  md += `- **Readiness**: ${spec.readinessScore}%\n\n`;

  md += `## Problem Statement\n\n${spec.problem}\n\n`;

  md += `## User Persona\n\n${spec.userPersona}\n\n`;

  md += `## Success Metrics\n\n`;
  for (const metric of spec.successMetrics) {
    md += `- **${metric.name}**: ${metric.description}\n`;
  }
  md += `\n`;

  md += `## Out of Scope\n\n`;
  for (const item of spec.outOfScope) {
    md += `- ${item}\n`;
  }
  md += `\n`;

  md += `## Execution Plan\n\n`;
  for (const phase of spec.phases) {
    md += `### ${phase.name}\n\n`;
    md += `${phase.description}\n\n`;
    md += `**Tasks**:\n`;
    for (const task of phase.tasks) {
      md += `- ${task.description} (${task.agentType})\n`;
    }
    if (phase.checkpointAfter) {
      md += `\n*Checkpoint: ${phase.checkpointReason}*\n`;
    }
    md += `\n`;
  }

  md += `## Acceptance Criteria\n\n`;
  for (const criterion of spec.acceptanceCriteria) {
    md += `### ${criterion.id}: ${criterion.description.slice(0, 50)}...\n\n`;
    md += `- **Given**: ${criterion.given}\n`;
    md += `- **When**: ${criterion.when}\n`;
    md += `- **Then**: ${criterion.then}\n\n`;
  }

  md += `## Estimates\n\n`;
  md += `- **Duration**: ${spec.estimatedDuration.totalMinutes} minutes\n`;
  md += `- **Cost**: $${spec.estimatedCost.estimatedCostUSD.toFixed(2)}\n`;
  md += `- **Confidence**: ${spec.estimatedCost.confidence}\n\n`;

  md += `## Risks\n\n`;
  for (const risk of spec.risks) {
    md += `- **${risk.description}** (${risk.likelihood}/${risk.impact})\n`;
    md += `  - Mitigation: ${risk.mitigation}\n`;
  }

  return md;
}
