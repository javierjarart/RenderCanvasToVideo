import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import { RenderPanel } from './renderPanel';

let serverProcess: ChildProcess | null = null;
let panel: RenderPanel | undefined;

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

function startServer(extensionPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const serverPath = path.join(extensionPath, '..', 'server.js');
        if (!require('fs').existsSync(serverPath)) {
            reject(new Error(`server.js not found at ${serverPath}`));
            return;
        }

        serverProcess = spawn('node', [serverPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: String(SERVER_PORT) },
        });

        serverProcess.stdout?.on('data', (d: Buffer) => console.log('[server]', d.toString().trimEnd()));
        serverProcess.stderr?.on('data', (d: Buffer) => console.log('[server]', d.toString().trimEnd()));
        serverProcess.on('error', reject);
        serverProcess.on('exit', (code) => {
            if (code !== 0) console.error(`[server] exited with code ${code}`);
        });

        let attempts = 0;
        const check = () => {
            attempts++;
            if (attempts > 30) {
                reject(new Error('Server did not start in time'));
                return;
            }
            http.get(`${SERVER_URL}/api/health`, (res) => {
                if (res.statusCode === 200) resolve();
                else setTimeout(check, 500);
            }).on('error', () => setTimeout(check, 500));
        };
        setTimeout(check, 1000);
    });
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('rendercanvastovideo.openPanel', async () => {
            try {
                if (!panel) {
                    await vscode.window.withProgress(
                        { location: vscode.ProgressLocation.Notification, title: 'Starting render server...' },
                        () => startServer(context.extensionPath)
                    );
                    panel = new RenderPanel(context.extensionUri, SERVER_URL);
                }
                panel.reveal();
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to start server: ${err.message}`);
            }
        })
    );

    if (vscode.workspace.workspaceFolders) {
        vscode.commands.executeCommand('rendercanvastovideo.openPanel');
    }
}

export function deactivate() {
    panel?.dispose();
    stopServer();
}
