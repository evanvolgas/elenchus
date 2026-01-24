# Elenchus - Claude Code Configuration

## Project Overview

Elenchus is an MCP server that transforms high-level epics into working proof-of-concepts through **interrogative specification** and **checkpoint-based execution**.

Named after the Greek term for the Socratic method (ἔλεγχος), it emphasizes question-driven refinement over prescriptive specification.

## Architecture

See `ARCHITECTURE.md` for detailed system design.

**Core Flow**: Epic → Analyze → Interrogate → Spec → Checkpoints → Execute → Deliver

## Tech Stack

- Node.js 20+
- TypeScript 5.x (strict mode)
- MCP SDK (@modelcontextprotocol/sdk)
- SQLite (better-sqlite3) for persistence
- Zod for validation
- Vitest for testing

## Commands

```bash
npm run dev          # Run in dev mode with watch
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Check linting
npm run typecheck    # Check types
```

## Code Conventions

### File Organization

- `/src/engines/` - Core business logic (one file per engine)
- `/src/tools/` - MCP tool implementations
- `/src/resources/` - MCP resource implementations
- `/src/storage/` - Database and persistence
- `/src/types/` - TypeScript interfaces and types
- `/src/utils/` - Shared utilities

### Naming Conventions

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Code Style

- Strict TypeScript: all strict checks enabled
- Explicit return types on all functions
- Zod schemas for all external inputs
- No `any` types - use `unknown` with type guards
- Prefer `interface` over `type` for object shapes
- Use `readonly` arrays/objects where mutation isn't needed

### Error Handling

- Use custom error classes extending `Error`
- Include error codes for programmatic handling
- Log errors with context (epicId, sessionId, etc.)
- Never swallow errors silently

### Testing

- Co-locate tests with source files (`*.test.ts`)
- Test file naming: `{module}.test.ts`
- Use descriptive test names: `it('should X when Y')`
- Mock external dependencies (APIs, filesystem)
- Aim for >80% coverage on critical paths

## MCP Tool Guidelines

Each MCP tool should:
1. Validate all inputs with Zod
2. Return structured responses (not strings)
3. Handle errors gracefully with useful messages
4. Log operations for debugging
5. Be idempotent where possible

## Checkpoints

When implementing checkpoint logic:
1. Always persist state before checkpoint
2. Support resumption after restart
3. Include artifact summaries for review
4. Provide clear approve/reject/modify options
5. Log all checkpoint decisions

## DO NOT

- Commit API keys or secrets
- Add new dependencies without discussing tradeoffs
- Skip type validation on external inputs
- Create circular dependencies between engines
- Use synchronous file I/O in hot paths

## Currently Working On

Building the MVP pipeline:
1. Epic ingestion
2. Codebase analysis
3. Interrogation engine
4. Spec generation
5. Checkpoint management
6. Agent orchestration
7. POC delivery
