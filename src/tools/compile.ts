import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { buildCompilationPrompt } from '../prompts/index.js';
import { COVERAGE_AREAS, REQUIRED_COVERAGE, type CoverageArea } from './interrogate.js';

/**
 * Fact extracted from an answer
 */
interface ExtractedFact {
  statement: string;
  confidence: 'high' | 'medium' | 'low';
  area: CoverageArea;
  source: string;
}

/**
 * Insight from feedback loops (when available)
 */
interface PromptInsight {
  pattern: string;
  recommendation: string;
}

/**
 * The executable agent prompt format - THE KEY OUTPUT
 * This is what agents actually execute.
 */
export interface ExecutableAgentPrompts {
  /** Clear problem statement synthesized from scope answers */
  problemStatement: string;

  /** Technical decisions made during interrogation */
  technicalDecisions: Array<{
    decision: string;
    rationale: string;
    alternatives?: string;
  }>;

  /** Prompts for each agent phase */
  agentPrompts: {
    research: string;
    design: string;
    implementation: string;
    test: string;
    review: string;
  };

  /** Testable success criteria from success answers */
  successCriteria: string[];

  /** Risks identified and their mitigations */
  risksAndMitigation: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;

  /** Concrete execution plan with phases */
  executionPlan: Array<{
    phase: string;
    agent: string;
    inputs: string[];
    outputs: string[];
    estimatedEffort: 'S' | 'M' | 'L' | 'XL';
  }>;

  /** Checkpoints requiring human review */
  checkpoints: Array<{
    after: string;
    reviewCriteria: string;
    decision: string;
  }>;
}

/**
 * Output from the compile tool
 */
export interface CompileOutput {
  /** Compilation prompt for the calling LLM */
  compilationPrompt: string;

  /** Context for the LLM to use */
  context: {
    epic: {
      id: string;
      title?: string;
      rawContent: string;
    };
    codebase: {
      techStack: Record<string, unknown>;
      conventions: Record<string, string>;
      relevantFiles: Array<{ path: string; reason: string }>;
      architecture?: string;
    } | null;
    facts: ExtractedFact[];
    insights: PromptInsight[];
  };

  /** Expected output schema for validation */
  expectedOutputSchema: string;

  /** Instructions for the calling LLM */
  instructions: string;
}

/**
 * Tool definition for compilation - THE KEY OUTPUT GENERATOR
 *
 * This tool returns a prompt + context that the calling LLM uses to generate
 * executable agent prompts. Elenchus doesn't call Claude - it provides the
 * structure and state, and the calling LLM provides the intelligence.
 */
export const compileTool: Tool = {
  name: 'elenchus_compile',
  description: `**THE INTENT CONTRACT COMPILER**

This tool transforms interrogation results into executable agent prompts.

## WHAT YOU GET

When you call this tool, you receive:
1. A **compilation prompt** - detailed instructions for generating agent prompts
2. **Context** - epic, codebase analysis, facts, and insights from past executions
3. **Expected output schema** - the JSON structure you must produce

## WHAT YOU DO

Use the compilation prompt and context to generate executable agent prompts:

\`\`\`json
{
  "problemStatement": "Clear, concise description from scope answers",
  "technicalDecisions": [
    { "decision": "Use X", "rationale": "Because Y", "alternatives": "Z" }
  ],
  "agentPrompts": {
    "research": "Full prompt for research agent...",
    "design": "Full prompt for design agent...",
    "implementation": "Full prompt for implementation agent...",
    "test": "Full prompt for test agent...",
    "review": "Full prompt for review agent..."
  },
  "successCriteria": ["Testable criterion 1", "Testable criterion 2"],
  "risksAndMitigation": [
    { "risk": "Risk description", "severity": "high", "mitigation": "How to address" }
  ],
  "executionPlan": [
    { "phase": "Research", "agent": "researcher", "inputs": [...], "outputs": [...], "estimatedEffort": "S" }
  ],
  "checkpoints": [
    { "after": "Design", "reviewCriteria": "What to check", "decision": "Decision point" }
  ]
}
\`\`\`

## REQUIREMENTS

- Every claim must trace to interrogation answers
- Agent prompts must reference actual codebase patterns
- Checkpoints must be at meaningful decision points
- Effort estimates must be realistic for POC scope

## WORKFLOW

1. Call elenchus_generate_spec first (ensures coverage requirements are met)
2. Call this tool to get the compilation prompt and context
3. Generate the executable agent prompts JSON
4. Pass prompts to agent orchestrator (Claude Flow, Task tool, etc.)`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID of the completed interrogation session',
      },
      includeInsights: {
        type: 'boolean',
        description: 'Include learned insights from past executions (feedback loops)',
        default: true,
      },
    },
    required: ['sessionId'],
  },
};

/**
 * Handle compile - THE CORE OF THE INTENT CONTRACT COMPILER
 *
 * Returns a prompt + context for the calling LLM to generate executable agent prompts.
 */
export async function handleCompile(
  args: Record<string, unknown>,
  storage: Storage
): Promise<CompileOutput> {
  const sessionId = args.sessionId as string;
  const includeInsights = args.includeInsights !== false;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Validate session is ready for compilation
  const coverage = calculateCoverage(session);
  const missingRequired = REQUIRED_COVERAGE.filter(area => !coverage[area]);
  if (missingRequired.length > 0) {
    throw new Error(
      `BLOCKED: Missing required coverage areas: ${missingRequired.join(', ')}. ` +
      'Complete interrogation before compilation.'
    );
  }

  const coveredRequired = REQUIRED_COVERAGE.filter(area => coverage[area]).length;
  const clarityScore = Math.round((coveredRequired / REQUIRED_COVERAGE.length) * 100);
  if (clarityScore < 80) {
    throw new Error(
      `BLOCKED: Clarity score is ${clarityScore}% (need 80%+). ` +
      'Complete interrogation before compilation.'
    );
  }

  // Get epic
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  // Get codebase context if available
  let codebaseContext: CompileOutput['context']['codebase'] = null;
  const context = storage.getContextForPath('.');
  if (context) {
    // Transform conventions array into a lookup by type
    const conventionsByType = new Map<string, string>();
    for (const conv of context.conventions) {
      conventionsByType.set(conv.type, conv.pattern);
    }

    codebaseContext = {
      techStack: {
        languages: context.detectedLanguages?.map(l => l.name) ?? [],
        frameworks: context.dependencies?.map(d => d.name) ?? [],
        hasTypeScript: context.hasTypeScript,
        hasTests: context.testCoverage.hasTests,
      },
      conventions: {
        errorHandling: conventionsByType.get('error-handling') ?? 'unknown',
        validation: conventionsByType.get('other') ?? 'unknown', // validation not a separate type
        testing: conventionsByType.get('testing') ?? 'unknown',
        naming: conventionsByType.get('naming') ?? 'unknown',
        fileOrganization: conventionsByType.get('file-structure') ?? 'unknown',
      },
      relevantFiles: context.relevantFiles.map(f => ({
        path: f.path,
        reason: f.reason,
      })),
      architecture: context.architecture,
    };
  }

  // Extract facts from answers
  const facts = extractFacts(session);

  // Get insights from feedback loops (if available and enabled)
  let insights: PromptInsight[] = [];
  if (includeInsights) {
    try {
      const storedInsights = storage.listPromptInsights();
      insights = storedInsights.map(i => ({
        pattern: i.pattern,
        recommendation: i.description, // description is the recommendation
      }));
    } catch {
      // Feedback loops not yet implemented or no insights available
      insights = [];
    }
  }

  // Build the compilation prompt using the prompt library
  const compilationPrompt = buildCompilationPrompt(
    {
      rawContent: epic.rawContent,
      extractedGoals: epic.extractedGoals,
    },
    codebaseContext ? {
      techStack: codebaseContext.techStack,
      conventions: codebaseContext.conventions as any,
      relevantFiles: codebaseContext.relevantFiles,
    } : null,
    facts,
    insights
  );

  // Build the expected output schema documentation
  const expectedOutputSchema = buildExpectedOutputSchema();

  // Build instructions for the calling LLM
  const instructions = buildCompilationInstructions(facts, codebaseContext, insights);

  return {
    compilationPrompt,
    context: {
      epic: {
        id: epic.id,
        title: epic.title,
        rawContent: epic.rawContent,
      },
      codebase: codebaseContext,
      facts,
      insights,
    },
    expectedOutputSchema,
    instructions,
  };
}

/**
 * Calculate coverage by area
 */
function calculateCoverage(
  session: { questions: Array<{ type: string; id: string }>; answers: Array<{ questionId: string }> }
): Record<CoverageArea, boolean> {
  const coverage: Record<CoverageArea, boolean> = {} as Record<CoverageArea, boolean>;

  for (const area of COVERAGE_AREAS) {
    const questionsInArea = session.questions.filter(q => q.type === area);
    const answeredInArea = questionsInArea.filter(q =>
      session.answers.some(a => a.questionId === q.id)
    );
    coverage[area] = answeredInArea.length > 0;
  }

  return coverage;
}

/**
 * Extract facts from session answers
 * Transforms raw Q&A into structured facts for the compilation prompt
 */
function extractFacts(
  session: {
    questions: Array<{ id: string; type: string; question: string; priority: string }>;
    answers: Array<{ questionId: string; answer: string }>;
  }
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const answer of session.answers) {
    const question = session.questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    // Extract fact from Q&A pair
    // High priority questions = high confidence facts
    const confidence: ExtractedFact['confidence'] =
      question.priority === 'critical' ? 'high' :
      question.priority === 'high' ? 'high' :
      question.priority === 'medium' ? 'medium' : 'low';

    facts.push({
      statement: `${question.question} → ${answer.answer}`,
      confidence,
      area: question.type as CoverageArea,
      source: `Q: ${question.question}`,
    });
  }

  return facts;
}

/**
 * Build the expected output schema documentation
 */
function buildExpectedOutputSchema(): string {
  return `{
  "problemStatement": "string - Clear, concise description synthesized from scope answers",

  "technicalDecisions": [
    {
      "decision": "string - What was decided",
      "rationale": "string - Why this choice",
      "alternatives": "string? - What else was considered"
    }
  ],

  "agentPrompts": {
    "research": "string - Full prompt for research agent",
    "design": "string - Full prompt for design agent",
    "implementation": "string - Full prompt for implementation agent",
    "test": "string - Full prompt for test agent",
    "review": "string - Full prompt for review agent"
  },

  "successCriteria": ["string - Testable criteria from success answers"],

  "risksAndMitigation": [
    {
      "risk": "string - Risk description",
      "severity": "'high' | 'medium' | 'low'",
      "mitigation": "string - How to address it"
    }
  ],

  "executionPlan": [
    {
      "phase": "string - Phase name",
      "agent": "string - Agent type (researcher|architect|coder|tester|reviewer)",
      "inputs": ["string - Required inputs"],
      "outputs": ["string - Expected outputs"],
      "estimatedEffort": "'S' | 'M' | 'L' | 'XL'"
    }
  ],

  "checkpoints": [
    {
      "after": "string - Phase name to checkpoint after",
      "reviewCriteria": "string - What to check",
      "decision": "string - Decision point requiring human input"
    }
  ]
}`;
}

/**
 * Build compilation instructions for the calling LLM
 */
function buildCompilationInstructions(
  facts: ExtractedFact[],
  codebase: CompileOutput['context']['codebase'],
  insights: PromptInsight[]
): string {
  const sections: string[] = [];

  sections.push('# Compilation Instructions');
  sections.push('');
  sections.push('You are compiling interrogation results into executable agent prompts.');
  sections.push('');

  // Data summary
  sections.push('## Available Data');
  sections.push(`- **Facts**: ${facts.length} validated facts from interrogation`);
  sections.push(`- **Codebase**: ${codebase ? 'Analyzed' : 'Not analyzed'}`);
  sections.push(`- **Insights**: ${insights.length} patterns from past executions`);
  sections.push('');

  // Facts by area
  sections.push('## Facts by Area');
  for (const area of COVERAGE_AREAS) {
    const areaFacts = facts.filter(f => f.area === area);
    sections.push(`### ${area.charAt(0).toUpperCase() + area.slice(1)} (${areaFacts.length})`);
    if (areaFacts.length === 0) {
      sections.push('(none)');
    } else {
      for (const fact of areaFacts.slice(0, 5)) {
        sections.push(`- [${fact.confidence}] ${fact.statement}`);
      }
      if (areaFacts.length > 5) {
        sections.push(`  ... and ${areaFacts.length - 5} more`);
      }
    }
    sections.push('');
  }

  // Codebase context
  if (codebase) {
    sections.push('## Codebase Context');
    sections.push(`- **Languages**: ${(codebase.techStack as any).languages?.join(', ') || 'unknown'}`);
    sections.push(`- **Architecture**: ${codebase.architecture || 'unknown'}`);
    sections.push(`- **Has Tests**: ${(codebase.techStack as any).hasTests}`);
    sections.push(`- **Has TypeScript**: ${(codebase.techStack as any).hasTypeScript}`);
    sections.push('');
    sections.push('### Conventions to Follow');
    sections.push(`- Error handling: ${codebase.conventions.errorHandling}`);
    sections.push(`- Validation: ${codebase.conventions.validation}`);
    sections.push(`- Testing: ${codebase.conventions.testing}`);
    sections.push('');
  }

  // Insights from feedback loops
  if (insights.length > 0) {
    sections.push('## Learned Insights');
    sections.push('Apply these patterns from past successful executions:');
    for (const insight of insights.slice(0, 5)) {
      sections.push(`- **${insight.pattern}**: ${insight.recommendation}`);
    }
    sections.push('');
  }

  // Compilation requirements
  sections.push('## Requirements');
  sections.push('');
  sections.push('### Agent Prompts');
  sections.push('Each agent prompt must include:');
  sections.push('- **Context**: Relevant codebase patterns and conventions');
  sections.push('- **Task**: Specific, actionable instructions');
  sections.push('- **Constraints**: Technical decisions from interrogation');
  sections.push('- **Output**: Expected deliverables');
  sections.push('');
  sections.push('### Research Agent Prompt');
  sections.push('- Files to analyze from codebase context');
  sections.push('- Patterns to identify');
  sections.push('- Technical questions to answer');
  sections.push('');
  sections.push('### Design Agent Prompt');
  sections.push('- Architecture decisions from technical facts');
  sections.push('- API contracts to define');
  sections.push('- Data models to create');
  sections.push('- Integration points from stakeholder facts');
  sections.push('');
  sections.push('### Implementation Agent Prompt');
  sections.push('- Exact files to create/modify (from codebase context)');
  sections.push('- Code patterns to follow (from conventions)');
  sections.push('- Error handling requirements (from risk facts)');
  sections.push('- Validation requirements (from constraint facts)');
  sections.push('');
  sections.push('### Test Agent Prompt');
  sections.push('- Test scenarios from success criteria facts');
  sections.push('- Edge cases from risk facts');
  sections.push('- Performance requirements from constraint facts');
  sections.push('');
  sections.push('### Review Agent Prompt');
  sections.push('- Convention checklist from codebase analysis');
  sections.push('- Security review points from risk facts');
  sections.push('- Quality criteria from success facts');
  sections.push('');

  // Critical reminders
  sections.push('## Critical');
  sections.push('');
  sections.push('- **Every claim must cite a fact**. No making things up.');
  sections.push('- **Agent prompts must be specific**. Reference actual files and patterns.');
  sections.push('- **Checkpoints at decision points**. Not after every phase.');
  sections.push('- **POC scope**. This is a proof-of-concept, not production.');
  sections.push('- **Apply insights**. Patterns from past executions improve success rate.');

  return sections.join('\n');
}
