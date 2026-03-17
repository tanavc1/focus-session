import React, { useState, useEffect } from 'react';
import { Zap, Target, TrendingUp, Bot, ChevronRight, CheckCircle, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

const STEPS = ['welcome', 'howItWorks', 'permissions', 'done'] as const;
type Step = typeof STEPS[number];

interface Props {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');

  async function finish() {
    await window.api.setSettings({ onboarding_completed: true });
    onComplete();
  }

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      {step === 'welcome'    && <WelcomeStep     onNext={() => setStep('howItWorks')} />}
      {step === 'howItWorks' && <HowItWorksStep  onNext={() => setStep('permissions')} />}
      {step === 'permissions'&& <PermissionsStep onNext={() => setStep('done')} />}
      {step === 'done'       && <DoneStep        onFinish={finish} />}

      {/* Progress dots */}
      <div className="flex gap-2 mt-10">
        {STEPS.map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step ? 'bg-brand-400 w-6' : 'bg-slate-700 w-1.5'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center max-w-sm space-y-6">
      <div className="w-20 h-20 rounded-3xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto">
        <Zap size={36} className="text-brand-400" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Focus</h1>
        <p className="text-slate-400 mt-2 leading-relaxed">
          Your macOS companion for deep work.<br />
          Track what you actually do. Improve every session.
        </p>
      </div>
      <button onClick={onNext} className="btn-primary mx-auto px-8 py-3 text-base">
        Get started <ChevronRight size={18} />
      </button>
      <p className="text-xs text-slate-600">Everything stays on your Mac. No accounts, no cloud.</p>
    </div>
  );
}

const FEATURES = [
  {
    icon: <Target size={20} className="text-brand-400" />,
    title: 'Plan your day',
    desc: 'Set goals each morning. Your sessions stay anchored to what actually matters.',
  },
  {
    icon: <Zap size={20} className="text-amber-400" />,
    title: 'Automatic tracking',
    desc: 'Start a session and we silently record every app, site, and context switch.',
  },
  {
    icon: <TrendingUp size={20} className="text-green-400" />,
    title: 'Flow state detection',
    desc: '25+ minutes of unbroken focus = flow. We track it and help you reach it more.',
  },
  {
    icon: <Bot size={20} className="text-purple-400" />,
    title: 'AI coaching',
    desc: 'After every session, get actionable insights powered by Ollama, Claude, or OpenAI.',
  },
] as const;

function HowItWorksStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="max-w-sm w-full space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-100">How it works</h2>
        <p className="text-slate-500 text-sm mt-1">Four things that make Focus different</p>
      </div>

      <div className="space-y-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/40">
            <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
              {f.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">{f.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary w-full justify-center py-3">
        Next <ChevronRight size={18} />
      </button>
    </div>
  );
}

const PERMISSIONS = [
  {
    icon: '♿',
    title: 'Accessibility',
    required: true,
    desc: 'Lets Focus see which app and window are active. Required for tracking.',
    path: 'System Settings → Privacy & Security → Accessibility → Enable Focus',
  },
  {
    icon: '🌐',
    title: 'Automation (per browser)',
    required: false,
    desc: 'Allows Focus to read the current browser URL for accurate domain tracking.',
    path: 'System Settings → Privacy & Security → Automation → Focus → Enable your browser',
  },
  {
    icon: '📸',
    title: 'Screen Recording',
    required: false,
    desc: 'Powers Vision Analysis — screenshots are analyzed by AI then immediately discarded.',
    path: 'System Settings → Privacy & Security → Screen Recording → Enable Focus',
  },
] as const;

function PermissionsStep({ onNext }: { onNext: () => void }) {
  const [accessibility, setAccessibility] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    window.api.checkPermissions()
      .then((p) => setAccessibility(p.accessibility))
      .catch(() => setAccessibility(false));
  }, []);

  async function requestAccessibility() {
    setRequesting(true);
    try {
      const granted = await window.api.requestAccessibility();
      setAccessibility(granted);
      if (!granted) {
        // Re-check after a short delay to catch System Settings approval
        setTimeout(async () => {
          const p = await window.api.checkPermissions();
          setAccessibility(p.accessibility);
          setRequesting(false);
        }, 3000);
      } else {
        setRequesting(false);
      }
    } catch {
      setRequesting(false);
    }
  }

  return (
    <div className="max-w-sm w-full space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
          <Shield size={26} className="text-brand-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Permissions</h2>
        <p className="text-slate-500 text-sm mt-1">Two permissions make Focus work</p>
      </div>

      {/* Accessibility — required */}
      <div className={`p-4 rounded-xl border ${accessibility ? 'border-green-700/40 bg-green-950/20' : 'border-amber-700/40 bg-amber-950/20'}`}>
        <div className="flex items-center gap-2 mb-2">
          {accessibility
            ? <ShieldCheck size={16} className="text-green-400 flex-shrink-0" />
            : <ShieldAlert size={16} className="text-amber-400 flex-shrink-0" />
          }
          <p className="text-sm font-semibold text-slate-200">Accessibility</p>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-brand-900/60 text-brand-300 border border-brand-700/40">
            Required
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          Lets Focus see which app and window are active — the core of activity tracking.
        </p>
        {accessibility ? (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle size={12} />
            Granted
          </div>
        ) : (
          <button
            onClick={requestAccessibility}
            disabled={requesting}
            className="btn-primary text-xs py-1.5 w-full justify-center"
          >
            {requesting ? 'Opening System Settings…' : 'Grant Accessibility Access'}
          </button>
        )}
      </div>

      {/* Automation — optional */}
      <div className="p-4 rounded-xl border border-slate-700/40 bg-slate-800/40">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🌐</span>
          <p className="text-sm font-semibold text-slate-200">Automation (browser URL)</p>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-700/60 text-slate-500 border border-slate-600/40">
            Optional
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Lets Focus read the current tab URL for accurate domain tracking. macOS will prompt when you use a supported browser.
        </p>
      </div>

      {/* Screen Recording — optional note */}
      <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
        <p className="text-xs text-slate-500">
          <span className="text-slate-400 font-medium">📸 Screen Recording</span> — only needed if you enable Vision Analysis in Settings → AI. You can enable it later.
        </p>
      </div>

      <button onClick={onNext} className="btn-primary w-full justify-center py-3">
        {accessibility ? 'Continue' : 'Skip for now'} <ChevronRight size={18} />
      </button>
    </div>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center max-w-sm space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-900/30 border border-green-700/40 flex items-center justify-center mx-auto">
        <CheckCircle size={40} className="text-green-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-100">You're all set</h2>
        <p className="text-slate-400 mt-2 leading-relaxed">
          Start by planning your day, or jump straight into a session.<br />
          Focus lives in your menu bar and works silently in the background.
        </p>
      </div>
      <div className="space-y-2.5">
        <button onClick={onFinish} className="btn-primary w-full justify-center py-3 text-base">
          Start focusing <ChevronRight size={18} />
        </button>
      </div>
      <div className="text-xs text-slate-500 space-y-1 text-left bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
        <p className="font-semibold text-slate-400 mb-1.5">Optional: Enable AI coaching</p>
        <p>• <strong className="text-slate-400">Free (local):</strong> Install <span className="text-brand-400">Ollama</span> → <code className="font-mono text-slate-400 text-[10px]">ollama serve && ollama pull phi4-mini</code></p>
        <p>• <strong className="text-slate-400">Cloud:</strong> Add a Claude or OpenAI API key in Settings → AI</p>
        <p className="text-slate-600 pt-0.5">Tracking and stats work without AI — add it whenever you're ready.</p>
      </div>
    </div>
  );
}

