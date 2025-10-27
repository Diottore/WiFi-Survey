#!/data/data/com.termux/files/usr/bin/bash
# install.sh - instalar dependencias mínimas en Termux
set -e

echo "╔════════════════════════════════════════════╗"
echo "║   WiFi Survey - Instalación de Termux     ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Verificar que estamos en Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "⚠️  Advertencia: No se detectó Termux. Este script está diseñado para Termux."
    read -p "¿Deseas continuar de todos modos? (s/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
        exit 1
    fi
fi

echo "[1/6] Actualizando paquetes..."
pkg update -y && pkg upgrade -y

echo ""
echo "[2/6] Instalando paquetes del sistema necesarios..."
pkg install -y iperf3 jq coreutils termux-api python nano git

echo ""
echo "[3/6] Actualizando pip..."
pip install --upgrade pip

echo ""
echo "[4/6] Instalando dependencias de Python desde requirements.txt..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    echo "⚠️  Advertencia: requirements.txt no encontrado, instalando manualmente..."
    pip install flask flask-cors paramiko
fi

echo ""
echo "[5/6] Configurando acceso a almacenamiento..."
echo "Se abrirá un diálogo de Android. Por favor, acepta el permiso."
termux-setup-storage || echo "⚠️  No se pudo configurar almacenamiento. Configúralo manualmente más tarde."

echo ""
echo "[6/6] Creando configuración local..."
if [ ! -f "config.local.ini" ]; then
    if [ -f "config.ini" ]; then
        cp config.ini config.local.ini
        echo "✓ Archivo config.local.ini creado desde config.ini"
        echo "  Por favor, edita config.local.ini y ajusta la IP del servidor (SERVER_IP)"
    else
        echo "⚠️  config.ini no encontrado. Créalo manualmente."
    fi
else
    echo "✓ config.local.ini ya existe"
fi

echo ""
echo "════════════════════════════════════════════"
echo "✓ Instalación completada exitosamente!"
echo "════════════════════════════════════════════"
echo ""
echo "Próximos pasos:"
echo "1. Edita config.local.ini con la IP de tu servidor iperf3"
echo "2. En tu PC/servidor, ejecuta: iperf3 -s"
echo "3. En Termux, ejecuta: python3 app.py"
echo "4. Abre tu navegador en: http://127.0.0.1:5000"
echo ""
echo "Permisos necesarios en Android:"
echo "  • Ubicación (para WiFi info)"
echo "  • Almacenamiento (ya configurado)"
echo "  • Desactiva optimización de batería para Termux"
echo ""
echo "Para más información, consulta el README.md"
echo ""