import type { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import {
  classifyError,
  createErrorResponse,
  ElenchusError,
  ErrorCode,
} from '../utils/errors.js';

import { ingestTool, handleIngest } from './ingest.js';
import { analyzeTool, handleAnalyze } from './analyze.js';
import { interrogateTool, handleInterrogate } from './interrogate.js';
import { answerTool, handleAnswer } from './answer.js';
import { generateSpecTool, handleGenerateSpec } from './generate-spec.js';
import { validateTool, handleValidate } from './validate.js';
import { statusTool, handleStatus } from './status.js';
import { healthTool, handleHealth } from './health.js';
import { checkpointTool, handleCheckpoint } from './checkpoint.js';
import { deliveryTool, handleDelivery } from './delivery.js';

/**
 * Re-export error codes for backwards compatibility
 * @deprecated Use ErrorCode from '../utils/errors.js' instead
 */
export const ErrorCodes = ErrorCode;

/**
 * Register all MCP tools
 */
export function registerTools(): Tool[] {
  return [
    ingestTool,
    analyzeTool,
    interrogateTool,
    answerTool,
    generateSpecTool,
    validateTool,
    statusTool,
    healthTool,
    checkpointTool,
    deliveryTool,
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
 *
 * Each tool call is wrapped in a request context that provides:
 * - Unique request ID for correlating logs
 * - Tool name for filtering
 * - Epic/Session IDs when available
 * - Elapsed time tracking
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  storage: Storage
): Promise<{ content: TextContent[] }> {
  // Extract context IDs for request tracking
  const { epicId, sessionId } = validateArgs(args) ? extractContextIds(args) : {};

  // Wrap the entire tool call in a request context for structured logging
  return logger.withRequestContext(
    { toolName: name, epicId, sessionId },
    async () => {
      const requestId = logger.getRequestId();

      try {
        // Validate args is a proper object
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
          case 'elenchus_ingest':
            result = await handleIngest(args, storage);
            break;

          case 'elenchus_analyze':
            result = await handleAnalyze(args, storage);
            break;

          case 'elenchus_interrogate':
            result = await handleInterrogate(args, storage);
            break;

          case 'elenchus_answer':
            result = await handleAnswer(args, storage);
            break;

          case 'elenchus_generate_spec':
            result = await handleGenerateSpec(args, storage);
            break;

          case 'elenchus_validate':
            result = await handleValidate(args, storage);
            break;

          case 'elenchus_status':
            result = await handleStatus(args, storage);
            break;

          case 'elenchus_health':
            result = await handleHealth(args, storage);
            break;

          case 'elenchus_checkpoint':
            result = await handleCheckpoint(args, storage);
            break;

          case 'elenchus_delivery':
            result = await handleDelivery(args, storage);
            break;

          default:
            logger.warn('Unknown tool requested', undefined, { tool: name });
            throw new Error(`Unknown tool: ${name}`);
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

        // Classify the error to get appropriate code and structure
        const classified = classifyError(error);

        // Log error with full context (requestId automatically included)
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
