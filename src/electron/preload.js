const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veilDesktop', {
  saveProject: (payload, suggestedName) => ipcRenderer.invoke('project:save', { payload, suggestedName }),
  saveProjectAs: (payload, suggestedName) => ipcRenderer.invoke('project:save-as', { payload, suggestedName }),
  openProject: () => ipcRenderer.invoke('project:open'),
  forgetProject: () => ipcRenderer.invoke('project:forget'),
});
