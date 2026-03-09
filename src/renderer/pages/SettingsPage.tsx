import React, { useEffect, useState } from 'react';
import { Bot, Shield, Clock, Plus, Trash2, CheckCircle, XCircle, Edit3, Save, X } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import type { Settings, AppClassification, ClassificationType } from '../../shared/types';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'rules' | 'llm' | 'privacy'>('general');

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'rules',   label: 'Distraction Rules' },
    { id: 'llm',     label: 'AI / Ollama' },
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
      {activeTab === 'llm'     && <LlmSettings />}
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
          <p className="text-xs text-slate-500 mt-1">How often to capture activity (lower = more data, higher CPU)</p>
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

// ─── LLM Settings ─────────────────────────────────────────────────────────────

function LlmSettings() {
  const { settings, setSettings } = useAppStore();
  const [local, setLocal] = useState<Partial<Settings>>({});
  const [llmStatus, setLlmStatus] = useState<{ is_running: boolean; models: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setLocal(settings);
    checkStatus();
  }, [settings]);

  async function checkStatus() {
    setChecking(true);
    const res = await window.api.checkLlmStatus();
    if (res.success && res.data) setLlmStatus(res.data);
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

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Bot size={14} />
            Ollama Status
          </h3>
          <button className="btn-secondary text-xs py-1" onClick={checkStatus} disabled={checking}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </div>

        {llmStatus && (
          <div className={`flex items-center gap-2 text-sm ${llmStatus.is_running ? 'text-green-400' : 'text-red-400'}`}>
            {llmStatus.is_running ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {llmStatus.is_running ? 'Ollama is running' : 'Ollama is not running'}
          </div>
        )}

        {llmStatus?.models && llmStatus.models.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Available models:</p>
            <div className="flex flex-wrap gap-1.5">
              {llmStatus.models.map((m) => (
                <span key={m} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded-md font-mono">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

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
            placeholder="llama3.1:8b"
          />
          <p className="text-xs text-slate-500 mt-1">
            Recommended: <code className="font-mono">llama3.1:8b</code> or <code className="font-mono">phi3:mini</code>
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Enable AI Summaries</p>
            <p className="text-xs text-slate-500">Generate session summaries and coaching tips</p>
          </div>
          <Toggle
            value={local.enable_llm ?? true}
            onChange={(v) => setLocal((p) => ({ ...p, enable_llm: v }))}
          />
        </div>
      </div>

      <div className="card bg-slate-800/40 space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Setup Instructions</h3>
        <ol className="space-y-2 text-xs text-slate-400 list-decimal list-inside">
          <li>Install Ollama: <code className="font-mono text-slate-300">brew install ollama</code></li>
          <li>Start Ollama: <code className="font-mono text-slate-300">ollama serve</code></li>
          <li>Pull model: <code className="font-mono text-slate-300">ollama pull llama3.1:8b</code></li>
          <li>Or use smaller: <code className="font-mono text-slate-300">ollama pull phi3:mini</code></li>
        </ol>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save}>
          {saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Save Settings</>}
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
            { label: 'No cloud sync', desc: 'Data never leaves your machine. No servers, no accounts.' },
            { label: 'No keystrokes', desc: 'Focus Session never captures what you type.' },
            { label: 'No screenshots', desc: 'No screen captures are taken at any point.' },
            { label: 'Minimal data capture', desc: 'Only app names, window titles, and browser domains are recorded — not content.' },
            { label: 'Local LLM via Ollama', desc: 'AI summaries run entirely on your device. No data sent to OpenAI or any cloud API.' },
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
      } no-drag`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
