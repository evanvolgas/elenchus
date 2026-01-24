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

**Purpose**: Spawn and coordinate agents for POC execution.

**Responsibilities**:
- Parse spec into executable task graph
- Spawn appropriate agents for each task
- Manage inter-agent communication
- Handle failures and retries
- Enforce checkpoint gates
- Track progress and costs

**Integration**: Works with Claude Code's Task tool, claude-flow, or standalone agents.

```typescript
interface Orchestration {
  id: string;
  specId: string;

  // Execution state
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  currentPhase: string;
  currentCheckpoint?: string;

  // Agents
  activeAgents: AgentInstance[];
  completedTasks: TaskResult[];
  pendingTasks: Task[];

  // Metrics
  startedAt: Date;
  estimatedCompletion: Date;
  actualCost: number;
  estimatedRemainingCost: number;
}
```

### 7. Deliver Engine

**Purpose**: Package POC deliverables for handoff.

**Deliverables**:
- Working code (deployed or local)
- Architecture documentation
- Decision log (why choices were made)
- Test results
- Known limitations
- Productionization roadmap
- Demo script

```typescript
interface Delivery {
  id: string;
  orchestrationId: string;

  // Artifacts
  codeLocation: string; // branch, PR, or path
  documentation: Document[];
  testResults: TestResult[];

  // Validation
  acceptanceCriteriaResults: CriteriaResult[];
  overallScore: number;

  // Handoff
  knownLimitations: string[];
  productionRoadmap: RoadmapItem[];
  demoScript: DemoStep[];
}
```

## MCP Interface

### Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `elenchus_ingest` | Ingest an epic from various sources | source, content, options |
| `elenchus_analyze` | Analyze codebase context | path, depth |
| `elenchus_interrogate` | Start or continue interrogation session | epicId, sessionId? |
| `elenchus_answer` | Provide answers to questions | sessionId, answers |
| `elenchus_generate_spec` | Generate spec from session | sessionId, format |
| `elenchus_validate` | Validate spec completeness | specId |
| `elenchus_execute` | Start POC execution | specId, options |
| `elenchus_checkpoint` | Handle checkpoint approval | checkpointId, action, feedback? |
| `elenchus_status` | Check execution status | orchestrationId |
| `elenchus_deliver` | Package POC for delivery | orchestrationId |

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

7. ELENCHUS: Executes POC in phases with checkpoints
   └─▶ elenchus_execute(specId: 'spec-001')
       └─▶ Orchestration{status: 'executing', ...}

8. ELENCHUS: Pauses at checkpoint
   └─▶ elenchus_checkpoint(checkpointId: 'post-arch', action: 'approve')

9. ELENCHUS: Completes and packages
   └─▶ elenchus_deliver(orchestrationId: 'orch-001')
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
