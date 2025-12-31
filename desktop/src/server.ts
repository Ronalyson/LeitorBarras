import {WebSocketServer, WebSocket} from 'ws';
import os from 'os';
import {clipboard} from 'electron';
import {ScanPayload, ConnectionInfo} from './types';
import robot from 'robotjs';

type Callbacks = {
  onLog: (message: string) => void;
  onClientsChange: (clients: ConnectionInfo[]) => void;
};

export class ScannerServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, ConnectionInfo>();

  constructor(private readonly callbacks: Callbacks) {
    // Digitação o mais rápida possível para simular "colar" o código.
    robot.setKeyboardDelay(0);
  }

  start(port: number, token: string) {
    this.stop();
    this.wss = new WebSocketServer({port, host: '0.0.0.0'});
    this.wss.on('connection', (ws, req) => {
      const auth = req.headers['authorization'];
      const deviceId = (req.headers['x-device-id'] as string) || 'UNKNOWN';
      const ip = req.socket.remoteAddress || '';

      if (!auth || auth !== token) {
        ws.close(4001, 'Token inválido');
        return;
      }
      if (!this.isLocal(ip)) {
        ws.close(4003, 'Somente rede local');
        return;
      }

      const info: ConnectionInfo = {deviceId, ip, connectedAt: new Date().toISOString()};
      this.clients.set(ws, info);
      this.callbacks.onClientsChange([...this.clients.values()]);
      this.callbacks.onLog(`Conectado: ${deviceId} (${ip})`);

      ws.on('message', data => this.onMessage(ws, data.toString()));
      ws.on('close', () => {
        this.clients.delete(ws);
        this.callbacks.onClientsChange([...this.clients.values()]);
        this.callbacks.onLog(`Desconectado: ${deviceId}`);
      });
    });

    this.callbacks.onLog(`Servidor iniciado na porta ${port}`);
  }

  stop() {
    this.wss?.clients.forEach(c => c.close());
    this.wss?.close();
    this.wss = null;
    this.clients.clear();
    this.callbacks.onClientsChange([]);
  }

  private onMessage(ws: WebSocket, data: string) {
    try {
      const payload = JSON.parse(data) as ScanPayload;
      if (payload.type !== 'SCAN') return;
      // Log detalhado e simulação imediata de teclado.
      this.callbacks.onLog(`[${payload.deviceId}] ${payload.barcode} (${payload.format}) ${payload.timestamp}`);
      this.typeBarcode(payload.barcode);
    } catch (err) {
      this.callbacks.onLog(`Erro ao processar mensagem: ${(err as Error).message}`);
      ws.close(4002, 'Payload inválido');
    }
  }

  private typeBarcode(barcode: string) {
    // Digita o código onde o foco do usuário estiver e finaliza com ENTER.
    clipboard.writeText(barcode);
    robot.keyTap('v', 'control');
    robot.keyTap('enter');
  }

  getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '0.0.0.0';
  }

  private isLocal(ip: string): boolean {
    return ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.');
  }
}
