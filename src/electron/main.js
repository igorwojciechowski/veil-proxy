const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { createApp } = require('../main/veilApp');

let backend;
let mainWindow;
let currentProjectPath = null;

async function createWindow() {
  app.setName('Veil Proxy');
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${state.apiPort}?desktop=1`);
}

ipcMain.handle('project:save', async (_event, request) => saveProjectFile(request, false));
ipcMain.handle('project:save-as', async (_event, request) => saveProjectFile(request, true));
ipcMain.handle('project:open', async () => openProjectFile());
ipcMain.handle('project:forget', async () => {
  currentProjectPath = null;
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
  return {
    canceled: false,
    path: targetPath,
    name: path.basename(targetPath),
  };
}

async function openProjectFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Veil Proxy Project',
    properties: ['openFile'],
    filters: projectFileFilters(),
  });
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const targetPath = result.filePaths[0];
  const text = await fs.readFile(targetPath, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid project file: ${error.message}`);
  }

  currentProjectPath = targetPath;
  return {
    canceled: false,
    path: targetPath,
    name: path.basename(targetPath),
    data,
  };
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
