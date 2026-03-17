import React, { useEffect, useState } from 'react';
import {
  Bot, Shield, Clock, Plus, Trash2, CheckCircle, XCircle,
  Edit3, Save, X, Eye, EyeOff, RefreshCw, Camera, Bell, Target,
} from 'lucide-react';
import { useAppStore } from '../store/useStore';
import type { Settings, AppClassification, ClassificationType, AiProvider } from '../../shared/types';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'rules' | 'ai' | 'privacy'>('general');

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'rules',   label: 'Distraction Rules' },
    { id: 'ai',      label: 'AI' },
    { id: 'privacy', label: 'Privacy' },
  ] as const;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure tracking, classification, and AI options.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'rules'   && <RulesSettings />}
      {activeTab === 'ai'      && <AiSettings />}
      {activeTab === 'privacy' && <PrivacySettings />}
    </div>
  );
}

// ─── General Settings ─────────────────────────────────────────────────────────

function GeneralSettings() {
  const { settings, setSettings } = useAppStore();
  const [local, setLocal] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  async function save() {
    const res = await window.api.setSettings(local);
    if (res.success && res.data) {
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Clock size={14} />
          Tracking
        </h3>

        <div>
          <label className="label">Poll Interval</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1000}
              max={10000}
              step={500}
              value={local.tracking_interval_ms ?? 3000}
              onChange={(e) => setLocal((p) => ({ ...p, tracking_interval_ms: Number(e.target.value) }))}
              className="flex-1 no-drag"
            />
            <span className="text-sm text-slate-400 font-mono w-16">
              {((local.tracking_interval_ms ?? 3000) / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">How often to capture activity (lower = more detail, higher CPU)</p>
        </div>

        <div>
          <label className="label">Idle Threshold</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={30}
              max={600}
              step={30}
              value={local.idle_threshold_seconds ?? 120}
              onChange={(e) => setLocal((p) => ({ ...p, idle_threshold_seconds: Number(e.target.value) }))}
              className="flex-1 no-drag"
            />
            <span className="text-sm text-slate-400 font-mono w-16">
              {local.idle_threshold_seconds ?? 120}s
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Seconds of inactivity before marking as idle</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Browser Domain Tracking</p>
            <p className="text-xs text-slate-500">Detect which website you're on in supported browsers</p>
          </div>
          <Toggle
            value={local.enable_browser_tracking ?? true}
            onChange={(v) => setLocal((p) => ({ ...p, enable_browser_tracking: v }))}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Bell size={14} />
          Focus Notifications
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Distraction Alerts</p>
            <p className="text-xs text-slate-500">
              Get a notification after ~1 minute of sustained distracting activity — only when you truly drift off track
            </p>
          </div>
          <Toggle
            value={local.enable_focus_notifications ?? true}
            onChange={(v) => setLocal((p) => ({ ...p, enable_focus_notifications: v }))}
          />
        </div>

        {(local.enable_focus_notifications ?? true) && (
          <div className="p-3 bg-slate-800/40 rounded-lg text-xs text-slate-400 space-y-1">
            <p>• Triggers after ~1 minute of continuous distracting activity</p>
            <p>• Tells you exactly what you're doing (app or website)</p>
            <p>• Waits 5 minutes before notifying again — never spammy</p>
            <p>• Resets automatically when you return to focused work</p>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Target size={14} />
          Daily Focus Target
        </h3>
        <div>
          <label className="label">Default daily focus goal</label>
          <p className="text-xs text-slate-500 mb-3">How much focused time you aim for each day. Used when you don't set a per-day target in the planner.</p>
          <div className="flex flex-wrap gap-2">
            {[60, 90, 120, 180, 240, 300].map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setLocal((p) => ({ ...p, daily_focus_target_minutes: min }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  (local.daily_focus_target_minutes ?? 120) === min
                    ? 'bg-brand-600 text-white border border-brand-500'
                    : 'bg-slate-700 text-slate-400 border border-slate-600 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {min >= 60 ? `${min / 60}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`}
              </button>
            ))}
            {/* Custom */}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={15}
                max={600}
                step={15}
                value={
                  [60, 90, 120, 180, 240, 300].includes(local.daily_focus_target_minutes ?? 120)
                    ? ''
                    : (local.daily_focus_target_minutes ?? 120)
                }
                placeholder="Custom"
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v > 0) setLocal((p) => ({ ...p, daily_focus_target_minutes: v }));
                }}
                className="input w-24 text-xs no-drag"
              />
              <span className="text-xs text-slate-500">min</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save}>
          {saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}

// ─── AI Settings ──────────────────────────────────────────────────────────────

function AiSettings() {
  const { settings, setSettings } = useAppStore();
  const [local, setLocal] = useState<Partial<Settings>>({});
  const [status, setStatus] = useState<{
    is_running: boolean;
    is_configured: boolean;
    provider: string;
    models: string[];
    message: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  async function checkStatus() {
    setChecking(true);
    const res = await window.api.checkLlmStatus();
    if (res.success && res.data) setStatus(res.data);
    setChecking(false);
  }

  async function save() {
    const res = await window.api.setSettings(local);
    if (res.success && res.data) {
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const provider: AiProvider = (local.ai_provider ?? 'ollama') as AiProvider;

  return (
    <div className="space-y-5">
      {/* AI optional info */}
      <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/40 text-xs text-slate-400 flex items-start gap-2.5">
        <span className="text-slate-500 flex-shrink-0 mt-0.5">ℹ️</span>
        <span>
          <span className="text-slate-300 font-medium">AI is fully optional.</span>
          {' '}Tracking, flow detection, and all stats work without it.
          When enabled, session summaries are generated privately on your Mac (Ollama) or via a cloud API you control (Claude/OpenAI).
        </span>
      </div>

      {/* Enable AI toggle */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Bot size={14} />
              AI Session Summaries
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Generate coaching insights and summaries after each session</p>
          </div>
          <Toggle
            value={local.enable_llm ?? true}
            onChange={(v) => setLocal((p) => ({ ...p, enable_llm: v }))}
          />
        </div>
      </div>

      {/* Provider selection */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Language Model Provider</h3>
        <div className="grid grid-cols-3 gap-2">
          {(['ollama', 'claude', 'openai'] as AiProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setLocal((prev) => ({ ...prev, ai_provider: p }))}
              className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                provider === p
                  ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-center mb-1 h-5">
                {p === 'ollama' ? (
                  <span className="text-base">🦙</span>
                ) : p === 'claude' ? (
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" className="text-[#DA7756]">
                    <path d="M17.304 12.444c.37-.882.498-1.818.36-2.709-.137-.892-.548-1.713-1.181-2.358a4.392 4.392 0 0 0-2.264-1.217 4.459 4.459 0 0 0-2.612.293L5.91 8.924l1.06 2.52 3.576-1.5a1.951 1.951 0 0 1 1.494-.032c.48.192.858.567 1.054 1.041a1.942 1.942 0 0 1-.034 1.487L9.5 17.9l2.52 1.06 3.48-8.284.064-.152.001-.003.739.31-.74-.31v.003l-.003.006-.012.031-.048.115-.181.433c-.156.374-.378.908-.624 1.507-.49 1.175-1.056 2.535-1.405 3.37l-.56 1.34 2.52 1.059.559-1.34c.348-.834.915-2.194 1.405-3.369.245-.588.465-1.115.623-1.49l.183-.437.053-.128.014-.034.004-.009.001-.002.001-.001v-.001a.017.017 0 0 1 .001-.003l-1.31-.549 1.31.549z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" className="text-slate-300">
                    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.369 2.019-1.168a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.4-.676zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                  </svg>
                )}
              </div>
              <div className="capitalize">{p === 'ollama' ? 'Ollama' : p === 'claude' ? 'Claude' : 'OpenAI'}</div>
              <div className="text-xs mt-0.5 opacity-60">
                {p === 'ollama' ? 'Local / free' : p === 'claude' ? 'API key' : 'API key'}
              </div>
            </button>
          ))}
        </div>

        {/* Ollama settings */}
        {provider === 'ollama' && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="label">Ollama Endpoint</label>
              <input
                className="input"
                value={local.ollama_endpoint ?? ''}
                onChange={(e) => setLocal((p) => ({ ...p, ollama_endpoint: e.target.value }))}
                placeholder="http://localhost:11434"
              />
            </div>
            <div>
              <label className="label">Model</label>
              <input
                className="input"
                value={local.ollama_model ?? ''}
                onChange={(e) => setLocal((p) => ({ ...p, ollama_model: e.target.value }))}
                placeholder="phi4-mini:latest"
              />
              <p className="text-xs text-slate-500 mt-1">
                Recommended: <code className="font-mono">phi4-mini:latest</code>, <code className="font-mono">llama3.1:8b</code>, <code className="font-mono">qwen2.5:7b</code>
              </p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 space-y-1.5 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Setup (one time):</p>
              <p>1. Install: <code className="font-mono text-slate-300 bg-slate-700/50 px-1 rounded">brew install ollama</code></p>
              <p>2. Start: <code className="font-mono text-slate-300 bg-slate-700/50 px-1 rounded">ollama serve</code></p>
              <p>3. Pull model: <code className="font-mono text-slate-300 bg-slate-700/50 px-1 rounded">ollama pull phi4-mini</code></p>
              <p className="text-slate-500 pt-1 border-t border-slate-700/40">For vision analysis: <code className="font-mono text-slate-400 bg-slate-700/50 px-1 rounded">ollama pull minicpm-v:2.6</code> (~5.5 GB)</p>
              <p className="text-slate-600">No Brew? Download from <span className="text-brand-400">ollama.com</span></p>
            </div>
          </div>
        )}

        {/* Claude settings */}
        {provider === 'claude' && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="label">Claude API Key</label>
              <div className="relative">
                <input
                  className="input pr-16"
                  type={showClaudeKey ? 'text' : 'password'}
                  value={local.claude_api_key ?? ''}
                  onChange={(e) => setLocal((p) => ({ ...p, claude_api_key: e.target.value }))}
                  placeholder="sk-ant-..."
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {(local.claude_api_key ?? '').length > 5 && (
                    (local.claude_api_key ?? '').startsWith('sk-ant-')
                      ? <CheckCircle size={13} className="text-green-400" />
                      : <XCircle size={13} className="text-red-400" />
                  )}
                  <button
                    className="text-slate-500 hover:text-slate-300"
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                  >
                    {showClaudeKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">Get your key at console.anthropic.com</p>
            </div>
            <div>
              <label className="label">Language Model</label>
              <select
                className="input"
                value={local.language_model ?? 'claude-sonnet-4-6'}
                onChange={(e) => setLocal((p) => ({ ...p, language_model: e.target.value }))}
              >
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommended)</option>
                <option value="claude-opus-4-6">claude-opus-4-6 (most powerful)</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fastest, cheapest)</option>
              </select>
            </div>
          </div>
        )}

        {/* OpenAI settings */}
        {provider === 'openai' && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="label">OpenAI API Key</label>
              <div className="relative">
                <input
                  className="input pr-16"
                  type={showOpenAiKey ? 'text' : 'password'}
                  value={local.openai_api_key ?? ''}
                  onChange={(e) => setLocal((p) => ({ ...p, openai_api_key: e.target.value }))}
                  placeholder="sk-..."
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {(local.openai_api_key ?? '').length > 5 && (
                    (local.openai_api_key ?? '').startsWith('sk-')
                      ? <CheckCircle size={13} className="text-green-400" />
                      : <XCircle size={13} className="text-red-400" />
                  )}
                  <button
                    className="text-slate-500 hover:text-slate-300"
                    onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                  >
                    {showOpenAiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">Get your key at platform.openai.com</p>
            </div>
            <div>
              <label className="label">Language Model</label>
              <select
                className="input"
                value={local.language_model ?? 'gpt-4o-mini'}
                onChange={(e) => setLocal((p) => ({ ...p, language_model: e.target.value }))}
              >
                <option value="gpt-4o-mini">gpt-4o-mini (recommended, cost-effective)</option>
                <option value="gpt-4o">gpt-4o (most capable)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              </select>
            </div>
          </div>
        )}

        {/* Status check */}
        <div className="pt-1 flex items-center gap-3">
          <button
            className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
            onClick={checkStatus}
            disabled={checking}
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking…' : 'Test Connection'}
          </button>
          {status && (
            <div className={`flex items-center gap-1.5 text-xs ${status.is_running ? 'text-green-400' : 'text-red-400'}`}>
              {status.is_running ? <CheckCircle size={12} /> : <XCircle size={12} />}
              {status.message}
            </div>
          )}
        </div>

        {/* Available Ollama models — click to set language model */}
        {status?.models && status.models.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Installed models (click to use as language model):</p>
            <div className="flex flex-wrap gap-1.5">
              {status.models.map((m) => {
                const isVision = m.includes('minicpm') || m.includes('vl') || m.includes('vision') || m.includes('llava') || m.includes('moondream');
                return (
                  <button
                    key={m}
                    onClick={() => setLocal((p) => ({ ...p, ollama_model: m }))}
                    className={`text-xs px-2 py-0.5 rounded-md font-mono transition-colors ${
                      local.ollama_model === m
                        ? 'bg-brand-700 text-brand-200'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {m}
                    {isVision && <span className="ml-1 opacity-60">👁</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vision model */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Camera size={14} />
              Vision Analysis
              <span className="text-xs font-normal text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">
                On by default
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Periodically captures your screen and uses a vision model to understand what you're truly working on
            </p>
          </div>
          <Toggle
            value={local.vision_enabled ?? true}
            onChange={(v) => setLocal((p) => ({ ...p, vision_enabled: v }))}
          />
        </div>

        {local.vision_enabled && (
          <div className="space-y-4">
            {/* Vision model selector — works for all providers */}
            <div>
              <label className="label">Vision Model</label>
              {provider === 'ollama' ? (
                <>
                  <input
                    className="input font-mono"
                    value={local.vision_model ?? 'minicpm-v:2.6'}
                    onChange={(e) => setLocal((p) => ({ ...p, vision_model: e.target.value }))}
                    placeholder="minicpm-v:2.6"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Recommended: <code className="font-mono">minicpm-v:2.6</code> (~5.5 GB, best screen reading) ·{' '}
                    <code className="font-mono">llava-phi3</code> (~2.9 GB, lighter)
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Pull with: <code className="font-mono">ollama pull minicpm-v:2.6</code>
                  </p>
                  {/* Click-to-select from installed models */}
                  {status?.models && status.models.filter(m =>
                    m.includes('minicpm') || m.includes('vl') || m.includes('vision') || m.includes('llava') || m.includes('moondream')
                  ).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {status.models
                        .filter(m => m.includes('minicpm') || m.includes('vl') || m.includes('vision') || m.includes('llava') || m.includes('moondream'))
                        .map((m) => (
                          <button
                            key={m}
                            onClick={() => setLocal((p) => ({ ...p, vision_model: m }))}
                            className={`text-xs px-2 py-0.5 rounded-md font-mono transition-colors ${
                              local.vision_model === m
                                ? 'bg-green-700 text-green-200'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <select
                  className="input"
                  value={local.vision_model ?? ''}
                  onChange={(e) => setLocal((p) => ({ ...p, vision_model: e.target.value }))}
                >
                  {provider === 'claude' && (
                    <>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommended)</option>
                      <option value="claude-opus-4-6">claude-opus-4-6</option>
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fastest)</option>
                    </>
                  )}
                  {provider === 'openai' && (
                    <>
                      <option value="gpt-4o">gpt-4o (recommended)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                    </>
                  )}
                </select>
              )}
            </div>

            {/* Cloud vision cost note */}
            {(provider === 'claude' || provider === 'openai') && (
              <div className="p-2.5 bg-amber-950/30 border border-amber-900/40 rounded-lg text-xs text-amber-300/80">
                <span className="font-semibold text-amber-300">Cost note:</span> Vision screenshots fire on context switches (min 8s apart) + every 3 min. With cloud providers this is ~$0.002–0.005 per screenshot. To keep costs low, vision defaults to minimal frequency. You can disable vision above if not needed.
              </div>
            )}

            {/* How it works note */}
            <div className="p-3 bg-slate-800/40 rounded-lg text-xs text-slate-400 space-y-1">
              <p className="text-slate-300 font-medium">How it works:</p>
              <p>• Screenshots fire automatically whenever you switch apps, URLs, or files</p>
              <p>• A baseline screenshot is also taken every 3 minutes to stay current</p>
              <p>• The vision model describes what's on screen in plain text</p>
              <p>• These descriptions are included in your AI coaching report</p>
              <p>• <span className="text-slate-300">Screenshots are never stored</span> — only the text description</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save}>
          {saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}

// ─── Rules Settings ───────────────────────────────────────────────────────────

function RulesSettings() {
  const [rules, setRules] = useState<AppClassification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    setIsLoading(true);
    const res = await window.api.listClassifications();
    if (res.success && res.data) setRules(res.data);
    setIsLoading(false);
  }

  async function deleteRule(id: number) {
    await window.api.deleteClassification(id);
    await loadRules();
  }

  async function saveRule(rule: AppClassification) {
    await window.api.upsertClassification(rule);
    await loadRules();
    setEditingId(null);
    setShowAddForm(false);
  }

  const byType = {
    domain: rules.filter((r) => r.pattern_type === 'domain'),
    app: rules.filter((r) => r.pattern_type === 'app'),
    title: rules.filter((r) => r.pattern_type === 'title'),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{rules.length} rules configured</p>
        <button className="btn-secondary text-xs" onClick={() => setShowAddForm(true)}>
          <Plus size={13} /> Add Rule
        </button>
      </div>

      {showAddForm && (
        <RuleForm
          rule={{ pattern: '', pattern_type: 'domain', classification: 'distracting', reason: '', is_default: 0 }}
          onSave={saveRule}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {isLoading ? (
        <div className="h-32 bg-slate-800 rounded-xl animate-pulse" />
      ) : (
        (['domain', 'app', 'title'] as const).map((type) => (
          byType[type].length > 0 && (
            <div key={type} className="card space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {type === 'domain' ? 'Browser Domains' : type === 'app' ? 'Applications' : 'Window Titles'}
              </h3>
              {byType[type].map((rule) => (
                editingId === rule.id ? (
                  <RuleForm
                    key={rule.id}
                    rule={rule}
                    onSave={saveRule}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => setEditingId(rule.id!)}
                    onDelete={() => rule.id && deleteRule(rule.id)}
                  />
                )
              ))}
            </div>
          )
        ))
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: AppClassification;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors: Record<ClassificationType, string> = {
    productive:  'text-green-400',
    distracting: 'text-red-400',
    neutral:     'text-slate-400',
    idle:        'text-slate-500',
    unknown:     'text-slate-500',
  };

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-slate-300 flex-1 font-mono text-xs">{rule.pattern}</span>
      <span className={`text-xs ${colors[rule.classification]}`}>{rule.classification}</span>
      {rule.reason && <span className="text-xs text-slate-600 hidden lg:block">{rule.reason}</span>}
      <div className="flex gap-1 ml-2">
        <button className="text-slate-600 hover:text-slate-300 transition-colors" onClick={onEdit}>
          <Edit3 size={12} />
        </button>
        {!rule.is_default && (
          <button className="text-slate-600 hover:text-red-400 transition-colors" onClick={onDelete}>
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function RuleForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: Partial<AppClassification>;
  onSave: (rule: AppClassification) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState<Partial<AppClassification>>(rule);

  return (
    <div className="p-3 bg-slate-700/40 rounded-lg space-y-3 border border-slate-600/40">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Pattern</label>
          <input
            className="input text-xs"
            value={local.pattern ?? ''}
            onChange={(e) => setLocal((p) => ({ ...p, pattern: e.target.value }))}
            placeholder="e.g. youtube.com"
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            className="input text-xs"
            value={local.pattern_type ?? 'domain'}
            onChange={(e) => setLocal((p) => ({ ...p, pattern_type: e.target.value as AppClassification['pattern_type'] }))}
          >
            <option value="domain">Domain</option>
            <option value="app">App</option>
            <option value="title">Title</option>
          </select>
        </div>
        <div>
          <label className="label">Classification</label>
          <select
            className="input text-xs"
            value={local.classification ?? 'neutral'}
            onChange={(e) => setLocal((p) => ({ ...p, classification: e.target.value as ClassificationType }))}
          >
            <option value="productive">Productive</option>
            <option value="neutral">Neutral</option>
            <option value="distracting">Distracting</option>
          </select>
        </div>
        <div>
          <label className="label">Reason (optional)</label>
          <input
            className="input text-xs"
            value={local.reason ?? ''}
            onChange={(e) => setLocal((p) => ({ ...p, reason: e.target.value }))}
            placeholder="e.g. Social media"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button className="btn-secondary text-xs py-1" onClick={onCancel}>
          <X size={12} /> Cancel
        </button>
        <button
          className="btn-primary text-xs py-1"
          onClick={() => onSave({ ...local, is_default: 0 } as AppClassification)}
          disabled={!local.pattern?.trim()}
        >
          <Save size={12} /> Save
        </button>
      </div>
    </div>
  );
}

// ─── Privacy Settings ──────────────────────────────────────────────────────────

function PrivacySettings() {
  return (
    <div className="space-y-4">
      <div className="card border-green-700/20 bg-green-950/10 space-y-4">
        <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2">
          <Shield size={14} />
          Privacy Guarantees
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Local storage only', desc: 'All session data is stored in a local SQLite database on your Mac.' },
            { label: 'No cloud sync', desc: 'Data never leaves your machine unless you configure a cloud API key.' },
            { label: 'No keystrokes', desc: 'Focus Session never captures what you type.' },
            { label: 'Minimal data capture', desc: 'Only app names, window titles, and browser domains are recorded — not content.' },
            { label: 'Vision opt-in only', desc: 'Screenshots are only taken if you explicitly enable Vision Analysis. Images are analyzed then discarded — only the text description is stored.' },
            { label: 'API keys stay local', desc: 'Claude/OpenAI API keys are stored only in the local SQLite database. Requests go directly from your machine to the provider.' },
            { label: 'No telemetry', desc: 'Zero analytics, crash reporting, or usage data is collected.' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <CheckCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-medium text-slate-300">What IS captured:</h3>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• Active application name (e.g. "Xcode", "Safari")</li>
          <li>• Window/tab title (e.g. "GitHub — focus-session")</li>
          <li>• Browser domain if enabled (e.g. "github.com")</li>
          <li>• System idle time (seconds since last input)</li>
          <li>• Timestamps of each activity change</li>
          <li>• Screen description text (only if Vision enabled)</li>
        </ul>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Data location</h3>
        <p className="text-xs text-slate-400 font-mono">
          ~/Library/Application Support/focus-session/focus-session.db
        </p>
        <p className="text-xs text-slate-500">
          You can delete this file at any time to remove all data.
        </p>
      </div>
    </div>
  );
}

// ─── Shared components ─────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        value ? 'bg-brand-600' : 'bg-slate-600'
      } no-drag flex-shrink-0`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
