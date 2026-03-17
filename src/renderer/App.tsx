import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
  );
}
