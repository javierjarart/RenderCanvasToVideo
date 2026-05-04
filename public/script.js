// Cargar proyectos al inicio
fetch('/api/projects').then(r => r.json()).then(projects => {
    const select = document.getElementById('project');
    select.innerHTML = projects.length === 0 
        ? '<option value="">No hay carpetas en /proyectos</option>' 
        : projects.map(p => `<option value="${p}">${p}</option>`).join('');
});

document.getElementById('renderForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('btnRender');
    const progressBox = document.getElementById('progressBox');
    const progressFill = document.getElementById('progressFill');
    const statusText = document.getElementById('statusText');
    const downloadLink = document.getElementById('downloadLink');

    btn.disabled = true;
    btn.innerText = "⏳ Renderizando...";
    progressBox.style.display = 'block';
    downloadLink.style.display = 'none';
    progressFill.style.width = '0%';

    // Enviar datos
    await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project: document.getElementById('project').value,
            width: document.getElementById('width').value,
            height: document.getElementById('height').value,
            fps: document.getElementById('fps').value,
            duration: document.getElementById('duration').value,
            bgColor: document.getElementById('bgColor').value
        })
    });

    // Polling: Consultar progreso cada 1 segundo
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