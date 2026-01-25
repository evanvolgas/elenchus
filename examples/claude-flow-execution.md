# Elenchus + Claude Flow: Spec Generation to Execution

This guide demonstrates how to use **Elenchus** to generate interrogative specifications and **Claude Flow** to execute them with checkpoint-based delivery.

## Overview

**Elenchus** transforms high-level epics into detailed specifications through Socratic interrogation, while **Claude Flow** provides the multi-agent execution environment to implement those specifications.

**Workflow**: Epic → Interrogate → Generate Spec → Execute with Agents → Deliver POC

## Prerequisites

### Install Elenchus MCP Server
```bash
# Add to Claude Desktop config (~/.config/claude/config.json)
{
  "mcpServers": {
    "elenchus": {
      "command": "node",
      "args": ["/path/to/elenchus/build/index.js"]
    }
  }
}
```

### Install Claude Flow MCP Server
```bash
# Add to Claude Desktop config
{
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["-y", "@claude-flow/cli@latest"]
    }
  }
}
```

## Step-by-Step Workflow

### 1. Ingest Epic with Elenchus

Start by ingesting your feature request or epic:

```javascript
// Using the Elenchus MCP tool
mcp__elenchus__elenchus_ingest({
  source: "text",
  content: "Build a user authentication system with JWT tokens, supporting login, logout, and token refresh. Must integrate with our existing Express.js API."
})
```

**Returns**: `epicId` (e.g., `epic-abc123`)

### 2. Analyze Codebase Context

Let Elenchus understand your codebase patterns:

```javascript
mcp__elenchus__elenchus_analyze({
  epicId: "epic-abc123",
  path: ".",
  depth: "medium"
})
```

**Returns**: Codebase maturity, architecture patterns, tech stack, conventions

### 3. Interrogate the Epic

Run the Socratic interrogation to clarify requirements:

```javascript
mcp__elenchus__elenchus_interrogate({
  epicId: "epic-abc123"
})
```

**Returns**: `sessionId` and prioritized questions

**Answer questions**:
```javascript
mcp__elenchus__elenchus_answer({
  sessionId: "session-xyz789",
  answers: [
    {
      questionId: "q-1",
      answer: "We'll use bcrypt for password hashing with a cost factor of 12"
    },
    {
      questionId: "q-2",
      answer: "Access tokens expire in 15 minutes, refresh tokens in 7 days"
    }
  ],
  answeredBy: "human:product-lead"
})
```

Continue answering until clarity threshold is met (typically 3-5 rounds).

### 4. Generate Specification

Once interrogation is complete, generate the execution spec:

```javascript
mcp__elenchus__elenchus_generate_spec({
  sessionId: "session-xyz789",
  format: "markdown",  // Most readable for handoff
  compact: true        // Exclude verbose context
})
```

**Returns**: Structured specification with:
- Phases with dependencies
- Acceptance criteria
- Risks and mitigations
- Estimated effort
- Files to create/modify

### 5. Execute with Claude Flow

Map Elenchus phases to Claude Flow agents for parallel execution.

#### Phase Mapping

| Elenchus Phase | Claude Flow Agent | Purpose |
|----------------|-------------------|---------|
| `phase-research` | `researcher` | Analyze requirements and patterns |
| `phase-architecture` | `system-architect` | Design system structure and APIs |
| `phase-implementation` | `coder` | Implement features and logic |
| `phase-testing` | `tester` | Write and run tests |
| `phase-review` | `reviewer` | Code review and security audit |

#### Initialize Claude Flow Swarm

```bash
# Initialize swarm with hierarchical topology for controlled execution
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

#### Spawn Agents in Background

Use Claude Code's Task tool to spawn agents based on the Elenchus spec phases:

```javascript
// Phase 1: Research (if specified in spec)
Task({
  prompt: `Research authentication patterns in the codebase. Focus on:
  - Existing middleware structure
  - Database schema conventions
  - Error handling patterns
  Store findings in memory under key 'auth-research'.`,
  subagent_type: "researcher",
  description: "Authentication research phase",
  run_in_background: true
})

// Phase 2: Architecture
Task({
  prompt: `Design the authentication system architecture based on research:
  - JWT token structure (access + refresh)
  - Middleware for route protection
  - Token storage and rotation strategy
  - Error responses
  Document design decisions in memory under 'auth-architecture'.`,
  subagent_type: "system-architect",
  description: "Authentication architecture phase",
  run_in_background: true
})

// Phase 3: Implementation
Task({
  prompt: `Implement the authentication system following the architecture:
  - auth.service.ts: Token generation, validation, refresh
  - auth.middleware.ts: Route protection
  - auth.controller.ts: Login, logout, refresh endpoints
  Follow existing codebase conventions. Store file paths in memory.`,
  subagent_type: "coder",
  description: "Authentication implementation phase",
  run_in_background: true
})

// Phase 4: Testing
Task({
  prompt: `Write comprehensive tests for authentication:
  - Unit tests for token service
  - Integration tests for endpoints
  - Edge cases (expired tokens, invalid credentials)
  Aim for >80% coverage.`,
  subagent_type: "tester",
  description: "Authentication testing phase",
  run_in_background: true
})

// Phase 5: Security Review
Task({
  prompt: `Review authentication implementation for security:
  - Token storage best practices
  - Timing attack prevention
  - Input validation
  - Rate limiting considerations
  Document any security concerns.`,
  subagent_type: "reviewer",
  description: "Security review phase",
  run_in_background: true
})
```

**Note**: Agents work in parallel. Tell the user and wait for results:

```
I've launched 5 agents in background:
- 🔍 Researcher: Analyzing codebase authentication patterns
- 🏗️ Architect: Designing JWT authentication system
- 💻 Coder: Implementing auth services and endpoints
- 🧪 Tester: Writing comprehensive test suite
- 🔐 Reviewer: Security audit and best practices check

Working in parallel - I'll synthesize when they complete.
```

### 6. Checkpoint Management

After phases with `checkpointAfter: true` in the spec:

```javascript
// Review artifacts from completed phase
// (e.g., architecture documents, implementation code)

// Record checkpoint decision
mcp__elenchus__elenchus_checkpoint({
  specId: "spec-def456",
  phaseId: "phase-architecture",
  decision: "approve",  // or "reject" or "modify"
  feedback: "Architecture looks solid. Token rotation strategy is well-designed.",
  artifacts: [
    {
      type: "design-doc",
      path: "docs/auth-architecture.md",
      description: "JWT authentication architecture"
    }
  ]
})
```

**Checkpoint Decisions**:
- `approve`: Continue to next phase
- `reject`: Stop execution, requires rework
- `modify`: Request changes before proceeding

### 7. Record Final Delivery

After all phases complete successfully:

```javascript
mcp__elenchus__elenchus_delivery({
  specId: "spec-def456",
  status: "success",
  artifacts: [
    {
      type: "source-code",
      path: "src/auth/auth.service.ts",
      description: "JWT token service"
    },
    {
      type: "source-code",
      path: "src/auth/auth.middleware.ts",
      description: "Authentication middleware"
    },
    {
      type: "source-code",
      path: "src/auth/auth.controller.ts",
      description: "Authentication endpoints"
    },
    {
      type: "tests",
      path: "tests/auth.test.ts",
      description: "Authentication test suite (85% coverage)"
    },
    {
      type: "documentation",
      path: "docs/auth-api.md",
      description: "Authentication API documentation"
    }
  ],
  metrics: {
    linesOfCode: 450,
    testCoverage: 0.85,
    filesModified: 5,
    durationMinutes: 120
  },
  notes: "Successfully implemented JWT authentication with refresh token rotation. All security review items addressed."
})
```

## Complete Example: User Dashboard Feature

```javascript
// 1. Ingest Epic
const { epicId } = await elenchus_ingest({
  source: "text",
  content: "Build a user dashboard showing account activity, recent purchases, and personalized recommendations"
});

// 2. Analyze Codebase
await elenchus_analyze({
  epicId,
  depth: "medium"
});

// 3. Interrogate (answer 3-5 rounds of questions)
const { sessionId } = await elenchus_interrogate({ epicId });

// Answer questions about data sources, caching, personalization algorithms...
await elenchus_answer({
  sessionId,
  answers: [/* ... */]
});

// 4. Generate Spec
const { spec } = await elenchus_generate_spec({
  sessionId,
  format: "markdown"
});

// 5. Execute with Claude Flow
// Initialize swarm
await Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical");

// Spawn agents based on spec phases
Task({
  prompt: "Research dashboard UI patterns...",
  subagent_type: "researcher",
  run_in_background: true
});
Task({
  prompt: "Design dashboard architecture...",
  subagent_type: "system-architect",
  run_in_background: true
});
Task({
  prompt: "Implement dashboard components...",
  subagent_type: "coder",
  run_in_background: true
});

// 6. Checkpoint after architecture phase
await elenchus_checkpoint({
  specId: spec.id,
  phaseId: "phase-architecture",
  decision: "approve",
  artifacts: [/* architecture docs */]
});

// 7. Final delivery
await elenchus_delivery({
  specId: spec.id,
  status: "success",
  artifacts: [/* all implementation files */],
  metrics: { /* LOC, coverage, duration */ }
});
```

## Best Practices

### 1. Thorough Interrogation
- Don't rush through questions
- Involve domain experts for answers
- Clarify ambiguous requirements upfront

### 2. Checkpoint Review
- Actually review artifacts at each checkpoint
- Use `modify` decision to course-correct early
- Document feedback for learning

### 3. Memory Coordination
```bash
# Agents store findings in Claude Flow memory
npx @claude-flow/cli@latest memory store --key "dashboard-patterns" --value "..." --namespace patterns

# Retrieve shared context
npx @claude-flow/cli@latest memory search --query "dashboard" --namespace patterns
```

### 4. Phase Dependencies
- Respect `dependsOn` in spec phases
- Don't start implementation before architecture approval
- Use sequential Task calls when dependencies exist

### 5. Error Recovery
- If a phase fails, reject at checkpoint
- Update interrogation answers if requirements change
- Regenerate spec if major changes needed

## Troubleshooting

**Issue**: Agents produce conflicting implementations
- **Solution**: Use hierarchical topology with coordinator to enforce consistency

**Issue**: Checkpoint artifacts missing
- **Solution**: Ensure agents store outputs in known locations and document in memory

**Issue**: Spec doesn't match codebase conventions
- **Solution**: Run `elenchus_analyze` with `depth: "deep"` for better context

**Issue**: Execution takes too long
- **Solution**: Break epic into smaller chunks, interrogate separately

## Resources

- Elenchus Documentation: `../ARCHITECTURE.md`
- Claude Flow Commands: See CLAUDE.md in Claude Flow repo
- MCP Protocol: https://modelcontextprotocol.io

---

**Key Insight**: Elenchus asks the right questions, Claude Flow executes the right answers.
