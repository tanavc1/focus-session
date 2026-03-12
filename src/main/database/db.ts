import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import type {
  Session,
  ActivityEvent,
  ActivityBlock,
  AppClassification,
  Settings,
  DayPlan,
  DayGoal,
  DayStats,
  WeekStats,
  StreakInfo,
  FlowPeriod,
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
    CREATE TABLE IF NOT EXISTS day_plans (
      id           TEXT    PRIMARY KEY,
      date         TEXT    NOT NULL UNIQUE,
      goals        TEXT    NOT NULL DEFAULT '[]',
      target_focus_minutes INTEGER NOT NULL DEFAULT 240,
      morning_intention TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_day_plans_date ON day_plans(date);

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

  runMigrations(db);
  seedDefaultData(db);
}

// ─── Migrations ───────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  // Add excluded column (migration for existing DBs)
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
  } catch { /* already exists */ }

  // Add report_json column for caching (migration for existing DBs)
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN report_json TEXT");
  } catch { /* already exists */ }

  // Add vision_snapshots column for storing vision descriptions
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN vision_snapshots TEXT");
  } catch { /* already exists */ }
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

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM activity_events WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM activity_blocks WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function listSessions(limit = 50): Session[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions WHERE status != ? ORDER BY started_at DESC LIMIT ?'
  ).all('active', limit) as Session[];
}

export function setSessionExcluded(id: string, excluded: boolean): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET excluded = ? WHERE id = ?').run(excluded ? 1 : 0, id);
}

export function getCachedReport(id: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT report_json FROM sessions WHERE id = ?').get(id) as { report_json: string | null } | null;
  return row?.report_json ?? null;
}

export function setCachedReport(id: string, reportJson: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET report_json = ? WHERE id = ?').run(reportJson, id);
}

export function getVisionSnapshots(id: string): string[] {
  const db = getDb();
  const row = db.prepare('SELECT vision_snapshots FROM sessions WHERE id = ?').get(id) as { vision_snapshots: string | null } | null;
  try {
    return row?.vision_snapshots ? JSON.parse(row.vision_snapshots) : [];
  } catch { return []; }
}

export function addVisionSnapshot(id: string, description: string): void {
  const db = getDb();
  const existing = getVisionSnapshots(id);
  existing.push(description);
  db.prepare('UPDATE sessions SET vision_snapshots = ? WHERE id = ?').run(JSON.stringify(existing), id);
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

// ─── Day Plan CRUD ────────────────────────────────────────────────────────────

export function getDayPlan(date: string): DayPlan | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM day_plans WHERE date = ?').get(date) as {
    id: string; date: string; goals: string; target_focus_minutes: number;
    morning_intention: string | null; created_at: number; updated_at: number;
  } | null;
  if (!row) return null;
  let goals: DayGoal[] = [];
  try {
    goals = JSON.parse(row.goals) as DayGoal[];
    if (!Array.isArray(goals)) goals = [];
  } catch {
    // Corrupted goals JSON — return empty array rather than throwing
    goals = [];
  }
  return {
    ...row,
    goals,
    morning_intention: row.morning_intention ?? undefined,
  };
}

export function upsertDayPlan(plan: Omit<DayPlan, 'created_at' | 'updated_at'>): DayPlan {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO day_plans (id, date, goals, target_focus_minutes, morning_intention, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      goals = excluded.goals,
      target_focus_minutes = excluded.target_focus_minutes,
      morning_intention = excluded.morning_intention,
      updated_at = excluded.updated_at
  `).run(
    plan.id, plan.date, JSON.stringify(plan.goals),
    plan.target_focus_minutes, plan.morning_intention ?? null, now, now,
  );
  const result = getDayPlan(plan.date);
  if (!result) throw new Error(`Failed to retrieve day plan after upsert for date: ${plan.date}`);
  return result;
}

// ─── Day Stats ────────────────────────────────────────────────────────────────

function dateToRange(dateStr: string): { start: number; end: number } {
  // Parse YYYY-MM-DD and return epoch ms range for that local day
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) {
    // Guard against invalid date strings producing NaN in SQL queries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { start: today.getTime(), end: today.getTime() + 86_400_000 };
  }
  const start = d.getTime();
  return { start, end: start + 86_400_000 };
}

function computeFlowSecondsFromBlocks(blocks: ActivityBlock[]): number {
  // A flow period: consecutive productive blocks (idle < 3 min allowed), >= 25 min total focus
  let flowTotal = 0;
  let flowFocus = 0;
  let inFlow = false;

  for (const b of blocks) {
    if (b.classification === 'productive') {
      flowFocus += b.duration_seconds;
      if (!inFlow && flowFocus >= 25 * 60) inFlow = true;
    } else if (b.classification === 'idle' && b.duration_seconds <= 180) {
      // Short idle doesn't break flow
    } else {
      if (inFlow) flowTotal += flowFocus;
      flowFocus = 0;
      inFlow = false;
    }
  }
  if (inFlow) flowTotal += flowFocus;
  return flowTotal;
}

export function getDayStats(dateStr: string): DayStats {
  const db = getDb();
  const { start, end } = dateToRange(dateStr);

  const sessions = db.prepare(`
    SELECT * FROM sessions
    WHERE started_at >= ? AND started_at < ?
      AND status = 'completed' AND excluded = 0
    ORDER BY started_at ASC
  `).all(start, end) as Session[];

  let focusSeconds = 0;
  let distractedSeconds = 0;
  let idleSeconds = 0;
  let flowSeconds = 0;

  for (const session of sessions) {
    const blocks = db.prepare(
      'SELECT * FROM activity_blocks WHERE session_id = ? ORDER BY started_at ASC'
    ).all(session.id) as ActivityBlock[];

    for (const b of blocks) {
      if (b.classification === 'productive')  focusSeconds      += b.duration_seconds;
      if (b.classification === 'distracting') distractedSeconds += b.duration_seconds;
      if (b.classification === 'idle')        idleSeconds       += b.duration_seconds;
    }
    flowSeconds += computeFlowSecondsFromBlocks(blocks);
  }

  const active = focusSeconds + distractedSeconds;
  const focusScore = active > 0
    ? Math.round(Math.max(0, Math.min(100, ((focusSeconds - distractedSeconds * 0.5) / active) * 100)))
    : 0;

  const plan = getDayPlan(dateStr);

  return {
    date: dateStr,
    focus_seconds: focusSeconds,
    distracted_seconds: distractedSeconds,
    idle_seconds: idleSeconds,
    session_count: sessions.length,
    focus_score: focusScore,
    flow_seconds: flowSeconds,
    target_focus_minutes: plan?.target_focus_minutes ?? 240,
    sessions,
  };
}

export function getWeekStats(endDateStr: string): WeekStats {
  const db = getDb();
  // Build 7 days ending on endDateStr
  const days: DayStats[] = [];
  const endDate = new Date(endDateStr + 'T00:00:00');

  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push(getDayStats(iso));
  }

  // Previous week for comparison
  const prevEnd = new Date(endDate);
  prevEnd.setDate(prevEnd.getDate() - 7);
  let prevFocus = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(prevEnd);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const s = getDayStats(iso);
    prevFocus += s.focus_seconds;
  }

  const activeDays = days.filter((d) => d.session_count > 0);
  return {
    days,
    total_focus_seconds: days.reduce((a, d) => a + d.focus_seconds, 0),
    avg_focus_score: activeDays.length > 0
      ? Math.round(activeDays.reduce((a, d) => a + d.focus_score, 0) / activeDays.length)
      : 0,
    total_sessions: days.reduce((a, d) => a + d.session_count, 0),
    prev_week_focus_seconds: prevFocus,
  };

  void db; // sqlite ref kept alive
}

export function getStreakInfo(): StreakInfo {
  const db = getDb();
  // Look at last 90 days of session data
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  // Get distinct days that had any focused sessions
  const rows = db.prepare(`
    SELECT DISTINCT date(s.started_at/1000, 'unixepoch', 'localtime') as day
    FROM sessions s
    JOIN activity_blocks ab ON ab.session_id = s.id
    WHERE s.started_at > ? AND s.status = 'completed' AND s.excluded = 0
      AND ab.classification = 'productive'
    GROUP BY day
    HAVING SUM(ab.duration_seconds) >= 1800
    ORDER BY day DESC
  `).all(ninetyDaysAgo) as { day: string }[];

  if (rows.length === 0) return { current_streak: 0, longest_streak: 0, total_focused_days: 0 };

  const today = new Date().toISOString().slice(0, 10);

  // Build set of active dates
  const activeDates = new Set(rows.map((r) => r.day));

  // Compute current streak
  let current = 0;
  const cursor = new Date(today + 'T12:00:00');
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (activeDates.has(iso)) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // Compute longest streak
  const sorted = [...activeDates].sort();
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00');
    const curr = new Date(sorted[i]   + 'T12:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  longest = Math.max(longest, current, 1);

  return { current_streak: current, longest_streak: longest, total_focused_days: activeDates.size };
}

// ─── Flow periods computation (exported for report use) ──────────────────────

export function computeFlowPeriods(blocks: ActivityBlock[]): FlowPeriod[] {
  const periods: FlowPeriod[] = [];
  let flowStart: number | null = null;
  let flowFocus = 0;

  for (const b of blocks) {
    if (b.classification === 'productive') {
      if (flowStart === null) flowStart = b.started_at;
      flowFocus += b.duration_seconds;
    } else if (b.classification === 'idle' && b.duration_seconds <= 180) {
      // short idle doesn't break flow
    } else {
      if (flowStart !== null && flowFocus >= 25 * 60) {
        periods.push({ started_at: flowStart, duration_seconds: flowFocus });
      }
      flowStart = null;
      flowFocus = 0;
    }
  }
  if (flowStart !== null && flowFocus >= 25 * 60) {
    periods.push({ started_at: flowStart, duration_seconds: flowFocus });
  }
  return periods;
}

// ─── Productivity insights for Journey ────────────────────────────────────────

export function getTopAppsAllTime(days = 30): { name: string; seconds: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.prepare(`
    SELECT app_name as name, SUM(duration_seconds) as seconds
    FROM activity_blocks ab
    JOIN sessions s ON s.id = ab.session_id
    WHERE ab.classification = 'productive'
      AND s.started_at > ? AND s.status = 'completed' AND s.excluded = 0
      AND app_name IS NOT NULL
    GROUP BY app_name ORDER BY seconds DESC LIMIT 8
  `).all(since) as { name: string; seconds: number }[];
}

export function getTopDistractionsAllTime(days = 30): { name: string; seconds: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.prepare(`
    SELECT COALESCE(browser_domain, app_name) as name, SUM(duration_seconds) as seconds
    FROM activity_blocks ab
    JOIN sessions s ON s.id = ab.session_id
    WHERE ab.classification = 'distracting'
      AND s.started_at > ? AND s.status = 'completed' AND s.excluded = 0
      AND COALESCE(browser_domain, app_name) IS NOT NULL
    GROUP BY name ORDER BY seconds DESC LIMIT 8
  `).all(since) as { name: string; seconds: number }[];
}
