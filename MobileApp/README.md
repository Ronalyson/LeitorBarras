# Leitor Mobile (Expo / React Native)

App simples para Android que usa a câmera como leitor de código de barras/QR e envia para o servidor desktop na mesma rede Wi‑Fi.

## Pré-requisitos
- Node 18+
- `npm i -g expo-cli` (ou usar `npx expo`)
- Celular Android na mesma rede que o desktop.

## Instalação
```bash
cd MobileApp
npm install
```

## Rodar no Android
1. No desktop, suba o servidor Python e anote IP e token.
2. Ainda no desktop, rode `npm start` (ou `npx expo start`) dentro de `MobileApp`.
3. Abra o Expo Go no celular e escaneie o QR do terminal/Expo Dev Tools.
4. No app, preencha IP (ex: 192.168.0.10), porta (padrão 5000) e o token mostrado no desktop.
5. Aponte a câmera para o código; o app envia `POST /api/submit` com `{ code, token }`.

## Ajustes rápidos
- Porta/token: configuráveis na tela.
- URL alvo: sempre `http://<IP>:<porta>/api/submit`.
- Permissões: a primeira execução pedirá acesso à câmera.

## Build APK (Expo EAS ou bare)
- Mais rápido: use Expo EAS (`eas build -p android`). Será preciso configurar uma conta Expo/EAS.
- Alternativa: eject para bare React Native e gerar APK com Gradle/Android Studio.

## Estrutura
- `App.js` — UI e fluxo de leitura/envio.
- `app.json` — config Expo.
- `package.json` — dependências (expo + expo-barcode-scanner).
