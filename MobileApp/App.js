import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, TextInput, Button, Alert, ScrollView, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [serverHost, setServerHost] = useState("");
  const [port, setPort] = useState("5000");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("Aguardando permissão da câmera");

  const serverUrl = useMemo(() => {
    if (!serverHost || !port) return "";
    return `http://${serverHost}:${port}`;
  }, [serverHost, port]);

  const sendCode = async (code) => {
    if (!serverUrl || !token) {
      Alert.alert("Configuração", "Preencha IP/porta e token antes de ler.");
      return;
    }
    try {
      setStatus("Enviando...");
      const res = await fetch(`${serverUrl}/api/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, token }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Erro ao enviar");
      setStatus("Enviado");
    } catch (err) {
      setStatus("Erro ao enviar");
      Alert.alert("Erro", err.message || "Falha ao enviar código");
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    setScanned(true);
    setLastCode(data);
    setStatus("Código lido");
    sendCode(data);
    setTimeout(() => setScanned(false), 1200);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Pedindo permissão...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Acesso à câmera negado</Text>
        <Text style={styles.subtitle}>Libere a câmera nas permissões do app.</Text>
        <View style={{ marginTop: 12 }}>
          <Button title="Conceder permissão" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Leitor Mobile</Text>
        <Text style={styles.subtitle}>Mesma rede Wi-Fi; informe IP, porta e token do desktop.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>IP do desktop</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 192.168.0.10"
          placeholderTextColor="#94a3b8"
          value={serverHost}
          onChangeText={setServerHost}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.label}>Porta</Text>
        <TextInput
          style={styles.input}
          placeholder="5000"
          placeholderTextColor="#94a3b8"
          value={port}
          onChangeText={setPort}
          keyboardType="numeric"
        />
        <Text style={styles.label}>Token</Text>
        <TextInput
          style={styles.input}
          placeholder="Token do desktop"
          placeholderTextColor="#94a3b8"
          value={token}
          onChangeText={setToken}
          autoCapitalize="characters"
        />
        <Text style={styles.small}>URL alvo: {serverUrl ? `${serverUrl}/api/submit` : "—"}</Text>
      </View>

      <View style={styles.scannerBox}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{status}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Último código</Text>
        <Text style={styles.footerValue}>{lastCode || "—"}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingTop: Constants.statusBarHeight + 12,
    paddingHorizontal: 16,
    backgroundColor: "#0f172a",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    padding: 24,
  },
  header: { marginBottom: 16 },
  title: { color: "white", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#cbd5e1", marginTop: 6, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 16,
  },
  label: { color: "#e2e8f0", marginTop: 8, marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    fontSize: 15,
  },
  small: { color: "#94a3b8", marginTop: 10, fontSize: 12 },
  scannerBox: {
    height: 320,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 16,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  overlayText: { color: "white", textAlign: "center", fontWeight: "600" },
  footer: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 20,
  },
  footerLabel: { color: "#e2e8f0", marginBottom: 6, fontWeight: "600" },
  footerValue: { color: "#38bdf8", fontSize: 16, marginBottom: 10 },
});
