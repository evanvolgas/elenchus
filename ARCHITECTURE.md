# Elenchus Architecture

## Overview

Elenchus is an **Interrogative Specification Compiler**—an MCP server that transforms vague human intent into executable agent prompts through Socratic questioning.

```
Human Intent + Codebase → [Elenchus] → Executable Agent Prompts
                              ↓
                     State + Prompts (Elenchus)
                     Intelligence (Calling LLM)
```

## Core Insight

**Claude is the intelligence. Elenchus is the infrastructure.**

We don't need:
- Regex keyword matching
- Template selection logic
- ML models
- Custom NLP

We need:
- Smart prompts that guide Claude's reasoning
- State management across sessions
- Codebase context injection
- Coverage tracking and gating

Elenchus provides structure. The calling LLM provides reasoning.

## Two Layers of Contracts

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 1: INTENT CONTRACT                      │
│                         (ELENCHUS)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Human ←→ Agent agreement on WHAT to build:                      │
│                                                                  │
│  • Scope boundaries (what's in, what's out)                      │
│  • Success criteria (how we know it's done)                      │
│  • Constraints (must have, must not have)                        │
│  • Technical decisions (pre-made vs. agent decides)              │
│  • Checkpoints (when to pause for human review)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 2: EXECUTION                            │
│              (External Orchestrator - Claude Flow, etc.)         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Agent ←→ Systems agreement on HOW to execute:                   │
│                                                                  │
│  • Tool availability                                             │
│  • File system access                                            │
│  • API connections                                               │
│  • Checkpoint enforcement                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Elenchus produces Layer 1. External orchestrators handle Layer 2.

## Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                         ELENCHUS                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   INGEST    │──▶│   ANALYZE   │──▶│ INTERROGATE │           │
│  │   (parse)   │   │ (codebase)  │   │   (Q&A)     │           │
│  └─────────────┘   └─────────────┘   └──────┬──────┘           │
│                                              │                   │
│                                              ▼                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   COMPILE   │◀──│  GENERATE   │◀──│   ANSWER    │           │
│  │  (prompts)  │   │   (spec)    │   │  (record)   │           │
│  └──────┬──────┘   └─────────────┘   └─────────────┘           │
│         │                                                        │
│         │  Executable Agent Prompts                              │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ {                                                            ││
│  │   "agentPrompts": {                                          ││
│  │     "research": "...",                                       ││
│  │     "design": "...",                                         ││
│  │     "implementation": "...",                                 ││
│  │     "test": "...",                                           ││
│  │     "review": "..."                                          ││
│  │   },                                                         ││
│  │   "executionPlan": [...],                                    ││
│  │   "checkpoints": [...]                                       ││
│  │ }                                                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Tools

### Epic Lifecycle

| Tool | Input | Output | Gate |
|------|-------|--------|------|
| `elenchus_ingest` | Raw text, JIRA ID, etc. | Parsed epic with extracted goals | - |
| `elenchus_analyze` | Codebase path | Patterns, conventions, relevant files | - |
| `elenchus_interrogate` | Epic ID | Epic + coverage state + Q&A history | - |
| `elenchus_answer` | Session ID + categorized answers | Updated coverage | - |
| `elenchus_generate_spec` | Session ID | Organized Q&A for synthesis | Coverage ≥ 80% |
| `elenchus_compile` | Session ID | Executable agent prompts | Coverage ≥ 80% |

### Post-Execution

| Tool | Purpose |
|------|---------|
| `elenchus_validate` | Validate spec before execution |
| `elenchus_checkpoint` | Record human decisions at checkpoints |
| `elenchus_delivery` | Record what was delivered |
| `elenchus_status` | Get status of any entity |
| `elenchus_health` | Server health check |

## Coverage System

Elenchus tracks coverage across six areas:

| Area | Required | Purpose |
|------|----------|---------|
| `scope` | Yes | What's in/out, boundaries |
| `success` | Yes | Acceptance criteria, how to validate |
| `constraint` | Yes | Technical, timeline, budget limits |
| `risk` | Yes | What could fail, mitigation |
| `stakeholder` | No | Who uses it, who's affected |
| `technical` | No | Tech stack, architecture decisions |

**Gate**: Cannot call `elenchus_generate_spec` or `elenchus_compile` until all required areas have at least one answered question.

**Clarity Score**: Percentage of required areas covered. Must reach 80% to proceed.

## Interrogation Flow

The interrogation methodology is embedded in the `elenchus_interrogate` tool description. When called:

1. Tool returns: epic content, coverage state, previous Q&A
2. Calling LLM reads epic, identifies gaps, formulates questions
3. User answers questions
4. LLM calls `elenchus_answer` with categorized answers
5. Repeat until clarity ≥ 80%

The LLM is the intelligence. Elenchus tracks state and enforces gates.

## Prompt Library

Located in `/src/prompts/index.ts`. These are prompts that guide the calling LLM:

| Function | Purpose |
|----------|---------|
| `buildEpicAnalysisPrompt` | Extract goals, constraints, criteria from raw epic |
| `buildCodebaseAnalysisPrompt` | Identify patterns and conventions |
| `buildInterrogationPrompt` | Generate contextual questions |
| `buildAnswerAnalysisPrompt` | Extract facts, detect contradictions |
| `buildReadinessPrompt` | Assess if ready for compilation |
| `buildCompilationPrompt` | Generate executable agent prompts |
| `buildConflictResolutionPrompt` | Resolve contradictions |
| `buildCoverageAssessmentPrompt` | Assess coverage by area |

## Executable Prompt Format

The output of `elenchus_compile`:

```typescript
interface CompileOutput {
  compilationPrompt: string;      // Full prompt for generating agent prompts
  context: {
    epic: { id, title, rawContent };
    codebase: { techStack, conventions, relevantFiles } | null;
    facts: Array<{ statement, confidence, area, source }>;
    insights: Array<{ pattern, recommendation }>;
  };
  expectedOutputSchema: string;   // JSON schema documentation
  instructions: string;           // Step-by-step for calling LLM
}
```

The calling LLM uses this to generate:

```typescript
interface ExecutableAgentPrompts {
  problemStatement: string;
  technicalDecisions: Array<{ decision, rationale, alternatives? }>;
  agentPrompts: {
    research: string;
    design: string;
    implementation: string;
    test: string;
    review: string;
  };
  successCriteria: string[];
  risksAndMitigation: Array<{ risk, severity, mitigation }>;
  executionPlan: Array<{ phase, agent, inputs, outputs, estimatedEffort }>;
  checkpoints: Array<{ after, reviewCriteria, decision }>;
}
```

## Storage

SQLite database with tables:

| Table | Purpose |
|-------|---------|
| `epics` | Ingested epics with extracted info |
| `sessions` | Interrogation sessions with Q&A |
| `specs` | Generated specifications |
| `contexts` | Codebase analysis results |
| `checkpoint_decisions` | Recorded checkpoint approvals/rejections |
| `deliveries` | What was delivered post-execution |
| `execution_records` | Prompt → outcome for feedback loops |
| `prompt_insights` | Learned patterns from outcomes |

## Feedback Loops

Elenchus can learn from execution outcomes:

1. **ExecutionRecord**: When agents execute prompts, record success/failure
2. **PromptInsight**: Correlate patterns with outcomes (e.g., "explicit file paths → 85% success")
3. **Inclusion**: `elenchus_compile` includes insights in output

No ML. Just correlation tracking: "Prompts with X succeed 80% vs 40% without."

## Directory Structure

```
elenchus/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server setup
│   ├── tools/             # MCP tool implementations
│   │   ├── ingest.ts
│   │   ├── analyze.ts
│   │   ├── interrogate.ts
│   │   ├── answer.ts
│   │   ├── generate-spec.ts
│   │   ├── compile.ts     # Key output generator
│   │   ├── validate.ts
│   │   ├── checkpoint.ts
│   │   ├── delivery.ts
│   │   ├── status.ts
│   │   ├── health.ts
│   │   └── detectors/     # Language detection (Python, TS, Go, PHP)
│   ├── prompts/           # Prompt builders
│   │   └── index.ts
│   ├── resources/         # MCP resources
│   ├── storage/           # SQLite persistence
│   ├── types/             # TypeScript definitions
│   └── utils/             # Helpers (logging, errors, security)
├── tests/                 # Test files
└── docs/                  # Reference documentation
```

## What Elenchus Doesn't Do

| Don't Build | Why |
|-------------|-----|
| Custom orchestrator | Use Claude Flow, Task tool |
| ML models | Claude + correlation is sufficient |
| Regex/templates for reasoning | Claude understands semantically |
| IDE integration | MCP is the interface |
| Code execution | External orchestrators handle this |

## Key Design Decisions

1. **State in SQLite** - Persistence across sessions, simple queries
2. **Prompts not code** - Tool descriptions contain methodology
3. **Gates not advice** - Block progression until requirements met
4. **JSON output** - Agent consumption, not human reading
5. **Codebase awareness** - Prompts reference actual patterns
6. **Feedback without ML** - Simple correlation, no training
