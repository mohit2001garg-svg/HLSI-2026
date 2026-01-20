const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true, // Start in full screen mode
    autoHideMenuBar: true, // Hide the menu bar config
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    backgroundColor: '#000000',
    title: 'HI-LINE STONE Management System'
  });

  // Explicitly remove the application menu bar (File, Window, Help, etc.)
  win.removeMenu();

  // Loads the interface from the www directory
  win.loadFile('www/index.html');
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