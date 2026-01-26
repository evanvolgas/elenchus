# Elenchus Architecture

## Overview

Elenchus implements **true Socratic elenchus** for software specification.

```
Epic → [elenchus_start] → Session
                            ↓
      [elenchus_qa] ← Q&A + Premises + Contradictions
            ↓
      Contradiction? → Force Resolution (Aporia)
            ↓
      readyForSpec? → [elenchus_spec]
```

## Core Insight

**Claude is the intelligence. Elenchus tracks state and enforces gates.**

What we track:
- **Premises**: Logical commitments extracted from answers
- **Contradictions**: Conflicts between premises
- **Coverage**: Which areas have been addressed
- **Quality**: Score thresholds

What Claude does:
- Extract premises from user answers
- Detect contradictions between premises
- Generate challenge questions
- Synthesize final specification

## The Four-Phase Elenchus

| Phase | What Happens | Elenchus Support |
|-------|--------------|------------------|
| **Thesis** | User makes a claim | Store in session |
| **Examination** | Extract logical premises | `premises` array in qa input |
| **Refutation** | Detect contradictions | `contradictions` input, `contradictionCheckPrompt` output |
| **Aporia** | User confronts inconsistency | `challengeQuestion` output, `resolutions` input |

## Data Model

### Premise

```typescript
interface Premise {
  id: string;
  sessionId: string;
  statement: string;          // "All users have export access"
  extractedFrom: string;      // answerId
  type: 'capability' | 'constraint' | 'requirement' | 'assumption' | 'preference';
  confidence: 'high' | 'medium' | 'low';
  createdAt: string;
}
```

### Contradiction

```typescript
interface Contradiction {
  id: string;
  sessionId: string;
  premiseIds: string[];       // At least 2 conflicting premises
  description: string;        // Why they conflict
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolved: boolean;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
}
```

## MCP Tools

| Tool | Input | Output |
|------|-------|--------|
| `elenchus_start` | Epic content | epicId, sessionId, signals |
| `elenchus_qa` | Q&A + premises + contradictions + resolutions | coverage, elenchus state, contradictionCheckPrompt, challengeQuestion |
| `elenchus_spec` | sessionId | organized Q&A + premises + synthesis prompt |
| `elenchus_health` | - | server status |

## Readiness Gate

Cannot generate spec until:
1. All 4 required areas covered (scope, success, constraint, risk)
2. No answers scored below 3
3. **No unresolved critical contradictions** (the key Socratic gate)
4. At least 4 total answers

## The Contradiction Check Prompt

After each `elenchus_qa`, we return a prompt for the calling LLM:

```
You have accumulated the following premises:
1. [prem-1] (capability) "All users have export access"
2. [prem-2] (constraint) "PII must be protected"
3. [prem-3] (assumption) "Exports go to Excel"

Analyze for LOGICAL CONTRADICTIONS...
```

The calling LLM runs this, detects conflicts, reports them back.

## Challenge Question

When contradictions exist, we generate a Socratic challenge:

> "You said 'All users have export access' AND 'PII must be protected'.
> Excel files can be shared freely. These cannot both be true.
> Which is ESSENTIAL, or how do they work together?"

This forces **aporia** - the productive state of puzzlement that leads to better requirements.

## Storage

SQLite with tables:

| Table | Purpose |
|-------|---------|
| `epics` | Epic content |
| `sessions` | Q&A state |
| `premises` | Logical commitments |
| `contradictions` | Detected conflicts |
| `aporias` | Resolution state |
| `signals` | Gaps, tensions, assumptions |
| `evaluations` | Answer quality scores |

## Directory Structure

```
elenchus/
├── src/
│   ├── tools/
│   │   ├── start.ts      # elenchus_start
│   │   ├── qa.ts         # elenchus_qa (with premise/contradiction logic)
│   │   ├── spec.ts       # elenchus_spec
│   │   └── health.ts     # elenchus_health
│   ├── types/
│   │   └── signals.ts    # Premise, Contradiction, Aporia types
│   ├── storage/
│   │   └── index.ts      # SQLite persistence
│   └── prompts/
│       └── index.ts      # Signal detection prompt
```

## What Makes This Different

| Standard Approach | Elenchus Approach |
|-------------------|-------------------|
| Track Q&A | Track premises (logical commitments) |
| Check coverage | Check coverage + contradictions |
| Generate when complete | Generate when consistent |
| No conflict detection | Explicit contradiction detection |
| No forced resolution | Must resolve before proceeding |

## The Value Proposition

From research:
- 41.77% of agent failures are specification problems
- These happen BEFORE any code runs
- Most tools focus on execution (factories)
- Nobody focuses on specification (design department)

Elenchus is the design department that catches contradictions before they become bugs.
