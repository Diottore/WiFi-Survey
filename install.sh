#!/data/data/com.termux/files/usr/bin/bash
# install.sh - instalar dependencias mínimas en Termux
set -e

echo "[*] Actualizando paquetes..."
pkg update -y && pkg upgrade -y

echo "[*] Instalando paquetes necesarios..."
pkg install -y iperf3 jq coreutils termux-api python nano

echo "[*] Instalando paquetes Python (Flask si quieres GUI)..."
pip install --upgrade pip
pip install flask flask_cors

echo "[*] Permite acceso a almacenamiento (se abrirá prompt Android)"
termux-setup-storage || true

echo "[*] Hecho. Coloca el script mobile_wifi_survey.sh en ~/wifi-survey y ajústalo (SERVER_IP)."