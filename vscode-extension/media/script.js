(function () {
    const vscode = acquireVsCodeApi();
    const API = 'http://localhost:3000/api';

    let customOutputDir = null;
    let customProjectPath = null;
    let pollingInterval = null;

    const $ = (id) => document.getElementById(id);
    const btnRender = $('btnRender');
    const progressBox = $('progressBox');
    const progressFill = $('progressFill');
    const statusText = $('statusText');
    const btnOpenFolder = $('btnOpenFolder');
    const serverStatus = $('serverStatus');

    async function api(url, options) {
        const res = await fetch(url, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function checkServer() {
        try {
            await api(API + '/health');
            serverStatus.textContent = '✓ Connected';
            serverStatus.className = 'server-status connected';
        } catch {
            serverStatus.textContent = '✗ Disconnected';
            serverStatus.className = 'server-status disconnected';
            setTimeout(checkServer, 2000);
        }
    }
    checkServer();

    $('btnChooseProjectDir').onclick = () => vscode.postMessage({ type: 'chooseProjectDir' });
    $('btnChooseDir').onclick = () => vscode.postMessage({ type: 'chooseOutputDir' });

    if (btnOpenFolder) {
        btnOpenFolder.onclick = () => {
            vscode.postMessage({ type: 'openPath', path: customOutputDir || '' });
        };
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'outputDirChosen':
                customOutputDir = msg.path;
                $('selectedDirDisplay').innerText = msg.path;
                break;
            case 'projectDirChosen':
                customProjectPath = msg.path;
                $('selectedProjectDirDisplay').innerText = msg.path;
                $('selectedDirDisplay').innerText = customOutputDir || '';
                break;
        }
    });

    $('renderForm').onsubmit = async (e) => {
        e.preventDefault();

        if (!customProjectPath) {
            statusText.textContent = 'Please select an input folder first.';
            progressBox.style.display = 'block';
            btnOpenFolder.style.display = 'none';
            return;
        }

        btnRender.disabled = true;
        btnRender.innerText = '⏳ Rendering...';
        progressBox.style.display = 'block';
        btnOpenFolder.style.display = 'none';
        progressFill.style.width = '0%';
        statusText.innerText = 'Starting render...';

        try {
            await api(API + '/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: '',
                    customProjectPath: customProjectPath,
                    width: $('width').value,
                    height: $('height').value,
                    fps: $('fps').value,
                    duration: $('duration').value,
                    bgColor: $('bgColor').value,
                    customOutputDir: customOutputDir,
                })
            });
        } catch (err) {
            statusText.innerText = '❌ Error: ' + err.message;
            btnRender.disabled = false;
            btnRender.innerText = '▶ Retry';
            return;
        }

        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            try {
                const status = await api(API + '/status');
                if (status.state === 'rendering') {
                    const pct = Math.round((status.progress / status.total) * 100);
                    statusText.innerText = 'Rendering: ' + status.progress + ' / ' + status.total + ' frames (' + pct + '%)';
                    progressFill.style.width = pct + '%';
                } else if (status.state === 'done') {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    statusText.innerText = '✅ Render completed!';
                    progressFill.style.width = '100%';
                    btnOpenFolder.style.display = 'block';
                    btnRender.disabled = false;
                    btnRender.innerText = '▶ Start New Render';
                } else if (status.state === 'error') {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    statusText.innerText = '❌ Error: ' + status.error;
                    btnRender.disabled = false;
                    btnRender.innerText = '▶ Retry';
                }
            } catch {
                clearInterval(pollingInterval);
                pollingInterval = null;
                statusText.innerText = '❌ Connection lost';
                btnRender.disabled = false;
                btnRender.innerText = '▶ Retry';
            }
        }, 1000);
    };
})();
