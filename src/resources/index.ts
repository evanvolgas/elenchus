import type { Resource, TextResourceContents } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

/**
 * Register MCP resources
 */
export function registerResources(storage: Storage): Resource[] {
  const resources: Resource[] = [];

  // List epics as resources
  const epics = storage.listEpics();
  for (const epic of epics) {
    resources.push({
      uri: `elenchus://epics/${epic.id}`,
      name: epic.title,
      description: `Epic: ${epic.title} (${epic.status})`,
      mimeType: 'application/json',
    });

    // List sessions for this epic
    const sessions = storage.getSessionsForEpic(epic.id);
    for (const session of sessions) {
      resources.push({
        uri: `elenchus://sessions/${session.id}`,
        name: `Session for ${epic.title}`,
        description: `Interrogation session (${session.status}, ${session.clarityScore}% clarity)`,
        mimeType: 'application/json',
      });
    }

    // List specs for this epic
    const spec = storage.getLatestSpecForEpic(epic.id);
    if (spec) {
      resources.push({
        uri: `elenchus://specs/${spec.id}`,
        name: `Spec for ${epic.title}`,
        description: `Specification v${spec.version} (${spec.readinessScore}% ready)`,
        mimeType: 'application/json',
      });
    }
  }

  return resources;
}

/**
 * Read a resource by URI
 */
export function handleResourceRead(
  uri: string,
  storage: Storage
): { contents: TextResourceContents[] } {
  const url = new URL(uri);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const [type, id] = pathParts as [string, string];

  switch (type) {
    case 'epics': {
      const epic = storage.getEpic(id);
      if (!epic) {
        throw new Error(`Epic not found: ${id}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(epic, null, 2),
          },
        ],
      };
    }

    case 'sessions': {
      const session = storage.getSession(id);
      if (!session) {
        throw new Error(`Session not found: ${id}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(session, null, 2),
          },
        ],
      };
    }

    case 'specs': {
      const spec = storage.getSpec(id);
      if (!spec) {
        throw new Error(`Specification not found: ${id}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(spec, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
}
