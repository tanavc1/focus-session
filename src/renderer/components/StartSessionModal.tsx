import React, { useState } from 'react';
import { X, Zap, Target, Clock } from 'lucide-react';
import { useSessionControl } from '../hooks/useSession';

interface Props {
  onClose: () => void;
}

export default function StartSessionModal({ onClose }: Props) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [duration, setDuration] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startSession } = useSessionControl();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !goal.trim()) return;

    setIsStarting(true);
    setError(null);

    try {
      const targetDuration = duration ? parseInt(duration, 10) : undefined;
      await startSession(title.trim(), goal.trim(), targetDuration);
      onClose();
    } catch (err) {
      setError(String(err));
      setIsStarting(false);
    }
  };

  const DURATION_PRESETS = [25, 50, 90, 120];
  const GOAL_SUGGESTIONS = [
    'Write the first draft of the feature spec',
    'Fix the authentication bug',
    'Complete the weekly report',
    'Review and merge open PRs',
    'Deep work on algorithm design',
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 no-drag">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">Start Focus Session</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Session Title */}
          <div>
            <label className="label">Session Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep Work — Feature Development"
              className="input"
              autoFocus
              maxLength={80}
            />
          </div>

          {/* Goal */}
          <div>
            <label className="label flex items-center gap-1">
              <Target size={11} />
              Intended Goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What do you want to accomplish in this session?"
              className="input resize-none h-20"
              maxLength={300}
            />
            {/* Goal suggestions */}
            {!goal && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GOAL_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setGoal(s)}
                    className="text-xs px-2 py-1 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
                  >
                    {s.length > 35 ? s.slice(0, 35) + '…' : s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="label flex items-center gap-1">
              <Clock size={11} />
              Target Duration (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="minutes"
                className="input w-32"
                min={1}
                max={480}
              />
              <div className="flex gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(String(d))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      duration === String(d)
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isStarting || !title.trim() || !goal.trim()}
              className="btn-primary flex-1 justify-center"
            >
              {isStarting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Start Session
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
