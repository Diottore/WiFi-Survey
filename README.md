# WiFi Survey - Interfaz mejorada (Termux)

![Python CI](https://github.com/Diottore/WiFi-Survey/workflows/Python%20CI/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python Version](https://img.shields.io/badge/python-3.9%2B-blue)

> Herramienta profesional para realizar mediciones y mapeo de cobertura WiFi desde dispositivos Android usando Termux, con una interfaz web moderna y potente.

**🚀 [Guía de Inicio Rápido](QUICKSTART.md)** | **📚 [Documentación Completa](#-documentación)** | **🤝 [Contribuir](CONTRIBUTING.md)**

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Contenido del Proyecto](#-contenido-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Funcionalidades de la UI](#-funcionalidades-de-la-ui)
- [Documentación](#-documentación)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

## ✨ Características

- 🌐 **Interfaz web moderna** con gráficos en tiempo real usando Apache ECharts
- 📱 **Compatible con Android** vía Termux (sin necesidad de root)
- 📊 **Mediciones completas**: RSSI, throughput (DL/UL), latencia, jitter, pérdida de paquetes
- 🗺️ **Mapeo de cobertura** con múltiples puntos de medición
- 📈 **Visualización en tiempo real** del progreso de las pruebas
- 💾 **Exportación de datos** en CSV y JSON
- 🔄 **Pruebas automatizadas** con soporte para múltiples repeticiones
- 🎯 **Modo manual** para control preciso de cada punto de medición

## 📦 Contenido del Proyecto

```
WiFi-Survey/
├── app.py                          # Servidor Flask con API REST
├── templates/index.html            # Interfaz web
├── static/
│   ├── style.css                   # Estilos
│   └── app.js                      # Lógica del cliente
├── mobile_wifi_survey.sh           # Script bash para uso por consola
├── iperf3_automation.py            # Automatización para múltiples agentes
├── install.sh                      # Script de instalación de dependencias
├── requirements.txt                # Dependencias de Python
├── config.ini                      # Configuración centralizada
└── raw_results/                    # Resultados en formato JSON
```

## 🔧 Requisitos Previos

### En el dispositivo Android (Termux)

1. **Termux** y **Termux:API** instalados desde [F-Droid](https://f-droid.org/)
2. **Python 3.9+**
3. **iperf3**, **jq**, **coreutils**, **termux-api**

### En el servidor/PC

1. **iperf3** instalado y ejecutándose como servidor
2. Conectividad de red con el dispositivo Android

## 📥 Instalación

### Método Rápido (Usando install.sh)

```bash
# En Termux
cd ~
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey
bash install.sh
```

### Instalación Manual

```bash
# 1. Actualizar paquetes de Termux
pkg update && pkg upgrade -y

# 2. Instalar dependencias del sistema
pkg install python iperf3 jq coreutils termux-api git -y

# 3. Clonar el repositorio
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey

# 4. Instalar dependencias de Python
pip install -r requirements.txt

# 5. Configurar permisos de almacenamiento
termux-setup-storage
```

### Permisos Necesarios en Android

- ✅ **Ubicación**: Necesario para `termux-wifi-connectioninfo` y `termux-location`
- ✅ **Almacenamiento**: Para guardar y descargar resultados CSV
- ✅ **Wake Lock**: Evita que Termux se suspenda durante las mediciones

## ⚙️ Configuración

### 1. Configuración del Servidor

Copia el archivo de configuración de ejemplo:

```bash
cp config.ini config.local.ini
```

Edita `config.local.ini` y ajusta los parámetros según tu entorno:

```ini
[server]
ip = 192.168.1.10          # IP del servidor iperf3
flask_host = 0.0.0.0       # 0.0.0.0 para acceso desde red, 127.0.0.1 solo local
flask_port = 5000

[iperf]
duration = 20              # Duración de tests en segundos
parallel = 4               # Número de streams paralelos
```

### 2. Iniciar el servidor iperf3

En tu PC/servidor:

```bash
iperf3 -s
```

## 🚀 Uso

### Interfaz Web

1. **Inicia la aplicación Flask** en Termux:

```bash
python3 app.py
```

2. **Abre el navegador** en tu dispositivo Android:

```
http://127.0.0.1:5000
```

O desde otro dispositivo en la misma red:

```
http://<IP-del-dispositivo>:5000
```

### Script de Consola

Para usar el script bash directamente:

```bash
bash mobile_wifi_survey.sh
```

El script te guiará a través del proceso de medición punto por punto.

### Usando Makefile (Opcional)

Si tienes `make` instalado, puedes usar comandos convenientes:

```bash
make help              # Muestra todos los comandos disponibles
make install           # Instala dependencias de producción
make install-dev       # Instala dependencias de desarrollo
make setup-config      # Crea config.local.ini desde config.ini
make test              # Ejecuta verificaciones de sintaxis
make lint              # Ejecuta linters
make run               # Inicia la aplicación
make clean             # Limpia archivos generados
```

## 🎨 Funcionalidades de la UI

### 🔹 Run Point
Ejecuta una medición puntual que incluye:
- RSSI (nivel de señal)
- Latencia (ping)
- Throughput de descarga y subida (iperf3)
- Visualización en tiempo real

### 🔹 Start Survey
Lanza una encuesta completa con:
- Múltiples puntos de medición
- Repeticiones configurables
- Modo manual o automático
- Progreso y logs en tiempo real

### 🔹 Resultados
- Visualización de todos los resultados con gráficos interactivos
- Exportación a CSV (wide y long format)
- Exportación a JSON
- Descarga de archivos raw individuales

## 📚 Documentación

- **[🚀 Guía de Inicio Rápido](QUICKSTART.md)** - Configura y ejecuta en menos de 10 minutos
- [Procedimiento de pruebas WiFi](wifi_test_procedure.md) - Guía completa para testing profesional
- [Procedimiento con un solo dispositivo](mobile_single_device_procedure.md) - Guía específica para mediciones móviles
- [Guía de contribución](CONTRIBUTING.md) - Cómo contribuir al proyecto
- [Código de Conducta](CODE_OF_CONDUCT.md) - Normas de la comunidad
- [Política de Seguridad](SECURITY.md) - Seguridad y reportes de vulnerabilidades
- [Registro de Cambios](CHANGELOG.md) - Historial de versiones y cambios

## 🔒 Notas de Seguridad

- **Acceso de red**: Si expones la aplicación en `0.0.0.0`, asegúrate de estar en una red segura
- **Configuración local**: El archivo `config.local.ini` está excluido de git para proteger tu configuración
- **Wake Lock**: Habilita `termux-wake-lock` para evitar interrupciones durante pruebas largas
- **Optimización de batería**: Desactiva la optimización de batería para Termux

## 💡 Consejos y Recomendaciones

- Para campañas largas, usa `IPERF_DURATION` más corto (15-20s)
- Reduce `REPEATS` al mínimo necesario para agilizar las mediciones
- Usa el modo manual para tener control total sobre cada punto
- Exporta los datos regularmente para evitar pérdidas

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor lee la [guía de contribución](CONTRIBUTING.md) para más detalles.

1. Fork el proyecto
2. Crea tu rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🙏 Agradecimientos

- [iperf3](https://iperf.fr/) - Herramienta de medición de rendimiento de red
- [Termux](https://termux.com/) - Emulador de terminal Android
- [Flask](https://flask.palletsprojects.com/) - Framework web de Python
- [Apache ECharts](https://echarts.apache.org/) - Biblioteca de gráficos

---

Desarrollado con ❤️ para la comunidad de testing WiFi