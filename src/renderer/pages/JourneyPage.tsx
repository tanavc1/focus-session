import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, TrendingUp, TrendingDown, Zap, Clock, Trophy, ChevronRight } from 'lucide-react';
import type { WeekStats, DayStats, Session } from '../../shared/types';
import { useAppStore } from '../store/useStore';

function fmt(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  if (score > 0)   return 'bg-red-500';
  return 'bg-slate-700';
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function JourneyPage() {
  const navigate = useNavigate();
  const { streak } = useAppStore();
  const [weekStats, setWeekStats]             = useState<WeekStats | null>(null);
  const [topApps, setTopApps]                 = useState<{ name: string; seconds: number }[]>([]);
  const [topDistractions, setTopDistractions] = useState<{ name: string; seconds: number }[]>([]);
  const [recentSessions, setRecentSessions]   = useState<Session[]>([]);
  const [loading, setLoading]                 = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      window.api.getWeekStats(today),
      window.api.getTopApps(30),
      window.api.getTopDistractions(30),
      window.api.listSessions(),
    ]).then(([weekRes, appsRes, distRes, sessRes]) => {
      if (weekRes.success && weekRes.data)        setWeekStats(weekRes.data);
      if (appsRes.success && appsRes.data)        setTopApps(appsRes.data);
      if (distRes.success && distRes.data)        setTopDistractions(distRes.data);
      if (sessRes.success && sessRes.data)        setRecentSessions(sessRes.data.slice(0, 12));
    }).catch((err) => {
      console.error('[JourneyPage] Failed to load stats:', err);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const thisWeekFocus = weekStats?.total_focus_seconds ?? 0;
  const prevWeekFocus = weekStats?.prev_week_focus_seconds ?? 0;
  const weekDelta     = thisWeekFocus - prevWeekFocus;
  const weekDays      = weekStats?.days ?? [];

  // Get ISO weekday index (Mon=0…Sun=6) aligned to our 7-day array
  function getDayLabel(day: DayStats): string {
    const d = new Date(day.date + 'T12:00:00');
    return DAY_LABELS[((d.getDay() + 6) % 7)]; // JS getDay: 0=Sun
  }

  const maxScore = Math.max(...weekDays.map((d) => d.focus_score), 1);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Your Journey</h1>
        <p className="text-sm text-slate-500 mt-0.5">Growth over time. Patterns, peaks, and progress.</p>
      </div>

      {/* Streak + weekly hero */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak */}
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-orange-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wide">Streak</span>
          </div>
          <p className="text-3xl font-bold text-orange-400 tabular-nums mt-1">
            {streak?.current_streak ?? 0}
            <span className="text-sm font-normal text-slate-500 ml-1">days</span>
          </p>
          {streak && streak.longest_streak > 0 && (
            <p className="text-xs text-slate-600">Best: {streak.longest_streak} days</p>
          )}
        </div>

        {/* This week */}
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-brand-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wide">This week</span>
          </div>
          <p className="text-3xl font-bold text-slate-100 tabular-nums mt-1">
            {fmt(thisWeekFocus)}
          </p>
          {prevWeekFocus > 0 && (
            <p className={`text-xs flex items-center gap-1 ${weekDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {weekDelta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {weekDelta >= 0 ? '+' : ''}{fmt(Math.abs(weekDelta))} vs last week
            </p>
          )}
        </div>
      </div>

      {/* 7-day bar chart */}
      {weekDays.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Focus score — past 7 days
          </h3>
          <div className="flex items-end gap-1.5 h-24">
            {weekDays.map((day) => {
              const heightPct = maxScore > 0 ? (day.focus_score / maxScore) * 100 : 0;
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                    <div
                      className={`w-full rounded-t-md transition-all ${scoreBg(day.focus_score)} ${isToday ? 'opacity-100' : 'opacity-70'}`}
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${isToday ? 'text-brand-400' : 'text-slate-600'}`}>
                    {getDayLabel(day)}
                  </span>
                  {day.focus_score > 0 && (
                    <span className={`text-[9px] tabular-nums ${scoreColor(day.focus_score)}`}>
                      {day.focus_score}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {weekStats && weekStats.avg_focus_score > 0 && (
            <p className="text-xs text-slate-500 mt-3 text-center">
              Weekly avg score: <span className={`font-semibold ${scoreColor(weekStats.avg_focus_score)}`}>
                {weekStats.avg_focus_score}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Top productive apps + top distractions */}
      {(topApps.length > 0 || topDistractions.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {topApps.length > 0 && (
            <div className="card space-y-2">
              <h3 className="text-xs font-semibold text-green-500 uppercase tracking-widest flex items-center gap-1.5">
                <Zap size={11} /> Focus tools (30d)
              </h3>
              {topApps.slice(0, 5).map((app, i) => (
                <div key={app.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-700 w-3 tabular-nums">{i + 1}</span>
                  <span className="text-xs text-slate-300 flex-1 truncate">{app.name}</span>
                  <span className="text-xs text-slate-500">{fmt(app.seconds)}</span>
                </div>
              ))}
            </div>
          )}

          {topDistractions.length > 0 && (
            <div className="card space-y-2">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                <Flame size={11} /> Time sinks (30d)
              </h3>
              {topDistractions.slice(0, 5).map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-700 w-3 tabular-nums">{i + 1}</span>
                  <span className="text-xs text-slate-300 flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-red-500">{fmt(d.seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Personal bests */}
      {streak && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Trophy size={12} /> Personal bests
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-500">Longest streak</span>
              <span className="text-lg font-bold text-orange-400">{streak.longest_streak} <span className="text-sm font-normal text-slate-500">days</span></span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-500">Total focused days</span>
              <span className="text-lg font-bold text-brand-400">{streak.total_focused_days}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Recent sessions
          </h3>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <RecentSessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {recentSessions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-600 text-sm">No sessions yet.</p>
          <p className="text-slate-700 text-xs mt-1">Complete a session to start your journey.</p>
        </div>
      )}
    </div>
  );
}

// ─── Recent session row ───────────────────────────────────────────────────────

function RecentSessionRow({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (session.report_json) {
      try {
        const r = JSON.parse(session.report_json);
        const active = (r.focused_seconds ?? 0) + (r.distracted_seconds ?? 0);
        if (active > 0) {
          setScore(Math.round(Math.max(0, Math.min(100,
            ((r.focused_seconds - r.distracted_seconds * 0.5) / active) * 100
          ))));
        }
      } catch { /* ignore */ }
    }
  }, [session]);

  const dur = session.ended_at
    ? Math.round((session.ended_at - session.started_at) / 1000) : 0;

  const dateStr = new Date(session.started_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
  const timeStr = new Date(session.started_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <button
      onClick={() => navigate(`/session/${session.id}/report`)}
      className="w-full flex items-center gap-3 p-3 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/20 rounded-xl transition-colors text-left"
    >
      {score !== null && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold tabular-nums ${
          score >= 75 ? 'bg-green-900/60 text-green-400' : score >= 50 ? 'bg-amber-900/60 text-amber-400' : 'bg-red-900/40 text-red-400'
        }`}>
          {score}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{session.title}</p>
        <p className="text-xs text-slate-600">{dateStr} · {timeStr} · {fmt(dur)}</p>
      </div>
      <ChevronRight size={14} className="text-slate-700 flex-shrink-0" />
    </button>
  );
}
