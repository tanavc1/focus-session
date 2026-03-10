import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, Zap, AlertTriangle, Bot, ChevronLeft, Lightbulb,
  EyeOff, Eye, RefreshCw, Flame, TrendingUp, Target, Camera,
  Monitor, CheckCircle, ChevronRight, BarChart2,
} from 'lucide-react';
import { format } from 'date-fns';
import ActivityTimeline from '../components/ActivityTimeline';
import { useAppStore } from '../store/useStore';
import type { SessionReport, FlowPeriod } from '../../shared/types';

const CLASS_COLORS: Record<string, string> = {
  productive:  '#22c55e',
  distracting: '#ef4444',
  neutral:     '#64748b',
  idle:        '#334155',
  unknown:     '#475569',
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { todayPlan } = useAppStore();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadReport(id, false);
  }, [id]);

  async function loadReport(sessionId: string, forceRefresh: boolean) {
    if (forceRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    const res = await window.api.getSessionReport(sessionId, forceRefresh);
    if (res.success && res.data) {
      setReport(res.data);
      setExcluded(!!res.data.session.excluded);
    } else {
      setError(res.error ?? 'Failed to load report');
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }

  async function handleToggleExcluded() {
    if (!id || !report) return;
    const newExcluded = !excluded;
    const res = await window.api.toggleSessionExcluded(id, newExcluded);
    if (res.success) {
      setExcluded(newExcluded);
      setReport((r) => r ? { ...r, session: { ...r.session, excluded: newExcluded ? 1 : 0 } } : r);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full gap-4">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Generating report…</p>
        <p className="text-slate-600 text-xs">AI analysis may take up to 30s on first load.</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-slate-300">{error ?? 'Report not found'}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  const focusScore = computeFocusScore(report);
  const isQuickSession = report.session.goal === 'Open session — capturing all activity';
  const flowPeriods: FlowPeriod[] = report.flow_periods ?? [];
  const flowSecs = report.flow_seconds ?? 0;
  const nextGoals = todayPlan?.goals.filter((g) => !g.completed) ?? [];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 pb-12">

      {/* Back + Header */}
      <div>
        <button
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-4 transition-colors"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div className="flex items-start gap-4">
          {/* Score ring */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(${scoreColor(focusScore)} ${focusScore}%, rgb(30,41,59) 0)`,
              }}
            >
              <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center">
                <span className="text-sm font-bold text-slate-100 tabular-nums">{focusScore}</span>
              </div>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Score</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-100">{report.session.title}</h1>
              {excluded && (
                <span className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/30 rounded-full">
                  Excluded
                </span>
              )}
            </div>
            {!isQuickSession && (
              <p className="text-slate-400 text-sm mt-0.5">{report.session.goal}</p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              {format(new Date(report.session.started_at), 'EEEE, MMM d · h:mm a')}
              {report.session.ended_at && (
                <> — {format(new Date(report.session.ended_at), 'h:mm a')}</>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={handleToggleExcluded}
              className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                excluded
                  ? 'text-amber-400 hover:text-amber-300 bg-amber-900/20 border border-amber-700/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
              }`}
            >
              {excluded ? <Eye size={13} /> : <EyeOff size={13} />}
              {excluded ? 'Include' : 'Exclude'}
            </button>
            <button
              onClick={() => loadReport(id!, true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors text-xs flex items-center gap-1"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing…' : 'Refresh AI'}
            </button>
          </div>
        </div>
      </div>

      {/* 4 Hero stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <HeroStat
          label="Focused"
          value={fmt(report.focused_seconds)}
          sub={`${pct(report.focused_seconds, report.total_duration_seconds)}% of session`}
          icon={<Zap size={15} />}
          color="text-green-400"
          bg="bg-green-900/20 border-green-800/30"
        />
        <HeroStat
          label="Flow time"
          value={flowSecs > 0 ? fmt(flowSecs) : '—'}
          sub={flowSecs > 0 ? `${flowPeriods.length} flow period${flowPeriods.length !== 1 ? 's' : ''}` : 'No flow state reached'}
          icon={<Flame size={15} />}
          color={flowSecs > 0 ? 'text-amber-400' : 'text-slate-500'}
          bg={flowSecs > 0 ? 'bg-amber-900/20 border-amber-800/30' : 'bg-slate-800/50 border-slate-700/30'}
        />
        <HeroStat
          label="Time lost"
          value={report.distracted_seconds > 0 ? fmt(report.distracted_seconds) : '—'}
          sub={report.distracted_seconds > 0
            ? `${pct(report.distracted_seconds, report.total_duration_seconds)}% distracted`
            : 'Clean session'}
          icon={<AlertTriangle size={15} />}
          color={report.distracted_seconds > 0 ? 'text-red-400' : 'text-slate-500'}
          bg={report.distracted_seconds > 0 ? 'bg-red-900/20 border-red-800/30' : 'bg-slate-800/50 border-slate-700/30'}
        />
        <HeroStat
          label="Duration"
          value={fmt(report.total_duration_seconds)}
          sub={`${report.context_switch_count} context switches`}
          icon={<Clock size={15} />}
          color="text-brand-400"
          bg="bg-slate-800/50 border-slate-700/30"
        />
      </div>

      {/* Flow periods */}
      {flowPeriods.length > 0 && (
        <div className="card border-amber-800/30 bg-amber-950/10">
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Flame size={12} /> Flow Periods
          </h3>
          <div className="space-y-2">
            {flowPeriods.map((fp, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-2 bg-amber-900/10 border border-amber-800/20 rounded-lg">
                <Flame size={12} className="text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300 font-mono">
                  {format(new Date(fp.started_at), 'h:mm a')}
                </span>
                <span className="text-xs text-slate-500">for</span>
                <span className="text-xs font-semibold text-amber-300">{fmt(fp.duration_seconds)}</span>
                <span className="text-xs text-slate-600 ml-auto">unbroken focus</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600/70 mt-2.5">
            Flow = 25+ minutes of uninterrupted productive focus
          </p>
        </div>
      )}

      {/* Timeline */}
      {report.activity_blocks.length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart2 size={12} /> Activity Timeline
          </h3>
          <ActivityTimeline
            blocks={report.activity_blocks}
            sessionStartedAt={report.session.started_at}
            sessionEndedAt={report.session.ended_at ?? Date.now()}
          />
          {/* Legend */}
          <div className="flex items-center gap-4 pt-1">
            {(['productive', 'distracting', 'neutral', 'idle'] as const).map((cls) => (
              <div key={cls} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <div className="w-2 h-2 rounded-sm" style={{ background: CLASS_COLORS[cls] }} />
                {cls.charAt(0).toUpperCase() + cls.slice(1)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top apps */}
      {report.top_apps.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Monitor size={12} /> Top Apps
          </h3>
          <div className="space-y-2">
            {report.top_apps.slice(0, 6).map((app, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-4 tabular-nums">{i + 1}</span>
                <span className="text-sm text-slate-300 flex-1 truncate">{app.name}</span>
                <div className="flex-1 max-w-[120px] h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(app.seconds / (report.top_apps[0]?.seconds ?? 1)) * 100}%`,
                      background: CLASS_COLORS[app.classification],
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono w-12 text-right">{fmt(app.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable distractions */}
      {report.diversion_moments.length > 0 && (
        <div className="card border-red-900/20">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <AlertTriangle size={12} /> Distractions
          </h3>
          <div className="space-y-1.5">
            {report.diversion_moments.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-2 bg-red-950/20 border border-red-900/20 rounded-lg">
                <span className="text-xs font-mono text-slate-600 w-12 flex-shrink-0">
                  {format(new Date(d.started_at), 'HH:mm')}
                </span>
                <span className="text-sm text-slate-300 flex-1 truncate">
                  {d.browser_domain ?? d.app_name ?? 'Unknown'}
                </span>
                <span className="text-xs text-red-400 font-mono flex-shrink-0">{fmt(d.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top websites */}
      {report.top_domains.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <TrendingUp size={12} /> Top Websites
          </h3>
          <div className="space-y-2">
            {report.top_domains.slice(0, 6).map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-4 tabular-nums">{i + 1}</span>
                <span className="text-sm text-slate-300 flex-1 truncate">{d.domain}</span>
                <div className="flex-1 max-w-[120px] h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(d.seconds / (report.top_domains[0]?.seconds ?? 1)) * 100}%`,
                      background: CLASS_COLORS[d.classification],
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono w-12 text-right">{fmt(d.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vision snapshots */}
      {report.vision_snapshots && report.vision_snapshots.length > 0 && (
        <div className="card border-slate-700/30">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Camera size={12} /> Vision Context
          </h3>
          <div className="space-y-2">
            {report.vision_snapshots.map((snap, i) => (
              <p key={i} className="text-xs text-slate-400 leading-relaxed">{snap}</p>
            ))}
          </div>
        </div>
      )}

      {/* AI Coaching — main value section */}
      {(report.llm_summary || report.coaching_suggestions) && (
        <div className="card border-brand-700/30 bg-brand-950/20 space-y-4">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-brand-400" />
            <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-widest">
              AI Coaching
            </h3>
            {report.ai_provider_used && (
              <span className="ml-auto text-xs text-slate-600">{report.ai_provider_used}</span>
            )}
          </div>

          {report.llm_summary && (
            <p className="text-sm text-slate-300 leading-relaxed">{report.llm_summary}</p>
          )}

          {report.coaching_suggestions && report.coaching_suggestions.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Lightbulb size={12} className="text-amber-400" />
                Actionable insights
              </p>
              {report.coaching_suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-slate-800/50 rounded-lg">
                  <span className="text-brand-400 text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-slate-300 leading-snug">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No AI note */}
      {!report.llm_summary && (
        <div className="card border-slate-700/30 text-center py-6">
          <Bot size={22} className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 mb-3">
            AI coaching not available. Configure an AI provider in{' '}
            <span className="font-mono">Settings → AI</span>.
          </p>
          <button
            onClick={() => loadReport(id!, true)}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mx-auto transition-colors"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
      )}

      {/* Next session suggestion — based on incomplete goals */}
      {nextGoals.length > 0 && (
        <div className="card border-slate-700/40">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Target size={12} /> Up Next
          </h3>
          <p className="text-xs text-slate-500 mb-2">Remaining goals for today:</p>
          <div className="space-y-1.5 mb-4">
            {nextGoals.map((g) => (
              <div key={g.id} className="flex items-center gap-2">
                <CheckCircle size={13} className="text-slate-700" />
                <span className="text-sm text-slate-300">{g.text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/')}
            className="btn-primary w-full justify-center py-2.5"
          >
            Start next session <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="btn-secondary flex-1 justify-center">
          Today
        </button>
        <button onClick={() => navigate('/journey')} className="btn-secondary flex-1 justify-center">
          Journey
        </button>
      </div>
    </div>
  );
}

// ─── Hero stat card ────────────────────────────────────────────────────────────

function HeroStat({
  label, value, sub, icon, color, bg,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-1 ${bg}`}>
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function computeFocusScore(report: SessionReport): number {
  const { total_duration_seconds, focused_seconds, distracted_seconds, idle_seconds } = report;
  const active = total_duration_seconds - idle_seconds;
  if (active === 0) return 0;
  const raw = ((focused_seconds - distracted_seconds * 0.5) / active) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}
