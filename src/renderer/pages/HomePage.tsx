import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight, AlertCircle, Play, Target } from 'lucide-react';
import { format } from 'date-fns';
import StartSessionModal from '../components/StartSessionModal';
import { useAppStore } from '../store/useStore';
import { useSessionControl } from '../hooks/useSession';
import type { Session } from '../../shared/types';

export default function HomePage() {
  const navigate = useNavigate();
  const { activeSession } = useAppStore();
  const { quickStartSession } = useSessionControl();
  const [showModal, setShowModal] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickStarting, setIsQuickStarting] = useState(false);

  useEffect(() => {
    loadRecentSessions();
  }, []);

  async function loadRecentSessions() {
    setIsLoading(true);
    const res = await window.api.listSessions();
    if (res.success && res.data) {
      setRecentSessions(res.data.slice(0, 5));
      // Store all sessions for stats (will be used by StatsRow)
      setAllSessions(res.data);
    }
    setIsLoading(false);
  }

  async function handleQuickStart() {
    setIsQuickStarting(true);
    try {
      await quickStartSession();
    } catch (err) {
      console.error('Quick start failed:', err);
      setIsQuickStarting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Focus Session</h1>
        <p className="text-slate-400 mt-1">Track your deep work. Stay honest with yourself.</p>
      </div>

      {/* Active session banner */}
      {activeSession ? (
        <div
          className="card border-green-700/40 bg-green-950/25 cursor-pointer hover:bg-green-950/35 transition-colors"
          onClick={() => navigate('/session/active')}
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse-slow flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-300">Session in progress — click to view</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{activeSession.title}</p>
            </div>
            <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
          </div>
        </div>
      ) : (
        /* ── Start options ── */
        <div className="space-y-3">
          {/* Quick Start — primary CTA */}
          <button
            onClick={handleQuickStart}
            disabled={isQuickStarting}
            className="w-full rounded-2xl border border-brand-600/40 bg-brand-950/30 hover:bg-brand-950/50 hover:border-brand-500/60 transition-all duration-150 p-6 flex items-center gap-5 group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500 transition-colors">
              {isQuickStarting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={24} className="text-white" fill="white" />
              )}
            </div>
            <div className="text-left flex-1">
              <div className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">
                {isQuickStarting ? 'Starting…' : 'Quick Start'}
              </div>
              <div className="text-sm text-slate-400 mt-0.5">
                Start tracking right now
              </div>
            </div>
            <div className="text-xs text-brand-400 font-medium px-2.5 py-1 bg-brand-900/50 rounded-lg flex-shrink-0">
              1 click
            </div>
          </button>

          {/* Named session — secondary */}
          <button
            onClick={() => setShowModal(true)}
            className="w-full rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-600/60 transition-all duration-150 p-4 flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-600 transition-colors">
              <Target size={18} className="text-slate-300" />
            </div>
            <div className="text-left flex-1">
              <div className="text-sm font-semibold text-slate-200">Plan a Session</div>
              <div className="text-xs text-slate-500 mt-0.5">Set a title, goal, and optional duration</div>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
          </button>
        </div>
      )}

      {/* Stats row */}
      <StatsRow sessions={allSessions.filter((s) => !s.excluded)} />

      {/* Recent sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Recent Sessions</h2>
          <button
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            onClick={() => navigate('/history')}
          >
            View all
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="card text-center py-8">
            <AlertCircle size={32} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No sessions yet. Start your first one!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onClick={() => navigate(`/session/${session.id}/report`)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && <StartSessionModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function StatsRow({ sessions }: { sessions: Session[] }) {
  // sessions is already pre-filtered to exclude `excluded` ones
  const total = sessions.length;
  const totalMins = sessions.reduce((acc, s) => {
    if (s.ended_at && s.started_at) {
      return acc + Math.floor((s.ended_at - s.started_at) / 60000);
    }
    return acc;
  }, 0);

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card text-center">
        <div className="text-2xl font-bold font-mono text-slate-100">{total}</div>
        <div className="text-xs text-slate-400 mt-1">Sessions</div>
      </div>
      <div className="card text-center">
        <div className="text-2xl font-bold font-mono text-slate-100">{total > 0 ? timeStr : '—'}</div>
        <div className="text-xs text-slate-400 mt-1">Total Tracked</div>
      </div>
      <div className="card text-center">
        <div className="text-2xl font-bold font-mono text-slate-100">
          {total > 0 ? Math.round(totalMins / total) + 'm' : '—'}
        </div>
        <div className="text-xs text-slate-400 mt-1">Avg Duration</div>
      </div>
    </div>
  );
}

function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) {
  const duration = session.ended_at
    ? Math.floor((session.ended_at - session.started_at) / 60000)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full card hover:bg-slate-700/60 transition-colors text-left flex items-center gap-3"
    >
      <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
        <Zap size={16} className="text-brand-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{session.title}</p>
        <p className="text-xs text-slate-500 truncate">{session.goal}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-slate-400 font-mono">
          {duration !== null ? `${duration}m` : '—'}
        </p>
        <p className="text-xs text-slate-600">
          {format(new Date(session.started_at), 'MMM d')}
        </p>
      </div>
      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
    </button>
  );
}
