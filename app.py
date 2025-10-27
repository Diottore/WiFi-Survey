#!/usr/bin/env python3
# app.py - Flask web UI mejorada para encuesta WiFi en Termux
# Añadido: ejecución de pruebas en background y SSE para updates parciales
# Mejora: métricas de ping adicionales (p50, p95, pérdida %) en parciales y resultado final.

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

# --- CONFIGURACIÓN ---
SERVER_IP = "192.168.1.10"
IPERF_DURATION = 20
IPERF_PARALLEL = 4
# ---------------------

os.makedirs(RAW_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CSV_HEADER = ["device","point_id","timestamp","ssid","bssid","frequency_mhz","rssi_dbm","link_speed_mbps","iperf_dl_mbps","iperf_ul_mbps","ping_avg_ms","ping_jitter_ms","ping_loss_pct","test_duration_s","notes"]
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)

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
    m = re.search(r'time=([\d\.]+)', line)
    if m:
        try:
            return float(m.group(1))
        except:
            return None
    return None

def _percentile(values, p):
    if not values:
        return None
    arr = sorted(values)
    k = (len(arr)-1) * (p/100.0)
    f = int(k)
    c = min(f+1, len(arr)-1)
    if f == c:
        return arr[int(k)]
    d0 = arr[f] * (c-k)
    d1 = arr[c] * (k-f)
    return d0 + d1

def worker_run_point(task_id, device, point, run_index, duration, parallel):
    with tasks_lock:
        tasks[task_id] = tasks.get(task_id, {})
        tasks[task_id]["status"] = "running"
        tasks[task_id]["partial"] = {
            "dl_mbps": 0.0, "ul_mbps": 0.0,
            "ping_avg_ms": None, "ping_jitter_ms": None,
            "ping_p50_ms": None, "ping_p95_ms": None, "ping_loss_pct": None,
            "progress_pct": 0, "elapsed_s": 0
        }
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
        tasks[task_id].setdefault("logs", []).append(f"Task {task_id} started: {point} run:{run_index}")

    start_ts = time.time()

    wifi_out, wifi_err, code = run_cmd("termux-wifi-connectioninfo")
    try:
        wifi_json = json.loads(wifi_out) if wifi_out else {}
    except:
        wifi_json = {}

    expected_pings = max(1, int(duration))  # para pérdida %

    def update_partial(dl=None, ul=None, ping_vals=None, progress=None, note=None):
        with tasks_lock:
            partial = tasks[task_id].setdefault("partial", {})
            if dl is not None:
                partial["dl_mbps"] = float(dl)
            if ul is not None:
                partial["ul_mbps"] = float(ul)
            if ping_vals is not None:
                times = ping_vals
                avg = sum(times)/len(times) if times else None
                jitter = None
                if len(times) > 1:
                    diffs = [abs(times[i] - times[i-1]) for i in range(1, len(times))]
                    jitter = sum(diffs)/len(diffs)
                p50 = _percentile(times, 50) if times else None
                p95 = _percentile(times, 95) if times else None
                loss = None
                try:
                    loss = max(0.0, min(100.0, round((1.0 - (len(times)/expected_pings))*100.0, 2)))
                except:
                    loss = None
                partial["ping_avg_ms"] = avg
                partial["ping_jitter_ms"] = jitter
                partial["ping_p50_ms"] = p50
                partial["ping_p95_ms"] = p95
                partial["ping_loss_pct"] = loss
            if progress is not None:
                partial["progress_pct"] = int(progress)
            partial["elapsed_s"] = int(time.time() - start_ts)
            tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
            if note:
                tasks[task_id]["logs"].append(note)

    ping_samples = []
    def ping_worker():
        try:
            p = subprocess.Popen(["ping", "-c", str(int(duration)), SERVER_IP], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in p.stdout:
                line = line.strip()
                t = parse_ping_times_from_output_line(line)
                if t is not None:
                    ping_samples.append(t)
                    update_partial(ping_vals=ping_samples)
            p.wait()
        except Exception as e:
            with tasks_lock:
                tasks[task_id]["logs"].append(f"ping error: {e}")

    ping_thread = threading.Thread(target=ping_worker, daemon=True)
    ping_thread.start()

    dl_mbps_final = 0.0
    try:
        cmd_dl = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)}"
        p = subprocess.Popen(cmd_dl, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(dl=val)
                except:
                    pass
            if line:
                with tasks_lock:
                    tasks[task_id]["logs"].append(line if len(line) < 1000 else line[:1000])
        p.wait()
        dl_out, dl_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} --json", timeout=10)
        try:
            j = json.loads(dl_out) if dl_out else {}
            dl_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            dl_mbps_final = round(dl_bps / 1_000_000, 2) if dl_bps else tasks[task_id]["partial"].get("dl_mbps", 0.0)
        except:
            dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
        update_partial(dl=dl_mbps_final)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 DL error: {e}")

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
        ul_out, ul_err, code = run_cmd(f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} -R --json", timeout=10)
        try:
            j = json.loads(ul_out) if ul_out else {}
            ul_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            ul_mbps_final = round(ul_bps / 1_000_000, 2) if ul_bps else tasks[task_id]["partial"].get("ul_mbps", 0.0)
        except:
            ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
        update_partial(ul=ul_mbps_final)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 UL error: {e}")

    try:
        ping_thread.join(timeout=2)
    except:
        pass

    # Calcular métricas finales de ping (en caso de que no hayan quedado actualizadas)
    with tasks_lock:
        partial_ping = tasks[task_id].get("partial", {})
        ping_avg_ms = partial_ping.get("ping_avg_ms")
        ping_jitter_ms = partial_ping.get("ping_jitter_ms")
        ping_p50_ms = partial_ping.get("ping_p50_ms")
        ping_p95_ms = partial_ping.get("ping_p95_ms")
        ping_loss_pct = partial_ping.get("ping_loss_pct")

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
        "ping_avg_ms": ping_avg_ms,
        "ping_jitter_ms": ping_jitter_ms,
        "ping_p50_ms": ping_p50_ms,
        "ping_p95_ms": ping_p95_ms,
        "ping_loss_pct": ping_loss_pct,
        "duration_s": duration
    }

    raw_file = os.path.join(RAW_DIR, f"{point}_{run_index}_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json")
    try:
        with open(raw_file, "w") as f:
            json.dump({"wifi": wifi_json, "partial": tasks[task_id].get("partial",{}), "final": final}, f, indent=2)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"Error saving raw: {e}")

    try:
        with open(CSV_FILE, "a", newline='') as f:
            writer = csv.writer(f)
            writer.writerow([device, point, timestamp, final["ssid"], final["bssid"], final["frequency"], final["rssi"], final["link_speed"], final["iperf_dl_mbps"], final["iperf_ul_mbps"], final["ping_avg_ms"], final["ping_jitter_ms"], final["ping_loss_pct"], duration, f"run:{run_index}"])
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"CSV write error: {e}")

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

@app.route("/start_survey", methods=["POST"])
def start_survey():
    payload = request.json or {}
    device = payload.get("device", "phone")
    points = payload.get("points", [])
    repeats = int(payload.get("repeats", 1))
    manual = bool(payload.get("manual", False))
    if isinstance(points, str):
        points = points.split() if points.strip() else []
    if not points:
        return jsonify({"ok": False, "error": "no points provided"}), 400

    parent_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[parent_id] = {"status":"queued", "total": len(points)*repeats, "done":0, "logs":[], "results": [], "partial": {}, "seq": 0, "cancel": False, "waiting": False, "proceed": False}

    def survey_worker(p_id, device, points, repeats, manual):
        with tasks_lock:
            tasks[p_id]["status"] = "running"
            tasks[p_id]["logs"].append(f"Survey started: {points} repeats:{repeats} manual:{manual}")
        for rep in range(repeats):
            for pt in points:
                with tasks_lock:
                    if tasks[p_id].get("cancel"):
                        tasks[p_id]["status"] = "cancelled"
                        tasks[p_id]["logs"].append("Survey cancelled")
                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                        return
                if manual:
                    with tasks_lock:
                        tasks[p_id]["waiting"] = True
                        tasks[p_id]["logs"].append(f"Waiting at point {pt}")
                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                    while True:
                        time.sleep(0.5)
                        with tasks_lock:
                            if tasks[p_id].get("cancel"):
                                tasks[p_id]["status"] = "cancelled"
                                tasks[p_id]["logs"].append("Survey cancelled during wait")
                                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                return
                            if tasks[p_id].get("proceed"):
                                tasks[p_id]["proceed"] = False
                                tasks[p_id]["waiting"] = False
                                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                break
                child_id = str(uuid.uuid4())
                with tasks_lock:
                    tasks[child_id] = {"status":"queued", "total":1, "done":0, "logs":[], "results": [], "partial": {}, "seq": 0}
                worker_run_point(child_id, device, pt, rep+1, IPERF_DURATION, IPERF_PARALLEL)
                with tasks_lock:
                    child_result = tasks[child_id].get("result")
                    if child_result:
                        tasks[p_id]["results"].append(child_result)
                        tasks[p_id]["done"] += 1
                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                        tasks[p_id]["logs"].append(f"Point done: {pt} ({tasks[p_id]['done']}/{tasks[p_id]['total']})")
        with tasks_lock:
            tasks[p_id]["status"] = "finished"
            tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
            tasks[p_id]["logs"].append("Survey finished")
        return

    t = threading.Thread(target=survey_worker, args=(parent_id, device, points, repeats, manual), daemon=True)
    t.start()
    return jsonify({"ok": True, "task_id": parent_id})

@app.route("/task_proceed/<task_id>", methods=["POST"])
def task_proceed(task_id):
    with tasks_lock:
        t = tasks.get(task_id)
        if not t:
            return jsonify({"ok": False, "error": "task not found"}), 404
        t["proceed"] = True
        t["seq"] = t.get("seq", 0) + 1
    return jsonify({"ok": True})

@app.route("/task_cancel/<task_id>", methods=["POST"])
def task_cancel(task_id):
    with tasks_lock:
        t = tasks.get(task_id)
        if not t:
            return jsonify({"ok": False, "error": "task not found"}), 404
        t["cancel"] = True
        t["seq"] = t.get("seq", 0) + 1
    return jsonify({"ok": True})

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
                if seq != last_seq:
                    last_seq = seq
                    data = {"status": t.get("status"), "partial": t.get("partial"), "logs": t.get("logs")[-20:], "done": t.get("done"), "total": t.get("total"), "results": t.get("results", [])}
                    yield f"event: update\ndata: {json.dumps(data)}\n\n"
                if t.get("status") in ("finished","error","cancelled"):
                    payload = t.get("result") if t.get("result") else t.get("results", [])
                    yield f"event: finished\ndata: {json.dumps(payload)}\n\n"
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

@app.route("/_survey_config")
def survey_config():
    return jsonify({"IPERF_DURATION": IPERF_DURATION, "IPERF_PARALLEL": IPERF_PARALLEL, "SERVER_IP": SERVER_IP})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)