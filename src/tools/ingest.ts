import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type Epic,
  type IngestResult,
  CreateEpicInputSchema,
} from '../types/index.js';
import { generateId } from '../utils/id.js';

/**
 * Tool definition for epic ingestion
 */
export const ingestTool: Tool = {
  name: 'elenchus_ingest',
  description: `Ingest an epic from various sources (text, JIRA, Notion, GitHub, Linear).

Extracts goals, constraints, and acceptance criteria from the epic content.
Returns a structured Epic object ready for interrogation.

Examples:
- Raw text: { "source": "text", "content": "Build a user dashboard..." }
- JIRA: { "source": "jira", "content": "PROJ-123" }
- GitHub: { "source": "github", "content": "owner/repo#42" }`,

  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['text', 'jira', 'notion', 'github', 'linear', 'structured'],
        description: 'Source of the epic',
      },
      content: {
        type: 'string',
        description: 'Epic content or identifier (ticket ID, URL, etc.)',
      },
      title: {
        type: 'string',
        description: 'Optional title override (extracted automatically if not provided)',
      },
      sourceId: {
        type: 'string',
        description: 'Original ID from source system (e.g., JIRA-123)',
      },
    },
    required: ['source', 'content'],
  },
};

/**
 * Handle epic ingestion
 */
export async function handleIngest(
  args: Record<string, unknown>,
  storage: Storage
): Promise<IngestResult> {
  // Validate input
  const input = CreateEpicInputSchema.parse(args);

  // For MVP, we only support text input
  // TODO: Add JIRA, Notion, GitHub, Linear integrations
  if (input.source !== 'text' && input.source !== 'structured') {
    throw new Error(`Source "${input.source}" not yet implemented. Use "text" for now.`);
  }

  // Generate ID
  const id = generateId('epic');
  const now = new Date().toISOString();

  // Extract information from content
  const extracted = extractFromContent(input.content);

  // Create epic
  const epic: Epic = {
    id,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title ?? extracted.title,
    description: extracted.description,
    rawContent: input.content,
    extractedGoals: extracted.goals,
    extractedConstraints: extracted.constraints,
    extractedAcceptanceCriteria: extracted.acceptanceCriteria,
    extractedStakeholders: extracted.stakeholders,
    linkedResources: input.linkedResources ?? [],
    status: 'ingested',
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
  };

  // Save to storage
  storage.saveEpic(epic);

  // Return result
  return {
    epic,
    warnings: extracted.warnings,
    extractionConfidence: extracted.confidence,
  };
}

/**
 * Extract structured information from raw epic content
 *
 * This is a simplified extraction for MVP.
 * In production, this would use LLM for better extraction.
 */
function extractFromContent(content: string): {
  title: string;
  description: string;
  goals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  stakeholders: string[];
  warnings: string[];
  confidence: number;
} {
  const lines = content.split('\n').filter((line) => line.trim());
  const warnings: string[] = [];

  // Extract title (first line or first heading)
  let title = 'Untitled Epic';
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    title = headingMatch[1];
  } else if (lines[0]) {
    title = lines[0].slice(0, 100);
  }

  // Extract description (content after title, before structured sections)
  const description = extractSection(content, ['overview', 'description', 'summary']) || content;

  // Extract goals
  const goals = extractListSection(content, ['goals', 'objectives', 'aims']);
  if (goals.length === 0) {
    warnings.push('No explicit goals found. Consider adding a "Goals" section.');
  }

  // Extract constraints
  const constraints = extractListSection(content, [
    'constraints',
    'requirements',
    'limitations',
    'must have',
  ]);

  // Extract acceptance criteria
  const acceptanceCriteria = extractListSection(content, [
    'acceptance criteria',
    'done when',
    'success criteria',
    'definition of done',
  ]);
  if (acceptanceCriteria.length === 0) {
    warnings.push('No acceptance criteria found. Consider adding a "Acceptance Criteria" section.');
  }

  // Extract stakeholders
  const stakeholders = extractListSection(content, ['stakeholders', 'users', 'personas']);

  // Calculate confidence based on what we found
  let confidence = 50; // Base confidence
  if (goals.length > 0) confidence += 15;
  if (constraints.length > 0) confidence += 10;
  if (acceptanceCriteria.length > 0) confidence += 20;
  if (stakeholders.length > 0) confidence += 5;

  return {
    title,
    description,
    goals,
    constraints,
    acceptanceCriteria,
    stakeholders,
    warnings,
    confidence: Math.min(confidence, 100),
  };
}

/**
 * Extract a text section by heading
 */
function extractSection(content: string, headings: string[]): string | null {
  for (const heading of headings) {
    const regex = new RegExp(`##?\\s*${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n##?\\s|$)`, 'i');
    const match = content.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract a list section by heading
 */
function extractListSection(content: string, headings: string[]): string[] {
  const section = extractSection(content, headings);
  if (!section) return [];

  // Parse list items
  const items: string[] = [];
  const listRegex = /^[-*•]\s*(.+)$/gm;
  let match;
  while ((match = listRegex.exec(section)) !== null) {
    if (match[1]) {
      items.push(match[1].trim());
    }
  }

  // Also try numbered lists
  const numberedRegex = /^\d+[.)]\s*(.+)$/gm;
  while ((match = numberedRegex.exec(section)) !== null) {
    if (match[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}
