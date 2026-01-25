import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type Delivery,
  type DeliverySummary,
  CreateDeliveryInputSchema,
} from '../types/delivery.js';
import { generateId } from '../utils/id.js';

/**
 * Tool definition for delivery summary
 */
export const deliveryTool: Tool = {
  name: 'elenchus_delivery',
  description: `Record what was delivered after external execution completes.

Elenchus generates specifications, but execution is done by external tools (Claude Flow, agentic systems).
After execution completes, use this tool to package what was delivered.

**Requirements**:
- specId: The specification that was executed
- artifacts: Array of files/components produced
- notes (optional): Implementation notes or decisions made
- knownLimitations (optional): Known issues or scope reductions

**Returns**:
- Delivery record with spec summary + artifacts
- Summary for quick reference`,

  inputSchema: {
    type: 'object',
    properties: {
      specId: {
        type: 'string',
        description: 'ID of the specification that was executed',
      },
      artifacts: {
        type: 'array',
        description: 'Array of artifacts produced during execution',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['code', 'test', 'docs', 'config', 'other'],
              description: 'Type of artifact',
            },
            path: {
              type: 'string',
              description: 'File path relative to project root',
            },
            description: {
              type: 'string',
              description: 'What this artifact does',
            },
          },
          required: ['type', 'path', 'description'],
        },
      },
      notes: {
        type: 'string',
        description: 'Optional implementation notes or decisions made',
      },
      knownLimitations: {
        type: 'array',
        description: 'Optional list of known limitations or scope reductions',
        items: {
          type: 'string',
        },
      },
    },
    required: ['specId', 'artifacts'],
  },
};

/**
 * Create a delivery summary for quick reference
 */
function createDeliverySummary(delivery: Delivery): DeliverySummary {
  return {
    id: delivery.id,
    specId: delivery.specId,
    epicId: delivery.epicId,
    artifactCount: delivery.artifacts.length,
    hasNotes: !!delivery.notes,
    limitationCount: delivery.knownLimitations.length,
    createdAt: delivery.createdAt,
  };
}

/**
 * Handle delivery recording
 */
export async function handleDelivery(
  args: Record<string, unknown>,
  storage: Storage
): Promise<{ delivery: Delivery; summary: DeliverySummary }> {
  const input = CreateDeliveryInputSchema.parse(args);

  // Get the specification
  const spec = storage.getSpec(input.specId);
  if (!spec) {
    throw new Error(`Specification not found: ${input.specId}`);
  }

  // Get the epic for reference
  const epic = storage.getEpic(spec.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${spec.epicId}`);
  }

  const now = new Date().toISOString();
  const deliveryId = generateId('delivery');

  // Create spec summary for embedding in delivery
  const specSummary = {
    id: spec.id,
    epicId: spec.epicId,
    sessionId: spec.sessionId,
    version: spec.version,
    problem: spec.problem.length > 200 ? spec.problem.slice(0, 197) + '...' : spec.problem,
    readinessScore: spec.readinessScore,
    readinessIssues: spec.readinessIssues,
    phaseCount: spec.phases.length,
    taskCount: spec.phases.reduce((sum, phase) => sum + phase.tasks.length, 0),
    estimatedMinutes: spec.estimatedDuration.totalMinutes,
    estimatedCostUSD: spec.estimatedCost.estimatedCostUSD,
    createdAt: spec.createdAt,
  };

  // Create delivery record
  const delivery: Delivery = {
    id: deliveryId,
    specId: input.specId,
    epicId: spec.epicId,
    artifacts: input.artifacts,
    notes: input.notes,
    knownLimitations: input.knownLimitations ?? [],
    specSummary,
    createdAt: now,
  };

  // Save delivery
  storage.saveDelivery(delivery);

  // Return both full delivery and summary
  return {
    delivery,
    summary: createDeliverySummary(delivery),
  };
}
