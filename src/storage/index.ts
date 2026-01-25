import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

import {
  type Epic,
  type InterrogationSession,
  type Specification,
  type CodebaseContext,
  EpicSchema,
  InterrogationSessionSchema,
  SpecificationSchema,
  CodebaseContextSchema,
} from '../types/index.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

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
        orchestration_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id)
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_sessions_epic ON sessions(epic_id);
      CREATE INDEX IF NOT EXISTS idx_specs_epic ON specs(epic_id);
      CREATE INDEX IF NOT EXISTS idx_specs_session ON specs(session_id);
      CREATE INDEX IF NOT EXISTS idx_orchestrations_spec ON orchestrations(spec_id);
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
