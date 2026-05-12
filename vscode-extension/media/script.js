(function () {
    const vscode = acquireVsCodeApi();

    let customOutputDir = null;
    let customProjectPath = null;

    const projectSelect = document.getElementById('project');
    const btnChooseProjectDir = document.getElementById('btnChooseProjectDir');
    const selectedProjectDirDisplay = document.getElementById('selectedProjectDirDisplay');
    const btnChooseDir = document.getElementById('btnChooseDir');
    const selectedDirDisplay = document.getElementById('selectedDirDisplay');
    const btnOpenFolder = document.getElementById('btnOpenFolder');
    const btnCancelRender = document.getElementById('btnCancelRender');
    const renderForm = document.getElementById('renderForm');
    const btnRender = document.getElementById('btnRender');
    const progressBox = document.getElementById('progressBox');
    const progressFill = document.getElementById('progressFill');
    const statusText = document.getElementById('statusText');

    let currentFilePath = null;

    vscode.postMessage({ type: 'getProjects' });

    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'projectList':
                projectSelect.innerHTML = msg.projects.length === 0
                    ? '<option value="">No projects found in workspace</option>'
                    : msg.projects.map(p => `<option value="${p.path}">${p.name}</option>`).join('');
                break;

            case 'outputDirChosen':
                customOutputDir = msg.path;
                selectedDirDisplay.innerText = msg.path;
                break;

            case 'projectDirChosen':
                customProjectPath = msg.path;
                selectedProjectDirDisplay.innerText = msg.path;
                projectSelect.value = '';
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
                        selectedProjectDirDisplay.innerText = 'Or use workspace /proyectos';
                        projectSelect.disabled = false;
                        btnCancel.remove();
                    };
                    selectedProjectDirDisplay.parentNode.appendChild(btnCancel);
                }
                break;

            case 'renderStart':
                btnRender.disabled = true;
                btnRender.innerText = '⏳ Rendering...';
                progressBox.style.display = 'block';
                btnOpenFolder.style.display = 'none';
                btnCancelRender.style.display = 'inline-block';
                progressFill.style.width = '0%';
                statusText.innerText = 'Rendering: 0 / ' + msg.total + ' frames (0%)';
                break;

            case 'renderProgress':
                const pct = Math.round((msg.current / msg.total) * 100);
                statusText.innerText = 'Rendering: ' + msg.current + ' / ' + msg.total + ' frames (' + pct + '%)';
                progressFill.style.width = pct + '%';
                break;

            case 'renderDone':
                statusText.innerText = 'Render completed!';
                progressFill.style.width = '100%';
                btnOpenFolder.style.display = 'block';
                btnCancelRender.style.display = 'none';
                btnRender.disabled = false;
                btnRender.innerText = '▶ Start New Render';
                currentFilePath = msg.filePath;
                break;

            case 'renderError':
                statusText.innerText = 'Error: ' + msg.error;
                btnRender.disabled = false;
                btnRender.innerText = '▶ Retry';
                btnCancelRender.style.display = 'none';
                break;

            case 'renderCancelled':
                statusText.innerText = 'Render cancelled';
                btnRender.disabled = false;
                btnRender.innerText = '▶ Start Render';
                btnCancelRender.style.display = 'none';
                break;
        }
    });

    if (btnChooseProjectDir) {
        btnChooseProjectDir.onclick = () => {
            vscode.postMessage({ type: 'chooseProjectDir' });
        };
    }

    if (btnChooseDir) {
        btnChooseDir.onclick = () => {
            vscode.postMessage({ type: 'chooseOutputDir' });
        };
    }

    if (btnOpenFolder) {
        btnOpenFolder.onclick = () => {
            const dir = customOutputDir || (currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : 'renders');
            vscode.postMessage({ type: 'openPath', path: dir });
        };
    }

    if (btnCancelRender) {
        btnCancelRender.onclick = () => {
            vscode.postMessage({ type: 'cancelRender' });
        };
    }

    if (renderForm) {
        renderForm.onsubmit = (e) => {
            e.preventDefault();

            const project = projectSelect.value;
            if (!project && !customProjectPath) {
                statusText.innerText = 'Please select a project or external folder.';
                progressBox.style.display = 'block';
                btnOpenFolder.style.display = 'none';
                btnCancelRender.style.display = 'none';
                return;
            }

            vscode.postMessage({
                type: 'startRender',
                config: {
                    project: project,
                    customProjectPath: customProjectPath,
                    width: document.getElementById('width').value,
                    height: document.getElementById('height').value,
                    fps: document.getElementById('fps').value,
                    duration: document.getElementById('duration').value,
                    bgColor: document.getElementById('bgColor').value,
                    customOutputDir: customOutputDir,
                }
            });
        };
    }
})();
