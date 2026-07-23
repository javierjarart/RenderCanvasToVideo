const PRESETS = {
  "hd-30":           { name: "HD 30fps",        width: 1920, height: 1080, fps: 30, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "hd-60":           { name: "HD 60fps",        width: 1920, height: 1080, fps: 60, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "fullhd-60":       { name: "Full HD 60fps",   width: 1920, height: 1080, fps: 60, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "4k-30":           { name: "4K 30fps",         width: 3840, height: 2160, fps: 30, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "4k-60":           { name: "4K 60fps",         width: 3840, height: 2160, fps: 60, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "square-1k-30":    { name: "Square 1K 30fps",  width: 1080, height: 1080, fps: 30, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "vertical-hd-30":  { name: "Vertical HD 30fps",width: 1080, height: 1920, fps: 30, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "preview":         { name: "Preview",          width: 640,  height: 360,  fps: 15, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "draft":           { name: "Draft",            width: 854,  height: 480,  fps: 24, codec: "libx264", container: ".mp4", pixFmt: "yuv420p", codecParams: {} },
  "hap-q-hd":        { name: "HAP_Q HD",         width: 1920, height: 1080, fps: 60, codec: "hap",    container: ".mov", pixFmt: "yuv420p", codecParams: { format: "hap_q" } },
  "hap-q-4k":        { name: "HAP_Q 4K",         width: 3840, height: 2160, fps: 30, codec: "hap",    container: ".mov", pixFmt: "yuv420p", codecParams: { format: "hap_q" } },
  "hap-alpha-hd":    { name: "HAP_Alpha HD",     width: 1920, height: 1080, fps: 60, codec: "hap",    container: ".mov", pixFmt: "yuv420p", codecParams: { format: "hap_alpha" } },
  "cfhd-film-hd":    { name: "CineForm Film HD", width: 1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "film1" } },
  "cfhd-high-hd":    { name: "CineForm High HD", width: 1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "high" } },
  "cfhd-medium-hd":  { name: "CineForm Medium HD",width:1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "medium" } },
  "cfhd-film-4k":    { name: "CineForm Film 4K", width: 3840, height: 2160, fps: 30, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "film1" } },
};

const GROUP_LABELS = {
  "hd-30": "-- H.264 MP4 --",
  "hap-q-hd": "-- HAP MOV --",
  "cfhd-film-hd": "-- CineForm MOV --",
};

const COLOR_PROFILES = {
  "bt709":  { name: "Rec.709",  primaries: "bt709",    trc: "bt709",    space: "bt709" },
  "bt2020": { name: "Rec.2020", primaries: "bt2020",    trc: "bt2020-10", space: "bt2020nc" },
  "dcip3":  { name: "DCI-P3",   primaries: "smpte432",  trc: "gamma28",   space: "smpte432" },
};

let customOutputDir = null;
let customInputPath = null;
let canvasDetection = null;

// ─── Poblar preset dropdown ──────────────────────────────────────────────────
(function populatePresets() {
  const select = document.getElementById('preset');
  if (!select) return;
  let html = '';
  let currentGroup = '';
  for (const [key, p] of Object.entries(PRESETS)) {
    const group = GROUP_LABELS[key];
    if (group && group !== currentGroup) {
      currentGroup = group;
      html += `<option disabled>${group}</option>`;
    }
    html += `<option value="${key}">${p.name}  (${p.width}x${p.height} @ ${p.fps}fps)</option>`;
  }
  select.innerHTML = html;
  select.value = 'hd-60';
  applyPreset('hd-60');
})();

// ─── Poblar color profile dropdown ───────────────────────────────────────────
(function populateColorProfiles() {
  const select = document.getElementById('colorProfile');
  if (!select) return;
  let html = '';
  for (const [key, cp] of Object.entries(COLOR_PROFILES)) {
    html += `<option value="${key}">${cp.name}</option>`;
  }
  select.innerHTML = html;
})();

// ─── Aplicar preset a los campos ─────────────────────────────────────────────
function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  document.getElementById('width').value = p.width;
  document.getElementById('height').value = p.height;
  document.getElementById('fps').value = p.fps;
  const params = Object.entries(p.codecParams).map(([k, v]) => `${k}=${v}`).join(' ') || '-';
  document.getElementById('codecInfo').value = `${p.codec}  |  ${p.container}  |  ${p.pixFmt}  |  ${params}`;
}

document.getElementById('preset').onchange = function () {
  applyPreset(this.value);
};

// ─── Manejar selección de carpeta/archivo de entrada ─────────────────────────
function showInputClearButton() {
  if (document.getElementById('btnCancelInput')) return;
  const btn = document.createElement('button');
  btn.id = 'btnCancelInput';
  btn.innerText = '✕';
  btn.type = 'button';
  btn.style.width = '30px';
  btn.style.padding = '5px';
  btn.style.marginTop = '0';
  btn.onclick = () => {
    customInputPath = null;
    document.getElementById('selectedInputDisplay').innerText = '';
    document.getElementById('canvasRow').style.display = 'none';
    btn.remove();
  };
  document.getElementById('selectedInputDisplay').parentNode.appendChild(btn);
}

async function detectCanvases(filePath) {
  const canvasSelect = document.getElementById('canvasSelect');
  const canvasRow = document.getElementById('canvasRow');
  canvasRow.style.display = 'none';
  canvasSelect.innerHTML = '';

  try {
    const res = await fetch('/api/detect-canvases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath })
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data.count > 0) {
      for (const c of data.canvases) {
        const label = c.id ? `Canvas ${c.index} (#${c.id})` : `Canvas ${c.index}`;
        const opt = document.createElement('option');
        opt.value = c.index;
        opt.textContent = label;
        canvasSelect.appendChild(opt);
      }
      canvasRow.style.display = 'flex';
    }
  } catch (_) {}
}

const btnChooseInput = document.getElementById('btnChooseInput');
const selectedInputDisplay = document.getElementById('selectedInputDisplay');

if (btnChooseInput) {
  btnChooseInput.onclick = async () => {
    const result = await window.electronAPI.chooseInputPath();
    if (result) {
      customInputPath = result;
      selectedInputDisplay.innerText = result;
      showInputClearButton();
      detectCanvases(result);
    }
  };
}

// ─── Drag & drop ─────────────────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const dropText = document.getElementById('dropText');

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
    dropText.innerText = 'Suelta para seleccionar';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
    dropText.innerText = 'Suelta un archivo .html o carpeta aquí';
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    dropText.innerText = 'Suelta un archivo .html o carpeta aquí';

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (window.electronAPI && window.electronAPI.getDroppedPath) {
      const path = window.electronAPI.getDroppedPath(file);
      if (path) {
        customInputPath = path;
        selectedInputDisplay.innerText = path;
        showInputClearButton();
        detectCanvases(path);
      }
    }
  });
}

// ─── Carpeta de salida ───────────────────────────────────────────────────────
const btnChooseDir = document.getElementById('btnChooseDir');
const selectedDirDisplay = document.getElementById('selectedDirDisplay');

if (btnChooseDir) {
  btnChooseDir.onclick = async () => {
    const path = await window.electronAPI.chooseOutputDir();
    if (path) {
      customOutputDir = path;
      selectedDirDisplay.innerText = path;
    }
  };
}

// ─── Abrir carpeta ───────────────────────────────────────────────────────────
const btnOpenFolder = document.getElementById('btnOpenFolder');
if (btnOpenFolder) {
  btnOpenFolder.onclick = () => {
    window.electronAPI.openPath(customOutputDir || 'renders');
  };
}

// ─── Submit ──────────────────────────────────────────────────────────────────
document.getElementById('renderForm').onsubmit = async (e) => {
  e.preventDefault();

  const btn = document.getElementById('btnRender');
  const progressBox = document.getElementById('progressBox');
  const progressFill = document.getElementById('progressFill');
  const statusText = document.getElementById('statusText');
  const downloadLink = document.getElementById('downloadLink');
  const btnOpenFolderElem = document.getElementById('btnOpenFolder');

  if (!customInputPath) {
    alert("Selecciona una carpeta o archivo .html de entrada.");
    return;
  }

  btn.disabled = true;
  btn.innerText = "⏳ Renderizando...";
  progressBox.style.display = 'block';
  downloadLink.style.display = 'none';
  if (btnOpenFolderElem) btnOpenFolderElem.style.display = 'none';
  progressFill.style.width = '0%';
  statusText.innerText = 'Iniciando render...';

  const presetKey = document.getElementById('preset').value;
  const preset = PRESETS[presetKey] || {};
  const colorProfileKey = document.getElementById('colorProfile').value;
  const colorProfile = COLOR_PROFILES[colorProfileKey] || {};

  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: document.getElementById('width').value,
        height: document.getElementById('height').value,
        fps: document.getElementById('fps').value,
        duration: document.getElementById('duration').value,
        bgColor: document.getElementById('bgColor').value,
        customOutputDir: customOutputDir,
        customProjectPath: customInputPath,
        codec: preset.codec || 'libx264',
        container: preset.container || '.mp4',
        pixFmt: preset.pixFmt || 'yuv420p',
        codecParams: preset.codecParams || {},
        colorPrimaries: colorProfile.primaries || '',
        colorTrc: colorProfile.trc || '',
        colorSpace: colorProfile.space || '',
        canvasIndex: parseInt(document.getElementById('canvasSelect').value) || 0,
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    statusText.innerText = 'Render en progreso...';
  } catch (err) {
    statusText.innerText = `❌ Error: ${err.message}`;
    btn.disabled = false;
    btn.innerText = "▶ Reintentar";
    progressBox.style.display = 'none';
    return;
  }

  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();

      if (status.state === 'rendering') {
        const percent = Math.round((status.progress / status.total) * 100);
        statusText.innerText = `Renderizando: ${status.progress} / ${status.total} cuadros (${percent}%)`;
        progressFill.style.width = `${percent}%`;
      } else if (status.state === 'done') {
        clearInterval(interval);
        statusText.innerText = `¡Render completado exitosamente! 🎉`;
        progressFill.style.width = `100%`;
        downloadLink.href = status.fileUrl;
        downloadLink.style.display = 'block';
        if (btnOpenFolderElem) btnOpenFolderElem.style.display = 'block';
        btn.disabled = false;
        btn.innerText = "▶ Iniciar Nuevo Render";
      } else if (status.state === 'error') {
        clearInterval(interval);
        statusText.innerText = `❌ Error: ${status.error}`;
        btn.disabled = false;
        btn.innerText = "▶ Reintentar";
      }
    } catch (err) {
      clearInterval(interval);
      fetch('/api/health').then(r => r.json()).catch(() => {}).then(alive => {
        statusText.innerText = alive && alive.ok
          ? `❌ Error de conexión con el servidor`
          : `❌ El servidor dejó de responder`;
      });
      btn.disabled = false;
      btn.innerText = "▶ Reintentar";
    }
  }, 1000);
};

// ─── Log de ejecución ────────────────────────────────────────────────────────
let logPollingInterval = null;
let lastLogCount = 0;

function toggleLog() {
  const body = document.getElementById('logBody');
  const toggle = document.getElementById('logToggle');
  const isOpen = body.classList.toggle('open');
  toggle.innerText = isOpen ? '▲' : '▼';
  if (isOpen) scrollLogToBottom();
}

document.getElementById('logHeader')?.addEventListener('click', toggleLog);

function scrollLogToBottom() {
  const body = document.getElementById('logBody');
  body.scrollTop = body.scrollHeight;
}

function appendLogs(logs) {
  const container = document.getElementById('logContent');
  for (const entry of logs) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.level}`;
    div.innerHTML = `<span class="log-time">[${entry.timestamp}]</span>${escapeHtml(entry.message)}`;
    container.appendChild(div);
  }
  if (document.getElementById('logBody').classList.contains('open')) {
    scrollLogToBottom();
  }
}

function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, c => map[c]);
}

function startLogPolling() {
  if (logPollingInterval) return;
  logPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/logs?since=${lastLogCount}`);
      const data = await res.json();
      if (data.logs && data.logs.length > 0) {
        appendLogs(data.logs);
      }
      lastLogCount = data.total;
    } catch (e) {
      console.warn('[LogPoller]', e);
    }
  }, 1000);
}

startLogPolling();