import { useRenderQueue } from '../hooks/useRenderQueue';

export default function RenderCapture() {
  const { jobs } = useRenderQueue();
  const rendering = jobs.find(j => j.status === 'rendering');

  if (!rendering) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      right: 8,
      fontSize: 9,
      color: 'var(--muted)',
      background: 'rgba(0,0,0,0.7)',
      padding: '2px 6px',
      borderRadius: 3,
    }}>
      Capturando: {rendering.params.width}x{rendering.params.height} @ {rendering.params.fps}fps — {rendering.project_name}
    </div>
  );
}
