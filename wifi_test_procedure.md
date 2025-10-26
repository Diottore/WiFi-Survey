# Procedimiento de pruebas WiFi para ONUs y APs

## Objetivo
Evaluar cobertura (mapa), rendimiento (descarga/subida), latencia, jitter, pérdida de paquetes, nivel de señal (RSSI), handover/roaming, estabilidad y comportamiento bajo carga de varios ONUs y APs.

## Alcance
- Pruebas en banda 2.4 GHz y 5 GHz (y 6 GHz si aplica).
- Laboratorio (mesa de pruebas) y pruebas de campo en el área objetivo.
- Soporta testing masivo mediante agentes automatizados.

## Equipo necesario
- Cliente(s) de prueba: laptops, móviles y/o Raspberry Pi con adaptadores WiFi compatibles (soporte a 5 GHz/802.11ac/ax según necesites).
- Servidor de pruebas: máquina con iperf3 accesible desde la red del AP/ONU.
- Analizador de espectro o app para escaneo (NetSpot, Ekahau, inSSIDer, WiFi Analyzer).
- Software: iperf3, ping, traceroute/mtr, tshark/wireshark (opcional), speedtest-cli (si pruebas a Internet), herramientas de colección de RSSI (iw, airport, Windows netsh).
- Opcional: equipo profesional (IxChariot, Fluke) si disponible.
- Herramientas de posicionamiento/heatmap: NetSpot, Ekahau o combinación Kismet + QGIS para mapas abiertos.
- Planos del área con coordenadas / rejilla.
- Herramientas de automatización: Python + paramiko/requests, orchestration (script ejemplo incluido).

## Definiciones y métricas
- RSSI (dBm): nivel de señal. Umbrales sugeridos: > -60 Buen, -60 a -75 Aceptable, < -75 Débil.
- SNR: relación señal / ruido (dB).
- Throughput TCP (Mbit/s): medición con iperf3 (descarga y subida).
- Throughput UDP (Mbit/s) y Jitter (ms): iperf3 -u.
- Latencia (ms): media/mediana y p95/p99 de ping.
- Jitter (ms): variación de latencia entre paquetes; iperf3 UDP y/o rfc measurable.
- Packet loss (%): porcentaje de paquetes perdidos en pruebas de UDP/ping.
- Roaming/handover: tiempo de re-asociación y pérdida de paquetes al moverse entre APs.
- Concurrencia/Capacidad: número de usuarios simultáneos y throughput agregado.
- Estabilidad: variación en tiempo (stdev) entre repeticiones.

## Preparación del entorno
1. Asegura que firmware y configuración de los dispositivos (ONUs/APs) sean las versiones que quieres testar.
2. Desactiva servicios no relacionados (QoS en gateway, filtrado que pueda alterar tests) salvo que quieras medir la configuración real.
3. Selecciona canales y potencia inicial (para reproducibilidad). Documenta la configuración: SSID, seguridad, canal, ancho de banda (20/40/80/160 MHz), TX power, MCS, HT/VHT/HE.
4. Si es posible aislar la red de pruebas de Internet, hazlo (previene tráfico externo).
5. Preparar plano/rejilla del área (ej. cuadrícula 2 m x 2 m o según tamaño de área).

## Procedimiento general (por cada equipo/AP)
A. Test inicial en banco (bench)
- Conecta cliente a AP (mismo cuarto).
- Verificar version firmware y parámetros.
- Test throughput (iperf3):
  - Inicia iperf3 server en máquina central: iperf3 -s
  - Cliente (TCP, 60s, 4 streams): iperf3 -c <server_ip> -t 60 -P 4
  - Cliente (UDP, 60s, 10 Mbps target): iperf3 -c <server_ip> -u -b 10M -t 60
- Medir RSSI local (iw dev wlan0 link o herramientas OS).
- Ping 100 paquetes a servidor: ping -c 100 <server_ip>
- Registrar resultados y repetir 3 veces.

B. Mapeo de cobertura (campo)
- Usar plano y recorrer puntos de la rejilla. En cada punto:
  - Registrar coordenadas/punto.
  - Anotar RSSI, SNR y SSID (iw/Android app).
  - Ejecutar iperf3 TCP corto (20–30s, -P 4) para captar throughput local.
  - Ejecutar ping 30 paquetes y registrar latencia/pérdida.
  - Registrar entorno (obstáculos, altura de AP, orientación).
- Generar heatmaps de RSSI y throughput con NetSpot/Ekahau o exportar CSV y mapear en QGIS.

C. Pruebas de rendimiento y estabilidad
- Tests de descarga/subida reales:
  - TCP DL: iperf3 -c <server> -t 120 -P 8 (suficiente duración para estabilizar)
  - TCP UL: iperf3 -c <server> -t 120 -P 8 -R
  - UDP: iperf3 -c <server> -u -b <target> -t 60 (evaluar jitter y pérdida)
- Repetir a varias distancias/RSSI (ej. cerca, media, límite).
- Concurrencia: lanzar múltiples clientes simultáneos (varias Pis/PCs) para medir capacidad agregada.
- Medir latencia/jitter durante la carga (hacer ping desde cliente hacia server mientras corre iperf3).

D. Pruebas de roaming
- Preparar al menos 2 APs con mismo SSID (si quieres test real de roaming).
- Caminar con cliente desde AP1 a AP2, grabar tiempo de desconexión, paquetes perdidos y demora de re-asociación.
- Repetir en handoff forzado/desactivado 802.11r si aplicable.

E. Interferencia y co-channel
- Hacer escaneo de canales antes y durante pruebas.
- Ejecutar pruebas con interferencia inducida si es relevante (otro AP en mismo canal).

F. Seguridad y autenticación
- Test de WPA2/WPA3 handshake y tiempo de autenticación.
- Pruebas con 802.1X si aplica.

## Repeticiones y estadística
- Cada punto y cada prueba: mínimo 3 repeticiones; ideal 5.
- Reportar: media, mediana, desviación estándar, p95 y p99.
- Para throughput y latencia, muestra además curvas temporales (ej. throughput por segundo).

## Criterios de aceptación (ejemplos)
- Cobertura: RSSI >= -70 dBm en 95% del área crítica.
- Latencia: median < 30 ms, p95 < 80 ms.
- Packet loss: < 1% bajo carga nominal.
- Throughput: cumplir requisitos de servicio (ej. 100 Mbps DL por usuario en zonas prioritarias).
(Ajusta según SLA del proyecto.)

## Eficiencia (testing de múltiples equipos)
- Usa agentes remotos (Raspberry Pi) preconfigurados como clientes. Control central mediante SSH/HTTP para lanzar iperf3 y recoger CSV.
- Paralelizar pruebas en distintas zonas con varios agentes para reducir tiempo total.
- Pre-scan de canales para evitar repetir pruebas en horarios de interferencia alta.
- Ejecuta pruebas no disruptivas (ping/scan) en paralelo con pruebas de throughput que sí consumen banda.
- Automatiza el escalado: un orchestrator que reciba la lista de APs/ONUs y el plano y dispare tests secuenciales o paralelos según recursos.

## Recolección y reporte
- Formato CSV sugerido: device, ssid, channel, band, tx_power, date_time, point_x, point_y, rssi, snr, throughput_tcp_mbit, jitter_ms, packet_loss_pct, latency_mean_ms, latency_p95_ms, test_duration_s, notes
- Generar resumen ejecutivo: mapas (RSSI/throughput), tablas por dispositivo, gráficas de CDF/boxplot, y recomendaciones.

## Buenas prácticas
- Documenta todo (firmware, configuración exacta).
- Prueba en distintos momentos del día si el entorno es interferido.
- Si mides Internet: repite pruebas varias veces y compara con mediciones internas para separar cuello de botella WAN.
- Mantén reloj sincronizado (NTP) en todos los agentes.

## Plantillas y checklist rápido
- ✔ Firmware y config documentados
- ✔ Server iperf3 accesible
- ✔ Agentes preparados y sincronizados
- ✔ Plano con rejilla y etiquetas
- ✔ Pruebas repetidas 3-5x
- ✔ Recolección CSV y backup
