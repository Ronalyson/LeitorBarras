# Leitor de Barras Wi-Fi (Android + Desktop)

Sistema completo para substituir leitor físico de código de barras: o Android lê códigos e envia via WebSocket local para o app desktop Windows, que digita automaticamente no foco ativo (ERP, navegador, legado).

## Estrutura
- `mobile/` — App Android React Native (TypeScript) com `react-native-vision-camera` + `vision-camera-code-scanner`.
- `desktop/` — App Electron (TypeScript) com servidor WebSocket (`ws`) e simulação de teclado (`robotjs`).
- `shared/` — Tipos compartilhados simples.

> Comentários no código foram escritos como se fossem meus, explicando escolhas e funcionamento ponto a ponto.

## Protocolo
Payload JSON enviado pelo Android:
```json
{ "type": "SCAN", "deviceId": "ANDROID_001", "barcode": "7891234567890", "format": "EAN_13", "timestamp": "2025-01-01T10:30:00" }
```
Headers de handshake: `Authorization: <token>`, `X-Device-ID: <deviceId>`.

## Pré-requisitos (offline/local)
- Node.js 18+ e Yarn/NPM offline com cache local dos pacotes listados.
- Java JDK (recomendado) para build Android.
- Android SDK/NDK + emulador/dispositivo físico (API 26+).
- Para o desktop: Build tools do Windows para compilar `robotjs`.

## Mobile (Android)
1) Instalar dependências (usando cache local):
```bash
cd mobile
yarn install
```
2) Android:
```bash
cd android
./gradlew assembleRelease   # gera APK em android/app/build/outputs/apk/release
```
3) Ajustes necessários:
   - Adicione um som em `android/app/src/main/res/raw/scan_success.mp3` para feedback.
   - Garanta permissões de câmera no AndroidManifest (RN já adiciona; se necessário, inclua `android.permission.CAMERA`).
4) Uso:
   - Abra o app, informe IP do PC, porta e token.
   - Aponte para o código; leitura contínua sem botão. Feedback vibratório/sonoro opcional.

## Desktop (Windows)
1) Instalar dependências:
```bash
cd desktop
yarn install
```
2) Build:
```bash
yarn build   # compila TS para dist/
yarn dist    # gera instalador .exe via electron-builder
```
3) Execução local:
```bash
yarn start   # modo dev com electron
```
4) Funcionalidades:
   - Exibe IP local e porta do servidor WebSocket.
   - Valida token de pareamento no handshake.
   - Aceita múltiplos Androids, log em tempo real, lista de dispositivos.
   - Simula leitor USB digitando código + ENTER onde o cursor estiver (via robotjs).
   - Tray + início automático com Windows (electron-builder + `setLoginItemSettings`).

## Segurança e rede
- Servidor escuta apenas rede local (IPs 192.168/10/172.16). Não usa internet/serviços externos.
- Troca autenticada por token simples; personalize no desktop e mobile.

## Observações de build offline
- Todos os pacotes são open-source e gratuitos.
- Para evitar dependência externa de tipos, removi `@types/robotjs` e incluí definição local em `desktop/src/types/robotjs.d.ts`. Caso o build do `robotjs` falhe, instale as ferramentas de build do Windows (MSVC + Python) e recompile; alternativa: trocar por `node-key-sender` (ajuste `desktop/src/server.ts`).
- Se precisar assinar o .exe, configure certificados no `electron-builder`.

## Próximos passos
- Executar `yarn install` nos diretórios `mobile` e `desktop` usando cache local.
- Colocar o arquivo de som em `android/app/src/main/res/raw/scan_success.mp3`.
- Gerar APK (`./gradlew assembleRelease`) e instalador Windows (`yarn dist`).
