import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, TrendingUp, Plus, ChevronRight, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import StartSessionModal from '../components/StartSessionModal';
import { useAppStore } from '../store/useStore';
import type { Session } from '../../shared/types';

export default function HomePage() {
  const navigate = useNavigate();
  const { activeSession } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecentSessions();
  }, []);

  async function loadRecentSessions() {
    setIsLoading(true);
    const res = await window.api.listSessions();
    if (res.success && res.data) {
      setRecentSessions(res.data.slice(0, 5));
    }
    setIsLoading(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Focus Session</h1>
        <p className="text-slate-400 mt-1">Track your deep work. Stay honest with yourself.</p>
      </div>

      {/* Active session banner */}
      {activeSession && (
        <div
          className="card border-green-700/30 bg-green-950/20 cursor-pointer hover:bg-green-950/30 transition-colors"
          onClick={() => navigate('/session/active')}
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse-slow" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-300">Session in progress</p>
              <p className="text-xs text-slate-400 mt-0.5">{activeSession.title}</p>
            </div>
            <ChevronRight size={16} className="text-slate-500" />
          </div>
        </div>
      )}

      {/* Quick start */}
      {!activeSession && (
        <div className="card flex flex-col items-center text-center py-10 gap-4">
          <div className="w-16 h-16 bg-brand-600/20 border border-brand-600/30 rounded-2xl flex items-center justify-center">
            <Zap size={28} className="text-brand-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Ready to focus?</h2>
            <p className="text-slate-400 text-sm mt-1">
              Start a session to track your work and stay on task.
            </p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            New Session
          </button>
        </div>
      )}

      {/* Stats row */}
      <StatsRow sessions={recentSessions} />

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
