import { create } from 'zustand';
import type { Session, CurrentActivity, Settings, DayPlan, DayStats, StreakInfo, SpotifyTrack } from '../../shared/types';

interface AppState {
  // Active session
  activeSession:   Session | null;
  currentActivity: CurrentActivity | null;

  // Settings
  settings: Settings | null;

  // Today
  todayPlan:   DayPlan | null;
  todayStats:  DayStats | null;
  streak:      StreakInfo | null;

  // Spotify
  spotifyTrack: SpotifyTrack | null;

  // UI state
  isLoading: boolean;
  error:     string | null;

  // Actions
  initApp:            () => Promise<void>;
  setActiveSession:   (session: Session | null) => void;
  setCurrentActivity: (activity: CurrentActivity | null) => void;
  setSettings:        (settings: Settings) => void;
  setTodayPlan:       (plan: DayPlan | null) => void;
  setTodayStats:      (stats: DayStats | null) => void;
  setStreak:          (streak: StreakInfo | null) => void;
  setSpotifyTrack:    (track: SpotifyTrack | null) => void;
  refreshToday:       () => Promise<void>;
  clearError:         () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSession:   null,
  currentActivity: null,
  settings:        null,
  todayPlan:       null,
  todayStats:      null,
  streak:          null,
  spotifyTrack:    null,
  isLoading:       false,
  error:           null,

  initApp: async () => {
    set({ isLoading: true });
    try {
      const [settingsRes, sessionRes, planRes, statsRes, streakRes] = await Promise.all([
        window.api.getSettings(),
        window.api.getCurrentSession(),
        window.api.getDayPlan(todayIso()),
        window.api.getDayStats(todayIso()),
        window.api.getStreak(),
      ]);
      set({
        settings:    settingsRes.success  ? settingsRes.data  ?? null : null,
        activeSession: sessionRes.success ? sessionRes.data   ?? null : null,
        todayPlan:   planRes.success      ? planRes.data      ?? null : null,
        todayStats:  statsRes.success     ? statsRes.data     ?? null : null,
        streak:      streakRes.success    ? streakRes.data    ?? null : null,
      });
    } catch (e) {
      console.error('[Store] initApp error:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  refreshToday: async () => {
    try {
      const [planRes, statsRes, streakRes] = await Promise.all([
        window.api.getDayPlan(todayIso()),
        window.api.getDayStats(todayIso()),
        window.api.getStreak(),
      ]);
      set({
        todayPlan:  planRes.success   ? planRes.data   ?? null : get().todayPlan,
        todayStats: statsRes.success  ? statsRes.data  ?? null : get().todayStats,
        streak:     streakRes.success ? streakRes.data ?? null : get().streak,
      });
    } catch (e) {
      console.error('[Store] refreshToday error:', e);
    }
  },

  setActiveSession:   (session)  => set({ activeSession: session }),
  setCurrentActivity: (activity) => set({ currentActivity: activity }),
  setSettings:        (settings) => set({ settings }),
  setTodayPlan:       (plan)     => set({ todayPlan: plan }),
  setTodayStats:      (stats)    => set({ todayStats: stats }),
  setStreak:          (streak)   => set({ streak }),
  setSpotifyTrack:    (track)    => set({ spotifyTrack: track }),
  clearError:         ()         => set({ error: null }),
}));
