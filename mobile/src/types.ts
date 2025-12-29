export type ScanPayload = {
  type: 'SCAN';
  deviceId: string;
  barcode: string;
  format: string;
  timestamp: string;
};

export type AppConfig = {
  serverHost: string;
  serverPort: string;
  token: string;
  scanDelayMs: number;
  vibrate: boolean;
  playSound: boolean;
  flash: boolean;
};
