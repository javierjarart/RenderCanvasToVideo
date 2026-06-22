import { useState, useRef, type DragEvent } from 'react';

interface DropZoneProps {
  onFileSelected: (path: string, name: string) => void;
}

const styles = {
  container: { position: 'relative' as const },
  label: { display: 'block', marginBottom: 1, fontSize: 9, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.3px', lineHeight: 1 },
  button: { width: '100%', height: 24, padding: '0 8px', background: '#2a2a2a', color: 'var(--text)', border: '1px solid #3a3a3a', borderRadius: 'var(--radius-btn)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  pathDisplay: { height: 18, lineHeight: '18px', fontSize: 8, color: '#888', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, padding: '0 3px', background: '#121212', borderRadius: 'var(--radius)' },
  overlay: { display: 'none', position: 'absolute' as const, inset: 0, background: 'rgba(255, 72, 0, 0.15)', border: '2px dashed var(--accent)', borderRadius: 'var(--radius)', justifyContent: 'center', alignItems: 'center', fontSize: 10, fontWeight: 600, color: 'var(--accent)', pointerEvents: 'none' as const, zIndex: 10 },
  overlayVisible: { display: 'flex' },
};

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList) => {
    const formData = new FormData();
    for (const f of files) formData.append('files', f, f.name);
    try {
      const res = await fetch('/api/upload-project', { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = await res.json();
      setFileName(files[0].name);
      onFileSelected(data.path, files[0].name);
    } catch (err) {
      alert('Error al subir archivo: ' + (err as Error).message);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const htmlFile = Array.from(files).find(f => f.name.endsWith('.html'));
    if (!htmlFile) { alert('Solo se aceptan archivos .html'); return; }
    const dt = new DataTransfer();
    dt.items.add(htmlFile);
    handleUpload(dt.files);
  };

  return (
    <div
      className="form-group"
      style={styles.container}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <label>Archivo del proyecto</label>
      <button type="button" style={styles.button} onClick={() => fileInputRef.current?.click()}>
        📄 Subir archivo
      </button>
      <input ref={fileInputRef} type="file" accept=".html" hidden onChange={e => {
        if (e.target.files?.length) handleUpload(e.target.files);
        e.target.value = '';
      }} />
      <div style={{ ...styles.overlay, ...(dragOver ? styles.overlayVisible : {}) }}>
        Suelta el archivo aquí
      </div>
      {fileName && <div style={styles.pathDisplay}>📄 {fileName}</div>}
    </div>
  );
}
