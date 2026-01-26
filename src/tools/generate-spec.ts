import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { GenerateSpecInputSchema } from '../types/index.js';
import { organizeAnswers, type OrganizedAnswers, type AnswerWithContext } from '../engines/answer-extractor.js';
import { generateId } from '../utils/id.js';

/**
 * Output from spec generation - structured data for LLM synthesis
 */
export interface SpecGenerationOutput {
  /** Unique spec ID for reference */
  specId: string;

  /** The original epic */
  epic: {
    id: string;
    title?: string;
    description: string;
    source: string;
  };

  /** Organized answers from interrogation - the raw material */
  answers: OrganizedAnswers;

  /** Codebase context if available */
  codebaseContext: {
    maturity: string;
    architecture: string;
    languages: string[];
    hasTests: boolean;
    hasTypeScript: boolean;
    relevantFiles: string[];
  } | undefined;

  /** Session metrics */
  session: {
    rounds: number;
    questionsAsked: number;
    questionsAnswered: number;
    clarityScore: number;
    completenessScore: number;
  };

  /**
   * INSTRUCTIONS FOR THE CALLING LLM:
   *
   * You have all the raw interrogation data above. YOUR job is to synthesize
   * this into a coherent specification. Elenchus organized the data - you do
   * the thinking.
   *
   * Use the answers to determine:
   * 1. Problem statement (from scope answers)
   * 2. Target users (from stakeholder answers)
   * 3. Success criteria (from success answers)
   * 4. Technical approach (from technical answers)
   * 5. Constraints (from constraint answers)
   * 6. Risks (from risk answers)
   * 7. Timeline (from timeline answers)
   *
   * Then synthesize an execution plan with:
   * - Concrete phases based on what was discussed
   * - Specific tasks derived from the requirements
   * - Realistic estimates based on the scope described
   * - Integration points mentioned in the answers
   * - Data models implied by the domain
   *
   * DO NOT use generic templates. Every part of the spec should trace back
   * to something in the interrogation answers.
   */
  instructions: string;
}

/**
 * Tool definition for spec generation
 */
export const generateSpecTool: Tool = {
  name: 'elenchus_generate_spec',
  description: `Prepare interrogation data for specification synthesis.

**IMPORTANT**: This tool does NOT generate the specification. It organizes
the interrogation answers and returns them to YOU (the calling LLM) to
synthesize into a coherent spec.

Returns:
- The original epic
- All interrogation answers organized by type (scope, technical, success, etc.)
- Codebase context if available
- Session metrics

YOUR job after calling this tool:
1. Read through all the answers
2. Synthesize them into a coherent problem statement
3. Extract concrete technical decisions from the technical answers
4. Derive success criteria from success answers
5. Identify risks from risk answers
6. Build an execution plan based on what was actually discussed
7. Estimate based on the actual scope, not generic formulas

The spec should be grounded in what the user said, not template boilerplate.`,

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
 * Handle spec generation - returns organized data for LLM synthesis
 */
export async function handleGenerateSpec(
  args: Record<string, unknown>,
  storage: Storage
): Promise<SpecGenerationOutput> {
  const input = GenerateSpecInputSchema.parse(args);

  // Get session
  const session = storage.getSession(input.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${input.sessionId}`);
  }

  // Check minimum readiness
  if (session.answers.length === 0) {
    throw new Error(
      `No answers in session. Use elenchus_interrogate to generate questions ` +
      `and elenchus_answer to provide answers first.`
    );
  }

  // Get epic
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  // Organize answers by type
  const organized = organizeAnswers(session);

  // Get codebase context if available and requested
  let codebaseContext: SpecGenerationOutput['codebaseContext'];
  if (input.compact !== false) {
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

  const instructions = `
You have the complete interrogation data for this epic. Synthesize it into a specification.

## What you have:

### Scope Answers (${organized.scope.length})
${formatAnswers(organized.scope)}

### Success Criteria Answers (${organized.success.length})
${formatAnswers(organized.success)}

### Technical Answers (${organized.technical.length})
${formatAnswers(organized.technical)}

### Constraint Answers (${organized.constraints.length})
${formatAnswers(organized.constraints)}

### Stakeholder Answers (${organized.stakeholder.length})
${formatAnswers(organized.stakeholder)}

### Risk Answers (${organized.risk.length})
${formatAnswers(organized.risk)}

### Timeline Answers (${organized.timeline.length})
${formatAnswers(organized.timeline)}

## Your task:

Create a specification that includes:

1. **Problem Statement**: Synthesize from scope answers. What are we actually building and why?

2. **Target Users**: From stakeholder answers. Who uses this and what do they need?

3. **Success Criteria**: From success answers. How do we know when it's done?

4. **Technical Approach**: From technical answers. What technologies, patterns, integrations?

5. **Data Model**: What entities are implied by the domain? (agents, teams, costs, etc.)

6. **Execution Plan**: Concrete phases and tasks based on what was discussed.
   - NOT generic "Research phase" / "Implementation phase"
   - Specific tasks like "Implement Claude API integration" or "Build agent utilization dashboard"

7. **Estimates**: Based on the actual scope described, not fixed formulas.
   - Consider the number of integrations mentioned
   - Consider the complexity of the data model
   - Consider the user's timeline constraints

8. **Risks**: From risk answers, plus any you identify from the technical approach.

9. **Out of Scope**: What was explicitly excluded?

Every section should cite or reference the actual answers. No generic boilerplate.
`.trim();

  return {
    specId,
    epic: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      source: epic.source,
    },
    answers: organized,
    codebaseContext,
    session: {
      rounds: session.round,
      questionsAsked: session.questions.length,
      questionsAnswered: session.answers.length,
      clarityScore: session.clarityScore,
      completenessScore: session.completenessScore,
    },
    instructions,
  };
}

/**
 * Format answers for inclusion in instructions
 */
function formatAnswers(answers: AnswerWithContext[]): string {
  if (answers.length === 0) {
    return '(none provided)';
  }

  return answers.map(a => `
Q: ${a.question}
A: ${a.answer}
`).join('\n');
}
