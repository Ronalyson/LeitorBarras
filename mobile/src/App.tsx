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

type ConfigPayload = {host: string; port: number; token: string};

const App = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState('Aguardando conexão manual');
  const [lastReadAt, setLastReadAt] = useState<number>(0);
  const [configScanMode, setConfigScanMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const wsRef = useRef<ScannerWebSocket | null>(null);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [sound] = useState(() => new Sound('scan_success.mp3', Sound.MAIN_BUNDLE, () => {}));
  const permKey = Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA;

  const ensurePermission = async () => {
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

    try {
      const current = await check(permKey);
      console.log('[perm] RNP current ->', current);
      if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) return true;
      if (current === RESULTS.BLOCKED) {
        Alert.alert(
          'Permissão bloqueada',
          'Ative a câmera nas configurações do sistema para continuar.',
          [
            {text: 'Abrir configurações', onPress: () => openSettings()},
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

    if (Platform.OS === 'android') {
      const reqAndroid = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      console.log('[perm] PermissionsAndroid request ->', reqAndroid);
      if (reqAndroid === PermissionsAndroid.RESULTS.GRANTED) return true;
    }
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
      client.subscribe((isConnected, reason) => {
        setConnected(isConnected);
        if (reason) setConnectionInfo(reason);
      });
      wsRef.current = client;
      return () => client.shutdown();
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

  const connectNow = () => {
    if (!wsRef.current) {
      const client = new ScannerWebSocket(deviceId, config);
      client.subscribe((isConnected, reason) => {
        setConnected(isConnected);
        if (reason) setConnectionInfo(reason);
      });
      wsRef.current = client;
    }
    wsRef.current.updateConfig(config);
    wsRef.current.connect();
    Alert.alert('Conexão', 'Tentando conectar ao servidor...');
  };

  const parseConfigFromString = (raw: string): ConfigPayload | null => {
    try {
      const obj = JSON.parse(raw);
      if (obj.host && obj.port && obj.token) {
        return {host: obj.host, port: Number(obj.port), token: String(obj.token)};
      }
    } catch {
      // not json
    }
    const regex = /host=([^;]+);?port=([0-9]+);?token=([^;]+)/i;
    const match = raw.match(regex);
    if (match) {
      return {host: match[1], port: Number(match[2]), token: match[3]};
    }
    return null;
  };

  const handleConfigScan = (value: string) => {
    const parsed = parseConfigFromString(value);
    if (!parsed) {
      Alert.alert('QR inválido', 'Não foi possível ler IP/porta/token.');
      return;
    }
    const next: AppConfig = {...config, serverHost: parsed.host, serverPort: String(parsed.port), token: parsed.token};
    setConfig(next);
    setConfigScanMode(false);
    Alert.alert('Pareamento atualizado', `IP: ${parsed.host}\nPorta: ${parsed.port}\nToken: ${parsed.token}`, [
      {text: 'Conectar agora', onPress: () => connectNow()},
      {text: 'Fechar', style: 'cancel'},
    ]);
  };

  const handleRead = (event: any) => {
    const now = Date.now();
    if (now - lastReadAt < config.scanDelayMs) return;
    const codeValue = event?.nativeEvent?.codeStringValue;
    const format = event?.nativeEvent?.type || 'UNKNOWN';
    console.log('[scan] raw event', event?.nativeEvent);

    if (!codeValue) return;

    if (configScanMode) {
      handleConfigScan(codeValue);
      return;
    }

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
      <Text style={styles.subtitle}>{connectionInfo}</Text>

      <Camera
        style={styles.camera}
        cameraType={CameraType.Back}
        scanBarcode
        onReadCode={handleRead}
        showFrame
        laserColor="red"
        frameColor="white"
      />
      {configScanMode && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Lendo QR de pareamento...</Text>
          <Text style={styles.overlaySub}>Aponte para o QR no desktop para preencher IP/porta/token.</Text>
          <TouchableOpacity style={[styles.button, {marginTop: 8}]} onPress={() => setConfigScanMode(false)}>
            <Text style={styles.buttonText}>Cancelar leitura de QR</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {showSettings && (
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
      )}

      <View style={{flexDirection: 'row', gap: 8, paddingHorizontal: 12}}>
        <TouchableOpacity style={[styles.button, {flex: 1}]} onPress={connectNow}>
          <Text style={styles.buttonText}>Conectar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, {flex: 1, backgroundColor: configScanMode ? '#8b949e' : '#238636'}]}
          onPress={() => {
            setConfigScanMode(true);
            Alert.alert('Ler QR do PC', 'Aponte a câmera para o QR que aparece no programa do desktop.');
          }}>
          <Text style={styles.buttonText}>{configScanMode ? 'Lendo QR...' : 'Ler QR de pareamento'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, {marginHorizontal: 12, backgroundColor: '#30363d'}]}
        onPress={() => setShowSettings(prev => !prev)}>
        <Text style={styles.buttonText}>{showSettings ? 'Fechar configurações' : 'Configurações'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d1117'},
  header: {flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center'},
  title: {color: '#fff', fontSize: 18, fontWeight: '700'},
  subtitle: {color: '#c9d1d9', fontSize: 12, paddingHorizontal: 16, paddingBottom: 4},
  badge: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, color: '#fff'},
  badgeOn: {backgroundColor: '#1f6feb'},
  badgeOff: {backgroundColor: '#8b949e'},
  camera: {flex: 1, borderRadius: 12, overflow: 'hidden', marginHorizontal: 12},
  form: {padding: 12},
  overlay: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 8,
  },
  overlayText: {color: '#fff', fontWeight: '700', marginBottom: 4, textAlign: 'center'},
  overlaySub: {color: '#c9d1d9', fontSize: 12, textAlign: 'center'},
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
    marginVertical: 12,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontWeight: '700', textAlign: 'center'},
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
