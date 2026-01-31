import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Epic, InterrogationSession } from '../types/index.js';

/**
 * elenchus_list - List epics and sessions
 *
 * Query existing epics and their interrogation sessions.
 */
export const listTool: Tool = {
  name: 'elenchus_list',
  description: `List epics and interrogation sessions.

## Use Cases

- Resume work on an existing epic
- Find a session to continue interrogating
- Review past specifications

## Examples

List all epics:
\`\`\`json
{ "type": "epics" }
\`\`\`

List sessions for a specific epic:
\`\`\`json
{ "type": "sessions", "epicId": "epic-xxx" }
\`\`\`

List all sessions:
\`\`\`json
{ "type": "sessions" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['epics', 'sessions', 'specs'],
        description: 'What to list: epics, sessions, or specs',
      },
      epicId: {
        type: 'string',
        description: 'Filter sessions/specs by epic ID (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum items to return (default: 20)',
      },
    },
    required: ['type'],
  },
};

/**
 * Summary of an epic for listing
 */
interface EpicSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
}

/**
 * Summary of a session for listing
 */
interface SessionSummary {
  id: string;
  epicId: string;
  epicTitle: string;
  status: string;
  round: number;
  clarityScore: number;
  readyForSpec: boolean;
  questionCount: number;
  answerCount: number;
  startedAt: string;
  updatedAt: string;
}

/**
 * Summary of a spec for listing
 */
interface SpecSummary {
  id: string;
  epicId: string;
  epicTitle: string;
  version: number;
  readinessScore: number;
  createdAt: string;
}

/**
 * Result from elenchus_list
 */
export interface ListResult {
  type: 'epics' | 'sessions' | 'specs';
  count: number;
  epics?: EpicSummary[];
  sessions?: SessionSummary[];
  specs?: SpecSummary[];
}

/**
 * Handle list requests
 */
export function handleList(
  args: Record<string, unknown>,
  storage: Storage
): ListResult {
  const type = args.type as 'epics' | 'sessions' | 'specs';
  const epicId = args.epicId as string | undefined;
  const limit = (args.limit as number) ?? 20;

  if (!type) {
    throw new Error('type is required (epics, sessions, or specs)');
  }

  switch (type) {
    case 'epics': {
      const epics = storage.listEpics().slice(0, limit);
      const epicSummaries: EpicSummary[] = epics.map((epic: Epic) => {
        const sessions = storage.getSessionsForEpic(epic.id);
        return {
          id: epic.id,
          title: epic.title,
          status: epic.status,
          createdAt: epic.createdAt,
          updatedAt: epic.updatedAt,
          sessionCount: sessions.length,
        };
      });
      return {
        type: 'epics',
        count: epicSummaries.length,
        epics: epicSummaries,
      };
    }

    case 'sessions': {
      let sessions: InterrogationSession[];
      if (epicId) {
        sessions = storage.getSessionsForEpic(epicId);
      } else {
        // Get all sessions by iterating epics
        const epics = storage.listEpics();
        sessions = epics.flatMap((epic: Epic) => storage.getSessionsForEpic(epic.id));
      }
      sessions = sessions.slice(0, limit);

      const sessionSummaries: SessionSummary[] = sessions.map((session: InterrogationSession) => {
        const epic = storage.getEpic(session.epicId);
        return {
          id: session.id,
          epicId: session.epicId,
          epicTitle: epic?.title ?? 'Unknown',
          status: session.status,
          round: session.round,
          clarityScore: session.clarityScore,
          readyForSpec: session.readyForSpec,
          questionCount: session.questions.length,
          answerCount: session.answers.length,
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
        };
      });
      return {
        type: 'sessions',
        count: sessionSummaries.length,
        sessions: sessionSummaries,
      };
    }

    case 'specs': {
      const epics = epicId ? [storage.getEpic(epicId)].filter(Boolean) : storage.listEpics();
      const specSummaries: SpecSummary[] = [];

      for (const epic of epics) {
        if (!epic) continue;
        const spec = storage.getLatestSpecForEpic(epic.id);
        if (spec) {
          specSummaries.push({
            id: spec.id,
            epicId: epic.id,
            epicTitle: epic.title,
            version: spec.version,
            readinessScore: spec.readinessScore,
            createdAt: spec.createdAt,
          });
        }
      }

      return {
        type: 'specs',
        count: specSummaries.slice(0, limit).length,
        specs: specSummaries.slice(0, limit),
      };
    }

    default:
      throw new Error(`Unknown type: ${type}. Valid: epics, sessions, specs`);
  }
}
