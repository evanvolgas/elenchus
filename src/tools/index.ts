import type { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import {
  classifyError,
  createErrorResponse,
  ElenchusError,
  ErrorCode,
} from '../utils/errors.js';

// Core 3-tool API
import { startTool, handleStart } from './start.js';
import { qaTool, handleQA } from './qa.js';
import { specTool, handleSpec } from './spec.js';

// Ops tool
import { healthTool, handleHealth } from './health.js';

// Lifecycle tools
import { listTool, handleList } from './list.js';
import { deleteTool, handleDelete } from './delete.js';
import { resumeTool, handleResume } from './resume.js';

// Data access tools
import { premisesTool, handlePremises } from './premises.js';
import { contradictionsTool, handleContradictions } from './contradictions.js';

// Export and context tools
import { exportTool, handleExport } from './export.js';
import { contextTool, handleContext } from './context.js';

/**
 * Re-export error codes for backwards compatibility
 * @deprecated Use ErrorCode from '../utils/errors.js' instead
 */
export const ErrorCodes = ErrorCode;

/**
 * Register all MCP tools
 *
 * Core API:
 * - elenchus_start: Begin interrogation
 * - elenchus_qa: Submit Q&A, get quality feedback
 * - elenchus_spec: Generate specification
 *
 * Lifecycle:
 * - elenchus_list: List epics/sessions/specs
 * - elenchus_delete: Delete epic/session
 * - elenchus_resume: Resume existing session
 *
 * Data Access:
 * - elenchus_premises: View/manage premises
 * - elenchus_contradictions: View/resolve contradictions
 *
 * Export & Context:
 * - elenchus_export: Export spec/session/audit
 * - elenchus_context: Analyze codebase context
 *
 * Ops:
 * - elenchus_health: Health check
 */
export function registerTools(): Tool[] {
  return [
    // Core
    startTool,
    qaTool,
    specTool,
    // Lifecycle
    listTool,
    deleteTool,
    resumeTool,
    // Data access
    premisesTool,
    contradictionsTool,
    // Export & context
    exportTool,
    contextTool,
    // Ops
    healthTool,
  ];
}

/**
 * Validate that args is a proper object (not null, not array).
 */
function validateArgs(args: unknown): args is Record<string, unknown> {
  return (
    args !== null &&
    typeof args === 'object' &&
    !Array.isArray(args)
  );
}

/**
 * Extract context IDs from arguments for request tracking
 */
function extractContextIds(args: Record<string, unknown>): {
  epicId?: string | undefined;
  sessionId?: string | undefined;
} {
  return {
    epicId: typeof args['epicId'] === 'string' ? args['epicId'] : undefined,
    sessionId: typeof args['sessionId'] === 'string' ? args['sessionId'] : undefined,
  };
}

/**
 * Handle tool calls with input validation, request tracking, and structured error responses.
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  storage: Storage
): Promise<{ content: TextContent[] }> {
  const { epicId, sessionId } = validateArgs(args) ? extractContextIds(args) : {};

  return logger.withRequestContext(
    { toolName: name, epicId, sessionId },
    async () => {
      const requestId = logger.getRequestId();

      try {
        if (!validateArgs(args)) {
          logger.warn('Invalid arguments received', undefined, {
            argType: typeof args,
            isNull: args === null,
            isArray: Array.isArray(args),
          });
          const invalidArgsError = new ElenchusError(
            'Arguments must be a non-null object',
            ErrorCode.INVALID_ARGUMENTS,
            { details: { received: typeof args } }
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  createErrorResponse(invalidArgsError, requestId),
                  null,
                  2
                ),
              },
            ],
          };
        }

        logger.debug('Tool call started', undefined, {
          argKeys: Object.keys(args),
        });

        let result: unknown;

        switch (name) {
          // Core
          case 'elenchus_start':
            result = await handleStart(args, storage);
            break;

          case 'elenchus_qa':
            result = await handleQA(args, storage);
            break;

          case 'elenchus_spec':
            result = await handleSpec(args, storage);
            break;

          // Lifecycle
          case 'elenchus_list':
            result = handleList(args, storage);
            break;

          case 'elenchus_delete':
            result = handleDelete(args, storage);
            break;

          case 'elenchus_resume':
            result = handleResume(args, storage);
            break;

          // Data access
          case 'elenchus_premises':
            result = handlePremises(args, storage);
            break;

          case 'elenchus_contradictions':
            result = handleContradictions(args, storage);
            break;

          // Export & context
          case 'elenchus_export':
            result = handleExport(args, storage);
            break;

          case 'elenchus_context':
            result = handleContext(args, storage);
            break;

          // Ops
          case 'elenchus_health':
            result = await handleHealth(args, storage);
            break;

          default:
            logger.warn('Unknown tool requested', undefined, { tool: name });
            throw new Error(`Unknown tool: ${name}. Available: elenchus_start, elenchus_qa, elenchus_spec, elenchus_list, elenchus_delete, elenchus_resume, elenchus_premises, elenchus_contradictions, elenchus_export, elenchus_context, elenchus_health`);
        }

        const elapsedMs = logger.getElapsedMs();
        logger.debug('Tool call completed', undefined, { elapsedMs });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const elapsedMs = logger.getElapsedMs();
        const classified = classifyError(error);

        logger.error('Tool call failed', error, {
          code: classified.code,
          httpStatus: classified.httpStatus,
          isRetryable: classified.isRetryable,
          elapsedMs,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                createErrorResponse(error, requestId),
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
