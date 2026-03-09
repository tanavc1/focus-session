import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

export default function PrivacyBadge() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors no-drag"
        onClick={() => setShowTooltip(!showTooltip)}
      >
        <ShieldCheck size={12} />
        <span>Local only · No cloud</span>
      </button>

      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl text-xs text-slate-300 z-50 no-drag">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-green-400" />
              Privacy First
            </span>
            <button onClick={() => setShowTooltip(false)} className="text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          </div>
          <ul className="space-y-1 text-slate-400">
            <li>• All data stored locally on your Mac</li>
            <li>• No cloud sync or external APIs</li>
            <li>• No keystrokes captured</li>
            <li>• No screenshots taken</li>
            <li>• LLM runs locally via Ollama</li>
            <li>• No telemetry or analytics</li>
          </ul>
        </div>
      )}
    </div>
  );
}
