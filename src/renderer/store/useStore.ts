import { create } from 'zustand';
import type { Session, CurrentActivity, Settings } from '../../shared/types';

interface AppState {
  // Active session
  activeSession: Session | null;
  currentActivity: CurrentActivity | null;

  // Settings
  settings: Settings | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  initApp: () => Promise<void>;
  setActiveSession: (session: Session | null) => void;
  setCurrentActivity: (activity: CurrentActivity | null) => void;
  setSettings: (settings: Settings) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSession: null,
  currentActivity: null,
  settings: null,
  isLoading: false,
  error: null,

  initApp: async () => {
    set({ isLoading: true });
    try {
      // Load settings
      const settingsRes = await window.api.getSettings();
      if (settingsRes.success && settingsRes.data) {
        set({ settings: settingsRes.data });
      }

      // Check for active session
      const sessionRes = await window.api.getCurrentSession();
      if (sessionRes.success && sessionRes.data) {
        set({ activeSession: sessionRes.data });
      }
    } catch (e) {
      console.error('[Store] initApp error:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveSession: (session) => set({ activeSession: session }),
  setCurrentActivity: (activity) => set({ currentActivity: activity }),
  setSettings: (settings) => set({ settings }),
  clearError: () => set({ error: null }),
}));
