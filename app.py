#!/usr/bin/env python3
# app.py — WiFi Survey Flask Application
# Enhanced timeseries with stage tracking (t, dl, ul, ping, stage) for live display and export.
# Each stage (ping, download, upload) tracks time independently, resetting to 0 at stage start.

import os
import csv
import json
import uuid
import threading
import subprocess
import re
import time
import logging
import configparser
import copy
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template, abort, Response
from flask_cors import CORS
from validation import Validator, ValidationError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Safety limits for process output
MAX_LINES_PER_SECOND = 10  # Maximum expected lines per second for ping output
MAX_OUTPUT_LINES = 1000     # Maximum lines to process from iperf3 output

# Load configuration
def load_config():
    """Load configuration from config.local.ini or config.ini"""
    config = configparser.ConfigParser()
    config_files = ['config.local.ini', 'config.ini']
    
    for config_file in config_files:
        if os.path.exists(config_file):
            logger.info(f"Loading configuration from {config_file}")
            config.read(config_file)
            return config
    
    logger.warning("No configuration file found, using defaults")
    # Return default config
    config['server'] = {
        'ip': '192.168.1.10',
        'flask_host': '0.0.0.0',
        'flask_port': '5000'
    }
    config['iperf'] = {
        'duration': '20',
        'parallel': '4'
    }
    config['paths'] = {
        'raw_results': 'raw_results',
        'csv_file': 'wifi_survey_results.csv'
    }
    return config

# Load configuration
config = load_config()

# Configuration values with validation
APP_DIR = os.path.abspath(os.path.dirname(__file__))
RAW_DIR = os.path.join(APP_DIR, config.get('paths', 'raw_results', fallback='raw_results'))
CSV_FILE = os.path.join(APP_DIR, config.get('paths', 'csv_file', fallback='wifi_survey_results.csv'))

SERVER_IP = config.get('server', 'ip', fallback='192.168.1.10')
IPERF_DURATION = config.getint('iperf', 'duration', fallback=20)
IPERF_PARALLEL = config.getint('iperf', 'parallel', fallback=4)
FLASK_HOST = config.get('server', 'flask_host', fallback='0.0.0.0')
FLASK_PORT = config.getint('server', 'flask_port', fallback=5000)

# Validate configuration
if IPERF_DURATION < 1 or IPERF_DURATION > 300:
    logger.warning(f"Invalid iperf duration {IPERF_DURATION}, using default 20")
    IPERF_DURATION = 20

if IPERF_PARALLEL < 1 or IPERF_PARALLEL > 16:
    logger.warning(f"Invalid iperf parallel {IPERF_PARALLEL}, using default 4")
    IPERF_PARALLEL = 4

logger.info(f"Server IP: {SERVER_IP}")
logger.info(f"iperf duration: {IPERF_DURATION}s, parallel streams: {IPERF_PARALLEL}")

os.makedirs(RAW_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CSV_HEADER = ["device","point_id","timestamp","ssid","bssid","frequency_mhz","rssi_dbm","link_speed_mbps","iperf_dl_mbps","iperf_ul_mbps","ping_avg_ms","ping_jitter_ms","ping_loss_pct","test_duration_s","notes"]
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline='') as f:
        csv.writer(f).writerow(CSV_HEADER)

tasks = {}
tasks_lock = threading.Lock()

def run_cmd(cmd, timeout=300, retries=0):
    """Run command with optional retry logic"""
    attempt = 0
    max_attempts = retries + 1
    
    while attempt < max_attempts:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return r.stdout, r.stderr, r.returncode
        except subprocess.TimeoutExpired:
            attempt += 1
            if attempt >= max_attempts:
                return "", "timeout after retries", -1
            logger.warning(f"Command timeout, retry {attempt}/{retries}")
            time.sleep(1)
        except Exception as e:
            attempt += 1
            if attempt >= max_attempts:
                return "", str(e), -1
            logger.warning(f"Command error: {e}, retry {attempt}/{retries}")
            time.sleep(1)
    
    return "", "max retries exceeded", -1

def parse_ping_time(line):
    """Parse ping time from ping output line."""
    m = re.search(r'time=([\d\.]+)', line)
    if m:
        try:
            return float(m.group(1))
        except (ValueError, TypeError):
            return None
    return None

def _percentile(values, p):
    """Calculate percentile value from a list of values."""
    if not values:
        return None
    arr = sorted(values)
    k = (len(arr)-1) * (p/100.0)
    f = int(k)
    c = min(f+1, len(arr)-1)
    if f == c:
        return arr[int(k)]
    return arr[f] * (c-k) + arr[c] * (k-f)

def worker_run_point(task_id, device, point, run_index, duration, parallel):
    with tasks_lock:
        tasks[task_id] = tasks.get(task_id, {})
        tasks[task_id]["status"] = "running"
        tasks[task_id]["partial"] = {
            "dl_mbps": 0.0, "ul_mbps": 0.0,
            "ping_avg_ms": None, "ping_jitter_ms": None,
            "ping_p50_ms": None, "ping_p95_ms": None, "ping_loss_pct": None,
            "progress_pct": 0, "elapsed_s": 0, "stage": "ping"
        }
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
        tasks[task_id]["logs"] = tasks[task_id].get("logs", []) + [f"Task {task_id} started: {point} run:{run_index}"]
        tasks[task_id]["samples"] = []  # timeseries t, dl, ul, ping, stage
        tasks[task_id]["_last_sample_ts"] = 0.0
        tasks[task_id]["_stage_start_ts"] = 0.0

    start_ts = time.time()
    stage_start_ts = start_ts

    # Verificar conectividad con el servidor antes de iniciar
    try:
        ping_check = subprocess.run(
            ["ping", "-c", "1", "-W", "2", SERVER_IP],
            capture_output=True,
            timeout=3
        )
        if ping_check.returncode != 0:
            with tasks_lock:
                tasks[task_id]["status"] = "error"
                tasks[task_id]["logs"].append(f"Error: No se puede alcanzar el servidor {SERVER_IP}")
                tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
            logger.error(f"Server {SERVER_IP} is not reachable")
            return
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"Error verificando servidor: {e}")
        logger.warning(f"Server check failed: {e}")

    # Intentar metadata WiFi (no bloqueante)
    wifi_json = {}
    try:
        wifi_out, _, _ = run_cmd("termux-wifi-connectioninfo", timeout=4)
        wifi_json = json.loads(wifi_out) if wifi_out else {}
    except (json.JSONDecodeError, ValueError, OSError) as e:
        logger.debug(f"Could not get WiFi info: {e}")
        wifi_json = {}

    expected_pings = max(1, int(duration))

    def update_partial(dl=None, ul=None, ping_vals=None, progress=None, note=None, force_sample=False, stage=None):
        """
        Update partial results and track stage-specific timing.
        
        When stage changes (ping -> download -> upload), the elapsed time resets to 0
        for that new stage. This allows the live chart to show each stage independently
        with its own time axis (0 to duration seconds) rather than cumulative time.
        """
        nonlocal stage_start_ts
        now = time.time()
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
                except (ZeroDivisionError, ValueError, TypeError):
                    loss = None
                partial["ping_avg_ms"] = avg
                partial["ping_jitter_ms"] = jitter
                partial["ping_p50_ms"] = p50
                partial["ping_p95_ms"] = p95
                partial["ping_loss_pct"] = loss
            if progress is not None:
                partial["progress_pct"] = int(progress)
            
            # Update stage if provided
            if stage is not None:
                partial["stage"] = stage
                tasks[task_id]["_stage_start_ts"] = now
                stage_start_ts = now
            
            # Calculate elapsed time relative to current stage
            current_stage_start = tasks[task_id].get("_stage_start_ts") or start_ts
            stage_elapsed = int(now - current_stage_start)
            partial["elapsed_s"] = stage_elapsed
            
            if note:
                tasks[task_id]["logs"].append(note)

            # Append sample (máx ~10 Hz): cada 0.1s o si force_sample
            last_s = tasks[task_id].get("_last_sample_ts") or 0.0
            if force_sample or (now - last_s >= 0.1):
                # Time relative to current stage
                t_s = round(now - current_stage_start, 2)
                sample = {
                    "t": t_s,
                    "dl": partial.get("dl_mbps"),
                    "ul": partial.get("ul_mbps"),
                    "ping": partial.get("ping_avg_ms"),
                    "stage": partial.get("stage", "unknown")
                }
                tasks[task_id]["samples"].append(sample)
                tasks[task_id]["_last_sample_ts"] = now

            tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1

    ping_samples = []
    def ping_worker():
        try:
            # Set stage to ping at the beginning
            update_partial(stage="ping", note="Starting ping test", force_sample=True)
            
            p = subprocess.Popen(["ping", "-c", str(int(duration)), SERVER_IP],
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            line_count = 0
            for line in p.stdout:
                line = line.strip()
                t = parse_ping_time(line)
                if t is not None:
                    ping_samples.append(t)
                    update_partial(ping_vals=ping_samples, force_sample=True)
                line_count += 1
                # Safety check: don't process too many lines
                if line_count > duration * MAX_LINES_PER_SECOND:
                    with tasks_lock:
                        tasks[task_id]["logs"].append("Warning: ping output excessive, stopping")
                    p.terminate()
                    break
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            with tasks_lock:
                tasks[task_id]["logs"].append("ping timed out")
            try:
                p.kill()
            except (OSError, ProcessLookupError):
                pass
        except Exception as e:
            with tasks_lock:
                tasks[task_id]["logs"].append(f"ping error: {e}")

    ping_thread = threading.Thread(target=ping_worker, daemon=True)
    ping_thread.start()

    # iperf3 DL
    dl_mbps_final = 0.0
    try:
        # Set stage to download at the beginning
        update_partial(stage="download", note="Starting download test", force_sample=True)
        
        cmd_dl = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)}"
        p = subprocess.Popen(cmd_dl, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        line_count = 0
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(dl=val)
                except (ValueError, TypeError):
                    pass
            if line:
                with tasks_lock:
                    tasks[task_id]["logs"].append(line if len(line) < 1000 else line[:1000])
            line_count += 1
            # Safety limit on lines processed
            if line_count > MAX_OUTPUT_LINES:
                with tasks_lock:
                    tasks[task_id]["logs"].append("Warning: iperf DL output excessive")
                break
        
        # Wait with timeout
        try:
            p.wait(timeout=duration + 10)
        except subprocess.TimeoutExpired:
            with tasks_lock:
                tasks[task_id]["logs"].append("iperf3 DL timed out")
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()

        # Get final result with JSON
        dl_out, _, _ = run_cmd(f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} --json", timeout=10)
        try:
            j = json.loads(dl_out) if dl_out else {}
            dl_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            dl_mbps_final = round(dl_bps / 1_000_000, 2) if dl_bps else tasks[task_id]["partial"].get("dl_mbps", 0.0)
        except (json.JSONDecodeError, ValueError, TypeError, KeyError):
            dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
        update_partial(dl=dl_mbps_final, force_sample=True)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 DL error: {e}")

    # iperf3 UL (reverse)
    ul_mbps_final = 0.0
    try:
        # Set stage to upload at the beginning
        update_partial(stage="upload", note="Starting upload test", force_sample=True)
        
        cmd_ul = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)} -R"
        p = subprocess.Popen(cmd_ul, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        line_count = 0
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(ul=val)
                except (ValueError, TypeError):
                    pass
            if line:
                with tasks_lock:
                    tasks[task_id]["logs"].append(line if len(line) < 1000 else line[:1000])
            line_count += 1
            # Safety limit on lines processed
            if line_count > MAX_OUTPUT_LINES:
                with tasks_lock:
                    tasks[task_id]["logs"].append("Warning: iperf UL output excessive")
                break
        
        # Wait with timeout
        try:
            p.wait(timeout=duration + 10)
        except subprocess.TimeoutExpired:
            with tasks_lock:
                tasks[task_id]["logs"].append("iperf3 UL timed out")
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()

        # Get final result with JSON
        ul_out, _, _ = run_cmd(f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} -R --json", timeout=10)
        try:
            j = json.loads(ul_out) if ul_out else {}
            ul_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                      or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
            ul_mbps_final = round(ul_bps / 1_000_000, 2) if ul_bps else tasks[task_id]["partial"].get("ul_mbps", 0.0)
        except (json.JSONDecodeError, ValueError, TypeError, KeyError):
            ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
        update_partial(ul=ul_mbps_final, force_sample=True)
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"iperf3 UL error: {e}")

    try:
        ping_thread.join(timeout=duration + 5)
        if ping_thread.is_alive():
            with tasks_lock:
                tasks[task_id]["logs"].append("Warning: ping thread did not finish in time")
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["logs"].append(f"Error joining ping thread: {e}")

    with tasks_lock:
        partial_ping = tasks[task_id].get("partial", {})
        samples = tasks[task_id].get("samples", [])
        # clamp size of samples if needed (optional)

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
        "ping_avg_ms": partial_ping.get("ping_avg_ms"),
        "ping_jitter_ms": partial_ping.get("ping_jitter_ms"),
        "ping_p50_ms": partial_ping.get("ping_p50_ms"),
        "ping_p95_ms": partial_ping.get("ping_p95_ms"),
        "ping_loss_pct": partial_ping.get("ping_loss_pct"),
        "duration_s": duration,
        "samples": samples  # << incluir timeseries
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
    """Execute a single point measurement"""
    try:
        payload = request.json or {}
        
        # Validate inputs using centralized validator
        try:
            validated = Validator.validate_run_point_payload(
                payload,
                defaults={
                    "device": "phone",
                    "point": "P1",
                    "run": 1,
                    "duration": IPERF_DURATION,
                    "parallel": IPERF_PARALLEL
                }
            )
        except ValidationError as ve:
            logger.warning(f"Validation error in run_point: {ve.message}")
            return jsonify(ve.to_dict()), 400
        
        device = validated["device"]
        point = validated["point"]
        run_index = validated["run"]
        duration = validated["duration"]
        parallel = validated["parallel"]
        
        task_id = str(uuid.uuid4())
        with tasks_lock:
            tasks[task_id] = {
                "status": "queued",
                "total": 1,
                "done": 0,
                "logs": [],
                "results": [],
                "partial": {},
                "seq": 0
            }
        
        t = threading.Thread(
            target=worker_run_point,
            args=(task_id, device, point, run_index, duration, parallel),
            daemon=True
        )
        t.start()
        logger.info(f"Started point measurement: {point}, task_id: {task_id}")
        return jsonify({"ok": True, "task_id": task_id})
    
    except Exception as e:
        logger.error(f"Error in run_point: {e}", exc_info=True)
        return jsonify({
            "ok": False,
            "error": "Error interno del servidor. Por favor, inténtalo de nuevo."
        }), 500

@app.route("/start_survey", methods=["POST"])
def start_survey():
    """Start a survey with multiple measurement points"""
    try:
        payload = request.json or {}
        
        # Validate inputs using centralized validator
        try:
            validated = Validator.validate_start_survey_payload(
                payload,
                defaults={
                    "device": "phone",
                    "repeats": 1
                }
            )
        except ValidationError as ve:
            logger.warning(f"Validation error in start_survey: {ve.message}")
            return jsonify(ve.to_dict()), 400
        
        device = validated["device"]
        validated_points = validated["points"]
        repeats = validated["repeats"]
        manual = validated["manual"]
        
        parent_id = str(uuid.uuid4())
        with tasks_lock:
            tasks[parent_id] = {
                "status": "queued",
                "total": len(validated_points) * repeats,
                "done": 0,
                "logs": [],
                "results": [],
                "partial": {},
                "seq": 0,
                "cancel": False,
                "waiting": False,
                "proceed": False
            }
        
        # Helper function to propagate partial updates from child to parent
        # Defined outside the loop to avoid closure issues
        def make_propagate_partial_updates(parent_id):
            """Factory function to create propagation worker for a child task"""
            def propagate_partial_updates(child_id):
                """Copy partial data from child task to parent task for live updates"""
                try:
                    while True:
                        time.sleep(0.3)  # Update every 300ms
                        with tasks_lock:
                            child = tasks.get(child_id)
                            if not child:
                                break
                            if child.get("status") in ("finished", "error", "cancelled"):
                                break
                            # Copy partial data from child to parent (deep copy for nested dicts)
                            if child.get("partial"):
                                tasks[parent_id]["partial"] = copy.deepcopy(child["partial"])
                                tasks[parent_id]["seq"] = tasks[parent_id].get("seq", 0) + 1
                            # Copy samples if available (deep copy to avoid concurrent modification)
                            if child.get("samples"):
                                tasks[parent_id]["samples"] = copy.deepcopy(child["samples"])
                except Exception as e:
                    logger.error(f"Error in propagate_partial_updates: {e}")
            return propagate_partial_updates
        
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
                        tasks[child_id] = {"status":"queued", "total":1, "done":0, "logs":[], "results": [], "partial": {}, "seq": 0, "samples": []}
                        # Log which point is starting
                        tasks[p_id]["logs"].append(f"Starting point {pt} (run {rep+1})")
                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                    
                    # Create and start propagation thread
                    propagate_func = make_propagate_partial_updates(p_id)
                    propagate_thread = threading.Thread(
                        target=propagate_func,
                        args=(child_id,),
                        daemon=True
                    )
                    propagate_thread.start()
                    
                    # Execute the point measurement
                    worker_run_point(child_id, device, pt, rep+1, IPERF_DURATION, IPERF_PARALLEL)
                    
                    # Give the propagation thread time to finish (increased timeout to ensure completion)
                    propagate_thread.join(timeout=5)
                    if propagate_thread.is_alive():
                        logger.warning(f"Propagation thread for {child_id} did not finish in time")
                    
                    with tasks_lock:
                        child_result = tasks[child_id].get("result")
                        if child_result:
                            tasks[p_id]["results"].append(child_result)
                            tasks[p_id]["done"] += 1
                            tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                            tasks[p_id]["logs"].append(f"Point done: {pt} ({tasks[p_id]['done']}/{tasks[p_id]['total']})")
                        # Clear partial data after point is done so it doesn't persist to next point
                        tasks[p_id]["partial"] = {}
                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
            with tasks_lock:
                tasks[p_id]["status"] = "finished"
                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                tasks[p_id]["logs"].append("Survey finished")
        
        t = threading.Thread(
            target=survey_worker,
            args=(parent_id, device, validated_points, repeats, manual),
            daemon=True
        )
        t.start()
        logger.info(f"Started survey: {len(validated_points)} points, {repeats} repeats, task_id: {parent_id}")
        return jsonify({"ok": True, "task_id": parent_id})
    
    except Exception as e:
        logger.error(f"Error in start_survey: {e}", exc_info=True)
        return jsonify({
            "ok": False,
            "error": "Error interno del servidor. Por favor, inténtalo de nuevo."
        }), 500

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
                    data = {"status": t.get("status"), "partial": t.get("partial"), "logs": t.get("logs")[-20:], "done": t.get("done"), "total": t.get("total")}
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
    """Return current survey configuration"""
    return jsonify({
        "IPERF_DURATION": IPERF_DURATION,
        "IPERF_PARALLEL": IPERF_PARALLEL,
        "SERVER_IP": SERVER_IP
    })

@app.route("/_health")
def health_check():
    """Health check endpoint - verify connectivity and dependencies"""
    health = {
        "status": "ok",
        "checks": {},
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Check server connectivity
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "2", SERVER_IP],
            capture_output=True,
            timeout=3
        )
        health["checks"]["server_reachable"] = result.returncode == 0
    except Exception as e:
        health["checks"]["server_reachable"] = False
        health["checks"]["server_error"] = str(e)
    
    # Check iperf3 availability
    try:
        result = subprocess.run(
            ["which", "iperf3"],
            capture_output=True,
            timeout=2
        )
        health["checks"]["iperf3_available"] = result.returncode == 0
    except Exception:
        health["checks"]["iperf3_available"] = False
    
    # Check termux-api (if running on Android)
    try:
        result = subprocess.run(
            ["which", "termux-wifi-connectioninfo"],
            capture_output=True,
            timeout=2
        )
        health["checks"]["termux_api_available"] = result.returncode == 0
    except Exception:
        health["checks"]["termux_api_available"] = False

    # Overall status
    if not health["checks"].get("server_reachable") or not health["checks"].get("iperf3_available"):
        health["status"] = "degraded"

    return jsonify(health)


if __name__ == "__main__":
    logger.info(f"Starting WiFi Survey application on {FLASK_HOST}:{FLASK_PORT}")
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False)
