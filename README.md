# Elenchus

An MCP server that transforms vague human intent into executable agent prompts through Socratic questioning.

> **Elenchus** (ἔλεγχος): The Socratic method of eliciting truth by question and answer.

## What It Does

Elenchus sits between human intent and agent execution. You give it a vague epic like "build user authentication" and it:

1. **Interrogates** - Asks targeted questions to surface scope, constraints, success criteria, and risks
2. **Tracks coverage** - Ensures all critical areas are addressed before proceeding
3. **Compiles** - Transforms Q&A into executable agent prompts with codebase context

The output isn't a document for humans to read. It's a structured prompt that agents execute directly.

## What It Doesn't Do

- **Execute code** - Elenchus generates prompts, not code. Pass the output to Claude Flow, Task tool, or another orchestrator.
- **Replace thinking** - The calling LLM (Claude, GPT, etc.) provides the intelligence. Elenchus provides structure and state management.
- **Generate specs for humans** - The output is designed for agent consumption, not human review.

## Installation

```bash
git clone https://github.com/evanvolgas/elenchus.git
cd elenchus
npm install
npm run build
```

### Claude Code

```bash
claude mcp add elenchus -- node /path/to/elenchus/dist/index.js
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "elenchus": {
      "command": "node",
      "args": ["/path/to/elenchus/dist/index.js"]
    }
  }
}
```

## Quick Start

### 1. Ingest an Epic

```
Use elenchus_ingest with this content:

"Build a REST API for a book library. Users can search books,
check them out, and return them. Librarians can add/remove books."
```

### 2. Start Interrogation

```
Use elenchus_interrogate with the epic ID
```

The tool returns the epic and current coverage state. The calling LLM reads the epic and asks the user clarifying questions.

### 3. Submit Answers

```
Use elenchus_answer with the session ID and answers:

- type: scope, question: "What types of users?", answer: "Patrons and librarians"
- type: success, question: "How measure success?", answer: "Books can be searched in <200ms"
- type: constraint, question: "Tech stack?", answer: "Express, TypeScript, SQLite"
- type: risk, question: "What could fail?", answer: "Concurrent checkout conflicts"
```

Repeat until clarity score reaches 80%+.

### 4. Generate Spec Data

```
Use elenchus_generate_spec with the session ID
```

Returns organized Q&A for the calling LLM to synthesize into a specification.

### 5. Compile to Agent Prompts

```
Use elenchus_compile with the session ID
```

Returns executable agent prompts with:
- Problem statement
- Technical decisions
- Agent prompts (research, design, implementation, test, review)
- Success criteria
- Execution plan with phases
- Checkpoints for human review

### 6. Execute

Pass the compiled prompts to an orchestrator (Claude Flow, Task tool) for execution.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `elenchus_ingest` | Parse epic from text, JIRA, GitHub, Notion, or Linear |
| `elenchus_analyze` | Analyze codebase patterns, conventions, and relevant files |
| `elenchus_interrogate` | Start/continue Socratic questioning session |
| `elenchus_answer` | Submit answers with coverage area categorization |
| `elenchus_generate_spec` | Gate on coverage, organize Q&A for synthesis |
| `elenchus_compile` | Generate executable agent prompts from Q&A |
| `elenchus_validate` | Validate spec completeness |
| `elenchus_checkpoint` | Record checkpoint decisions during execution |
| `elenchus_delivery` | Record what was delivered after execution |
| `elenchus_status` | Get status of epics, sessions, or specs |
| `elenchus_health` | Server health check |

## How Interrogation Works

The calling LLM is the intelligence. Elenchus provides:

1. **Coverage areas** - scope, success, constraint, risk, stakeholder, technical
2. **Tracking** - What's been asked, what's been answered
3. **Gating** - Blocks spec generation until required areas are covered

The tool descriptions contain the Socratic methodology. When you call `elenchus_interrogate`, you get back:
- The epic content
- Current coverage percentages
- Previous Q&A for context
- What's missing

The calling LLM reads this and formulates questions. The user answers. The LLM calls `elenchus_answer` with categorized answers. Repeat until ready.

## Executable Prompt Format

The `elenchus_compile` output includes prompts for each agent phase:

```json
{
  "problemStatement": "Build a book library API with search and checkout",
  "technicalDecisions": [
    { "decision": "Use Express + TypeScript", "rationale": "User requirement" }
  ],
  "agentPrompts": {
    "research": "Analyze existing code patterns in /src/...",
    "design": "Design REST endpoints for /books, /checkouts...",
    "implementation": "Implement BookService with checkout logic...",
    "test": "Test concurrent checkout conflicts...",
    "review": "Verify error handling follows Result<T,E> pattern..."
  },
  "successCriteria": ["Search returns in <200ms", "Checkout prevents conflicts"],
  "executionPlan": [
    { "phase": "Research", "agent": "researcher", "estimatedEffort": "S" },
    { "phase": "Design", "agent": "architect", "estimatedEffort": "M" }
  ],
  "checkpoints": [
    { "after": "Design", "reviewCriteria": "API contract review" }
  ]
}
```

## Codebase Analysis

When you call `elenchus_analyze`, it detects:

- **Maturity**: greenfield, early, established, legacy
- **Architecture**: monolith, microservices, serverless
- **Conventions**: error handling, validation, testing patterns
- **Relevant files**: What files relate to the epic

This context gets included in compiled prompts so agents follow your existing patterns.

## Feedback Loops

Elenchus stores execution records and can learn patterns:

- `ExecutionRecord` - What prompts led to success/failure
- `PromptInsight` - Patterns like "explicit file paths → 85% success rate"

These insights feed back into future compilations. No ML—just correlation tracking.

## Development

```bash
npm run dev       # Run with watch mode
npm run build     # Compile TypeScript
npm run test      # Run tests
npm run typecheck # Type check
npm run lint      # Lint
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

## Philosophy

1. **Claude is the intelligence** - Elenchus provides state and prompts, not reasoning
2. **Interrogation over speculation** - Ask questions, don't assume answers
3. **Executable output** - Prompts for agents, not documents for humans
4. **Gated progression** - Block advancement until requirements are met
5. **Feedback loops** - Learn from outcomes without complex ML

## License

MIT
