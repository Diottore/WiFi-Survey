#!/data/data/com.termux/files/usr/bin/bash
# mobile_wifi_survey.sh - encuesta WiFi con Termux (sin root)
# Requiere: termux-api, iperf3, jq
SERVER_IP="192.168.1.10"    # <-- Cambia si es necesario
IPERF_DURATION=30
IPERF_PARALLEL=4
REPEATS=3
OUTPUT_CSV="wifi_survey_results.csv"
RAW_DIR="./raw_results"

mkdir -p "$RAW_DIR"

if [ ! -f "$OUTPUT_CSV" ]; then
  echo "device,point_id,timestamp,ssid,bssid,frequency_mhz,rssi_dbm,link_speed_mbps,iperf_dl_mbps,iperf_ul_mbps,ping_avg_ms,ping_jitter_ms,ping_loss_pct,test_duration_s,notes" > "$OUTPUT_CSV"
fi

read -r -p "Identificador del equipo bajo prueba (DUT) o nombre del teléfono que ejecuta la prueba (p.ej. AP-Lobby o S24FE): " DEVICE_NAME
echo "Introduce lista de puntos (separados por espacios), ejemplo: A1 A2 A3 B1 B2"
read -r -p "Introduce lista de puntos: " -a POINTS

termux-wake-lock
echo "Wakelock activado. Asegúrate de que el Wi‑Fi está conectado al SSID objetivo."

for POINT in "${POINTS[@]}"; do
  for RUN in $(seq 1 $REPEATS); do
    read -r -p "Mover a punto $POINT (repetición $RUN/$REPEATS). Pulsa ENTER cuando estés listo..."

    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    WIFI_JSON=$(termux-wifi-connectioninfo 2>/dev/null || echo "{}")
    SSID=$(echo "$WIFI_JSON" | jq -r '.ssid // "N/A"')
    BSSID=$(echo "$WIFI_JSON" | jq -r '.bssid // "N/A"')
    RSSI=$(echo "$WIFI_JSON" | jq -r '.rssi // "N/A"')
    FREQ=$(echo "$WIFI_JSON" | jq -r '.frequency // "N/A"')
    LINK_SPEED=$(echo "$WIFI_JSON" | jq -r '.linkSpeed // "N/A"')

    # Run ping and capture individual RTTs
    PING_OUT=$(ping -c 50 "$SERVER_IP" 2>&1 || echo "")
    # Extract RTT values (numbers after time=)
    RTTS=$(echo "$PING_OUT" | awk -F'time=' '/time=/{print $2}' | awk '{print $1}')
    PING_AVG=""
    PING_JITTER=""
    PING_LOSS=""
    TIMES_JSON="[]"
    if [ -n "$RTTS" ]; then
      # compute avg
      PING_AVG=$(echo "$RTTS" | awk '{sum+=$1; n++} END{ if(n>0) printf "%.2f", sum/n; else print "0.00" }')
      # compute mean absolute difference (jitter)
      PING_JITTER=$(echo "$RTTS" | awk 'BEGIN{prev="";n=0;sum=0} { if(prev==""){ prev=$1 } else { d=$1-prev; if(d<0) d=-d; sum+=d; prev=$1; n++ } } END{ if(n>0) printf "%.2f", sum/n; else print "0.00" }')
      # packet loss (extract third comma-separated field usually)
      PING_LOSS=$(echo "$PING_OUT" | awk -F', ' '/packet loss/ {print $3}' | sed 's/% packet loss//')
      # build JSON array of times (using jq)
      TIMES_JSON=$(echo "$RTTS" | jq -R -s 'split("\n") | map(select(. != "")) | map(tonumber)' 2>/dev/null || echo "[]")
    fi

    IPERF_DL_JSON=$(iperf3 -c "$SERVER_IP" -t $IPERF_DURATION -P $IPERF_PARALLEL --json 2>/dev/null || echo "{}")
    IPERF_DL_BPS=$(echo "$IPERF_DL_JSON" | jq -r '.end.sum_received.bits_per_second // .end.sum_sent.bits_per_second // 0')
    IPERF_DL_Mbps=$(awk "BEGIN{printf \"%.2f\",${IPERF_DL_BPS}/1000000}")

    IPERF_UL_JSON=$(iperf3 -c "$SERVER_IP" -t $IPERF_DURATION -P $IPERF_PARALLEL -R --json 2>/dev/null || echo "{}")
    IPERF_UL_BPS=$(echo "$IPERF_UL_JSON" | jq -r '.end.sum_received.bits_per_second // .end.sum_sent.bits_per_second // 0')
    IPERF_UL_Mbps=$(awk "BEGIN{printf \"%.2f\",${IPERF_UL_BPS}/1000000}")

    RAW_FILE="$RAW_DIR/${POINT}_${RUN}_$(date -u +"%Y%m%dT%H%M%SZ").json"
    # Create raw JSON with ping times array, avg and jitter
    jq -n --argjson wifi "$(echo "$WIFI_JSON" | jq -c '.' 2>/dev/null || echo '{}')" \
          --argjson dl "$(echo "$IPERF_DL_JSON" | jq -c '.' 2>/dev/null || echo '{}')" \
          --argjson ul "$(echo "$IPERF_UL_JSON" | jq -c '.' 2>/dev/null || echo '{}')" \
          --arg ping_out "$PING_OUT" \
          --arg avg "$PING_AVG" --arg jitter "$PING_JITTER" --arg loss "$PING_LOSS" \
          --argjson times "$TIMES_JSON" \
          '{wifi: $wifi, iperf_dl: $dl, iperf_ul: $ul, ping: {raw: $ping_out, times: $times, avg_ms: $avg, jitter_ms: $jitter, loss: $loss}}' > "$RAW_FILE" 2>/dev/null || echo "{}" > "$RAW_FILE"

    echo "${DEVICE_NAME},${POINT},${TIMESTAMP},\"${SSID}\",${BSSID},${FREQ},${RSSI},${LINK_SPEED},${IPERF_DL_Mbps},${IPERF_UL_Mbps},${PING_AVG},${PING_JITTER},${PING_LOSS},${IPERF_DURATION},run:${RUN}" >> "$OUTPUT_CSV"

    echo "Guardado: punto $POINT run $RUN -> $RAW_FILE"
    sleep 1
  done
done

termux-wake-unlock
echo "Encuesta finalizada. CSV: $OUTPUT_CSV  Raw: $RAW_DIR"