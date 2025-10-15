import cv2
import time
import threading
from flask import Flask, jsonify, request
from pyzbar.pyzbar import decode
import pyqrcode

# Cria o aplicativo Flask
app = Flask(__name__)

# Variável para armazenar o código de barras lido
last_scanned_code = None

# Função para gerar o QR Code
def generate_qr():
    url = "http://localhost:5000/scanner"
    qr = pyqrcode.create(url)
    qr.png("qr_code.png", scale=6)

# Função para ler o QR Code e os códigos de barras usando a webcam
def read_barcode():
    global last_scanned_code
    cap = cv2.VideoCapture(0)  # Usar a câmera padrão
    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        # Detectar QR Codes e códigos de barras
        for barcode in decode(frame):
            barcode_data = barcode.data.decode("utf-8")
            barcode_type = barcode.type

            # Verifica se o código de barras foi lido
            if barcode_data != last_scanned_code:
                print(f"Code: {barcode_data} - Type: {barcode_type}")
                last_scanned_code = barcode_data  # Atualiza o último código lido

        # Exibe a imagem
        cv2.imshow("Barcode/QR Code Scanner", frame)

        # Sair ao pressionar 'q'
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

# Rota para o scanner no Flask
@app.route('/scanner', methods=['GET'])
def scanner():
    return jsonify({
        "message": "Escaneie um código de barras com o celular"
    })

# Função para iniciar o servidor Flask e o scanner
def start_server():
    app.run(debug=True, use_reloader=False)

# Função principal
def main():
    # Gerar o QR Code para o celular escanear
    generate_qr()
    print("QR Code gerado! Abra a imagem 'qr_code.png' e escaneie com o celular.")

    # Iniciar o servidor Flask em uma thread
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()

    # Iniciar o scanner de códigos de barras
    read_barcode()

if __name__ == '__main__':
    main()
