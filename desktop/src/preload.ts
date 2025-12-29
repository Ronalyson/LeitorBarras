import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('bridge', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  updateSettings: (port: number, token: string) => ipcRenderer.invoke('update-settings', {port, token}),
  // Eventos push do processo principal.
  onLog: (cb: (msg: string) => void) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
  onClients: (cb: (clients: any[]) => void) => ipcRenderer.on('clients', (_e, clients) => cb(clients)),
});
