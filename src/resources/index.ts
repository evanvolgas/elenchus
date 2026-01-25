import type { Resource, TextResourceContents } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

/**
 * Register all available MCP resources for the Elenchus server.
 *
 * This function queries the storage layer to expose epics, interrogation sessions,
 * and specifications as MCP resources. Each resource is addressable via a URI
 * following the pattern: `elenchus://{type}/{id}`
 *
 * Error handling: Individual resource registration failures are logged but don't
 * prevent the registration of other resources. This ensures partial availability
 * even if some data is corrupted.
 *
 * @param storage - The storage instance to query for existing data
 * @returns Array of MCP Resource objects representing all available entities
 *
 * @example
 * ```typescript
 * const storage = new Storage(':memory:');
 * const resources = registerResources(storage);
 * // Returns: [
 * //   { uri: 'elenchus://epics/epic-123', name: 'User Auth', ... },
 * //   { uri: 'elenchus://sessions/session-456', name: 'Session for User Auth', ... }
 * // ]
 * ```
 */
export function registerResources(storage: Storage): Resource[] {
  const resources: Resource[] = [];

  try {
    // List epics as resources
    const epics = storage.listEpics();

    for (const epic of epics) {
      try {
        resources.push({
          uri: `elenchus://epics/${epic.id}`,
          name: epic.title,
          description: `Epic: ${epic.title} (${epic.status})`,
          mimeType: 'application/json',
        });

        // List sessions for this epic
        try {
          const sessions = storage.getSessionsForEpic(epic.id);
          for (const session of sessions) {
            try {
              resources.push({
                uri: `elenchus://sessions/${session.id}`,
                name: `Session for ${epic.title}`,
                description: `Interrogation session (${session.status}, ${session.clarityScore}% clarity)`,
                mimeType: 'application/json',
              });
            } catch (sessionError) {
              console.error(`Failed to register session ${session.id}:`, sessionError);
            }
          }
        } catch (sessionsError) {
          console.error(`Failed to fetch sessions for epic ${epic.id}:`, sessionsError);
        }

        // List specs for this epic
        try {
          const spec = storage.getLatestSpecForEpic(epic.id);
          if (spec) {
            resources.push({
              uri: `elenchus://specs/${spec.id}`,
              name: `Spec for ${epic.title}`,
              description: `Specification v${spec.version} (${spec.readinessScore}% ready)`,
              mimeType: 'application/json',
            });
          }
        } catch (specError) {
          console.error(`Failed to fetch spec for epic ${epic.id}:`, specError);
        }
      } catch (epicError) {
        console.error(`Failed to register epic ${epic.id}:`, epicError);
      }
    }
  } catch (listError) {
    console.error('Failed to list epics:', listError);
    // Return partial results - don't let a total failure prevent resource access
  }

  return resources;
}

/**
 * Read a resource by URI and return its contents.
 *
 * Handles resource URIs in the format: `elenchus://{type}/{id}`
 * Supported types: epics, sessions, specs
 *
 * URI parsing is strict:
 * - Protocol must be exactly "elenchus:"
 * - Path must contain exactly 2 segments (type and id)
 * - Trailing slashes are normalized
 * - Extra path segments are rejected
 *
 * @param uri - The resource URI to read (e.g., "elenchus://epics/epic-123")
 * @param storage - The storage instance to query
 * @returns Object containing an array of TextResourceContents with the resource data
 * @throws {Error} If URI format is invalid, protocol is wrong, or resource not found
 *
 * @example
 * ```typescript
 * const result = handleResourceRead('elenchus://epics/epic-123', storage);
 * // Returns: {
 * //   contents: [{
 * //     uri: 'elenchus://epics/epic-123',
 * //     mimeType: 'application/json',
 * //     text: '{"id":"epic-123","title":"User Auth",...}'
 * //   }]
 * // }
 * ```
 */
export function handleResourceRead(
  uri: string,
  storage: Storage
): { contents: TextResourceContents[] } {
  // Parse and validate URI
  let url: URL;
  try {
    url = new URL(uri);
  } catch (parseError) {
    throw new Error(
      `Invalid URI format: ${uri}. Expected format: elenchus://{type}/{id}`
    );
  }

  // Validate protocol
  if (url.protocol !== 'elenchus:') {
    throw new Error(
      `Invalid protocol: ${url.protocol}. Expected "elenchus:". URI: ${uri}`
    );
  }

  // Parse path - normalize by removing empty segments and trailing slashes
  // url.pathname for "elenchus://epics/epic-123" returns "//epics/epic-123"
  // url.pathname for "elenchus://epics/epic-123/" returns "//epics/epic-123/"
  const pathParts = url.pathname
    .split('/')
    .filter((segment) => segment.length > 0);

  // Validate path structure
  if (pathParts.length === 0) {
    throw new Error(
      `Invalid URI: missing resource type and ID. Expected format: elenchus://{type}/{id}. URI: ${uri}`
    );
  }

  if (pathParts.length === 1) {
    throw new Error(
      `Invalid URI: missing resource ID. Expected format: elenchus://{type}/{id}. URI: ${uri}`
    );
  }

  if (pathParts.length > 2) {
    throw new Error(
      `Invalid URI: too many path segments. Expected format: elenchus://{type}/{id}. URI: ${uri}`
    );
  }

  const [type, id] = pathParts as [string, string];

  // Validate resource type and fetch data
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
      throw new Error(
        `Unknown resource type: ${type}. Valid types are: epics, sessions, specs`
      );
  }
}
