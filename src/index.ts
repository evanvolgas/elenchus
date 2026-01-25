#!/usr/bin/env node

/**
 * Elenchus - MCP Server Entry Point
 *
 * Transform epics into POCs through interrogative specification.
 *
 * Named after the Greek term for the Socratic method (ἔλεγχος),
 * it emphasizes question-driven refinement over prescriptive specification.
 */

import { ElenchusServer } from './server.js';

async function main(): Promise<void> {
  const server = new ElenchusServer();
  serverInstance = server;

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down Elenchus...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down Elenchus...');
    await server.stop();
    process.exit(0);
  });

  // Start the server
  await server.start();
}

// Track server instance for cleanup on fatal errors
let serverInstance: ElenchusServer | null = null;

main().catch(async (error) => {
  console.error('Fatal error:', error);

  // Ensure proper cleanup on fatal errors to prevent data corruption
  if (serverInstance) {
    try {
      await serverInstance.stop();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }

  process.exit(1);
});
