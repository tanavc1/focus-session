import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Target, Clock, ChevronLeft, Play } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { useSessionControl } from '../hooks/useSession';
import { format } from 'date-fns';

const DURATION_PRESETS = [
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '1h',  minutes: 60 },
  { label: '90m', minutes: 90 },
  { label: 'Open', minutes: 0 },
];

export default function NewSessionPage() {
  const navigate        = useNavigate();
  const [params]        = useSearchParams();
  const { todayPlan, activeSession }    = useAppStore();
  const { startSession, quickStartSession } = useSessionControl();

  const goals = todayPlan?.goals.filter((g) => !g.completed) ?? [];
  const preselectedGoal = params.get('goal') ?? '';

  const [title,          setTitle]       = useState('');
  const [selectedGoalId, setGoalId]      = useState<string | null>(null);
  const [duration,       setDuration]    = useState(0);
  const [starting,       setStarting]    = useState(false);
  const [quickStarting,  setQuickStarting] = useState(false);

  // Pre-fill title from URL param or first unfinished goal
  useEffect(() => {
    if (preselectedGoal) {
      setTitle(preselectedGoal);
      const match = goals.find((g) => g.text === preselectedGoal);
      if (match) setGoalId(match.id);
    } else if (goals.length > 0 && !title) {
      setGoalId(goals[0].id);
      setTitle(goals[0].text.slice(0, 60));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync title when goal selection changes
  function handleGoalSelect(id: string | null) {
    setGoalId(id);
    if (id) {
      const g = goals.find((g) => g.id === id);
      if (g) setTitle(g.text.slice(0, 60));
    }
  }

  async function handleStart() {
    if (!title.trim()) return;
    setStarting(true);
    try {
      const goal = selectedGoalId
        ? goals.find((g) => g.id === selectedGoalId)?.text ?? title
        : title;
      await startSession(title.trim(), goal, duration || undefined);
    } catch {
      setStarting(false);
    }
  }

  async function handleQuickStart() {
    setQuickStarting(true);
    try {
      await quickStartSession();
    } catch {
      setQuickStarting(false);
    }
  }

  // If a session is already active, redirect there
  useEffect(() => {
    if (activeSession) navigate('/session/active');
  }, [activeSession, navigate]);

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-4 transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-bold text-slate-100">New Session</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {format(new Date(), 'EEEE, MMM d · h:mm a')}
        </p>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label className="label">What are you working on?</label>
        <input
          className="input text-base"
          placeholder="e.g. Finish the auth feature"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          autoFocus
          maxLength={80}
        />
      </div>

      {/* Goal picker */}
      {goals.length > 0 && (
        <div className="space-y-2">
          <label className="label flex items-center gap-1.5">
            <Target size={11} /> Link to a goal
          </label>
          <div className="space-y-1.5">
            <button
              onClick={() => setGoalId(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                selectedGoalId === null
                  ? 'bg-brand-900/30 border-brand-700/50 text-brand-300'
                  : 'bg-slate-800/50 border-slate-700/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              No specific goal
            </button>
            {goals.map((g) => (
              <button
                key={g.id}
                onClick={() => handleGoalSelect(g.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                  selectedGoalId === g.id
                    ? 'bg-brand-900/30 border-brand-700/50 text-brand-300'
                    : 'bg-slate-800/50 border-slate-700/40 text-slate-300 hover:border-slate-600'
                }`}
              >
                {g.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="space-y-2">
        <label className="label flex items-center gap-1.5">
          <Clock size={11} /> Target duration
        </label>
        <div className="flex gap-2">
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => setDuration(p.minutes)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                duration === p.minutes
                  ? 'bg-brand-600 text-white border border-brand-500'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Start */}
      <button
        onClick={handleStart}
        disabled={!title.trim() || starting}
        className="btn-primary w-full justify-center py-3 text-base"
      >
        {starting ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
        {starting ? 'Starting…' : 'Start Session'}
      </button>

      {/* Divider + Quick Start */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600">or</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      <button
        onClick={handleQuickStart}
        disabled={quickStarting}
        className="btn-secondary w-full justify-center py-2.5"
      >
        {quickStarting ? (
          <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
        ) : (
          <Zap size={15} />
        )}
        {quickStarting ? 'Starting…' : 'Quick Start — no setup'}
      </button>
      <p className="text-xs text-slate-600 text-center -mt-3">
        Tracks everything automatically, no goal needed
      </p>
    </div>
  );
}
