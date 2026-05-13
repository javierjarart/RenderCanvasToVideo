let customOutputDir = null;
let customProjectPath = null;

// Cargar proyectos al inicio
fetch('/api/projects').then(r => r.json()).then(projects => {
    const select = document.getElementById('project');
    if (!select) return;
    select.innerHTML = projects.length === 0 
        ? '<option value="">No hay carpetas en /proyectos</option>' 
        : projects.map(p => `<option value="${p}">${p}</option>`).join('');
}).catch(() => {});

// Manejar selección de carpeta de proyecto externa
const btnChooseProjectDir = document.getElementById('btnChooseProjectDir');
const selectedProjectDirDisplay = document.getElementById('selectedProjectDirDisplay');
const projectSelect = document.getElementById('project');

if (btnChooseProjectDir) {
    btnChooseProjectDir.onclick = async () => {
        const path = await window.electronAPI.chooseProjectDir();
        if (path) {
            customProjectPath = path;
            selectedProjectDirDisplay.innerText = path;
            projectSelect.value = "";
            projectSelect.disabled = true;

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
                    selectedProjectDirDisplay.innerText = 'O usa la carpeta /proyectos';
                    projectSelect.disabled = false;
                    btnCancel.remove();
                };
                selectedProjectDirDisplay.parentNode.appendChild(btnCancel);
            }
        }
    };
}

// Manejar selección de carpeta de salida
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

// Abrir carpeta de renders
const btnOpenFolder = document.getElementById('btnOpenFolder');
if (btnOpenFolder) {
    btnOpenFolder.onclick = () => {
        const path = customOutputDir || 'renders';
        window.electronAPI.openPath(path);
    };
}

document.getElementById('renderForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('btnRender');
    const progressBox = document.getElementById('progressBox');
    const progressFill = document.getElementById('progressFill');
    const statusText = document.getElementById('statusText');
    const downloadLink = document.getElementById('downloadLink');
    const btnOpenFolder = document.getElementById('btnOpenFolder');

    btn.disabled = true;
    btn.innerText = "⏳ Renderizando...";
    progressBox.style.display = 'block';
    downloadLink.style.display = 'none';
    if (btnOpenFolder) btnOpenFolder.style.display = 'none';
    progressFill.style.width = '0%';

    const projectValue = document.getElementById('project').value;

    if (!projectValue && !customProjectPath) {
        alert("Por favor selecciona un proyecto o una carpeta externa.");
        btn.disabled = false;
        btn.innerText = "▶ Iniciar Render";
        progressBox.style.display = 'none';
        return;
    }

    try {
        await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: projectValue,
                width: document.getElementById('width').value,
                height: document.getElementById('height').value,
                fps: document.getElementById('fps').value,
                duration: document.getElementById('duration').value,
                bgColor: document.getElementById('bgColor').value,
                customOutputDir: customOutputDir,
                customProjectPath: customProjectPath
            })
        });
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
                if (btnOpenFolder) btnOpenFolder.style.display = 'block';
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
            statusText.innerText = `❌ Error de conexión con el servidor`;
            btn.disabled = false;
            btn.innerText = "▶ Reintentar";
        }
    }, 1000);
};

// ─── Log de ejecución ─────────────────────────────────────────────────────
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
        } catch (e) {
            // ignore polling errors
        }
    }, 1000);
}

// Iniciar polling de logs desde el inicio (modo pasivo sin abrir)
startLogPolling();
