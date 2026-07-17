const PRESETS = {
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

const GROUP_LABELS = {
  'hd-30': '-- H.264 MP4 --',
  'hap-q-hd': '-- HAP MOV --',
  'cfhd-film-hd': '-- CineForm MOV --',
  'hevc-hd-30': '-- HEVC H.265 MP4 --',
  'nvenc-h264-hd': '-- NVENC (NVIDIA) --',
  'vaapi-h264-hd': '-- VAAPI (Linux/Intel/AMD) --',
  'videotoolbox-h264': '-- VideoToolbox (macOS) --',
};

const COLOR_PROFILES = {
  'bt709':  { name: 'Rec.709',  primaries: 'bt709',    trc: 'bt709',    space: 'bt709' },
  'bt2020': { name: 'Rec.2020', primaries: 'bt2020',    trc: 'bt2020-10', space: 'bt2020nc' },
  'dcip3':  { name: 'DCI-P3',   primaries: 'smpte432',  trc: 'gamma28',   space: 'smpte432' },
};

const STATUS_CONFIG = {
  queued: { label: 'En cola', color: '#888' },
  rendering: { label: 'Renderizando', color: '#ff4800' },
  done: { label: 'Completado', color: '#4caf50' },
  error: { label: 'Error', color: '#f44336' },
  cancelled: { label: 'Cancelado', color: '#ff9800' },
};

const state = {
  projectPath: null,
  projectEntry: null,
  logs: [],
  totalLogs: 0,
  jobs: [],
  logOpen: false,
};

const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;

const $ = (id) => document.getElementById(id);

const renderForm = $('render-form');
const btnSelectFolder = $('btn-select-folder');
const btnSelectFile = $('btn-select-file');
const projectPathEl = $('project-path');
const presetSelect = $('preset-select');
const colorProfileSelect = $('color-profile-select');
const inputWidth = $('input-width');
const inputHeight = $('input-height');
const inputFps = $('input-fps');
const inputDuration = $('input-duration');
const inputBgColor = $('input-bg-color');
const codecInfo = $('codec-info');
const advancedToggle = $('advanced-toggle');
const advancedOptions = $('advanced-options');
const inputFilters = $('input-filters');
const selectHwaccel = $('select-hwaccel');
const inputCanvasSelector = $('input-canvas-selector');
const progressSection = $('progress-section');
const logHeader = $('log-header');
const logBody = $('log-body');
const logContent = $('log-content');
const logToggle = $('log-toggle');

function renderPresetOptions() {
  let lastGroup = '';
  for (const [key, p] of Object.entries(PRESETS)) {
    const group = GROUP_LABELS[key];
    if (group && group !== lastGroup) {
      lastGroup = group;
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = group;
      presetSelect.appendChild(opt);
    }
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${p.name}  (${p.width}x${p.height} @ ${p.fps}fps)`;
    presetSelect.appendChild(opt);
  }
}

function renderColorProfileOptions() {
  for (const [key, cp] of Object.entries(COLOR_PROFILES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = cp.name;
    colorProfileSelect.appendChild(opt);
  }
}

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  inputWidth.value = p.width;
  inputHeight.value = p.height;
  inputFps.value = p.fps;
  updateCodecInfo(key);
}

function updateCodecInfo(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    codecInfo.value = '';
    return;
  }
  const params = Object.entries(preset.codecParams)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ') || '-';
  codecInfo.value = `${preset.codec}  |  ${preset.container}  |  ${preset.pixFmt}  |  ${params}`;
}

async function openDialog(options) {
  try {
    if (window.__TAURI__.dialog?.open) {
      const selected = await window.__TAURI__.dialog.open(options);
      return selected || null;
    }
    const selected = await invoke('plugin:dialog|open', options);
    return selected || null;
  } catch (err) {
    alert('Error al seleccionar: ' + err);
    return null;
  }
}

btnSelectFolder.addEventListener('click', async () => {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: 'Selecciona la carpeta del proyecto',
  });
  if (selected) {
    const name = selected.split('/').pop() || selected.split('\\').pop() || 'proyecto';
    projectPathEl.textContent = '📁 ' + name;
    state.projectPath = selected;
    state.projectEntry = null;
  }
});

btnSelectFile.addEventListener('click', async () => {
  const selected = await openDialog({
    multiple: false,
    title: 'Selecciona el archivo HTML del proyecto',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
  });
  if (selected) {
    const name = selected.split('/').pop() || selected.split('\\').pop() || 'proyecto';
    const parent = selected.substring(0, selected.lastIndexOf('/')) ||
                   selected.substring(0, selected.lastIndexOf('\\')) || '';
    projectPathEl.textContent = '📄 ' + name + '  (' + (parent.split('/').pop() || parent.split('\\').pop() || parent) + ')';
    state.projectPath = parent;
    state.projectEntry = name;
  }
});

presetSelect.addEventListener('change', () => {
  applyPreset(presetSelect.value);
});

colorProfileSelect.addEventListener('change', () => {
  updateCodecInfo(presetSelect.value);
});

advancedToggle.addEventListener('click', () => {
  const hidden = advancedOptions.style.display === 'none';
  advancedOptions.style.display = hidden ? 'flex' : 'none';
  advancedToggle.innerHTML = hidden ? '▲ Opciones avanzadas' : '▼ Opciones avanzadas';
});

renderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.projectPath) {
    alert('Selecciona una carpeta de proyecto primero.');
    return;
  }

  const preset = PRESETS[presetSelect.value];
  const colorProfile = COLOR_PROFILES[colorProfileSelect.value] || {};

  const body = {
    project: null,
    width: parseInt(inputWidth.value),
    height: parseInt(inputHeight.value),
    fps: parseInt(inputFps.value),
    duration: parseInt(inputDuration.value),
    bgColor: inputBgColor.value,
    customProjectPath: state.projectPath,
    codec: preset.codec,
    container: preset.container,
    pixFmt: preset.pixFmt,
    codecParams: preset.codecParams,
    colorPrimaries: colorProfile.primaries,
    colorTrc: colorProfile.trc,
    colorSpace: colorProfile.space,
    canvasSelector: inputCanvasSelector.value || undefined,
    filters: inputFilters.value || undefined,
    hwaccel: selectHwaccel.value || undefined,
    projectEntry: state.projectEntry || undefined,
  };

  try {
    await invoke('render_project', { params: body });
  } catch (err) {
    alert('Error: ' + err);
  }
});

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c] || c);
}

function renderJobs() {
  if (state.jobs.length === 0) {
    progressSection.style.display = 'none';
    return;
  }
  progressSection.style.display = 'flex';

  let html = '';
  for (const job of state.jobs) {
    const cfg = STATUS_CONFIG[job.status] || { label: job.status, color: '#888' };
    const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

    let statusText = '';
    if (job.status === 'rendering') {
      statusText = `${job.progress} / ${job.total} cuadros (${pct}%)`;
    } else if (job.status === 'queued') {
      statusText = 'En espera...';
    } else if (job.status === 'done') {
      statusText = job.file_url || job.output_filename;
    } else if (job.status === 'error') {
      statusText = job.error || 'Error desconocido';
    } else if (job.status === 'cancelled') {
      statusText = 'Detenido por el usuario';
    }

    let actionsHtml = '';
    if (job.status === 'rendering') {
      actionsHtml += `<button class="job-btn" data-action="cancel" data-job-id="${job.id}">Cancelar</button>`;
    }
    if (['done', 'error', 'cancelled'].includes(job.status)) {
      actionsHtml += `<button class="job-btn" data-action="remove" data-job-id="${job.id}">Eliminar</button>`;
    }

    html += `
      <div class="job-item" data-job-id="${job.id}">
        <div class="job-header">
          <span class="job-name">${escapeHtml(job.project_name)}</span>
          <span class="job-badge" style="background:${cfg.color}22;color:${cfg.color}">${cfg.label}</span>
        </div>
        <div class="bar-outer">
          <div class="bar-inner" style="width:${job.status === 'done' ? 100 : pct}%;background:${cfg.color}"></div>
        </div>
        <div class="job-status">${escapeHtml(statusText)}</div>
        <div class="job-actions">${actionsHtml}</div>
      </div>
    `;
  }
  progressSection.innerHTML = html;

  progressSection.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await invoke('cancel_render', { jobId: btn.dataset.jobId });
      } catch {}
    });
  });
  progressSection.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await invoke('remove_job', { jobId: btn.dataset.jobId });
      } catch {}
    });
  });
}

function appendLogs(newLogs) {
  for (const entry of newLogs) {
    const cls = entry.level === 'error' ? 'log-entry error' : entry.level === 'warn' ? 'log-entry warn' : 'log-entry';
    const line = document.createElement('div');
    line.className = cls;
    line.innerHTML = `<span class="log-time">[${escapeHtml(entry.timestamp)}]</span>${escapeHtml(entry.message)}`;
    logContent.appendChild(line);
  }
  if (state.logOpen && logBody.scrollTop !== undefined) {
    logBody.scrollTop = logBody.scrollHeight;
  }
}

logHeader.addEventListener('click', () => {
  state.logOpen = !state.logOpen;
  logBody.style.display = state.logOpen ? 'block' : 'none';
  logToggle.textContent = state.logOpen ? '▲' : '▼';
  if (state.logOpen) {
    logBody.scrollTop = logBody.scrollHeight;
  }
});

async function refreshJobs() {
  try {
    state.jobs = await invoke('get_status');
    renderJobs();
  } catch {}
}

async function init() {
  renderPresetOptions();
  renderColorProfileOptions();

  presetSelect.value = 'hd-60';
  applyPreset('hd-60');
  colorProfileSelect.value = 'bt709';

  await refreshJobs();

  listen('render-started', () => refreshJobs());
  listen('render-progress', () => refreshJobs());
  listen('render-done', () => refreshJobs());

  setInterval(refreshJobs, 2000);
  setInterval(async () => {
    try {
      const data = await invoke('get_logs', { since: state.totalLogs });
      if (data.logs && data.logs.length) {
        state.logs = state.logs.concat(data.logs);
        appendLogs(data.logs);
      }
      state.totalLogs = data.total;
    } catch {}
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
