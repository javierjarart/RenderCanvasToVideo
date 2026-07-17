import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LogEntry } from '../types';

const styles = {
  container: { marginTop: 3, border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const, flex: 1, minHeight: 30 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: '#141414', cursor: 'pointer', fontSize: 9, fontWeight: 600, color: 'var(--muted)', userSelect: 'none' as const },
  body: (open: boolean) => ({
    flex: 1, overflowY: 'auto' as const, background: '#0b0b0b', display: open ? 'block' : 'none', minHeight: 0,
  }),
  content: { padding: '2px 4px', fontFamily: 'var(--font-mono)', fontSize: 7, lineHeight: 1.4, color: '#bbb', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const },
  entry: { padding: '1px 0' },
  warn: { color: '#ffaa00' },
  error: { color: '#ff4444' },
  time: { color: '#555', marginRight: 4 },
};

function escapeHtml(str: string) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c] || c);
}

export default function LogViewer() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await invoke<{ logs: LogEntry[]; total: number }>('get_logs', { since: total });
        if (data.logs?.length) {
          setLogs(prev => [...prev, ...data.logs]);
          if (open) {
            requestAnimationFrame(() => {
              if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
            });
          }
        }
        setTotal(data.total);
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [total, open]);

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setOpen(!open)}>
        <span>📋 Log</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      <div ref={bodyRef} style={styles.body(open)}>
        <div style={styles.content}>
          {logs.map((entry, i) => (
            <div key={i} style={{ ...styles.entry, ...(entry.level === 'warn' ? styles.warn : entry.level === 'error' ? styles.error : {}) }}>
              <span style={styles.time}>[{entry.timestamp}]</span>
              {escapeHtml(entry.message)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
