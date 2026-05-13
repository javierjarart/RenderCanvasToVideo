const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

// ─── Lanzar el servidor Express como proceso hijo ───────────────────────────
function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  const chromeCacheDir = app.isPackaged
      ? path.join(process.resourcesPath, '..', '.cache', 'puppeteer')
      : path.join(__dirname, '.cache', 'puppeteer');

  serverProcess = fork(serverPath, [], {
    env: {
        ...process.env,
        APP_ROOT: app.isPackaged
            ? path.join(process.resourcesPath, '..')
            : __dirname,
        CHROME_CACHE_DIR: chromeCacheDir,
        ELECTRON_PATH: process.versions.electron ? process.execPath : null,
    },
    silent: false,
});

  serverProcess.on('error', (err) => {
    console.error('Error en el servidor Express:', err);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`El servidor Express terminó con código ${code}`);
    }
  });
}

// ─── Crear la ventana principal ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 420,
    minWidth: 600,
    minHeight: 420,
    title: 'CanvasRenderToVideo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Quitar menú nativo (opcional, da aspecto más limpio)
  mainWindow.setMenuBarVisibility(false);

  // Esperar un momento para que Express arranque y luego cargar la UI
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1200);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC: diálogo para elegir carpeta de salida ─────────────────────────────
ipcMain.handle('choose-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Elegir carpeta para los renders',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('choose-project-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Elegir carpeta del proyecto a renderizar',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-path', async (event, targetPath) => {
  if (targetPath) {
    await shell.openPath(targetPath);
  }
});

// ─── Ciclo de vida de la app ─────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
