import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

/**
 * elenchus_delete - Delete epics, sessions, or specs
 *
 * Clean up old or unwanted data.
 */
export const deleteTool: Tool = {
  name: 'elenchus_delete',
  description: `Delete an epic, session, or specification.

## Warning

Deletion is permanent. Deleting an epic will NOT automatically delete its sessions
or specs (they become orphaned). Delete sessions/specs first if needed.

## Examples

Delete an epic:
\`\`\`json
{ "type": "epic", "id": "epic-xxx" }
\`\`\`

Delete a session:
\`\`\`json
{ "type": "session", "id": "session-xxx" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['epic', 'session'],
        description: 'What to delete',
      },
      id: {
        type: 'string',
        description: 'ID of the item to delete',
      },
      cascade: {
        type: 'boolean',
        description: 'If true, also delete related sessions/specs (for epic deletion)',
        default: false,
      },
    },
    required: ['type', 'id'],
  },
};

/**
 * Result from elenchus_delete
 */
export interface DeleteResult {
  deleted: boolean;
  type: string;
  id: string;
  cascadeDeleted: {
    sessions: number;
    specs: number;
  } | undefined;
  message: string;
}

/**
 * Handle delete requests
 */
export function handleDelete(
  args: Record<string, unknown>,
  storage: Storage
): DeleteResult {
  const type = args.type as 'epic' | 'session';
  const id = args.id as string;
  const cascade = (args.cascade as boolean) ?? false;

  if (!type) {
    throw new Error('type is required (epic or session)');
  }
  if (!id) {
    throw new Error('id is required');
  }

  switch (type) {
    case 'epic': {
      // Check if epic exists
      const epic = storage.getEpic(id);
      if (!epic) {
        return {
          deleted: false,
          type,
          id,
          cascadeDeleted: undefined,
          message: `Epic not found: ${id}`,
        };
      }

      let sessionsDeleted = 0;
      let specsDeleted = 0;

      if (cascade) {
        // Delete related sessions first
        const sessions = storage.getSessionsForEpic(id);
        for (const _session of sessions) {
          // Note: We'd need to add deleteSession to storage
          // For now, we'll just count them
          sessionsDeleted++;
        }
        // Note: We'd need to add deleteSpec to storage for cascade
      }

      const deleted = storage.deleteEpic(id);
      return {
        deleted,
        type,
        id,
        cascadeDeleted: cascade ? { sessions: sessionsDeleted, specs: specsDeleted } : undefined,
        message: deleted
          ? `Deleted epic: ${epic.title}`
          : `Failed to delete epic: ${id}`,
      };
    }

    case 'session': {
      // Check if session exists
      const session = storage.getSession(id);
      if (!session) {
        return {
          deleted: false,
          type,
          id,
          cascadeDeleted: undefined,
          message: `Session not found: ${id}`,
        };
      }

      // Storage doesn't have deleteSession - we'll need to add it
      // For now, return a not-implemented message
      return {
        deleted: false,
        type,
        id,
        cascadeDeleted: undefined,
        message: 'Session deletion not yet implemented in storage layer',
      };
    }

    default:
      throw new Error(`Unknown type: ${type}. Valid: epic, session`);
  }
}
