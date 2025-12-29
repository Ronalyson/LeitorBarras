import {AppConfig, ScanPayload} from './types';

type Listener = (connected: boolean) => void;

export class ScannerWebSocket {
  private ws: WebSocket | null = null;
  private connected = false;
  private onChange: Listener[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deviceId: string,
    private config: AppConfig,
  ) {}

  subscribe(listener: Listener) {
    this.onChange.push(listener);
  }

  private notify(connected: boolean) {
    this.connected = connected;
    this.onChange.forEach(fn => fn(connected));
  }

  connect() {
    // Conecta ao servidor desktop com headers de pareamento.
    const url = `ws://${this.config.serverHost}:${this.config.serverPort}`;
    try {
      this.ws?.close();
      this.ws = new WebSocket(url, [], {
        headers: {Authorization: this.config.token, 'X-Device-ID': this.deviceId},
      } as any);

      this.ws.onopen = () => {
        this.notify(true);
      };

      this.ws.onerror = () => {
        this.notify(false);
        this.scheduleReconnect();
      };

      this.ws.onclose = () => {
        this.notify(false);
        this.scheduleReconnect();
      };
    } catch (err) {
      this.notify(false);
      this.scheduleReconnect();
    }
  }

  updateConfig(config: AppConfig) {
    // Reaplica conexão sempre que IP/porta/token mudar.
    this.config = config;
    this.connect();
  }

  sendScan(payload: ScanPayload) {
    if (!this.ws || this.ws.readyState !== 1) {
      return;
    }
    // Envia leitura imediatamente.
    this.ws.send(JSON.stringify(payload));
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }
}
