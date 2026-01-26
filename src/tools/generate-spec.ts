import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { generateId } from '../utils/id.js';
import { COVERAGE_AREAS, REQUIRED_COVERAGE, type CoverageArea } from './interrogate.js';

/**
 * Organized Q&A by coverage area
 */
interface OrganizedQA {
  question: string;
  answer: string;
  priority: string;
  answeredAt?: string | undefined;
}

/**
 * Output from spec generation - organized data for LLM synthesis
 *
 * This is NOT a generated specification. It's the organized interrogation data
 * that the calling LLM will synthesize into a spec.
 */
export interface SpecGenerationOutput {
  /** Unique spec ID for reference */
  specId: string;

  /** The original epic */
  epic: {
    id: string;
    title?: string;
    description: string;
    rawContent: string;
    source: string;
  };

  /** Organized Q&A by coverage area */
  answers: Record<CoverageArea, OrganizedQA[]>;

  /** Codebase context if available */
  codebaseContext?: {
    maturity: string;
    architecture: string;
    languages: string[];
    hasTests: boolean;
    hasTypeScript: boolean;
    relevantFiles: string[];
  } | undefined;

  /** Session metrics */
  session: {
    id: string;
    rounds: number;
    questionsAsked: number;
    questionsAnswered: number;
    clarityScore: number;
  };

  /**
   * Synthesis instructions for the calling LLM
   */
  instructions: string;
}

/**
 * Tool definition for spec generation - THE GATE ENFORCER
 *
 * This tool BLOCKS spec generation until coverage requirements are met.
 * When it does proceed, it returns organized data for the calling LLM to synthesize.
 */
export const generateSpecTool: Tool = {
  name: 'elenchus_generate_spec',
  description: `Get organized interrogation data for specification synthesis.

**THIS IS A GATE.** You can only call this when:
- Clarity score >= 80%
- All required coverage areas have answers (scope, success, constraint, risk)

If requirements aren't met, this tool will REJECT your request and tell you what's missing.

## WHAT YOU GET

When requirements are met, you receive:
1. The original epic
2. All Q&A organized by category
3. Codebase context (if analyzed)
4. Session metrics

## WHAT YOU DO

Synthesize the Q&A into a specification that includes:

1. **Problem Statement** - From scope answers. What are we building and why?
2. **Target Users** - From stakeholder answers. Who uses this?
3. **Success Criteria** - From success answers. How do we know it's done?
4. **Technical Approach** - From technical answers. What technologies/patterns?
5. **Constraints** - From constraint answers. What limits exist?
6. **Risks** - From risk answers. What could go wrong?
7. **Execution Plan** - Specific tasks derived from the above, NOT generic phases

## CRITICAL

- Every section must cite actual Q&A. No generic boilerplate.
- Tasks must be specific ("Implement JWT auth") not generic ("Add authentication")
- If you can't cite a Q&A for something, you're making it up. Don't.`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID of the completed interrogation session',
      },
      includeCodebaseContext: {
        type: 'boolean',
        description: 'Include codebase analysis if available',
        default: true,
      },
    },
    required: ['sessionId'],
  },
};

/**
 * Handle spec generation - THE GATE
 *
 * Blocks if clarity < 80% or required coverage areas are missing.
 */
export async function handleGenerateSpec(
  args: Record<string, unknown>,
  storage: Storage
): Promise<SpecGenerationOutput> {
  const sessionId = args.sessionId as string;
  const includeCodebaseContext = args.includeCodebaseContext !== false;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Check minimum answers
  if (session.answers.length === 0) {
    throw new Error(
      'BLOCKED: No answers in session. ' +
      'Use elenchus_interrogate to get the epic, ask the user questions, ' +
      'then elenchus_answer to submit their responses.'
    );
  }

  // Calculate coverage
  const coverage = calculateCoverage(session);

  // Check required coverage areas
  const missingRequired = REQUIRED_COVERAGE.filter(area => !coverage[area].covered);
  if (missingRequired.length > 0) {
    throw new Error(
      `BLOCKED: Missing required coverage areas: ${missingRequired.join(', ')}. ` +
      'Ask the user questions about these areas and submit via elenchus_answer.'
    );
  }

  // Check clarity score
  const coveredRequired = REQUIRED_COVERAGE.filter(area => coverage[area].covered).length;
  const clarityScore = Math.round((coveredRequired / REQUIRED_COVERAGE.length) * 100);

  if (clarityScore < 80) {
    throw new Error(
      `BLOCKED: Clarity score is ${clarityScore}% (need 80%+). ` +
      'Continue interrogation to improve coverage.'
    );
  }

  // Get epic
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  // Organize answers by type
  const organizedAnswers = organizeAnswers(session);

  // Get codebase context if available
  let codebaseContext: SpecGenerationOutput['codebaseContext'];
  if (includeCodebaseContext) {
    const context = storage.getContextForPath('.');
    if (context) {
      codebaseContext = {
        maturity: context.maturity,
        architecture: context.architecture,
        languages: (context.detectedLanguages ?? []).map(l => l.name),
        hasTests: context.testCoverage.hasTests,
        hasTypeScript: context.hasTypeScript,
        relevantFiles: context.relevantFiles.map(f => f.path).slice(0, 10),
      };
    }
  }

  const specId = generateId('spec');

  // Build synthesis instructions
  const instructions = buildInstructions(organizedAnswers, codebaseContext);

  return {
    specId,
    epic: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      rawContent: epic.rawContent,
      source: epic.source,
    },
    answers: organizedAnswers,
    codebaseContext,
    session: {
      id: session.id,
      rounds: session.round,
      questionsAsked: session.questions.length,
      questionsAnswered: session.answers.length,
      clarityScore,
    },
    instructions,
  };
}

/**
 * Calculate coverage by area
 */
function calculateCoverage(session: { questions: Array<{ id: string; type: string }>; answers: Array<{ questionId: string }> }): Record<CoverageArea, { covered: boolean }> {
  const coverage: Record<CoverageArea, { covered: boolean }> = {} as any;

  for (const area of COVERAGE_AREAS) {
    const questionsInArea = session.questions.filter(q => q.type === area);
    const answeredInArea = questionsInArea.filter(q =>
      session.answers.some(a => a.questionId === q.id)
    );

    coverage[area] = {
      covered: answeredInArea.length > 0,
    };
  }

  return coverage;
}

/**
 * Organize answers by coverage area
 */
function organizeAnswers(session: {
  questions: Array<{ id: string; type: string; question: string; priority: string }>;
  answers: Array<{ questionId: string; answer: string; answeredAt?: string }>;
}): Record<CoverageArea, OrganizedQA[]> {
  const organized: Record<CoverageArea, OrganizedQA[]> = {} as any;

  for (const area of COVERAGE_AREAS) {
    organized[area] = [];
  }

  for (const answer of session.answers) {
    const question = session.questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    const area = question.type as CoverageArea;
    if (!COVERAGE_AREAS.includes(area)) continue;

    organized[area].push({
      question: question.question,
      answer: answer.answer,
      priority: question.priority,
      answeredAt: answer.answeredAt,
    });
  }

  return organized;
}

/**
 * Build synthesis instructions for the calling LLM
 */
function buildInstructions(
  answers: Record<CoverageArea, OrganizedQA[]>,
  codebaseContext?: SpecGenerationOutput['codebaseContext']
): string {
  const sections: string[] = [];

  sections.push('# Specification Synthesis Instructions');
  sections.push('');
  sections.push('You have the complete interrogation data. Synthesize it into a specification.');
  sections.push('');

  // Show what we have
  sections.push('## Available Data');
  sections.push('');

  for (const area of COVERAGE_AREAS) {
    const areaAnswers = answers[area];
    sections.push(`### ${area.charAt(0).toUpperCase() + area.slice(1)} (${areaAnswers.length} answers)`);
    if (areaAnswers.length === 0) {
      sections.push('(none provided)');
    } else {
      for (const qa of areaAnswers) {
        sections.push(`**Q:** ${qa.question}`);
        sections.push(`**A:** ${qa.answer}`);
        sections.push('');
      }
    }
    sections.push('');
  }

  if (codebaseContext) {
    sections.push('### Codebase Context');
    sections.push(`- Maturity: ${codebaseContext.maturity}`);
    sections.push(`- Architecture: ${codebaseContext.architecture}`);
    sections.push(`- Languages: ${codebaseContext.languages.join(', ')}`);
    sections.push(`- Has Tests: ${codebaseContext.hasTests}`);
    sections.push(`- Has TypeScript: ${codebaseContext.hasTypeScript}`);
    if (codebaseContext.relevantFiles.length > 0) {
      sections.push(`- Relevant Files: ${codebaseContext.relevantFiles.join(', ')}`);
    }
    sections.push('');
  }

  // Synthesis requirements
  sections.push('## Your Task');
  sections.push('');
  sections.push('Create a specification with these sections:');
  sections.push('');
  sections.push('1. **Problem Statement** - Synthesize from scope answers');
  sections.push('2. **Target Users** - From stakeholder answers (or infer from scope)');
  sections.push('3. **Success Criteria** - From success answers. Must be measurable.');
  sections.push('4. **Technical Approach** - From technical answers. Specific technologies.');
  sections.push('5. **Constraints** - From constraint answers. Timeline, budget, tech limits.');
  sections.push('6. **Risks** - From risk answers. What could go wrong and mitigation.');
  sections.push('7. **Execution Plan** - Specific tasks derived from the Q&A above.');
  sections.push('');
  sections.push('## Critical Requirements');
  sections.push('');
  sections.push('- **Every claim must cite Q&A.** No making things up.');
  sections.push('- **Tasks must be specific.** "Implement JWT auth with 24h expiry" not "Add auth"');
  sections.push('- **No generic boilerplate.** If it doesn\'t trace to Q&A, remove it.');
  sections.push('- **Match the codebase.** If TypeScript exists, spec TypeScript.');

  return sections.join('\n');
}
