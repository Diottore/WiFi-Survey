#!/usr/bin/env python3
# app.py - Flask web UI mejorada para encuesta WiFi en Termux
# Añadido: ejecución de pruebas en background y SSE para updates parciales
import os
import csv
import json
import uuid
import threading
import subprocess
import re
import time
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template, abort, Response
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

CSV_HEADER = ["device","point_id","timestamp","ssid","bssid","frequency_mhz","rssi_dbm","link_speed_mbps","iperf_dl_mbps","iperf_ul_mbps","ping_avg_ms","ping_jitter_ms","ping_loss_pct","test_duration_s","notes"]
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)

# Task manager for background surveys and runs
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

def parse_ping_times_from_output_line(line):
    # extract time=XX.ms
    m = re.search(r'time=([\d\.]+)', line)
    if m:
        try:
            return float(m.group(1))
        except:
            return None
    return None

def worker_run_point(task_id, device, point, run_index, duration, parallel):
    """
    Worker that performs ping + iperf3 (DL then UL) and writes partial updates to tasks[task_id].
    It tries to parse interval Mbits/sec from iperf3 stdout.
    """
    with tasks_lock:
        tasks[task_id]["status"] = "running"
        tasks[task_id]["partial"] = {"dl_mbps": 0.0, "ul_mbps": 0.0, "ping_avg_ms": None, "ping_jitter_ms": None, "progress_pct": 0, "elapsed_s": 0}
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
        tasks[task_id]["logs"].append(f"Task {task_id} started: {point} run:{run_index}")

    start_ts = time.time()

    # Read wifi info (best-effort)
    wifi_out, wifi_err, code = run_cmd("termux-wifi-connectioninfo")
    try:
        wifi_json = json.loads(wifi_out) if wifi_out else {}
    except:
        wifi_json = {}

    # Helper to update partial
    def update_partial(dl=None, ul=None, ping_vals=None, progress=None, note=None):
        with tasks_lock:
            partial = tasks[task_id].setdefault("partial", {})
            if dl is not None:
                partial["dl_mbps"] = float(dl)
            if ul is not None:
                partial["ul_mbps"] = float(ul)
            if ping_vals is not None:
                # ping_vals: list of sample RTTs in ms
                times = ping_vals
                avg = sum(times)/len(times) if times else None
                jitter = None
                if len(times) > 1:
                    diffs = [abs(times[i] - times[i-1]) for i in range(1, len(times))]
                    jitter = sum(diffs)/len(diffs)
                partial["ping_avg_ms"] = avg
                partial["ping_jitter_ms"] = jitter
            if progress is not None:
                partial["progress_pct"] = int(progress)
            partial["elapsed_s"] = int(time.time() - start_ts)
            tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
            if note:
                tasks[task_id]["logs"].append(note)

    # Run ping in background thread to gather RTT samples
    ping_samples = []
    def ping_worker():
        try:
            # use -i 1 to sample each second; -w to stop after duration+2 seconds if available
            p = subprocess.Popen(["ping", "-c", str(int(duration)), SERVER_IP], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in p.stdout:
                line = line.strip()
                t = parse_ping_times_from_output_line(line)
                if t is not None:
                    ping_samples.append(t)
                    # update ping partial
                    update_partial(ping_vals=ping_samples)
            p.wait()
        except Exception as e:
            with tasks_lock:
                tasks[task_id]["logs"].append(f"ping error: {e}")

    ping_thread = threading.Thread(target=ping_worker, daemon=True)
    ping_thread.start()

    # Run iperf3 DL (normal client: server sends data to client? typical iperf3 -c measures send from client)
    # We'll run iperf3 in client mode and parse interval lines with Mbits/sec.
    dl_mbps_final = 0.0
    try:
        cmd_dl = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)}"
        p = subprocess.Popen(cmd_dl, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in p.stdout:
            line = line.strip()
            # try to parse a float followed by Mbits/sec
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    # heuristic: assume this is latest interval bandwidth; set as dl partial
                    update_partial(dl=val)
                except:
                    pass
            # log any line that may be useful
            if line:
                with tasks_lock:
                    tasks[task_id]["logs"].append(line if len(line) < 1000 else line[:1000])
        p.wait()
        # Try final json summary (call iperf3 with --json separately to get reliable final)
        dl_out, dl_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t {int(1)} -P {int(parallel)} --json", timeout=10)
        try:
            j = json.loads(dl_out) if dl_out else {}
            # try sum_received or sum_sent
            dl_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            dl_mbps_final = round(dl_bps / 1_000_000, 2) if dl_bps else 0.0
        except:
            dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
        update_partial(dl=dl_mbps_final)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 DL error: {e}")

    # Run iperf3 UL (reverse) to measure upload to server
    ul_mbps_final = 0.0
    try:
        cmd_ul = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)} -R"
        p = subprocess.Popen(cmd_ul, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(ul=val)
                except:
                    pass
            if line:
                with tasks_lock:
                    tasks[task_id]["logs"].append(line if len(line) < 1000 else line[:1000])
        p.wait()
        # final UL json quick sample
        ul_out, ul_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t {int(1)} -P {int(parallel)} -R --json", timeout=10)
        try:
            j = json.loads(ul_out) if ul_out else {}
            ul_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            ul_mbps_final = round(ul_bps / 1_000_000, 2) if ul_bps else 0.0
        except:
            ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
        update_partial(ul=ul_mbps_final)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 UL error: {e}")

    # Wait for ping thread to finish (should be done)
    try:
        ping_thread.join(timeout=2)
    except:
        pass

    # Compose final result, save raw json
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    final = {
        "device": device,
        "point": point,
        "timestamp": timestamp,
        "ssid": wifi_json.get("ssid",""),
        "bssid": wifi_json.get("bssid",""),
        "rssi": wifi_json.get("rssi",""),
        "frequency": wifi_json.get("frequency",""),
        "link_speed": wifi_json.get("linkSpeed",""),
        "iperf_dl_mbps": dl_mbps_final,
        "iperf_ul_mbps": ul_mbps_final,
        "ping_avg_ms": tasks[task_id].get("partial", {}).get("ping_avg_ms"),
        "ping_jitter_ms": tasks[task_id].get("partial", {}).get("ping_jitter_ms"),
        "duration_s": duration
    }

    raw_file = os.path.join(RAW_DIR, f"{point}_{run_index}_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json")
    try:
        with open(raw_file, "w") as f:
            json.dump({"wifi": wifi_json, "partial": tasks[task_id].get("partial",{}), "final": final}, f, indent=2)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"Error saving raw: {e}")

    # Append to CSV
    try:
        with open(CSV_FILE, "a", newline='') as f:
            writer = csv.writer(f)
            writer.writerow([device, point, timestamp, final["ssid"], final["bssid"], final["frequency"], final["rssi"], final["link_speed"], final["iperf_dl_mbps"], final["iperf_ul_mbps"], final["ping_avg_ms"], final["ping_jitter_ms"], "", duration, f"run:{run_index}"])
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"CSV write error: {e}")

    # Finalize task
    with tasks_lock:
        tasks[task_id]["status"] = "finished"
        tasks[task_id]["result"] = final
        tasks[task_id]["raw_file"] = os.path.basename(raw_file)
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
        tasks[task_id]["logs"].append("Task finished")
    return

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/run_point", methods=["POST"])
def run_point():
    payload = request.json or {}
    device = payload.get("device", "phone")
    point = payload.get("point", "P1")
    run_index = int(payload.get("run", 1))
    duration = int(payload.get("duration", IPERF_DURATION))
    parallel = int(payload.get("parallel", IPERF_PARALLEL))

    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {"status":"queued", "total":1, "done":0, "logs":[], "results": [], "partial": {}, "seq": 0}
    t = threading.Thread(target=worker_run_point, args=(task_id, device, point, run_index, duration, parallel), daemon=True)
    t.start()
    return jsonify({"ok": True, "task_id": task_id})

@app.route("/task_status/<task_id>")
def task_status(task_id):
    with tasks_lock:
        if task_id not in tasks:
            return jsonify({"ok": False, "error": "task not found"}), 404
        return jsonify(tasks[task_id])

@app.route("/stream/<task_id>")
def stream_task(task_id):
    def event_stream():
        last_seq = -1
        while True:
            with tasks_lock:
                t = tasks.get(task_id)
                if t is None:
                    yield f"event: error\ndata: {json.dumps({'error':'task not found'})}\n\n"
                    break
                seq = t.get("seq", 0)
                # if seq changed, push update
                if seq != last_seq:
                    last_seq = seq
                    data = {"status": t.get("status"), "partial": t.get("partial"), "logs": t.get("logs")[-20:]}
                    try:
                        yield f"event: update\ndata: {json.dumps(data)}\n\n"
                    except Exception:
                        # ensure JSON serializable
                        yield f"event: update\ndata: {{}}\n\n"
                if t.get("status") in ("finished","error","cancelled"):
                    # send finished with result (if present)
                    try:
                        yield f"event: finished\ndata: {json.dumps(t.get('result') or {})}\n\n"
                    except Exception:
                        yield f"event: finished\ndata: {{}}\n\n"
                    break
            time.sleep(0.8)
    return Response(event_stream(), mimetype="text/event-stream")

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

# Optional small endpoint to expose config (used by frontend to know duration)
@app.route("/_survey_config")
def survey_config():
    return jsonify({"IPERF_DURATION": IPERF_DURATION, "IPERF_PARALLEL": IPERF_PARALLEL, "SERVER_IP": SERVER_IP})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)