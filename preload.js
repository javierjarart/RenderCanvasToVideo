const { contextBridge, ipcRenderer } = require('electron');

// Expone de forma segura funciones de Electron al renderer (tu public/index.html)
contextBridge.exposeInMainWorld('electronAPI', {
  // Abre un diálogo nativo para elegir carpeta
  chooseOutputDir: () => ipcRenderer.invoke('choose-output-dir'),
});
