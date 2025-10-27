```markdown
# WiFi Survey - Interfaz mejorada (Termux)

Aplicación web para ejecutar mediciones Wi-Fi profesionales desde Termux (sin root), con interfaz mejorada, validación robusta y manejo de errores completo.

## Características principales

- ✅ **Mediciones completas**: Download/Upload throughput (iperf3) + latencia (ping)
- ✅ **Interfaz responsive**: Optimizada para móviles y tablets
- ✅ **Monitoreo en tiempo real**: Gráficas en vivo durante las pruebas
- ✅ **Modo encuesta**: Automatización de múltiples puntos
- ✅ **Validación robusta**: Prevención de errores con validación de entrada
- ✅ **Exportación múltiple**: CSV, JSON, estadísticas agregadas
- ✅ **Manejo de errores**: Recuperación automática y mensajes informativos

## Contenido principal

- `app.py`: Servidor Flask con API REST y validación completa
- `templates/index.html`: Interfaz web optimizada
- `static/style.css`: Estilos responsivos
- `static/app.js`: Lógica cliente con manejo de errores
- `mobile_wifi_survey.sh`: Script bash (opcional) para uso por consola
- `raw_results/`: Carpeta donde se guardan JSONs detallados
- `wifi_survey_results.csv`: CSV resumen (generado por app.py)

## Requisitos (en Termux)

1. **Termux** y **Termux:API** instalados desde F-Droid
2. **Paquetes necesarios**:
   ```bash
   pkg update && pkg upgrade -y
   pkg install python iperf3 jq coreutils termux-api -y
   pip install flask flask_cors
   ```

3. **Permisos Android** (importante):
   - Ubicación (necesario para termux-wifi-connectioninfo)
   - Almacenamiento (para acceso a archivos)
   - Ejecuta `termux-setup-storage` para autorizar Termux

## Configuración

1. **Edita `app.py`** y configura:
   - `SERVER_IP`: IP del PC donde corre `iperf3 -s` (ejemplo: "192.168.1.10")
   - `IPERF_DURATION`: Duración de cada prueba en segundos (default: 20)
   - `IPERF_PARALLEL`: Streams paralelos de iperf3 (default: 4)

2. **Opcional**: Ajusta límites de memoria en `app.py`:
   - `MAX_TASK_LOGS`: Logs máximos por tarea (default: 200)
   - `MAX_SAMPLES_PER_TASK`: Muestras máximas por prueba (default: 1200)
   - `MAX_TASKS_IN_MEMORY`: Tareas en memoria (default: 100)

## Arranque

1. **Inicia iperf3 en tu PC**:
   ```bash
   iperf3 -s
   ```

2. **Desde Termux**, en la carpeta del proyecto:
   ```bash
   python3 app.py
   ```

3. **Abre en el navegador del teléfono**:
   ```
   http://127.0.0.1:5000
   ```

## Uso de la interfaz

### Medición rápida (Quick)
- Ejecuta una medición puntual en un solo punto
- Introduce: nombre del dispositivo, punto de medición, número de repetición
- Validación automática de nombres (solo letras, números, guiones)
- Monitoreo en tiempo real con gráficas

### Encuesta multi-punto (Survey)
- Automatiza mediciones en múltiples ubicaciones
- Lista de puntos separados por espacios o comas
- Modo manual: pide confirmación antes de cada punto
- Progreso en tiempo real con cancelación disponible

### Resultados
- Gráficos interactivos de throughput y latencia
- Filtrado y búsqueda de resultados
- Exportación múltiple:
  - **CSV wide**: Estadísticas agregadas por punto
  - **CSV long**: Datos detallados de cada medición
  - **CSV muestras**: Datos temporales (timeseries)
  - **JSON**: Resultados completos
  - **Resumen JSON**: Estadísticas calculadas

## Validaciones y límites

La aplicación incluye validaciones para prevenir errores:

- **Nombres de punto**: Solo letras, números, guiones y guión bajo (máx. 100 caracteres)
- **Nombres de dispositivo**: Máximo 50 caracteres
- **Repeticiones**: Entre 1 y 1000 para mediciones únicas, 1-50 para encuestas
- **Puntos por encuesta**: Máximo 100 puntos
- **Duración de prueba**: Entre 1 y 600 segundos
- **Streams paralelos**: Entre 1 y 16

## Seguridad y estabilidad

✅ **Validación de entrada**: Prevención de inyección y path traversal  
✅ **Límites de memoria**: Prevención de uso excesivo de RAM  
✅ **Manejo de errores**: Recuperación automática de fallos de red  
✅ **Logging estructurado**: Trazabilidad completa de operaciones  
✅ **Timeouts configurables**: Prevención de bloqueos  

## Notas y recomendaciones

- **Acceso remoto**: Para acceder desde otro dispositivo en la LAN, cambia `app.run(host='127.0.0.1')` a `host='0.0.0.0'` en `app.py` (⚠️ considera la seguridad de tu red)
- **Campañas largas**: Usa `IPERF_DURATION` más corto (10-15s) y reduce repeticiones
- **Batería**: Habilita `termux-wake-lock` o deshabilita optimización de batería para Termux
- **Almacenamiento**: Los archivos raw JSON pueden ocupar espacio; limpia `raw_results/` periódicamente
- **Rendimiento**: Si el dispositivo se ralentiza, reduce `MAX_TASKS_IN_MEMORY` o `MAX_SAMPLES_PER_TASK`

## Solución de problemas

**Error de conexión con iperf3**:
- Verifica que el servidor iperf3 esté corriendo: `iperf3 -s`
- Verifica que `SERVER_IP` en `app.py` sea correcto
- Comprueba conectividad: `ping <SERVER_IP>`

**Termux-API no funciona**:
- Verifica permisos de ubicación en Android
- Reinstala Termux:API desde F-Droid
- Comprueba: `termux-wifi-connectioninfo`

**Problemas de memoria**:
- Reduce `MAX_TASKS_IN_MEMORY` a 50
- Reduce `MAX_SAMPLES_PER_TASK` a 600
- Reinicia la aplicación periódicamente

## Mejoras implementadas (v2.0)

### Backend
- ✅ Validación completa de entradas
- ✅ Logging estructurado con niveles
- ✅ Gestión de memoria con límites
- ✅ Manejo robusto de errores
- ✅ Timeouts configurables
- ✅ Seguridad contra path traversal

### Frontend
- ✅ Validación en tiempo real
- ✅ Mensajes de error informativos
- ✅ Recuperación automática de conexión
- ✅ Confirmación para acciones destructivas
- ✅ Tooltips en todos los controles
- ✅ Indicadores visuales de estado
- ✅ Mejor feedback de usuario

## Licencia

Ver archivo LICENSE

```