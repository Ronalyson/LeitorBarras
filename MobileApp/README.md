# Leitor Mobile (Expo / React Native)

App Android para usar a câmera como leitor de código de barras/QR e enviar para o servidor desktop na mesma rede.

## Pré-requisitos
- Node 18+
- Expo CLI (ou `npx expo`)

## Instalação e execução
```bash
cd MobileApp
npm install
npm start   # ou npx expo start
```
Abra o app no Expo Go ou gere um APK (veja abaixo).

## Gerar APK local (Gradle)
```bash
cd MobileApp
npm install
npx expo prebuild
cd android
gradlew.bat assembleDebug   # Windows
# ou ./gradlew assembleDebug no Linux/macOS
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Gerar APK com EAS (mais simples, sem JDK local)
```bash
cd MobileApp
npm install
npm install -g eas-cli
eas login
eas build -p android --profile preview
```
O link do APK aparece ao fim do build.

## Uso
1. No desktop, rode o servidor e anote IP/porta/token.
2. No app, preencha IP, porta e token.
3. Aponte a câmera para o código; o app envia `POST /api/submit` com `{ code, token }`.
