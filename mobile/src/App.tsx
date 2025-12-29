import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import {Camera, useCameraDevices} from 'react-native-vision-camera';
import {useScanBarcodes, BarcodeFormat} from 'vision-camera-code-scanner';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_CONFIG, getDeviceId} from './config';
import {AppConfig, ScanPayload} from './types';
import {ScannerWebSocket} from './websocket';

const STORAGE_KEY = '@scanner-config';

const formats = [
  BarcodeFormat.ALL_FORMATS,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
];

const App = () => {
  const devices = useCameraDevices();
  const device = devices.back;
  const [hasPermission, setHasPermission] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [connected, setConnected] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(0);
  const wsRef = useRef<ScannerWebSocket | null>(null);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [sound] = useState(() => new Sound('scan_success.mp3', Sound.MAIN_BUNDLE, () => {}));

  const [frameProcessor, barcodes] = useScanBarcodes(formats, {
    checkInverted: true,
  });

  useEffect(() => {
    (async () => {
      // Pede permissão de câmera e restaura config persistida.
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'authorized');
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setConfig(JSON.parse(saved));
      const client = new ScannerWebSocket(deviceId, saved ? JSON.parse(saved) : DEFAULT_CONFIG);
      client.subscribe(setConnected);
      client.connect();
      wsRef.current = client;
      return () => client.close();
    })();
  }, [deviceId]);

  useEffect(() => {
    if (!wsRef.current) return;
    // Sempre que config muda, reconecta e persiste.
    wsRef.current.updateConfig(config);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!barcodes.length) return;
    const now = Date.now();
    if (now - lastReadAt < config.scanDelayMs) return;
    const code = barcodes[0];
    if (!code.displayValue) return;
    setLastReadAt(now);

    const payload: ScanPayload = {
      type: 'SCAN',
      deviceId,
      barcode: code.displayValue,
      format: code.format || 'UNKNOWN',
      timestamp: new Date().toISOString(),
    };

    wsRef.current?.sendScan(payload);

    if (config.vibrate) Vibration.vibrate(100);
    if (config.playSound && sound.isLoaded()) sound.play();
  }, [barcodes, config, deviceId, lastReadAt, sound]);

  if (!device) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>Nenhuma câmera encontrada.</Text>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>Permita acesso à câmera para iniciar.</Text>
      </SafeAreaView>
    );
  }

  const updateConfig = (changes: Partial<AppConfig>) => setConfig(prev => ({...prev, ...changes}));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Scanner Wi-Fi</Text>
        <Text style={[styles.badge, connected ? styles.badgeOn : styles.badgeOff]}>
          {connected ? 'Conectado' : 'Desconectado'}
        </Text>
      </View>

      <Camera
        style={styles.camera}
        device={device}
        isActive
        enableZoomGesture
        frameProcessor={frameProcessor}
        frameProcessorFps={5}
      />

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="IP do PC"
          value={config.serverHost}
          onChangeText={text => updateConfig({serverHost: text})}
        />
        <TextInput
          style={styles.input}
          placeholder="Porta"
          keyboardType="numeric"
          value={config.serverPort}
          onChangeText={text => updateConfig({serverPort: text})}
        />
        <TextInput
          style={styles.input}
          placeholder="Token de pareamento"
          value={config.token}
          onChangeText={text => updateConfig({token: text})}
        />
        <TextInput
          style={styles.input}
          placeholder="Delay entre leituras (ms)"
          keyboardType="numeric"
          value={String(config.scanDelayMs)}
          onChangeText={text => updateConfig({scanDelayMs: Number(text) || DEFAULT_CONFIG.scanDelayMs})}
        />
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          wsRef.current?.connect();
          Alert.alert('Reconexão', 'Tentando reconectar...');
        }}>
        <Text style={styles.buttonText}>Reconectar</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d1117'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center'},
  title: {color: '#fff', fontSize: 18, fontWeight: '700'},
  badge: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, color: '#fff'},
  badgeOn: {backgroundColor: '#1f6feb'},
  badgeOff: {backgroundColor: '#8b949e'},
  camera: {flex: 1, borderRadius: 12, overflow: 'hidden', marginHorizontal: 12},
  form: {padding: 12},
  input: {
    backgroundColor: '#161b22',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  button: {
    backgroundColor: '#1f6feb',
    padding: 14,
    borderRadius: 8,
    margin: 12,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontWeight: '700'},
});

export default App;
