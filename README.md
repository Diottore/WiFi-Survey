```markdown
# WiFi Survey - Interfaz mejorada (Termux)

Esto contiene una versión mejorada de la interfaz web para ejecutar mediciones Wi‑Fi desde Termux (sin root).

Contenido principal:
- app.py : servidor Flask que orquesta mediciones y ofrece API REST.
- templates/index.html : interfaz web pulida.
- static/style.css : estilos.
- static/app.js : lógica cliente (start survey, run point, polling).
- mobile_wifi_survey.sh : script bash (opcional) para uso por consola.
- raw_results/ : carpeta donde se guardan JSONs.
- wifi_survey_results.csv : CSV resumen (generado por app.py).

Requisitos (en Termux)
1. Termux y Termux:API instalados.
2. Paquetes:
   pkg update && pkg upgrade -y
   pkg install python iperf3 jq coreutils termux-api -y
   pip install flask flask_cors

3. Concede permisos Android:
   - Ubicación (necesario para termux-wifi-connectioninfo y termux-location)
   - Almacenamiento (si quieres mover/descargar CSV)
   - Ejecuta termux-setup-storage para autorizar Termux a acceder a /sdcard.

Configuración
- Edita app.py y ajusta SERVER_IP (IP del PC donde corre `iperf3 -s`).
- Opcional: ajusta IPERF_DURATION e IPERF_PARALLEL.

Arranque
1. Inicia iperf3 en tu PC:
   iperf3 -s

2. Desde Termux, en la carpeta del proyecto:
   python3 app.py

3. Abre en el navegador del teléfono:
   http://127.0.0.1:5000

Qué hace la UI
- Run point: ejecuta medición puntual (RSSI, ping, iperf DL/UL) de forma síncrona.
- Start survey: lanza una encuesta con múltiples puntos y repeticiones en background; la UI muestra progreso y logs.
- Descargar CSV: baja el fichero resumen con todas las mediciones.
- Listar JSON crudos: permite descargar los archivos crudos desde raw_results.

Notas y recomendaciones
- Si quieres acceder a la UI desde otro dispositivo de la LAN (p.ej. tu PC), cambia app.run(host='127.0.0.1') a host='0.0.0.0' en app.py y asegúrate de seguridad en la red.
- Para campañas largas usa IPERF_DURATION más corto (20s) y reduce REPEATS al mínimo necesario.
- Habilita termux-wake-lock o asegura que Termux no sea optimizado por batería para que no se detenga en medio de la encuesta.

```