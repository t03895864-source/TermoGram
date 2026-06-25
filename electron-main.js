const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'TERMOGRAM',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'public/icon.png')
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'TERMOGRAM',
      submenu: [
        { label: 'О программе', click: () => dialog.showMessageBox({ message: 'TERMOGRAM v1.0\nМессенджер нового поколения' }) },
        { type: 'separator' },
        { label: 'Открыть в браузере', click: () => shell.openExternal('http://localhost:3000') },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  // Загружаем локальный файл (работает без сервера)
  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

