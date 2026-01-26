# LLM-Powered Socratic Interrogation Engine: Design Document

## Executive Summary

This document redesigns Elenchus' interrogation engine to implement **true Socratic questioning** where the calling LLM (Claude) performs the actual elenctic reasoning, while Elenchus provides structure, state tracking, and detection capabilities.

**Current Problem**: The existing V2 implementation uses template-based questions with optional LLM enhancement. This feels like a checklist, not a dialogue.

**Target State**: The LLM conducts genuine Socratic inquiry—detecting contradictions, probing vagueness, generating contextual follow-ups, and knowing when to stop.

---

## Part 1: Core Socratic Principles for LLM Implementation

### 1.1 What is Elenchus?

The word **elenchus** (ἔλεγχος) means "refutation" or "cross-examination." It's the central technique of the Socratic method:

1. **Thesis Statement**: User provides an initial answer/claim
2. **Questioning**: Socrates asks clarifying questions, seeking extensions and qualifications
3. **Logical Testing**: Questions reveal that the thesis is **inconsistent** with other things the user affirms
4. **Refutation or Aporia**: Either the thesis is disproven, or the user realizes their ignorance

**Key Insight**: Elenchus is NOT about getting answers—it's about **exposing contradictions** and **surfacing assumptions**.

### 1.2 The Elenctic Process (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. THESIS                                                   │
│    User states a belief/answer as something they know      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CLARIFICATION                                            │
│    Ask questions to elaborate, qualify, extend the thesis  │
│    - "What do you mean by X?"                              │
│    - "Can you give an example?"                            │
│    - "Does this apply in all cases?"                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. RELATED POSITIONS                                        │
│    Ask about related matters to gather more claims         │
│    - "What about Y? Do you also believe that?"             │
│    - "How does this relate to Z?"                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CONTRADICTION DETECTION                                  │
│    Show that the thesis contradicts related positions      │
│    - "You said A, but you also said B. Can both be true?"  │
│    - "If A is true, then C must follow, but you denied C"  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. APORIA (Goal)                                            │
│    User realizes inconsistency → acknowledges ignorance    │
│    OR user refines their understanding → better thesis     │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Core Techniques an LLM Can Perform

Based on Socratic philosophy, here are the techniques the calling LLM should employ:

#### A. Detecting and Probing Contradictions

**What to detect**:
- **Direct contradiction**: "You said all users are authenticated, but also that there's a guest mode"
- **Logical inconsistency**: "You want real-time updates, but also want to minimize server costs"
- **Assumption conflict**: "You assume data fits in memory, but mentioned handling millions of records"

**How the LLM probes**:
```
"Earlier you mentioned [X], but now you're saying [Y].
These seem contradictory. Can you clarify how both can be true?"
```

**Elenchus tracks**: All answers in structured format so the LLM can compare them for contradictions.

#### B. Recognizing Vagueness vs. Specificity

**Vague indicators** (signal to probe deeper):
- Hedge words: "probably", "maybe", "sort of", "kind of", "etc."
- Abstract terms without examples: "good UX", "scalable", "fast"
- Short answers (<20 words) to critical questions
- Circular reasoning: "It should be good because users want a good experience"

**Specific indicators** (signal sufficient clarity):
- Concrete examples: "Users can search by title, author, or ISBN"
- Measurable criteria: "Responds within 200ms", "Handles 1000 req/sec"
- Explicit boundaries: "Out of scope: mobile apps, user analytics"
- Technical precision: "Use PostgreSQL with JSONB columns for flexible schema"

**How the LLM probes vagueness**:
```
"You mentioned 'good performance.' Can you define what that means specifically?
For example, what response time is acceptable? What load should it handle?"
```

#### C. Good Follow-up vs. Canned Questions

**Canned question** (bad):
- "Are there any technical constraints?" (generic, disconnected from answer)

**Good follow-up** (Socratic):
- "You mentioned using PostgreSQL. Will this handle the real-time updates you described, or do you need a pub/sub system like Redis?"

**Criteria for good follow-ups**:
1. **Contextual**: References specific claims from the user's answer
2. **Probing**: Pushes on a point of vagueness or potential contradiction
3. **Clarifying**: Asks for concrete examples, boundaries, or measurements
4. **Challenging**: Tests assumptions with "What if...?" scenarios

**How the LLM generates follow-ups**:
- Extract key claims from the answer
- Identify vague terms or assumptions
- Formulate a question that forces specificity or surfaces a contradiction

#### D. When to Challenge vs. Accept

**Accept when**:
- Answer is specific, measurable, and unambiguous
- Answer addresses the question fully
- Answer is consistent with previous answers
- Answer provides concrete examples or boundaries

**Challenge when**:
- Answer is vague or uses hedge language
- Answer contradicts a previous claim (elenchus!)
- Answer contains unstated assumptions
- Answer is too brief for a critical question
- Answer is circular or tautological

**Challenge techniques**:
```
Devil's Advocate:
"What if this fails at 10x scale? How would your approach handle that?"

Assumption Surfacing:
"You're assuming users have accounts. What about anonymous users?"

Alternative Exploration:
"Have you considered GraphQL instead of REST? What makes REST better here?"
```

---

## Part 2: State Tracking Requirements

### 2.1 What Elenchus Must Track

Elenchus is the **state manager** for the interrogation process. It tracks:

```typescript
interface InterrogationState {
  // Core session data
  sessionId: string;
  epicId: string;
  round: number;
  maxRounds: number;

  // Question-answer history
  questions: Question[];
  answers: Answer[];

  // Elenctic state
  contradictions: Contradiction[];
  vagueAnswers: VagueAnswer[];
  assumptions: Assumption[];
  technicalDecisions: TechnicalDecision[];

  // Clarity metrics
  clarityScore: number;          // 0-100
  completenessScore: number;     // 0-100
  coherenceScore: number;        // 0-100

  // Coverage tracking
  questionTypeCoverage: Map<QuestionType, number>;
  criticalQuestionsAnswered: number;
  importantQuestionsAnswered: number;

  // Termination signals
  readyForSpec: boolean;
  blockers: string[];
  warnings: Warning[];

  // Aporia tracking (Socratic endpoint)
  aporiaAchieved: boolean;       // User acknowledged gaps in understanding
  refinementCount: number;       // How many times user refined their thesis
}
```

### 2.2 Tracking Contradictions

When the LLM detects a contradiction, Elenchus records it:

```typescript
interface Contradiction {
  id: string;
  answerId1: string;
  answerId2: string;
  description: string;
  severity: 'potential' | 'likely' | 'definite';
  resolved: boolean;
  resolution?: string;          // User's clarification
  detectedAt: Date;
  detectedBy: 'llm' | 'heuristic';
}
```

**How it works**:
1. LLM identifies contradiction in its analysis
2. Elenchus stores the contradiction with metadata
3. LLM asks user to resolve the contradiction
4. User provides clarification
5. Elenchus marks contradiction as resolved

### 2.3 Tracking Vagueness

When the LLM detects vagueness, Elenchus records it:

```typescript
interface VagueAnswer {
  id: string;
  answerId: string;
  questionId: string;
  vaguenessScore: number;       // 0-1 (higher = more vague)
  vagueTerms: string[];         // ["probably", "some", "etc."]
  issues: ValidationIssue[];
  followUpGenerated: boolean;
  followUpQuestionId?: string;
  resolved: boolean;
  refinedAnswer?: string;
}
```

**How it works**:
1. LLM analyzes answer for vagueness (or heuristic fallback)
2. Elenchus stores vagueness metadata
3. LLM generates follow-up question referencing the vague terms
4. User provides refined answer
5. Elenchus links refined answer to original vague answer

### 2.4 Tracking Assumptions

When the LLM surfaces an assumption, Elenchus records it:

```typescript
interface Assumption {
  id: string;
  assumption: string;
  fromAnswerId: string;
  impact: 'low' | 'medium' | 'high';
  challenged: boolean;
  challengeQuestionId?: string;
  userResponse?: string;
  validated: boolean;           // User confirmed or refined
}
```

**How it works**:
1. LLM identifies implicit assumption in user's answer
2. Elenchus stores the assumption
3. LLM asks user to validate or refine the assumption
4. User confirms or provides alternative
5. Elenchus marks assumption as validated

### 2.5 Tracking Technical Decisions

When the LLM extracts concrete technical details, Elenchus records them:

```typescript
interface TechnicalDecision {
  id: string;
  category: 'framework' | 'language' | 'database' | 'api-style' | 'architecture' | 'algorithm';
  decision: string;             // "Use PostgreSQL"
  rationale?: string;           // "Need ACID transactions"
  fromAnswerId: string;
  alternatives?: string[];      // ["MongoDB", "MySQL"]
  confidence: 'explicit' | 'inferred';
}
```

**How it works**:
1. LLM extracts technical decision from answer
2. Elenchus stores it with category and confidence
3. Spec generator uses these for implementation guidance

---

## Part 3: Detection Signals (What Elenchus Should Flag)

Elenchus provides **signals** to the LLM about what needs probing. The LLM decides how to act.

### 3.1 Signals for the LLM

```typescript
interface InterrogationSignals {
  // Vagueness signals
  vagueAnswers: {
    answerId: string;
    vaguenessScore: number;
    vagueTerms: string[];
  }[];

  // Contradiction signals
  potentialContradictions: {
    answerId1: string;
    answerId2: string;
    conflictingClaims: string[];
  }[];

  // Coverage gaps
  missingQuestionTypes: QuestionType[];
  unansweredCriticalQuestions: Question[];

  // Assumption signals
  unstatedAssumptions: {
    assumption: string;
    fromAnswerId: string;
    likelihood: number;
  }[];

  // Technical decision conflicts
  conflictingTechDecisions: {
    decision1: TechnicalDecision;
    decision2: TechnicalDecision;
    conflict: string;
  }[];

  // Clarity indicators
  clarityTrend: 'improving' | 'stable' | 'declining';
  roundsWithoutProgress: number;

  // Termination signals
  readinessIndicators: {
    clarityThresholdMet: boolean;
    allCriticalAnswered: boolean;
    noUnresolvedContradictions: boolean;
    sufficientCoverage: boolean;
  };
}
```

### 3.2 How the LLM Uses Signals

**Before generating the next question**, the LLM receives:
1. All previous questions and answers
2. Current signals from Elenchus
3. Clarity/completeness/coherence scores
4. List of contradictions, vague answers, assumptions

**The LLM then decides**:
- Should I probe a contradiction?
- Should I ask for clarification on a vague answer?
- Should I challenge an assumption?
- Should I ask a new question in an uncovered area?
- Is interrogation complete?

**Example prompt structure** (simplified):
```
You are conducting Socratic interrogation on an epic.

EPIC: [epic description]

ANSWERS SO FAR:
1. Q: What are the goals?
   A: "Build a good API for users"

2. Q: What tech stack?
   A: "Probably REST, maybe PostgreSQL"

SIGNALS FROM ELENCHUS:
- Vague answer detected in #1: "good" is undefined
- Vague answer detected in #2: "probably", "maybe" indicate uncertainty
- Missing question types: success, constraints
- Critical questions unanswered: 3

YOUR TASK:
Generate the next Socratic question. You can:
1. Probe vagueness in answer #1 or #2
2. Ask about uncovered question types
3. Detect and probe contradictions

Choose the most important issue and formulate a Socratic question.
```

---

## Part 4: Question Generation Guidance (For the LLM)

### 4.1 Prompt Template for the LLM

When Elenchus calls the LLM to generate the next question, it provides:

```typescript
interface QuestionGenerationPrompt {
  // Context
  epic: Epic;
  codebaseContext?: CodebaseContext;

  // History
  questions: Question[];
  answers: Answer[];

  // Signals
  signals: InterrogationSignals;

  // Instructions
  instructions: string;          // Socratic method guidance
  questionTypesNeeded: QuestionType[];
  currentRound: number;
  maxRounds: number;
}
```

**Prompt structure**:
```
You are an expert at Socratic interrogation (elenchus).
Your goal is to refine an epic into a precise specification
by asking questions that:

1. Detect contradictions between answers
2. Probe vague language for specificity
3. Surface unstated assumptions
4. Challenge with "what if" scenarios
5. Seek measurable, concrete definitions

EPIC CONTEXT:
[epic description, goals, constraints]

CODEBASE CONTEXT:
[detected patterns, tech stack, architecture]

PREVIOUS QUESTIONS & ANSWERS:
[all Q&A history]

SIGNALS:
- Vague answers: [list with scores]
- Potential contradictions: [list]
- Missing coverage: [question types not addressed]
- Assumptions detected: [list]

YOUR TASK:
Generate ONE Socratic question that addresses the most
critical gap or issue. Format your response as JSON:

{
  "question": "Your Socratic question here",
  "type": "scope|constraint|success|technical|risk|clarification",
  "priority": "critical|important|nice-to-have",
  "context": "Why you're asking this (reasoning)",
  "targetIssue": "vague-answer|contradiction|coverage-gap|assumption",
  "relatedAnswerIds": ["answer-id-1", "answer-id-2"]
}
```

### 4.2 Quality Criteria for Generated Questions

The LLM should generate questions that:

1. **Reference specific claims**: "You mentioned real-time updates. How fast is 'real-time' in this context?"
2. **Probe contradictions**: "You want low cost but also real-time. How do you reconcile these?"
3. **Ask for examples**: "You said 'good UX.' Can you describe a concrete user flow?"
4. **Test assumptions**: "You're assuming all users have accounts. Is that always true?"
5. **Seek boundaries**: "What is explicitly OUT of scope for this POC?"
6. **Request measurements**: "You mentioned 'fast.' What's the acceptable latency? 100ms? 1s? 10s?"

**Anti-patterns** (what NOT to do):
- Generic questions: "Are there any constraints?"
- Yes/no questions without follow-up: "Do you want authentication?"
- Leading questions: "You want to use REST, right?"
- Redundant questions: Asking what's already been answered

### 4.3 Follow-up Question Generation

When an answer is vague or incomplete, the LLM generates a **contextual follow-up**:

**Template**:
```
Original Question: [original question]
Answer: [user's vague answer]
Vague terms detected: [list]

Follow-up: "You said [quote vague term]. Can you be more specific?
For example, [provide concrete alternatives or examples]."
```

**Example**:
```
Original: "What are the performance requirements?"
Answer: "It should be fast enough for users."

Follow-up: "You mentioned 'fast enough.' Can you define that specifically?
For example, should pages load in under 100ms, 500ms, or 2 seconds?"
```

---

## Part 5: Termination Criteria (When to Stop)

### 5.1 Socratic Endpoints

From philosophy, Socratic dialogue ends when:

1. **Consensus achieved**: User and questioner agree on a refined understanding
2. **Aporia achieved**: User acknowledges gaps in their understanding
3. **Reasoning breaks down**: User cannot defend their position
4. **Conclusion reached independently**: User refines their thesis without contradiction

### 5.2 Practical Termination Signals

For Elenchus, interrogation is complete when:

```typescript
interface TerminationCriteria {
  // Clarity thresholds
  clarityScore: number >= 70;
  completenessScore: number >= 70;
  coherenceScore: number >= 80;

  // Coverage requirements
  allCriticalQuestionsAnswered: boolean;
  requiredQuestionTypes: QuestionType[];  // scope, success, constraint
  allRequiredTypesCovered: boolean;

  // Contradiction resolution
  noUnresolvedContradictions: boolean;

  // Vagueness threshold
  percentageVagueAnswers: number <= 20;

  // Round limits
  currentRound: number <= maxRounds;
  progressStalling: boolean;  // No clarity improvement for 2+ rounds

  // Escape hatch
  forceReady: boolean;
  escapeThreshold: number >= 80;  // Only allow force if clarity >= 80%
}
```

### 5.3 Readiness Calculation

Elenchus calculates readiness as:

```typescript
function calculateReadiness(state: InterrogationState): boolean {
  const criteria: ReadinessCriteria = {
    clarityMet: state.clarityScore >= 70,
    completenessMet: state.completenessScore >= 70,
    coherenceMet: state.coherenceScore >= 80,
    criticalAnswered: state.criticalQuestionsAnswered === state.questions.filter(q => q.priority === 'critical').length,
    requiredTypesCovered: ['scope', 'success', 'constraint'].every(type =>
      state.questionTypeCoverage.has(type) && state.questionTypeCoverage.get(type)! > 0
    ),
    noBlockingContradictions: state.contradictions.filter(c =>
      c.severity === 'definite' && !c.resolved
    ).length === 0,
    vaguenessAcceptable: state.vagueAnswers.filter(v => !v.resolved).length / state.answers.length <= 0.2,
  };

  const essentialCriteriaMet =
    criteria.clarityMet &&
    criteria.completenessMet &&
    criteria.requiredTypesCovered &&
    criteria.noBlockingContradictions;

  const niceToHaveMet =
    criteria.coherenceMet &&
    criteria.vaguenessAcceptable;

  // Essential required, nice-to-have recommended
  return essentialCriteriaMet && (niceToHaveMet || state.round >= state.maxRounds * 0.8);
}
```

### 5.4 Warning Signals

Before terminating, Elenchus provides warnings:

```typescript
interface TerminationWarning {
  type: 'incomplete-clarity' | 'max-rounds-reached' | 'unresolved-contradictions' | 'vagueness-threshold';
  severity: 'info' | 'warning' | 'error';
  message: string;
  affectedAreas: string[];
  recommendation: string;
}
```

**Example warnings**:
```
Warning: Max rounds reached (10/10)
Severity: warning
Message: "You've reached the maximum number of interrogation rounds."
Affected areas: ["Technical decisions still vague", "Performance constraints undefined"]
Recommendation: "Consider using forceReady if clarity >= 80%, or refine answers in areas: [list]"
```

---

## Part 6: Implementation Architecture

### 6.1 Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                    CALLING LLM (Claude)                     │
│                                                             │
│  Responsibilities:                                          │
│  - Perform Socratic reasoning (detect contradictions)      │
│  - Generate contextual follow-up questions                 │
│  - Probe vagueness with specific examples                  │
│  - Challenge assumptions with "what if" scenarios          │
│  - Decide when to accept vs. probe deeper                  │
│  - Determine when interrogation is complete                │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ API calls
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  ELENCHUS (State & Structure)               │
│                                                             │
│  Responsibilities:                                          │
│  - Track all questions and answers                         │
│  - Detect vagueness (heuristic + LLM)                      │
│  - Store contradictions, assumptions, technical decisions  │
│  - Calculate clarity/completeness/coherence scores         │
│  - Provide signals to the LLM (what needs probing)         │
│  - Enforce round limits and termination criteria           │
│  - Persist session state across rounds                     │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Interrogation Flow

```
1. User calls elenchus_interrogate(epicId)
   └─▶ Elenchus loads session state (or creates new)

2. Elenchus analyzes current state
   └─▶ Generates signals (vague answers, contradictions, coverage gaps)

3. Elenchus calls LLM with context + signals
   └─▶ LLM generates next Socratic question using elenctic reasoning

4. Elenchus stores question, returns to user
   └─▶ User provides answer via elenchus_answer(sessionId, answers)

5. Elenchus validates answer
   ├─▶ Heuristic vagueness detection (always runs)
   ├─▶ LLM validation (if API available)
   └─▶ Stores validation results, updates scores

6. Elenchus checks termination criteria
   ├─▶ If ready: readyForSpec = true
   └─▶ If not ready: repeat from step 2
```

### 6.3 Key Engine Components

```typescript
// Core engines (already exist in V2)
class QuestionGenerator {
  async generate(context: QuestionContext, useLLM: boolean): Promise<Question[]> {
    // Step 1: Generate signals from current state
    const signals = this.analyzeState(context);

    // Step 2: If LLM available, use Socratic prompt
    if (useLLM) {
      return this.llmSocraticGeneration(context, signals);
    }

    // Step 3: Fallback to template questions
    return this.templateGeneration(context, signals);
  }

  private analyzeState(context: QuestionContext): InterrogationSignals {
    // Analyze for vagueness, contradictions, coverage gaps
    return {
      vagueAnswers: this.detectVagueness(context.previousAnswers),
      potentialContradictions: this.detectContradictions(context.previousAnswers),
      missingQuestionTypes: this.detectCoverageGaps(context),
      unstatedAssumptions: this.detectAssumptions(context.previousAnswers),
    };
  }
}

class AnswerValidator {
  async validateAnswer(answer: Answer, question: Question, context: ValidationContext): Promise<AnswerValidation> {
    // Heuristic validation (always runs)
    const heuristic = this.heuristicValidation(answer, question);

    // LLM validation (if available)
    if (this.llmClient.isAvailable()) {
      return this.llmValidation(answer, question, context);
    }

    return heuristic;
  }
}

class RoundController {
  shouldContinue(session: InterrogationSession): boolean {
    // Check termination criteria
    const readiness = this.calculateReadiness(session);
    const roundLimitReached = session.round >= session.maxRounds;
    const stalling = this.detectStalling(session);

    return !readiness && !roundLimitReached && !stalling;
  }
}
```

---

## Part 7: Anti-Patterns to Avoid

### 7.1 Checklist Syndrome

**Bad** (checklist):
```
Q1: What are the goals?
Q2: What is out of scope?
Q3: What are the constraints?
Q4: What is the timeline?
```

**Good** (Socratic):
```
Q1: What are the goals?
A1: "Build a good API for users to manage books"

Q2: You mentioned 'good API.' What makes an API good in this context?
A2: "Fast responses, easy to use"

Q3: You said 'fast.' Can you define that specifically? For example,
    should endpoints respond in under 100ms, 500ms, or 2 seconds?
```

### 7.2 Ignoring Contradictions

**Bad** (ignore):
```
A1: "All users must be authenticated"
A2: "Guests can browse the catalog"
[No follow-up]
```

**Good** (probe):
```
A1: "All users must be authenticated"
A2: "Guests can browse the catalog"

Q3: You mentioned all users must be authenticated, but also that guests
    can browse. How do you reconcile these? Should guests be able to
    browse without authentication?
```

### 7.3 Accepting Vagueness

**Bad** (accept):
```
Q: "What are the performance requirements?"
A: "It should be fast enough"
[Move to next question]
```

**Good** (probe):
```
Q: "What are the performance requirements?"
A: "It should be fast enough"

Follow-up: "You said 'fast enough.' Can you define that specifically?
For example, should pages load in under 100ms, 500ms, or 2 seconds?
What load should it handle—10 users, 100, or 10,000 concurrent?"
```

---

## Part 8: Recommended Next Steps

### 8.1 Phase 1: Enhance State Tracking

1. Add `contradictions`, `vagueAnswers`, `assumptions` to `InterrogationSession`
2. Implement `InterrogationSignals` generation
3. Add termination criteria calculation with warnings

### 8.2 Phase 2: Upgrade Question Generator

1. Implement `analyzeState()` to generate signals
2. Create Socratic prompt template for LLM
3. Wire LLM client to `QuestionGenerator`
4. Test with real epics to validate question quality

### 8.3 Phase 3: Improve Answer Validator

1. Enhance vagueness detection (both heuristic and LLM)
2. Implement contradiction detection across answers
3. Add assumption extraction
4. Test validation accuracy

### 8.4 Phase 4: Add Round Controller

1. Implement stalling detection
2. Add readiness calculation with multi-criteria logic
3. Generate warnings before termination
4. Add escape hatch with 80% threshold

### 8.5 Phase 5: Integration Testing

1. Run full interrogation sessions on sample epics
2. Measure: clarity scores, rounds to completion, contradiction detection rate
3. Tune thresholds based on real data
4. Validate that interrogation feels like dialogue, not checklist

---

## Sources

Research for this document was based on:

- [Socratic method - Wikipedia](https://en.wikipedia.org/wiki/Socratic_method)
- [The Socratic method and elenchus | Fiveable](https://fiveable.me/greek-philosophy/unit-8/socratic-method-elenchus/study-guide/SHOOmu4QHMRmR4Xq)
- [The Socratic Elenchus | Conversational Leadership](https://conversational-leadership.net/socratic-elenchus/)
- [Socratic Questioning in Psychology](https://positivepsychology.com/socratic-questioning/)
- [Socratic questioning - Wikipedia](https://en.wikipedia.org/wiki/Socratic_questioning)
- [The Six Socratic Questions | Medium](https://medium.com/@charlesleon/the-six-socratic-questions-6c35a3211829)
- [What is the Socratic Dialogue Technique? | No Film School](https://nofilmschool.com/what-is-socratic-dialogue)
- [Socratic Questions | University of Connecticut](https://cetl.uconn.edu/resources/teaching-your-course/leading-effective-discussions/socratic-questions/)

---

## Appendix A: Example Interrogation Session

### Round 1: Initial Questions

```
Q1: What is the primary goal of this epic?
A1: "Build a library management API"

[Elenchus signals: vague (no details on what "management" means)]

Q2: You mentioned 'library management.' What specific capabilities
    should this API provide? For example, should it handle book catalog,
    checkouts, user accounts, or all of these?
A2: "Book catalog, checkouts, and user accounts"

[Elenchus signals: good specificity, no vagueness detected]

Q3: What is explicitly OUT of scope for this POC?
A3: "Mobile apps, analytics, recommendations"

[Clarity score: 45%, Completeness: 30%]
```

### Round 2: Probing Details

```
Q4: You mentioned user accounts. Should all features require authentication,
    or can some be public (like browsing the catalog)?
A4: "Browsing should be public, but checkouts require authentication"

[Elenchus signals: technical decision extracted - "public browsing, authenticated checkouts"]

Q5: For authenticated checkouts, what authentication method should be used?
    JWT, sessions, OAuth, or something else?
A5: "JWT with 24-hour expiration"

[Elenchus signals: technical decision - "JWT authentication, 24hr expiry"]
[Clarity score: 60%, Completeness: 50%]
```

### Round 3: Contradiction Detection

```
Q6: What are the performance requirements for this API?
A6: "Should be fast and handle lots of users"

[Elenchus signals: VAGUE - "fast" undefined, "lots of users" unquantified]

Q7: You said 'fast.' Can you define that specifically? For example,
    should endpoints respond in under 100ms, 500ms, or 2 seconds?
A7: "Under 500ms for read operations, under 2 seconds for checkouts"

[Elenchus signals: good specificity, measurable criteria provided]

Q8: You mentioned handling 'lots of users.' Can you quantify that?
    Should the system handle 10 concurrent users, 100, or 1000?
A8: "At least 100 concurrent users for the POC"

[Clarity score: 75%, Completeness: 70%]
```

### Round 4: Assumption Surfacing

```
Q9: You're assuming users will have stable network connections.
    What happens if a checkout request times out due to network issues?
A9: "Good point. We should retry failed checkouts automatically"

[Elenchus signals: assumption validated, technical decision - "auto-retry on failure"]

Q10: What happens when multiple users try to check out the same book
     simultaneously?
A10: "First-come-first-served. Use database-level locking to prevent
      double-checkouts"

[Elenchus signals: technical decision - "DB locking for concurrency"]
[Clarity score: 85%, Completeness: 80%]
```

### Round 5: Final Validation

```
[Elenchus analysis]
- All critical questions answered
- Required types covered: scope ✓, success ✓, constraint ✓, technical ✓
- No unresolved contradictions
- Vagueness: 10% (1/10 answers initially vague, refined in follow-up)
- Technical decisions extracted: 4 (JWT auth, public browsing, auto-retry, DB locking)

[Termination criteria met]
- Clarity: 85% ✓
- Completeness: 80% ✓
- Coherence: 90% ✓
- Coverage: All required types ✓

READY FOR SPEC GENERATION
```

---

## Appendix B: Prompt Templates

### B.1 Socratic Question Generation Prompt

```
You are an expert at Socratic interrogation (elenchus). Your goal is to
refine a software epic into a precise specification by asking questions that:

1. Detect contradictions between answers
2. Probe vague language for specificity
3. Surface unstated assumptions
4. Challenge with "what if" scenarios
5. Seek measurable, concrete definitions

EPIC:
Title: {{epic.title}}
Description: {{epic.description}}
Goals: {{epic.extractedGoals}}

CODEBASE CONTEXT:
Architecture: {{context.architecture}}
Tech Stack: {{context.techStack}}
Conventions: {{context.conventions}}

PREVIOUS Q&A:
{{#each questionsAndAnswers}}
Q{{@index}}: {{this.question}}
A{{@index}}: {{this.answer}}
{{/each}}

SIGNALS FROM STATE TRACKER:
Vague Answers:
{{#each signals.vagueAnswers}}
- Answer {{this.answerId}}: "{{this.excerpt}}" (vagueness score: {{this.score}})
{{/each}}

Potential Contradictions:
{{#each signals.contradictions}}
- Between A{{this.answerId1}} and A{{this.answerId2}}: {{this.conflict}}
{{/each}}

Missing Coverage:
{{#each signals.missingTypes}}
- {{this}} questions not yet asked
{{/each}}

Assumptions Detected:
{{#each signals.assumptions}}
- {{this.assumption}} (from answer {{this.answerId}})
{{/each}}

YOUR TASK:
Generate ONE Socratic question that addresses the most critical gap or issue.
Prioritize in this order:
1. Resolving contradictions (highest priority)
2. Probing vague answers for specificity
3. Challenging assumptions
4. Covering missing question types

Format your response as JSON:
{
  "question": "Your Socratic question here",
  "type": "scope|constraint|success|technical|risk|clarification",
  "priority": "critical|important|nice-to-have",
  "context": "Why you're asking this - be specific about what you're probing",
  "targetIssue": "contradiction|vague-answer|assumption|coverage-gap",
  "relatedAnswerIds": ["answer-id-1", "answer-id-2"],
  "reasoning": "Brief explanation of your Socratic strategy"
}

Remember: Good Socratic questions reference specific claims, probe contradictions,
ask for concrete examples, test assumptions, and seek measurable boundaries.
```

### B.2 Answer Validation Prompt

```
You are validating an answer to a specification question. Analyze for:

1. **Vagueness**: Unclear language like "stuff", "things", "probably", "maybe"
2. **Completeness**: Does it fully address all parts of the question?
3. **Coherence**: Is it internally consistent?
4. **Contradictions**: Does it conflict with previous answers?

QUESTION TYPE: {{question.type}}
QUESTION: {{question.question}}
CONTEXT: {{question.context}}

ANSWER: {{answer.answer}}

PREVIOUS ANSWERS (for contradiction detection):
{{#each previousAnswers}}
Q{{@index}}: {{this.question}}
A{{@index}}: {{this.answer}}
{{/each}}

Provide your analysis as JSON:
{
  "isVague": boolean,
  "isComplete": boolean,
  "isCoherent": boolean,
  "vaguenessScore": 0-1,
  "issues": [
    {
      "type": "vague|incomplete|incoherent|contradiction",
      "description": "Specific issue found",
      "severity": "low|medium|high",
      "relatedAnswerId": "id if contradiction"
    }
  ],
  "suggestedFollowUp": "Follow-up question if vague/incomplete (optional)",
  "reasoning": "Brief explanation"
}
```

---

## Summary

This design transforms Elenchus from a template-based questionnaire into a true Socratic interrogation engine where:

1. **The calling LLM performs elenctic reasoning** (detecting contradictions, probing vagueness, challenging assumptions)
2. **Elenchus provides structure and state tracking** (session management, signal generation, termination criteria)
3. **Questions feel like dialogue, not checklist** (contextual follow-ups, contradiction resolution, assumption surfacing)
4. **Termination is principled** (clarity thresholds, coverage requirements, contradiction resolution, escape hatch)

The result: **Specifications generated through genuine Socratic inquiry, not canned questionnaires.**
