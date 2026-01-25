import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { CheckpointDecisionSchema, type CheckpointDecision, type CheckpointStatus } from '../types/checkpoint.js';
import { generateId } from '../utils/id.js';

/**
 * Tool definition for checkpoint feedback
 */
export const checkpointTool: Tool = {
  name: 'elenchus_checkpoint',
  description: `Record checkpoint feedback for a specification.

Checkpoints are decision points where human review is needed before proceeding.
This tool records the decision (approve/reject/request-changes) and updates the spec status.

Note: Elenchus only records checkpoint decisions - it does NOT enforce them or handle execution.
External orchestrators (like Claude Flow) are responsible for acting on checkpoint feedback.`,

  inputSchema: {
    type: 'object',
    properties: {
      specId: {
        type: 'string',
        description: 'ID of the specification',
      },
      checkpointId: {
        type: 'string',
        description: 'ID of the checkpoint',
      },
      action: {
        type: 'string',
        enum: ['approve', 'reject', 'request-changes'],
        description: 'Decision on the checkpoint',
      },
      feedback: {
        type: 'string',
        description: 'Optional feedback or explanation',
      },
      decidedBy: {
        type: 'string',
        description: 'Optional identifier of who made the decision',
      },
    },
    required: ['specId', 'checkpointId', 'action'],
  },
};

interface CheckpointResult {
  decision: CheckpointDecision;
  checkpoint: {
    id: string;
    type: string;
    phase: string;
    description: string;
    status: CheckpointStatus;
  };
  nextSteps: string[];
}

/**
 * Map action to checkpoint status
 */
function actionToStatus(action: CheckpointDecision['action']): CheckpointStatus {
  switch (action) {
    case 'approve':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'request-changes':
      return 'changes-requested';
  }
}

/**
 * Handle checkpoint feedback
 */
export async function handleCheckpoint(
  args: Record<string, unknown>,
  storage: Storage
): Promise<CheckpointResult> {
  const input = CheckpointDecisionSchema.parse(args);

  // Verify spec exists
  const spec = storage.getSpec(input.specId);
  if (!spec) {
    throw new Error(`Specification not found: ${input.specId}`);
  }

  // Verify checkpoint exists in spec
  const checkpoint = spec.checkpoints.find(cp => cp.id === input.checkpointId);
  if (!checkpoint) {
    throw new Error(
      `Checkpoint not found: ${input.checkpointId} in specification ${input.specId}`
    );
  }

  // Create decision record
  const decision: CheckpointDecision = {
    id: generateId('cpd'),
    specId: input.specId,
    checkpointId: input.checkpointId,
    action: input.action,
    feedback: input.feedback,
    decidedBy: input.decidedBy,
    decidedAt: new Date().toISOString(),
  };

  // Store decision
  storage.saveCheckpointDecision(decision);

  // Update spec's checkpoint status
  storage.updateCheckpointStatus(input.specId, input.checkpointId, actionToStatus(input.action));

  // Generate next steps based on action
  const nextSteps: string[] = [];

  switch (input.action) {
    case 'approve':
      nextSteps.push('Checkpoint approved - proceed to next phase');
      if (checkpoint.type === 'pre-delivery') {
        nextSteps.push('All checkpoints complete - ready for final delivery');
      } else {
        nextSteps.push('Continue execution with next phase');
      }
      break;

    case 'reject':
      nextSteps.push('Checkpoint rejected - execution blocked');
      nextSteps.push('Review feedback and determine if spec needs regeneration');
      if (input.feedback) {
        nextSteps.push('Consider feedback: ' + input.feedback);
      }
      break;

    case 'request-changes':
      nextSteps.push('Changes requested - address feedback before proceeding');
      if (input.feedback) {
        nextSteps.push('Feedback to address: ' + input.feedback);
      }
      nextSteps.push('Re-submit checkpoint after changes are made');
      break;
  }

  return {
    decision,
    checkpoint: {
      id: checkpoint.id,
      type: checkpoint.type,
      phase: checkpoint.phase,
      description: checkpoint.description,
      status: actionToStatus(input.action),
    },
    nextSteps,
  };
}
