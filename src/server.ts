import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { registerTools, handleToolCall } from './tools/index.js';
import { registerResources, handleResourceRead } from './resources/index.js';
import { Storage } from './storage/index.js';

/**
 * Elenchus MCP Server
 *
 * Transforms epics into POCs through interrogative specification.
 */
export class ElenchusServer {
  private server: Server;
  private storage: Storage;

  constructor() {
    this.server = new Server(
      {
        name: 'elenchus',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.storage = new Storage();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: registerTools(),
      };
    });

    // Tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return handleToolCall(name, args ?? {}, this.storage);
    });

    // Resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: registerResources(this.storage),
      };
    });

    // Resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      return handleResourceRead(uri, this.storage);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log startup (to stderr so it doesn't interfere with MCP protocol)
    console.error('Elenchus MCP server started');
    console.error('Transform epics into POCs through interrogative specification');
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}
