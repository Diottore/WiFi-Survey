#!/usr/bin/env python3
"""
Ejemplo simple de orquestador de iperf3 para múltiples agentes.
Requisitos: python3, paramiko (SSH), iperf3 instalado en agentes y servidor.
Este script:
 - Lanza iperf3 server en servidor remoto (si se desea)
 - Lanza pruebas iperf3 desde agentes hacia el servidor
 - Recolecta resultados en JSON/CSV local
NOTA: Adáptalo según tu infraestructura (keys, autenticación, rutas).
"""
import paramiko
import threading
import json
import csv
import time
from datetime import datetime

# Configuración: lista de agentes y servidor
AGENTS = [
    {"host": "192.168.1.101", "user": "pi", "key": "/home/user/.ssh/id_rsa", "wlan": "wlan0"},
    {"host": "192.168.1.102", "user": "pi", "key": "/home/user/.ssh/id_rsa", "wlan": "wlan0"},
]
SERVER_IP = "192.168.1.10"
TEST_DURATION = 60
PARALLEL_STREAMS = 8

OUTPUT_CSV = "iperf_results.csv"
LOCK = threading.Lock()
results = []

def run_command_ssh(agent, cmd, timeout=300):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(agent["host"], username=agent["user"], key_filename=agent["key"], timeout=10)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ssh.close()
    return out, err

def run_test(agent):
    try:
        print(f"[{agent['host']}] Iniciando iperf3 TCP test...")
        cmd = f"iperf3 -c {SERVER_IP} -t {TEST_DURATION} -P {PARALLEL_STREAMS} --json"
        out, err = run_command_ssh(agent, cmd, timeout=TEST_DURATION+30)
        data = json.loads(out)
        rssi = None
        # obtener RSSI (iw)
        try:
            iw_out, _ = run_command_ssh(agent, f"iw dev {agent['wlan']} link")
            for line in iw_out.splitlines():
                line = line.strip()
                if line.startswith("signal:"):
                    # ejemplo: signal: -43 dBm
                    rssi = int(line.split()[1])
        except Exception:
            rssi = None

        entry = {
            "agent": agent["host"],
            "server": SERVER_IP,
            "timestamp": datetime.utcnow().isoformat(),
            "rssi_dbm": rssi,
            "bits_per_second": data.get("end", {}).get("sum_received", {}).get("bits_per_second"),
            "retransmits": data.get("end", {}).get("sum_received", {}).get("retransmits"),
            "cpu_util": data.get("end", {}).get("cpu_util"),
            "raw": data
        }
        with LOCK:
            results.append(entry)
        print(f"[{agent['host']}] Test finalizado.")
    except Exception as e:
        print(f"[{agent['host']}] Error: {e}")

def main():
    threads = []
    for ag in AGENTS:
        t = threading.Thread(target=run_test, args=(ag,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    # Guardar CSV
    with open(OUTPUT_CSV, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["agent","server","timestamp","rssi_dbm","bits_per_second","retransmits","cpu_util"])
        for r in results:
            writer.writerow([r["agent"], r["server"], r["timestamp"], r["rssi_dbm"], r["bits_per_second"], r["retransmits"], r["cpu_util"]])
    print("Resultados guardados en", OUTPUT_CSV)

if __name__ == "__main__":
    main()