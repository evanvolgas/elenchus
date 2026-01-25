import { z } from 'zod';
import type { SpecificationSummary } from './spec.js';

/**
 * Delivery artifact - a file or component produced during execution
 */
export const DeliveryArtifactSchema = z.object({
  type: z.enum(['code', 'test', 'docs', 'config', 'other']),
  path: z.string(),
  description: z.string(),
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
