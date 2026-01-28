/**
 * LLM Implementation Decomposer
 *
 * Transforms interrogation data into an agent-executable implementation blueprint.
 *
 * This replaces the previous llm-spec-enhancer which produced meta-commentary
 * (inferred risks, unknowns). This module produces the actual implementation
 * blueprint: file manifest, data models, API contracts, task graph, test scenarios.
 *
 * The output is designed so that an AI coding agent can pick it up and implement
 * the entire system without asking a single clarifying question.
 *
 * Gracefully degrades to null when ANTHROPIC_API_KEY is not set.
 */

import { callLLM, isLLMAvailable } from './llm-client.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface FileEntry {
  /** Concrete relative path, e.g. "src/middleware/auth.ts" */
  path: string;
  /** What this file does (1 sentence) */
  purpose: string;
  /** Public exports: function names, class names, type names */
  exports: string[];
  /** Other files from this manifest that this file imports from */
  dependencies: string[];
  /** Framework/library this file primarily uses, if any */
  framework?: string | undefined;
}

export interface FieldDefinition {
  name: string;
  /** Concrete type: "string", "number", "boolean", "Date", "enum(pending,in-progress,done)" */
  type: string;
  required: boolean;
  /** Validation or storage constraint: "max 255 chars", "unique", "foreign key to users.id" */
  constraints?: string | undefined;
}

export interface IndexDefinition {
  name: string;
  fields: string[];
  /** "primary", "unique", "secondary", "GSI", "LSI" */
  type: string;
}

export interface RelationshipDefinition {
  /** Target model name */
  target: string;
  /** "one-to-many", "many-to-one", "many-to-many", "belongs-to" */
  type: string;
  /** Join table or foreign key field */
  via?: string | undefined;
}

export interface DataModel {
  /** Model name, e.g. "Todo", "User" */
  name: string;
  /** Storage backend: "PostgreSQL table", "DynamoDB table", "in-memory", "SQLite" */
  storage: string;
  fields: FieldDefinition[];
  indexes?: IndexDefinition[] | undefined;
  relationships?: RelationshipDefinition[] | undefined;
}

export interface ApiEndpoint {
  method: string;
  /** Route path with params, e.g. "/api/todos/:id" */
  path: string;
  /** What this endpoint does (1 sentence) */
  summary: string;
  /** Whether authentication is required */
  auth: boolean;
  request?: {
    /** URL path parameters with types */
    params?: Record<string, string> | undefined;
    /** Query string parameters with types */
    query?: Record<string, string> | undefined;
    /** Request body fields with types */
    body?: Record<string, string> | undefined;
  } | undefined;
  response: {
    /** Success response */
    success: { status: number; body: string };
    /** Error responses */
    errors: Array<{ status: number; condition: string }>;
  };
}

export interface TaskNode {
  /** Stable identifier, e.g. "task-1" */
  id: string;
  /** Short title */
  title: string;
  /** Concrete description of what to implement (2-3 sentences) */
  description: string;
  /** File paths from the fileManifest that this task creates/modifies */
  files: string[];
  /** Task IDs that must complete before this one can start */
  dependsOn: string[];
  /** Concrete criteria to verify this task is done */
  testCriteria: string[];
}

export interface TestScenario {
  /** Descriptive name, e.g. "Create todo with valid data returns 201" */
  name: string;
  /** "unit", "integration", "e2e" */
  type: string;
  /** What's being tested: file path or endpoint */
  target: string;
  /** Precondition / setup state */
  given: string;
  /** Action taken */
  when: string;
  /** Expected outcome */
  then: string;
  /** Concrete example with actual data */
  example?: {
    input: string;
    expectedOutput: string;
  } | undefined;
}

export interface Decision {
  /** What was decided */
  decision: string;
  /** Why this choice was made */
  rationale: string;
  /** Other options that were considered */
  alternatives: string[];
  /** Whether this can be changed later without major rework */
  reversible: boolean;
}

export interface OpenQuestion {
  question: string;
  impact: 'high' | 'medium' | 'low';
  /** What the agent should do: "Use X as default, flag for review" */
  recommendation: string;
}

/**
 * The complete implementation blueprint.
 * Every field is concrete enough that an AI coding agent can execute
 * without asking clarifying questions.
 */
export interface ImplementationBlueprint {
  /** Synthesized problem statement from the Q&A (1 paragraph) */
  problemStatement: string;
  /** Files to create with purpose, exports, and inter-file dependencies */
  fileManifest: FileEntry[];
  /** Data models with exact fields, types, constraints, indexes */
  dataModels: DataModel[];
  /** API endpoints with request/response contracts */
  apiContracts: ApiEndpoint[];
  /** Ordered implementation tasks with dependency graph */
  taskGraph: TaskNode[];
  /** Concrete test scenarios with Given/When/Then and example data */
  testScenarios: TestScenario[];
  /** Decisions made where the Q&A left ambiguity */
  decisionsLog: Decision[];
  /** Remaining unknowns with recommendations for how the agent should handle them */
  openQuestions: OpenQuestion[];
}

// =============================================================================
// Prompt Construction
// =============================================================================

const SYSTEM_PROMPT = `You are a senior software architect producing an implementation blueprint.

Your output will be consumed DIRECTLY by an AI coding agent. The agent will use your blueprint to implement the entire system without asking any clarifying questions. Every field must be concrete.

CRITICAL RULES:

1. FILE PATHS must be real paths: "src/middleware/auth.ts" not "create an auth module"
2. DATA MODELS must have actual field names and types: "title: string, required, max 255 chars" not "appropriate fields"
3. API ENDPOINTS must have request/response shapes with status codes
4. TASKS must be ordered: task-2 depends on task-1 because it imports from task-1's output
5. TEST SCENARIOS must have concrete inputs and expected outputs
6. Where the Q&A left something ambiguous, MAKE A DEFAULT DECISION and document it in decisionsLog
7. Where something is truly unknown, put it in openQuestions with a concrete recommendation

DO NOT:
- Use vague descriptions like "implement the feature" or "add appropriate validation"
- Produce planning-level output ("research the approach", "design the architecture")
- Repeat the user's words verbatim as requirements
- Leave anything for the agent to figure out

DO:
- Name every file, every field, every endpoint
- Specify types, constraints, and relationships
- Order tasks so the agent can execute them sequentially
- Include error cases in API contracts and test scenarios
- Make concrete technology choices based on what was discussed in Q&A

Return your blueprint as JSON matching the ImplementationBlueprint schema exactly.`;

/**
 * Build the user prompt with all available context from the interrogation.
 */
function buildUserPrompt(params: DecomposerInput): string {
  const sections: string[] = [];

  // Epic content
  sections.push('# ORIGINAL EPIC');
  sections.push('```');
  sections.push(params.epicContent.trim());
  sections.push('```');
  sections.push('');

  // Q&A log
  sections.push(`# INTERROGATION Q&A (${params.qaLog.length} exchanges)`);
  for (const qa of params.qaLog) {
    const scoreNote = qa.score !== undefined ? ` [quality: ${qa.score}/5]` : '';
    sections.push(`## [${qa.area.toUpperCase()}]${scoreNote}`);
    sections.push(`Q: ${qa.question}`);
    sections.push(`A: ${qa.answer}`);
    sections.push('');
  }

  // Signals
  if (params.signals.length > 0) {
    sections.push('# DETECTED SIGNALS (gaps, tensions, assumptions in the epic)');
    for (const signal of params.signals) {
      const addressed = signal.addressed ? ' [ADDRESSED]' : ' [UNADDRESSED]';
      sections.push(`- [${signal.severity.toUpperCase()} ${signal.type}]${addressed}: ${signal.content}`);
    }
    sections.push('');
  }

  // Premises
  if (params.premises.length > 0) {
    sections.push('# EXTRACTED PREMISES (logical commitments from answers)');
    for (const premise of params.premises) {
      sections.push(`- [${premise.type}, ${premise.confidence} confidence]: ${premise.statement}`);
    }
    sections.push('');
  }

  // Contradictions
  if (params.contradictions.length > 0) {
    sections.push('# CONTRADICTIONS DETECTED');
    for (const contradiction of params.contradictions) {
      const status = contradiction.resolved
        ? `[RESOLVED: ${contradiction.resolution}]`
        : '[UNRESOLVED]';
      sections.push(`- ${status} ${contradiction.description}`);
    }
    sections.push('');
  }

  // Structural spec summary
  sections.push('# STRUCTURAL ANALYSIS SUMMARY');
  sections.push(params.structuralSummary);
  sections.push('');

  // Instructions
  sections.push('# TASK');
  sections.push('Decompose the above into a concrete implementation blueprint.');
  sections.push('Return valid JSON matching the ImplementationBlueprint schema.');
  sections.push('Every file path, field name, endpoint, and test must be concrete and specific.');

  return sections.join('\n');
}

// =============================================================================
// Input Types
// =============================================================================

export interface QALogEntry {
  question: string;
  answer: string;
  area: string;
  score?: number | undefined;
}

export interface SignalEntry {
  type: string;
  content: string;
  severity: string;
  addressed: boolean;
}

export interface PremiseEntry {
  statement: string;
  type: string;
  confidence: string;
}

export interface ContradictionEntry {
  description: string;
  resolved: boolean;
  resolution?: string | undefined;
}

export interface DecomposerInput {
  epicContent: string;
  qaLog: QALogEntry[];
  signals: SignalEntry[];
  premises: PremiseEntry[];
  contradictions: ContradictionEntry[];
  structuralSummary: string;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate the LLM response matches ImplementationBlueprint structure.
 * Validates required fields and basic types. Permissive on optional fields.
 */
function validateBlueprint(response: unknown): response is ImplementationBlueprint {
  if (!response || typeof response !== 'object') return false;

  const r = response as Record<string, unknown>;

  // Required string fields
  if (typeof r.problemStatement !== 'string' || r.problemStatement.length === 0) {
    logger.warn('Blueprint validation: missing problemStatement');
    return false;
  }

  // Required arrays
  if (!Array.isArray(r.fileManifest) || r.fileManifest.length === 0) {
    logger.warn('Blueprint validation: missing or empty fileManifest');
    return false;
  }
  if (!Array.isArray(r.taskGraph) || r.taskGraph.length === 0) {
    logger.warn('Blueprint validation: missing or empty taskGraph');
    return false;
  }

  // Optional arrays (must be arrays if present)
  for (const field of ['dataModels', 'apiContracts', 'testScenarios', 'decisionsLog', 'openQuestions']) {
    if (r[field] !== undefined && !Array.isArray(r[field])) {
      logger.warn(`Blueprint validation: ${field} is not an array`);
      return false;
    }
  }

  // Validate fileManifest entries
  for (const file of r.fileManifest as unknown[]) {
    if (!file || typeof file !== 'object') return false;
    const f = file as Record<string, unknown>;
    if (typeof f.path !== 'string' || typeof f.purpose !== 'string') {
      logger.warn('Blueprint validation: fileManifest entry missing path or purpose');
      return false;
    }
  }

  // Validate taskGraph entries
  for (const task of r.taskGraph as unknown[]) {
    if (!task || typeof task !== 'object') return false;
    const t = task as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.title !== 'string') {
      logger.warn('Blueprint validation: taskGraph entry missing id or title');
      return false;
    }
  }

  return true;
}

/**
 * Normalize the LLM response, filling in missing optional arrays with empty arrays.
 */
function normalizeBlueprint(raw: ImplementationBlueprint): ImplementationBlueprint {
  return {
    problemStatement: raw.problemStatement,
    fileManifest: (raw.fileManifest ?? []).map(f => ({
      path: f.path,
      purpose: f.purpose,
      exports: Array.isArray(f.exports) ? f.exports : [],
      dependencies: Array.isArray(f.dependencies) ? f.dependencies : [],
      framework: f.framework,
    })),
    dataModels: (raw.dataModels ?? []).map(m => ({
      name: m.name,
      storage: m.storage ?? 'unknown',
      fields: Array.isArray(m.fields) ? m.fields.map(f => ({
        name: f.name,
        type: f.type,
        required: f.required ?? true,
        constraints: f.constraints,
      })) : [],
      indexes: Array.isArray(m.indexes) ? m.indexes : undefined,
      relationships: Array.isArray(m.relationships) ? m.relationships : undefined,
    })),
    apiContracts: (raw.apiContracts ?? []).map(e => ({
      method: e.method,
      path: e.path,
      summary: e.summary ?? '',
      auth: e.auth ?? false,
      request: e.request,
      response: e.response ?? { success: { status: 200, body: '{}' }, errors: [] },
    })),
    taskGraph: (raw.taskGraph ?? []).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      files: Array.isArray(t.files) ? t.files : [],
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
      testCriteria: Array.isArray(t.testCriteria) ? t.testCriteria : [],
    })),
    testScenarios: (raw.testScenarios ?? []).map(s => ({
      name: s.name,
      type: s.type ?? 'unit',
      target: s.target ?? '',
      given: s.given ?? '',
      when: s.when ?? '',
      then: s.then ?? '',
      example: s.example,
    })),
    decisionsLog: (raw.decisionsLog ?? []).map(d => ({
      decision: d.decision,
      rationale: d.rationale ?? '',
      alternatives: Array.isArray(d.alternatives) ? d.alternatives : [],
      reversible: d.reversible ?? true,
    })),
    openQuestions: (raw.openQuestions ?? []).map(q => ({
      question: q.question,
      impact: (['high', 'medium', 'low'].includes(q.impact) ? q.impact : 'medium') as 'high' | 'medium' | 'low',
      recommendation: q.recommendation ?? '',
    })),
  };
}

// =============================================================================
// Response Unwrapping
// =============================================================================

/**
 * LLMs sometimes wrap JSON in an outer object like { blueprint: {...} } or
 * { result: {...} } or { implementationBlueprint: {...} }.
 * This function detects the wrapping and returns the inner object.
 */
function unwrapResponse(response: Record<string, unknown>): unknown {
  // If it already looks like a blueprint (has problemStatement), return as-is
  if (typeof response['problemStatement'] === 'string') {
    return response;
  }

  // Check known wrapping keys
  const wrapperKeys = [
    'blueprint', 'implementationBlueprint', 'result', 'spec',
    'specification', 'output', 'data', 'response',
  ];

  for (const key of wrapperKeys) {
    const inner = response[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const innerObj = inner as Record<string, unknown>;
      if (typeof innerObj['problemStatement'] === 'string') {
        logger.info(`Unwrapped LLM response from "${key}" wrapper`);
        return innerObj;
      }
    }
  }

  // If only one key exists and it points to an object, try that
  const keys = Object.keys(response);
  if (keys.length === 1 && keys[0]) {
    const inner = response[keys[0]];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      logger.info(`Unwrapped LLM response from single-key "${keys[0]}" wrapper`);
      return inner;
    }
  }

  return response;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Decompose an interrogated epic into an agent-executable implementation blueprint.
 *
 * Returns null when:
 * - ANTHROPIC_API_KEY is not set (graceful degradation)
 * - LLM call fails
 * - Response fails validation
 */
export async function decomposeWithLLM(
  params: DecomposerInput
): Promise<ImplementationBlueprint | null> {
  if (!isLLMAvailable()) {
    logger.info('LLM unavailable, skipping spec decomposition');
    return null;
  }

  logger.info('Decomposing spec into implementation blueprint', {
    epicLength: params.epicContent.length,
    qaCount: params.qaLog.length,
    signalCount: params.signals.length,
    premiseCount: params.premises.length,
    contradictionCount: params.contradictions.length,
  });

  try {
    const userPrompt = buildUserPrompt(params);

    const rawResponse = await callLLM<Record<string, unknown>>(
      SYSTEM_PROMPT,
      userPrompt,
      {
        temperature: 0.3,
        maxTokens: 16384,
      },
    );

    if (!rawResponse) {
      logger.warn('LLM returned null response for spec decomposition');
      return null;
    }

    // Unwrap common LLM wrapping patterns: { blueprint: {...} }, { result: {...} }, etc.
    const response = unwrapResponse(rawResponse);

    if (!validateBlueprint(response)) {
      const respObj = response as Record<string, unknown>;
      logger.error('LLM response failed blueprint validation', {
        keys: Object.keys(respObj),
        hasProblemStatement: typeof respObj['problemStatement'],
        hasFileManifest: Array.isArray(respObj['fileManifest']),
        hasTaskGraph: Array.isArray(respObj['taskGraph']),
        sampleKeys: Object.keys(respObj).slice(0, 5),
        // Log first nested key if it exists
        firstKeyType: Object.keys(respObj).length > 0
          ? typeof respObj[Object.keys(respObj)[0]!]
          : 'empty',
      });
      return null;
    }

    const blueprint = normalizeBlueprint(response);

    logger.info('Successfully decomposed spec into blueprint', {
      files: blueprint.fileManifest.length,
      models: blueprint.dataModels.length,
      endpoints: blueprint.apiContracts.length,
      tasks: blueprint.taskGraph.length,
      tests: blueprint.testScenarios.length,
      decisions: blueprint.decisionsLog.length,
      openQuestions: blueprint.openQuestions.length,
    });

    return blueprint;
  } catch (error) {
    logger.error('Failed to decompose spec with LLM', { error });
    return null;
  }
}
