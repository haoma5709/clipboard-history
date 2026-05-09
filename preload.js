const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardAPI', {
  getClips: () => ipcRenderer.invoke('get-clips'),
  pasteClip: (id) => ipcRenderer.invoke('paste-clip', id),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onWindowShown: (cb) => {
    ipcRenderer.on('window-shown', () => cb());
  }
});
