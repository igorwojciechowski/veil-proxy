const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veilDesktop', {
  saveProject: (payload, suggestedName) => ipcRenderer.invoke('project:save', { payload, suggestedName }),
  saveProjectAs: (payload, suggestedName) => ipcRenderer.invoke('project:save-as', { payload, suggestedName }),
  openProject: () => ipcRenderer.invoke('project:open'),
  openRecentProject: (filePath) => ipcRenderer.invoke('project:open-recent', filePath),
  forgetProject: () => ipcRenderer.invoke('project:forget'),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  clearRecentProjects: () => ipcRenderer.invoke('project:clear-recent'),
  saveRecoveryDraft: (payload, project) => ipcRenderer.invoke('project:save-draft', { payload, project }),
  recoveryDraft: () => ipcRenderer.invoke('project:recovery-draft'),
  clearRecoveryDraft: () => ipcRenderer.invoke('project:clear-draft'),
  projectCheckpoints: (project) => ipcRenderer.invoke('project:checkpoints', project),
  openProjectCheckpoint: (checkpointId) => ipcRenderer.invoke('project:open-checkpoint', checkpointId),
  clearProjectCheckpoints: (project) => ipcRenderer.invoke('project:clear-checkpoints', project),
  getProjectMeta: () => ipcRenderer.invoke('project:get-meta'),
  setProjectMeta: (meta) => ipcRenderer.invoke('project:set-meta', meta),
  projectCommandResult: (result) => ipcRenderer.invoke('project:command-result', result),
  onProjectCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('project:command', listener);
    return () => ipcRenderer.off('project:command', listener);
  },
});
