import { contextBridge, ipcRenderer } from 'electron';
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

// ─── Type-safe API exposed to the renderer via contextBridge ──────────────────

const api = {
  // Session management
  startSession: (data: { title: string; goal: string; target_duration?: number }) =>
    ipcRenderer.invoke('session:start', data) as Promise<IpcResponse<Session>>,

  endSession: (session_id: string) =>
    ipcRenderer.invoke('session:end', { session_id }) as Promise<IpcResponse<Session>>,

  getCurrentSession: () =>
    ipcRenderer.invoke('session:current') as Promise<IpcResponse<Session | null>>,

  getSession: (session_id: string) =>
    ipcRenderer.invoke('session:get', { session_id }) as Promise<IpcResponse<Session | null>>,

  listSessions: () =>
    ipcRenderer.invoke('sessions:list') as Promise<IpcResponse<Session[]>>,

  toggleSessionExcluded: (session_id: string, excluded: boolean) =>
    ipcRenderer.invoke('session:toggle-excluded', { session_id, excluded }) as Promise<IpcResponse<Session>>,

  // Reports
  getSessionReport: (session_id: string, force_refresh?: boolean) =>
    ipcRenderer.invoke('session:report', { session_id, force_refresh }) as Promise<IpcResponse<SessionReport>>,

  getSessionFlowPeriods: (session_id: string) =>
    ipcRenderer.invoke('session:flow-periods', { session_id }) as Promise<IpcResponse<{ periods: FlowPeriod[]; flow_seconds: number }>>,

  // Vision snapshot (on-demand during active session)
  captureVisionSnapshot: (session_id: string) =>
    ipcRenderer.invoke('session:vision-snapshot', { session_id }) as Promise<IpcResponse<string>>,

  // Live activity
  getCurrentActivity: () =>
    ipcRenderer.invoke('activity:current') as Promise<IpcResponse<CurrentActivity | null>>,

  // Settings
  getSettings: () =>
    ipcRenderer.invoke('settings:get') as Promise<IpcResponse<Settings>>,

  setSettings: (settings: Partial<Settings>) =>
    ipcRenderer.invoke('settings:set', settings) as Promise<IpcResponse<Settings>>,

  // Classification rules
  listClassifications: () =>
    ipcRenderer.invoke('classifications:list') as Promise<IpcResponse<AppClassification[]>>,

  upsertClassification: (classification: AppClassification) =>
    ipcRenderer.invoke('classifications:upsert', classification) as Promise<IpcResponse<AppClassification>>,

  deleteClassification: (id: number) =>
    ipcRenderer.invoke('classifications:delete', { id }) as Promise<IpcResponse<boolean>>,

  // AI / LLM
  checkLlmStatus: () =>
    ipcRenderer.invoke('llm:status') as Promise<IpcResponse<{
      is_running: boolean;
      is_configured: boolean;
      provider: string;
      models: string[];
      endpoint: string;
      message: string;
    }>>,

  // Day planning
  getDayPlan: (date: string) =>
    ipcRenderer.invoke('dayplan:get', { date }) as Promise<IpcResponse<DayPlan | null>>,

  setDayPlan: (plan: Omit<DayPlan, 'created_at' | 'updated_at'>) =>
    ipcRenderer.invoke('dayplan:set', plan) as Promise<IpcResponse<DayPlan>>,

  // Stats
  getDayStats: (date: string) =>
    ipcRenderer.invoke('stats:day', { date }) as Promise<IpcResponse<DayStats>>,

  getWeekStats: (end_date: string) =>
    ipcRenderer.invoke('stats:week', { end_date }) as Promise<IpcResponse<WeekStats>>,

  getStreak: () =>
    ipcRenderer.invoke('stats:streak') as Promise<IpcResponse<StreakInfo>>,

  getTopApps: (days?: number) =>
    ipcRenderer.invoke('stats:top-apps', { days }) as Promise<IpcResponse<{ name: string; seconds: number }[]>>,

  getTopDistractions: (days?: number) =>
    ipcRenderer.invoke('stats:top-distractions', { days }) as Promise<IpcResponse<{ name: string; seconds: number }[]>>,

  // Event listeners (push from main → renderer)
  onActivityUpdate: (callback: (activity: CurrentActivity) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: CurrentActivity) => callback(data);
    ipcRenderer.on('activity:update', listener);
    return () => ipcRenderer.removeListener('activity:update', listener);
  },

  onSpotifyUpdate: (callback: (track: SpotifyTrack | null) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: SpotifyTrack | null) => callback(data);
    ipcRenderer.on('spotify:update', listener);
    return () => ipcRenderer.removeListener('spotify:update', listener);
  },

  // Tray → renderer requests
  onTrayEndSession: (callback: (sessionId: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId);
    ipcRenderer.on('tray:request-end-session', listener);
    return () => ipcRenderer.removeListener('tray:request-end-session', listener);
  },

  onTrayQuickStart: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('tray:request-quick-start', listener);
    return () => ipcRenderer.removeListener('tray:request-quick-start', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
