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
  "cfhd-film-hd":    { name: "CineForm Film HD", width: 1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "film" } },
  "cfhd-high-hd":    { name: "CineForm High HD", width: 1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "high" } },
  "cfhd-medium-hd":  { name: "CineForm Medium HD",width:1920, height: 1080, fps: 60, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "medium" } },
  "cfhd-film-4k":    { name: "CineForm Film 4K", width: 3840, height: 2160, fps: 30, codec: "cfhd",   container: ".mov", pixFmt: "yuv422p", codecParams: { quality: "film" } },
};

const GROUP_LABELS = {
  "hd-30": "-- H.264 MP4 --",
  "hap-q-hd": "-- HAP MOV --",
  "cfhd-film-hd": "-- CineForm MOV --",
};

let customOutputDir = null;
let customProjectPath = null;

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

// ─── Manejar selección de carpeta de proyecto externa ────────────────────────
const btnChooseProjectDir = document.getElementById('btnChooseProjectDir');
const selectedProjectDirDisplay = document.getElementById('selectedProjectDirDisplay');

if (btnChooseProjectDir) {
  btnChooseProjectDir.onclick = async () => {
    const path = await window.electronAPI.chooseProjectDir();
    if (path) {
      customProjectPath = path;
      selectedProjectDirDisplay.innerText = path;
      if (!document.getElementById('btnCancelCustomProject')) {
        const btnCancel = document.createElement('button');
        btnCancel.id = 'btnCancelCustomProject';
        btnCancel.innerText = '✕';
        btnCancel.type = 'button';
        btnCancel.style.width = '30px';
        btnCancel.style.padding = '5px';
        btnCancel.style.marginTop = '0';
        btnCancel.onclick = () => {
          customProjectPath = null;
          selectedProjectDirDisplay.innerText = '';
          btnCancel.remove();
        };
        selectedProjectDirDisplay.parentNode.appendChild(btnCancel);
      }
    }
  };
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

  if (!customProjectPath) {
    alert("Selecciona una carpeta de proyecto externa.");
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
        customProjectPath: customProjectPath,
        codec: preset.codec || 'libx264',
        container: preset.container || '.mp4',
        pixFmt: preset.pixFmt || 'yuv420p',
        codecParams: preset.codecParams || {},
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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startLogPolling() {
  if (logPollingInterval) return;
  logPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/logs?since=${lastLogCount}`);
      const data = await res.json();
      if (data.logs && data.logs.length > 0) {
        appendLogs(data.logs);
        lastLogCount = data.total;
      }
    } catch (e) {}
  }, 1000);
}

startLogPolling();
