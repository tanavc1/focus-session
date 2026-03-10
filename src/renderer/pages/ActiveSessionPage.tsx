import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Square, Monitor, Globe, Zap, Coffee, Minus, AlertTriangle, Play, Target, Eye } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { useActivitySubscription, useSessionControl } from '../hooks/useSession';
import type { ClassificationType } from '../../shared/types';

const classificationConfig: Record<ClassificationType, { label: string; color: string; icon: React.ReactNode }> = {
  productive:   { label: 'Focused',    color: 'text-green-400',  icon: <Zap size={14} /> },
  distracting:  { label: 'Distracted', color: 'text-red-400',    icon: <AlertTriangle size={14} /> },
  neutral:      { label: 'Neutral',    color: 'text-slate-400',  icon: <Minus size={14} /> },
  idle:         { label: 'Idle',       color: 'text-slate-500',  icon: <Coffee size={14} /> },
  unknown:      { label: 'Tracking…',  color: 'text-slate-500',  icon: <Monitor size={14} /> },
};

export default function ActiveSessionPage() {
  const navigate = useNavigate();
  const { activeSession, currentActivity, spotifyTrack } = useAppStore();
  const { quickStartSession, endSession } = useSessionControl();
  const [elapsed, setElapsed] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [isQuickStarting, setIsQuickStarting] = useState(false);

  // Subscribe to live activity updates
  useActivitySubscription();

  // Only redirect when a session that was running gets ended mid-view, not on fresh mount
  const hadSessionOnMount = useRef(!!activeSession);

  // Tick the elapsed timer
  useEffect(() => {
    if (!activeSession) {
      if (hadSessionOnMount.current) {
        navigate('/');
      }
      return;
    }
    hadSessionOnMount.current = true;

    const tick = () => {
      setElapsed(Math.floor((Date.now() - activeSession.started_at) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession, navigate]);

  const handleEndSession = useCallback(async () => {
    if (!activeSession) return;
    setIsEnding(true);
    try {
      await endSession(activeSession.id);
    } catch (err) {
      console.error('Failed to end session:', err);
      setIsEnding(false);
    }
  }, [activeSession, endSession]);

  async function handleQuickStart() {
    setIsQuickStarting(true);
    try {
      await quickStartSession();
    } catch (err) {
      console.error('Quick start failed:', err);
      setIsQuickStarting(false);
    }
  }

  // No active session — show options instead of blank page
  if (!activeSession) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
          <Zap size={28} className="text-slate-500" />
        </div>
        <div>
          <p className="text-slate-300 font-medium">No active session</p>
          <p className="text-slate-500 text-sm mt-1">Start one to begin tracking your work.</p>
        </div>
        <div className="w-full space-y-3">
          <button
            onClick={handleQuickStart}
            disabled={isQuickStarting}
            className="btn-primary w-full justify-center"
          >
            {isQuickStarting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play size={16} fill="white" />
            )}
            {isQuickStarting ? 'Starting…' : 'Quick Start'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-secondary w-full justify-center"
          >
            <Target size={16} />
            Plan a Session
          </button>
        </div>
      </div>
    );
  }

  const classification = currentActivity?.classification ?? 'unknown';
  const cfg = classificationConfig[classification];
  const isQuickSession = activeSession.goal === 'Open session — capturing all activity';

  const targetPercent = activeSession.target_duration
    ? Math.min(100, (elapsed / (activeSession.target_duration * 60)) * 100)
    : null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Session header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {currentActivity?.in_flow ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-900/50 border border-amber-700/40">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse-slow" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                🔥 Flow
                {currentActivity.flow_duration_seconds && currentActivity.flow_duration_seconds > 0
                  ? ` · ${Math.floor(currentActivity.flow_duration_seconds / 60)}m`
                  : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse-slow" />
              <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Session Active</span>
            </div>
          )}
          {isQuickSession && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Quick</span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-100">{activeSession.title}</h1>
        {!isQuickSession && (
          <p className="text-sm text-slate-400">{activeSession.goal}</p>
        )}
        {isQuickSession && (
          <p className="text-sm text-slate-500 italic">Tracking all activity — full report on end</p>
        )}
      </div>

      {/* Timer */}
      <div className="card flex items-center justify-between">
        <div>
          <div className="text-4xl font-mono font-bold text-slate-100 tabular-nums">
            {formatDuration(elapsed)}
          </div>
          {activeSession.target_duration && (
            <div className="text-xs text-slate-500 mt-1">
              Target: {activeSession.target_duration}m
            </div>
          )}
        </div>

        {targetPercent !== null && (
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 64 64" className="transform -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgb(51,65,85)" strokeWidth="4" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                stroke="rgb(14,165,233)" strokeWidth="4"
                strokeDasharray={`${targetPercent * 1.759} 175.9`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono text-slate-300">{Math.round(targetPercent)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {targetPercent !== null && (
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-1000"
            style={{ width: `${targetPercent}%` }}
          />
        </div>
      )}

      {/* Current activity */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Current Activity</span>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
            {cfg.icon}
            <span>{cfg.label}</span>
          </div>
        </div>

        {currentActivity ? (
          <div className="space-y-2">
            {/* Context summary — primary, most informative signal */}
            {currentActivity.context_summary && (
              <div className="flex items-start gap-2">
                <Zap size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-slate-200 leading-snug">
                  {currentActivity.context_summary}
                </span>
              </div>
            )}

            {/* Secondary detail rows */}
            {currentActivity.app_name && (
              <ActivityRow
                icon={<Monitor size={13} className="text-slate-600" />}
                label="App"
                value={currentActivity.app_name}
              />
            )}
            {currentActivity.browser_domain && (
              <ActivityRow
                icon={<Globe size={13} className="text-slate-600" />}
                label="Site"
                value={currentActivity.full_url
                  ? currentActivity.full_url.replace(/^https?:\/\//, '').slice(0, 80)
                  : currentActivity.browser_domain}
              />
            )}
            {currentActivity.page_metadata?.description && (
              <div className="pl-5 text-xs text-slate-500 leading-relaxed line-clamp-2">
                {currentActivity.page_metadata.description}
              </div>
            )}

            {/* Vision description — shown when available */}
            {currentActivity.last_vision_description && (
              <div className="mt-1 p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/50 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Eye size={11} />
                  <span>Vision analysis</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {currentActivity.last_vision_description}
                </p>
              </div>
            )}

            {currentActivity.is_idle && (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Coffee size={14} />
                <span>System idle — taking a break?</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <div className="w-3 h-3 border-2 border-slate-600 border-t-brand-400 rounded-full animate-spin" />
            <span>Detecting activity…</span>
          </div>
        )}
      </div>

      {/* Distraction warning */}
      {classification === 'distracting' && (
        <div className="card border-red-800/40 bg-red-950/20 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Distraction detected</p>
            <p className="text-xs text-slate-400 mt-0.5">
              You're on{' '}
              <span className="text-slate-300">
                {currentActivity?.browser_domain ?? currentActivity?.app_name ?? 'a distracting site'}
              </span>
              {!isQuickSession && (
                <>. Your session goal: <span className="italic text-slate-300">{activeSession.goal}</span></>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Spotify now playing */}
      {spotifyTrack && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#121212] border border-[#282828] rounded-xl">
          {/* Album art or Spotify logo */}
          {spotifyTrack.artwork_url ? (
            <img
              src={spotifyTrack.artwork_url}
              alt="Album art"
              className="w-9 h-9 rounded-md flex-shrink-0 object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-[#1DB954]/10 flex items-center justify-center flex-shrink-0">
              <SpotifyIcon size={20} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <SpotifyIcon size={11} className="flex-shrink-0" />
              <span className="text-[10px] text-[#1DB954] font-semibold uppercase tracking-wide">Spotify</span>
            </div>
            <p className="text-sm text-white truncate font-medium leading-tight">{spotifyTrack.name}</p>
            <p className="text-xs text-[#b3b3b3] truncate">{spotifyTrack.artist}</p>
          </div>
        </div>
      )}

      {/* End session */}
      <div className="flex justify-end">
        {!confirmEnd ? (
          <button className="btn-danger" onClick={() => setConfirmEnd(true)}>
            <Square size={14} />
            End Session
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">End session and generate report?</span>
            <button className="btn-secondary" onClick={() => setConfirmEnd(false)}>
              Keep Going
            </button>
            <button
              className="btn-danger"
              onClick={handleEndSession}
              disabled={isEnding}
            >
              {isEnding ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ending…
                </>
              ) : (
                'Confirm End'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-slate-500 w-12 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-300 truncate">{value}</span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Spotify icon (SVG) ───────────────────────────────────────────────────────

function SpotifyIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#1DB954" className={className}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
