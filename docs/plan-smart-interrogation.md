# Plan: Smart Interrogation via Structured Prompts

## Problem

Current interrogation is just a checklist. "Covered" means "has any answer" not "has quality answer." No conflict detection. No signal extraction from epics. The tool description tells Claude what to do, but Elenchus doesn't verify it happened.

## Solution

Add structured evaluation prompts that Claude executes. Elenchus tracks the results and gates on quality, not just presence.

**Core principle:** Claude is the intelligence. Elenchus provides structure and tracks state.

## New Flow

### 1. Ingest (enhanced)

Current: Parse epic, extract goals/constraints via simple heuristics.

New: Return a **signal detection prompt** with the parsed epic.

```
elenchus_ingest returns:
{
  epic: { ... },
  signalDetectionPrompt: "Analyze this epic and identify claims, gaps, tensions, assumptions. Return JSON: { signals: [...] }",
  nextStep: "Run the signal detection prompt, then call elenchus_signals with the results"
}
```

Claude runs the prompt, calls new tool `elenchus_signals` with extracted signals. Elenchus stores them.

### 2. Interrogate (enhanced)

Current: Return epic + coverage state.

New: Also return stored signals, organized by whether they've been addressed.

```
elenchus_interrogate returns:
{
  epic: { ... },
  signals: {
    unaddressed: [ { type: 'gap', content: 'No error handling mentioned', severity: 'high' }, ... ],
    addressed: [ ... ]
  },
  coverage: { ... },
  evaluations: {
    lowQuality: [ { answerId: 'a1', score: 2, followUp: 'What specific response time?' }, ... ],
    conflicts: [ { answerIds: ['a1', 'a3'], description: 'Real-time conflicts with batch processing' }, ... ]
  },
  nextStep: "Ask probing questions about unaddressed signals. Follow up on low-quality answers."
}
```

### 3. Answer (enhanced)

Current: Store answers, update coverage counts.

New: Return an **evaluation prompt** for Claude to assess the answers.

```
elenchus_answer returns:
{
  stored: true,
  answersToEvaluate: [
    { id: 'a5', type: 'scope', question: '...', answer: '...' }
  ],
  relatedAnswers: [
    { id: 'a1', type: 'scope', question: '...', answer: '...' }  // for conflict detection
  ],
  evaluationPrompt: "Score each answer 1-5 for specificity. Check for conflicts with related answers. Return JSON: { evaluations: [...] }",
  nextStep: "Run the evaluation prompt, then call elenchus_evaluate with results"
}
```

Claude runs the prompt, calls new tool `elenchus_evaluate` with scores and conflicts.

### 4. New Tool: elenchus_signals

Stores signals extracted from epic analysis.

```typescript
Input: {
  epicId: string,
  signals: Array<{
    type: 'claim' | 'gap' | 'tension' | 'assumption',
    content: string,
    quote?: string,  // from epic
    severity: 'critical' | 'high' | 'medium' | 'low'
  }>
}

Output: {
  stored: number,
  byType: { claim: 3, gap: 5, tension: 2, assumption: 4 },
  criticalSignals: [ ... ]  // ones that must be addressed
}
```

### 5. New Tool: elenchus_evaluate

Stores answer evaluations and conflicts.

```typescript
Input: {
  sessionId: string,
  evaluations: Array<{
    answerId: string,
    score: 1 | 2 | 3 | 4 | 5,
    reasoning: string,
    followUp?: string,  // suggested question if score < 4
    addressesSignals?: string[]  // signal IDs this answer addresses
  }>,
  conflicts?: Array<{
    answerIds: [string, string],
    description: string,
    severity: 'high' | 'medium' | 'low'
  }>
}

Output: {
  stored: true,
  qualityMetrics: {
    averageScore: 3.5,
    lowQualityCount: 2,
    conflictCount: 1
  },
  nextStep: "..."
}
```

### 6. Generate Spec / Compile (enhanced gating)

Current: Gate on coverage (4 areas have answers).

New: Gate on quality metrics.

```typescript
Gating rules:
- All required coverage areas have ≥1 answer with score ≥ 3
- Average score across all answers ≥ 3.5
- No unresolved high-severity conflicts
- All critical signals addressed

If not met, return specific blockers:
{
  blocked: true,
  reasons: [
    "2 answers scored below 3 (need follow-up)",
    "1 unresolved conflict between scope and constraint answers",
    "Critical gap 'no auth mentioned' not addressed"
  ]
}
```

## Data Structures

### Signal (new)

```typescript
interface Signal {
  id: string;
  epicId: string;
  type: 'claim' | 'gap' | 'tension' | 'assumption';
  content: string;
  quote?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  addressed: boolean;
  addressedBy?: string;  // answerId
  createdAt: string;
}
```

### AnswerEvaluation (new)

```typescript
interface AnswerEvaluation {
  id: string;
  sessionId: string;
  answerId: string;
  score: 1 | 2 | 3 | 4 | 5;
  reasoning: string;
  followUp?: string;
  evaluatedAt: string;
}
```

### Conflict (new)

```typescript
interface Conflict {
  id: string;
  sessionId: string;
  answerIds: [string, string];
  description: string;
  severity: 'high' | 'medium' | 'low';
  resolved: boolean;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}
```

## Prompts

### Signal Detection Prompt

```
Analyze this epic and identify:

1. **CLAIMS** - Explicit statements about what the system should do
2. **GAPS** - Important aspects NOT mentioned that should be (error handling, auth, scale, security, edge cases, data lifecycle)
3. **TENSIONS** - Requirements that might conflict with each other
4. **ASSUMPTIONS** - Things taken for granted that should be verified

Epic:
---
{epic.rawContent}
---

Return JSON (no markdown, just JSON):
{
  "signals": [
    {
      "type": "claim|gap|tension|assumption",
      "content": "description of the signal",
      "quote": "relevant quote from epic if applicable",
      "severity": "critical|high|medium|low"
    }
  ]
}

Severity guide:
- critical: Will definitely cause failure if not addressed
- high: Likely to cause problems
- medium: Should be clarified
- low: Nice to have clarity
```

### Answer Evaluation Prompt

```
Evaluate these answers for specificity and check for conflicts.

Answers to evaluate:
{answersToEvaluate as JSON}

Related previous answers (check for conflicts):
{relatedAnswers as JSON}

**Scoring guide (1-5):**
1 = Completely vague ("it should work", "yes")
2 = Somewhat vague ("it should be fast", "users")
3 = Partially specific ("response under 1 second", "admins and regular users")
4 = Mostly specific ("search returns <200ms for up to 100k records")
5 = Fully specific with edge cases ("search <200ms for 100k records, graceful degradation to 500ms at 1M, pagination required above 10k results")

Return JSON (no markdown, just JSON):
{
  "evaluations": [
    {
      "answerId": "the answer id",
      "score": 1-5,
      "reasoning": "why this score",
      "followUp": "question to ask if score < 4, or null"
    }
  ],
  "conflicts": [
    {
      "answerIds": ["id1", "id2"],
      "description": "how they conflict",
      "severity": "high|medium|low"
    }
  ]
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add Signal, AnswerEvaluation, Conflict interfaces |
| `src/storage/index.ts` | Add saveSignal, getSignals, saveEvaluation, saveConflict, etc. |
| `src/tools/index.ts` | Register new tools |
| `src/tools/ingest.ts` | Return signal detection prompt |
| `src/tools/interrogate.ts` | Return signals + evaluations + conflicts |
| `src/tools/answer.ts` | Return evaluation prompt + related answers |
| `src/tools/generate-spec.ts` | Enhanced gating on quality |
| `src/tools/compile.ts` | Enhanced gating on quality |
| `src/prompts/index.ts` | Add signal detection + evaluation prompts |

## New Files

| File | Purpose |
|------|---------|
| `src/tools/signals.ts` | elenchus_signals tool |
| `src/tools/evaluate.ts` | elenchus_evaluate tool |
| `src/tools/resolve-conflict.ts` | elenchus_resolve_conflict tool |

### New Tool: elenchus_resolve_conflict

Records explicit resolution of detected conflicts.

```typescript
Input: {
  sessionId: string,
  conflictId: string,
  resolution: string,  // How the conflict was resolved
  decision: 'keep_both' | 'supersede_first' | 'supersede_second' | 'clarify',
  notes?: string
}

Output: {
  resolved: true,
  conflict: { ... },  // The resolved conflict
  remainingConflicts: number
}
```

## Migration

Existing sessions without evaluations: Fall back to current behavior (presence-based coverage). New sessions get quality-based gating.

## Testing Strategy

1. Unit tests for new storage methods
2. Unit tests for new tools (signals, evaluate)
3. Integration test: full flow from ingest → signals → interrogate → answer → evaluate → compile
4. Test gating: verify blocked when quality is low, passes when quality is high

## Estimated Scope

- Types: ~50 lines
- Storage: ~100 lines
- New tools (signals, evaluate): ~200 lines
- Modified tools: ~150 lines
- Prompts: ~50 lines
- Tests: ~300 lines

Total: ~850 lines

## What This Doesn't Do

- No API key required
- No regex or keyword matching
- No custom NLP
- No training data
- Elenchus doesn't call LLMs directly

Claude does all the intelligent work. Elenchus structures the interaction and tracks results.

## Decisions Made

1. **Conflict resolution**: Explicit `elenchus_resolve_conflict` tool. Creates audit trail of deliberate decisions about tensions.

2. **Signal-to-answer matching**: Automatic via evaluation prompt. Claude identifies which signals each answer addresses during evaluation (more accurate, in context).

3. **Quality thresholds**: Advisory with escape hatch. Calculate quality metrics, strongly advise against proceeding if below threshold, explain exactly what's weak, but allow `forceReady: true` to proceed. Record when forced.

Advisory output structure:
```json
{
  "readyForSpec": false,
  "qualityScore": 2.8,
  "advisory": {
    "recommendation": "Not ready. 3 issues need attention.",
    "issues": [
      { "severity": "high", "issue": "Answer about auth scored 2/5", "suggestion": "Ask: What authentication method? Session duration?" },
      { "severity": "high", "issue": "Conflict: 'real-time updates' vs 'no websockets'", "suggestion": "Resolve how updates will work" },
      { "severity": "medium", "issue": "Gap 'error handling' not addressed", "suggestion": "Ask what happens when API calls fail" }
    ],
    "canForce": true,
    "forceWarning": "Proceeding with low-quality spec increases risk of implementation failures"
  }
}
```
