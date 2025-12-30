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
  Platform,
  AppState,
  PermissionsAndroid,
} from 'react-native';
import {Camera, CameraType} from 'react-native-camera-kit';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {check, request, openSettings, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {DEFAULT_CONFIG, getDeviceId} from './config';
import {AppConfig, ScanPayload} from './types';
import {ScannerWebSocket} from './websocket';

const STORAGE_KEY = '@scanner-config';

const App = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [connected, setConnected] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(0);
  const wsRef = useRef<ScannerWebSocket | null>(null);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [sound] = useState(() => new Sound('scan_success.mp3', Sound.MAIN_BUNDLE, () => {}));
  const permKey =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA;

  const ensurePermission = async () => {
    // 1) CameraKit APIs (alguns OEMs como Xiaomi/MIUI)
    try {
      const kitCheck = await Camera.checkDeviceCameraAuthorizationStatus?.();
      console.log('[perm] CameraKit check ->', kitCheck);
      if (kitCheck === true) return true;
      const kitReq = await Camera.requestDeviceCameraAuthorization?.();
      console.log('[perm] CameraKit request ->', kitReq);
      if (kitReq === true) return true;
    } catch (err) {
      console.log('[perm] CameraKit error', err);
    }

    // 2) react-native-permissions
    try {
      const current = await check(permKey);
      console.log('[perm] RNP current ->', current);
      if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) return true;
      if (current === RESULTS.BLOCKED) {
        Alert.alert(
          'Permissao bloqueada',
          'Ative a camera nas configuracoes do sistema para continuar.',
          [
            {text: 'Abrir configuracoes', onPress: () => openSettings()},
            {text: 'Fechar', style: 'cancel'},
          ],
        );
        return false;
      }
      const req = await request(permKey);
      console.log('[perm] RNP request ->', req);
      if (req === RESULTS.GRANTED || req === RESULTS.LIMITED) return true;
    } catch (err) {
      console.log('[perm] RNP error', err);
    }

    // 3) Prompt nativo Android
    if (Platform.OS === 'android') {
      const reqAndroid = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      console.log('[perm] PermissionsAndroid request ->', reqAndroid);
      if (reqAndroid === PermissionsAndroid.RESULTS.GRANTED) return true;
    }

    // Ultimo recurso: retorna false (UI continua renderizando camera)
    return false;
  };

  useEffect(() => {
    (async () => {
      console.log('[app] boot: solicitando permissao');
      const granted = await ensurePermission();
      setHasPermission(granted);
      console.log('[app] permissao final ->', granted);

      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const savedConfig = saved ? JSON.parse(saved) : DEFAULT_CONFIG;
      setConfig(savedConfig);
      const client = new ScannerWebSocket(deviceId, savedConfig);
      client.subscribe(setConnected);
      client.connect();
      wsRef.current = client;
      return () => client.close();
    })();
  }, [deviceId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active') {
        const ok = await ensurePermission();
        setHasPermission(ok);
        console.log('[app] resume permission ->', ok);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!wsRef.current) return;
    wsRef.current.updateConfig(config);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = (changes: Partial<AppConfig>) => setConfig(prev => ({...prev, ...changes}));
  const handleRead = (event: any) => {
    console.log('[scan] raw event', event?.nativeEvent);
    const now = Date.now();
    if (now - lastReadAt < config.scanDelayMs) return;
    const codeValue = event?.nativeEvent?.codeStringValue;
    const format = event?.nativeEvent?.type || 'UNKNOWN';
    if (!codeValue) return;

    setLastReadAt(now);

    const payload: ScanPayload = {
      type: 'SCAN',
      deviceId,
      barcode: codeValue,
      format,
      timestamp: new Date().toISOString(),
    };

    wsRef.current?.sendScan(payload);
    if (config.vibrate) Vibration.vibrate(100);
    if (config.playSound && sound.isLoaded()) sound.play();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Scanner Wi-Fi</Text>
        <Text style={[styles.badge, connected ? styles.badgeOn : styles.badgeOff]}>
          {connected ? 'Conectado' : 'Desconectado'}
        </Text>
      </View>

      {/* Renderiza a camera mesmo sem flag de permissao para evitar loop de bloqueio em OEMs */}
      <Camera
        style={styles.camera}
        cameraType={CameraType.Back}
        scanBarcode
        onReadCode={handleRead}
        showFrame
        laserColor="red"
        frameColor="white"
      />

      {hasPermission === false && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Sem acesso a camera. Toque em "Permitir" ou habilite manualmente nas configuracoes.
          </Text>
          <TouchableOpacity
            style={[styles.button, {marginTop: 8}]}
            onPress={async () => {
              const ok = await ensurePermission();
              setHasPermission(ok);
              if (!ok) openSettings();
            }}>
            <Text style={styles.buttonText}>Permitir</Text>
          </TouchableOpacity>
        </View>
      )}

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
          Alert.alert('Reconexao', 'Tentando reconectar...');
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
  banner: {
    backgroundColor: '#ffcc00',
    padding: 10,
    marginHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  bannerText: {color: '#111', fontWeight: '600'},
});

export default App;
