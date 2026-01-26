# Elenchus - Claude Code Configuration

## Project Overview

Elenchus is an MCP server that implements **true Socratic elenchus** for software specification through premise tracking, contradiction detection, and forced resolution.

Named after the Greek term for the Socratic method (ἔλεγχος), it exposes contradictions in requirements through systematic questioning.

## Architecture

See `ARCHITECTURE.md` for detailed system design.

**Core Flow**: Epic → `elenchus_start` → Q&A with premises → `elenchus_qa` → Contradiction resolution → `elenchus_spec`

## MCP Tools

| Tool | Purpose |
|------|---------|
| `elenchus_start` | Begin interrogation, detect signals (claims, gaps, tensions, assumptions) |
| `elenchus_qa` | Submit Q&A with premises, detect contradictions, track aporia |
| `elenchus_spec` | Generate spec when quality gates pass (no unresolved contradictions) |
| `elenchus_health` | Health check |

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

- `/src/tools/` - MCP tool implementations (start.ts, qa.ts, spec.ts, health.ts)
- `/src/storage/` - Database and persistence
- `/src/types/` - TypeScript interfaces and types
- `/src/utils/` - Shared utilities
- `/src/prompts/` - Prompt templates for calling LLM

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

### Key Design Principle

**Claude is the intelligence. Elenchus provides structure.**

- No regex for content understanding
- No keyword matching for semantics
- The calling LLM does all reasoning
- Elenchus tracks state and enforces gates

### Error Handling

- Use custom error classes extending `Error`
- Include error codes for programmatic handling
- Log errors with context (epicId, sessionId, etc.)
- Never swallow errors silently

### Testing

- Co-locate tests with source files (`*.test.ts`)
- Use descriptive test names: `it('should X when Y')`
- Mock external dependencies (APIs, filesystem)

## DO NOT

- Commit API keys or secrets
- Add regex/keyword matching for semantic understanding
- Skip type validation on external inputs
- Have Elenchus call LLMs directly (the calling LLM does that)
