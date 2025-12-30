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
    // Usa identificador único do aparelho; prefere versão síncrona para evitar Promise serializada.
    const rawSync = (DeviceInfo as any).getUniqueIdSync
      ? (DeviceInfo as any).getUniqueIdSync()
      : undefined;
    const rawAsync = !rawSync && DeviceInfo.getUniqueId ? DeviceInfo.getUniqueId() : undefined;

    let id: string = Platform.OS.toUpperCase();
    if (typeof rawSync === 'string' && rawSync.length > 0) id = rawSync;
    else if (rawAsync && typeof (rawAsync as any).then === 'function') {
      // Nunca aguarda Promise aqui; evita cair em [object Object]
      id = 'ASYNC_ID_PENDING';
    } else if (typeof rawAsync === 'string') {
      id = rawAsync;
    }

    return `ANDROID_${id}`;
  } catch (err) {
    return `ANDROID_${Platform.OS.toUpperCase()}`;
  }
};
