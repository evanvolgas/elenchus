# Interrogation Engine V2: Specification

> Transforming Elenchus from template-based questioning to truly Socratic, LLM-powered interrogation.

## Overview

The current interrogation engine generates 7 fixed template questions based on gaps in epics. V2 introduces:

- **LLM-powered question generation** that understands epics semantically
- **Context-aware questions** based on codebase analysis
- **Answer validation** with vagueness detection and contradiction surfacing
- **Intelligent multi-round progression** that deepens based on answers
- **Challenge mode** for experienced users wanting rigorous interrogation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERROGATION ENGINE V2                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   TEMPLATE   │───▶│     LLM      │───▶│  VALIDATOR   │       │
│  │   SCAFFOLD   │    │   ENHANCER   │    │   (LLM)      │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         │    ┌──────────────┴──────────────┐    │                │
│         │    │      CLAUDE API             │    │                │
│         │    │  (Anthropic, MCP fallback)  │    │                │
│         │    └─────────────────────────────┘    │                │
│         │                                       │                │
│         ▼                                       ▼                │
│  ┌──────────────┐                      ┌──────────────┐          │
│  │   CODEBASE   │                      │ CONTRADICTION│          │
│  │   CONTEXT    │                      │   DETECTOR   │          │
│  └──────────────┘                      └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    ROUND CONTROLLER                       │   │
│  │  • Max 10 rounds (Ralph Wiggum termination)              │   │
│  │  • Escape at 80%+ clarity (or user override)             │   │
│  │  • Challenge mode (opt-in)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

```typescript
interface InterrogationConfig {
  // LLM Provider
  anthropicApiKey?: string;           // Env: ANTHROPIC_API_KEY, config fallback
  mcpFallback: boolean;               // Use MCP host if no API key

  // Model Selection (complexity-based routing)
  models: {
    validation: 'haiku';              // Fast validation checks
    generation: 'sonnet';             // Question generation
  };

  // Round Control
  maxRounds: 10;                      // Ralph Wiggum termination limit
  escapeThreshold: 80;                // Clarity % to allow early exit

  // Challenge Mode
  challengeMode: boolean;             // Opt-in devil's advocate mode
}
```

### API Key Resolution Order

1. Environment variable: `ANTHROPIC_API_KEY`
2. Config file: `elenchus.config.json` → `anthropicApiKey`
3. First-run prompt if both missing
4. MCP fallback if configured and no key available

## Components

### 1. Template Scaffold

**Purpose**: Provide baseline questions and fallback when LLM unavailable.

**Behavior**:
- Always runs first to establish question structure
- Generates initial questions: goals, constraints, success criteria, scope
- Serves as fallback when LLM is unavailable
- Questions are deterministic and predictable

**Output**: Array of `Question` objects with `source: 'template'`

### 2. LLM Question Enhancer

**Purpose**: Generate context-aware, semantically-informed questions.

**Model**: Claude Sonnet (balanced capability/cost)

**Inputs**:
- Epic content and extracted metadata
- Codebase context (imports, exports, patterns, tech stack)
- Previous questions and answers (for follow-up generation)
- Current round number

**Behavior**:
- Analyzes epic semantically to identify ambiguities
- Generates questions specific to detected technologies
- Creates follow-up questions based on previous answers
- Respects question type taxonomy (scope, constraint, success, technical, risk, etc.)

**Example Output**:
```
Epic mentions "real-time updates" + Codebase has Redis
→ "I see Redis in your stack. Should real-time updates use Redis pub/sub,
   WebSockets directly, or a different approach?"
```

### 3. Answer Validator

**Purpose**: Assess answer quality and detect issues.

**Model**: Claude Haiku (fast, cheap for validation)

**Validation Checks**:
1. **Vagueness Detection**: Flag answers like "users should be able to do stuff"
2. **Completeness Check**: Does answer fully address the question?
3. **Coherence Check**: Is answer internally consistent?
4. **Contradiction Detection**: Does answer conflict with previous answers?

**On Vague Answer**:
- Auto-generate follow-up question (returned in next round)
- Lower clarity score by weighted amount
- Do NOT hard-block progression

**Contradiction Detection Aggressiveness**: Aggressive
- Obvious logical contradictions: "no auth needed" + later mentions "admin roles"
- Implicit conflicts: "real-time" + "batch processing nightly"
- Potential inconsistencies: challenges things that *might* be wrong

### 4. Codebase Context Integration

**Depth**: Medium
- File names and structure
- Package.json / dependencies
- Imports and exports
- Function signatures
- Test patterns and frameworks
- NOT: Full AST analysis or data flow graphs

**Conflict Detection**:
- Epic says X, codebase does Y → surface as critical question
- Example: Epic says "use PostgreSQL", codebase is MongoDB everywhere
- Surfaced as informational question (let human decide importance)

### 5. Round Controller

**Max Rounds**: 10 (Ralph Wiggum termination)

**Round Progression Logic**:

| Condition | Action |
|-----------|--------|
| All round N questions answered | Evaluate clarity → Generate round N+1 if < 80% |
| Clarity ≥ 80% | Allow early exit with `forceReady: true` |
| Clarity < 80% + no `forceReady` | Continue to next round |
| Round 10 reached + clarity < 80% | Warn + proceed + log gaps |

**Escape Hatch**:
- `forceReady: true` flag in input
- Only works if clarity ≥ 80%
- Below 80%: flag is ignored, must reach threshold or round 10

**Round 10 Warning Format**:
```json
{
  "warning": "Clarity at 62% after 10 rounds. Proceeding with incomplete specification.",
  "gaps": [
    "Success criteria remain vague",
    "Authentication approach not fully specified",
    "Performance requirements unclear"
  ],
  "action": "Logged as known ambiguities in specification",
  "severity": "warning"
}
```

Gaps are logged in generated spec under `knownAmbiguities` field.

### 6. Challenge Mode

**Activation**: Opt-in via `challengeMode: true` in input

**Additional Question Types**:

1. **Devil's Advocate**
   - "What if this fails at 10x scale?"
   - "What happens when the third-party API is down?"
   - "How does this work for users with slow connections?"

2. **Assumption Surfacing**
   - "You're assuming users have accounts - is that always true?"
   - "This assumes data fits in memory - have you validated that?"
   - "You're assuming sequential processing - could it be parallel?"

3. **Alternative Exploration**
   - "Have you considered GraphQL instead of REST?"
   - "Would an event-driven architecture fit better here?"
   - "Could this be a background job instead of synchronous?"

## API Changes

### Input Schema Update

```typescript
const InterrogateInputSchema = z.object({
  epicId: z.string(),
  sessionId: z.string().optional(),
  forceNewRound: z.boolean().default(false),

  // V2 additions
  forceReady: z.boolean().default(false),     // Escape hatch (requires 80%+ clarity)
  challengeMode: z.boolean().default(false),  // Enable devil's advocate
  config: z.object({
    maxRounds: z.number().min(1).max(20).default(10),
    escapeThreshold: z.number().min(0).max(100).default(80),
  }).optional(),
});
```

### Output Schema Update

```typescript
interface InterrogationResult {
  session: InterrogationSession;
  nextQuestions: Question[];
  readyForSpec: boolean;
  recommendations: string[];

  // V2 additions
  validationResults?: AnswerValidation[];     // Per-answer validation
  contradictions?: Contradiction[];           // Detected contradictions
  roundSummary?: {
    round: number;
    questionsAsked: number;
    questionsAnswered: number;
    clarityDelta: number;                     // Change from previous round
  };
  warnings?: InterrogationWarning[];          // Round 10 warnings, etc.
}
```

### Question Schema Update

```typescript
const QuestionSchema = z.object({
  // ... existing fields ...

  // V2 additions
  source: z.enum(['template', 'llm', 'follow-up', 'challenge']),
  generatedFrom: z.string().optional(),       // Answer ID that triggered this
  confidence: z.number().min(0).max(1).optional(), // LLM confidence in question relevance
});
```

### Spec Output Update

```typescript
const SpecificationSchema = z.object({
  // ... existing fields ...

  // V2 additions
  knownAmbiguities: z.array(z.object({
    area: z.string(),
    description: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    recommendation: z.string(),
  })).optional(),

  interrogationMetrics: z.object({
    rounds: z.number(),
    questionsAsked: z.number(),
    questionsAnswered: z.number(),
    finalClarity: z.number(),
    challengeModeUsed: z.boolean(),
  }).optional(),
});
```

## Implementation Components

### File Structure

```
src/
├── engines/
│   ├── llm-client.ts           # Claude API + MCP fallback
│   ├── question-generator.ts   # LLM-powered question generation
│   ├── answer-validator.ts     # Validation + contradiction detection
│   └── round-controller.ts     # Multi-round progression logic
├── tools/
│   └── interrogate.ts          # Refactored to use engines
└── types/
    └── interrogation.ts        # Updated schemas
```

### Component Responsibilities

| Component | Responsibility | Model |
|-----------|---------------|-------|
| `llm-client.ts` | API abstraction, key management, MCP fallback | - |
| `question-generator.ts` | Template scaffold + LLM enhancement | Sonnet |
| `answer-validator.ts` | Vagueness, completeness, contradictions | Haiku |
| `round-controller.ts` | Progression logic, escape hatch, warnings | - |

## Testing Strategy

### Unit Tests
- Template scaffold generates expected questions
- Round controller respects thresholds
- Escape hatch only works at 80%+

### Integration Tests (require API key)
- LLM generates relevant follow-up questions
- Validator detects known-vague answers
- Contradiction detector finds planted conflicts

### Mock Tests
- LLM client falls back to templates when API unavailable
- Full flow works with mocked LLM responses

## Migration

### Backward Compatibility
- Existing sessions continue to work
- New fields are optional with sensible defaults
- Template fallback ensures no regression if LLM unavailable

### Configuration Migration
- No breaking changes to existing config
- New config fields have defaults
- API key can be added incrementally

## Success Criteria

1. **Question Quality**: LLM-generated questions are rated more relevant than templates by users
2. **Answer Validation**: Catches 80%+ of intentionally vague test answers
3. **Contradiction Detection**: Identifies planted contradictions with 90%+ accuracy
4. **Performance**: Question generation < 3s, validation < 1s
5. **Fallback Reliability**: Works fully when API unavailable (template mode)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| API costs accumulate | Haiku for validation, rate limiting, caching |
| LLM generates irrelevant questions | Template scaffold as baseline, confidence scoring |
| Over-aggressive contradiction detection | Tunable aggressiveness, human override |
| Round 10 still vague | Clear warning, logged in spec, user can iterate |

## Future Considerations

- **Learning from feedback**: Track which questions lead to good specs
- **Domain-specific question banks**: Pre-trained for common domains (API, UI, data pipeline)
- **Multi-user sessions**: Different stakeholders answer different question types
- **Voice input**: Spoken answers for faster iteration
