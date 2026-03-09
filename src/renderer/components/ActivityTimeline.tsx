import React, { useMemo } from 'react';
import type { ActivityBlock, ClassificationType } from '../../shared/types';

interface Props {
  blocks: ActivityBlock[];
  sessionStartedAt: number;
  sessionEndedAt: number;
}

const classificationColors: Record<ClassificationType, string> = {
  productive:   'bg-green-500',
  distracting:  'bg-red-500',
  neutral:      'bg-slate-500',
  idle:         'bg-slate-700',
  unknown:      'bg-slate-600',
};

const classificationLabels: Record<ClassificationType, string> = {
  productive:  'Focused',
  distracting: 'Distracted',
  neutral:     'Neutral',
  idle:        'Idle',
  unknown:     'Unknown',
};

export default function ActivityTimeline({ blocks, sessionStartedAt, sessionEndedAt }: Props) {
  const totalDuration = sessionEndedAt - sessionStartedAt;

  const segments = useMemo(() => {
    return blocks.map((block) => {
      const left = ((block.started_at - sessionStartedAt) / totalDuration) * 100;
      const width = ((block.ended_at - block.started_at) / totalDuration) * 100;
      return {
        ...block,
        left: Math.max(0, left),
        width: Math.max(0.2, width), // minimum visible width
      };
    });
  }, [blocks, sessionStartedAt, totalDuration]);

  return (
    <div className="space-y-3">
      {/* Timeline bar */}
      <div className="relative h-8 bg-slate-700/50 rounded-lg overflow-hidden">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`absolute top-0 h-full ${classificationColors[seg.classification]} opacity-80 hover:opacity-100 transition-opacity`}
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
            title={`${seg.app_name ?? seg.browser_domain ?? 'Unknown'} — ${formatDuration(seg.duration_seconds)} (${classificationLabels[seg.classification]})`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.entries(classificationLabels) as [ClassificationType, string][]).map(([cls, label]) => (
          <div key={cls} className="flex items-center gap-1.5 text-slate-400">
            <div className={`w-3 h-3 rounded-sm ${classificationColors[cls]}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Block list */}
      <div className="space-y-1 max-h-64 overflow-y-auto scrollable">
        {blocks.map((block, i) => (
          <BlockRow key={i} block={block} />
        ))}
      </div>
    </div>
  );
}

function BlockRow({ block }: { block: ActivityBlock }) {
  const displayName = block.browser_domain
    ? `${block.app_name} → ${block.browser_domain}`
    : (block.app_name ?? 'Unknown');

  const truncatedTitle = block.window_title
    ? block.window_title.length > 60
      ? block.window_title.slice(0, 60) + '…'
      : block.window_title
    : null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors">
      <div className={`w-2 h-8 rounded-sm flex-shrink-0 ${classificationColors[block.classification]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200 truncate">{displayName}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${classificationColors[block.classification]} bg-opacity-20`}>
            {classificationLabels[block.classification]}
          </span>
        </div>
        {truncatedTitle && (
          <span className="text-xs text-slate-500 truncate block">{truncatedTitle}</span>
        )}
      </div>
      <span className="text-xs text-slate-500 font-mono flex-shrink-0">
        {formatDuration(block.duration_seconds)}
      </span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
