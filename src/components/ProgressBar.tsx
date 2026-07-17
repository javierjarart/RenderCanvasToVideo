import { useRenderQueue } from '../hooks/useRenderQueue';
import { invoke } from '@tauri-apps/api/core';
import type { JobInfo } from '../types';

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginTop: 3 },
  item: {
    background: '#1a1a1a',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '4px 6px',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: 9, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  badge: (color: string) => ({ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: color + '22', color, fontWeight: 600 }),
  barOuter: { width: '100%', background: 'var(--border-light)', borderRadius: 'var(--radius)', overflow: 'hidden', height: 3, marginBottom: 2 },
  barInner: (pct: number, color: string) => ({
    width: `${pct}%`,
    height: '100%',
    background: color,
    transition: 'width 0.3s',
  }),
  status: { fontSize: 8, color: 'var(--muted)' },
  actions: { display: 'flex', gap: 4, marginTop: 2 },
  btn: {
    fontSize: 8, padding: '2px 6px', background: '#2a2a2a', color: 'var(--text)',
    border: '1px solid #3a3a3a', borderRadius: 'var(--radius-btn)', cursor: 'pointer',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  queued: { label: 'En cola', color: '#888' },
  rendering: { label: 'Renderizando', color: '#ff4800' },
  done: { label: 'Completado', color: '#4caf50' },
  error: { label: 'Error', color: '#f44336' },
  cancelled: { label: 'Cancelado', color: '#ff9800' },
};

function JobItem({ job }: { job: JobInfo }) {
  const cfg = STATUS_CONFIG[job.status] || { label: job.status, color: '#888' };
  const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

  const handleCancel = async () => {
    try {
      await invoke('cancel_render', { jobId: job.id });
    } catch {}
  };

  const handleRemove = async () => {
    try {
      await invoke('remove_job', { jobId: job.id });
    } catch {}
  };

  return (
    <div style={styles.item}>
      <div style={styles.header}>
        <span style={styles.name}>{job.project_name}</span>
        <span style={styles.badge(cfg.color)}>{cfg.label}</span>
      </div>
      <div style={styles.barOuter}>
        <div style={styles.barInner(job.status === 'done' ? 100 : pct, cfg.color)} />
      </div>
      <div style={styles.status}>
        {job.status === 'rendering' && `${job.progress} / ${job.total} cuadros (${pct}%)`}
        {job.status === 'queued' && `En espera...`}
        {job.status === 'done' && (job.file_url || job.output_filename)}
        {job.status === 'error' && (job.error || 'Error desconocido')}
        {job.status === 'cancelled' && 'Detenido por el usuario'}
      </div>
      <div style={styles.actions}>
        {job.status === 'rendering' && (
          <button style={styles.btn} onClick={handleCancel}>Cancelar</button>
        )}
        {(job.status === 'done' || job.status === 'error' || job.status === 'cancelled') && (
          <button style={styles.btn} onClick={handleRemove}>Eliminar</button>
        )}
      </div>
    </div>
  );
}

export default function ProgressBar() {
  const { jobs } = useRenderQueue();

  if (jobs.length === 0) return null;

  return (
    <div style={styles.container}>
      {jobs.map(job => (
        <JobItem key={job.id} job={job} />
      ))}
    </div>
  );
}
