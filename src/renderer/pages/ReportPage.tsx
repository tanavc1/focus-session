import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Clock, Zap, AlertTriangle, Coffee, ArrowLeftRight,
  TrendingUp, Bot, ChevronLeft, Lightbulb, Monitor
} from 'lucide-react';
import { format } from 'date-fns';
import StatCard from '../components/StatCard';
import ActivityTimeline from '../components/ActivityTimeline';
import type { SessionReport } from '../../shared/types';

const CLASS_COLORS = {
  productive:  '#22c55e',
  distracting: '#ef4444',
  neutral:     '#64748b',
  idle:        '#334155',
  unknown:     '#475569',
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadReport(id);
  }, [id]);

  async function loadReport(sessionId: string) {
    setIsLoading(true);
    setError(null);
    const res = await window.api.getSessionReport(sessionId);
    if (res.success && res.data) {
      setReport(res.data);
    } else {
      setError(res.error ?? 'Failed to load report');
    }
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full gap-4">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Generating report…</p>
        <p className="text-slate-600 text-xs">Running local AI analysis. This may take a moment.</p>
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
  const pieData = [
    { name: 'Focused', value: report.focused_seconds, color: CLASS_COLORS.productive },
    { name: 'Distracted', value: report.distracted_seconds, color: CLASS_COLORS.distracting },
    { name: 'Neutral', value: report.neutral_seconds, color: CLASS_COLORS.neutral },
    { name: 'Idle', value: report.idle_seconds, color: CLASS_COLORS.idle },
  ].filter((d) => d.value > 0);

  const topAppsData = report.top_apps
    .slice(0, 8)
    .map((a) => ({
      name: a.name.length > 15 ? a.name.slice(0, 15) + '…' : a.name,
      minutes: Math.round(a.seconds / 60),
      fill: CLASS_COLORS[a.classification],
    }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 pb-12">
      {/* Back + Header */}
      <div>
        <button
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-4 transition-colors"
          onClick={() => navigate('/')}
        >
          <ChevronLeft size={16} />
          Home
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{report.session.title}</h1>
            <p className="text-slate-400 text-sm mt-1">{report.session.goal}</p>
            <p className="text-xs text-slate-600 mt-1">
              {format(new Date(report.session.started_at), 'EEEE, MMMM d · h:mm a')}
            </p>
          </div>

          {/* Focus score badge */}
          <div className="flex flex-col items-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold font-mono"
              style={{
                background: `conic-gradient(${scoreColor(focusScore)} ${focusScore}%, rgb(30,41,59) 0)`,
              }}
            >
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold">
                {focusScore}
              </div>
            </div>
            <span className="text-xs text-slate-500 mt-1">Focus Score</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Duration"
          value={fmtDur(report.total_duration_seconds)}
          icon={<Clock size={16} />}
          accent="blue"
        />
        <StatCard
          label="Focused Time"
          value={fmtDur(report.focused_seconds)}
          subValue={`${pct(report.focused_seconds, report.total_duration_seconds)}%`}
          icon={<Zap size={16} />}
          accent="green"
        />
        <StatCard
          label="Distracted Time"
          value={fmtDur(report.distracted_seconds)}
          subValue={`${pct(report.distracted_seconds, report.total_duration_seconds)}%`}
          icon={<AlertTriangle size={16} />}
          accent={report.distracted_seconds > report.focused_seconds ? 'red' : 'default'}
        />
        <StatCard
          label="Idle Time"
          value={fmtDur(report.idle_seconds)}
          icon={<Coffee size={16} />}
          accent="default"
        />
        <StatCard
          label="Context Switches"
          value={String(report.context_switch_count)}
          icon={<ArrowLeftRight size={16} />}
          accent={report.context_switch_count > 20 ? 'amber' : 'default'}
        />
        <StatCard
          label="Longest Focus"
          value={fmtDur(report.longest_focus_streak_seconds)}
          icon={<TrendingUp size={16} />}
          accent="purple"
        />
        <StatCard
          label="Distractions"
          value={String(report.diversion_moments.length)}
          subValue="notable breaks"
          icon={<AlertTriangle size={16} />}
          accent={report.diversion_moments.length > 5 ? 'red' : 'default'}
        />
        <StatCard
          label="Top App"
          value={report.top_apps[0]?.name?.slice(0, 12) ?? '—'}
          icon={<Monitor size={16} />}
          accent="default"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Time Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => fmtDur(v)}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Apps (minutes)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topAppsData} layout="vertical" margin={{ left: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={90} />
              <Tooltip
                formatter={(v: number) => [`${v}m`, 'Time']}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                {topAppsData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Timeline */}
      {report.activity_blocks.length > 0 && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Activity Timeline</h3>
          <ActivityTimeline
            blocks={report.activity_blocks}
            sessionStartedAt={report.session.started_at}
            sessionEndedAt={report.session.ended_at ?? Date.now()}
          />
        </div>
      )}

      {/* Diversion moments */}
      {report.diversion_moments.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" />
            Notable Distractions
          </h3>
          <div className="space-y-2">
            {report.diversion_moments.map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-red-950/20 border border-red-900/30">
                <div className="text-xs font-mono text-slate-500 w-14 flex-shrink-0">
                  {format(new Date(d.started_at), 'HH:mm')}
                </div>
                <span className="text-sm text-slate-300 flex-1 truncate">
                  {d.browser_domain ?? d.app_name ?? 'Unknown'}
                </span>
                <span className="text-xs text-red-400 font-mono">{fmtDur(d.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top domains */}
      {report.top_domains.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Monitor size={14} />
            Top Websites
          </h3>
          <div className="space-y-2">
            {report.top_domains.slice(0, 8).map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 flex-1">{d.domain}</span>
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(d.seconds / (report.top_domains[0]?.seconds ?? 1)) * 100}%`,
                      background: CLASS_COLORS[d.classification],
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono w-12 text-right">{fmtDur(d.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {(report.llm_summary || report.coaching_suggestions) && (
        <div className="card border-brand-700/30 bg-brand-950/20">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Bot size={14} className="text-brand-400" />
            AI Session Summary
            <span className="ml-auto text-xs text-slate-600 font-normal">Powered by local Ollama</span>
          </h3>
          {report.llm_summary && (
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{report.llm_summary}</p>
          )}
          {report.coaching_suggestions && report.coaching_suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                <Lightbulb size={12} />
                Coaching Suggestions
              </p>
              <ul className="space-y-2">
                {report.coaching_suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="text-brand-400 mt-0.5">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* No LLM note */}
      {!report.llm_summary && (
        <div className="card border-slate-700/30 text-center py-4">
          <Bot size={20} className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">
            AI summary not available. Make sure Ollama is running to get coaching insights.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Run: <code className="font-mono">ollama run llama3.1:8b</code>
          </p>
        </div>
      )}
    </div>
  );
}

function fmtDur(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
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
