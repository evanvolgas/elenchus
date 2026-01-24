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
 * Handle tool calls
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  storage: Storage
): Promise<{ content: TextContent[] }> {
  try {
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
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: true, message }, null, 2),
        },
      ],
    };
  }
}
