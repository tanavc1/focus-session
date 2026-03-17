import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import DayPlanPage from './pages/DayPlanPage';
import ActiveSessionPage from './pages/ActiveSessionPage';
import ReportPage from './pages/ReportPage';
import JourneyPage from './pages/JourneyPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import NewSessionPage from './pages/NewSessionPage';
import { useAppStore } from './store/useStore';

// ─── Error Boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle size={40} className="text-red-400" />
          <div>
            <p className="text-slate-200 font-semibold text-lg">Something went wrong</p>
            <p className="text-slate-400 text-sm mt-1 font-mono">{this.state.error.message}</p>
          </div>
          <button
            className="mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { initApp, settings, isLoading, setSettings } = useAppStore();

  useEffect(() => {
    initApp();
  }, [initApp]);

  // Show minimal loading state while initializing
  if (isLoading && !settings) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoading && settings && !settings.onboarding_completed) {
    return (
      <OnboardingPage
        onComplete={() => {
          window.api.getSettings().then((res) => {
            if (res.success && res.data) setSettings(res.data);
          });
        }}
      />
    );
  }

  return (
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"                   element={<TodayPage />} />
          <Route path="/plan"               element={<DayPlanPage />} />
          <Route path="/session/new"        element={<NewSessionPage />} />
          <Route path="/session/active"     element={<ActiveSessionPage />} />
          <Route path="/session/:id/report" element={<ReportPage />} />
          <Route path="/journey"            element={<JourneyPage />} />
          <Route path="/settings"           element={<SettingsPage />} />
          <Route path="*"                   element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  );
}
