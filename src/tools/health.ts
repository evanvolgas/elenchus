import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

/**
 * Tool definition for health check
 */
export const healthTool: Tool = {
  name: 'elenchus_health',
  description: `Check the health status of the Elenchus server.

Returns:
- Overall health status (healthy, degraded, unhealthy)
- Storage connectivity
- System metrics (epic count, session count, etc.)
- Version information

Use this for monitoring and debugging the server.`,

  inputSchema: {
    type: 'object',
    properties: {
      verbose: {
        type: 'boolean',
        description: 'Include detailed metrics and diagnostics',
        default: false,
      },
    },
  },
};

/**
 * Health status levels
 */
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check result
 */
interface HealthResult {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks: {
    storage: {
      status: HealthStatus;
      message: string;
      latencyMs?: number;
    };
  };
  metrics?: {
    epics: {
      total: number;
      byStatus: Record<string, number>;
    };
    sessions: {
      total: number;
      active: number;
    };
    specs: {
      total: number;
      ready: number;
    };
  };
}

/**
 * Handle health check request
 */
export async function handleHealth(
  args: Record<string, unknown>,
  storage: Storage
): Promise<HealthResult> {
  const verbose = args['verbose'] === true;
  const timestamp = new Date().toISOString();

  // Check storage connectivity
  const storageCheck = await checkStorage(storage);

  // Determine overall status
  let overallStatus: HealthStatus = 'healthy';
  if (storageCheck.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (storageCheck.status === 'degraded') {
    overallStatus = 'degraded';
  }

  const result: HealthResult = {
    status: overallStatus,
    timestamp,
    version: '0.1.0',
    checks: {
      storage: storageCheck,
    },
  };

  // Add detailed metrics if verbose
  if (verbose && storageCheck.status !== 'unhealthy') {
    const metrics = await gatherMetrics(storage);
    if (metrics !== undefined) {
      result.metrics = metrics;
    }
  }

  return result;
}

/**
 * Check storage connectivity and health
 */
async function checkStorage(storage: Storage): Promise<{
  status: HealthStatus;
  message: string;
  latencyMs?: number;
}> {
  const start = Date.now();

  try {
    // Attempt a simple read operation
    storage.listEpics();
    const latencyMs = Date.now() - start;

    // Warn if latency is high
    if (latencyMs > 1000) {
      return {
        status: 'degraded',
        message: `Storage responding slowly (${latencyMs}ms)`,
        latencyMs,
      };
    }

    return {
      status: 'healthy',
      message: 'Storage is operational',
      latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage error';
    return {
      status: 'unhealthy',
      message: `Storage error: ${message}`,
    };
  }
}

/**
 * Gather detailed metrics from storage
 */
async function gatherMetrics(storage: Storage): Promise<HealthResult['metrics']> {
  try {
    const epics = storage.listEpics();

    // Count epics by status
    const byStatus: Record<string, number> = {};
    for (const epic of epics) {
      byStatus[epic.status] = (byStatus[epic.status] ?? 0) + 1;
    }

    // Count sessions
    let totalSessions = 0;
    let activeSessions = 0;
    for (const epic of epics) {
      const sessions = storage.getSessionsForEpic(epic.id);
      totalSessions += sessions.length;
      activeSessions += sessions.filter(s => s.status === 'in-progress' || s.status === 'waiting').length;
    }

    // Count specs
    let totalSpecs = 0;
    let readySpecs = 0;
    for (const epic of epics) {
      const spec = storage.getLatestSpecForEpic(epic.id);
      if (spec) {
        totalSpecs++;
        if (spec.readinessScore >= 70) {
          readySpecs++;
        }
      }
    }

    return {
      epics: {
        total: epics.length,
        byStatus,
      },
      sessions: {
        total: totalSessions,
        active: activeSessions,
      },
      specs: {
        total: totalSpecs,
        ready: readySpecs,
      },
    };
  } catch {
    // If metrics gathering fails, return undefined (handled by caller)
    return undefined;
  }
}
