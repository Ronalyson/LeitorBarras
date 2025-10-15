import threading
import socket
import base64
from flask import Flask, jsonify, render_template_string
import pyqrcode
import numpy as np
import cv2  # Aqui está a importação correta do OpenCV

# Cria o aplicativo Flask
app = Flask(__name__)

# Função para obter o IP da máquina
def get_local_ip():
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    return ip_address

# ===== Página do scanner (sem precisar de arquivo físico) =====
SCANNER_HTML = """
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Leitor de Código de Barras</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .hint { color:#555; font-size:14px; margin-bottom:12px; }
    video { width: 100%; max-width: 480px; background:#000; border-radius: 8px; }
    .last { margin-top: 12px; font-size: 14px; }
    .ok { color: #0a7f20; }
    .err { color: #b00020; }
    .small { font-size: 12px; color:#666; }
    .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    select { padding:6px 8px; font-size:14px; }
    button { padding:8px 12px; font-size:14px; border:0; border-radius:6px; background:#111; color:#fff; cursor:pointer; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .box { margin:12px 0; }
  </style>
</head>
<body>
  <h1>Leitor de Código de Barras (câmera do celular)</h1>
  <div class="hint">Dê permissão para usar a câmera. Se possível, escolha a câmera traseira.</div>

  <div class="row box">
    <select id="deviceSelect"></select>
    <button id="startBtn">Iniciar</button>
    <button id="stopBtn" disabled>Parar</button>
  </div>

  <video id="video" playsinline></video>

  <div class="last">
    <div>Último código: <b id="lastCode">—</b></div>
    <div id="status" class="small">Aguardando…</div>
  </div>

<script>
(async function(){
  const codeReader = new ZXing.BrowserMultiFormatReader();
  const video = document.getElementById('video');
  const deviceSelect = document.getElementById('deviceSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const lastCodeEl = document.getElementById('lastCode');
  const statusEl = document.getElementById('status');

  let currentDeviceId = null;
  let running = false;

  function setStatus(msg, ok=false, err=false){
    statusEl.textContent = msg;
    statusEl.className = 'small ' + (ok ? 'ok' : err ? 'err' : '');
  }

  async function listCameras(){
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    deviceSelect.innerHTML = '';
    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Câmera ${i+1}`;
      deviceSelect.appendChild(opt);
    });
    // Preferir câmera traseira se houver
    const back = [...deviceSelect.options].find(o => /back|traseira|rear/i.test(o.textContent));
    if (back) deviceSelect.value = back.value;
    currentDeviceId = deviceSelect.value;
  }

  deviceSelect.addEventListener('change', () => {
    currentDeviceId = deviceSelect.value;
    if (running) {
      stopScan();
      startScan();
    }
  });

  // Função para pedir permissão e iniciar a câmera
  async function startScan(){
    if (!currentDeviceId) await listCameras();
    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Iniciando câmera...');
    try {
      // Solicitar permissão e iniciar o fluxo da câmera
      await navigator.mediaDevices.getUserMedia({ video: { deviceId: currentDeviceId } })
        .then(function(stream) {
          video.srcObject = stream;
          setStatus('Lendo… aponte a câmera para o código.');
        })
        .catch(function(err) {
          setStatus('Erro ao acessar a câmera: ' + err, false, true);
        });

      codeReader.decodeFromVideoDevice(currentDeviceId, video, (result, err) => {
        if (result) {
          const code = result.getText();
          lastCodeEl.textContent = code;
          setStatus('Código lido e enviado.', true, false);
          // Debounce simples: não spammar servidor se ficar lendo o mesmo quadro várias vezes
          if (!video.dataset._last || video.dataset._last !== code) {
            video.dataset._last = code;
            fetch('/api/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code })
            }).catch(()=>{ /* ignore network errors silently */ });
          }
        } else if (err && !(err instanceof ZXing.NotFoundException)) {
          setStatus('Erro de leitura: ' + err, false, true);
        }
      });

    } catch(e) {
      setStatus('Falha ao iniciar câmera: ' + e, false, true);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      running = false;
    }
  }

  function stopScan(){
    codeReader.reset();
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus('Parado.');
  }

  startBtn.addEventListener('click', startScan);
  stopBtn.addEventListener('click', stopScan);

  // Pré-carrega a lista de câmeras
  await listCameras();
})();
</script>
</body>
</html>
"""

# ===== Rotas =====
@app.get("/scanner")
def scanner():
    return render_template_string(SCANNER_HTML)

@app.post("/api/submit")
def api_submit():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify(ok=False, error="missing code"), 400
    # Aqui você processa a leitura (ex.: inserir no sistema, gravar em arquivo, etc.)
    print(f"[LEITURA CELULAR] {code}")
    return jsonify(ok=True)

@app.get("/api/ping")
def api_ping():
    return jsonify(ok=True)

# ===== QR na tela (não bloqueante) =====
def show_qr_window(url: str):
    qr_b64 = pyqrcode.create(url).png_as_base64_str(scale=6)
    img_data = np.frombuffer(base64.b64decode(qr_b64), np.uint8)
    img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
    cv2.imshow("Aponte o celular para este QR (abre o leitor)", img)

# ===== Thread do Flask =====
def run_server():
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)

def main():
    ip = get_local_ip()
    url = f"http://{ip}:5000/scanner"
    print(f"Servidor em: {url}")

    # Sobe o servidor primeiro
    t = threading.Thread(target=run_server, daemon=True)
    t.start()

    # Mostra o QR em uma janela e mantém a UI responsiva
    show_qr_window(url)

    # Loop de UI do OpenCV (mantém a janela do QR aberta)
    print("Pressione 'q' para fechar o QR.")
    while True:
        # Mantém a janela do QR responsiva
        if cv2.waitKey(50) & 0xFF == ord('q'):
            break
        # Opcional: poderia mostrar algum status, watchdog, etc.
        # time.sleep(0.05)

    cv2.destroyAllWindows()
    print("Encerrado.")

if __name__ == "__main__":
    main()
