#!/usr/bin/env python3
# app.py - Flask web UI mejorada para encuesta WiFi en Termux
# Requisitos: python3, flask, flask_cors, termux-api, iperf3, jq
import os
import csv
import json
import uuid
import threading
import subprocess
import re
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template, abort
from flask_cors import CORS

APP_DIR = os.path.abspath(os.path.dirname(__file__))
RAW_DIR = os.path.join(APP_DIR, "raw_results")
CSV_FILE = os.path.join(APP_DIR, "wifi_survey_results.csv")

# --- CONFIGURACIÓN: ajusta según tu servidor IP/tiempos ---
SERVER_IP = "192.168.1.10"
IPERF_DURATION = 20
IPERF_PARALLEL = 4
# --------------------------------------------------------

os.makedirs(RAW_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CSV_HEADER = ["device","point_id","timestamp","lat","lon","ssid","bssid","frequency_mhz","rssi_dbm","link_speed_mbps","iperf_dl_mbps","iperf_ul_mbps","ping_avg_ms","ping_jitter_ms","ping_loss_pct","test_duration_s","notes"]
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)

# Task manager for background surveys
tasks = {}
tasks_lock = threading.Lock()

def run_cmd(cmd, timeout=300):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        return "", "timeout", -1
    except Exception as e:
        return "", str(e), -1

def parse_ping_stats(ping_output):
    # Extract individual RTT times in ms
    times = []
    for line in ping_output.splitlines():
        m = re.search(r"time=([0-9]+\.?[0-9]*)", line)
        if m:
            try:
                times.append(float(m.group(1)))
            except:
                pass
    ping_avg = None
    ping_jitter = None
    ping_loss = ""
    if times:
        ping_avg = sum(times) / len(times)
        # jitter as mean absolute difference between successive RTTs
        if len(times) > 1:
            diffs = [abs(times[i] - times[i-1]) for i in range(1, len(times))]
            ping_jitter = sum(diffs) / len(diffs)
        else:
            ping_jitter = 0.0
    # packet loss
    for line in ping_output.splitlines():
        if 'packet loss' in line:
            parts = line.split(',')
            if len(parts) >= 3:
                ping_loss = parts[2].strip()
    return ping_avg, ping_jitter, ping_loss, times

def measure_point(device, point, run_index):
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    wifi_out, wifi_err, code = run_cmd("termux-wifi-connectioninfo")
    try: wifi_json = json.loads(wifi_out) if wifi_out else {}
    except: wifi_json = {}
    ssid = wifi_json.get("ssid", "N/A")
    bssid = wifi_json.get("bssid", "N/A")
    rssi = wifi_json.get("rssi", "")
    freq = wifi_json.get("frequency", "")
    link_speed = wifi_json.get("linkSpeed", "")

    loc_out, loc_err, code = run_cmd("termux-location -p gps,network -n 1")
    try: loc_json = json.loads(loc_out) if loc_out else {}
    except: loc_json = {}
    lat = loc_json.get("latitude", "")
    lon = loc_json.get("longitude", "")

    # Ping
    ping_out, ping_err, code = run_cmd(f"ping -c 30 {SERVER_IP}", timeout=90)
    ping_avg = ""
    ping_jitter = ""
    ping_loss = ""
    ping_times = []
    if ping_out:
        ping_avg_v, ping_jitter_v, ping_loss_v, ping_times = parse_ping_stats(ping_out)
        ping_avg = f"{ping_avg_v:.2f}" if ping_avg_v is not None else ""
        ping_jitter = f"{ping_jitter_v:.2f}" if ping_jitter_v is not None else ""
        ping_loss = ping_loss_v or ""

    # iperf3 DL (cliente default)
    dl_out, dl_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t {IPERF_DURATION} -P {IPERF_PARALLEL} --json", timeout=IPERF_DURATION+30)
    try: dl_json = json.loads(dl_out) if dl_out else {}
    except: dl_json = {}
    dl_bps = (dl_json.get("end", {}).get("sum_received", {}).get("bits_per_second")
              or dl_json.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
    dl_mbps = round(dl_bps / 1_000_000, 2) if dl_bps else 0.0

    # iperf3 UL (reverse)
    ul_out, ul_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t {IPERF_DURATION} -P {IPERF_PARALLEL} -R --json", timeout=IPERF_DURATION+30)
    try: ul_json = json.loads(ul_out) if ul_out else {}
    except: ul_json = {}
    ul_bps = (ul_json.get("end", {}).get("sum_received", {}).get("bits_per_second")
              or ul_json.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
    ul_mbps = round(ul_bps / 1_000_000, 2) if ul_bps else 0.0

    raw_file = os.path.join(RAW_DIR, f"{point}_{run_index}_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json")
    with open(raw_file, "w") as f:
        json.dump({"wifi": wifi_json, "location": loc_json, "ping": {"output": ping_out, "times": ping_times, "avg_ms": ping_avg, "jitter_ms": ping_jitter, "loss": ping_loss}, "iperf_dl": dl_json, "iperf_ul": ul_json}, f, indent=2)

    csv_row = [device, point, timestamp, lat, lon, ssid, bssid, freq, rssi, link_speed, dl_mbps, ul_mbps, ping_avg, ping_jitter, ping_loss, IPERF_DURATION, f"run:{run_index}"]
    with open(CSV_FILE, "a", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(csv_row)

    return {"device": device, "point": point, "timestamp": timestamp, "ssid": ssid, "bssid": bssid, "rssi": rssi, "frequency": freq, "link_speed": link_speed, "iperf_dl_mbps": dl_mbps, "iperf_ul_mbps": ul_mbps, "ping_avg": ping_avg, "ping_jitter": ping_jitter, "ping_loss": ping_loss, "raw_file": raw_file}

# --- Flask endpoints ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/run_point", methods=["POST"])
def run_point():
    data = request.json or {}
    device = data.get("device", "phone")
    point = data.get("point", "P1")
    run_index = data.get("run", 1)
    result = measure_point(device, point, run_index)
    return jsonify({"ok": True, "result": result})

@app.route("/start_survey", methods=["POST"])
def start_survey():
    payload = request.json or {}
    device = payload.get("device", "phone")
    points = payload.get("points", [])
    repeats = int(payload.get("repeats", 1))
    manual = bool(payload.get("manual", True))
    if not points:
        return jsonify({"ok": False, "error": "No points provided"}), 400

    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {"status": "queued", "mode": ("manual" if manual else "auto"), "total": len(points)*repeats, "done": 0, "logs": [], "results": []}
        # per-task event for manual proceed/cancel
        tasks[task_id]["event"] = threading.Event()

    def worker():
        with tasks_lock:
            tasks[task_id]["status"] = "running"
        idx = 0
        for p in points:
            for r in range(1, repeats+1):
                idx += 1
                log_line = f"[{idx}/{len(points)*repeats}] Preparando {p} (run {r})..."
                with tasks_lock:
                    tasks[task_id]["logs"].append(log_line)

                # if manual mode, wait for user confirmation before measuring this point/run
                if tasks[task_id].get("mode") == "manual":
                    with tasks_lock:
                        tasks[task_id]["status"] = "waiting"
                        tasks[task_id]["logs"].append(f"Esperando confirmación para {p} run {r}...")
                    # wait without holding the tasks_lock
                    evt = tasks[task_id].get("event")
                    if evt:
                        evt.clear()
                        evt.wait()  # blocked until /task_proceed or cancel sets the event
                    with tasks_lock:
                        if tasks[task_id].get("status") == "cancelled":
                            tasks[task_id]["logs"].append("Tarea cancelada por usuario")
                            return
                        tasks[task_id]["status"] = "running"

                try:
                    res = measure_point(device, p, r)
                    with tasks_lock:
                        tasks[task_id]["results"].append(res)
                        tasks[task_id]["done"] += 1
                        tasks[task_id]["logs"].append(f"OK: {p} run {r} -> {res['iperf_dl_mbps']} Mbps DL")
                except Exception as e:
                    with tasks_lock:
                        tasks[task_id]["logs"].append(f"ERROR en {p} run {r}: {e}")
        with tasks_lock:
            tasks[task_id]["status"] = "finished"

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return jsonify({"ok": True, "task_id": task_id})

@app.route("/task_proceed/<task_id>", methods=["POST"])
def task_proceed(task_id):
    with tasks_lock:
        if task_id not in tasks:
            return jsonify({"ok": False, "error": "task not found"}), 404
        t = tasks[task_id]
        # set status back to running and release event
        t["status"] = "running"
        t["logs"].append("Usuario indicó continuar")
        evt = t.get("event")
        if evt:
            evt.set()
    return jsonify({"ok": True})

@app.route("/task_cancel/<task_id>", methods=["POST"])
def task_cancel(task_id):
    with tasks_lock:
        if task_id not in tasks:
            return jsonify({"ok": False, "error": "task not found"}), 404
        tasks[task_id]["status"] = "cancelled"
        tasks[task_id]["logs"].append("Cancelado por solicitud del usuario")
        evt = tasks[task_id].get("event")
        if evt:
            evt.set()
    return jsonify({"ok": True})

@app.route("/task_status/<task_id>")
def task_status(task_id):
    with tasks_lock:
        if task_id not in tasks:
            return jsonify({"ok": False, "error": "task not found"}), 404
        # do not include the event object in the JSON response
        t = {k: v for k, v in tasks[task_id].items() if k != "event"}
        return jsonify(t)

@app.route("/download_csv")
def download_csv():
    if os.path.exists(CSV_FILE):
        return send_file(CSV_FILE, as_attachment=True)
    return jsonify({"ok": False, "error": "CSV not found"}), 404

@app.route("/list_raw")
def list_raw():
    files = sorted(os.listdir(RAW_DIR))
    return jsonify({"files": files})

@app.route("/raw/<path:fname>")
def raw_file(fname):
    safe_path = os.path.join(RAW_DIR, os.path.basename(fname))
    if os.path.exists(safe_path):
        return send_file(safe_path, as_attachment=True)
    abort(404)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)