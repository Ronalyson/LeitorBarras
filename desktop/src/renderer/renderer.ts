type Status = {port: number; token: string; ip: string; qr?: string};

const statusEl = document.getElementById('status')!;
const portEl = document.getElementById('port') as HTMLInputElement;
const tokenEl = document.getElementById('token') as HTMLInputElement;
const logEl = document.getElementById('log')!;
const clientsEl = document.getElementById('clients')!;
const saveBtn = document.getElementById('save')!;
const quitBtn = document.getElementById('quit')!;
const qrImg = document.getElementById('qr') as HTMLImageElement;

function appendLog(msg: string) {
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `<div>[${time}] ${msg}</div>` + logEl.innerHTML;
}

function renderStatus(data: Status) {
  statusEl.innerHTML = `
    <div>IP local: ${data.ip}</div>
    <div>Porta: ${data.port}</div>
    <div>Token: ${data.token}</div>
  `;
  portEl.value = String(data.port);
  tokenEl.value = data.token;
  renderQr(data);
}

function renderClients(clients: any[]) {
  clientsEl.innerHTML = clients
    .map(
      c =>
        `<li>${c.deviceId} - ${c.ip} <small>${new Date(c.connectedAt).toLocaleTimeString()}</small></li>`,
    )
    .join('');
}

async function bootstrap() {
  const status = await (window as any).bridge.getStatus();
  renderStatus(status);
}

saveBtn.addEventListener('click', async () => {
  const port = Number(portEl.value) || 8080;
  const token = tokenEl.value || 'PAREAMENTO';
  const status = await (window as any).bridge.updateSettings(port, token);
  renderStatus(status);
  appendLog('Servidor reiniciado');
});

quitBtn.addEventListener('click', () => (window as any).bridge.quitApp());

(window as any).bridge.onLog((msg: string) => appendLog(msg));
(window as any).bridge.onClients((clients: any[]) => renderClients(clients));

bootstrap();

async function renderQr(data: Status) {
  if (!qrImg) return;
  if (data.qr) {
    qrImg.src = data.qr;
  } else {
    qrImg.removeAttribute('src');
  }
}
