import { contextBridge, ipcRenderer } from 'electron';
import type {
  Session,
  SessionReport,
  AppClassification,
  Settings,
  CurrentActivity,
  IpcResponse,
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

  // Reports
  getSessionReport: (session_id: string) =>
    ipcRenderer.invoke('session:report', { session_id }) as Promise<IpcResponse<SessionReport>>,

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

  // LLM / Ollama
  checkLlmStatus: () =>
    ipcRenderer.invoke('llm:status') as Promise<IpcResponse<{
      is_running: boolean;
      models: string[];
      endpoint: string;
    }>>,

  // Event listeners (push from main to renderer)
  onActivityUpdate: (callback: (activity: CurrentActivity) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: CurrentActivity) => callback(data);
    ipcRenderer.on('activity:update', listener);
    // Return cleanup function
    return () => ipcRenderer.removeListener('activity:update', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
