import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
  accent?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'default';
}

const accentClasses: Record<string, string> = {
  green:   'border-green-700/30 bg-green-950/30',
  red:     'border-red-700/30 bg-red-950/30',
  amber:   'border-amber-700/30 bg-amber-950/30',
  blue:    'border-blue-700/30 bg-blue-950/30',
  purple:  'border-purple-700/30 bg-purple-950/30',
  default: 'border-slate-700/50 bg-slate-800',
};

const iconAccentClasses: Record<string, string> = {
  green:   'text-green-400',
  red:     'text-red-400',
  amber:   'text-amber-400',
  blue:    'text-blue-400',
  purple:  'text-purple-400',
  default: 'text-slate-400',
};

export default function StatCard({ label, value, subValue, icon, accent = 'default' }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${accentClasses[accent]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        {icon && (
          <span className={iconAccentClasses[accent]}>{icon}</span>
        )}
      </div>
      <div>
        <span className="text-2xl font-bold text-slate-100 font-mono">{value}</span>
        {subValue && (
          <span className="ml-2 text-sm text-slate-400">{subValue}</span>
        )}
      </div>
    </div>
  );
}
