# Elenchus

<p align="center">
  <img src="elenchus.png" alt="Elenchus - The Spec Factory" width="600">
</p>

<p align="center">
  <strong>Transform epics into POCs through Socratic interrogation</strong>
</p>

> **Elenchus** (ἔλεγχος): The Socratic method of eliciting truth by question and answer.

Transform high-level epics into working proof-of-concepts through **interrogative specification** and **checkpoint-based execution**.

## The Problem

79-87% of AI coding agent failures are specification problems, not technical ones. Agents fail because they're given vague requirements and expected to read minds.

Current approaches fail because:
- **Over-specification** defeats agent creativity and becomes outdated immediately
- **Under-specification** leads to constant clarification loops and wasted cycles
- **Static specs** diverge from dynamic codebases

## The Solution

Elenchus uses a **hybrid approach**:

1. **Thin spec upfront**: Capture intent and constraints, not implementation details
2. **Socratic interrogation**: Generate targeted clarifying questions to surface ambiguity
3. **Checkpoint validation**: Human-in-the-loop approval at critical decision points
4. **Context-aware generation**: Analyze your codebase to generate specs that fit

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/elenchus.git
cd elenchus

# Install dependencies
npm install

# Build
npm run build
```

## Setup

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

### Verify Installation

Restart your editor and check that Elenchus tools are available. In Claude Code, you can ask:

> "What Elenchus tools are available?"

## Quick Start

### 1. Ingest an Epic

```
Use elenchus_ingest to process this epic:

"Build a REST API for managing a book library. Users should be able to:
- Add, update, and delete books
- Search books by title, author, or ISBN
- Track which books are checked out and by whom

Technical requirements:
- Use Express and TypeScript
- Store data in SQLite
- Include authentication for librarians"
```

### 2. Analyze Your Codebase (Optional)

```
Use elenchus_analyze to understand my codebase at /path/to/project
```

This detects:
- Codebase maturity (greenfield, early, established, legacy)
- Architecture patterns (monolith, microservices, serverless)
- Existing conventions (naming, file structure, testing)
- Relevant files for your epic

### 3. Start Interrogation

```
Use elenchus_interrogate to generate clarifying questions for my epic
```

Elenchus generates prioritized questions like:
- **Critical**: "What are the acceptance criteria for the search feature?"
- **Important**: "Should authentication use JWT or sessions?"
- **Nice-to-have**: "What's the expected timeline for this POC?"

### 4. Answer Questions

```
Use elenchus_answer to respond:
- Question about search: "Users should be able to search by partial title match, exact author name, or ISBN. Results should return within 200ms."
- Question about auth: "Use JWT with 24-hour expiration"
```

Repeat until clarity score reaches 70%+.

### 5. Generate Specification

```
Use elenchus_generate_spec to create the agent-ready specification
```

Outputs in three formats:
- **YAML**: Machine-readable for agent consumption
- **Markdown**: Human-readable for review
- **JSON**: Structured task graph for orchestration

### 6. Validate and Execute

```
Use elenchus_validate to check the spec is complete
```

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `elenchus_ingest` | Parse epics from text, JIRA, Notion, GitHub, or Linear |
| `elenchus_analyze` | Analyze codebase context, patterns, and conventions |
| `elenchus_interrogate` | Generate Socratic clarifying questions |
| `elenchus_answer` | Process answers and update session |
| `elenchus_generate_spec` | Create agent-ready specification |
| `elenchus_validate` | Validate spec completeness and readiness |
| `elenchus_status` | Check status of epics, sessions, or specs |

## Workflow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   INGEST    │────▶│   ANALYZE   │────▶│ INTERROGATE │
│   Epic      │     │  Codebase   │     │  Questions  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┘
                    │
                    ▼
            ┌─────────────┐     ┌─────────────┐
            │   ANSWER    │────▶│  GENERATE   │
            │  Questions  │     │    Spec     │
            └─────────────┘     └──────┬──────┘
                                       │
                    ┌──────────────────┘
                    │
                    ▼
            ┌─────────────┐     ┌─────────────┐
            │  VALIDATE   │────▶│   EXECUTE   │
            │    Spec     │     │    POC      │
            └─────────────┘     └─────────────┘
```

## Example Session

```typescript
// 1. Ingest epic
const epic = await elenchus_ingest({
  source: 'text',
  content: 'Build a todo app with user authentication...'
});
// Returns: { epic: { id: 'epic-abc123', ... }, extractionConfidence: 75 }

// 2. Analyze codebase
const context = await elenchus_analyze({
  path: '.',
  epicId: epic.epic.id
});
// Returns: { maturity: 'established', architecture: 'monolith', ... }

// 3. Start interrogation
const session = await elenchus_interrogate({
  epicId: epic.epic.id
});
// Returns: { session: {...}, nextQuestions: [...], readyForSpec: false }

// 4. Answer questions
await elenchus_answer({
  sessionId: session.session.id,
  questionId: 'q-scope-goals-1',
  answer: 'Users should be able to create, complete, and delete todos'
});

// 5. Generate spec when ready
const spec = await elenchus_generate_spec({
  sessionId: session.session.id,
  format: 'all'
});
// Returns: { spec: {...}, yaml: '...', markdown: '...', json: '...' }
```

## Specification Output

Generated specs include:

### Business Context
- Problem statement
- User persona
- Success metrics
- Out of scope items

### Technical Context
- Codebase analysis results
- Constraints and requirements
- Integration points

### Execution Plan
- Phased approach (Research → Architecture → Implementation → Testing → Review)
- Task breakdown with agent assignments
- Checkpoint gates for human approval

### Validation
- Acceptance criteria (Given/When/Then format)
- Test strategy
- Risk assessment

### Estimates
- Token usage estimates
- Cost estimates (by phase)
- Duration estimates

## Question Types

Elenchus generates questions in six categories:

| Type | Purpose | Example |
|------|---------|---------|
| **Scope** | Define boundaries | "What is explicitly OUT of scope?" |
| **Constraint** | Surface requirements | "Are there performance requirements?" |
| **Success** | Define done | "How will we validate this works?" |
| **Technical** | Guide decisions | "Should we use REST or GraphQL?" |
| **Risk** | Identify concerns | "What could go wrong?" |
| **Clarification** | Remove ambiguity | "When you say 'users', do you mean...?" |

## Codebase Maturity Detection

Elenchus adapts to your codebase:

| Maturity | Signals | Approach |
|----------|---------|----------|
| **Greenfield** | No files | Maximum flexibility, establish conventions |
| **Early** | Few files, no tests | Suggest patterns, add testing |
| **Established** | Tests, CI, TypeScript | Follow existing conventions |
| **Legacy** | Large, mixed patterns | Careful integration, risk assessment |

## Architecture

```
elenchus/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server
│   ├── tools/             # MCP tool implementations
│   │   ├── ingest.ts
│   │   ├── analyze.ts
│   │   ├── interrogate.ts
│   │   ├── answer.ts
│   │   ├── generate-spec.ts
│   │   ├── validate.ts
│   │   └── status.ts
│   ├── resources/         # MCP resources
│   ├── storage/           # SQLite persistence
│   ├── types/             # TypeScript definitions
│   └── utils/             # Helpers
├── dist/                  # Compiled output
└── package.json
```

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Roadmap

### MVP (Current)
- [x] Epic ingestion (text)
- [x] Codebase analysis
- [x] Socratic interrogation
- [x] Spec generation (YAML/Markdown/JSON)
- [x] Validation

### Next
- [ ] Agent orchestration (`elenchus_execute`)
- [ ] POC delivery packaging (`elenchus_deliver`)
- [ ] JIRA/Notion/GitHub integrations
- [ ] Checkpoint management UI

### Future
- [ ] Multi-user sessions
- [ ] Cost tracking and optimization
- [ ] Spec versioning and diff
- [ ] Integration with claude-flow swarms

## Philosophy

1. **Interrogation over Specification**: Ask questions, don't assume answers
2. **Checkpoints over Autonomy**: Humans approve at critical gates
3. **Adaptation over Prescription**: Detect codebase context, don't force patterns
4. **Transparency over Magic**: Show reasoning, decisions, and tradeoffs
5. **Incremental over Big-Bang**: Deliver value at each checkpoint

## Why "Elenchus"?

In ancient Greek philosophy, *elenchus* (ἔλεγχος) refers to the Socratic method of inquiry—a form of cooperative argumentative dialogue that uses questioning to stimulate critical thinking and illuminate ideas.

Just as Socrates used questions to help others discover truth, Elenchus uses targeted interrogation to transform vague epics into precise, executable specifications.

## License

MIT

## Contributing

Contributions welcome! Please read the architecture documentation in `ARCHITECTURE.md` before submitting PRs.
