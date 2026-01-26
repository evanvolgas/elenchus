import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

import {
  type Epic,
  type InterrogationSession,
  type Specification,
  type CodebaseContext,
  type CheckpointDecision,
  type CheckpointStatus,
  type Signal,
  type AnswerEvaluation,
  type Conflict,
  type Premise,
  type Contradiction,
  type Aporia,
  EpicSchema,
  InterrogationSessionSchema,
  SpecificationSchema,
  CodebaseContextSchema,
  SignalSchema,
  AnswerEvaluationSchema,
  ConflictSchema,
  PremiseSchema,
  ContradictionSchema,
  AporiaSchema,
} from '../types/index.js';
import type { Delivery } from '../types/delivery.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

/**
 * Execution record - feedback from executing a specification
 */
export interface ExecutionRecord {
  id: string;
  specId: string;
  epicId: string;
  phase: string;
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  output: string;
  errors?: string[];
  tokensUsed?: number;
  durationMs?: number;
  timestamp: string;
}

/**
 * Prompt insight - learned patterns from successful executions
 */
export interface PromptInsight {
  id: string;
  pattern: string;
  description: string;
  context: string;
  successRate: number;
  usageCount: number;
  examples: Array<{ specId: string; outcome: string }>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Storage layer for Elenchus
 *
 * Uses SQLite for persistence, stores JSON documents.
 */
export class Storage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? this.getDefaultDbPath();
    this.ensureDirectory(path);
    this.db = new Database(path);
    this.initialize();
  }

  private getDefaultDbPath(): string {
    const dataDir = join(homedir(), '.elenchus');
    return join(dataDir, 'elenchus.db');
  }

  private ensureDirectory(dbPath: string): void {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private initialize(): void {
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    // Enable foreign key enforcement
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS epics (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        epic_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (epic_id) REFERENCES epics(id)
      );

      CREATE TABLE IF NOT EXISTS specs (
        id TEXT PRIMARY KEY,
        epic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (epic_id) REFERENCES epics(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        epic_id TEXT,
        path TEXT NOT NULL,
        data TEXT NOT NULL,
        analyzed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orchestrations (
        id TEXT PRIMARY KEY,
        spec_id TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (spec_id) REFERENCES specs(id)
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        spec_id TEXT NOT NULL,
        epic_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (spec_id) REFERENCES specs(id),
        FOREIGN KEY (epic_id) REFERENCES epics(id)
      );

      CREATE TABLE IF NOT EXISTS checkpoint_decisions (
        id TEXT PRIMARY KEY,
        spec_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        action TEXT NOT NULL,
        feedback TEXT,
        decided_by TEXT,
        decided_at TEXT NOT NULL,
        FOREIGN KEY (spec_id) REFERENCES specs(id)
      );

      CREATE TABLE IF NOT EXISTS execution_records (
        id TEXT PRIMARY KEY,
        spec_id TEXT NOT NULL,
        epic_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT NOT NULL,
        errors TEXT,
        tokens_used INTEGER,
        duration_ms INTEGER,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (spec_id) REFERENCES specs(id),
        FOREIGN KEY (epic_id) REFERENCES epics(id)
      );

      CREATE TABLE IF NOT EXISTS prompt_insights (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        context TEXT NOT NULL,
        success_rate REAL NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        examples TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_sessions_epic ON sessions(epic_id);
      CREATE INDEX IF NOT EXISTS idx_specs_epic ON specs(epic_id);
      CREATE INDEX IF NOT EXISTS idx_specs_session ON specs(session_id);
      CREATE INDEX IF NOT EXISTS idx_orchestrations_spec ON orchestrations(spec_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoint_decisions_spec ON checkpoint_decisions(spec_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoint_decisions_checkpoint ON checkpoint_decisions(checkpoint_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_spec ON deliveries(spec_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_epic ON deliveries(epic_id);
      CREATE INDEX IF NOT EXISTS idx_execution_records_spec ON execution_records(spec_id);
      CREATE INDEX IF NOT EXISTS idx_execution_records_epic ON execution_records(epic_id);
      CREATE INDEX IF NOT EXISTS idx_execution_records_timestamp ON execution_records(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_prompt_insights_pattern ON prompt_insights(pattern);
      CREATE INDEX IF NOT EXISTS idx_prompt_insights_success_rate ON prompt_insights(success_rate DESC);
      CREATE INDEX IF NOT EXISTS idx_prompt_insights_usage ON prompt_insights(usage_count DESC);

      -- Signal detection tables
      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        epic_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        quote TEXT,
        severity TEXT NOT NULL,
        addressed INTEGER NOT NULL DEFAULT 0,
        addressed_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (epic_id) REFERENCES epics(id)
      );

      CREATE TABLE IF NOT EXISTS answer_evaluations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        answer_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        reasoning TEXT NOT NULL,
        follow_up TEXT,
        addresses_signals TEXT NOT NULL DEFAULT '[]',
        evaluated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        answer_ids TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolution TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      -- Indexes for new tables
      CREATE INDEX IF NOT EXISTS idx_signals_epic ON signals(epic_id);
      CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
      CREATE INDEX IF NOT EXISTS idx_signals_addressed ON signals(addressed);
      CREATE INDEX IF NOT EXISTS idx_answer_evaluations_session ON answer_evaluations(session_id);
      CREATE INDEX IF NOT EXISTS idx_answer_evaluations_answer ON answer_evaluations(answer_id);
      CREATE INDEX IF NOT EXISTS idx_conflicts_session ON conflicts(session_id);
      CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON conflicts(resolved);

      -- Premise tracking tables (for Socratic elenchus)
      CREATE TABLE IF NOT EXISTS premises (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        statement TEXT NOT NULL,
        extracted_from TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'high',
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS contradictions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        premise_ids TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolution TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS aporias (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        contradiction_id TEXT NOT NULL,
        recognized INTEGER NOT NULL DEFAULT 0,
        refined_statement TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (contradiction_id) REFERENCES contradictions(id)
      );

      -- Indexes for premise tables
      CREATE INDEX IF NOT EXISTS idx_premises_session ON premises(session_id);
      CREATE INDEX IF NOT EXISTS idx_premises_extracted_from ON premises(extracted_from);
      CREATE INDEX IF NOT EXISTS idx_contradictions_session ON contradictions(session_id);
      CREATE INDEX IF NOT EXISTS idx_contradictions_resolved ON contradictions(resolved);
      CREATE INDEX IF NOT EXISTS idx_aporias_session ON aporias(session_id);
      CREATE INDEX IF NOT EXISTS idx_aporias_contradiction ON aporias(contradiction_id);
    `);
  }

  // Epic operations

  saveEpic(epic: Epic): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO epics (id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(epic.id, JSON.stringify(epic), epic.createdAt, epic.updatedAt);
  }

  getEpic(id: string): Epic | undefined {
    const stmt = this.db.prepare('SELECT data FROM epics WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return undefined;

    const parsed = EpicSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      logger.error('Failed to validate epic from database', parsed.error, { id });
      return undefined;
    }
    return parsed.data;
  }

  listEpics(): Epic[] {
    const stmt = this.db.prepare('SELECT data FROM epics ORDER BY created_at DESC');
    const rows = stmt.all() as Array<{ data: string }>;
    return rows
      .map((row) => {
        const parsed = EpicSchema.safeParse(JSON.parse(row.data));
        if (!parsed.success) {
          logger.error('Failed to validate epic from database during list', parsed.error);
          return null;
        }
        return parsed.data;
      })
      .filter((epic): epic is Epic => epic !== null);
  }

  deleteEpic(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM epics WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Session operations

  saveSession(session: InterrogationSession): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, epic_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.epicId,
      JSON.stringify(session),
      session.startedAt,
      session.updatedAt
    );
  }

  getSession(id: string): InterrogationSession | undefined {
    const stmt = this.db.prepare('SELECT data FROM sessions WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return undefined;

    const parsed = InterrogationSessionSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      logger.error('Failed to validate session from database', parsed.error, { id });
      return undefined;
    }
    return parsed.data;
  }

  getSessionsForEpic(epicId: string): InterrogationSession[] {
    const stmt = this.db.prepare(
      'SELECT data FROM sessions WHERE epic_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(epicId) as Array<{ data: string }>;
    return rows
      .map((row) => {
        const parsed = InterrogationSessionSchema.safeParse(JSON.parse(row.data));
        if (!parsed.success) {
          logger.error('Failed to validate session from database during list', parsed.error, { epicId });
          return null;
        }
        return parsed.data;
      })
      .filter((session): session is InterrogationSession => session !== null);
  }

  // Spec operations

  saveSpec(spec: Specification): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO specs (id, epic_id, session_id, version, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      spec.id,
      spec.epicId,
      spec.sessionId,
      spec.version,
      JSON.stringify(spec),
      spec.createdAt,
      spec.updatedAt
    );
  }

  getSpec(id: string): Specification | undefined {
    const stmt = this.db.prepare('SELECT data FROM specs WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return undefined;

    const parsed = SpecificationSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      logger.error('Failed to validate spec from database', parsed.error, { id });
      return undefined;
    }
    return parsed.data;
  }

  getLatestSpecForEpic(epicId: string): Specification | undefined {
    const stmt = this.db.prepare(
      'SELECT data FROM specs WHERE epic_id = ? ORDER BY version DESC LIMIT 1'
    );
    const row = stmt.get(epicId) as { data: string } | undefined;
    if (!row) return undefined;

    const parsed = SpecificationSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      logger.error('Failed to validate spec from database', parsed.error, { epicId });
      return undefined;
    }
    return parsed.data;
  }

  // Context operations

  saveContext(context: CodebaseContext, epicId?: string): void {
    const id = generateId('ctx');
    const stmt = this.db.prepare(`
      INSERT INTO contexts (id, epic_id, path, data, analyzed_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, epicId ?? null, context.rootPath, JSON.stringify(context), context.analyzedAt);
  }

  getContextForPath(path: string): CodebaseContext | undefined {
    const stmt = this.db.prepare(
      'SELECT data FROM contexts WHERE path = ? ORDER BY analyzed_at DESC LIMIT 1'
    );
    const row = stmt.get(path) as { data: string } | undefined;
    if (!row) return undefined;

    const parsed = CodebaseContextSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      logger.error('Failed to validate context from database', parsed.error, { path });
      return undefined;
    }
    return parsed.data;
  }

  // Checkpoint decision operations

  saveCheckpointDecision(decision: CheckpointDecision): void {
    const stmt = this.db.prepare(`
      INSERT INTO checkpoint_decisions (id, spec_id, checkpoint_id, action, feedback, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      decision.id,
      decision.specId,
      decision.checkpointId,
      decision.action,
      decision.feedback ?? null,
      decision.decidedBy ?? null,
      decision.decidedAt
    );
  }

  getCheckpointDecisionsForSpec(specId: string): CheckpointDecision[] {
    const stmt = this.db.prepare(
      'SELECT * FROM checkpoint_decisions WHERE spec_id = ? ORDER BY decided_at DESC'
    );
    const rows = stmt.all(specId) as Array<{
      id: string;
      spec_id: string;
      checkpoint_id: string;
      action: 'approve' | 'reject' | 'request-changes';
      feedback: string | null;
      decided_by: string | null;
      decided_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      specId: row.spec_id,
      checkpointId: row.checkpoint_id,
      action: row.action,
      feedback: row.feedback ?? undefined,
      decidedBy: row.decided_by ?? undefined,
      decidedAt: row.decided_at,
    }));
  }

  getCheckpointDecision(checkpointId: string): CheckpointDecision | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM checkpoint_decisions WHERE checkpoint_id = ? ORDER BY decided_at DESC LIMIT 1'
    );
    const row = stmt.get(checkpointId) as {
      id: string;
      spec_id: string;
      checkpoint_id: string;
      action: 'approve' | 'reject' | 'request-changes';
      feedback: string | null;
      decided_by: string | null;
      decided_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      specId: row.spec_id,
      checkpointId: row.checkpoint_id,
      action: row.action,
      feedback: row.feedback ?? undefined,
      decidedBy: row.decided_by ?? undefined,
      decidedAt: row.decided_at,
    };
  }

  /**
   * Update checkpoint status in a specification.
   * Note: This doesn't persist the status separately - it's a helper for external orchestrators.
   * The decision is stored in checkpoint_decisions table.
   */
  updateCheckpointStatus(specId: string, checkpointId: string, status: CheckpointStatus): void {
    // This is a no-op in the current implementation since we don't store checkpoint status
    // in the spec itself. External orchestrators should query checkpoint_decisions to get status.
    // This method exists for interface compatibility and future extension.
    logger.debug('Checkpoint status updated (decision recorded separately)', undefined, {
      specId,
      checkpointId,
      status,
    });
  }

  // Delivery operations

  saveDelivery(delivery: Delivery): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO deliveries (id, spec_id, epic_id, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      delivery.id,
      delivery.specId,
      delivery.epicId,
      JSON.stringify(delivery),
      delivery.createdAt
    );
  }

  getDelivery(id: string): Delivery | undefined {
    const stmt = this.db.prepare('SELECT data FROM deliveries WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return undefined;

    try {
      return JSON.parse(row.data) as Delivery;
    } catch (error) {
      logger.error('Failed to parse delivery from database', error, { id });
      return undefined;
    }
  }

  getDeliveriesForSpec(specId: string): Delivery[] {
    const stmt = this.db.prepare(
      'SELECT data FROM deliveries WHERE spec_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(specId) as Array<{ data: string }>;
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.data) as Delivery;
        } catch (error) {
          logger.error('Failed to parse delivery from database during list', error, { specId });
          return null;
        }
      })
      .filter((delivery): delivery is Delivery => delivery !== null);
  }

  getDeliveriesForEpic(epicId: string): Delivery[] {
    const stmt = this.db.prepare(
      'SELECT data FROM deliveries WHERE epic_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(epicId) as Array<{ data: string }>;
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.data) as Delivery;
        } catch (error) {
          logger.error('Failed to parse delivery from database during list', error, { epicId });
          return null;
        }
      })
      .filter((delivery): delivery is Delivery => delivery !== null);
  }

  // Execution record operations

  saveExecutionRecord(record: ExecutionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO execution_records (
        id, spec_id, epic_id, phase, task_id, status,
        output, errors, tokens_used, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.specId,
      record.epicId,
      record.phase,
      record.taskId,
      record.status,
      record.output,
      record.errors ? JSON.stringify(record.errors) : null,
      record.tokensUsed ?? null,
      record.durationMs ?? null,
      record.timestamp
    );
  }

  getExecutionRecordsForSpec(specId: string): ExecutionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM execution_records
      WHERE spec_id = ?
      ORDER BY timestamp ASC
    `);
    const rows = stmt.all(specId) as Array<{
      id: string;
      spec_id: string;
      epic_id: string;
      phase: string;
      task_id: string;
      status: 'success' | 'failure' | 'partial';
      output: string;
      errors: string | null;
      tokens_used: number | null;
      duration_ms: number | null;
      timestamp: string;
    }>;

    return rows.map((row): ExecutionRecord => {
      const record: ExecutionRecord = {
        id: row.id,
        specId: row.spec_id,
        epicId: row.epic_id,
        phase: row.phase,
        taskId: row.task_id,
        status: row.status,
        output: row.output,
        timestamp: row.timestamp,
      };

      if (row.errors) {
        record.errors = JSON.parse(row.errors);
      }
      if (row.tokens_used !== null) {
        record.tokensUsed = row.tokens_used;
      }
      if (row.duration_ms !== null) {
        record.durationMs = row.duration_ms;
      }

      return record;
    });
  }

  // Prompt insight operations

  savePromptInsight(insight: PromptInsight): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO prompt_insights (
        id, pattern, description, context, success_rate,
        usage_count, examples, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      insight.id,
      insight.pattern,
      insight.description,
      insight.context,
      insight.successRate,
      insight.usageCount,
      JSON.stringify(insight.examples),
      JSON.stringify(insight.tags),
      insight.createdAt,
      insight.updatedAt
    );
  }

  getPromptInsight(pattern: string): PromptInsight | undefined {
    const stmt = this.db.prepare('SELECT * FROM prompt_insights WHERE pattern = ?');
    const row = stmt.get(pattern) as {
      id: string;
      pattern: string;
      description: string;
      context: string;
      success_rate: number;
      usage_count: number;
      examples: string;
      tags: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      pattern: row.pattern,
      description: row.description,
      context: row.context,
      successRate: row.success_rate,
      usageCount: row.usage_count,
      examples: JSON.parse(row.examples),
      tags: JSON.parse(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listPromptInsights(): PromptInsight[] {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_insights
      ORDER BY success_rate DESC, usage_count DESC
    `);
    const rows = stmt.all() as Array<{
      id: string;
      pattern: string;
      description: string;
      context: string;
      success_rate: number;
      usage_count: number;
      examples: string;
      tags: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      description: row.description,
      context: row.context,
      successRate: row.success_rate,
      usageCount: row.usage_count,
      examples: JSON.parse(row.examples),
      tags: JSON.parse(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // Signal operations

  saveSignal(signal: Signal): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO signals (
        id, epic_id, type, content, quote, severity,
        addressed, addressed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      signal.id,
      signal.epicId,
      signal.type,
      signal.content,
      signal.quote ?? null,
      signal.severity,
      signal.addressed ? 1 : 0,
      signal.addressedBy ?? null,
      signal.createdAt
    );
  }

  saveSignals(signals: Signal[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO signals (
        id, epic_id, type, content, quote, severity,
        addressed, addressed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: Signal[]) => {
      for (const signal of items) {
        stmt.run(
          signal.id,
          signal.epicId,
          signal.type,
          signal.content,
          signal.quote ?? null,
          signal.severity,
          signal.addressed ? 1 : 0,
          signal.addressedBy ?? null,
          signal.createdAt
        );
      }
    });

    insertMany(signals);
  }

  getSignal(id: string): Signal | undefined {
    const stmt = this.db.prepare('SELECT * FROM signals WHERE id = ?');
    const row = stmt.get(id) as {
      id: string;
      epic_id: string;
      type: string;
      content: string;
      quote: string | null;
      severity: string;
      addressed: number;
      addressed_by: string | null;
      created_at: string;
    } | undefined;

    if (!row) return undefined;

    const signal = {
      id: row.id,
      epicId: row.epic_id,
      type: row.type,
      content: row.content,
      quote: row.quote ?? undefined,
      severity: row.severity,
      addressed: row.addressed === 1,
      addressedBy: row.addressed_by ?? undefined,
      createdAt: row.created_at,
    };

    const parsed = SignalSchema.safeParse(signal);
    if (!parsed.success) {
      logger.error('Failed to validate signal from database', parsed.error, { id });
      return undefined;
    }
    return parsed.data;
  }

  getSignalsForEpic(epicId: string): Signal[] {
    const stmt = this.db.prepare(
      'SELECT * FROM signals WHERE epic_id = ? ORDER BY severity DESC, created_at ASC'
    );
    const rows = stmt.all(epicId) as Array<{
      id: string;
      epic_id: string;
      type: string;
      content: string;
      quote: string | null;
      severity: string;
      addressed: number;
      addressed_by: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const signal = {
          id: row.id,
          epicId: row.epic_id,
          type: row.type,
          content: row.content,
          quote: row.quote ?? undefined,
          severity: row.severity,
          addressed: row.addressed === 1,
          addressedBy: row.addressed_by ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = SignalSchema.safeParse(signal);
        if (!parsed.success) {
          logger.error('Failed to validate signal from database during list', parsed.error, { epicId });
          return null;
        }
        return parsed.data;
      })
      .filter((signal): signal is Signal => signal !== null);
  }

  markSignalAddressed(signalId: string, answerId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE signals SET addressed = 1, addressed_by = ? WHERE id = ?
    `);
    const result = stmt.run(answerId, signalId);
    return result.changes > 0;
  }

  // Answer evaluation operations

  saveEvaluation(evaluation: AnswerEvaluation): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO answer_evaluations (
        id, session_id, answer_id, score, reasoning,
        follow_up, addresses_signals, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      evaluation.id,
      evaluation.sessionId,
      evaluation.answerId,
      evaluation.score,
      evaluation.reasoning,
      evaluation.followUp ?? null,
      JSON.stringify(evaluation.addressesSignals),
      evaluation.evaluatedAt
    );
  }

  saveEvaluations(evaluations: AnswerEvaluation[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO answer_evaluations (
        id, session_id, answer_id, score, reasoning,
        follow_up, addresses_signals, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: AnswerEvaluation[]) => {
      for (const evaluation of items) {
        stmt.run(
          evaluation.id,
          evaluation.sessionId,
          evaluation.answerId,
          evaluation.score,
          evaluation.reasoning,
          evaluation.followUp ?? null,
          JSON.stringify(evaluation.addressesSignals),
          evaluation.evaluatedAt
        );
      }
    });

    insertMany(evaluations);
  }

  getEvaluation(answerId: string): AnswerEvaluation | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM answer_evaluations WHERE answer_id = ? ORDER BY evaluated_at DESC LIMIT 1'
    );
    const row = stmt.get(answerId) as {
      id: string;
      session_id: string;
      answer_id: string;
      score: number;
      reasoning: string;
      follow_up: string | null;
      addresses_signals: string;
      evaluated_at: string;
    } | undefined;

    if (!row) return undefined;

    const evaluation = {
      id: row.id,
      sessionId: row.session_id,
      answerId: row.answer_id,
      score: row.score,
      reasoning: row.reasoning,
      followUp: row.follow_up ?? undefined,
      addressesSignals: JSON.parse(row.addresses_signals),
      evaluatedAt: row.evaluated_at,
    };

    const parsed = AnswerEvaluationSchema.safeParse(evaluation);
    if (!parsed.success) {
      logger.error('Failed to validate evaluation from database', parsed.error, { answerId });
      return undefined;
    }
    return parsed.data;
  }

  getEvaluationsForSession(sessionId: string): AnswerEvaluation[] {
    const stmt = this.db.prepare(
      'SELECT * FROM answer_evaluations WHERE session_id = ? ORDER BY evaluated_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      answer_id: string;
      score: number;
      reasoning: string;
      follow_up: string | null;
      addresses_signals: string;
      evaluated_at: string;
    }>;

    return rows
      .map((row) => {
        const evaluation = {
          id: row.id,
          sessionId: row.session_id,
          answerId: row.answer_id,
          score: row.score,
          reasoning: row.reasoning,
          followUp: row.follow_up ?? undefined,
          addressesSignals: JSON.parse(row.addresses_signals),
          evaluatedAt: row.evaluated_at,
        };

        const parsed = AnswerEvaluationSchema.safeParse(evaluation);
        if (!parsed.success) {
          logger.error('Failed to validate evaluation from database during list', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((eval_): eval_ is AnswerEvaluation => eval_ !== null);
  }

  // Conflict operations

  saveConflict(conflict: Conflict): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conflicts (
        id, session_id, answer_ids, description, severity,
        resolved, resolution, resolved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      conflict.id,
      conflict.sessionId,
      JSON.stringify(conflict.answerIds),
      conflict.description,
      conflict.severity,
      conflict.resolved ? 1 : 0,
      conflict.resolution ?? null,
      conflict.resolvedAt ?? null,
      conflict.createdAt
    );
  }

  saveConflicts(conflicts: Conflict[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conflicts (
        id, session_id, answer_ids, description, severity,
        resolved, resolution, resolved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: Conflict[]) => {
      for (const conflict of items) {
        stmt.run(
          conflict.id,
          conflict.sessionId,
          JSON.stringify(conflict.answerIds),
          conflict.description,
          conflict.severity,
          conflict.resolved ? 1 : 0,
          conflict.resolution ?? null,
          conflict.resolvedAt ?? null,
          conflict.createdAt
        );
      }
    });

    insertMany(conflicts);
  }

  getConflict(id: string): Conflict | undefined {
    const stmt = this.db.prepare('SELECT * FROM conflicts WHERE id = ?');
    const row = stmt.get(id) as {
      id: string;
      session_id: string;
      answer_ids: string;
      description: string;
      severity: string;
      resolved: number;
      resolution: string | null;
      resolved_at: string | null;
      created_at: string;
    } | undefined;

    if (!row) return undefined;

    const conflict = {
      id: row.id,
      sessionId: row.session_id,
      answerIds: JSON.parse(row.answer_ids),
      description: row.description,
      severity: row.severity,
      resolved: row.resolved === 1,
      resolution: row.resolution ?? undefined,
      resolvedAt: row.resolved_at ?? undefined,
      createdAt: row.created_at,
    };

    const parsed = ConflictSchema.safeParse(conflict);
    if (!parsed.success) {
      logger.error('Failed to validate conflict from database', parsed.error, { id });
      return undefined;
    }
    return parsed.data;
  }

  getConflictsForSession(sessionId: string): Conflict[] {
    const stmt = this.db.prepare(
      'SELECT * FROM conflicts WHERE session_id = ? ORDER BY severity DESC, created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      answer_ids: string;
      description: string;
      severity: string;
      resolved: number;
      resolution: string | null;
      resolved_at: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const conflict = {
          id: row.id,
          sessionId: row.session_id,
          answerIds: JSON.parse(row.answer_ids),
          description: row.description,
          severity: row.severity,
          resolved: row.resolved === 1,
          resolution: row.resolution ?? undefined,
          resolvedAt: row.resolved_at ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = ConflictSchema.safeParse(conflict);
        if (!parsed.success) {
          logger.error('Failed to validate conflict from database during list', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((conflict): conflict is Conflict => conflict !== null);
  }

  getUnresolvedConflictsForSession(sessionId: string): Conflict[] {
    const stmt = this.db.prepare(
      'SELECT * FROM conflicts WHERE session_id = ? AND resolved = 0 ORDER BY severity DESC, created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      answer_ids: string;
      description: string;
      severity: string;
      resolved: number;
      resolution: string | null;
      resolved_at: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const conflict = {
          id: row.id,
          sessionId: row.session_id,
          answerIds: JSON.parse(row.answer_ids),
          description: row.description,
          severity: row.severity,
          resolved: row.resolved === 1,
          resolution: row.resolution ?? undefined,
          resolvedAt: row.resolved_at ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = ConflictSchema.safeParse(conflict);
        if (!parsed.success) {
          logger.error('Failed to validate conflict from database during list', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((conflict): conflict is Conflict => conflict !== null);
  }

  resolveConflict(conflictId: string, resolution: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE conflicts
      SET resolved = 1, resolution = ?, resolved_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(resolution, new Date().toISOString(), conflictId);
    return result.changes > 0;
  }

  // Premise operations (Socratic elenchus)

  savePremise(premise: Premise): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO premises (
        id, session_id, statement, extracted_from, type, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      premise.id,
      premise.sessionId,
      premise.statement,
      premise.extractedFrom,
      premise.type,
      premise.confidence,
      premise.createdAt
    );
  }

  savePremises(premises: Premise[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO premises (
        id, session_id, statement, extracted_from, type, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: Premise[]) => {
      for (const premise of items) {
        stmt.run(
          premise.id,
          premise.sessionId,
          premise.statement,
          premise.extractedFrom,
          premise.type,
          premise.confidence,
          premise.createdAt
        );
      }
    });

    insertMany(premises);
  }

  getPremisesForSession(sessionId: string): Premise[] {
    const stmt = this.db.prepare(
      'SELECT * FROM premises WHERE session_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      statement: string;
      extracted_from: string;
      type: string;
      confidence: string;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const premise = {
          id: row.id,
          sessionId: row.session_id,
          statement: row.statement,
          extractedFrom: row.extracted_from,
          type: row.type,
          confidence: row.confidence,
          createdAt: row.created_at,
        };

        const parsed = PremiseSchema.safeParse(premise);
        if (!parsed.success) {
          logger.error('Failed to validate premise from database', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((premise): premise is Premise => premise !== null);
  }

  // Contradiction operations

  saveContradiction(contradiction: Contradiction): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO contradictions (
        id, session_id, premise_ids, description, severity,
        resolved, resolution, resolved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      contradiction.id,
      contradiction.sessionId,
      JSON.stringify(contradiction.premiseIds),
      contradiction.description,
      contradiction.severity,
      contradiction.resolved ? 1 : 0,
      contradiction.resolution ?? null,
      contradiction.resolvedAt ?? null,
      contradiction.createdAt
    );
  }

  getContradictionsForSession(sessionId: string): Contradiction[] {
    const stmt = this.db.prepare(
      'SELECT * FROM contradictions WHERE session_id = ? ORDER BY severity DESC, created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      premise_ids: string;
      description: string;
      severity: string;
      resolved: number;
      resolution: string | null;
      resolved_at: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const contradiction = {
          id: row.id,
          sessionId: row.session_id,
          premiseIds: JSON.parse(row.premise_ids),
          description: row.description,
          severity: row.severity,
          resolved: row.resolved === 1,
          resolution: row.resolution ?? undefined,
          resolvedAt: row.resolved_at ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = ContradictionSchema.safeParse(contradiction);
        if (!parsed.success) {
          logger.error('Failed to validate contradiction from database', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((c): c is Contradiction => c !== null);
  }

  getUnresolvedContradictionsForSession(sessionId: string): Contradiction[] {
    const stmt = this.db.prepare(
      'SELECT * FROM contradictions WHERE session_id = ? AND resolved = 0 ORDER BY severity DESC, created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      premise_ids: string;
      description: string;
      severity: string;
      resolved: number;
      resolution: string | null;
      resolved_at: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const contradiction = {
          id: row.id,
          sessionId: row.session_id,
          premiseIds: JSON.parse(row.premise_ids),
          description: row.description,
          severity: row.severity,
          resolved: row.resolved === 1,
          resolution: row.resolution ?? undefined,
          resolvedAt: row.resolved_at ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = ContradictionSchema.safeParse(contradiction);
        if (!parsed.success) {
          logger.error('Failed to validate contradiction from database', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((c): c is Contradiction => c !== null);
  }

  resolveContradiction(contradictionId: string, resolution: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE contradictions
      SET resolved = 1, resolution = ?, resolved_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(resolution, new Date().toISOString(), contradictionId);
    return result.changes > 0;
  }

  // Aporia operations

  saveAporia(aporia: Aporia): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO aporias (
        id, session_id, contradiction_id, recognized, refined_statement, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      aporia.id,
      aporia.sessionId,
      aporia.contradictionId,
      aporia.recognized ? 1 : 0,
      aporia.refinedStatement ?? null,
      aporia.createdAt
    );
  }

  getAporiasForSession(sessionId: string): Aporia[] {
    const stmt = this.db.prepare(
      'SELECT * FROM aporias WHERE session_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      contradiction_id: string;
      recognized: number;
      refined_statement: string | null;
      created_at: string;
    }>;

    return rows
      .map((row) => {
        const aporia = {
          id: row.id,
          sessionId: row.session_id,
          contradictionId: row.contradiction_id,
          recognized: row.recognized === 1,
          refinedStatement: row.refined_statement ?? undefined,
          createdAt: row.created_at,
        };

        const parsed = AporiaSchema.safeParse(aporia);
        if (!parsed.success) {
          logger.error('Failed to validate aporia from database', parsed.error, { sessionId });
          return null;
        }
        return parsed.data;
      })
      .filter((a): a is Aporia => a !== null);
  }

  // Utility

  /**
   * Execute operations within a transaction.
   * If any operation fails, the entire transaction is rolled back.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
