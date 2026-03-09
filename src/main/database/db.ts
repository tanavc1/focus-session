import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import type {
  Session,
  ActivityEvent,
  ActivityBlock,
  AppClassification,
  Settings,
} from '../../shared/types';
import { DEFAULT_SETTINGS, DEFAULT_CLASSIFICATIONS } from '../config/defaults';

let _db: Database.Database | null = null;

function getDbPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'focus-session.db');
}

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath());
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

// ─── Schema initialization ────────────────────────────────────────────────────

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT    PRIMARY KEY,
      title        TEXT    NOT NULL,
      goal         TEXT    NOT NULL,
      target_duration INTEGER,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER,
      status       TEXT    NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     TEXT    NOT NULL,
      timestamp      INTEGER NOT NULL,
      app_name       TEXT,
      window_title   TEXT,
      browser_domain TEXT,
      is_idle        INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON activity_events(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS activity_blocks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     TEXT    NOT NULL,
      started_at     INTEGER NOT NULL,
      ended_at       INTEGER NOT NULL,
      app_name       TEXT,
      window_title   TEXT,
      browser_domain TEXT,
      classification TEXT    NOT NULL,
      duration_seconds INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_blocks_session ON activity_blocks(session_id);

    CREATE TABLE IF NOT EXISTS app_classifications (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern        TEXT    NOT NULL,
      pattern_type   TEXT    NOT NULL,
      classification TEXT    NOT NULL,
      reason         TEXT,
      is_default     INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_pattern
      ON app_classifications(pattern, pattern_type);

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  seedDefaultData(db);
}

function seedDefaultData(db: Database.Database): void {
  // Seed default settings if not present
  const settingsCount = (
    db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }
  ).c;

  if (settingsCount === 0) {
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );
    const entries = Object.entries(DEFAULT_SETTINGS) as [string, unknown][];
    for (const [key, value] of entries) {
      insertSetting.run(key, JSON.stringify(value));
    }
  }

  // Seed default classifications if not present
  const classCount = (
    db.prepare('SELECT COUNT(*) as c FROM app_classifications').get() as { c: number }
  ).c;

  if (classCount === 0) {
    const insertClass = db.prepare(`
      INSERT OR IGNORE INTO app_classifications
        (pattern, pattern_type, classification, reason, is_default)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const c of DEFAULT_CLASSIFICATIONS) {
      insertClass.run(c.pattern, c.pattern_type, c.classification, c.reason ?? null, c.is_default);
    }
  }
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

export function createSession(
  id: string,
  title: string,
  goal: string,
  target_duration: number | undefined
): Session {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, title, goal, target_duration, started_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(id, title, goal, target_duration ?? null, now, now);
  return getSession(id)!;
}

export function getSession(id: string): Session | null {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | null;
}

export function getActiveSession(): Session | null {
  const db = getDb();
  return db.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1").get() as Session | null;
}

export function endSession(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?
  `).run(Date.now(), id);
}

export function listSessions(limit = 50): Session[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions WHERE status != ? ORDER BY started_at DESC LIMIT ?'
  ).all('active', limit) as Session[];
}

// ─── Activity Event CRUD ──────────────────────────────────────────────────────

export function insertActivityEvent(event: Omit<ActivityEvent, 'id'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO activity_events
      (session_id, timestamp, app_name, window_title, browser_domain, is_idle)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.session_id,
    event.timestamp,
    event.app_name,
    event.window_title,
    event.browser_domain,
    event.is_idle,
  );
}

export function getEventsBySession(session_id: string): ActivityEvent[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM activity_events WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(session_id) as ActivityEvent[];
}

// ─── Activity Block CRUD ──────────────────────────────────────────────────────

export function upsertActivityBlocks(blocks: Omit<ActivityBlock, 'id'>[]): void {
  const db = getDb();
  // Delete existing blocks for this session, then re-insert
  if (blocks.length === 0) return;
  const session_id = blocks[0].session_id;

  const insertMany = db.transaction((rows: Omit<ActivityBlock, 'id'>[]) => {
    db.prepare('DELETE FROM activity_blocks WHERE session_id = ?').run(session_id);
    const stmt = db.prepare(`
      INSERT INTO activity_blocks
        (session_id, started_at, ended_at, app_name, window_title, browser_domain, classification, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of rows) {
      stmt.run(
        b.session_id, b.started_at, b.ended_at,
        b.app_name, b.window_title, b.browser_domain,
        b.classification, b.duration_seconds,
      );
    }
  });

  insertMany(blocks);
}

export function getBlocksBySession(session_id: string): ActivityBlock[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM activity_blocks WHERE session_id = ? ORDER BY started_at ASC'
  ).all(session_id) as ActivityBlock[];
}

// ─── Settings CRUD ────────────────────────────────────────────────────────────

export function getAllSettings(): Settings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      (result as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      (result as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}

export function setSetting(key: string, value: unknown): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), Date.now());
}

// ─── Classifications CRUD ─────────────────────────────────────────────────────

export function getAllClassifications(): AppClassification[] {
  const db = getDb();
  return db.prepare('SELECT * FROM app_classifications ORDER BY pattern_type, pattern').all() as AppClassification[];
}

export function upsertClassification(c: AppClassification): AppClassification {
  const db = getDb();
  db.prepare(`
    INSERT INTO app_classifications (pattern, pattern_type, classification, reason, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pattern, pattern_type) DO UPDATE SET
      classification = excluded.classification,
      reason = excluded.reason,
      is_default = excluded.is_default
  `).run(c.pattern, c.pattern_type, c.classification, c.reason ?? null, c.is_default, Date.now());

  return db.prepare(
    'SELECT * FROM app_classifications WHERE pattern = ? AND pattern_type = ?'
  ).get(c.pattern, c.pattern_type) as AppClassification;
}

export function deleteClassification(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM app_classifications WHERE id = ?').run(id);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
