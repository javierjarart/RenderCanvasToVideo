let customOutputDir = null;
let customProjectPath = null;

// Cargar proyectos al inicio
fetch('/api/projects').then(r => r.json()).then(projects => {
    const select = document.getElementById('project');
    select.innerHTML = projects.length === 0 
        ? '<option value="">No hay carpetas en /proyectos</option>' 
        : projects.map(p => `<option value="${p}">${p}</option>`).join('');
});

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

    const interval = setInterval(async () => {
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
    }, 1000);
};
