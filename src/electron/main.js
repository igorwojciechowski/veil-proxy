const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { createApp } = require('../main/veilApp');

let backend;
let mainWindow;
let currentProjectPath = null;
let projectName = 'Unsaved project';
let projectDirty = false;
let closeAfterSave = false;
let forceClosing = false;
let recentProjects = [];

const MAX_RECENT_PROJECTS = 8;
const MAX_PROJECT_CHECKPOINTS = 12;

async function createWindow() {
  app.setName('Veil Proxy');
  await loadRecentProjects();
  installMenu();

  let state;
  try {
    backend = createApp({
      config: {
        apiPort: 0,
      },
    });
    state = await backend.start();
  } catch (error) {
    dialog.showErrorBox('Veil Proxy failed to start', error.message);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#03191b',
    title: 'Veil Proxy',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 10 } : undefined,
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : {
            color: '#03191b',
            symbolColor: '#78bdb8',
            height: 32,
          },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  installEditableContextMenu(mainWindow);

  mainWindow.on('close', handleWindowClose);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${state.apiPort}?desktop=1`);
}

ipcMain.handle('project:save', async (_event, request) => saveProjectFile(request, false));
ipcMain.handle('project:save-as', async (_event, request) => saveProjectFile(request, true));
ipcMain.handle('project:open', async () => openProjectFile());
ipcMain.handle('project:open-recent', async (_event, filePath) => openProjectFile(filePath));
ipcMain.handle('project:forget', async () => {
  currentProjectPath = null;
  updateProjectWindowState({ name: 'Unsaved project', path: '', dirty: false });
  return { ok: true };
});
ipcMain.handle('project:recent', async () => recentProjectList());
ipcMain.handle('project:clear-recent', async () => {
  await clearRecentProjects();
  return recentProjectList();
});
ipcMain.handle('project:save-draft', async (_event, request) => saveRecoveryDraft(request));
ipcMain.handle('project:recovery-draft', async () => readRecoveryDraft());
ipcMain.handle('project:clear-draft', async () => clearRecoveryDraft());
ipcMain.handle('project:checkpoints', async (_event, project) => projectCheckpointList(project?.path || ''));
ipcMain.handle('project:open-checkpoint', async (_event, checkpointId) => openProjectCheckpoint(checkpointId));
ipcMain.handle('project:clear-checkpoints', async (_event, project) => {
  await clearProjectCheckpoints(project?.path || '');
  return projectCheckpointList(project?.path || '');
});
ipcMain.handle('project:get-meta', async () => projectMeta());
ipcMain.handle('project:set-meta', async (_event, meta) => {
  updateProjectWindowState(meta);
  return projectMeta();
});
ipcMain.handle('project:command-result', async (_event, result = {}) => {
  if (result.closeAfter) {
    closeAfterSave = false;
  }
  if (result.saved && result.closeAfter && mainWindow) {
    forceClosing = true;
    mainWindow.close();
  }
  if (result.discarded && result.closeAfter && mainWindow) {
    forceClosing = true;
    mainWindow.close();
  }
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (backend) {
    await backend.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function installMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Project',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendProjectCommand({ action: 'new' }),
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendProjectCommand({ action: 'open' }),
        },
        {
          label: 'Open Recent',
          submenu: recentProjectMenuItems(),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendProjectCommand({ action: 'save', saveAs: false }),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendProjectCommand({ action: 'save', saveAs: true }),
        },
      ],
    },
    {
      label: 'Proxy',
      submenu: [
        {
          label: 'Reload UI',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: 'Open DevTools',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => mainWindow && mainWindow.webContents.openDevTools({ mode: 'detach' }),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleWindowClose(event) {
  if (forceClosing || !projectDirty) {
    return;
  }

  event.preventDefault();
  if (closeAfterSave) {
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Unsaved Project',
    message: 'Save changes to this Veil Proxy project before closing?',
    detail: 'Captured traffic, Echo tabs, filters, and settings have unsaved changes.',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (result.response === 2) {
    return;
  }

  if (result.response === 1) {
    closeAfterSave = true;
    sendProjectCommand({ action: 'discardAndClose', closeAfter: true });
    return;
  }

  closeAfterSave = true;
  sendProjectCommand({ action: 'save', saveAs: false, closeAfter: true });
}

function sendProjectCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('project:command', command);
}

function recentProjectMenuItems() {
  if (!recentProjects.length) {
    return [{ label: 'No Recent Projects', enabled: false }];
  }

  return [
    ...recentProjects.map((project, index) => ({
      label: `${index + 1}. ${project.name}`,
      click: () => sendProjectCommand({ action: 'openRecent', path: project.path }),
    })),
    { type: 'separator' },
    {
      label: 'Clear Recent Projects',
      click: async () => {
        await clearRecentProjects();
        sendProjectCommand({ action: 'recentProjectsChanged', projects: recentProjectList() });
      },
    },
  ];
}

function installEditableContextMenu(window) {
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) {
      return;
    }

    Menu.buildFromTemplate([
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste },
      { role: 'delete', enabled: params.editFlags.canDelete },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]).popup({ window });
  });
}

async function saveProjectFile(request = {}, forceSaveAs = false) {
  const payload = request && typeof request === 'object' ? request.payload : null;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Project payload is empty.');
  }

  let targetPath = forceSaveAs ? null : currentProjectPath;
  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Veil Proxy Project',
      defaultPath: defaultProjectPath(request.suggestedName),
      filters: projectFileFilters(),
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    targetPath = ensureProjectExtension(result.filePath);
  }

  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  currentProjectPath = targetPath;
  closeAfterSave = false;
  updateProjectWindowState({ dirty: false, name: path.basename(targetPath), path: targetPath });
  await rememberProject(targetPath);
  await createProjectCheckpoint(targetPath, payload);
  return {
    canceled: false,
    path: targetPath,
    name: path.basename(targetPath),
    recentProjects: recentProjectList(),
    checkpoints: await projectCheckpointList(targetPath),
  };
}

async function openProjectFile(filePath = '') {
  let targetPath = typeof filePath === 'string' ? filePath : '';
  const openedFromRecent = Boolean(targetPath);
  if (!targetPath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Veil Proxy Project',
      properties: ['openFile'],
      filters: projectFileFilters(),
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }
    targetPath = result.filePaths[0];
  }

  let text;
  try {
    text = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (openedFromRecent) {
      await forgetRecentProject(targetPath);
    }
    throw error;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (openedFromRecent) {
      await forgetRecentProject(targetPath);
    }
    throw new Error(`Invalid project file: ${error.message}`);
  }

  currentProjectPath = targetPath;
  updateProjectWindowState({ dirty: false, name: path.basename(targetPath), path: targetPath });
  await rememberProject(targetPath);
  return {
    canceled: false,
    path: targetPath,
    name: path.basename(targetPath),
    data,
    recentProjects: recentProjectList(),
    checkpoints: await projectCheckpointList(targetPath),
  };
}

function updateProjectWindowState(meta = {}) {
  if (!meta || typeof meta !== 'object') {
    meta = {};
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'dirty')) {
    projectDirty = Boolean(meta.dirty);
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'path')) {
    currentProjectPath = meta.path || null;
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'name')) {
    projectName = meta.name || (currentProjectPath ? path.basename(currentProjectPath) : 'Unsaved project');
  } else if (currentProjectPath) {
    projectName = path.basename(currentProjectPath);
  }
  const title = `${projectDirty ? '● ' : ''}${projectName} - Veil Proxy`;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(title);
    mainWindow.setDocumentEdited?.(projectDirty);
    mainWindow.setRepresentedFilename?.(currentProjectPath || '');
  }
}

function projectMeta() {
  return {
    dirty: projectDirty,
    path: currentProjectPath || '',
    name: projectName,
  };
}

async function loadRecentProjects() {
  try {
    const text = await fs.readFile(recentProjectsFilePath(), 'utf8');
    recentProjects = normalizeRecentProjects(JSON.parse(text));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(error);
    }
    recentProjects = [];
  }
}

async function rememberProject(filePath) {
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  const existing = recentProjects.filter((project) => project.path !== resolvedPath);
  recentProjects = [
    {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      lastOpened: Date.now(),
    },
    ...existing,
  ].slice(0, MAX_RECENT_PROJECTS);
  await saveRecentProjects();
}

async function forgetRecentProject(filePath) {
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  const nextProjects = recentProjects.filter((project) => project.path !== resolvedPath);
  if (nextProjects.length === recentProjects.length) return;
  recentProjects = nextProjects;
  await saveRecentProjects();
}

async function clearRecentProjects() {
  recentProjects = [];
  await saveRecentProjects();
}

async function saveRecentProjects() {
  try {
    const filePath = recentProjectsFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify({ projects: recentProjects }, null, 2)}\n`, 'utf8');
    installMenu();
  } catch (error) {
    console.error(error);
  }
}

function recentProjectList() {
  return recentProjects.map((project) => ({ ...project }));
}

function recentProjectsFilePath() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function saveRecoveryDraft(request = {}) {
  const payload = request && typeof request === 'object' ? request.payload : null;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Recovery draft payload is empty.');
  }

  const project = request.project && typeof request.project === 'object' ? request.project : {};
  const draft = {
    version: 1,
    savedAt: new Date().toISOString(),
    project: {
      name: project.name || projectName || 'Unsaved project',
      path: project.path || currentProjectPath || '',
    },
    payload,
  };
  const filePath = recoveryDraftFilePath();
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
  return {
    ok: true,
    savedAt: draft.savedAt,
  };
}

async function readRecoveryDraft() {
  try {
    const text = await fs.readFile(recoveryDraftFilePath(), 'utf8');
    const draft = JSON.parse(text);
    if (!draft?.payload || typeof draft.payload !== 'object') {
      await clearRecoveryDraft();
      return null;
    }
    const project = draft.project && typeof draft.project === 'object' ? draft.project : {};
    return {
      version: Number(draft.version || 1),
      savedAt: draft.savedAt || '',
      project: {
        name: project.name || 'Unsaved project',
        path: project.path || '',
      },
      payload: draft.payload,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(error);
      await clearRecoveryDraft();
    }
    return null;
  }
}

async function clearRecoveryDraft() {
  try {
    await fs.unlink(recoveryDraftFilePath());
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  return { ok: true };
}

function recoveryDraftFilePath() {
  return path.join(app.getPath('userData'), 'recovery-draft.veil.json');
}

async function createProjectCheckpoint(projectPath, payload) {
  if (!projectPath || !payload || typeof payload !== 'object') {
    return null;
  }

  const createdAt = new Date().toISOString();
  const id = `${compactTimestamp(createdAt)}-${Math.random().toString(16).slice(2, 10)}`;
  const fileName = `${id}-${safeFileStem(path.basename(projectPath))}.veil.json`;
  const filePath = path.join(projectCheckpointsDir(), fileName);
  const checkpoint = {
    version: 1,
    id,
    createdAt,
    project: {
      name: path.basename(projectPath),
      path: path.resolve(projectPath),
    },
    payload,
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  await pruneProjectCheckpoints(projectPath);
  return checkpointSummary(checkpoint, filePath, 0);
}

async function projectCheckpointList(projectPath = '') {
  const checkpoints = await allProjectCheckpoints();
  const normalizedProjectPath = projectPath ? path.resolve(projectPath) : '';
  return checkpoints
    .filter((checkpoint) => !normalizedProjectPath || checkpoint.project.path === normalizedProjectPath)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function allProjectCheckpoints() {
  let entries;
  try {
    entries = await fs.readdir(projectCheckpointsDir(), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const checkpoints = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.veil.json')) continue;
    const filePath = path.join(projectCheckpointsDir(), entry.name);
    try {
      const [text, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
      const checkpoint = JSON.parse(text);
      const summary = checkpointSummary(checkpoint, filePath, stat.size);
      if (summary) {
        checkpoints.push(summary);
      }
    } catch (error) {
      console.error(error);
    }
  }
  return checkpoints;
}

async function openProjectCheckpoint(checkpointId) {
  const checkpoint = await readProjectCheckpoint(checkpointId);
  return {
    id: checkpoint.id,
    createdAt: checkpoint.createdAt,
    project: checkpoint.project,
    data: checkpoint.payload,
    checkpoints: await projectCheckpointList(checkpoint.project.path),
  };
}

async function readProjectCheckpoint(checkpointId) {
  const safeId = safeCheckpointId(checkpointId);
  if (!safeId) {
    throw new Error('Invalid checkpoint id.');
  }

  const checkpoints = await allProjectCheckpoints();
  const checkpoint = checkpoints.find((item) => item.id === safeId);
  if (!checkpoint) {
    throw new Error('Checkpoint not found.');
  }

  const text = await fs.readFile(checkpoint.filePath, 'utf8');
  const data = JSON.parse(text);
  if (!data?.payload || typeof data.payload !== 'object') {
    throw new Error('Checkpoint payload is empty.');
  }
  return normalizeCheckpoint(data, checkpoint.filePath);
}

async function clearProjectCheckpoints(projectPath = '') {
  const checkpoints = await projectCheckpointList(projectPath);
  await Promise.all(checkpoints.map((checkpoint) => fs.unlink(checkpoint.filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

async function pruneProjectCheckpoints(projectPath) {
  const checkpoints = await projectCheckpointList(projectPath);
  const stale = checkpoints.slice(MAX_PROJECT_CHECKPOINTS);
  await Promise.all(stale.map((checkpoint) => fs.unlink(checkpoint.filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

function checkpointSummary(checkpoint, filePath, size) {
  const normalized = normalizeCheckpoint(checkpoint, filePath);
  if (!normalized) return null;
  return {
    id: normalized.id,
    createdAt: normalized.createdAt,
    project: normalized.project,
    name: `${normalized.project.name} @ ${normalized.createdAt}`,
    filePath,
    size,
  };
}

function normalizeCheckpoint(checkpoint, filePath) {
  if (!checkpoint || typeof checkpoint !== 'object') return null;
  const project = checkpoint.project && typeof checkpoint.project === 'object' ? checkpoint.project : {};
  const projectPath = project.path ? path.resolve(project.path) : '';
  return {
    id: safeCheckpointId(checkpoint.id) || path.basename(filePath).replace(/\.veil\.json$/i, ''),
    createdAt: checkpoint.createdAt || new Date(0).toISOString(),
    project: {
      name: project.name || (projectPath ? path.basename(projectPath) : 'Unsaved project'),
      path: projectPath,
    },
    payload: checkpoint.payload || null,
    filePath,
  };
}

function projectCheckpointsDir() {
  return path.join(app.getPath('userData'), 'project-checkpoints');
}

function compactTimestamp(value) {
  return String(value || new Date().toISOString()).replace(/[-:.TZ]/g, '').slice(0, 14);
}

function safeFileStem(value) {
  return String(value || 'project').replace(/\.veil\.json$/i, '').replace(/\.json$/i, '').replace(/[^a-z0-9._-]/gi, '-').slice(0, 80) || 'project';
}

function safeCheckpointId(value) {
  const text = String(value || '');
  return /^[a-z0-9_-]+$/i.test(text) ? text : '';
}

function normalizeRecentProjects(input) {
  const rawProjects = Array.isArray(input) ? input : Array.isArray(input?.projects) ? input.projects : [];
  const seen = new Set();
  const projects = [];

  for (const item of rawProjects) {
    const filePath = typeof item === 'string' ? item : item?.path;
    if (!filePath) continue;
    const resolvedPath = path.resolve(filePath);
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    projects.push({
      path: resolvedPath,
      name: item?.name || path.basename(resolvedPath),
      lastOpened: Number(item?.lastOpened || 0) || Date.now(),
    });
    if (projects.length >= MAX_RECENT_PROJECTS) break;
  }

  return projects;
}

function defaultProjectPath(suggestedName) {
  const name = ensureProjectExtension(String(suggestedName || 'veil-project.veil.json').replace(/[/:\\]/g, '-'));
  return path.join(app.getPath('documents'), name);
}

function ensureProjectExtension(filePath) {
  return /\.veil\.json$/i.test(filePath) ? filePath : `${filePath.replace(/\.json$/i, '')}.veil.json`;
}

function projectFileFilters() {
  return [
    { name: 'Veil Proxy Project', extensions: ['veil.json', 'json'] },
    { name: 'JSON', extensions: ['json'] },
  ];
}
