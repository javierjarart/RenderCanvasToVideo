import * as vscode from 'vscode';
import { RenderPanel } from './renderPanel';

let panel: RenderPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('rendercanvastovideo.openPanel', () => {
            if (!panel) {
                panel = new RenderPanel(context.extensionUri);
            }
            panel.reveal();
        })
    );

    if (vscode.workspace.workspaceFolders) {
        vscode.commands.executeCommand('rendercanvastovideo.openPanel');
    }
}

export function deactivate() {
    panel?.dispose();
}
