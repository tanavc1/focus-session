import type {
  Session,
  SessionReport,
  AppClassification,
  Settings,
  CurrentActivity,
  IpcResponse,
} from '../shared/types';

// Type-safe window.api exposed by the preload script
interface ElectronAPI {
  startSession: (data: { title: string; goal: string; target_duration?: number }) => Promise<IpcResponse<Session>>;
  endSession: (session_id: string) => Promise<IpcResponse<Session>>;
  getCurrentSession: () => Promise<IpcResponse<Session | null>>;
  getSession: (session_id: string) => Promise<IpcResponse<Session | null>>;
  listSessions: () => Promise<IpcResponse<Session[]>>;
  getSessionReport: (session_id: string) => Promise<IpcResponse<SessionReport>>;
  getCurrentActivity: () => Promise<IpcResponse<CurrentActivity | null>>;
  getSettings: () => Promise<IpcResponse<Settings>>;
  setSettings: (settings: Partial<Settings>) => Promise<IpcResponse<Settings>>;
  listClassifications: () => Promise<IpcResponse<AppClassification[]>>;
  upsertClassification: (classification: AppClassification) => Promise<IpcResponse<AppClassification>>;
  deleteClassification: (id: number) => Promise<IpcResponse<boolean>>;
  checkLlmStatus: () => Promise<IpcResponse<{ is_running: boolean; models: string[]; endpoint: string }>>;
  onActivityUpdate: (callback: (activity: CurrentActivity) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
