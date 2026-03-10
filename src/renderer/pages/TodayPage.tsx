import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Target, Flame, TrendingUp, Clock, Plus,
  CheckCircle, Circle, ChevronRight, Play, BarChart2,
} from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { useSessionControl } from '../hooks/useSession';
import type { DayGoal, Session } from '../../shared/types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function greetingForTime(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

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

export default function TodayPage() {
  const navigate = useNavigate();
  const { todayPlan, todayStats, streak, activeSession, refreshToday, setTodayPlan } = useAppStore();
  const { quickStartSession } = useSessionControl();
  const [quickStarting, setQuickStarting] = useState(false);
  const [goalUpdating, setGoalUpdating] = useState<string | null>(null);

  // Refresh today's data when landing on this page
  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  // Also refresh when a session just ended (activeSession goes null)
  useEffect(() => {
    if (!activeSession) refreshToday();
  }, [activeSession, refreshToday]);

  const hasPlan     = !!todayPlan;
  const goals       = todayPlan?.goals ?? [];
  const targetSec   = (todayPlan?.target_focus_minutes ?? 240) * 60;
  const focusSec    = todayStats?.focus_seconds ?? 0;
  const progressPct = Math.min(100, Math.round((focusSec / targetSec) * 100));
  const todayScore  = todayStats?.focus_score ?? 0;
  const todaySessions = todayStats?.sessions ?? [];
  const nextGoal    = goals.find((g) => !g.completed);

  const toggleGoal = useCallback(async (goal: DayGoal) => {
    if (!todayPlan) return;
    setGoalUpdating(goal.id);
    const updated = goals.map((g) => g.id === goal.id ? { ...g, completed: !g.completed } : g);
    const res = await window.api.setDayPlan({
      id:                   todayPlan.id,
      date:                 todayIso(),
      goals:                updated,
      target_focus_minutes: todayPlan.target_focus_minutes,
      morning_intention:    todayPlan.morning_intention,
    });
    if (res.success && res.data) setTodayPlan(res.data);
    setGoalUpdating(null);
  }, [todayPlan, goals, setTodayPlan]);

  async function handleQuickStart() {
    setQuickStarting(true);
    try { await quickStartSession(); }
    catch { setQuickStarting(false); }
  }

  async function startWithGoal(goal: DayGoal) {
    navigate(`/session/new?goal=${encodeURIComponent(goal.text)}`);
  }

  const showMorningBrief = !hasPlan && (todayStats?.session_count ?? 0) === 0;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-xl font-bold text-slate-100 mt-0.5">{greetingForTime()}</h1>
          {todayPlan?.morning_intention && (
            <p className="text-sm text-slate-500 italic mt-0.5">"{todayPlan.morning_intention}"</p>
          )}
        </div>
        {/* Streak */}
        {streak && streak.current_streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-950/40 border border-orange-900/30 rounded-xl">
            <Flame size={14} className="text-orange-400" />
            <span className="text-sm font-bold text-orange-300">{streak.current_streak}</span>
            <span className="text-xs text-orange-500">day streak</span>
          </div>
        )}
      </div>

      {/* Morning brief CTA — shown only when no plan AND no sessions yet */}
      {showMorningBrief && (
        <div
          className="card border-brand-700/40 bg-brand-950/20 flex items-center gap-4 cursor-pointer hover:bg-brand-950/30 transition-colors"
          onClick={() => navigate('/plan')}
        >
          <div className="w-10 h-10 rounded-xl bg-brand-900/60 flex items-center justify-center flex-shrink-0">
            <Target size={18} className="text-brand-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-200">Plan your day</p>
            <p className="text-xs text-slate-500 mt-0.5">Set goals and a focus target for today</p>
          </div>
          <ChevronRight size={16} className="text-slate-600" />
        </div>
      )}

      {/* Progress ring + score */}
      {(hasPlan || focusSec > 0) && (
        <div className="card flex items-center gap-6">
          {/* Ring */}
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="transform -rotate-90 w-full h-full">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(30,41,59)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={progressPct >= 80 ? 'rgb(74,222,128)' : progressPct >= 40 ? 'rgb(251,191,36)' : 'rgb(99,102,241)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(progressPct / 100) * 213.6} 213.6`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-slate-200 tabular-nums">{progressPct}%</span>
              <span className="text-[9px] text-slate-500 leading-none">of goal</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Focused today</span>
              <span className="text-sm font-semibold text-slate-200">{fmt(focusSec)} / {fmt(targetSec)}</span>
            </div>
            {todayStats && todayStats.distracted_seconds > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Time lost</span>
                <span className="text-sm font-medium text-red-400">{fmt(todayStats.distracted_seconds)}</span>
              </div>
            )}
            {todayStats && todayStats.flow_seconds > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Flow time</span>
                <span className="text-sm font-medium text-amber-400">🔥 {fmt(todayStats.flow_seconds)}</span>
              </div>
            )}
            {todayStats && todayStats.session_count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Focus score</span>
                <span className={`text-sm font-bold tabular-nums ${scoreColor(todayScore)}`}>
                  {todayScore}/100
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Goals */}
      {hasPlan && goals.length > 0 && (
        <div className="card space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Target size={12} /> Today's goals
            </h3>
            <button
              onClick={() => navigate('/plan')}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Edit
            </button>
          </div>

          {goals.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center gap-3 py-2 group rounded-lg hover:bg-slate-700/20 px-1 -mx-1 transition-colors"
            >
              <button
                onClick={() => toggleGoal(goal)}
                disabled={goalUpdating === goal.id}
                className="flex-shrink-0 transition-colors"
              >
                {goal.completed
                  ? <CheckCircle size={18} className="text-green-400" />
                  : <Circle size={18} className="text-slate-600 group-hover:text-slate-500" />}
              </button>
              <span className={`flex-1 text-sm transition-colors ${
                goal.completed ? 'line-through text-slate-600' : 'text-slate-200'
              }`}>
                {goal.text}
              </span>
              {!goal.completed && !activeSession && (
                <button
                  onClick={() => startWithGoal(goal)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-all"
                >
                  <Play size={11} fill="currentColor" /> Start
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Start session */}
      {!activeSession && (
        <div className="flex gap-3">
          <button
            onClick={handleQuickStart}
            disabled={quickStarting}
            className="btn-primary flex-1 justify-center py-2.5"
          >
            {quickStarting
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Zap size={16} />}
            {quickStarting ? 'Starting…' : nextGoal ? `Work on: ${nextGoal.text.slice(0, 30)}${nextGoal.text.length > 30 ? '…' : ''}` : 'Quick Start'}
          </button>
          {hasPlan && (
            <button onClick={() => navigate('/session/new')} className="btn-secondary px-4">
              <Plus size={16} /> New
            </button>
          )}
        </div>
      )}

      {/* Active session shortcut */}
      {activeSession && (
        <button
          onClick={() => navigate('/session/active')}
          className="w-full card border-green-800/40 bg-green-950/20 flex items-center gap-3 hover:bg-green-950/30 transition-colors cursor-pointer text-left"
        >
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-slow" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-300">{activeSession.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">Session in progress — tap to view</p>
          </div>
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      )}

      {/* Today's sessions */}
      {todaySessions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BarChart2 size={12} /> Sessions today
          </h3>
          <div className="space-y-2">
            {todaySessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* No activity yet nudge */}
      {!hasPlan && (todayStats?.session_count ?? 0) === 0 && (
        <div className="text-center py-6">
          <p className="text-slate-600 text-sm">No sessions yet today.</p>
          <p className="text-slate-700 text-xs mt-1">Start a session or plan your day to get going.</p>
        </div>
      )}
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (session.report_json) {
      try {
        const r = JSON.parse(session.report_json);
        const active = (r.focused_seconds ?? 0) + (r.distracted_seconds ?? 0);
        if (active > 0) {
          const s = Math.round(Math.max(0, Math.min(100,
            ((r.focused_seconds - r.distracted_seconds * 0.5) / active) * 100
          )));
          setScore(s);
        }
      } catch { /* ignore */ }
    }
  }, [session]);

  const durationSec = session.ended_at
    ? Math.round((session.ended_at - session.started_at) / 1000)
    : 0;

  const timeStr = new Date(session.started_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <button
      onClick={() => navigate(`/session/${session.id}/report`)}
      className="w-full flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 rounded-xl transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
        <Clock size={14} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate font-medium">{session.title}</p>
        <p className="text-xs text-slate-500">{timeStr} · {fmt(durationSec)}</p>
      </div>
      {score !== null && (
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${scoreColor(score)}`}>
          {score}
        </span>
      )}
      <TrendingUp size={14} className="text-slate-700 flex-shrink-0" />
    </button>
  );
}
