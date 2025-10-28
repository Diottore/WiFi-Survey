# Arquitectura WiFi-Tester

## Visión General

WiFi-Tester es una aplicación web moderna para medición de cobertura WiFi, construida con un backend FastAPI y un frontend SPA (Single Page Application).

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend SPA                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ ECharts  │  │ Leaflet  │  │WebSocket │             │
│  │ (Gráficas)│  │  (Mapa)  │  │ Client   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
                          ▲ HTTP/WS
                          │
┌─────────────────────────────────────────────────────────┐
│                    Backend FastAPI                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │              REST API Endpoints                   │  │
│  │  /api/start_test  /api/stop_test  /api/status   │  │
│  │  /api/export      /ws (WebSocket)                │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Test Runner (Async)                  │  │
│  │  - Subprocess management (ping, iperf3)          │  │
│  │  - RSSI detection strategies                     │  │
│  │  - Measurement persistence                       │  │
│  │  - Point pause/continue logic                    │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │            SQLModel + SQLite DB                   │  │
│  │  Tables: jobs, points, measurements              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  External Tools                          │
│  ping, iperf3, termux-wifi-connectioninfo, iw, iwconfig │
└─────────────────────────────────────────────────────────┘
```

## Componentes Principales

### 1. Backend FastAPI

#### 1.1 API REST (`main.py`)

Expone los siguientes endpoints:

- **POST /api/start_test**: Crea un Job y lanza el runner en background
- **POST /api/stop_test**: Detiene un Job activo
- **POST /api/continue_point**: Continúa desde un punto pausado
- **GET /api/status**: Obtiene el estado de un Job
- **GET /api/export**: Exporta datos en CSV o JSON
- **WS /ws**: WebSocket para eventos en tiempo real

#### 1.2 Modelos de Datos (`models.py`)

Utiliza SQLModel para definir tres tablas principales:

**Job**: Representa una sesión de pruebas
- `id`: Primary key
- `target_host`: IP del servidor iperf3
- `iperf_mode`: tcp o udp
- `iperf_duration`: Duración en segundos
- `repetitions`: Número de repeticiones por punto
- `status`: created, running, stopped, completed

**Point**: Representa un punto de medición
- `id`: Primary key
- `job_id`: Foreign key a Job
- `point_id`: Identificador del punto (definido por usuario)
- `lat`, `lng`: Coordenadas GPS
- `status`: pending, running, paused, completed
- `current_repetition`: Contador de repeticiones

**Measurement**: Representa una medición individual
- `id`: Primary key
- `point_id`, `job_id`: Foreign keys
- `repetition`: Número de repetición
- `timestamp`: Momento de la medición
- `rssi`, `ssid`, `bssid`, `frequency_mhz`: Datos WiFi
- `throughput_dl_kbps`, `throughput_ul_kbps`: Throughput
- `latency_ms`, `jitter_ms`, `packet_loss_pct`: Métricas de latencia

#### 1.3 Test Runner (`runner.py`)

Motor asíncrono que ejecuta las pruebas:

**Flujo de ejecución:**
1. Obtiene configuración del Job desde DB
2. Para cada Point:
   - Para cada Repetición:
     - Ejecuta ping (latencia, jitter, packet loss)
     - Ejecuta iperf3 download (throughput DL)
     - Ejecuta iperf3 upload (throughput UL)
     - Detecta RSSI con múltiples estrategias
     - Persiste Measurement en DB
     - Emite evento WebSocket "measurement"
   - Marca Point como "paused"
   - Emite evento WebSocket "point_done"
   - Espera señal "continue" vía WebSocket
3. Marca Job como "completed"
4. Emite evento WebSocket "status"

**Características:**
- Ejecución asíncrona con `asyncio`
- Subprocess management para herramientas externas
- Manejo de timeouts
- Modo simulado cuando las herramientas no están disponibles
- Pausa automática entre puntos

#### 1.4 Utilidades (`utils.py`)

Funciones auxiliares:

- **parse_ping_output()**: Extrae latency, jitter, packet loss del output de ping
- **parse_iperf3_output()**: Extrae throughput del JSON de iperf3
- **detect_rssi()**: Estrategias múltiples para detectar RSSI
  1. termux-wifi-connectioninfo (Termux)
  2. dumpsys wifi (Android)
  3. iw (Linux moderno)
  4. iwconfig (Linux legacy)
- **run_simulated_test()**: Genera datos simulados

### 2. Base de Datos

**Motor**: SQLite con SQLModel
**Archivo**: `backend/db.sqlite`

**Ventajas:**
- Sin configuración adicional
- Persistencia desde el inicio
- Fácil de respaldar (copiar archivo)
- Portabilidad

**Inicialización:**
```python
from app.db import init_db
init_db()  # Crea las tablas si no existen
```

### 3. Frontend SPA

#### 3.1 Interfaz de Usuario (`index.html`)

Secciones principales:
- Formulario de configuración
- Panel de estado
- Mapa de cobertura (Leaflet)
- Gráficas en tiempo real (ECharts)
- Panel de exportación
- Consola de logs

#### 3.2 Lógica del Cliente (`app.js`)

**Responsabilidades:**
- Enviar configuración de prueba al backend
- Establecer conexión WebSocket
- Recibir y procesar eventos en tiempo real
- Actualizar gráficas dinámicamente
- Gestionar estado de la UI
- Descargar archivos de exportación

**WebSocket Events:**
- `measurement`: Actualiza gráficas con nueva medición
- `point_done`: Muestra botón "Continuar"
- `status`: Actualiza estado general del Job

#### 3.3 Visualizaciones

**ECharts:**
- Gráfica de RSSI (dBm) vs Puntos
- Gráfica de Throughput (DL/UL) vs Puntos
- Gráfica de Latencia y Jitter vs Puntos
- Gráfica de Pérdida de Paquetes vs Puntos

**Leaflet:**
- Mapa con marcadores por cada punto
- Colores según nivel de señal

## Flujo de Datos

### Inicio de Prueba

```
Usuario → Frontend → POST /api/start_test
                  ↓
              Backend: Crea Job y Points en DB
                  ↓
              Backend: Lanza TestRunner (async task)
                  ↓
              Backend: Retorna Job info
                  ↓
         Frontend: Conecta WebSocket
```

### Ejecución de Medición

```
TestRunner → subprocess ping
          → subprocess iperf3 (download)
          → subprocess iperf3 (upload)
          → detect_rssi()
          ↓
     Crea Measurement en DB
          ↓
     Emite evento WebSocket "measurement"
          ↓
     Frontend: Actualiza gráficas
```

### Pausa y Continuación

```
TestRunner → Completa repeticiones del punto
          → Marca Point como "paused"
          → Emite evento "point_done"
          → Espera señal continue
          ↓
     Frontend: Muestra botón "Continuar"
          ↓
     Usuario: Click en "Continuar"
          ↓
     Frontend → WS message {"type": "continue", "point_id": "P1"}
          ↓
     TestRunner: Recibe señal y continúa
```

### Exportación

```
Usuario → Frontend → GET /api/export?job_id=X&format=csv
                  ↓
         Backend: Query measurements de DB
                  ↓
         Backend: Genera archivo CSV/JSON temporal
                  ↓
         Backend: FileResponse con Content-Disposition
                  ↓
         Frontend: Descarga archivo
```

## Decisiones de Diseño

### Por qué FastAPI
- Async/await nativo para concurrencia
- WebSocket integrado
- Documentación automática (OpenAPI)
- Type hints y validación con Pydantic
- Alto rendimiento

### Por qué SQLModel
- Combina SQLAlchemy (ORM) con Pydantic (validación)
- Menos código boilerplate
- Type safety
- Fácil migración a PostgreSQL si es necesario

### Por qué SQLite
- Zero-configuration
- Portabilidad (un solo archivo)
- Suficiente para casos de uso de WiFi testing
- Fácil de respaldar

### Por qué WebSocket
- Actualizaciones en tiempo real
- Menor overhead que polling HTTP
- Bidireccional (continuar puntos)

### Por qué ECharts
- Gráficas interactivas y responsive
- Amplia variedad de tipos de gráfica
- Buena documentación
- Rendimiento para datasets medianos

### Por qué Leaflet
- Liviano (solo 38 KB)
- Compatible con móviles
- Fácil integración
- Tiles gratuitos de OpenStreetMap

## Seguridad

### Consideraciones Implementadas
- Validación de entrada con Pydantic
- Timeouts en subprocess para evitar bloqueos
- Archivos temporales con nombres únicos
- CORS configurado (puede personalizarse)

### Mejoras Futuras Sugeridas
- Autenticación (JWT)
- Rate limiting
- HTTPS/WSS en producción
- Sanitización de archivos exportados
- Límite de tamaño de DB

## Escalabilidad

### Limitaciones Actuales
- SQLite no soporta múltiples escrituras concurrentes
- Runner en memoria (se pierde al reiniciar)
- Sin balanceo de carga

### Mejoras para Escalar
- Migrar a PostgreSQL
- Redis para estado de runners
- Celery para tareas en background
- Load balancer (nginx, traefik)
- Persistent WebSocket connections con Redis pub/sub

## Testing

### Estrategia
- Unit tests con pytest
- Mocks para subprocess (ping, iperf3)
- Base de datos en memoria para tests
- Test client de FastAPI para endpoints

### Cobertura
- Parsers (utils.py)
- Runner logic (runner.py)
- API endpoints (main.py)

## Despliegue

### Termux (Android)
```bash
bash backend/start.sh
```

### Linux/Mac
```bash
source backend/venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Docker
```bash
docker build -t wifi-tester backend/
docker run -p 8000:8000 wifi-tester
```

### Docker Compose (futuro)
```yaml
services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
  nginx:
    image: nginx
    ports:
      - "80:80"
```

## Monitoreo y Logs

### Logs
- Python logging module
- Nivel INFO por defecto
- Logs de stdout/stderr visibles en consola

### Métricas Sugeridas
- Número de Jobs activos
- Número de Measurements por hora
- Tasa de éxito/fallo de subprocess
- Tiempo promedio por medición

## Conclusión

WiFi-Tester es una aplicación moderna y bien estructurada que aprovecha las capacidades asíncronas de Python para ejecutar pruebas de red de forma eficiente, mientras proporciona una interfaz de usuario intuitiva con actualizaciones en tiempo real.

La arquitectura modular permite fácil extensión y mantenimiento, y el uso de tecnologías estándar (FastAPI, SQLModel, ECharts, Leaflet) garantiza una base sólida para futuras mejoras.
