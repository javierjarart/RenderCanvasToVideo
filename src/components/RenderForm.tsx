import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import DropZone from './DropZone';
import type { Preset, ColorProfile, RenderParams } from '../types';

const PRESETS: Record<string, Preset> = {
  'hd-30':           { name: 'HD 30fps',        width: 1920, height: 1080, fps: 30, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hd-60':           { name: 'HD 60fps',        width: 1920, height: 1080, fps: 60, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'fullhd-60':       { name: 'Full HD 60fps',   width: 1920, height: 1080, fps: 60, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  '4k-30':           { name: '4K 30fps',         width: 3840, height: 2160, fps: 30, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  '4k-60':           { name: '4K 60fps',         width: 3840, height: 2160, fps: 60, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'square-1k-30':    { name: 'Square 1K 30fps',  width: 1080, height: 1080, fps: 30, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'vertical-hd-30':  { name: 'Vertical HD 30fps',width: 1080, height: 1920, fps: 30, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'preview':         { name: 'Preview',          width: 640,  height: 360,  fps: 15, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'draft':           { name: 'Draft',            width: 854,  height: 480,  fps: 24, codec: 'libx264', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hap-q-hd':        { name: 'HAP_Q HD',         width: 1920, height: 1080, fps: 60, codec: 'hap',    container: '.mov', pixFmt: 'yuv420p', codecParams: { format: 'hap_q' } },
  'hap-q-4k':        { name: 'HAP_Q 4K',         width: 3840, height: 2160, fps: 30, codec: 'hap',    container: '.mov', pixFmt: 'yuv420p', codecParams: { format: 'hap_q' } },
  'hap-alpha-hd':    { name: 'HAP_Alpha HD',     width: 1920, height: 1080, fps: 60, codec: 'hap',    container: '.mov', pixFmt: 'yuv420p', codecParams: { format: 'hap_alpha' } },
  'cfhd-film-hd':    { name: 'CineForm Film HD', width: 1920, height: 1080, fps: 60, codec: 'cfhd',   container: '.mov', pixFmt: 'yuv422p', codecParams: { quality: 'film1' } },
  'cfhd-high-hd':    { name: 'CineForm High HD', width: 1920, height: 1080, fps: 60, codec: 'cfhd',   container: '.mov', pixFmt: 'yuv422p', codecParams: { quality: 'high' } },
  'cfhd-medium-hd':  { name: 'CineForm Medium HD',width:1920, height:1080, fps:60, codec: 'cfhd',   container: '.mov', pixFmt: 'yuv422p', codecParams: { quality: 'medium' } },
  'cfhd-film-4k':    { name: 'CineForm Film 4K', width: 3840, height: 2160, fps: 30, codec: 'cfhd',   container: '.mov', pixFmt: 'yuv422p', codecParams: { quality: 'film1' } },
  'hevc-hd-30':      { name: 'HEVC HD 30fps',     width: 1920, height: 1080, fps: 30, codec: 'libx265', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hevc-hd-60':      { name: 'HEVC HD 60fps',     width: 1920, height: 1080, fps: 60, codec: 'libx265', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hevc-4k-30':      { name: 'HEVC 4K 30fps',      width: 3840, height: 2160, fps: 30, codec: 'libx265', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hevc-4k-60':      { name: 'HEVC 4K 60fps',      width: 3840, height: 2160, fps: 60, codec: 'libx265', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'hevc-hdr-hd':     { name: 'HEVC HDR HD 30fps',  width: 1920, height: 1080, fps: 30, codec: 'libx265', container: '.mp4', pixFmt: 'yuv420p10le', codecParams: {} },
  'nvenc-h264-hd':   { name: 'NVENC H.264 HD',     width: 1920, height: 1080, fps: 60, codec: 'h264_nvenc', container: '.mp4', pixFmt: 'yuv420p', codecParams: { preset: 'p4' } },
  'nvenc-h264-4k':   { name: 'NVENC H.264 4K',     width: 3840, height: 2160, fps: 30, codec: 'h264_nvenc', container: '.mp4', pixFmt: 'yuv420p', codecParams: { preset: 'p4' } },
  'nvenc-hevc-hd':   { name: 'NVENC HEVC HD',      width: 1920, height: 1080, fps: 60, codec: 'hevc_nvenc', container: '.mp4', pixFmt: 'yuv420p', codecParams: { preset: 'p4' } },
  'nvenc-hevc-4k':   { name: 'NVENC HEVC 4K',      width: 3840, height: 2160, fps: 30, codec: 'hevc_nvenc', container: '.mp4', pixFmt: 'yuv420p', codecParams: { preset: 'p4' } },
  'vaapi-h264-hd':   { name: 'VAAPI H.264 HD',     width: 1920, height: 1080, fps: 60, codec: 'h264_vaapi', container: '.mp4', pixFmt: 'nv12', codecParams: {} },
  'vaapi-hevc-hd':   { name: 'VAAPI HEVC HD',      width: 1920, height: 1080, fps: 60, codec: 'hevc_vaapi', container: '.mp4', pixFmt: 'nv12', codecParams: {} },
  'videotoolbox-h264': { name: 'VideoToolbox H.264 HD', width: 1920, height: 1080, fps: 60, codec: 'h264_videotoolbox', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
  'videotoolbox-hevc': { name: 'VideoToolbox HEVC HD',  width: 1920, height: 1080, fps: 60, codec: 'hevc_videotoolbox', container: '.mp4', pixFmt: 'yuv420p', codecParams: {} },
};

const GROUP_LABELS: Record<string, string> = {
  'hd-30': '-- H.264 MP4 --',
  'hap-q-hd': '-- HAP MOV --',
  'cfhd-film-hd': '-- CineForm MOV --',
  'hevc-hd-30': '-- HEVC H.265 MP4 --',
  'nvenc-h264-hd': '-- NVENC (NVIDIA) --',
  'vaapi-h264-hd': '-- VAAPI (Linux/Intel/AMD) --',
  'videotoolbox-h264': '-- VideoToolbox (macOS) --',
};

const COLOR_PROFILES: Record<string, ColorProfile> = {
  'bt709':  { name: 'Rec.709',  primaries: 'bt709',    trc: 'bt709',    space: 'bt709' },
  'bt2020': { name: 'Rec.2020', primaries: 'bt2020',    trc: 'bt2020-10', space: 'bt2020nc' },
  'dcip3':  { name: 'DCI-P3',   primaries: 'smpte432',  trc: 'gamma28',   space: 'smpte432' },
};

const styles = {
  label: { display: 'block', marginBottom: 1, fontSize: 9, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.3px', lineHeight: 1 },
  input: { width: '100%', height: 24, padding: '0 5px', background: '#0d0d0c', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: '#e8e8e8', outline: 'none', fontSize: 9 },
  select: { width: '100%', height: 24, padding: '0 5px', background: '#0d0d0c', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: '#e8e8e8', outline: 'none', fontSize: 9 },
  row: { display: 'flex', gap: 4, alignItems: 'flex-end' },
  flex1: { flex: 1 },
  formGroup: { marginBottom: 1 },
  submitBtn: { height: 24, padding: '0 8px', width: '100%', background: '#2a2a2a', color: 'var(--accent)', border: '1px solid #3a3a3a', borderRadius: 'var(--radius-btn)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  codecInfo: { width: '100%', height: 24, padding: '0 5px', background: '#0d0d0c', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', outline: 'none', fontSize: 9, cursor: 'default' },
  hint: { fontSize: 9, color: 'var(--muted)', lineHeight: '24px' },
};

export default function RenderForm() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState('hd-60');
  const [colorProfileKey, setColorProfileKey] = useState('bt709');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(60);
  const [duration, setDuration] = useState(10);
  const [bgColor, setBgColor] = useState('#000000');
  const [canvasSelector, _setCanvasSelector] = useState('');
  const [filters, setFilters] = useState('');
  const [hwaccel, setHwaccel] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const preset = PRESETS[presetKey];
  const codecInfo = preset
    ? `${preset.codec}  |  ${preset.container}  |  ${preset.pixFmt}  |  ${Object.entries(preset.codecParams).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}`
    : '';

  const applyPreset = useCallback((key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setWidth(p.width);
    setHeight(p.height);
    setFps(p.fps);
  }, []);

  useEffect(() => {
    applyPreset(presetKey);
  }, [presetKey, applyPreset]);

  const handleFileSelected = async (path: string, _name: string) => {
    setProjectPath(path);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPath) { alert('Selecciona una carpeta de proyecto primero.'); return; }

    const colorProfile = COLOR_PROFILES[colorProfileKey] || {};

    const body: RenderParams = {
      project: null,
      width, height, fps, duration, bgColor,
      customProjectPath: projectPath,
      codec: preset.codec,
      container: preset.container,
      pixFmt: preset.pixFmt,
      codecParams: preset.codecParams,
      colorPrimaries: colorProfile.primaries,
      colorTrc: colorProfile.trc,
      colorSpace: colorProfile.space,
      canvasSelector: canvasSelector || undefined,
      filters: filters || undefined,
      hwaccel: hwaccel || undefined,
    };

    try {
      await invoke('render_project', { params: body });
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    }
  };

  const renderOpts: { key: string; name: string; isGroup: boolean }[] = [];
  let lastGroup = '';
  for (const [key, p] of Object.entries(PRESETS)) {
    const group = GROUP_LABELS[key];
    if (group && group !== lastGroup) {
      lastGroup = group;
      renderOpts.push({ key: `__group_${key}`, name: group, isGroup: true });
    }
    renderOpts.push({ key, name: `${p.name}  (${p.width}x${p.height} @ ${p.fps}fps)`, isGroup: false });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={styles.row}>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <DropZone onFileSelected={handleFileSelected} />
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Presets</label>
          <select style={styles.select} value={presetKey} onChange={e => setPresetKey(e.target.value)}>
            {renderOpts.map(opt =>
              opt.isGroup
                ? <option key={opt.key} disabled>{opt.name}</option>
                : <option key={opt.key} value={opt.key}>{opt.name}</option>
            )}
          </select>
        </div>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Perfil de color</label>
          <select style={styles.select} value={colorProfileKey} onChange={e => setColorProfileKey(e.target.value)}>
            {Object.entries(COLOR_PROFILES).map(([key, cp]) => (
              <option key={key} value={key}>{cp.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Ancho (px)</label>
          <input style={styles.input} type="number" value={width} onChange={e => setWidth(Number(e.target.value))} required />
        </div>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Alto (px)</label>
          <input style={styles.input} type="number" value={height} onChange={e => setHeight(Number(e.target.value))} required />
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>FPS</label>
          <input style={styles.input} type="number" value={fps} onChange={e => setFps(Number(e.target.value))} required />
        </div>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Duración (seg)</label>
          <input style={styles.input} type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} required />
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Color de fondo</label>
          <input style={{ ...styles.input, height: 24, padding: '2px 4px', cursor: 'pointer' }} type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
        </div>
        <div style={{ ...styles.flex1, ...styles.formGroup }}>
          <label style={styles.label}>Códec / Salida</label>
          <input style={styles.codecInfo} type="text" value={codecInfo} readOnly />
        </div>
      </div>

      <div style={{ marginTop: 2 }}>
        <div
          style={{ fontSize: 8, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▲' : '▼'} Opciones avanzadas
        </div>
        {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
            <div style={styles.row}>
              <div style={{ ...styles.flex1, ...styles.formGroup }}>
                <label style={styles.label}>Filtros FFmpeg (-vf)</label>
                <input
                  style={styles.input}
                  type="text"
                  value={filters}
                  onChange={e => setFilters(e.target.value)}
                  placeholder="eq. scale=1280:720,format=nv12"
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={{ ...styles.flex1, ...styles.formGroup }}>
                <label style={styles.label}>Aceleración HW</label>
                <select style={styles.select} value={hwaccel} onChange={e => setHwaccel(e.target.value)}>
                  <option value="">Ninguna (CPU)</option>
                  <option value="cuda">CUDA (NVIDIA)</option>
                  <option value="vaapi">VAAPI (Linux)</option>
                  <option value="videotoolbox">VideoToolbox (macOS)</option>
                  <option value="dxva2">DXVA2 (Windows)</option>
                  <option value="qsv">QSV (Intel)</option>
                </select>
              </div>
              <div style={{ ...styles.flex1, ...styles.formGroup }}>
                <label style={styles.label}>Selector canvas</label>
                <input
                  style={styles.input}
                  type="text"
                  value={canvasSelector}
                  onChange={e => _setCanvasSelector(e.target.value)}
                  placeholder="canvas (default)"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <button type="submit" style={styles.submitBtn}>
        ▶ Añadir a cola
      </button>
    </form>
  );
}
