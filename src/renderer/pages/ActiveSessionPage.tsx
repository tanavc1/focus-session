import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Square, Monitor, Globe, Zap, Coffee, Minus, AlertTriangle } from 'lucide-react';
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
  const { activeSession, currentActivity } = useAppStore();
  const { endSession } = useSessionControl();
  const [elapsed, setElapsed] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Subscribe to live activity updates
  useActivitySubscription();

  // Tick the elapsed timer
  useEffect(() => {
    if (!activeSession) {
      navigate('/');
      return;
    }

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

  if (!activeSession) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-slate-400">No active session. Start one from the home screen.</p>
      </div>
    );
  }

  const classification = currentActivity?.classification ?? 'unknown';
  const cfg = classificationConfig[classification];

  const targetPercent = activeSession.target_duration
    ? Math.min(100, (elapsed / (activeSession.target_duration * 60)) * 100)
    : null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Session header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse-slow" />
          <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Session Active</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">{activeSession.title}</h1>
        <p className="text-sm text-slate-400">{activeSession.goal}</p>
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
            {currentActivity.app_name && (
              <ActivityRow
                icon={<Monitor size={14} className="text-slate-500" />}
                label="App"
                value={currentActivity.app_name}
              />
            )}
            {currentActivity.browser_domain && (
              <ActivityRow
                icon={<Globe size={14} className="text-slate-500" />}
                label="Domain"
                value={currentActivity.browser_domain}
              />
            )}
            {currentActivity.window_title && !currentActivity.browser_domain && (
              <ActivityRow
                icon={<Monitor size={14} className="text-slate-500" />}
                label="Window"
                value={currentActivity.window_title}
              />
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
              . Your session goal: <span className="italic text-slate-300">{activeSession.goal}</span>
            </p>
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
