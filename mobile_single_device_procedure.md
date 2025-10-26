```markdown
# Procedimiento: medición de cobertura Wi‑Fi con un solo dispositivo (Samsung S24 FE / Android)

Resumen
- Dispositivo recomendado: Samsung S24 FE (Android). Si usas la PDA PMT-800 confirma que corre Android; si no, dime SO y adapto.
- Herramientas en dispositivo: Termux + Termux:API + iperf3 + jq.
- Servidor de pruebas: PC/laptop en la LAN con iperf3 corriendo (iperf3 -s). Debe ser accesible por IP desde el teléfono.
- Objetivo inicial: mapa de cobertura (RSSI + throughput) en una rejilla eficiente dentro de tu domicilio.

1) Preparación (en el teléfono)
- Instalar Termux (preferible desde F-Droid) y Termux:API.
- En Termux instalar paquetes:
  pkg update && pkg upgrade
  pkg install iperf3 jq coreutils termux-api
- Conceder permisos:
  - Otorga permiso de ubicación a Termux (necesario para termux-location y para que Android permita escaneos Wi‑Fi).
  - Excluir Termux del ahorro de batería (Ajustes > Batería > Optimización) y desactivar ahorro de energía del Wi‑Fi / desactivar modo de ahorro de batería global.
  - Mantener pantalla encendida durante la prueba (o usar Termux wakelock: termux-wake-lock).
- En el servidor (PC): ejecutar iperf3 -s y asegurarte de la IP (ej. 192.168.1.10).
- Desactivar Bluetooth y otras radios no necesarias.

2) Configuración del test y rejilla
- Tamaño del área y espaciamiento:
  - Hogar pequeño/mediano: rejilla de 2–3 m entre puntos.
  - Habitación muy pequeña: 1–2 m.
- Planificación:
  - Dibuja plano simple (o usa foto) y enumera los puntos (p.ej. A1..A5, B1..B5).
  - Organiza recorrido en patrón "serpiente" (zig-zag) para minimizar desplazamientos.
- Repeticiones:
  - 3 repeticiones por punto (ideal 5 para mayor fiabilidad).
  - Para cada medición toma: RSSI, frecuencia/band (2.4/5 GHz), throughput TCP DL/UL, ping (latencia), notas (obstáculos).

3) Medidas por punto (workflow)
- En el punto X: ejecutar el script; el script pedirá confirmación y hará:
  - termux-wifi-connectioninfo -> obtiene RSSI, SSID, frecuencia, linkSpeed.
  - termux-location (opcional) -> lat/long si funciona.
  - ping -c 50 <server> -> obtiene latencia media/p95 y pérdida.
  - iperf3 TCP (cliente) -> prueba de 30 s con 4 streams (--json) para throughput aproximado.
  - iperf3 reverse (-R) para medir el otro sentido (upload).
  - Guardar salida JSON y agregar una línea al CSV con campos estandarizados.
- Promedio y estadísticas:
  - El script guarda cada repetición; al finalizar puedes calcular media, mediana, stdev, p95 con Python/pandas o Excel.
- Tiempo estimado por punto:
  - ~60–90 s por repetición (incluye iperf3 de 30s + ping + lecturas). Con 3 repeticiones: ~4–5 min por punto.

4) Ejecución y eficiencia
- Para un área con 25 puntos (5x5) y 3 repeticiones: ~25 * 4–5 min = 100–125 min (1h40–2h).
- Para reducir tiempo:
  - Disminuir repeticiones (2 repeticiones) si necesitas velocidad; conserva 1 punto de control con 3 repeticiones.
  - Reducir duración iperf3 a 20s (-t 20) para obtener estimaciones más rápidas (pierdes algo de estabilidad).
  - Paralelizar no aplica si sólo tienes 1 equipo, pero puedes usar iperf3 -P para simular varios flujos en el mismo cliente si quieres estimar saturación.

5) Limitaciones al usar un solo dispositivo
- iperf3 -P (varios streams) simula múltiples flujos TCP, pero NO reproduce contención de varias estaciones físicas (airtime fairness, colisiones MAC, distintos radios).
- GPS interior puede ser impreciso; usar coordenadas solo como referencia o marcar manualmente los puntos.
- Variación ambiental: procura hacer pruebas en ventana temporal corta para minimizar cambios de interferencia.

6) Análisis y visualización
- CSV recomendado (columnas):
  device, point_id, timestamp, lat, lon, ssid, bssid, band_mhz, rssi_dbm, link_speed_mbps, iperf_dl_mbps, iperf_ul_mbps, ping_avg_ms, ping_p95_ms, ping_loss_pct, test_duration_s, notes
- Importar a QGIS o Excel para generar heatmaps, o usar NetSpot/Ekahau si prefieres GUI profesional.
- Generar mapas de RSSI y throughput y una tabla con puntos fuera de umbral (ej. RSSI < -75 dBm).

7) Comprobaciones de control
- Antes de empezar y cada 15–20 puntos, vuelve al punto de control y ejecuta un test de referencia para detectar drift.
- Documenta firmware, versión Android, potencia TX (si accesible) y canal.

8) Seguridad y ética
- Si pruebas en edificios con otras redes, informa a ocupantes y evita horarios pico si el objetivo no es medir interferencia real.
```