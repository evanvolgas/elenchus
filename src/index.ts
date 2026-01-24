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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
