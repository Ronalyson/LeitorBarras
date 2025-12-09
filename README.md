# Leitor LAN (Desktop)

Aplicativo desktop com interface para parear um celular na mesma rede Wi-Fi e receber leituras de código de barras/QR em tempo real.

## Como usar (modo dev)
1. Instale as dependências: `pip install -r requirements.txt`.
2. Execute: `python app.py`.
3. Na janela, clique em **Iniciar servidor**.
4. Escaneie o QR com o celular (mesma rede). A página `/scanner` abre a câmera e envia as leituras para o PC.
5. As leituras aparecem na interface e são gravadas em `data/leituras.csv`.

## Segurança
- Usa token de pareamento obrigatório (aparece na UI e vai na URL/QR). O endpoint `/api/submit` valida `?token=` ou header `X-Token`.
- Rede local: certifique-se de que o firewall libera a porta configurada (padrão 5000) para conexões na LAN.

## Empacotar executável (Windows)
1. `pip install -r requirements.txt pyinstaller`
2. `build_win.cmd`
3. O executável ficará em `dist\LeitorLAN.exe`.

## Gerar instalador (sugestão)
- Use Inno Setup (GUI) apontando `dist\LeitorLAN.exe` como app principal.
- Atalhos recomendados: Desktop e Iniciar.
- Opcional: criar entrada de inicialização automática (pasta Startup) se quiser iniciar junto com o Windows.

## Endpoints úteis
- `GET /scanner?token=...` - página web de leitura no celular.
- `POST /api/submit?token=...` - recebe `{ "code": "<valor>" }`.
- `GET /api/ping` - verifica se o servidor está no ar.

