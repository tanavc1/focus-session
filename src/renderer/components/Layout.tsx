import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, TrendingUp, Settings, Zap, Flame } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { useSessionControl } from '../hooks/useSession';
import PrivacyBadge from './PrivacyBadge';
import type { SpotifyTrack } from '../../shared/types';

export default function Layout() {
  const { activeSession, streak, setSpotifyTrack } = useAppStore();
  const { quickStartSession, endSession } = useSessionControl();

  // Subscribe to Spotify updates
  useEffect(() => {
    const unsub = window.api.onSpotifyUpdate((track: SpotifyTrack | null) => {
      setSpotifyTrack(track);
    });
    return unsub;
  }, [setSpotifyTrack]);

  // Tray → end session
  useEffect(() => {
    return window.api.onTrayEndSession(async (sessionId: string) => {
      try { await endSession(sessionId); } catch { /* ignore */ }
    });
  }, [endSession]);

  // Tray → quick start
  useEffect(() => {
    return window.api.onTrayQuickStart(async () => {
      if (!activeSession) {
        try { await quickStartSession(); } catch { /* ignore */ }
      }
    });
  }, [quickStartSession, activeSession]);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* macOS titlebar drag region */}
      <div className="titlebar-spacer flex items-center px-20 drag-region">
        <span className="text-xs text-slate-600 font-semibold tracking-widest uppercase">Focus</span>
      </div>

      {/* Live session status bar */}
      {activeSession && (
        <LiveSessionBar title={activeSession.title} startedAt={activeSession.started_at} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[72px] flex flex-col items-center py-3 bg-slate-900 border-r border-slate-800/80 gap-1 no-drag">
          <NavItem to="/"           icon={<Home size={18} />}       label="Today"   />
          <NavItem to="/session/active" icon={
            <div className="relative">
              <Zap size={18} />
              {activeSession && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse-slow" />
              )}
            </div>
          } label="Session" />
          <NavItem to="/journey"    icon={<TrendingUp size={18} />} label="Journey" />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Streak badge */}
          {streak && streak.current_streak > 0 && (
            <div className="flex flex-col items-center gap-0.5 mb-2">
              <Flame size={16} className="text-orange-400" />
              <span className="text-xs font-bold text-orange-400 tabular-nums">
                {streak.current_streak}
              </span>
            </div>
          )}

          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 scrollable">
            <Outlet />
          </div>

          {/* Privacy badge */}
          <div className="px-4 py-2 border-t border-slate-800/60 flex items-center justify-end">
            <PrivacyBadge />
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Live session bar ─────────────────────────────────────────────────────────

function LiveSessionBar({ title, startedAt }: { title: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  const navigate = useNavigate();
  const { currentActivity, spotifyTrack } = useAppStore();

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const inFlow = currentActivity?.in_flow;

  return (
    <div
      className={`no-drag flex items-center gap-3 px-4 py-2 border-b cursor-pointer transition-colors ${
        inFlow
          ? 'bg-amber-950/40 border-amber-900/40 hover:bg-amber-950/55 glow-amber'
          : 'bg-green-950/30 border-green-900/30 hover:bg-green-950/45'
      }`}
      onClick={() => navigate('/session/active')}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 animate-pulse-slow ${inFlow ? 'bg-amber-400' : 'bg-green-400'}`} />

      {inFlow ? (
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">🔥 Flow</span>
      ) : (
        <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Recording</span>
      )}

      <span className="text-xs text-slate-400 truncate flex-1">{title}</span>

      {/* Spotify in bar */}
      {spotifyTrack && (
        <div className="hidden sm:flex items-center gap-1.5 max-w-[160px] flex-shrink-0">
          <SpotifyIcon size={12} />
          <span className="text-xs text-[#1DB954] truncate">{spotifyTrack.name}</span>
        </div>
      )}

      <span className="text-xs font-mono text-slate-300 flex-shrink-0 tabular-nums">
        {formatElapsed(elapsed)}
      </span>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      title={label}
      end={to === '/'}
      className={({ isActive }) =>
        `w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors duration-150 ${
          isActive
            ? 'bg-brand-600/90 text-white'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        }`
      }
    >
      {icon}
      <span className="text-[9px] font-medium leading-none opacity-80">{label}</span>
    </NavLink>
  );
}

// ─── Spotify icon ─────────────────────────────────────────────────────────────

function SpotifyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#1DB954" className="flex-shrink-0">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
