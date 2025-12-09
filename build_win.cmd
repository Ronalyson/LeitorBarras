@echo off
setlocal
REM Empacota o app em um executavel unico Windows usando PyInstaller.
REM Requisitos: python, pip install -r requirements.txt, e pyinstaller instalado.
REM Dica: python -m pip install --upgrade pip && pip install -r requirements.txt pyinstaller

pyinstaller ^
  --noconsole ^
  --onefile ^
  --name LeitorLAN ^
  --add-data "cert.pem;." ^
  --add-data "key.pem;." ^
  app.py

echo.
echo Build pronto em dist\LeitorLAN.exe
endlocal
