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
