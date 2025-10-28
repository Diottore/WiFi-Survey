# WiFi-Tester

Sistema completo de medición y mapeo de cobertura WiFi con backend FastAPI y frontend SPA.

## 🌟 Características

- **Backend FastAPI** con API REST y WebSocket para comunicación en tiempo real
- **Persistencia SQLite** con SQLModel para almacenar trabajos, puntos y mediciones
- **Detección automática de RSSI** con múltiples estrategias (Termux, dumpsys, iw, iwconfig)
- **Mediciones completas**: throughput (DL/UL), latencia, jitter, pérdida de paquetes
- **Frontend SPA** con ECharts para gráficas y Leaflet para mapas
- **Control por punto** con funcionalidad de pausa/continuar
- **Exportación** de datos en formatos CSV y JSON
- **Modo simulado** para pruebas sin herramientas de red

## 📋 Requisitos

### En Termux (Android)

```bash
pkg install python iperf3 termux-api
```

### En Linux

```bash
sudo apt install python3 python3-pip iperf3 iw
```

## 🚀 Instalación

### Opción 1: Termux (Android)

```bash
cd ~/WiFi-Survey/backend
bash start.sh
```

El script `start.sh` creará automáticamente un entorno virtual, instalará las dependencias y lanzará el servidor.

### Opción 2: Linux Desktop

```bash
cd WiFi-Survey/backend

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Opción 3: Docker

```bash
cd WiFi-Survey/backend
docker build -t wifi-tester .
docker run -p 8000:8000 wifi-tester
```

## 📱 Uso

### 1. Iniciar el Servidor

El servidor estará disponible en:
- `http://127.0.0.1:8000` (local)
- `http://<IP-del-dispositivo>:8000` (red local)

### 2. Acceder a la Interfaz Web

Abrir en el navegador:
```
http://127.0.0.1:8000/app
```

### 3. Configurar una Prueba

1. **Host Destino**: IP del servidor iperf3 (ej: `192.168.1.1`)
2. **Modo iperf3**: TCP o UDP
3. **Duración**: Segundos por cada test de iperf3 (recomendado: 10s)
4. **Repeticiones**: Número de mediciones por punto (recomendado: 3)
5. **Puntos de Medición**: Agregar puntos con ID, latitud y longitud

### 4. Ejecutar la Prueba

1. Click en **"Iniciar Prueba"**
2. El sistema ejecutará las mediciones automáticamente
3. Al completar todas las repeticiones de un punto, se pausará
4. Click en **"Continuar al Siguiente Punto"** para proseguir
5. Las gráficas se actualizarán en tiempo real

### 5. Exportar Resultados

1. Copiar el **Job ID** mostrado
2. Seleccionar formato (CSV o JSON)
3. Click en **"Exportar"**

## 🔧 API REST

### Endpoints Disponibles

#### `POST /api/start_test`
Inicia una nueva prueba.

**Request:**
```json
{
  "target_host": "192.168.1.1",
  "points": [
    {"id": "P1", "lat": 40.7128, "lng": -74.0060},
    {"id": "P2", "lat": 40.7129, "lng": -74.0061}
  ],
  "repetitions": 3,
  "iperf_mode": "tcp",
  "iperf_duration": 10
}
```

**Response:**
```json
{
  "id": 1,
  "target_host": "192.168.1.1",
  "iperf_mode": "tcp",
  "iperf_duration": 10,
  "repetitions": 3,
  "status": "created",
  "created_at": "2025-10-28T12:00:00"
}
```

#### `POST /api/stop_test`
Detiene una prueba en ejecución.

**Request:**
```json
{
  "job_id": 1
}
```

#### `GET /api/status?job_id=1`
Obtiene el estado de una prueba.

#### `GET /api/export?job_id=1&format=csv`
Exporta los datos de una prueba (formatos: `csv`, `json`).

### WebSocket

**Endpoint:** `/ws?job_id=1`

**Eventos recibidos:**
- `measurement`: Nueva medición completada
- `point_done`: Punto completado y pausado
- `status`: Cambio de estado del trabajo

**Mensajes enviados:**
```json
{
  "type": "continue",
  "point_id": "P1"
}
```

## 📊 Detección de RSSI

El sistema intenta detectar el RSSI (nivel de señal) usando múltiples estrategias en orden:

1. **termux-wifi-connectioninfo** (Termux en Android)
2. **dumpsys wifi** (Android con adb o root)
3. **iw** (Linux moderno)
4. **iwconfig** (Linux legacy)

Si ninguna estrategia funciona, se mostrará `null` en el campo RSSI.

## 🧪 Tests

```bash
cd backend
source venv/bin/activate
pytest app/tests/ -v
```

Los tests utilizan mocks para los subprocesos (ping, iperf3) y una base de datos SQLite en memoria.

## 📝 Estructura del Proyecto

```
WiFi-Survey/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application
│   │   ├── db.py            # Database configuration
│   │   ├── models.py        # SQLModel models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── runner.py        # Test execution logic
│   │   ├── utils.py         # Utility functions
│   │   └── tests/           # Test suite
│   │       ├── __init__.py
│   │       ├── test_api.py
│   │       └── test_runner.py
│   ├── requirements.txt
│   ├── start.sh
│   ├── Dockerfile
│   └── db.sqlite           # SQLite database (auto-created)
├── frontend/
│   ├── index.html
│   └── static/
│       ├── app.js          # Frontend logic
│       └── styles.css      # Styles
├── README.md
└── ARCHITECTURE.md
```

## 🔒 Modo Simulado

Si `ping` o `iperf3` no están disponibles, el sistema automáticamente entra en **modo simulado**, generando datos aleatorios realistas para permitir pruebas del frontend y la lógica de la aplicación.

## 🐛 Solución de Problemas

### Error: "ping not available"
Instalar herramientas de red:
```bash
# Termux
pkg install iputils

# Linux
sudo apt install iputils-ping
```

### Error: "iperf3 not available"
Instalar iperf3:
```bash
# Termux
pkg install iperf3

# Linux
sudo apt install iperf3
```

### No se detecta RSSI
- En Termux: Verificar que `termux-api` esté instalado y los permisos de ubicación estén otorgados
- En Linux: Verificar que `iw` o `iwconfig` estén instalados

### WebSocket no conecta
Verificar que el puerto 8000 esté accesible y no bloqueado por firewall.

## 🤝 Comandos Útiles

### Iniciar servidor iperf3 (en el host destino)
```bash
iperf3 -s
```

### Verificar conexión
```bash
ping <IP-del-servidor>
iperf3 -c <IP-del-servidor> -t 5
```

### Ver logs del servidor
Los logs se muestran en la consola donde se ejecutó `uvicorn`.

## 📄 Licencia

MIT License - Ver archivo LICENSE para detalles.

## 👥 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crear una rama para tu feature
3. Hacer commit de los cambios
4. Push a la rama
5. Abrir un Pull Request

---

Desarrollado con ❤️ para la comunidad de testing WiFi
