import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ActiveSessionPage from './pages/ActiveSessionPage';
import ReportPage from './pages/ReportPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import { useAppStore } from './store/useStore';

export default function App() {
  const { initApp } = useAppStore();

  useEffect(() => {
    initApp();
  }, [initApp]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/active" element={<ActiveSessionPage />} />
          <Route path="/session/:id/report" element={<ReportPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
