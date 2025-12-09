"""
Desktop companion app: servidor Flask + UI Tkinter para parear com o celular,
gerar QR e receber leituras de codigos em rede local.
"""
import base64
import csv
import json
import secrets
import socket
import threading
from datetime import datetime
from pathlib import Path
from queue import Queue, Empty
from typing import Callable, Optional, Tuple

import tkinter as tk
from tkinter import ttk, messagebox

import pyqrcode
from flask import Flask, abort, jsonify, render_template_string, request
from werkzeug.serving import make_server

APP_NAME = "Leitor LAN"
CONFIG_PATH = Path("config.json")
LOG_DIR = Path("data")
LOG_PATH = LOG_DIR / "leituras.csv"
DEFAULT_PORT = 5000


def get_local_ip() -> str:
    hostname = socket.gethostname()
    return socket.gethostbyname(hostname)


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def ensure_log_file() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_PATH.exists():
        LOG_PATH.write_text("timestamp,code,source\n", encoding="utf-8")


def log_code(code: str, source: str = "mobile") -> None:
    ensure_log_file()
    with LOG_PATH.open("a", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow([datetime.utcnow().isoformat(), code, source])


def make_flask_app(
    token: str,
    on_new_code: Callable[[str], None],
) -> Flask:
    app = Flask(__name__)

    SCANNER_HTML = """
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Leitor de Codigo de Barras</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 16px;
          background: linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #111827 100%);
          color: #e2e8f0;
          min-height: 100vh;
        }
        .card {
          max-width: 720px;
          margin: 0 auto;
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(226, 232, 240, 0.08);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        }
        h1 { margin: 0 0 8px; font-size: 22px; }
        .sub { color: #cbd5e1; margin-bottom: 16px; line-height: 1.6; }
        .video-container {
          border-radius: 12px;
          overflow: hidden;
          background: #0b1222;
          border: 1px solid rgba(226,232,240,0.1);
        }
        video { width: 100%; display: block; aspect-ratio: 4/3; }
        .controls { display: flex; gap: 10px; margin: 14px 0; flex-wrap: wrap; }
        select, button {
          padding: 10px 12px;
          font-size: 14px;
          border-radius: 10px;
          border: 1px solid rgba(226,232,240,0.25);
          background: #0f172a;
          color: #e2e8f0;
        }
        button {
          cursor: pointer;
          border: none;
          background: linear-gradient(120deg, #38bdf8, #6366f1);
          color: #0b1222;
          font-weight: 700;
          transition: transform .1s ease, filter .2s ease;
        }
        button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
        button:disabled { opacity: .5; cursor: not-allowed; }
        .danger { background: #f87171; color: #111827; }
        .result {
          margin-top: 14px;
          padding: 14px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34,197,94,0.35);
          border-radius: 12px;
          color: #bbf7d0;
          font-weight: 700;
          word-break: break-word;
        }
        #status {
          margin-top: 10px;
          padding: 12px;
          border-radius: 10px;
          background: rgba(148,163,184,0.12);
          color: #e2e8f0;
        }
        .err { background: rgba(248,113,113,0.12) !important; color: #fecdd3 !important; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Leitor LAN</h1>
        <div class="sub">Aponte a camera do celular para o codigo. Cada leitura sera enviada para o computador via Wi-Fi.</div>
        <div class="controls">
          <select id="deviceSelect"><option>Selecione uma camera</option></select>
          <button id="startBtn">Iniciar camera</button>
          <button id="stopBtn" class="danger" disabled>Parar</button>
        </div>
        <div class="video-container"><video id="video" playsinline autoplay></video></div>
        <div class="result" id="lastCode">Nenhuma leitura ainda</div>
        <div id="status">Clique em "Iniciar camera" para comecar</div>
      </div>
      <script src="https://unpkg.com/@zxing/library@latest"></script>
      <script>
      (function(){
        let codeReader = null;
        const token = "{{ token }}";
        const video = document.getElementById('video');
        const deviceSelect = document.getElementById('deviceSelect');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const lastCodeEl = document.getElementById('lastCode');
        const statusEl = document.getElementById('status');
        let currentDeviceId = null;
        let running = false;
        let lastScannedCode = '';

        function setStatus(msg, isErr=false){
          statusEl.textContent = msg;
          statusEl.className = isErr ? 'err' : '';
        }

        async function listCameras(){
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            stream.getTracks().forEach(t => t.stop());
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            deviceSelect.innerHTML = '';
            if (!videoDevices.length) {
              const opt = document.createElement('option');
              opt.textContent = 'Nenhuma camera encontrada';
              deviceSelect.appendChild(opt);
              return false;
            }
            videoDevices.forEach((d, i) => {
              const opt = document.createElement('option');
              opt.value = d.deviceId;
              opt.textContent = d.label || 'Camera ' + (i+1);
              deviceSelect.appendChild(opt);
            });
            const back = [...deviceSelect.options].find(o => /back|traseira|rear|environment/i.test(o.textContent));
            deviceSelect.value = back ? back.value : videoDevices[videoDevices.length-1].deviceId;
            currentDeviceId = deviceSelect.value;
            return true;
          } catch(e) {
            setStatus('Erro ao acessar camera: ' + e.message, true);
            return false;
          }
        }

        deviceSelect.addEventListener('change', () => {
          currentDeviceId = deviceSelect.value;
          if (running) { stopScan(); setTimeout(startScan, 250); }
        });

        async function startScan(){
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('Navegador nao suporta camera', true);
            return;
          }
          if (!currentDeviceId) {
            const ok = await listCameras();
            if (!ok) return;
          }
          if (!codeReader) codeReader = new ZXing.BrowserMultiFormatReader();
          running = true;
          startBtn.disabled = true;
          stopBtn.disabled = false;
          setStatus('Iniciando camera...');
          const constraints = {
            video: {
              deviceId: currentDeviceId ? { exact: currentDeviceId } : undefined,
              facingMode: !currentDeviceId ? 'environment' : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          await codeReader.decodeFromConstraints(constraints, video, (result, err) => {
            if (result) {
              const code = result.getText();
              if (code && code !== lastScannedCode) {
                lastScannedCode = code;
                lastCodeEl.textContent = code;
                setStatus('Codigo lido!');
                fetch('/api/submit?token=' + encodeURIComponent(token), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code })
                }).then(res => res.json()).then(data => {
                  if (!data.ok) setStatus('Erro ao enviar codigo: ' + (data.error || 'falha'), true);
                }).catch(() => setStatus('Erro de conexao', true));
                setTimeout(() => { lastScannedCode = ''; }, 800);
              }
            }
          });
          setStatus('Aponte para o codigo...');
        }

        function stopScan(){
          try { if (codeReader) codeReader.reset(); } catch(e){}
          const stream = video.srcObject;
          if (stream) { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; }
          running = false;
          startBtn.disabled = false;
          stopBtn.disabled = true;
          lastScannedCode = '';
          setStatus('Camera parada');
        }

        startBtn.addEventListener('click', startScan);
        stopBtn.addEventListener('click', stopScan);
        listCameras();
      })();
      </script>
    </body>
    </html>
    """

    @app.get("/scanner")
    def scanner():
        return render_template_string(SCANNER_HTML, token=token)

    @app.get("/api/ping")
    def api_ping():
        return jsonify(ok=True)

    @app.post("/api/submit")
    def api_submit():
        provided = request.args.get("token") or request.headers.get("X-Token")
        if not provided or provided != token:
            abort(401)
        data = request.get_json(silent=True) or {}
        code = (data.get("code") or "").strip()
        if not code:
            return jsonify(ok=False, error="missing code"), 400
        log_code(code)
        on_new_code(code)
        return jsonify(ok=True)

    @app.get("/api/last")
    def api_last():
        return jsonify(ok=True, last=None)

    return app


class ServerThread(threading.Thread):
    def __init__(self, host: str, port: int, token: str, on_new_code: Callable[[str], None]):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.token = token
        self.on_new_code = on_new_code
        self.httpd = None

    def run(self) -> None:
        app = make_flask_app(self.token, self.on_new_code)
        self.httpd = make_server(self.host, self.port, app)
        self.httpd.serve_forever()

    def stop(self) -> None:
        if self.httpd:
            self.httpd.shutdown()


def generate_token() -> str:
    return secrets.token_urlsafe(8)


class DesktopApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_NAME)
        self.root.geometry("720x520")
        self.root.configure(bg="#0b1222")

        self.events: Queue[Tuple[str, str]] = Queue()
        self.server_thread: Optional[ServerThread] = None
        cfg = load_config()
        self.token = cfg.get("token") or generate_token()
        self.port = cfg.get("port") or DEFAULT_PORT
        self.last_code = tk.StringVar(value="Nenhuma leitura ainda")
        self.status = tk.StringVar(value="Servidor parado")
        self.url = ""
        self.qr_image = None

        self.build_ui()
        self.refresh_url_and_qr()
        self.root.after(250, self.process_events)

    def build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=16)
        container.pack(fill="both", expand=True)

        self.root.style = ttk.Style()
        self.root.style.theme_use("clam")
        self.root.style.configure("TFrame", background="#0b1222")
        self.root.style.configure("TLabel", background="#0b1222", foreground="#e2e8f0")
        self.root.style.configure("TLabelFrame", background="#0b1222", foreground="#e2e8f0")
        self.root.style.configure("TButton", font=("Segoe UI", 10, "bold"))
        self.root.style.map("TButton", foreground=[("disabled", "#777")])

        title = ttk.Label(container, text="Leitor LAN - Desktop", font=("Segoe UI", 16, "bold"))
        title.pack(anchor="w", pady=(0, 8))

        desc = ttk.Label(
            container,
            text="1) Clique em Iniciar servidor\n2) Escaneie o QR no celular (mesma rede Wi-Fi)\n3) As leituras aparecem abaixo e no log CSV.",
            font=("Segoe UI", 10),
        )
        desc.pack(anchor="w", pady=(0, 12))

        form = ttk.Frame(container)
        form.pack(fill="x", pady=4)

        ttk.Label(form, text="Porta:").grid(row=0, column=0, sticky="w")
        self.port_entry = ttk.Entry(form, width=10)
        self.port_entry.insert(0, str(self.port))
        self.port_entry.grid(row=0, column=1, sticky="w", padx=(4, 16))

        ttk.Label(form, text="Token de pareamento:").grid(row=0, column=2, sticky="w")
        self.token_entry = ttk.Entry(form, width=18)
        self.token_entry.insert(0, self.token)
        self.token_entry.grid(row=0, column=3, sticky="w", padx=(4, 4))
        ttk.Button(form, text="Gerar novo", command=self.on_regen_token).grid(row=0, column=4, padx=(4, 0))

        buttons = ttk.Frame(container)
        buttons.pack(fill="x", pady=12)
        self.start_btn = ttk.Button(buttons, text="Iniciar servidor", command=self.start_server)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(buttons, text="Parar", command=self.stop_server, state="disabled")
        self.stop_btn.pack(side="left", padx=8)

        status_box = ttk.Label(container, textvariable=self.status, font=("Segoe UI", 10, "bold"))
        status_box.pack(anchor="w", pady=(0, 10))

        qr_frame = ttk.Frame(container)
        qr_frame.pack(fill="x")
        ttk.Label(qr_frame, text="Escaneie o QR no celular:").pack(anchor="w")
        self.qr_label = ttk.Label(qr_frame)
        self.qr_label.pack(anchor="w", pady=(4, 8))
        ttk.Label(qr_frame, text="URL direta:").pack(anchor="w")
        self.url_label = ttk.Label(qr_frame, font=("Consolas", 10))
        self.url_label.pack(anchor="w", pady=(0, 10))

        last_box = ttk.LabelFrame(container, text="Ultimo codigo", padding=10)
        last_box.pack(fill="x", pady=8)
        ttk.Label(last_box, textvariable=self.last_code, font=("Consolas", 11)).pack(anchor="w")

        log_hint = ttk.Label(
            container,
            text=f"As leituras sao salvas em {LOG_PATH}",
            font=("Segoe UI", 9),
        )
        log_hint.pack(anchor="w", pady=(4, 0))

    def refresh_url_and_qr(self) -> None:
        try:
            self.port = int(self.port_entry.get())
        except ValueError:
            self.port = DEFAULT_PORT
            self.port_entry.delete(0, tk.END)
            self.port_entry.insert(0, str(DEFAULT_PORT))

        self.token = self.token_entry.get().strip() or generate_token()
        self.token_entry.delete(0, tk.END)
        self.token_entry.insert(0, self.token)

        host_ip = get_local_ip()
        self.url = f"http://{host_ip}:{self.port}/scanner?token={self.token}"
        qr_b64 = pyqrcode.create(self.url).png_as_base64_str(scale=6)
        self.qr_image = tk.PhotoImage(data=base64.b64decode(qr_b64))
        self.qr_label.configure(image=self.qr_image)
        self.url_label.configure(text=self.url)
        save_config({"port": self.port, "token": self.token})

    def on_regen_token(self) -> None:
        self.token = generate_token()
        self.token_entry.delete(0, tk.END)
        self.token_entry.insert(0, self.token)
        self.refresh_url_and_qr()

    def start_server(self) -> None:
        if self.server_thread:
            messagebox.showinfo(APP_NAME, "Servidor ja esta em execucao.")
            return
        self.refresh_url_and_qr()
        self.server_thread = ServerThread("0.0.0.0", self.port, self.token, self.enqueue_code)
        self.server_thread.start()
        self.status.set(f"Servidor em http://0.0.0.0:{self.port} - aguardando leituras")
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")

    def stop_server(self) -> None:
        if self.server_thread:
            self.server_thread.stop()
            self.server_thread = None
            self.status.set("Servidor parado")
            self.start_btn.configure(state="normal")
            self.stop_btn.configure(state="disabled")

    def enqueue_code(self, code: str) -> None:
        self.events.put(("code", code))

    def process_events(self) -> None:
        try:
            while True:
                evt, payload = self.events.get_nowait()
                if evt == "code":
                    self.last_code.set(payload)
                    self.status.set(f"Ultima leitura: {payload}")
        except Empty:
            pass
        self.root.after(200, self.process_events)

    def run(self) -> None:
        try:
            self.root.mainloop()
        finally:
            self.stop_server()


def main():
    ensure_log_file()
    app = DesktopApp()
    app.run()


if __name__ == "__main__":
    main()
