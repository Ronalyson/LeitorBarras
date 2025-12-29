export type ScanPayload = {
  type: 'SCAN';
  deviceId: string;
  barcode: string;
  format: string;
  timestamp: string;
};

export type ServerHandshake = {
  type: 'HELLO';
  token: string;
  deviceId: string;
};
