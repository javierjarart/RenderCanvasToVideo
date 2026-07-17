import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface DropZoneProps {
  onFileSelected: (path: string, name: string) => void;
}

const styles = {
  container: { position: 'relative' as const },
  button: {
    width: '100%', height: 24, padding: '0 8px',
    background: '#2a2a2a', color: 'var(--text)',
    border: '1px solid #3a3a3a', borderRadius: 'var(--radius-btn)',
    fontSize: 9, fontWeight: 600, cursor: 'pointer',
    textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  },
  pathDisplay: {
    height: 18, lineHeight: '18px', fontSize: 8, color: '#888',
    fontFamily: 'var(--font-mono)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    padding: '0 3px', background: '#121212', borderRadius: 'var(--radius)',
  },
};

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [folderName, setFolderName] = useState('');

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Selecciona la carpeta del proyecto',
      });
      if (selected) {
        const name = selected.split('/').pop() || selected.split('\\').pop() || 'proyecto';
        setFolderName(name);
        onFileSelected(selected, name);
      }
    } catch (err) {
      alert('Error al seleccionar carpeta: ' + (err as Error).message);
    }
  };

  return (
    <div style={styles.container}>
      <label style={{ display: 'block', marginBottom: 1, fontSize: 9, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.3px', lineHeight: 1 }}>
        Carpeta del proyecto
      </label>
      <button type="button" style={styles.button} onClick={handleSelectFolder}>
        📁 Seleccionar carpeta
      </button>
      {folderName && <div style={styles.pathDisplay}>📁 {folderName}</div>}
    </div>
  );
}
