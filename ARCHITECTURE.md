# Elenchus Architecture

> **Elenchus** (ἔλεγχος): The Socratic method of eliciting truth by question and answer.

## Overview

Elenchus is an MCP server that transforms high-level epics into working proof-of-concepts through **interrogative specification** and **checkpoint-based execution**.

## Core Philosophy

Traditional spec-driven development fails because:
1. Requirements emerge through building, not before
2. Over-specification defeats agent creativity
3. Static specs diverge from dynamic codebases

Elenchus takes a **hybrid approach**:
- **Thin spec upfront**: Capture intent and constraints, not implementation
- **Interrogative refinement**: Agents ask clarifying questions as they discover context
- **Checkpoint validation**: Human-in-the-loop at critical decision points

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ELENCHUS MCP SERVER                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   INGEST    │───▶│  ANALYZE    │───▶│ INTERROGATE │             │
│  │   Engine    │    │   Engine    │    │   Engine    │             │
│  └─────────────┘    └─────────────┘    └──────┬──────┘             │
│        │                  │                   │                     │
│        │                  │                   ▼                     │
│        │                  │           ┌─────────────┐               │
│        │                  │           │    SPEC     │               │
│        │                  └──────────▶│  Generator  │               │
│        │                              └──────┬──────┘               │
│        │                                     │                      │
│        │                                     ▼                      │
│        │                              ┌─────────────┐               │
│        │                              │ CHECKPOINT  │               │
│        │                              │   Manager   │◀──┐           │
│        │                              └──────┬──────┘   │           │
│        │                                     │          │           │
│        │                                     ▼          │           │
│        │                              ┌─────────────┐   │           │
│        └─────────────────────────────▶│ ORCHESTRATE │───┘           │
│                                       │   Engine    │               │
│                                       └──────┬──────┘               │
│                                              │                      │
│                                              ▼                      │
│                                       ┌─────────────┐               │
│                                       │   DELIVER   │               │
│                                       │   Engine    │               │
│                                       └─────────────┘               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                           STORAGE LAYER                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   Epics     │    │   Specs     │    │  Sessions   │             │
│  │   Store     │    │   Store     │    │   Store     │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Ingest Engine

**Purpose**: Parse epics from various sources into normalized format.

**Inputs**:
- Raw text (copy-pasted from anywhere)
- JIRA ticket ID (fetches via API)
- Notion page URL (fetches via API)
- GitHub issue URL (fetches via API)
- Structured epic object (programmatic)

**Output**: Normalized `Epic` object

```typescript
interface Epic {
  id: string;
  source: 'text' | 'jira' | 'notion' | 'github' | 'structured';
  title: string;
  description: string;
  rawContent: string;
  extractedGoals: string[];
  extractedConstraints: string[];
  extractedAcceptanceCriteria: string[];
  linkedResources: Resource[];
  metadata: Record<string, unknown>;
}
```

### 2. Analyze Engine

**Purpose**: Understand codebase context to inform specification.

**Capabilities**:
- **Maturity Detection**: Greenfield vs brownfield classification
- **Pattern Extraction**: Identify existing conventions, architecture patterns
- **Dependency Mapping**: Build import/usage graphs
- **Convention Mining**: Extract naming patterns, file structure, test patterns
- **Risk Assessment**: Identify high-change-risk areas

**Output**: `CodebaseContext` object

```typescript
interface CodebaseContext {
  maturity: 'greenfield' | 'early' | 'established' | 'legacy';
  architecture: ArchitecturePattern;
  conventions: Convention[];
  dependencies: DependencyGraph;
  testCoverage: CoverageReport;
  riskAreas: RiskAssessment[];
  relevantFiles: FileReference[];
  suggestedPatterns: Pattern[];
}

type ArchitecturePattern =
  | 'monolith'
  | 'modular-monolith'
  | 'microservices'
  | 'serverless'
  | 'hybrid'
  | 'unknown';
```

### 3. Interrogate Engine

**Purpose**: Generate and manage clarifying questions through Socratic dialogue.

**Question Types**:
1. **Scope Questions**: What's in/out of scope?
2. **Constraint Questions**: What are the non-negotiables?
3. **Success Questions**: How do we know it's done?
4. **Technical Questions**: What technical decisions need input?
5. **Risk Questions**: What could go wrong?

**Process**:
1. Analyze epic + codebase context
2. Identify ambiguities and gaps
3. Generate prioritized questions
4. Present questions to user
5. Process answers and refine understanding
6. Iterate until sufficient clarity

**Output**: `InterrogationSession` object

```typescript
interface InterrogationSession {
  id: string;
  epicId: string;
  questions: Question[];
  answers: Answer[];
  clarityScore: number; // 0-100
  readyForSpec: boolean;
  pendingQuestions: Question[];
}

interface Question {
  id: string;
  type: QuestionType;
  priority: 'critical' | 'important' | 'nice-to-have';
  question: string;
  context: string;
  suggestedAnswers?: string[];
  inferredDefault?: string;
  dependsOn?: string[]; // other question IDs
}

type QuestionType =
  | 'scope'
  | 'constraint'
  | 'success'
  | 'technical'
  | 'risk'
  | 'clarification';
```

### 4. Spec Generator

**Purpose**: Transform epic + context + answers into agent-ready specification.

**Output Formats**:
- **YAML**: Machine-readable, for agent consumption
- **Markdown**: Human-readable, for review
- **JSON Task Graph**: For orchestration engine

**Spec Structure**:

```typescript
interface Specification {
  id: string;
  epicId: string;
  version: number;

  // Business Context
  problem: string;
  userPersona: string;
  successMetrics: Metric[];
  outOfScope: string[];

  // Technical Context
  codebaseContext: CodebaseContext;
  constraints: Constraint[];
  integrations: Integration[];

  // Execution Plan
  phases: Phase[];
  checkpoints: Checkpoint[];

  // Validation
  acceptanceCriteria: AcceptanceCriterion[];
  testStrategy: TestStrategy;

  // Meta
  estimatedCost: CostEstimate;
  estimatedDuration: DurationEstimate;
  risks: Risk[];

  readinessScore: number; // 0-100
}

interface Phase {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  dependencies: string[]; // other phase IDs
  checkpointAfter: boolean;
  estimatedDuration: DurationEstimate;
}

interface Task {
  id: string;
  type: TaskType;
  description: string;
  agentType: string;
  files: string[];
  acceptanceCriteria: string[];
  constraints: string[];
}
```

### 5. Checkpoint Manager

**Purpose**: Enforce validation gates and human-in-the-loop approval.

**Checkpoint Types**:
1. **Pre-Spec**: Validate interrogation completeness
2. **Post-Research**: Validate feasibility findings
3. **Post-Architecture**: Validate technical approach
4. **Post-Implementation**: Validate code quality
5. **Pre-Delivery**: Validate acceptance criteria

**Checkpoint Process**:
1. Agent reaches checkpoint
2. System gathers checkpoint artifacts
3. Present to user for approval
4. User approves, rejects, or requests changes
5. On approval: proceed to next phase
6. On rejection: return to previous phase with feedback

```typescript
interface Checkpoint {
  id: string;
  type: CheckpointType;
  phase: string;
  required: boolean;
  autoApprove: boolean; // for low-risk checkpoints

  // What to present
  artifacts: Artifact[];
  summary: string;
  questions: Question[];

  // Approval state
  status: 'pending' | 'approved' | 'rejected' | 'changes-requested';
  approvedBy?: string;
  feedback?: string;
}
```

### 6. Orchestrate Engine

**Purpose**: Interface boundary to external orchestrators.

**What Elenchus Does**:
- Generates machine-readable specs (YAML, JSON, Markdown)
- Provides the contract/interface for orchestrators
- Exposes spec via MCP resources

**What Elenchus Does NOT Do**:
- Spawn agents (that's the orchestrator's job)
- Execute tasks (that's the orchestrator's job)
- Manage agent communication (that's the orchestrator's job)

**Recommended Orchestrators**:
- **Claude Flow**: Multi-agent swarm orchestration with memory coordination
- **Claude Code Task tool**: Built-in concurrent agent spawning
- **Custom orchestrators**: Any system that can consume YAML/JSON specs

**The Spec IS the Interface**: The generated specification contains everything an orchestrator needs:
- Task graph with dependencies
- Agent type recommendations
- Checkpoint gates
- Acceptance criteria
- Estimated costs and duration

```typescript
interface Orchestration {
  id: string;
  specId: string;

  // Execution state (tracked BY orchestrator, recorded IN Elenchus)
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  currentPhase: string;
  currentCheckpoint?: string;

  // Metrics (reported BY orchestrator)
  startedAt: Date;
  estimatedCompletion: Date;
  actualCost: number;
  estimatedRemainingCost: number;

  // External orchestrator reference
  orchestratorType: 'claude-flow' | 'claude-code' | 'custom';
  orchestratorSessionId?: string;
}
```

### 7. Deliver Engine

**Purpose**: Record delivery artifacts produced by orchestrators.

**What Elenchus Does**:
- Stores references to delivered artifacts
- Validates artifacts against acceptance criteria
- Generates delivery reports
- Creates handoff documentation

**What Elenchus Does NOT Do**:
- Create the code artifacts (orchestrator does this)
- Deploy the POC (orchestrator does this)
- Run the tests (orchestrator does this)

**Delivery Flow**:
1. Orchestrator completes POC implementation
2. Orchestrator calls `elenchus_delivery` with artifact references
3. Elenchus validates against original spec
4. Elenchus generates delivery report
5. User reviews and accepts/rejects delivery

```typescript
interface Delivery {
  id: string;
  orchestrationId: string;

  // Artifacts (produced BY orchestrator, recorded IN Elenchus)
  codeLocation: string; // branch, PR, or path
  documentation: Document[];
  testResults: TestResult[];

  // Validation (performed BY Elenchus)
  acceptanceCriteriaResults: CriteriaResult[];
  overallScore: number;

  // Handoff
  knownLimitations: string[];
  productionRoadmap: RoadmapItem[];
  demoScript: DemoStep[];

  // Orchestrator metadata
  deliveredBy: string; // orchestrator identifier
  deliveredAt: Date;
}
```

## Integration Boundaries

### Elenchus vs. Orchestrator

**Elenchus is a specification system, not an execution system.**

```
┌─────────────────────────────────────────────────────────────────┐
│                         ELENCHUS                                │
│                      (Specification)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Epic → Analyze → Interrogate → Generate Spec → Validate       │
│                                                                 │
│  Output: Machine-readable specification (YAML/JSON/Markdown)   │
│          - Task graph with dependencies                        │
│          - Agent type recommendations                          │
│          - Checkpoint gates                                    │
│          - Acceptance criteria                                 │
│          - Cost/duration estimates                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Spec (via MCP resource)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                               │
│                      (Execution)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Read Spec → Spawn Agents → Coordinate → Implement → Deliver  │
│                                                                 │
│  Recommended orchestrators:                                     │
│  - Claude Flow (multi-agent swarm with memory coordination)    │
│  - Claude Code Task tool (built-in concurrent agents)          │
│  - Custom orchestrators (consume YAML/JSON)                    │
│                                                                 │
│  Reports back to Elenchus:                                      │
│  - Checkpoint decisions (elenchus_checkpoint)                   │
│  - Delivery artifacts (elenchus_delivery)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The Spec is the Contract

**The generated specification IS the interface between Elenchus and orchestrators.**

Elenchus produces specs that contain:
- **What to build**: Problem statement, user persona, success metrics
- **How to build**: Task graph, agent recommendations, dependencies
- **When to validate**: Checkpoint gates with approval criteria
- **How to measure**: Acceptance criteria, test strategy

Orchestrators consume specs and:
- **Spawn agents**: Based on agent type recommendations
- **Execute tasks**: Following the task graph and dependencies
- **Enforce checkpoints**: Pause for human approval via `elenchus_checkpoint`
- **Report results**: Submit artifacts via `elenchus_delivery`

### What Elenchus Does NOT Do

❌ **Does NOT spawn agents** - That's the orchestrator's job
❌ **Does NOT execute tasks** - That's the orchestrator's job
❌ **Does NOT manage agent communication** - That's the orchestrator's job
❌ **Does NOT deploy code** - That's the orchestrator's job
❌ **Does NOT run tests** - That's the orchestrator's job

### What Elenchus DOES Do

✅ **Ingests epics** from multiple sources (text, JIRA, GitHub, Notion)
✅ **Analyzes codebases** to understand context and patterns
✅ **Asks clarifying questions** through Socratic dialogue
✅ **Generates specifications** in multiple formats (YAML, JSON, Markdown)
✅ **Validates specs** for completeness and readiness
✅ **Records checkpoint decisions** made during orchestration
✅ **Records delivery artifacts** produced by orchestrators
✅ **Validates deliveries** against original acceptance criteria

## MCP Interface

### Tools

| Tool | Description | Scope | Inputs |
|------|-------------|-------|--------|
| `elenchus_ingest` | Ingest an epic from various sources | Elenchus | source, content, options |
| `elenchus_analyze` | Analyze codebase context | Elenchus | path, depth |
| `elenchus_interrogate` | Start or continue interrogation session | Elenchus | epicId, sessionId? |
| `elenchus_answer` | Provide answers to questions | Elenchus | sessionId, answers |
| `elenchus_generate_spec` | Generate spec from session | Elenchus | sessionId, format |
| `elenchus_validate` | Validate spec completeness | Elenchus | specId |
| `elenchus_checkpoint` | Record checkpoint decision | Called by orchestrator | checkpointId, action, feedback? |
| `elenchus_status` | Check epic/spec/session status | Elenchus | epicId?, specId?, sessionId? |
| `elenchus_delivery` | Record delivery artifacts | Called by orchestrator | orchestrationId, artifacts |

### Resources

| Resource | Description |
|----------|-------------|
| `elenchus://epics/{id}` | Epic details |
| `elenchus://sessions/{id}` | Interrogation session |
| `elenchus://specs/{id}` | Generated specification |
| `elenchus://orchestrations/{id}` | Execution status |
| `elenchus://deliveries/{id}` | Delivery package |

## Data Flow

### Happy Path

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ELENCHUS TERRITORY (Specification)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. USER: "Turn this epic into a POC: [epic text]"
   └─▶ elenchus_ingest(source: 'text', content: epic)
       └─▶ Epic{id: 'epic-001'}

2. ELENCHUS: Analyzes codebase
   └─▶ elenchus_analyze(path: '.', depth: 'full')
       └─▶ CodebaseContext{maturity: 'established', ...}

3. ELENCHUS: Generates clarifying questions
   └─▶ elenchus_interrogate(epicId: 'epic-001')
       └─▶ InterrogationSession{questions: [...]}

4. USER: Answers questions
   └─▶ elenchus_answer(sessionId: 'session-001', answers: [...])
       └─▶ InterrogationSession{clarityScore: 85, readyForSpec: true}

5. ELENCHUS: Generates spec
   └─▶ elenchus_generate_spec(sessionId: 'session-001', format: 'all')
       └─▶ Specification{readinessScore: 90, ...}

6. USER: Reviews and approves spec
   └─▶ elenchus_checkpoint(checkpointId: 'pre-spec', action: 'approve')

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORCHESTRATOR TERRITORY (Execution)
 ⚠️  Elenchus does NOT execute - it provides the spec as input
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. ORCHESTRATOR: Reads spec and spawns agents
   └─▶ Claude Flow / Claude Code Task tool
       ├─▶ Spawns researcher, architect, coder, tester agents
       ├─▶ Coordinates multi-agent execution
       └─▶ Implements POC according to spec

8. ORCHESTRATOR: Reaches checkpoint, calls Elenchus to record decision
   └─▶ elenchus_checkpoint(checkpointId: 'post-arch', action: 'approve')
       └─▶ Elenchus records checkpoint decision
       └─▶ Orchestrator continues execution

9. ORCHESTRATOR: Completes POC and reports artifacts to Elenchus
   └─▶ elenchus_delivery(orchestrationId: 'orch-001', artifacts: {...})
       └─▶ Elenchus validates against acceptance criteria
       └─▶ Delivery{acceptanceCriteriaResults: [...], overallScore: 92}
```

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.x (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Storage**: SQLite (local) or PostgreSQL (server)
- **Agent Integration**: Claude Code Task tool, claude-flow MCP
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## Directory Structure

```
elenchus/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # MCP server setup
│   ├── engines/
│   │   ├── ingest.ts         # Epic ingestion
│   │   ├── analyze.ts        # Codebase analysis
│   │   ├── interrogate.ts    # Socratic questioning
│   │   ├── spec.ts           # Spec generation
│   │   ├── checkpoint.ts     # Checkpoint management
│   │   ├── orchestrate.ts    # Agent orchestration
│   │   └── deliver.ts        # POC delivery
│   ├── tools/                # MCP tool implementations
│   ├── resources/            # MCP resource implementations
│   ├── storage/              # Data persistence
│   ├── types/                # TypeScript interfaces
│   └── utils/                # Shared utilities
├── tests/
├── examples/
├── package.json
├── tsconfig.json
└── ARCHITECTURE.md
```

## Design Principles

1. **Interrogation over Specification**: Ask questions, don't assume answers
2. **Checkpoints over Autonomy**: Humans approve at critical gates
3. **Adaptation over Prescription**: Detect codebase context, don't force patterns
4. **Transparency over Magic**: Show reasoning, decisions, and tradeoffs
5. **Incremental over Big-Bang**: Deliver value at each checkpoint, not just at end

## Open Questions

1. **Agent Integration**: How deep to integrate with claude-flow vs. standalone?
2. **Storage**: SQLite sufficient for MVP? When to add PostgreSQL?
3. **Multi-User**: Support concurrent users/sessions from day 1?
4. **Cost Tracking**: How to estimate/track LLM costs accurately?
5. **Rollback**: How to handle rollback when checkpoint fails late in execution?
