import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { JobInfo } from '../types';

export function useRenderQueue() {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const refreshJobs = async () => {
    try {
      const data: JobInfo[] = await invoke('get_status');
      setJobs(data);
    } catch {
      // ignore polling errors
    }
  };

  useEffect(() => {
    const setup = async () => {
      const unlistenStarted = await listen<{ jobId: string }>('render-started', () => {
        refreshJobs();
      });

      const unlistenProgress = await listen<{ jobId: string; frame: number; total: number; progress: number }>('render-progress', () => {
        refreshJobs();
      });

      const unlistenDone = await listen<{ id: string }>('render-done', () => {
        refreshJobs();
      });

      unlistenRef.current = () => {
        unlistenStarted();
        unlistenProgress();
        unlistenDone();
      };

      refreshJobs();
    };

    setup();

    pollingRef.current = setInterval(refreshJobs, 2000);

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return { jobs, refreshJobs };
}
