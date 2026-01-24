import { z } from 'zod';

/**
 * Epic source types - where the epic originated from
 */
export const EpicSourceSchema = z.enum([
  'text',      // Raw text input
  'jira',      // JIRA ticket
  'notion',    // Notion page
  'github',    // GitHub issue
  'linear',    // Linear issue
  'structured' // Programmatic input
]);

export type EpicSource = z.infer<typeof EpicSourceSchema>;

/**
 * Linked resource within an epic
 */
export const ResourceSchema = z.object({
  type: z.enum(['document', 'figma', 'api', 'repository', 'other']),
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
});

export type Resource = z.infer<typeof ResourceSchema>;

/**
 * Epic status in the pipeline
 */
export const EpicStatusSchema = z.enum([
  'ingested',      // Just received
  'analyzing',     // Codebase analysis in progress
  'interrogating', // Clarification questions being asked
  'specifying',    // Spec being generated
  'ready',         // Ready for execution
  'executing',     // POC being built
  'delivered',     // POC delivered
  'failed'         // Something went wrong
]);

export type EpicStatus = z.infer<typeof EpicStatusSchema>;

/**
 * Core Epic interface - the central entity
 */
export const EpicSchema = z.object({
  id: z.string(),
  source: EpicSourceSchema,
  sourceId: z.string().optional(), // Original ID from source system (JIRA-123, etc.)

  // Content
  title: z.string(),
  description: z.string(),
  rawContent: z.string(),

  // Extracted information (from LLM analysis)
  extractedGoals: z.array(z.string()),
  extractedConstraints: z.array(z.string()),
  extractedAcceptanceCriteria: z.array(z.string()),
  extractedStakeholders: z.array(z.string()).optional(),

  // Linked resources
  linkedResources: z.array(ResourceSchema),

  // Status tracking
  status: EpicStatusSchema,

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export type Epic = z.infer<typeof EpicSchema>;

/**
 * Input for creating a new epic
 */
export const CreateEpicInputSchema = z.object({
  source: EpicSourceSchema,
  content: z.string().min(10, 'Epic content must be at least 10 characters'),
  sourceId: z.string().optional(),
  title: z.string().optional(), // Will be extracted if not provided
  linkedResources: z.array(ResourceSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateEpicInput = z.infer<typeof CreateEpicInputSchema>;

/**
 * Result of epic ingestion
 */
export interface IngestResult {
  epic: Epic;
  warnings: string[];
  extractionConfidence: number; // 0-100
}
