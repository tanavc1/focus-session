import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Target, Flame, TrendingUp, Clock, Plus,
  CheckCircle, Circle, ChevronRight, Play, BarChart2,
  BookOpen, Sparkles, ArrowRight, X,
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

const DURATION_PRESETS = [
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '1h',  minutes: 60 },
  { label: '90m', minutes: 90 },
  { label: 'Open', minutes: 0 },
];

export default function TodayPage() {
  const navigate = useNavigate();
  const { todayPlan, todayStats, streak, activeSession, settings, refreshToday, setTodayPlan } = useAppStore();
  const { quickStartSession, startSession } = useSessionControl();
  const [quickStarting, setQuickStarting] = useState(false);
  const [goalUpdating, setGoalUpdating] = useState<string | null>(null);

  // Focused start state
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [focusTitle, setFocusTitle] = useState('');
  const [focusGoal, setFocusGoal] = useState('');
  const [focusDuration, setFocusDuration] = useState(0);
  const [focusStarting, setFocusStarting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if (!activeSession) refreshToday();
  }, [activeSession, refreshToday]);

  useEffect(() => {
    if (focusedOpen && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [focusedOpen]);

  const hasPlan   = !!todayPlan;
  const goals     = todayPlan?.goals ?? [];
  // Use per-day target from plan, fallback to settings daily target, fallback to 2h
  const targetMin = todayPlan?.target_focus_minutes ?? settings?.daily_focus_target_minutes ?? 120;
  const targetSec = targetMin * 60;
  const focusSec  = todayStats?.focus_seconds ?? 0;
  const progressPct = Math.min(100, Math.round((focusSec / Math.max(1, targetSec)) * 100));
  const todayScore  = todayStats?.focus_score ?? 0;
  const todaySessions = todayStats?.sessions ?? [];

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

  async function handleFocusedStart(e?: React.FormEvent) {
    e?.preventDefault();
    if (!focusTitle.trim()) return;
    setFocusStarting(true);
    try {
      await startSession(focusTitle.trim(), focusGoal.trim() || focusTitle.trim(), focusDuration || undefined);
    } catch {
      setFocusStarting(false);
    }
  }

  function startWithGoal(goal: DayGoal) {
    navigate(`/session/new?goal=${encodeURIComponent(goal.text)}`);
  }

  // Motivational insight based on today's stats
  function getTodayInsight(): string | null {
    if (!todayStats || todayStats.session_count === 0) return null;
    const focusMin = Math.round(focusSec / 60);
    const targetMinLeft = Math.max(0, targetMin - focusMin);
    if (progressPct >= 100) return `🎉 Daily target hit! ${fmt(focusSec)} focused today.`;
    if (todayStats.flow_seconds > 0) return `🔥 ${fmt(todayStats.flow_seconds)} in flow today — keep it going.`;
    if (targetMinLeft > 0 && focusSec > 0) return `${targetMinLeft}m left to hit your daily goal.`;
    return null;
  }

  const insight = getTodayInsight();

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
        {streak && streak.current_streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-950/40 border border-orange-900/30 rounded-xl">
            <Flame size={14} className="text-orange-400" />
            <span className="text-sm font-bold text-orange-300">{streak.current_streak}</span>
            <span className="text-xs text-orange-500">day streak</span>
          </div>
        )}
      </div>

      {/* Progress card */}
      {(hasPlan || focusSec > 0) && (
        <div className="card flex items-center gap-6">
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

      {/* Motivational insight */}
      {insight && (
        <div className="px-4 py-2.5 bg-slate-800/60 border border-slate-700/40 rounded-xl">
          <p className="text-sm text-slate-300">{insight}</p>
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

      {/* ── START SESSION ─────────────────────────────────────────────────────── */}
      {!activeSession && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Start a session</h3>

          {/* Quick Start */}
          <button
            onClick={handleQuickStart}
            disabled={quickStarting}
            className="w-full flex items-center gap-4 p-4 bg-slate-800/60 border border-slate-700/40 hover:border-brand-700/60 hover:bg-slate-800 rounded-2xl transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-900/60 border border-brand-700/40 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-800/60 transition-colors">
              {quickStarting
                ? <span className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                : <Zap size={18} className="text-brand-400" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">{quickStarting ? 'Starting…' : 'Quick Start'}</p>
              <p className="text-xs text-slate-500 mt-0.5">No setup — just start. Captures everything.</p>
            </div>
            <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
          </button>

          {/* Focused Start */}
          <div className={`border rounded-2xl transition-all ${focusedOpen ? 'border-brand-700/60 bg-slate-800/80' : 'border-slate-700/40 bg-slate-800/60 hover:border-slate-600'}`}>
            {!focusedOpen ? (
              <button
                onClick={() => setFocusedOpen(true)}
                className="w-full flex items-center gap-4 p-4 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700/60 border border-slate-600/40 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-700 transition-colors">
                  <Target size={18} className="text-slate-300" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-200">Focused Start</p>
                  <p className="text-xs text-slate-500 mt-0.5">Set a goal before you dive in.</p>
                </div>
                <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </button>
            ) : (
              <form onSubmit={handleFocusedStart} className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-brand-400" />
                    <span className="text-sm font-semibold text-slate-200">Focused Start</span>
                  </div>
                  <button type="button" onClick={() => { setFocusedOpen(false); setFocusTitle(''); setFocusGoal(''); }} className="text-slate-600 hover:text-slate-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>

                <input
                  ref={titleRef}
                  className="input text-sm"
                  placeholder="What are you working on? (e.g. Finish landing page)"
                  value={focusTitle}
                  onChange={(e) => setFocusTitle(e.target.value)}
                  maxLength={80}
                />

                <textarea
                  className="input text-sm resize-none"
                  placeholder="Goal or notes (optional — e.g. Complete hero section, write copy)"
                  value={focusGoal}
                  onChange={(e) => setFocusGoal(e.target.value)}
                  rows={2}
                  maxLength={200}
                />

                {/* Duration */}
                <div className="flex gap-2">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.minutes}
                      type="button"
                      onClick={() => setFocusDuration(p.minutes)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        focusDuration === p.minutes
                          ? 'bg-brand-600 text-white border border-brand-500'
                          : 'bg-slate-700/60 text-slate-400 border border-slate-600/40 hover:border-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!focusTitle.trim() || focusStarting}
                  className="btn-primary w-full justify-center py-2.5"
                >
                  {focusStarting
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Play size={14} fill="currentColor" />}
                  {focusStarting ? 'Starting…' : 'Begin Session'}
                </button>
              </form>
            )}
          </div>

          {/* Day Plan Goals */}
          {hasPlan && goals.filter(g => !g.completed).length > 0 ? (
            <div className="card space-y-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={12} className="text-slate-500" />
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">From today's plan</h3>
                </div>
                <button onClick={() => navigate('/plan')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                  Edit plan
                </button>
              </div>
              {goals.filter(g => !g.completed).map((goal) => (
                <div key={goal.id} className="flex items-center gap-3 py-1.5 group rounded-lg hover:bg-slate-700/20 px-1 -mx-1 transition-colors">
                  <Circle size={16} className="text-slate-600 group-hover:text-slate-500 flex-shrink-0" />
                  <span className="flex-1 text-sm text-slate-200 truncate">{goal.text}</span>
                  <button
                    onClick={() => startWithGoal(goal)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-all flex-shrink-0"
                  >
                    <Play size={10} fill="currentColor" /> Start
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={() => navigate('/plan')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/40 border border-slate-700/30 border-dashed hover:border-slate-600 rounded-2xl transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700/40 flex items-center justify-center flex-shrink-0">
                <Plus size={18} className="text-slate-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-400">Plan your day</p>
                <p className="text-xs text-slate-600 mt-0.5">Set goals and a focus target for today.</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Completed goals */}
      {hasPlan && goals.filter(g => g.completed).length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
            <CheckCircle size={11} /> Completed
          </h3>
          {goals.filter(g => g.completed).map((goal) => (
            <div key={goal.id} className="flex items-center gap-3 py-1.5 group px-1">
              <button onClick={() => toggleGoal(goal)} disabled={goalUpdating === goal.id} className="flex-shrink-0">
                <CheckCircle size={16} className="text-green-500" />
              </button>
              <span className="flex-1 text-sm text-slate-600 line-through truncate">{goal.text}</span>
            </div>
          ))}
        </div>
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

      {/* Empty state */}
      {!hasPlan && todaySessions.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Sparkles size={28} className="text-slate-700 mx-auto" />
          <p className="text-slate-500 text-sm font-medium">Ready to focus?</p>
          <p className="text-slate-700 text-xs">Start a session above or plan your day.</p>
        </div>
      )}
    </div>
  );
}

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
