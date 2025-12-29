import {AppConfig} from './types';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

export const DEFAULT_CONFIG: AppConfig = {
  serverHost: '192.168.0.10',
  serverPort: '8080',
  token: 'PAREAMENTO',
  scanDelayMs: 800,
  vibrate: true,
  playSound: true,
  flash: false,
};

export const getDeviceId = (): string => {
  try {
    // Usa identificador único do aparelho para rastrear origem das leituras.
    const id = DeviceInfo.getUniqueId
      ? DeviceInfo.getUniqueId()
      : Platform.OS.toUpperCase();
    return `ANDROID_${id}`;
  } catch (err) {
    return `ANDROID_${Platform.OS.toUpperCase()}`;
  }
};
