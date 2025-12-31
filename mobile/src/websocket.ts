import {AppConfig, ScanPayload} from './types';

type Listener = (connected: boolean, reason?: string) => void;

export class ScannerWebSocket {
  private ws: WebSocket | null = null;
  private connected = false;
  private onChange: Listener[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = false;

  constructor(
    private readonly deviceId: string,
    private config: AppConfig,
  ) {}

  subscribe(listener: Listener) {
    this.onChange.push(listener);
  }

  private notify(connected: boolean, reason?: string) {
    this.connected = connected;
    this.onChange.forEach(fn => fn(connected, reason));
  }

  connect() {
    // Conecta ao servidor desktop com headers de pareamento.
    this.shouldReconnect = true;
    const url = `ws://${this.config.serverHost}:${this.config.serverPort}`;
    try {
      this.ws?.close();
      this.ws = new WebSocket(url, [], {
        headers: {Authorization: this.config.token, 'X-Device-ID': this.deviceId},
      } as any);

      this.ws.onopen = () => {
        this.notify(true, 'conectado');
        this.startHeartbeat();
      };

      this.ws.onerror = ev => {
        this.notify(false, `erro de conexão: ${String((ev as any)?.message || '')}`);
        this.scheduleReconnect();
      };

      this.ws.onclose = ev => {
        const reasonText = ev.reason ? ` ${ev.reason}` : '';
        this.notify(false, `desconectado (${ev.code}${reasonText})`);
        this.stopHeartbeat();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.notify(false, `exceção: ${String(err)}`);
      this.stopHeartbeat();
      this.scheduleReconnect();
    }
  }

  updateConfig(config: AppConfig) {
    // Atualiza sem reconectar automaticamente; o app decide quando conectar.
    this.config = config;
  }

  shutdown() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.notify(false, 'desligado');
  }

  sendScan(payload: ScanPayload) {
    if (!this.ws || this.ws.readyState !== 1) {
      return;
    }
    // Envia leitura imediatamente.
    this.ws.send(JSON.stringify(payload));
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(
            JSON.stringify({type: 'PING', deviceId: this.deviceId, ts: new Date().toISOString()}),
          );
        } catch {
          // ignore
        }
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
