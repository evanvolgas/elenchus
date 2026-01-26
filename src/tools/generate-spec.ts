import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type Specification,
  type SpecificationOutput,
  type SpecificationSummary,
  type Phase,
  type Checkpoint,
  type AcceptanceCriterion,
  type Task,
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

/**
 * Extract technical decisions from interrogation answers.
 * This parses answers to find concrete technical choices like:
 * - Framework/library choices (FastAPI, PostgreSQL, etc.)
 * - API endpoint definitions
 * - Database schema/models
 * - Algorithm specifications
 * - Architecture decisions
 */
interface TechnicalDecisions {
  framework?: string;
  language?: string;
  database?: string;
  apiEndpoints: Array<{ method: string; path: string; description: string }>;
  dataModels: Array<{ name: string; fields: string[] }>;
  algorithms: Array<{ name: string; description: string }>;
  integrations: string[];
  architecturePattern?: string;
  rawTechnicalAnswers: Array<{ question: string; answer: string }>;
}

/**
 * Parse API endpoints from an answer string.
 * Looks for patterns like "POST /v1/baselines", "GET /api/users", etc.
 */
function parseApiEndpoints(text: string): Array<{ method: string; path: string; description: string }> {
  const endpoints: Array<{ method: string; path: string; description: string }> = [];

  // Match HTTP method + path patterns
  const methodPathRegex = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([\/\w\-\{\}:]+)/gi;
  let match;

  while ((match = methodPathRegex.exec(text)) !== null) {
    const method = match[1]?.toUpperCase() ?? '';
    const path = match[2] ?? '';
    // Try to extract description from surrounding context
    const contextStart = Math.max(0, match.index - 50);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 100);
    const context = text.slice(contextStart, contextEnd);

    // Look for description after the endpoint (often after a colon or dash)
    const descMatch = context.match(new RegExp(`${path}[:\\-\\s]+([^\\n]+)`, 'i'));
    const description = descMatch?.[1]?.trim().slice(0, 100) || `${method} endpoint`;

    endpoints.push({ method, path, description });
  }

  return endpoints;
}

/**
 * Parse data model definitions from an answer string.
 * Looks for table names, field definitions, schema descriptions.
 */
function parseDataModels(text: string): Array<{ name: string; fields: string[] }> {
  const models: Array<{ name: string; fields: string[] }> = [];

  // Look for table/model definitions with fields
  // Patterns: "baselines table:", "User model:", "CREATE TABLE xyz"
  const modelPatterns = [
    /(?:table|model|entity|schema|type)\s*[:\s]+([A-Z][a-zA-Z_]+)/gi,
    /CREATE\s+TABLE\s+(\w+)/gi,
    /interface\s+(\w+)/gi,
    /class\s+(\w+)/gi,
  ];

  const foundModels = new Set<string>();

  for (const pattern of modelPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const modelName = match[1];
      if (modelName && !foundModels.has(modelName.toLowerCase())) {
        foundModels.add(modelName.toLowerCase());

        // Try to extract fields for this model
        const modelContext = text.slice(match.index, match.index + 500);
        const fields = extractFieldsFromContext(modelContext);

        models.push({
          name: modelName,
          fields: fields.length > 0 ? fields : ['(fields to be determined)'],
        });
      }
    }
  }

  return models;
}

/**
 * Extract field names from a model context.
 */
function extractFieldsFromContext(context: string): string[] {
  const fields: string[] = [];

  // Look for field patterns: "field_name: type", "field_name (type)", "- field_name"
  const fieldPatterns = [
    /[-•]\s*(\w+)\s*[:(]/g,
    /(\w+)\s*:\s*(string|number|int|text|varchar|boolean|uuid|timestamp|date|json)/gi,
    /(\w+)\s+(?:INT|VARCHAR|TEXT|BOOLEAN|UUID|TIMESTAMP|DATE|SERIAL|JSONB?)/gi,
  ];

  for (const pattern of fieldPatterns) {
    let match;
    while ((match = pattern.exec(context)) !== null) {
      const field = match[1];
      if (field && field.length > 1 && field.length < 50) {
        fields.push(field);
      }
    }
  }

  // Dedupe
  return [...new Set(fields)].slice(0, 10);
}

/**
 * Extract framework/technology choices from text.
 */
function extractTechChoices(text: string): { framework?: string; language?: string; database?: string } {
  const result: { framework?: string; language?: string; database?: string } = {};

  // Frameworks (case-insensitive patterns)
  const frameworks = [
    { pattern: /\b(fastapi|fast\s*api)\b/i, name: 'FastAPI' },
    { pattern: /\b(express\.?js?|express)\b/i, name: 'Express.js' },
    { pattern: /\b(next\.?js?|nextjs)\b/i, name: 'Next.js' },
    { pattern: /\b(django)\b/i, name: 'Django' },
    { pattern: /\b(flask)\b/i, name: 'Flask' },
    { pattern: /\b(spring\s*boot|spring)\b/i, name: 'Spring Boot' },
    { pattern: /\b(rails|ruby\s*on\s*rails)\b/i, name: 'Ruby on Rails' },
    { pattern: /\b(nest\.?js?|nestjs)\b/i, name: 'NestJS' },
    { pattern: /\b(gin)\b/i, name: 'Gin' },
    { pattern: /\b(echo)\b/i, name: 'Echo' },
    { pattern: /\b(fiber)\b/i, name: 'Fiber' },
    { pattern: /\b(actix)\b/i, name: 'Actix' },
    { pattern: /\b(rocket)\b/i, name: 'Rocket' },
  ];

  for (const fw of frameworks) {
    if (fw.pattern.test(text)) {
      result.framework = fw.name;
      break;
    }
  }

  // Languages
  const languages = [
    { pattern: /\b(python|py)\b/i, name: 'Python' },
    { pattern: /\b(typescript|ts)\b/i, name: 'TypeScript' },
    { pattern: /\b(javascript|js)\b/i, name: 'JavaScript' },
    { pattern: /\b(golang|go\s+lang|\bgo\b)\b/i, name: 'Go' },
    { pattern: /\b(rust)\b/i, name: 'Rust' },
    { pattern: /\b(java)\b/i, name: 'Java' },
    { pattern: /\b(kotlin)\b/i, name: 'Kotlin' },
    { pattern: /\b(ruby)\b/i, name: 'Ruby' },
    { pattern: /\b(c#|csharp|\.net)\b/i, name: 'C#/.NET' },
  ];

  for (const lang of languages) {
    if (lang.pattern.test(text)) {
      result.language = lang.name;
      break;
    }
  }

  // Databases
  const databases = [
    { pattern: /\b(postgres(?:ql)?|pg)\b/i, name: 'PostgreSQL' },
    { pattern: /\b(mysql)\b/i, name: 'MySQL' },
    { pattern: /\b(sqlite)\b/i, name: 'SQLite' },
    { pattern: /\b(mongodb|mongo)\b/i, name: 'MongoDB' },
    { pattern: /\b(redis)\b/i, name: 'Redis' },
    { pattern: /\b(dynamodb|dynamo)\b/i, name: 'DynamoDB' },
    { pattern: /\b(cassandra)\b/i, name: 'Cassandra' },
    { pattern: /\b(elasticsearch|elastic)\b/i, name: 'Elasticsearch' },
    { pattern: /\b(supabase)\b/i, name: 'Supabase' },
  ];

  for (const db of databases) {
    if (db.pattern.test(text)) {
      result.database = db.name;
      break;
    }
  }

  return result;
}

/**
 * Extract algorithm descriptions from text.
 */
function extractAlgorithms(text: string): Array<{ name: string; description: string }> {
  const algorithms: Array<{ name: string; description: string }> = [];

  // Look for algorithm mentions with context
  const algorithmPatterns = [
    /(?:algorithm|method|approach|technique|strategy)[:\s]+([^\n.]+)/gi,
    /(?:using|implement|apply)\s+(?:a\s+)?(\w+(?:\s+\w+){0,3})\s+(?:algorithm|method|approach)/gi,
    /scoring\s+(?:system|method|algorithm)[:\s]*([^\n]+)/gi,
    /detection\s+(?:method|algorithm|approach)[:\s]*([^\n]+)/gi,
  ];

  for (const pattern of algorithmPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const desc = match[1]?.trim();
      if (desc && desc.length > 5 && desc.length < 200) {
        algorithms.push({
          name: `Algorithm: ${desc.slice(0, 50)}`,
          description: desc,
        });
      }
    }
  }

  return algorithms.slice(0, 5); // Limit to prevent bloat
}

/**
 * Extract all technical decisions from session answers.
 */
function extractTechnicalDecisions(
  session: ReturnType<Storage['getSession']> & {},
  questions: Array<{ id: string; question: string; type: string }>
): TechnicalDecisions {
  const decisions: TechnicalDecisions = {
    apiEndpoints: [],
    dataModels: [],
    algorithms: [],
    integrations: [],
    rawTechnicalAnswers: [],
  };

  // Build a map of question IDs to questions for context
  const questionMap = new Map<string, { question: string; type: string }>();
  for (const q of questions) {
    questionMap.set(q.id, { question: q.question, type: q.type });
  }

  // Process each answer, prioritizing technical answers
  for (const answer of session.answers) {
    const questionInfo = questionMap.get(answer.questionId);
    const answerText = answer.answer;

    // Always capture raw technical answers for transparency
    if (questionInfo?.type === 'technical' ||
        questionInfo?.question.toLowerCase().includes('technical') ||
        questionInfo?.question.toLowerCase().includes('how') ||
        questionInfo?.question.toLowerCase().includes('implement')) {
      decisions.rawTechnicalAnswers.push({
        question: questionInfo?.question ?? answer.questionId,
        answer: answerText,
      });
    }

    // Extract tech choices from all answers
    const techChoices = extractTechChoices(answerText);
    if (techChoices.framework && !decisions.framework) {
      decisions.framework = techChoices.framework;
    }
    if (techChoices.language && !decisions.language) {
      decisions.language = techChoices.language;
    }
    if (techChoices.database && !decisions.database) {
      decisions.database = techChoices.database;
    }

    // Extract API endpoints
    const endpoints = parseApiEndpoints(answerText);
    decisions.apiEndpoints.push(...endpoints);

    // Extract data models
    const models = parseDataModels(answerText);
    decisions.dataModels.push(...models);

    // Extract algorithms
    const algorithms = extractAlgorithms(answerText);
    decisions.algorithms.push(...algorithms);

    // Look for integration mentions
    const integrationPatterns = [
      /integrate\s+(?:with\s+)?(\w+(?:\s+\w+)?)/gi,
      /(?:use|connect\s+to|call)\s+(?:the\s+)?(\w+)\s+(?:api|service)/gi,
    ];

    for (const pattern of integrationPatterns) {
      let match;
      while ((match = pattern.exec(answerText)) !== null) {
        const integration = match[1];
        if (integration && !decisions.integrations.includes(integration)) {
          decisions.integrations.push(integration);
        }
      }
    }

    // Look for architecture patterns
    const archPatterns = [
      { pattern: /\b(microservices?)\b/i, name: 'Microservices' },
      { pattern: /\b(monolith(?:ic)?)\b/i, name: 'Monolithic' },
      { pattern: /\b(serverless)\b/i, name: 'Serverless' },
      { pattern: /\b(event[- ]?driven)\b/i, name: 'Event-Driven' },
      { pattern: /\b(cqrs)\b/i, name: 'CQRS' },
      { pattern: /\b(hexagonal|ports\s+and\s+adapters)\b/i, name: 'Hexagonal' },
      { pattern: /\b(clean\s+architecture)\b/i, name: 'Clean Architecture' },
    ];

    for (const arch of archPatterns) {
      if (arch.pattern.test(answerText) && !decisions.architecturePattern) {
        decisions.architecturePattern = arch.name;
        break;
      }
    }
  }

  // Deduplicate
  decisions.apiEndpoints = dedupeEndpoints(decisions.apiEndpoints);
  decisions.dataModels = dedupeModels(decisions.dataModels);
  decisions.algorithms = decisions.algorithms.slice(0, 5);
  decisions.integrations = [...new Set(decisions.integrations)].slice(0, 10);

  return decisions;
}

function dedupeEndpoints(endpoints: Array<{ method: string; path: string; description: string }>): Array<{ method: string; path: string; description: string }> {
  const seen = new Set<string>();
  return endpoints.filter(ep => {
    const key = `${ep.method}:${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeModels(models: Array<{ name: string; fields: string[] }>): Array<{ name: string; fields: string[] }> {
  const seen = new Set<string>();
  return models.filter(m => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate concrete implementation tasks from technical decisions.
 */
function generateImplementationTasks(
  decisions: TechnicalDecisions,
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  taskIdPrefix: string
): Task[] {
  const tasks: Task[] = [];
  let taskIndex = 1;

  // If we have specific API endpoints, create tasks for each major endpoint group
  if (decisions.apiEndpoints.length > 0) {
    // Group endpoints by resource (path prefix)
    const endpointGroups = groupEndpointsByResource(decisions.apiEndpoints);

    for (const [resource, endpoints] of Object.entries(endpointGroups)) {
      const endpointDescriptions = endpoints
        .map(ep => `${ep.method} ${ep.path}`)
        .slice(0, 5)
        .join(', ');

      tasks.push({
        id: `${taskIdPrefix}-${taskIndex++}`,
        type: 'implement',
        description: `Implement ${resource} API endpoints: ${endpointDescriptions}`,
        agentType: 'coder',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: endpoints.map(ep => `${ep.method} ${ep.path} returns correct response`),
        constraints: decisions.framework ? [`Use ${decisions.framework}`] : [],
        dependsOn: ['task-design-architecture'],
        estimatedTokens: 15000,
        estimatedMinutes: 15,
      });
    }
  }

  // If we have data models, create database setup task
  if (decisions.dataModels.length > 0 && decisions.database) {
    const modelNames = decisions.dataModels.map(m => m.name).join(', ');
    const modelDetails = decisions.dataModels
      .map(m => `${m.name}(${m.fields.slice(0, 5).join(', ')})`)
      .join('; ');

    tasks.push({
      id: `${taskIdPrefix}-${taskIndex++}`,
      type: 'implement',
      description: `Set up ${decisions.database} database schema with models: ${modelDetails}`,
      agentType: 'coder',
      agentModel: 'sonnet',
      files: [],
      acceptanceCriteria: [
        `Database schema created for: ${modelNames}`,
        'Migrations/setup scripts work correctly',
        'Indexes defined for query patterns',
      ],
      constraints: [`Use ${decisions.database}`],
      dependsOn: ['task-design-architecture'],
      estimatedTokens: 10000,
      estimatedMinutes: 10,
    });
  }

  // If we have algorithms, create specific tasks for each
  if (decisions.algorithms.length > 0) {
    for (const algo of decisions.algorithms) {
      tasks.push({
        id: `${taskIdPrefix}-${taskIndex++}`,
        type: 'implement',
        description: `Implement ${algo.name}: ${algo.description}`,
        agentType: 'coder',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: [
          `${algo.name} implemented correctly`,
          'Unit tests cover algorithm logic',
          'Edge cases handled',
        ],
        constraints: [],
        dependsOn: ['task-design-architecture'],
        estimatedTokens: 12000,
        estimatedMinutes: 12,
      });
    }
  }

  // If no specific technical details were extracted, fall back to acceptance criteria
  if (tasks.length === 0) {
    // Use epic acceptance criteria to generate more specific tasks
    const criteriaChunks = chunkArray(epic.extractedAcceptanceCriteria, 3);

    for (let i = 0; i < criteriaChunks.length && i < 3; i++) {
      const criteria = criteriaChunks[i];
      if (!criteria || criteria.length === 0) continue;

      tasks.push({
        id: `${taskIdPrefix}-${taskIndex++}`,
        type: 'implement',
        description: `Implement: ${criteria.slice(0, 2).join('; ')}`,
        agentType: 'coder',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: criteria,
        constraints: epic.extractedConstraints,
        dependsOn: ['task-design-architecture'],
        estimatedTokens: 20000,
        estimatedMinutes: 15,
      });
    }
  }

  return tasks;
}

function groupEndpointsByResource(
  endpoints: Array<{ method: string; path: string; description: string }>
): Record<string, Array<{ method: string; path: string; description: string }>> {
  const groups: Record<string, Array<{ method: string; path: string; description: string }>> = {};

  for (const ep of endpoints) {
    // Extract resource from path (e.g., /v1/baselines -> baselines)
    const parts = ep.path.split('/').filter(p => p && !p.startsWith('v') && !p.startsWith('{'));
    const resource = parts[0] || 'core';

    if (!groups[resource]) {
      groups[resource] = [];
    }
    groups[resource].push(ep);
  }

  return groups;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function buildPhases(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  session: ReturnType<Storage['getSession']> & {},
  context: ReturnType<Storage['getContextForPath']>
): Phase[] {
  const phases: Phase[] = [];

  // Extract technical decisions from interrogation answers
  const decisions = extractTechnicalDecisions(session, session.questions);

  // Build tech stack description for research phase
  const techStack: string[] = [];
  if (decisions.framework) techStack.push(decisions.framework);
  if (decisions.language) techStack.push(decisions.language);
  if (decisions.database) techStack.push(decisions.database);
  const techStackDesc = techStack.length > 0
    ? ` using ${techStack.join(', ')}`
    : '';

  // Phase 1: Research
  phases.push({
    id: 'phase-research',
    name: 'Research',
    description: `Analyze requirements and codebase patterns${techStackDesc}`,
    tasks: [
      {
        id: 'task-research-requirements',
        type: 'research',
        description: decisions.rawTechnicalAnswers.length > 0
          ? `Analyze requirements: ${decisions.rawTechnicalAnswers[0]?.answer.slice(0, 100) ?? 'technical approach'}...`
          : 'Analyze epic requirements and identify implementation approach',
        agentType: 'researcher',
        agentModel: 'haiku',
        files: [],
        acceptanceCriteria: [
          'Requirements documented',
          'Technical approach identified',
          ...(techStack.length > 0 ? [`Tech stack validated: ${techStack.join(', ')}`] : []),
        ],
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

  // Phase 2: Architecture - include concrete technical decisions
  const archDescription = decisions.architecturePattern
    ? `Design ${decisions.architecturePattern} architecture`
    : 'Design technical approach and component structure';

  const archCriteria = [
    'Architecture documented',
    'Data flow defined',
  ];
  if (decisions.apiEndpoints.length > 0) {
    archCriteria.push(`API contract defined (${decisions.apiEndpoints.length} endpoints)`);
  }
  if (decisions.dataModels.length > 0) {
    archCriteria.push(`Data model designed (${decisions.dataModels.map(m => m.name).join(', ')})`);
  }

  phases.push({
    id: 'phase-architecture',
    name: 'Architecture',
    description: archDescription,
    tasks: [
      {
        id: 'task-design-architecture',
        type: 'design',
        description: decisions.apiEndpoints.length > 0
          ? `Design API architecture: ${decisions.apiEndpoints.slice(0, 3).map(ep => `${ep.method} ${ep.path}`).join(', ')}${decisions.apiEndpoints.length > 3 ? '...' : ''}`
          : 'Design component structure and data flow',
        agentType: 'system-architect',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: archCriteria,
        constraints: techStack.length > 0 ? [`Tech stack: ${techStack.join(', ')}`] : [],
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

  // Phase 3: Implementation - generate concrete tasks from technical decisions
  const implementationTasks = generateImplementationTasks(decisions, epic, 'task-implement');

  // If no specific tasks generated, add a meaningful fallback
  if (implementationTasks.length === 0) {
    implementationTasks.push({
      id: 'task-implement-core',
      type: 'implement',
      description: techStack.length > 0
        ? `Implement core functionality with ${techStack.join(', ')}`
        : `Implement: ${epic.extractedGoals[0] || 'core functionality'}`,
      agentType: 'coder',
      agentModel: 'sonnet',
      files: [],
      acceptanceCriteria: epic.extractedAcceptanceCriteria.slice(0, 5),
      constraints: epic.extractedConstraints,
      dependsOn: ['task-design-architecture'],
      estimatedTokens: 50000,
      estimatedMinutes: 30,
    });
  }

  const implDescription = decisions.apiEndpoints.length > 0
    ? `Build the ${decisions.framework || 'API'} implementation with ${decisions.apiEndpoints.length} endpoints`
    : decisions.dataModels.length > 0
    ? `Build the implementation with ${decisions.dataModels.length} data models`
    : 'Build the POC';

  phases.push({
    id: 'phase-implementation',
    name: 'Implementation',
    description: implDescription,
    tasks: implementationTasks,
    parallel: implementationTasks.length > 1, // Allow parallel if multiple tasks
    dependencies: ['phase-architecture'],
    checkpointAfter: true,
    checkpointReason: 'Review implementation before testing',
    estimatedDurationMinutes: implementationTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 15), 0),
  });

  // Phase 4: Testing - reference actual endpoints and models
  const testDescription = decisions.apiEndpoints.length > 0
    ? `Write tests for ${decisions.apiEndpoints.length} API endpoints`
    : decisions.dataModels.length > 0
    ? `Write tests for ${decisions.dataModels.map(m => m.name).join(', ')} models`
    : 'Write unit and integration tests';

  const testCriteria = ['Tests written', 'Coverage > 80%'];
  if (decisions.apiEndpoints.length > 0) {
    testCriteria.push(`All ${decisions.apiEndpoints.length} endpoints have request/response tests`);
  }
  if (decisions.algorithms.length > 0) {
    testCriteria.push(`Algorithm edge cases covered: ${decisions.algorithms.map(a => a.name).join(', ')}`);
  }

  phases.push({
    id: 'phase-testing',
    name: 'Testing',
    description: testDescription,
    tasks: [
      {
        id: 'task-write-tests',
        type: 'test',
        description: testDescription,
        agentType: 'tester',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: testCriteria,
        constraints: [],
        dependsOn: implementationTasks.map(t => t.id),
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
        description: decisions.framework
          ? `Review ${decisions.framework} code quality, security, and best practices`
          : 'Review code quality, security, and best practices',
        agentType: 'reviewer',
        agentModel: 'sonnet',
        files: [],
        acceptanceCriteria: [
          'No critical issues',
          'Best practices followed',
          ...(decisions.database ? [`${decisions.database} queries optimized`] : []),
        ],
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
