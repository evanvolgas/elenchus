# Elenchus

An MCP server that builds better specs through Socratic interrogation.

> **Elenchus** (ἔλεγχος): The Socratic method of exposing contradictions through systematic questioning.

## What It Does

Elenchus implements **true Socratic elenchus** - not just Q&A tracking, but **contradiction detection and forced resolution**.

1. **Extracts premises** - From each answer, extract the logical commitments
2. **Detects contradictions** - Check if accumulated premises conflict
3. **Forces aporia** - Cannot generate spec until contradictions are resolved
4. **Gates spec generation** - Blocks until all required areas covered AND no unresolved contradictions

This addresses the [41.77% of agent failures](https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them) caused by specification problems.

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

## Quick Start

### 1. Start Interrogation

```
elenchus_start({
  "source": "text",
  "content": "Build a REST API for a book library. Users can search and checkout books."
})
```

### 2. Submit Q&A with Premises

The key difference: **extract premises** from each answer.

```
elenchus_qa({
  "sessionId": "session-xxx",
  "qa": [
    {
      "area": "scope",
      "question": "Who can checkout books?",
      "answer": "All users can checkout any book",
      "score": 4,
      "premises": [
        { "statement": "All users have checkout access", "type": "capability" },
        { "statement": "No book restrictions exist", "type": "assumption" }
      ]
    },
    {
      "area": "constraint",
      "question": "Are there any restrictions?",
      "answer": "Rare books can only be accessed by researchers",
      "score": 4,
      "premises": [
        { "statement": "Rare books have access restrictions", "type": "constraint" },
        { "statement": "Researchers have special permissions", "type": "capability" }
      ]
    }
  ]
})
```

### 3. Detect Contradictions

The response includes a `contradictionCheckPrompt` for you to analyze premises.
If you find conflicts, report them:

```
elenchus_qa({
  "sessionId": "session-xxx",
  "qa": [...],
  "contradictions": [
    {
      "premiseIds": ["prem-1", "prem-3"],
      "description": "All users can checkout any book conflicts with rare book restrictions",
      "severity": "critical"
    }
  ]
})
```

### 4. Resolve Contradictions (Aporia)

When contradictions exist, `readyForSpec` is `false`. You get a `challengeQuestion`:

> "You said 'All users have checkout access' AND 'Rare books have access restrictions'. These cannot both be true. Which is ESSENTIAL?"

Resolve by submitting the resolution:

```
elenchus_qa({
  "sessionId": "session-xxx",
  "qa": [
    {
      "area": "scope",
      "question": "Given the conflict, which takes priority?",
      "answer": "Rare books require researcher access. Regular users can checkout non-rare books only.",
      "score": 5,
      "premises": [
        { "statement": "Non-rare books available to all users", "type": "capability" },
        { "statement": "Rare books require researcher role", "type": "constraint" }
      ]
    }
  ],
  "resolutions": [
    { "contradictionId": "contra-xxx", "resolution": "Clarified scope: book access is role-based" }
  ]
})
```

### 5. Generate Spec

Only when `readyForSpec: true` (no unresolved contradictions):

```
elenchus_spec({ "sessionId": "session-xxx" })
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `elenchus_start` | Start interrogation with epic content |
| `elenchus_qa` | Submit Q&A with premises, detect contradictions |
| `elenchus_spec` | Generate specification (blocked if contradictions exist) |
| `elenchus_health` | Server health check |

## What Makes This Socratic

**Standard Q&A tracking:**
- "What users?" → "Admins and regular users" → Store it ✓

**True Socratic elenchus:**
- Extract premise: "Two user roles exist with different permissions"
- Later: "All users can do X" → Extract premise: "No permission differences"
- **Contradiction detected**: Cannot have role-based permissions AND no permission differences
- **Force resolution**: "Which is true? Or clarify how both work together."

This is the [four-phase elenchus](https://en.wikipedia.org/wiki/Socratic_method#Method):
1. **Thesis** - User states a claim
2. **Examination** - Extract premises through questioning
3. **Refutation** - Show premises contradict
4. **Aporia** - User recognizes inconsistency → better requirements

## Why This Matters

From [Augment Code's research](https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them):
- 41.77% of agent failures are specification problems
- 36.94% are coordination failures
- Combined: **78.71% of failures** happen before code execution

From [Ashita AI's analysis](https://ashita.ai/blog/the-factory-without-a-design-department/):
- "The constraint moved upstream. The tooling did not follow."
- Everyone builds factories (orchestration). Nobody builds the design department.

Elenchus is the design department.

## Development

```bash
npm run dev       # Run with watch mode
npm run build     # Compile TypeScript
npm run test      # Run tests
npm run typecheck # Type check
```

## License

MIT
