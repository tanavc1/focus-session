import React, { useState } from 'react';
import { Zap, Target, TrendingUp, Bot, ChevronRight, CheckCircle } from 'lucide-react';

const STEPS = ['welcome', 'howItWorks', 'done'] as const;
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
      {step === 'welcome' && <WelcomeStep onNext={() => setStep('howItWorks')} />}
      {step === 'howItWorks' && <HowItWorksStep onNext={() => setStep('done')} />}
      {step === 'done' && <DoneStep onFinish={finish} />}

      {/* Dots */}
      <div className="flex gap-2 mt-10">
        {STEPS.map((s) => (
          <div
            key={s}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              s === step ? 'bg-brand-400 w-4' : 'bg-slate-700'
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
          Track what you actually do, and improve every session.
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
    desc: 'After every session, get actionable insights — not just stats.',
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
        Looks good <ChevronRight size={18} />
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
          Focus runs quietly in the menu bar while you work.
        </p>
      </div>
      <div className="space-y-2.5">
        <button onClick={onFinish} className="btn-primary w-full justify-center py-3 text-base">
          Start focusing <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
