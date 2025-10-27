# Guía de Inicio Rápido - WiFi Survey

Esta guía te ayudará a configurar y ejecutar WiFi Survey en menos de 10 minutos.

## 📱 Para Usuarios de Termux (Android)

### Paso 1: Instalación (3 minutos)

```bash
# En Termux
pkg update && pkg upgrade -y
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey
bash install.sh
```

Durante la instalación:
- Acepta el permiso de almacenamiento cuando se solicite
- Espera a que se instalen todos los paquetes

### Paso 2: Configuración (2 minutos)

1. **En tu PC/servidor**, encuentra tu IP local:
   - Windows: `ipconfig` (busca "Dirección IPv4")
   - Linux/Mac: `ip addr` o `ifconfig`

2. **En tu PC/servidor**, inicia el servidor iperf3:
   ```bash
   iperf3 -s
   ```
   Deja esta terminal abierta.

3. **En Termux**, edita la configuración:
   ```bash
   nano config.local.ini
   ```
   
   Cambia esta línea (reemplaza con la IP de tu servidor):
   ```ini
   ip = 192.168.1.10
   ```
   
   Guarda: `Ctrl+X`, luego `Y`, luego `Enter`

### Paso 3: Ejecutar (1 minuto)

```bash
python3 app.py
```

### Paso 4: Usar la Aplicación

1. Abre el navegador en tu teléfono
2. Ve a: `http://127.0.0.1:5000`
3. ¡Comienza a medir!

## 💻 Para Usuarios de Docker (Servidor)

### Opción 1: Docker Compose (Recomendado)

```bash
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey
cp config.ini config.local.ini
# Edita config.local.ini si es necesario
docker-compose up -d
```

La aplicación estará en `http://localhost:5000`

### Opción 2: Docker Simple

```bash
# Servidor iperf3
docker run -d -p 5201:5201 --name iperf3-server networkstatic/iperf3 -s

# Aplicación WiFi Survey
docker build -t wifi-survey .
docker run -d -p 5000:5000 --name wifi-survey wifi-survey
```

## 🔧 Solución de Problemas Rápida

### Error: "No module named 'flask'"
```bash
pip install -r requirements.txt
```

### Error: "iperf3: command not found"
```bash
# En Termux
pkg install iperf3

# En Ubuntu/Debian
sudo apt install iperf3
```

### Error: "Connection refused" al ejecutar pruebas
1. Verifica que iperf3 esté corriendo en el servidor: `iperf3 -s`
2. Verifica que la IP en `config.local.ini` sea correcta
3. Verifica que el firewall permita el puerto 5201

### La interfaz web no carga
1. Verifica que la app esté corriendo: `python3 app.py`
2. Revisa que la URL sea correcta: `http://127.0.0.1:5000`
3. Verifica que el puerto 5000 esté libre

### Permisos de Android
Si no obtienes datos WiFi:
1. Ve a Ajustes → Apps → Termux → Permisos
2. Activa "Ubicación"
3. En Termux, ejecuta: `termux-setup-storage`

## 📊 Primera Medición

### Medición Rápida (1 punto)
1. En la pestaña "Quick Test"
2. Escribe un nombre de punto (ej: "Sala-A")
3. Click "Run Point"
4. ¡Espera los resultados!

### Encuesta Completa (múltiples puntos)
1. En la pestaña "Survey"
2. Lista de puntos: `A1 A2 A3 B1 B2 B3`
3. Repeticiones: `3`
4. Click "Start Survey"
5. La app medirá cada punto automáticamente

## 🎯 Consejos para Mejores Resultados

✅ **Haz**:
- Mantén el teléfono en la misma posición durante cada medición
- Usa 3-5 repeticiones por punto para datos confiables
- Toma notas sobre obstáculos o condiciones especiales
- Habilita "termux-wake-lock" para encuestas largas

❌ **No hagas**:
- No muevas el teléfono durante la medición
- No uses el teléfono para otras cosas durante la prueba
- No permitas que Termux se suspenda (desactiva optimización de batería)

## 📚 Siguiente Paso

Consulta la [documentación completa](README.md) para:
- Configuración avanzada
- Interpretación de resultados
- Exportación de datos
- Uso de scripts de consola

## 🆘 ¿Necesitas Ayuda?

- 📖 Lee el [README.md](README.md) completo
- 🐛 Reporta problemas en [GitHub Issues](https://github.com/Diottore/WiFi-Survey/issues)
- 💬 Revisa [CONTRIBUTING.md](CONTRIBUTING.md) para contribuir

¡Felices mediciones! 📡
