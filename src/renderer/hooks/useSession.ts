import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useStore';
import type { CurrentActivity } from '../../shared/types';

/**
 * Hook to subscribe to live activity updates from the main process.
 * Cleans up listener on unmount.
 */
export function useActivitySubscription() {
  const setCurrentActivity = useAppStore((s) => s.setCurrentActivity);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current = window.api.onActivityUpdate((activity: CurrentActivity) => {
      setCurrentActivity(activity);
    });

    return () => {
      cleanupRef.current?.();
    };
  }, [setCurrentActivity]);
}

/**
 * Hook for managing session start/end flows.
 */
export function useSessionControl() {
  const { setActiveSession } = useAppStore();
  const navigate = useNavigate();

  const startSession = useCallback(
    async (title: string, goal: string, target_duration?: number) => {
      const res = await window.api.startSession({ title, goal, target_duration });
      if (res.success && res.data) {
        setActiveSession(res.data);
        navigate('/session/active');
        return res.data;
      } else {
        throw new Error(res.error ?? 'Failed to start session');
      }
    },
    [navigate, setActiveSession]
  );

  const endSession = useCallback(
    async (session_id: string) => {
      const res = await window.api.endSession(session_id);
      if (res.success && res.data) {
        setActiveSession(null);
        navigate(`/session/${session_id}/report`);
        return res.data;
      } else {
        throw new Error(res.error ?? 'Failed to end session');
      }
    },
    [navigate, setActiveSession]
  );

  return { startSession, endSession };
}

/**
 * Hook that formats a running timer display from a start timestamp.
 */
export function useElapsedTimer(startedAt: number | null) {
  const getElapsed = useCallback(() => {
    if (!startedAt) return 0;
    return Math.floor((Date.now() - startedAt) / 1000);
  }, [startedAt]);

  return getElapsed;
}
