export type ScanPayload = {
  type: 'SCAN';
  deviceId: string;
  barcode: string;
  format: string;
  timestamp: string;
};

export type ConnectionInfo = {
  deviceId: string;
  ip: string;
  connectedAt: string;
};
