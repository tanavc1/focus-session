import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, Zap, Clock, AlertCircle } from 'lucide-react';
import type { Session } from '../../shared/types';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setIsLoading(true);
    const res = await window.api.listSessions();
    if (res.success && res.data) {
      setSessions(res.data);
    }
    setIsLoading(false);
  }

  // Group sessions by date
  const grouped = groupByDate(sessions);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Session History</h1>
        <p className="text-sm text-slate-400 mt-1">{sessions.length} sessions tracked</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card flex flex-col items-center text-center py-12 gap-3">
          <AlertCircle size={36} className="text-slate-600" />
          <p className="text-slate-400">No past sessions yet.</p>
          <p className="text-sm text-slate-500">Complete a session to see it here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ dateLabel, sessions: daySessions }) => (
            <div key={dateLabel}>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {dateLabel}
              </h2>
              <div className="space-y-2">
                {daySessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onClick={() => navigate(`/session/${session.id}/report`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onClick }: { session: Session; onClick: () => void }) {
  const duration = session.ended_at
    ? Math.floor((session.ended_at - session.started_at) / 60000)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full card hover:bg-slate-700/60 transition-colors text-left flex items-center gap-4"
    >
      <div className="w-10 h-10 bg-slate-700/80 rounded-lg flex items-center justify-center flex-shrink-0">
        <Zap size={16} className="text-brand-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{session.title}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{session.goal}</p>
        <p className="text-xs text-slate-600 mt-1">
          {format(new Date(session.started_at), 'h:mm a')}
          {session.ended_at && ` → ${format(new Date(session.ended_at), 'h:mm a')}`}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {duration !== null && (
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            <span className="font-mono">{duration}m</span>
          </div>
        )}
        <span className="text-xs text-slate-600 capitalize">{session.status}</span>
      </div>

      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
    </button>
  );
}

interface GroupedSessions {
  dateLabel: string;
  sessions: Session[];
}

function groupByDate(sessions: Session[]): GroupedSessions[] {
  const map = new Map<string, Session[]>();

  for (const session of sessions) {
    const date = new Date(session.started_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (isSameDay(date, today)) {
      label = 'Today';
    } else if (isSameDay(date, yesterday)) {
      label = 'Yesterday';
    } else {
      label = format(date, 'EEEE, MMMM d, yyyy');
    }

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(session);
  }

  return Array.from(map.entries()).map(([dateLabel, sessions]) => ({ dateLabel, sessions }));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
