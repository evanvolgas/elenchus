import { z } from 'zod';

/**
 * Input schema for checkpoint feedback
 */
export const CheckpointDecisionSchema = z.object({
  specId: z.string(),
  checkpointId: z.string(),
  action: z.enum(['approve', 'reject', 'request-changes']),
  feedback: z.string().optional(),
  decidedBy: z.string().optional(),
});

export type CheckpointDecisionInput = z.infer<typeof CheckpointDecisionSchema>;

/**
 * Stored checkpoint decision
 */
export interface CheckpointDecision {
  id: string;
  specId: string;
  checkpointId: string;
  action: 'approve' | 'reject' | 'request-changes';
  feedback?: string | undefined;
  decidedBy?: string | undefined;
  decidedAt: string;
}

/**
 * Checkpoint status
 */
export type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'changes-requested';
