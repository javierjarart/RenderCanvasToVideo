import { useRenderStatus } from '../hooks/useRenderStatus';

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, gap: 2, marginTop: 3 },
  statusText: { fontSize: 10, color: 'var(--muted)', textAlign: 'center' as const },
  barOuter: { width: '100%', background: 'var(--border-light)', borderRadius: 'var(--radius)', overflow: 'hidden', height: 4 },
  barInner: (pct: number) => ({
    width: `${pct}%`,
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 0.3s',
  }),
  downloadLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 28, lineHeight: '26px', color: 'var(--text)', fontWeight: 600, textDecoration: 'none',
    border: '1px solid #3a3a3a', padding: '0 6px', borderRadius: 'var(--radius-btn)', fontSize: 9,
    textTransform: 'uppercase' as const, background: '#2a2a2a', marginTop: 4,
  },
};

export default function ProgressBar() {
  const { status } = useRenderStatus();
  const { state, progress, total, fileUrl, error } = status;

  if (state === 'idle') return null;

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  let statusLabel = '';
  if (state === 'rendering') statusLabel = `Renderizando: ${progress} / ${total} cuadros (${pct}%)`;
  else if (state === 'done') statusLabel = '¡Render completado exitosamente! 🎉';
  else if (state === 'error') statusLabel = `❌ Error: ${error}`;
  else if (state === 'cancelled') statusLabel = '⏹ Render detenido';

  return (
    <div style={styles.container}>
      <div style={styles.statusText}>{statusLabel}</div>
      <div style={styles.barOuter}>
        <div style={styles.barInner(state === 'done' ? 100 : pct)} />
      </div>
      {state === 'done' && fileUrl && (
        <a href={fileUrl} download style={styles.downloadLink}>⬇ Guardar Como</a>
      )}
    </div>
  );
}
