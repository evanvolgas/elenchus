import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Epic } from '../types/index.js';
import { CreateEpicInputSchema } from '../types/index.js';
import { generateId } from '../utils/id.js';
import { buildSignalDetectionPrompt } from '../prompts/index.js';

/**
 * elenchus_start - Begin interrogation of an epic
 *
 * This is the entry point. Takes raw epic content, creates the epic and session,
 * detects signals, and returns suggested first-round questions.
 */
export const startTool: Tool = {
  name: 'elenchus_start',
  description: `Begin Socratic interrogation of an epic.

Takes raw epic content and:
1. Stores the epic
2. Detects signals (claims, gaps, tensions, assumptions)
3. Creates an interrogation session
4. Returns suggested questions to ask the user

## Example

\`\`\`json
{
  "source": "text",
  "content": "Build a user dashboard that shows activity metrics. Users should be able to filter by date range."
}
\`\`\`

## What You Get Back

- **epicId** and **sessionId** for tracking
- **signals** - gaps, tensions, assumptions detected in the epic
- **suggestedQuestions** - first-round questions to ask the user
- **nextStep** - what to do next

## Your Job

1. Call this tool with the user's epic
2. Review the detected signals
3. Ask the user the suggested questions (or better ones based on signals)
4. Call \`elenchus_qa\` with their answers`,

  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['text', 'structured'],
        description: 'Source type (use "text" for raw content)',
      },
      content: {
        type: 'string',
        description: 'The epic content to interrogate',
      },
      title: {
        type: 'string',
        description: 'Optional title (extracted automatically if not provided)',
      },
    },
    required: ['source', 'content'],
  },
};

/**
 * Suggested question for the calling LLM to ask
 */
interface SuggestedQuestion {
  question: string;
  area: 'scope' | 'success' | 'constraint' | 'risk' | 'technical';
  basedOn: string; // What signal/gap this addresses
  priority: 'critical' | 'high' | 'medium';
}

/**
 * Result from elenchus_start
 */
export interface StartResult {
  epicId: string;
  sessionId: string;
  epic: {
    title: string;
    description: string;
  };
  signals: {
    claims: Array<{ content: string; quote?: string }>;
    gaps: Array<{ content: string; severity: string }>;
    tensions: Array<{ content: string; severity: string }>;
    assumptions: Array<{ content: string }>;
  };
  suggestedQuestions: SuggestedQuestion[];
  signalDetectionPrompt: string;
  nextStep: string;
}

/**
 * Handle start - create epic, session, detect signals, suggest questions
 */
export async function handleStart(
  args: Record<string, unknown>,
  storage: Storage
): Promise<StartResult> {
  const input = CreateEpicInputSchema.parse(args);

  if (input.source !== 'text' && input.source !== 'structured') {
    throw new Error(`Source "${input.source}" not supported. Use "text".`);
  }

  const now = new Date().toISOString();
  const epicId = generateId('epic');
  const sessionId = generateId('session');

  // Extract basic info from content
  const extracted = extractFromContent(input.content);

  // Create and save epic
  const epic: Epic = {
    id: epicId,
    source: input.source,
    title: input.title ?? extracted.title,
    description: extracted.description,
    rawContent: input.content,
    extractedGoals: extracted.goals,
    extractedConstraints: extracted.constraints,
    extractedAcceptanceCriteria: extracted.acceptanceCriteria,
    extractedStakeholders: [],
    linkedResources: [],
    status: 'interrogating',
    createdAt: now,
    updatedAt: now,
  };
  storage.saveEpic(epic);

  // Create and save session
  const session = {
    id: sessionId,
    epicId,
    status: 'in-progress' as const,
    questions: [],
    answers: [],
    clarityScore: 0,
    completenessScore: 0,
    readyForSpec: false,
    blockers: [],
    round: 1,
    maxRounds: 10,
    startedAt: now,
    updatedAt: now,
  };
  storage.saveSession(session);

  // Generate signal detection prompt for Claude to analyze
  const signalDetectionPrompt = buildSignalDetectionPrompt(input.content);

  // Generate suggested questions based on extracted content
  const suggestedQuestions = generateInitialQuestions(extracted, input.content);

  // Organize signals placeholder (Claude will fill these via analysis)
  const signals = {
    claims: extracted.goals.map(g => ({ content: g })),
    gaps: generateGapHints(input.content),
    tensions: [],
    assumptions: generateAssumptionHints(input.content),
  };

  return {
    epicId,
    sessionId,
    epic: {
      title: epic.title,
      description: epic.description,
    },
    signals,
    suggestedQuestions,
    signalDetectionPrompt,
    nextStep: `Run the signalDetectionPrompt to detect signals, then ask the user the suggested questions. Submit answers via elenchus_qa.`,
  };
}

/**
 * Extract basic structure from epic content
 */
function extractFromContent(content: string): {
  title: string;
  description: string;
  goals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
} {
  const lines = content.split('\n').filter(line => line.trim());

  // Title: first line or first heading
  let title = 'Untitled Epic';
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    title = headingMatch[1];
  } else if (lines[0]) {
    title = lines[0].slice(0, 100);
  }

  // Description: first paragraph
  const description = content.slice(0, 500);

  // Goals: look for action verbs
  const goals: string[] = [];
  const goalPatterns = /(?:should|must|need to|want to|will)\s+([^.!?]+)/gi;
  let match;
  while ((match = goalPatterns.exec(content)) !== null) {
    if (match[1] && match[1].length > 10) {
      goals.push(match[1].trim());
    }
  }

  // Constraints: look for limiting language
  const constraints: string[] = [];
  const constraintPatterns = /(?:must not|cannot|should not|within|under|maximum|minimum|at least|no more than)\s+([^.!?]+)/gi;
  while ((match = constraintPatterns.exec(content)) !== null) {
    if (match[1]) {
      constraints.push(match[1].trim());
    }
  }

  // Acceptance criteria: look for success conditions
  const acceptanceCriteria: string[] = [];
  const criteriaPatterns = /(?:done when|success when|complete when|verified by|tested by)\s+([^.!?]+)/gi;
  while ((match = criteriaPatterns.exec(content)) !== null) {
    if (match[1]) {
      acceptanceCriteria.push(match[1].trim());
    }
  }

  return { title, description, goals, constraints, acceptanceCriteria };
}

/**
 * Generate initial questions based on what's missing
 */
function generateInitialQuestions(
  extracted: { goals: string[]; constraints: string[]; acceptanceCriteria: string[] },
  content: string
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];

  // If no clear success criteria, ask
  if (extracted.acceptanceCriteria.length === 0) {
    questions.push({
      question: 'How will you know this is done? What would you test to verify it works?',
      area: 'success',
      basedOn: 'No acceptance criteria detected',
      priority: 'critical',
    });
  }

  // If no constraints mentioned, ask about them
  if (extracted.constraints.length === 0) {
    questions.push({
      question: 'Are there any constraints? Timeline, budget, technology requirements, compliance needs?',
      area: 'constraint',
      basedOn: 'No constraints detected',
      priority: 'high',
    });
  }

  // Check for common gaps
  if (!content.toLowerCase().includes('error') && !content.toLowerCase().includes('fail')) {
    questions.push({
      question: 'What should happen when something goes wrong? How should errors be handled?',
      area: 'risk',
      basedOn: 'No error handling mentioned',
      priority: 'high',
    });
  }

  if (!content.toLowerCase().includes('user') && !content.toLowerCase().includes('who')) {
    questions.push({
      question: 'Who will use this? Are there different types of users with different permissions?',
      area: 'scope',
      basedOn: 'Users not clearly defined',
      priority: 'high',
    });
  }

  // Always ask about scope boundaries
  questions.push({
    question: 'What is explicitly OUT of scope? What should this NOT do?',
    area: 'scope',
    basedOn: 'Scope boundaries help prevent creep',
    priority: 'medium',
  });

  return questions.slice(0, 5); // Max 5 initial questions
}

/**
 * Generate gap hints based on common missing elements
 */
function generateGapHints(content: string): Array<{ content: string; severity: string }> {
  const gaps: Array<{ content: string; severity: string }> = [];
  const lower = content.toLowerCase();

  if (!lower.includes('error') && !lower.includes('fail') && !lower.includes('exception')) {
    gaps.push({ content: 'Error handling not mentioned', severity: 'high' });
  }
  if (!lower.includes('auth') && !lower.includes('login') && !lower.includes('permission')) {
    gaps.push({ content: 'Authentication/authorization not mentioned', severity: 'medium' });
  }
  if (!lower.includes('scale') && !lower.includes('performance') && !lower.includes('load')) {
    gaps.push({ content: 'Scale/performance requirements not mentioned', severity: 'medium' });
  }
  if (!lower.includes('test') && !lower.includes('verify') && !lower.includes('validate')) {
    gaps.push({ content: 'Testing approach not mentioned', severity: 'medium' });
  }

  return gaps;
}

/**
 * Generate assumption hints
 */
function generateAssumptionHints(content: string): Array<{ content: string }> {
  const assumptions: Array<{ content: string }> = [];
  const lower = content.toLowerCase();

  if (lower.includes('database') || lower.includes('data')) {
    assumptions.push({ content: 'Assumes database exists and is accessible' });
  }
  if (lower.includes('api') || lower.includes('endpoint')) {
    assumptions.push({ content: 'Assumes API infrastructure exists' });
  }
  if (lower.includes('user')) {
    assumptions.push({ content: 'Assumes user management system exists' });
  }

  return assumptions;
}
