import { z } from 'zod';
import type { SpecificationSummary } from './spec.js';

/**
 * Pattern for detecting path traversal attempts.
 * Blocks: .., //, null bytes, control characters
 */
const PATH_TRAVERSAL_PATTERN = /(?:\.\.[\\/]|[\\/]\.\.)|[\\/]{2,}|[\x00-\x1f]/;

/**
 * Maximum artifact path length to prevent DoS
 */
const MAX_ARTIFACT_PATH_LENGTH = 1024;

/**
 * Validates an artifact path is safe (no path traversal)
 */
const SafeArtifactPathSchema = z.string()
  .min(1, 'Artifact path cannot be empty')
  .max(MAX_ARTIFACT_PATH_LENGTH, `Artifact path exceeds ${MAX_ARTIFACT_PATH_LENGTH} characters`)
  .refine(
    (path) => !PATH_TRAVERSAL_PATTERN.test(path),
    'Artifact path contains path traversal sequences or invalid characters'
  )
  .refine(
    (path) => !path.startsWith('/') && !path.startsWith('\\'),
    'Artifact path must be relative, not absolute'
  );

/**
 * Delivery artifact - a file or component produced during execution
 */
export const DeliveryArtifactSchema = z.object({
  type: z.enum(['code', 'test', 'docs', 'config', 'other']),
  path: SafeArtifactPathSchema,
  description: z.string().max(2000, 'Artifact description cannot exceed 2000 characters'),
});

export type DeliveryArtifact = z.infer<typeof DeliveryArtifactSchema>;

/**
 * Input for creating a delivery record
 */
export const CreateDeliveryInputSchema = z.object({
  specId: z.string(),
  artifacts: z.array(DeliveryArtifactSchema),
  notes: z.string().optional(),
  knownLimitations: z.array(z.string()).optional(),
});

export type CreateDeliveryInput = z.infer<typeof CreateDeliveryInputSchema>;

/**
 * Complete delivery record
 */
export interface Delivery {
  id: string;
  specId: string;
  epicId: string;
  artifacts: DeliveryArtifact[];
  notes?: string | undefined;
  knownLimitations: string[];
  specSummary: SpecificationSummary;
  createdAt: string;
}

/**
 * Delivery summary for quick reference
 */
export interface DeliverySummary {
  id: string;
  specId: string;
  epicId: string;
  artifactCount: number;
  hasNotes: boolean;
  limitationCount: number;
  createdAt: string;
}
