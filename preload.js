const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseInputPath: () => ipcRenderer.invoke('choose-input-path'),
  chooseOutputDir: () => ipcRenderer.invoke('choose-output-dir'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  getDroppedPath: (file) => webUtils.getPathForFile(file),
});