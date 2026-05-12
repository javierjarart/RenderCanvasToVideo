import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { renderFrames, RenderConfig } from './renderEngine';

export class RenderPanel {
    public static current: RenderPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _cancelled = false;

    constructor(extensionUri: vscode.Uri) {
        RenderPanel.current = this;
        this._extensionUri = extensionUri;

        this._panel = vscode.window.createWebviewPanel(
            'rendercanvastovideo',
            'Render Canvas to Video',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            }
        );

        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            null,
            this._disposables
        );

        this._sendProjects();
    }

    public reveal(): void {
        this._panel.reveal();
    }

    public dispose(): void {
        RenderPanel.current = undefined;
        this._cancelled = true;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private _postMessage(msg: any): void {
        this._panel.webview.postMessage(msg);
    }

    private async _sendProjects(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            this._postMessage({ type: 'projectList', projects: [] });
            return;
        }

        const projects: { name: string; path: string }[] = [];
        for (const folder of folders) {
            const projectsPath = path.join(folder.uri.fsPath, 'proyectos');
            if (fs.existsSync(projectsPath)) {
                const dirs = fs.readdirSync(projectsPath, { withFileTypes: true });
                for (const d of dirs) {
                    if (d.isDirectory()) {
                        const indexPath = path.join(projectsPath, d.name, 'index.html');
                        if (fs.existsSync(indexPath)) {
                            projects.push({ name: d.name, path: path.join(projectsPath, d.name) });
                        }
                    }
                }
            }
            const indexPath = path.join(folder.uri.fsPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                projects.push({ name: folder.name, path: folder.uri.fsPath });
            }
        }
        this._postMessage({ type: 'projectList', projects });
    }

    private async _handleMessage(msg: any): Promise<void> {
        switch (msg.type) {
            case 'getProjects':
                await this._sendProjects();
                break;

            case 'chooseOutputDir':
                await this._chooseOutputDir();
                break;

            case 'chooseProjectDir':
                await this._chooseProjectDir();
                break;

            case 'openPath':
                await this._openPath(msg.path);
                break;

            case 'startRender':
                await this._startRender(msg.config);
                break;

            case 'cancelRender':
                this._cancelRender();
                break;
        }
    }

    private async _chooseOutputDir(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: 'Select output folder for renders',
        });
        if (result && result[0]) {
            this._postMessage({ type: 'outputDirChosen', path: result[0].fsPath });
        }
    }

    private async _chooseProjectDir(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: 'Select project folder to render',
        });
        if (result && result[0]) {
            this._postMessage({ type: 'projectDirChosen', path: result[0].fsPath });
        }
    }

    private async _openPath(targetPath: string): Promise<void> {
        const uri = vscode.Uri.file(targetPath);
        await vscode.commands.executeCommand('revealFileInOS', uri);
    }

    private async _startRender(config: any): Promise<void> {
        if (this._cancelled) return;
        this._cancelled = false;

        const outputDir = config.customOutputDir ||
            path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir(), 'renders');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const projectName = config.customProjectPath
            ? path.basename(config.customProjectPath)
            : config.project || 'project';

        const fileName = `Render_${projectName}_${Date.now()}.mp4`;
        const outputPath = path.join(outputDir, fileName);

        const renderConfig: RenderConfig = {
            projectPath: config.customProjectPath || config.project,
            width: parseInt(config.width),
            height: parseInt(config.height),
            fps: parseInt(config.fps),
            duration: parseInt(config.duration),
            bgColor: config.bgColor || '#000000',
            outputPath,
        };

        const cancelToken = { cancelled: false };

        try {
            this._postMessage({ type: 'renderStart', total: renderConfig.fps * renderConfig.duration });

            await renderFrames(renderConfig, (current, total) => {
                if (cancelToken.cancelled) return;
                this._postMessage({ type: 'renderProgress', current, total });
            }, cancelToken);

            if (cancelToken.cancelled) {
                this._postMessage({ type: 'renderCancelled' });
            } else {
                this._postMessage({ type: 'renderDone', filePath: outputPath, fileName });
            }
        } catch (err: any) {
            if (cancelToken.cancelled) {
                this._postMessage({ type: 'renderCancelled' });
            } else {
                this._postMessage({ type: 'renderError', error: err.message });
            }
        }
    }

    private _cancelRender(): void {
        this._cancelled = true;
    }

    private _getHtml(): string {
        const webview = this._panel.webview;
        const mediaUri = (file: string) =>
            webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', file));

        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Render Canvas to Video</title>
    <link rel="stylesheet" href="${mediaUri('style.css')}">
    <style>
        body { padding: 16px; }
        .vscode-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .vscode-btn:hover { background: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
    <div class="studio-container">
        <h1>Canvas Render to Video</h1>
        <form id="renderForm">
            <div class="form-group">
                <label>Select Project:</label>
                <select id="project">
                    <option value="">Loading projects...</option>
                </select>
                <div class="inline-row mt-8">
                    <button type="button" id="btnChooseProjectDir" class="btn-small flex-1">📁 Choose External Folder</button>
                    <span id="selectedProjectDirDisplay" class="path-display flex-15">Or use workspace /proyectos</span>
                </div>
            </div>

            <div class="row">
                <div class="form-group flex-1">
                    <label>Width (px)</label>
                    <input type="number" id="width" value="1920" required>
                </div>
                <div class="form-group flex-1">
                    <label>Height (px)</label>
                    <input type="number" id="height" value="1080" required>
                </div>
            </div>

            <div class="row">
                <div class="form-group flex-1">
                    <label>FPS</label>
                    <input type="number" id="fps" value="60" required>
                </div>
                <div class="form-group flex-1">
                    <label>Duration (sec)</label>
                    <input type="number" id="duration" value="10" required>
                </div>
            </div>

            <div class="form-group">
                <label>Background color (for transparent pixels)</label>
                <input type="color" id="bgColor" value="#000000">
            </div>

            <div class="form-group">
                <label>Output folder:</label>
                <div class="inline-row">
                    <button type="button" id="btnChooseDir" class="btn-small flex-1">📁 Select</button>
                    <span id="selectedDirDisplay" class="path-display flex-2">Default: /renders</span>
                </div>
            </div>

            <button type="submit" id="btnRender" class="vscode-btn">▶ Start Render</button>
        </form>

        <div class="progress-box" id="progressBox">
            <div id="statusText">Rendering: 0%</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="inline-row mt-10">
                <button id="btnOpenFolder" class="flex-1 vscode-btn" style="display:none;">📂 Open Folder</button>
                <button id="btnCancelRender" class="flex-1" style="display:none;background:#c00;color:#fff;">✕ Cancel</button>
            </div>
        </div>
    </div>

    <script src="${mediaUri('script.js')}"></script>
</body>
</html>`;
    }
}
