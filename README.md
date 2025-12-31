# Leitor de Barras Wi‑Fi (Android + Desktop)

Sistema offline que transforma um Android em leitor de códigos de barras: o app móvel lê EAN-13/EAN-8/UPC-A/Code-128/Code-39/QR e envia via WebSocket local para o app desktop Windows, que cola o código inteiro no campo focado e envia ENTER (simulação de leitor USB).

## Arquitetura
- **mobile/** – React Native (TypeScript) com `react-native-camera-kit`. Pareamento por QR, conexão manual, reconexão após a primeira conexão, tela de câmera limpa e menu de configurações.
- **desktop/** – Electron (TypeScript) com servidor WebSocket (`ws`), simulação de teclado (`robotjs` via Ctrl+V + Enter) e QR na UI para configurar o mobile sem digitar.

## Protocolo
```json
{ "type": "SCAN", "deviceId": "ANDROID_001", "barcode": "7891234567890", "format": "EAN_13", "timestamp": "2025-01-01T10:30:00" }
```
Headers: `Authorization: <token>`, `X-Device-ID: <deviceId>`.

## Pré-requisitos
- Node.js 18+, Yarn/NPM com cache local.
- Java JDK, Android SDK/NDK, dispositivo/emulador API 26+.
- Windows build tools para compilar `robotjs`.

## Desktop (Windows)
1) Dependências  
```bash
cd desktop
yarn install
```
2) Build / instalador  
```bash
yarn build   # compila TS e copia renderer para dist/
yarn dist    # gera instalador .exe (electron-builder)
```
3) Dev  
```bash
yarn start
```
4) Funcionalidades  
   - Exibe IP/porta/token e gera QR para pareamento do mobile.  
   - Valida token, aceita múltiplos dispositivos, log em tempo real, lista de clientes.  
   - Cola código via Ctrl+V e envia ENTER no foco ativo.  
   - Tray + início automático com Windows; botão Sair encerra de fato.

## Mobile (Android)
1) Dependências  
```bash
cd mobile
yarn install
```
2) Bundle + APK  
```bash
npx react-native bundle --platform android --dev false --reset-cache --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android
./gradlew assembleDebug   # APK em android/app/build/outputs/apk/debug
```
3) Uso  
   - Toque **Ler QR de pareamento** e aponte para o QR exibido no desktop (preenche IP/porta/token).  
   - Toque **Conectar**; reconexão automática só depois da primeira conexão manual.  
   - Botão **Configurações** abre/fecha os campos para manter a tela de câmera limpa.  
   - Leitura contínua com feedback vibratório/sonoro.

## Segurança e rede
- Servidor escuta apenas rede local (192.168/10/172.16). Sem internet ou serviços externos.
- Token simples configurável no desktop e no mobile.

## Build offline
- Pacotes open-source; tipos locais em `desktop/src/types/robotjs.d.ts` e `desktop/src/types/qrcode.d.ts`.
- `electron` em devDependencies (requisito do electron-builder).
- Renderer copiado de `src/renderer/` para `dist/renderer` via `scripts/copy-static.js`; novos assets ficam em `src/renderer/`.

## Passos rápidos
- `yarn install` em `mobile` e `desktop`.
- Gerar APK (`./gradlew assembleDebug` ou `assembleRelease`) e instalador (`yarn dist`).
- No desktop instalado, abra, leia o QR pelo mobile e conecte; o scanner cola os códigos instantaneamente no campo focado.
