const { contextBridge, ipcRenderer } = require('electron');

// Expone de forma segura funciones de Electron al renderer (tu public/index.html)
contextBridge.exposeInMainWorld('electronAPI', {
  // Abre un diálogo nativo para elegir carpeta
  chooseOutputDir: () => ipcRenderer.invoke('choose-output-dir'),
  // Abre un diálogo nativo para elegir carpeta de proyecto
  chooseProjectDir: () => ipcRenderer.invoke('choose-project-dir'),
  // Abre una ruta en el explorador de archivos
  openPath: (path) => ipcRenderer.invoke('open-path', path),
});
