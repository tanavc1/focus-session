// ─── Core types shared between main and renderer processes ───────────────────

// ─── Day Planning ─────────────────────────────────────────────────────────────

export interface DayGoal {
  id: string;
  text: string;
  completed: boolean;
}

export interface DayPlan {
  id: string;
  date: string;                  // YYYY-MM-DD
  goals: DayGoal[];
  target_focus_minutes: number;  // daily focus target (default 240 = 4h)
  morning_intention?: string;    // optional free-text note
  created_at: number;
  updated_at: number;
}

// ─── Day / Week Stats ─────────────────────────────────────────────────────────

export interface DayStats {
  date: string;                  // YYYY-MM-DD
  focus_seconds: number;
  distracted_seconds: number;
  idle_seconds: number;
  session_count: number;
  focus_score: number;           // 0–100
  flow_seconds: number;          // time spent in flow states
  target_focus_minutes: number;  // from plan (or default)
  sessions: Session[];
}

export interface WeekStats {
  days: DayStats[];
  total_focus_seconds: number;
  avg_focus_score: number;
  total_sessions: number;
  prev_week_focus_seconds: number; // for comparison
}

// ─── Streak ───────────────────────────────────────────────────────────────────

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  total_focused_days: number;
}

// ─── Flow Periods ─────────────────────────────────────────────────────────────

export interface FlowPeriod {
  started_at: number;
  duration_seconds: number;
}

// ─── Spotify ──────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  name: string;
  artist: string;
  album: string;
  artwork_url?: string;
}



export type ClassificationType = 'productive' | 'neutral' | 'distracting' | 'idle' | 'unknown';

export interface Session {
  id: string;
  title: string;
  goal: string;
  target_duration?: number; // minutes, optional
  started_at: number;       // unix timestamp ms
  ended_at?: number;        // unix timestamp ms
  status: 'active' | 'completed' | 'abandoned';
  created_at: number;
  excluded: number;         // 0 or 1 – excluded from aggregate stats
  report_json?: string;     // cached JSON of SessionReport (without session field)
}

export interface ActivityEvent {
  id?: number;
  session_id: string;
  timestamp: number;        // unix timestamp ms
  app_name: string | null;
  window_title: string | null;
  browser_domain: string | null;
  is_idle: number;          // 0 or 1
}

export interface ActivityBlock {
  id?: number;
  session_id: string;
  started_at: number;
  ended_at: number;
  app_name: string | null;
  window_title: string | null;
  browser_domain: string | null;
  classification: ClassificationType;
  duration_seconds: number;
}

export interface AppClassification {
  id?: number;
  pattern: string;
  pattern_type: 'app' | 'domain' | 'title';
  classification: ClassificationType;
  reason?: string;
  is_default: number; // 0 or 1
}

export interface TopApp {
  name: string;
  seconds: number;
  classification: ClassificationType;
}

export interface TopDomain {
  domain: string;
  seconds: number;
  classification: ClassificationType;
}

export interface SessionReport {
  session: Session;
  total_duration_seconds: number;
  focused_seconds: number;
  distracted_seconds: number;
  idle_seconds: number;
  neutral_seconds: number;
  context_switch_count: number;
  longest_focus_streak_seconds: number;
  top_apps: TopApp[];
  top_domains: TopDomain[];
  activity_blocks: ActivityBlock[];
  diversion_moments: ActivityBlock[];
  flow_periods?: FlowPeriod[];  // detected flow states in this session
  flow_seconds?: number;        // total time in flow
  llm_summary?: string;
  coaching_suggestions?: string[];
  vision_snapshots?: string[];  // text descriptions from vision model
  ai_provider_used?: string;    // which AI provider generated the summary
}

export type AiProvider = 'ollama' | 'claude' | 'openai';

export interface Settings {
  // Tracking
  tracking_interval_ms: number;
  idle_threshold_seconds: number;
  enable_browser_tracking: boolean;

  // Ollama (local LLM)
  ollama_endpoint: string;
  ollama_model: string;

  // AI provider
  ai_provider: AiProvider;
  claude_api_key: string;
  openai_api_key: string;
  language_model: string;   // model name for claude/openai provider
  enable_llm: boolean;

  // Vision model (separate from language model)
  vision_enabled: boolean;
  vision_model: string;        // e.g. 'minicpm-v:2.6', 'claude-sonnet-4-6', 'gpt-4o'
  // Screenshot timing is automatic (event-driven + 60s baseline) — not user-configurable

  // Notifications
  enable_focus_notifications: boolean;
  daily_focus_target_minutes: number;

  // Onboarding
  onboarding_completed: boolean;

  // Appearance
  theme: 'light' | 'dark' | 'system';
}

/** Structured context parsed from a desktop app window title. */
export interface AppContext {
  type: 'editor' | 'terminal' | 'design' | 'communication' | 'media' | 'other';
  file_name?: string;       // Current file being edited
  project_name?: string;    // Project / workspace name
  document_name?: string;   // For design tools, Notion, etc.
  parsed_title?: string;    // Cleaned-up title after removing app suffix
}

/** Metadata fetched from the live URL (title, description, og tags). */
export interface PageMetadata {
  title?: string;
  description?: string;
  site_name?: string;
}

export interface CurrentActivity {
  app_name: string | null;
  window_title: string | null;
  browser_domain: string | null;
  full_url?: string | null;             // Full browser URL, not just domain
  is_idle: boolean;
  classification: ClassificationType;
  session_elapsed_seconds: number;
  // Enrichment
  app_context?: AppContext;             // Parsed desktop-app context
  page_metadata?: PageMetadata;         // Fetched page og/meta tags
  context_summary?: string;            // Human-readable: "Editing foo.ts in MyProject"
  last_vision_description?: string;    // Latest vision model analysis of screen
  // Flow state
  in_flow?: boolean;                   // Currently in a flow state
  flow_duration_seconds?: number;      // Seconds in current flow period
}

// IPC response wrapper
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
