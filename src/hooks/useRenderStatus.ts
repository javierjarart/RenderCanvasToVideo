import { useState, useRef, useCallback } from 'react';
import type { RenderStatus } from '../types';

const initialStatus: RenderStatus = {
  state: 'idle',
  progress: 0,
  total: 0,
  fileUrl: null,
  error: null,
};

export function useRenderStatus() {
  const [status, setStatus] = useState<RenderStatus>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data: RenderStatus = await res.json();
        setStatus(data);

        if (data.state === 'done' || data.state === 'error' || data.state === 'cancelled') {
          stopPolling();
        }
      } catch {
        setStatus(prev => ({
          ...prev,
          state: 'error',
          error: 'Error de conexión con el servidor',
        }));
        stopPolling();
      }
    }, 1000);
  }, [stopPolling]);

  return { status, startPolling, stopPolling };
}
