// ─── Core types shared between main and renderer processes ───────────────────

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
  llm_summary?: string;
  coaching_suggestions?: string[];
}

export interface Settings {
  ollama_endpoint: string;
  ollama_model: string;
  tracking_interval_ms: number;
  idle_threshold_seconds: number;
  theme: 'light' | 'dark' | 'system';
  enable_browser_tracking: boolean;
  enable_llm: boolean;
}

export interface CurrentActivity {
  app_name: string | null;
  window_title: string | null;
  browser_domain: string | null;
  is_idle: boolean;
  classification: ClassificationType;
  session_elapsed_seconds: number;
}

// IPC response wrapper
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
