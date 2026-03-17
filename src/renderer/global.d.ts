import type {
  Session,
  SessionReport,
  AppClassification,
  Settings,
  CurrentActivity,
  IpcResponse,
  DayPlan,
  DayStats,
  WeekStats,
  StreakInfo,
  FlowPeriod,
  SpotifyTrack,
} from '../shared/types';

// Type-safe window.api exposed by the preload script
interface ElectronAPI {
  startSession: (data: { title: string; goal: string; target_duration?: number }) => Promise<IpcResponse<Session>>;
  endSession: (session_id: string) => Promise<IpcResponse<Session | null>>;
  getCurrentSession: () => Promise<IpcResponse<Session | null>>;
  getSession: (session_id: string) => Promise<IpcResponse<Session | null>>;
  listSessions: () => Promise<IpcResponse<Session[]>>;
  toggleSessionExcluded: (session_id: string, excluded: boolean) => Promise<IpcResponse<Session>>;
  getSessionReport: (session_id: string, force_refresh?: boolean) => Promise<IpcResponse<SessionReport>>;
  getSessionFlowPeriods: (session_id: string) => Promise<IpcResponse<{ periods: FlowPeriod[]; flow_seconds: number }>>;
  captureVisionSnapshot: (session_id: string) => Promise<IpcResponse<string>>;
  getCurrentActivity: () => Promise<IpcResponse<CurrentActivity | null>>;
  getSettings: () => Promise<IpcResponse<Settings>>;
  setSettings: (settings: Partial<Settings>) => Promise<IpcResponse<Settings>>;
  listClassifications: () => Promise<IpcResponse<AppClassification[]>>;
  upsertClassification: (classification: AppClassification) => Promise<IpcResponse<AppClassification>>;
  deleteClassification: (id: number) => Promise<IpcResponse<boolean>>;
  checkLlmStatus: () => Promise<IpcResponse<{
    is_running: boolean;
    is_configured: boolean;
    provider: string;
    models: string[];
    endpoint: string;
    message: string;
  }>>;
  getDayPlan: (date: string) => Promise<IpcResponse<DayPlan | null>>;
  onSessionSuspended: (cb: () => void) => () => void;
  onSessionResumed: (cb: () => void) => () => void;
  onUpdateAvailable: (cb: (info: { version: string; downloadUrl: string; releaseUrl: string }) => void) => () => void;
  downloadUpdate: (url: string) => Promise<void>;
  quitApp: () => Promise<void>;
  setDayPlan: (plan: Omit<DayPlan, 'created_at' | 'updated_at'>) => Promise<IpcResponse<DayPlan>>;
  getDayStats: (date: string) => Promise<IpcResponse<DayStats>>;
  getWeekStats: (end_date: string) => Promise<IpcResponse<WeekStats>>;
  getStreak: () => Promise<IpcResponse<StreakInfo>>;
  getTopApps: (days?: number) => Promise<IpcResponse<{ name: string; seconds: number }[]>>;
  getTopDistractions: (days?: number) => Promise<IpcResponse<{ name: string; seconds: number }[]>>;
  onActivityUpdate: (callback: (activity: CurrentActivity) => void) => () => void;
  onSpotifyUpdate: (callback: (track: SpotifyTrack | null) => void) => () => void;
  onTrayEndSession: (callback: (sessionId: string) => void) => () => void;
  onTrayQuickStart: (callback: () => void) => () => void;

  checkPermissions: () => Promise<{ accessibility: boolean; screen_recording: boolean }>;
  requestAccessibility: () => Promise<boolean>;
  openScreenRecordingSettings: () => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
