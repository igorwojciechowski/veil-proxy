const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { createApp } = require('../main/veilApp');

let backend;
let mainWindow;

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${state.apiPort}`);
}

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
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
