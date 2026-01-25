import type { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';

import { ingestTool, handleIngest } from './ingest.js';
import { analyzeTool, handleAnalyze } from './analyze.js';
import { interrogateTool, handleInterrogate } from './interrogate.js';
import { answerTool, handleAnswer } from './answer.js';
import { generateSpecTool, handleGenerateSpec } from './generate-spec.js';
import { validateTool, handleValidate } from './validate.js';
import { statusTool, handleStatus } from './status.js';

/**
 * Error codes for programmatic error handling.
 */
export const ErrorCodes = {
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Structured error response for MCP tool calls.
 */
interface ErrorResponse {
  error: true;
  code: keyof typeof ErrorCodes;
  message: string;
  details?: Record<string, unknown>;
}

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
 * Create a structured error response.
 */
function createErrorResponse(
  code: keyof typeof ErrorCodes,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    error: true,
    code,
    message,
    ...(details && { details }),
  };
}

/**
 * Handle tool calls with input validation and structured error responses.
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  storage: Storage
): Promise<{ content: TextContent[] }> {
  try {
    // Validate args is a proper object
    if (!validateArgs(args)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              createErrorResponse(
                'INVALID_ARGUMENTS',
                'Arguments must be a non-null object',
                { received: typeof args }
              ),
              null,
              2
            ),
          },
        ],
      };
    }

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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Determine error code based on error type/message
    let code: keyof typeof ErrorCodes = 'INTERNAL_ERROR';
    if (message.includes('not found') || message.includes('Not found')) {
      code = 'NOT_FOUND';
    } else if (error instanceof Error && error.name === 'ZodError') {
      code = 'VALIDATION_ERROR';
    }

    // Log error with context for debugging (to stderr, doesn't interfere with MCP)
    console.error(`Tool error [${name}]:`, error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            createErrorResponse(code, message),
            null,
            2
          ),
        },
      ],
    };
  }
}
