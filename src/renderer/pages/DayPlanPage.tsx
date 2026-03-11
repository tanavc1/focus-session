import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X, Target, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../store/useStore';
import type { DayGoal } from '../../shared/types';

const FOCUS_PRESETS = [
  { label: '2 h', minutes: 120 },
  { label: '3 h', minutes: 180 },
  { label: '4 h', minutes: 240 },
  { label: '6 h', minutes: 360 },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDateIso(which: 'today' | 'tomorrow'): string {
  return which === 'today' ? todayIso() : tomorrowIso();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DayPlanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { todayPlan, todayStats, setTodayPlan, refreshToday } = useAppStore();

  const [planDate, setPlanDate] = useState<'today' | 'tomorrow'>('today');
  const [goals, setGoals]               = useState<DayGoal[]>([]);
  const [targetMinutes, setTargetMinutes] = useState(240);
  const [intention, setIntention]       = useState('');
  const [newGoalText, setNewGoalText]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [planId, setPlanId]             = useState<string | undefined>(undefined);

  // Set planDate based on URL param
  useEffect(() => {
    if (searchParams.get('date') === 'tomorrow') setPlanDate('tomorrow');
  }, [searchParams]);

  // Load plan when today's plan loads (for today view)
  useEffect(() => {
    if (planDate === 'today' && todayPlan) {
      setGoals(todayPlan.goals);
      setTargetMinutes(todayPlan.target_focus_minutes);
      setIntention(todayPlan.morning_intention ?? '');
      setPlanId(todayPlan.id);
    }
  }, [todayPlan, planDate]);

  // Load plan whenever planDate changes
  useEffect(() => {
    const date = getDateIso(planDate);
    window.api.getDayPlan(date).then((res) => {
      if (res.success && res.data) {
        setGoals(res.data.goals);
        setTargetMinutes(res.data.target_focus_minutes);
        setIntention(res.data.morning_intention ?? '');
        setPlanId(res.data.id);
      } else {
        setGoals([]);
        setTargetMinutes(120);
        setIntention('');
        setPlanId(undefined);
      }
    });
    // Reset saved state when switching dates
    setSaved(false);
  }, [planDate]);

  function addGoal() {
    const text = newGoalText.trim();
    if (!text) return;
    setGoals((prev) => [...prev, { id: uuidv4(), text, completed: false }]);
    setNewGoalText('');
  }

  function removeGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') addGoal();
  }

  async function save() {
    if (goals.length === 0) return;
    setSaving(true);
    try {
      const date = getDateIso(planDate);
      const res = await window.api.setDayPlan({
        id:                    planId ?? uuidv4(),
        date,
        goals,
        target_focus_minutes:  targetMinutes,
        morning_intention:     intention || undefined,
      });
      if (res.success && res.data) {
        if (planDate === 'today') {
          setTodayPlan(res.data);
          await refreshToday();
        }
        setSaved(true);
        setTimeout(() => navigate('/'), 800);
      }
    } finally {
      setSaving(false);
    }
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  return (
    <div className="min-h-full flex flex-col p-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-slate-500 text-sm font-medium mb-1">
          {planDate === 'tomorrow'
            ? new Date(tomorrowIso() + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-2xl font-bold text-slate-100">
          {planDate === 'tomorrow' ? 'Plan tomorrow' : greeting() + '.'}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {planDate === 'tomorrow' ? 'Set goals before tomorrow starts.' : 'What do you want to accomplish today?'}
        </p>
      </div>

      {/* Date toggle */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 mb-6">
        <button
          onClick={() => setPlanDate('today')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
            planDate === 'today' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setPlanDate('tomorrow')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
            planDate === 'tomorrow' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Tomorrow
        </button>
      </div>

      {/* Yesterday's recap */}
      {planDate === 'today' && todayStats && todayStats.session_count === 0 && (
        <YesterdayRecap date={yesterdayIso} />
      )}

      {/* Goals */}
      <div className="space-y-3 mb-6">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Target size={12} />
          {planDate === 'tomorrow' ? "Tomorrow's goals" : "Today's goals"}
        </label>

        {goals.map((goal, i) => (
          <div
            key={goal.id}
            className="flex items-center gap-3 p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl group"
          >
            <span className="text-xs text-slate-600 font-mono w-4">{i + 1}</span>
            <span className="flex-1 text-sm text-slate-200">{goal.text}</span>
            <button
              onClick={() => removeGoal(goal.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Add goal input */}
        {goals.length < 5 && (
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={goals.length === 0 ? 'e.g. Finish the auth feature' : 'Add another goal…'}
              value={newGoalText}
              onChange={(e) => setNewGoalText(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus={goals.length === 0}
            />
            <button
              onClick={addGoal}
              disabled={!newGoalText.trim()}
              className="btn-secondary px-3 disabled:opacity-40"
            >
              <Plus size={16} />
            </button>
          </div>
        )}

        {goals.length === 5 && (
          <p className="text-xs text-slate-500 italic">5 goals max — keep it focused.</p>
        )}
      </div>

      {/* Focus target */}
      <div className="mb-6">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
          <Clock size={12} />
          Daily focus target
        </label>
        <div className="flex gap-2">
          {FOCUS_PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => setTargetMinutes(p.minutes)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                targetMinutes === p.minutes
                  ? 'bg-brand-600 text-white border border-brand-500'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intention (optional) */}
      <div className="mb-8">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
          One word or phrase to keep in mind <span className="text-slate-600 normal-case font-normal">(optional)</span>
        </label>
        <input
          className="input"
          placeholder="e.g. Ship it. Deep work. Stay calm."
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          maxLength={60}
        />
      </div>

      {/* CTA */}
      <button
        onClick={save}
        disabled={goals.length === 0 || saving || saved}
        className="btn-primary justify-center py-3 text-base font-semibold"
      >
        {saved ? (
          <><CheckCircle size={18} /> Plan saved</>
        ) : saving ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
        ) : (
          <>{planDate === 'tomorrow' ? 'Save tomorrow\'s plan' : 'Start your day'} <ChevronRight size={18} /></>
        )}
      </button>

      <button
        onClick={() => navigate('/')}
        className="text-xs text-slate-600 hover:text-slate-400 text-center mt-4 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Yesterday's recap mini-card ──────────────────────────────────────────────

function YesterdayRecap({ date }: { date: string }) {
  const [stats, setStats] = useState<{ focus_seconds: number; focus_score: number } | null>(null);

  useEffect(() => {
    window.api.getDayStats(date).then((res) => {
      if (res.success && res.data && res.data.session_count > 0) {
        setStats({ focus_seconds: res.data.focus_seconds, focus_score: res.data.focus_score });
      }
    });
  }, [date]);

  if (!stats) return null;

  return (
    <div className="mb-6 p-3 bg-slate-800/40 border border-slate-700/30 rounded-xl flex items-center gap-4">
      <div>
        <p className="text-xs text-slate-500 mb-0.5">Yesterday</p>
        <p className="text-sm font-semibold text-slate-300">
          {formatFocusTime(stats.focus_seconds)} focused · Score {stats.focus_score}
        </p>
      </div>
      <div
        className={`ml-auto text-2xl font-bold tabular-nums ${
          stats.focus_score >= 75 ? 'score-high' : stats.focus_score >= 50 ? 'score-medium' : 'score-low'
        }`}
      >
        {stats.focus_score}
      </div>
    </div>
  );
}

function formatFocusTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}
