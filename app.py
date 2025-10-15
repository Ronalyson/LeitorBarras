import threading
import socket
import base64
from flask import Flask, jsonify, render_template_string, request
import pyqrcode
import numpy as np
import cv2

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
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      background: #f5f5f5;
      min-height: 100vh;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 12px; color: #1a1a1a; }
    .hint { color:#666; font-size:14px; margin-bottom:16px; line-height:1.5; }
    .video-container {
      position: relative;
      background:#000;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    video {
      width: 100%;
      display: block;
      aspect-ratio: 4/3;
    }
    .controls {
      display:flex;
      gap:8px;
      margin:16px 0;
      flex-wrap:wrap;
    }
    select {
      flex: 1;
      min-width: 150px;
      padding:10px 12px;
      font-size:14px;
      border: 1px solid #ddd;
      border-radius:8px;
      background: white;
    }
    button {
      padding:10px 20px;
      font-size:14px;
      border:0;
      border-radius:8px;
      background:#1a73e8;
      color:#fff;
      cursor:pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    button:hover:not(:disabled) { background:#1557b0; }
    button:disabled { opacity:.5; cursor:not-allowed; background:#999; }
    button.stop { background:#d93025; }
    button.stop:hover:not(:disabled) { background:#b71c1c; }
    .result-box {
      background: white;
      padding: 16px;
      border-radius: 12px;
      margin-top: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .result-label { font-size: 12px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .result-value { font-size: 18px; font-weight: 600; color: #1a1a1a; word-break: break-all; }
    #status {
      font-size: 14px;
      color:#666;
      margin-top: 8px;
      padding: 8px;
      border-radius: 6px;
      background: #f5f5f5;
    }
    .ok { color: #0d652d; background: #e6f4ea !important; }
    .err { color: #c5221f; background: #fce8e6 !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 Leitor de Código de Barras</h1>
    <div class="hint">Aponte a câmera traseira do celular para o código de barras. A leitura é automática.</div>

    <div class="controls">
      <select id="deviceSelect"></select>
      <button id="startBtn">Iniciar Câmera</button>
      <button id="stopBtn" class="stop" disabled>Parar</button>
    </div>

    <div class="video-container">
      <video id="video" playsinline autoplay></video>
    </div>

    <div class="result-box">
      <div class="result-label">Último código lido</div>
      <div class="result-value" id="lastCode">—</div>
      <div id="status">Aguardando início...</div>
    </div>
  </div>

<script src="https://unpkg.com/@zxing/library@latest"></script>
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
  let lastScannedCode = '';

  function setStatus(msg, ok=false, err=false){
    statusEl.textContent = msg;
    statusEl.className = (ok ? 'ok' : err ? 'err' : '');
  }

  async function listCameras(){
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      deviceSelect.innerHTML = '';
      if (videoDevices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'Nenhuma câmera encontrada';
        deviceSelect.appendChild(opt);
        return;
      }
      videoDevices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Câmera ${i+1}`;
        deviceSelect.appendChild(opt);
      });
      const back = [...deviceSelect.options].find(o => /back|traseira|rear|environment/i.test(o.textContent));
      if (back) deviceSelect.value = back.value;
      currentDeviceId = deviceSelect.value || videoDevices[0].deviceId;
    } catch(e) {
      setStatus('Erro ao listar câmeras: ' + e.message, false, true);
    }
  }

  deviceSelect.addEventListener('change', () => {
    currentDeviceId = deviceSelect.value;
    if (running) {
      stopScan();
      setTimeout(startScan, 300);
    }
  });

  async function startScan(){
    try {
      if (!currentDeviceId) await listCameras();
      if (!currentDeviceId) {
        setStatus('Nenhuma câmera disponível', false, true);
        return;
      }

      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      setStatus('Iniciando câmera...');

      const constraints = {
        video: {
          deviceId: currentDeviceId ? { exact: currentDeviceId } : undefined,
          facingMode: currentDeviceId ? undefined : { ideal: 'environment' }
        }
      };

      codeReader.decodeFromConstraints(constraints, video, (result, err) => {
        if (result) {
          const code = result.getText();
          if (code && code !== lastScannedCode) {
            lastScannedCode = code;
            lastCodeEl.textContent = code;
            setStatus('✓ Código lido com sucesso!', true, false);

            fetch('/api/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code })
            })
            .then(res => res.json())
            .then(data => {
              if (!data.ok) {
                setStatus('Erro ao enviar código', false, true);
              }
            })
            .catch(() => {
              setStatus('Erro de conexão com servidor', false, true);
            });
          }
        }
      });

      setStatus('📷 Aponte para o código de barras...');

    } catch(e) {
      setStatus('Erro ao iniciar: ' + e.message, false, true);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      running = false;
    }
  }

  function stopScan(){
    try {
      codeReader.reset();
      const stream = video.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
    } catch(e) {
      console.error('Erro ao parar:', e);
    }
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    lastScannedCode = '';
    setStatus('Câmera parada');
  }

  startBtn.addEventListener('click', startScan);
  stopBtn.addEventListener('click', stopScan);

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
