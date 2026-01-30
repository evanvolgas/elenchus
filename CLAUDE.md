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
- `/src/engines/` - Analysis engines (two-layer architecture):
  - `quality-detector.ts` - **Layer 1**: Structural baseline quality assessment
  - `fact-extractor.ts` - **Layer 1**: Structural fact extraction from answers
  - `question-generator.ts` - **Layer 1**: Template-based question generation
  - `llm-client.ts` - **Layer 2**: Anthropic API client with graceful degradation
  - `llm-signal-detector.ts` - **Layer 2**: Semantic signal detection
  - `llm-question-generator.ts` - **Layer 2**: Contextual question generation
  - `llm-contradiction-detector.ts` - **Layer 2**: Semantic contradiction detection
  - `llm-spec-decomposer.ts` - **Layer 2**: Implementation blueprint generation
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

### Key Design Principle: Two-Layer Architecture

**Claude is the intelligence. Elenchus provides structure and state management.**

Elenchus uses a two-layer architecture for signal detection and question generation:

#### Layer 1: Structural Baseline (Always runs)

Files: `quality-detector.ts`, structural functions in `start.ts`, `fact-extractor.ts`

- Uses pattern matching (regex) for **structural indicators only**
- Detects presence/absence of keywords, numbers, units, actors
- Calculates specificity scores from structural patterns
- Provides baseline functionality **without requiring API keys**
- **NOT semantic understanding** - cannot understand meaning or context

Example: The structural layer detects "no 'error' keyword found" - it cannot tell
if error handling is actually discussed using different words.

#### Layer 2: LLM-Powered Semantic Analysis (Optional, when API key present)

Files: `llm-signal-detector.ts`, `llm-question-generator.ts`, `llm-contradiction-detector.ts`, `llm-spec-decomposer.ts`

- Uses Claude API for **semantic understanding**
- Detects meaning, contradictions, tensions, implicit assumptions
- Generates contextual questions based on understanding
- Gracefully degrades (returns null) when `ANTHROPIC_API_KEY` unset
- **Supplements** (not replaces) structural baseline

#### How They Work Together

1. Structural baseline always runs → provides baseline signals
2. LLM layer runs if available → adds semantic signals
3. Both are merged → comprehensive signal set
4. Calling LLM (Claude in Claude Code) does final synthesis
5. User sees result through natural conversation

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
- Skip type validation on external inputs
- Use regex to **understand meaning** (regex is fine for structural pattern detection)
- Confuse structural baseline with semantic analysis (they serve different purposes)

## CLARIFICATION: Regex Usage

The phrase "no regex for content understanding" means:

- **WRONG**: Using regex to determine if an epic discusses error handling semantically
- **RIGHT**: Using regex to detect the presence/absence of error-related keywords

The structural baseline uses regex for **structural indicators** (keyword presence, number
patterns, grammatical structures). It explicitly does NOT claim to understand meaning.
The LLM layer does semantic understanding. Both are documented and intentional.
