#!/data/data/com.termux/files/usr/bin/bash
# mobile_wifi_survey.sh - encuesta WiFi con Termux (sin root)
# Requiere: termux-api, iperf3, jq
SERVER_IP="192.168.1.10"    # <-- Cambia por la IP de tu servidor iperf3
IPERF_DURATION=30
IPERF_PARALLEL=4
REPEATS=3
OUTPUT_CSV="wifi_survey_results.csv"
RAW_DIR="./raw_results"

mkdir -p "$RAW_DIR"

if [ ! -f "$OUTPUT_CSV" ]; then
  echo "device,point_id,timestamp,lat,lon,ssid,bssid,frequency_mhz,rssi_dbm,link_speed_mbps,iperf_dl_mbps,iperf_ul_mbps,ping_avg_ms,ping_p95_ms,ping_loss_pct,test_duration_s,notes" > "$OUTPUT_CSV"
fi

read -p "Nombre del dispositivo (p.ej. S24FE): " DEVICE_NAME
echo "Introduce lista de puntos (separados por espacios), ejemplo: A1 A2 A3 B1 B2"
read -p "Introduce lista de puntos: " -a POINTS

termux-wake-lock
echo "Wakelock activado. Asegúrate de que el Wi‑Fi está conectado al SSID objetivo."

for POINT in "${POINTS[@]}"; do
  for RUN in $(seq 1 $REPEATS); do
    read -p "Mover a punto $POINT (repetición $RUN/$REPEATS). Pulsa ENTER cuando estés listo..." tmp

    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    WIFI_JSON=$(termux-wifi-connectioninfo 2>/dev/null || echo "{}")
    SSID=$(echo "$WIFI_JSON" | jq -r '.ssid // "N/A"')
    BSSID=$(echo "$WIFI_JSON" | jq -r '.bssid // "N/A"')
    RSSI=$(echo "$WIFI_JSON" | jq -r '.rssi // "N/A"')
    FREQ=$(echo "$WIFI_JSON" | jq -r '.frequency // "N/A"')
    LINK_SPEED=$(echo "$WIFI_JSON" | jq -r '.linkSpeed // "N/A"')

    LOC_JSON=$(termux-location -p gps,network -n 1 2>/dev/null || echo "{}")
    LAT=$(echo "$LOC_JSON" | jq -r '.latitude // empty')
    LON=$(echo "$LOC_JSON" | jq -r '.longitude // empty')

    PING_OUT=$(ping -c 50 -q "$SERVER_IP" 2>&1 || echo "")
    PING_AVG=$(echo "$PING_OUT" | awk -F'/' '/rtt/ {print $5}')
    PING_LOSS=$(echo "$PING_OUT" | awk -F', ' '/packet loss/ {print $3}' | sed 's/% packet loss//')

    IPERF_DL_JSON=$(iperf3 -c "$SERVER_IP" -t $IPERF_DURATION -P $IPERF_PARALLEL --json 2>/dev/null || echo "{}")
    IPERF_DL_BPS=$(echo "$IPERF_DL_JSON" | jq -r '.end.sum_received.bits_per_second // .end.sum_sent.bits_per_second // 0')
    IPERF_DL_Mbps=$(awk "BEGIN{printf \"%.2f\",${IPERF_DL_BPS}/1000000}")

    IPERF_UL_JSON=$(iperf3 -c "$SERVER_IP" -t $IPERF_DURATION -P $IPERF_PARALLEL -R --json 2>/dev/null || echo "{}")
    IPERF_UL_BPS=$(echo "$IPERF_UL_JSON" | jq -r '.end.sum_received.bits_per_second // .end.sum_sent.bits_per_second // 0')
    IPERF_UL_Mbps=$(awk "BEGIN{printf \"%.2f\",${IPERF_UL_BPS}/1000000}")

    RAW_FILE="$RAW_DIR/${POINT}_${RUN}_$(date -u +"%Y%m%dT%H%M%SZ").json"
    jq -n --arg w "$WIFI_JSON" --arg dl "$IPERF_DL_JSON" --arg ul "$IPERF_UL_JSON" --arg p "$PING_OUT" \
      '{wifi: ($w|fromjson?), iperf_dl: ($dl|fromjson?), iperf_ul: ($ul|fromjson?), ping: $p}' > "$RAW_FILE" 2>/dev/null || echo "{}" > "$RAW_FILE"

    echo "${DEVICE_NAME},${POINT},${TIMESTAMP},${LAT},${LON},\"${SSID}\",${BSSID},${FREQ},${RSSI},${LINK_SPEED},${IPERF_DL_Mbps},${IPERF_UL_Mbps},${PING_AVG},,${PING_LOSS},${IPERF_DURATION},run:${RUN}" >> "$OUTPUT_CSV"

    echo "Guardado: punto $POINT run $RUN -> $RAW_FILE"
    sleep 1
  done
done

termux-wake-unlock
echo "Encuesta finalizada. CSV: $OUTPUT_CSV  Raw: $RAW_DIR"