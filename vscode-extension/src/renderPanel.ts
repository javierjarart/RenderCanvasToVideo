import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class RenderPanel {
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _serverUrl: string;
    private _disposables: vscode.Disposable[] = [];

    constructor(extensionUri: vscode.Uri, serverUrl: string) {
        this._extensionUri = extensionUri;
        this._serverUrl = serverUrl;

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
    }

    public reveal(): void {
        this._panel.reveal();
    }

    public dispose(): void {
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private _postMessage(msg: any): void {
        this._panel.webview.postMessage(msg);
    }

    private async _handleMessage(msg: any): Promise<void> {
        switch (msg.type) {
            case 'chooseOutputDir':
                await this._chooseOutputDir();
                break;
            case 'chooseProjectDir':
                await this._chooseProjectDir();
                break;
            case 'openPath':
                await this._openPath(msg.path);
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

    private _getHtml(): string {
        const webview = this._panel.webview;
        const mediaUri = (file: string) =>
            webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', file));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Render Canvas to Video</title>
    <link rel="stylesheet" href="${mediaUri('style.css')}">
</head>
<body>
    <div class="studio-container">
        <h1>Render Canvas to Video</h1>
        <div id="serverStatus" class="server-status">Connecting...</div>
        <form id="renderForm">
            <div class="form-group">
                <div class="row">
                    <button type="button" id="btnChooseProjectDir" class="btn-small flex-1">📁 Input Folder</button>
                    <button type="button" id="btnChooseDir" class="btn-small flex-1">📁 Output Folder</button>
                </div>
                <div class="row mt-4">
                    <span id="selectedProjectDirDisplay" class="path-display"></span>
                    <span id="selectedDirDisplay" class="path-display"></span>
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
                <label>Background color</label>
                <input type="color" id="bgColor" value="#000000">
            </div>

            <button type="submit" id="btnRender">▶ Start Render</button>
        </form>

        <div class="progress-box" id="progressBox">
            <div id="statusText">Rendering: 0%</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="inline-row mt-10">
                <button id="btnOpenFolder" class="flex-1">📂 Open Folder</button>
            </div>
        </div>
    </div>

    <script src="${mediaUri('script.js')}"></script>
</body>
</html>`;
    }
}
