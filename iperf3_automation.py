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
import logging
from datetime import datetime
from typing import Dict, Any, Tuple, List, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuración: lista de agentes y servidor
AGENTS = [
    {"host": "192.168.1.101", "user": "pi", "key": "/home/user/.ssh/id_rsa", "wlan": "wlan0"},
    {"host": "192.168.1.102", "user": "pi", "key": "/home/user/.ssh/id_rsa", "wlan": "wlan0"},
]
SERVER_IP = "192.168.1.10"
TEST_DURATION = 60
PARALLEL_STREAMS = 4

OUTPUT_CSV = "iperf_results.csv"
LOCK = threading.Lock()
results: List[Dict[str, Any]] = []


def run_command_ssh(agent: Dict[str, str], cmd: str, timeout: int = 300) -> Tuple[str, str]:
    """
    Run command on remote agent via SSH.

    Args:
        agent: Dictionary with host, user, and key information
        cmd: Command to execute
        timeout: Command timeout in seconds

    Returns:
        Tuple of (stdout, stderr)

    Raises:
        paramiko.SSHException: If SSH connection fails
        socket.timeout: If connection times out
    """
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(
            agent["host"],
            username=agent["user"],
            key_filename=agent["key"],
            timeout=10,
            look_for_keys=False,  # Security: only use specified key
            allow_agent=False      # Security: don't use SSH agent
        )
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        return out, err
    finally:
        ssh.close()


def run_test(agent: Dict[str, str]) -> None:
    """
    Run iperf3 test on a single agent.

    Args:
        agent: Dictionary with agent configuration
    """
    try:
        logger.info(f"[{agent['host']}] Iniciando iperf3 TCP test...")
        cmd = f"iperf3 -c {SERVER_IP} -t {TEST_DURATION} -P {PARALLEL_STREAMS} --json"
        out, err = run_command_ssh(agent, cmd, timeout=TEST_DURATION+30)
        data = json.loads(out)
        rssi: Optional[float] = None
        # obtener RSSI (iw)
        try:
            iw_out, _ = run_command_ssh(agent, f"iw dev {agent['wlan']} link")
            for line in iw_out.splitlines():
                line = line.strip()
                if line.startswith("signal:"):
                    # ejemplo: signal: -43 dBm
                    rssi = int(line.split()[1])
        except (ValueError, IndexError, KeyError, json.JSONDecodeError) as e:
            logger.warning(f"Could not get RSSI for {agent['host']}: {e}")
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
        logger.info(f"[{agent['host']}] Test finalizado.")
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"[{agent['host']}] JSON parsing error: {e}")
    except Exception as e:
        logger.error(f"[{agent['host']}] Error: {e}")


def main() -> None:
    """Main function to orchestrate iperf3 tests across multiple agents."""
    threads: List[threading.Thread] = []
    for ag in AGENTS:
        t = threading.Thread(target=run_test, args=(ag,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    # Guardar CSV
    try:
        with open(OUTPUT_CSV, "w", newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["agent", "server", "timestamp", "rssi_dbm", "bits_per_second", "retransmits", "cpu_util"])
            for r in results:
                writer.writerow([
                    r["agent"],
                    r["server"],
                    r["timestamp"],
                    r["rssi_dbm"],
                    r["bits_per_second"],
                    r["retransmits"],
                    r["cpu_util"]
                ])
        logger.info(f"Resultados guardados en {OUTPUT_CSV}")
    except IOError as e:
        logger.error(f"Error saving CSV: {e}")


if __name__ == "__main__":
    main()
