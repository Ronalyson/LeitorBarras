import {app, BrowserWindow, ipcMain, Tray, Menu, nativeImage} from 'electron';
import path from 'path';
import {ScannerServer} from './server';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: ScannerServer;
let currentPort = 8080;
let currentToken = 'PAREAMENTO';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.on('close', e => {
    // Mantém o app rodando no tray.
    e.preventDefault();
    mainWindow?.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  const menu = Menu.buildFromTemplate([
    {label: 'Abrir', click: () => mainWindow?.show()},
    {label: 'Sair', click: () => app.quit()},
  ]);
  tray.setToolTip('Leitor de Barras Wi-Fi');
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow?.show());
}

app.whenReady().then(() => {
  server = new ScannerServer({
    onLog: msg => mainWindow?.webContents.send('log', msg),
    onClientsChange: clients => mainWindow?.webContents.send('clients', clients),
  });
  createWindow();
  createTray();
  server.start(currentPort, currentToken);
  // Inicia com Windows para operar em background.
  app.setLoginItemSettings({openAtLogin: true});
});

app.on('window-all-closed', () => {
  // Mantém no tray
});

ipcMain.handle('get-status', () => ({
  port: currentPort,
  token: currentToken,
  ip: server.getLocalIp(),
}));

ipcMain.handle('update-settings', (_event, {port, token}) => {
  currentPort = port;
  currentToken = token;
  server.start(currentPort, currentToken);
  return {port: currentPort, token: currentToken, ip: server.getLocalIp()};
});
