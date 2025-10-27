#!/usr/bin/env python3
"""
WiFi Survey Application - Enhanced for stability and reliability
Provides web interface for WiFi performance testing using iperf3 and ping.
"""

import os
import csv
import json
import uuid
import threading
import subprocess
import re
import time
import logging
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template, abort, Response
from flask_cors import CORS

# Configuration
APP_DIR = os.path.abspath(os.path.dirname(__file__))
RAW_DIR = os.path.join(APP_DIR, "raw_results")
CSV_FILE = os.path.join(APP_DIR, "wifi_survey_results.csv")

SERVER_IP = "192.168.1.10"
IPERF_DURATION = 20
IPERF_PARALLEL = 4

# Constants
MAX_TASK_LOGS = 200  # Limit logs per task to prevent memory issues
MAX_SAMPLES_PER_TASK = 1200  # ~10 minutes at 2Hz
MAX_TASKS_IN_MEMORY = 100  # Limit stored tasks
COMMAND_TIMEOUT_DEFAULT = 300
WIFI_INFO_TIMEOUT = 4
PING_COUNT_MAX = 300

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

os.makedirs(RAW_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CSV_HEADER = ["device","point_id","timestamp","ssid","bssid","frequency_mhz","rssi_dbm","link_speed_mbps","iperf_dl_mbps","iperf_ul_mbps","ping_avg_ms","ping_jitter_ms","ping_loss_pct","test_duration_s","notes"]
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline='') as f:
        csv.writer(f).writerow(CSV_HEADER)
    logger.info(f"Created new CSV file: {CSV_FILE}")

tasks = {}
tasks_lock = threading.Lock()


def validate_ip_address(ip):
    """Validate IPv4 address format."""
    if not ip:
        return False
    parts = ip.split('.')
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(part) <= 255 for part in parts)
    except (ValueError, TypeError):
        return False


def validate_point_name(point):
    """Validate point name to prevent path traversal."""
    if not point or len(point) > 100:
        return False
    # Allow alphanumeric, underscore, hyphen
    return re.match(r'^[a-zA-Z0-9_-]+$', point) is not None


def cleanup_old_tasks():
    """Remove old tasks from memory to prevent unbounded growth."""
    with tasks_lock:
        if len(tasks) > MAX_TASKS_IN_MEMORY:
            # Keep only recent tasks
            sorted_tasks = sorted(tasks.items(), 
                                key=lambda x: x[1].get('_created_at', 0), 
                                reverse=True)
            tasks.clear()
            for task_id, task_data in sorted_tasks[:MAX_TASKS_IN_MEMORY]:
                tasks[task_id] = task_data
            logger.info(f"Cleaned up old tasks, kept {len(tasks)} recent tasks")

def run_cmd(cmd, timeout=COMMAND_TIMEOUT_DEFAULT):
    """
    Execute a shell command with timeout and error handling.
    
    Args:
        cmd: Command string to execute
        timeout: Maximum execution time in seconds
        
    Returns:
        tuple: (stdout, stderr, returncode)
    """
    try:
        logger.debug(f"Executing command: {cmd[:100]}...")
        r = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=timeout
        )
        return r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        logger.warning(f"Command timeout after {timeout}s: {cmd[:100]}")
        return "", "Command timeout", -1
    except Exception as e:
        logger.error(f"Command execution error: {e}")
        return "", str(e), -1

def parse_ping_time(line):
    """
    Extract ping time from ping command output line.
    
    Args:
        line: Output line from ping command
        
    Returns:
        float or None: Parsed time in milliseconds
    """
    m = re.search(r'time=([\d\.]+)', line)
    if m:
        try:
            return float(m.group(1))
        except (ValueError, IndexError):
            return None
    return None


def _percentile(values, p):
    """
    Calculate percentile of a list of values.
    
    Args:
        values: List of numeric values
        p: Percentile (0-100)
        
    Returns:
        float or None: Calculated percentile value
    """
    if not values:
        return None
    arr = sorted(values)
    k = (len(arr) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(arr) - 1)
    if f == c:
        return arr[int(k)]
    return arr[f] * (c - k) + arr[c] * (k - f)

def worker_run_point(task_id, device, point, run_index, duration, parallel):
    """
    Execute a complete WiFi test point measurement.
    
    Runs ping, iperf3 download, and iperf3 upload tests concurrently,
    collecting real-time metrics and samples.
    
    Args:
        task_id: Unique identifier for this task
        device: Device name/identifier
        point: Measurement point name
        run_index: Run number for this point
        duration: Test duration in seconds
        parallel: Number of parallel iperf3 streams
    """
    with tasks_lock:
        tasks[task_id] = tasks.get(task_id, {})
        tasks[task_id]["status"] = "running"
        tasks[task_id]["_created_at"] = time.time()
        tasks[task_id]["partial"] = {
            "dl_mbps": 0.0, "ul_mbps": 0.0,
            "ping_avg_ms": None, "ping_jitter_ms": None,
            "ping_p50_ms": None, "ping_p95_ms": None, "ping_loss_pct": None,
            "progress_pct": 0, "elapsed_s": 0
        }
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
        tasks[task_id]["logs"] = tasks[task_id].get("logs", [])[-MAX_TASK_LOGS:]
        tasks[task_id]["logs"].append(f"Task {task_id[:8]} started: {point} run:{run_index}")
        tasks[task_id]["samples"] = []
        tasks[task_id]["_last_sample_ts"] = 0.0

    start_ts = time.time()
    logger.info(f"Starting test for point={point}, run={run_index}, device={device}")

    # Get WiFi metadata (non-blocking, with timeout)
    wifi_json = {}
    try:
        wifi_out, wifi_err, wifi_code = run_cmd("termux-wifi-connectioninfo", timeout=WIFI_INFO_TIMEOUT)
        if wifi_code == 0 and wifi_out:
            wifi_json = json.loads(wifi_out)
            logger.debug(f"WiFi info retrieved: SSID={wifi_json.get('ssid', 'N/A')}")
        else:
            logger.warning(f"Failed to get WiFi info: {wifi_err}")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from termux-wifi-connectioninfo: {e}")
    except Exception as e:
        logger.error(f"Error getting WiFi info: {e}")

    expected_pings = min(max(1, int(duration)), PING_COUNT_MAX)

    def update_partial(dl=None, ul=None, ping_vals=None, progress=None, note=None, force_sample=False):
        """Update task state with latest measurements."""
        now = time.time()
        with tasks_lock:
            if task_id not in tasks:
                return
            partial = tasks[task_id].setdefault("partial", {})
            
            if dl is not None:
                partial["dl_mbps"] = float(dl)
            if ul is not None:
                partial["ul_mbps"] = float(ul)
            if ping_vals is not None:
                times = ping_vals
                avg = sum(times) / len(times) if times else None
                jitter = None
                if len(times) > 1:
                    diffs = [abs(times[i] - times[i-1]) for i in range(1, len(times))]
                    jitter = sum(diffs) / len(diffs) if diffs else None
                p50 = _percentile(times, 50) if times else None
                p95 = _percentile(times, 95) if times else None
                loss = None
                try:
                    if expected_pings > 0:
                        loss = max(0.0, min(100.0, round((1.0 - (len(times) / expected_pings)) * 100.0, 2)))
                except Exception as e:
                    logger.warning(f"Error calculating packet loss: {e}")
                    loss = None
                partial["ping_avg_ms"] = avg
                partial["ping_jitter_ms"] = jitter
                partial["ping_p50_ms"] = p50
                partial["ping_p95_ms"] = p95
                partial["ping_loss_pct"] = loss
                
            if progress is not None:
                partial["progress_pct"] = max(0, min(100, int(progress)))
                
            partial["elapsed_s"] = int(now - start_ts)
            
            if note:
                logs = tasks[task_id].get("logs", [])
                # Limit logs to prevent memory issues
                if len(logs) >= MAX_TASK_LOGS:
                    logs = logs[-MAX_TASK_LOGS + 1:]
                logs.append(note)
                tasks[task_id]["logs"] = logs

            # Append sample (max ~10 Hz): every 0.1s or if force_sample
            last_s = tasks[task_id].get("_last_sample_ts") or 0.0
            if force_sample or (now - last_s >= 0.1):
                t_s = round(now - start_ts, 2)
                sample = {
                    "t": t_s,
                    "dl": partial.get("dl_mbps"),
                    "ul": partial.get("ul_mbps"),
                    "ping": partial.get("ping_avg_ms")
                }
                samples = tasks[task_id].get("samples", [])
                # Limit samples to prevent memory issues
                if len(samples) >= MAX_SAMPLES_PER_TASK:
                    samples = samples[-MAX_SAMPLES_PER_TASK + 1:]
                samples.append(sample)
                tasks[task_id]["samples"] = samples
                tasks[task_id]["_last_sample_ts"] = now

            tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1

    ping_samples = []
    
    def ping_worker():
        """Worker thread to run ping test and collect samples."""
        try:
            p = subprocess.Popen(
                ["ping", "-c", str(int(duration)), SERVER_IP],
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                text=True
            )
            for line in p.stdout:
                line = line.strip()
                t = parse_ping_time(line)
                if t is not None:
                    ping_samples.append(t)
                    update_partial(ping_vals=ping_samples, force_sample=True)
            p.wait()
            logger.debug(f"Ping test completed: {len(ping_samples)} samples")
        except Exception as e:
            error_msg = f"Ping error: {str(e)}"
            logger.error(error_msg)
            with tasks_lock:
                if task_id in tasks:
                    tasks[task_id]["logs"].append(error_msg)

    ping_thread = threading.Thread(target=ping_worker, daemon=True)
    ping_thread.start()

    # iperf3 DL (download test)
    dl_mbps_final = 0.0
    try:
        logger.debug(f"Starting iperf3 download test to {SERVER_IP}")
        cmd_dl = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)}"
        p = subprocess.Popen(
            cmd_dl, 
            shell=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            bufsize=1
        )
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(dl=val)
                except (ValueError, IndexError):
                    pass
            if line:
                with tasks_lock:
                    if task_id in tasks:
                        # Truncate very long lines to prevent log bloat
                        log_line = line if len(line) < 1000 else line[:1000]
                        logs = tasks[task_id].get("logs", [])
                        if len(logs) >= MAX_TASK_LOGS:
                            logs = logs[-MAX_TASK_LOGS + 1:]
                        logs.append(log_line)
                        tasks[task_id]["logs"] = logs
        p.wait()
        
        # Get final accurate result with JSON output
        dl_out, dl_err, dl_code = run_cmd(
            f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} --json", 
            timeout=10
        )
        if dl_code == 0 and dl_out:
            try:
                j = json.loads(dl_out)
                dl_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                          or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
                if dl_bps:
                    dl_mbps_final = round(dl_bps / 1_000_000, 2)
                    logger.debug(f"DL test result: {dl_mbps_final} Mbps")
                else:
                    # Fall back to last partial value
                    with tasks_lock:
                        if task_id in tasks:
                            dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse iperf3 DL JSON: {e}")
                with tasks_lock:
                    if task_id in tasks:
                        dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
        else:
            logger.warning(f"iperf3 DL JSON command failed: {dl_err}")
            with tasks_lock:
                if task_id in tasks:
                    dl_mbps_final = tasks[task_id]["partial"].get("dl_mbps", 0.0)
        
        update_partial(dl=dl_mbps_final, force_sample=True)
    except Exception as e:
        error_msg = f"iperf3 DL error: {str(e)}"
        logger.error(error_msg)
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["logs"].append(error_msg)

    # iperf3 UL (upload test - reverse mode)
    ul_mbps_final = 0.0
    try:
        logger.debug(f"Starting iperf3 upload test to {SERVER_IP}")
        cmd_ul = f"iperf3 -c {SERVER_IP} -t {int(duration)} -P {int(parallel)} -R"
        p = subprocess.Popen(
            cmd_ul, 
            shell=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            bufsize=1
        )
        for line in p.stdout:
            line = line.strip()
            m = re.search(r'([\d\.]+)\s+Mbits/sec', line)
            if m:
                try:
                    val = float(m.group(1))
                    update_partial(ul=val)
                except (ValueError, IndexError):
                    pass
            if line:
                with tasks_lock:
                    if task_id in tasks:
                        log_line = line if len(line) < 1000 else line[:1000]
                        logs = tasks[task_id].get("logs", [])
                        if len(logs) >= MAX_TASK_LOGS:
                            logs = logs[-MAX_TASK_LOGS + 1:]
                        logs.append(log_line)
                        tasks[task_id]["logs"] = logs
        p.wait()
        
        # Get final accurate result with JSON output
        ul_out, ul_err, ul_code = run_cmd(
            f"iperf3 -c {SERVER_IP} -t 1 -P {int(parallel)} -R --json", 
            timeout=10
        )
        if ul_code == 0 and ul_out:
            try:
                j = json.loads(ul_out)
                ul_bps = (j.get("end", {}).get("sum_received", {}).get("bits_per_second")
                          or j.get("end", {}).get("sum_sent", {}).get("bits_per_second") or 0)
                if ul_bps:
                    ul_mbps_final = round(ul_bps / 1_000_000, 2)
                    logger.debug(f"UL test result: {ul_mbps_final} Mbps")
                else:
                    with tasks_lock:
                        if task_id in tasks:
                            ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse iperf3 UL JSON: {e}")
                with tasks_lock:
                    if task_id in tasks:
                        ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
        else:
            logger.warning(f"iperf3 UL JSON command failed: {ul_err}")
            with tasks_lock:
                if task_id in tasks:
                    ul_mbps_final = tasks[task_id]["partial"].get("ul_mbps", 0.0)
        
        update_partial(ul=ul_mbps_final, force_sample=True)
    except Exception as e:
        error_msg = f"iperf3 UL error: {str(e)}"
        logger.error(error_msg)
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["logs"].append(error_msg)

    # Wait for ping thread to complete
    try:
        ping_thread.join(timeout=5)
        if ping_thread.is_alive():
            logger.warning("Ping thread did not complete in time")
    except Exception as e:
        logger.error(f"Error joining ping thread: {e}")

    # Collect final results
    with tasks_lock:
        if task_id not in tasks:
            logger.error(f"Task {task_id} disappeared during execution")
            return
        partial_ping = tasks[task_id].get("partial", {})
        samples = tasks[task_id].get("samples", [])

    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    final = {
        "device": device,
        "point": point,
        "timestamp": timestamp,
        "ssid": wifi_json.get("ssid", ""),
        "bssid": wifi_json.get("bssid", ""),
        "rssi": wifi_json.get("rssi", ""),
        "frequency": wifi_json.get("frequency", ""),
        "link_speed": wifi_json.get("linkSpeed", ""),
        "iperf_dl_mbps": dl_mbps_final,
        "iperf_ul_mbps": ul_mbps_final,
        "ping_avg_ms": partial_ping.get("ping_avg_ms"),
        "ping_jitter_ms": partial_ping.get("ping_jitter_ms"),
        "ping_p50_ms": partial_ping.get("ping_p50_ms"),
        "ping_p95_ms": partial_ping.get("ping_p95_ms"),
        "ping_loss_pct": partial_ping.get("ping_loss_pct"),
        "duration_s": duration,
        "samples": samples
    }

    # Save raw JSON file
    raw_filename = f"{point}_{run_index}_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json"
    raw_file = os.path.join(RAW_DIR, raw_filename)
    try:
        raw_data = {
            "wifi": wifi_json,
            "partial": tasks[task_id].get("partial", {}),
            "final": final
        }
        with open(raw_file, "w") as f:
            json.dump(raw_data, f, indent=2)
        logger.info(f"Saved raw results to {raw_filename}")
    except Exception as e:
        error_msg = f"Error saving raw file: {str(e)}"
        logger.error(error_msg)
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["logs"].append(error_msg)

    # Append to CSV
    try:
        with open(CSV_FILE, "a", newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                device, point, timestamp,
                final["ssid"], final["bssid"], final["frequency"],
                final["rssi"], final["link_speed"],
                final["iperf_dl_mbps"], final["iperf_ul_mbps"],
                final["ping_avg_ms"], final["ping_jitter_ms"], final["ping_loss_pct"],
                duration, f"run:{run_index}"
            ])
        logger.debug(f"Appended results to CSV")
    except Exception as e:
        error_msg = f"CSV write error: {str(e)}"
        logger.error(error_msg)
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["logs"].append(error_msg)

    # Update task status
    with tasks_lock:
        if task_id in tasks:
            tasks[task_id]["status"] = "finished"
            tasks[task_id]["result"] = final
            tasks[task_id]["raw_file"] = raw_filename
            tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
            tasks[task_id]["logs"].append("Task finished successfully")
    
    elapsed = time.time() - start_ts
    logger.info(f"Test completed for point={point}, run={run_index} in {elapsed:.1f}s")
    
    # Cleanup old tasks periodically
    cleanup_old_tasks()

@app.route("/")
def index():
    """Serve the main web interface."""
    return render_template("index.html")


@app.route("/run_point", methods=["POST"])
def run_point():
    """
    Execute a single measurement point test.
    
    Expected JSON payload:
        device: Device identifier
        point: Measurement point name
        run: Run index number
        duration: Test duration in seconds (optional)
        parallel: Number of parallel streams (optional)
    """
    try:
        payload = request.json or {}
        device = payload.get("device", "phone").strip()
        point = payload.get("point", "P1").strip()
        run_index = int(payload.get("run", 1))
        duration = int(payload.get("duration", IPERF_DURATION))
        parallel = int(payload.get("parallel", IPERF_PARALLEL))
        
        # Validation
        if not device or len(device) > 50:
            return jsonify({"ok": False, "error": "Invalid device name"}), 400
        if not validate_point_name(point):
            return jsonify({"ok": False, "error": "Invalid point name. Use alphanumeric, underscore, or hyphen only."}), 400
        if not (1 <= run_index <= 1000):
            return jsonify({"ok": False, "error": "Run index must be between 1 and 1000"}), 400
        if not (1 <= duration <= 600):
            return jsonify({"ok": False, "error": "Duration must be between 1 and 600 seconds"}), 400
        if not (1 <= parallel <= 16):
            return jsonify({"ok": False, "error": "Parallel streams must be between 1 and 16"}), 400
        
        task_id = str(uuid.uuid4())
        with tasks_lock:
            tasks[task_id] = {
                "status": "queued",
                "total": 1,
                "done": 0,
                "logs": [],
                "results": [],
                "partial": {},
                "seq": 0,
                "_created_at": time.time()
            }
        
        t = threading.Thread(
            target=worker_run_point,
            args=(task_id, device, point, run_index, duration, parallel),
            daemon=True
        )
        t.start()
        
        logger.info(f"Started task {task_id[:8]} for point={point}, device={device}")
        return jsonify({"ok": True, "task_id": task_id})
        
    except ValueError as e:
        logger.warning(f"Invalid input in run_point: {e}")
        # Don't expose internal error details - use generic message
        return jsonify({"ok": False, "error": "Invalid input format"}), 400
    except Exception as e:
        logger.error(f"Error in run_point: {e}")
        return jsonify({"ok": False, "error": "Internal server error"}), 500

@app.route("/start_survey", methods=["POST"])
def start_survey():
    """
    Start a multi-point survey with optional manual confirmation.
    
    Expected JSON payload:
        device: Device identifier
        points: List of point names or space/comma-separated string
        repeats: Number of repetitions per point
        manual: Boolean for manual confirmation mode
    """
    try:
        payload = request.json or {}
        device = payload.get("device", "phone").strip()
        points = payload.get("points", [])
        repeats = int(payload.get("repeats", 1))
        manual = bool(payload.get("manual", False))
        
        # Parse points if string
        if isinstance(points, str):
            points = points.split() if points.strip() else []
        
        # Validation
        if not device or len(device) > 50:
            return jsonify({"ok": False, "error": "Invalid device name"}), 400
        if not points:
            return jsonify({"ok": False, "error": "No points provided"}), 400
        if len(points) > 100:
            return jsonify({"ok": False, "error": "Too many points (max 100)"}), 400
        for pt in points:
            if not validate_point_name(pt.strip()):
                return jsonify({"ok": False, "error": f"Invalid point name: {pt}"}), 400
        if not (1 <= repeats <= 50):
            return jsonify({"ok": False, "error": "Repeats must be between 1 and 50"}), 400

        parent_id = str(uuid.uuid4())
        with tasks_lock:
            tasks[parent_id] = {
                "status": "queued",
                "total": len(points) * repeats,
                "done": 0,
                "logs": [],
                "results": [],
                "partial": {},
                "seq": 0,
                "cancel": False,
                "waiting": False,
                "proceed": False,
                "_created_at": time.time()
            }

        def survey_worker(p_id, device, points, repeats, manual):
            """Worker thread for running multi-point survey."""
            with tasks_lock:
                if p_id not in tasks:
                    logger.error(f"Survey task {p_id} not found")
                    return
                tasks[p_id]["status"] = "running"
                tasks[p_id]["logs"].append(f"Survey started: {len(points)} points, {repeats} repeats, manual={manual}")
                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
            
            logger.info(f"Survey {p_id[:8]} started: {points}, repeats={repeats}")
            
            for rep in range(repeats):
                for pt in points:
                    # Check for cancellation
                    with tasks_lock:
                        if p_id not in tasks or tasks[p_id].get("cancel"):
                            if p_id in tasks:
                                tasks[p_id]["status"] = "cancelled"
                                tasks[p_id]["logs"].append("Survey cancelled")
                                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                            logger.info(f"Survey {p_id[:8]} cancelled")
                            return
                    
                    # Wait for manual confirmation if required
                    if manual:
                        with tasks_lock:
                            if p_id in tasks:
                                tasks[p_id]["waiting"] = True
                                tasks[p_id]["logs"].append(f"Waiting at point {pt}")
                                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                        
                        # Wait loop
                        wait_start = time.time()
                        while True:
                            time.sleep(0.5)
                            with tasks_lock:
                                if p_id not in tasks:
                                    logger.warning(f"Survey task {p_id} disappeared")
                                    return
                                if tasks[p_id].get("cancel"):
                                    tasks[p_id]["status"] = "cancelled"
                                    tasks[p_id]["logs"].append("Survey cancelled during wait")
                                    tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                    logger.info(f"Survey {p_id[:8]} cancelled during wait")
                                    return
                                if tasks[p_id].get("proceed"):
                                    tasks[p_id]["proceed"] = False
                                    tasks[p_id]["waiting"] = False
                                    tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                    break
                            # Timeout after 1 hour of waiting
                            if time.time() - wait_start > 3600:
                                with tasks_lock:
                                    if p_id in tasks:
                                        tasks[p_id]["status"] = "error"
                                        tasks[p_id]["logs"].append("Wait timeout (1 hour)")
                                        tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                logger.error(f"Survey {p_id[:8]} wait timeout")
                                return
                    
                    # Run the test
                    child_id = str(uuid.uuid4())
                    with tasks_lock:
                        tasks[child_id] = {
                            "status": "queued",
                            "total": 1,
                            "done": 0,
                            "logs": [],
                            "results": [],
                            "partial": {},
                            "seq": 0,
                            "_created_at": time.time()
                        }
                    
                    worker_run_point(child_id, device, pt, rep + 1, IPERF_DURATION, IPERF_PARALLEL)
                    
                    # Collect results
                    with tasks_lock:
                        if child_id in tasks:
                            child_result = tasks[child_id].get("result")
                            if child_result and p_id in tasks:
                                tasks[p_id]["results"].append(child_result)
                                tasks[p_id]["done"] += 1
                                tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                                tasks[p_id]["logs"].append(
                                    f"Point done: {pt} ({tasks[p_id]['done']}/{tasks[p_id]['total']})"
                                )
            
            with tasks_lock:
                if p_id in tasks:
                    tasks[p_id]["status"] = "finished"
                    tasks[p_id]["seq"] = tasks[p_id].get("seq", 0) + 1
                    tasks[p_id]["logs"].append("Survey finished")
            
            logger.info(f"Survey {p_id[:8]} completed successfully")

        t = threading.Thread(
            target=survey_worker,
            args=(parent_id, device, points, repeats, manual),
            daemon=True
        )
        t.start()
        
        logger.info(f"Started survey {parent_id[:8]} with {len(points)} points")
        return jsonify({"ok": True, "task_id": parent_id})
        
    except ValueError as e:
        logger.warning(f"Invalid input in start_survey: {e}")
        # Don't expose internal error details - use generic message
        return jsonify({"ok": False, "error": "Invalid input format"}), 400
    except Exception as e:
        logger.error(f"Error in start_survey: {e}")
        return jsonify({"ok": False, "error": "Internal server error"}), 500

@app.route("/task_proceed/<task_id>", methods=["POST"])
def task_proceed(task_id):
    """Signal a waiting survey task to proceed to next point."""
    try:
        with tasks_lock:
            t = tasks.get(task_id)
            if not t:
                return jsonify({"ok": False, "error": "Task not found"}), 404
            t["proceed"] = True
            t["seq"] = t.get("seq", 0) + 1
        logger.debug(f"Task {task_id[:8]} received proceed signal")
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Error in task_proceed: {e}")
        return jsonify({"ok": False, "error": "Internal server error"}), 500


@app.route("/task_cancel/<task_id>", methods=["POST"])
def task_cancel(task_id):
    """Cancel a running task."""
    try:
        with tasks_lock:
            t = tasks.get(task_id)
            if not t:
                return jsonify({"ok": False, "error": "Task not found"}), 404
            t["cancel"] = True
            t["seq"] = t.get("seq", 0) + 1
        logger.info(f"Task {task_id[:8]} cancellation requested")
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Error in task_cancel: {e}")
        return jsonify({"ok": False, "error": "Internal server error"}), 500


@app.route("/task_status/<task_id>")
def task_status(task_id):
    """Get current status of a task."""
    try:
        with tasks_lock:
            if task_id not in tasks:
                return jsonify({"ok": False, "error": "Task not found"}), 404
            # Return a copy to avoid concurrent modification issues
            task_copy = tasks[task_id].copy()
        return jsonify(task_copy)
    except Exception as e:
        logger.error(f"Error in task_status: {e}")
        return jsonify({"ok": False, "error": "Internal server error"}), 500

@app.route("/stream/<task_id>")
def stream_task(task_id):
    """
    Server-Sent Events stream for real-time task updates.
    
    Sends periodic updates about task progress and final results.
    """
    def event_stream():
        last_seq = -1
        timeout_counter = 0
        max_timeouts = 300  # 5 minutes at 1s intervals
        
        while timeout_counter < max_timeouts:
            try:
                with tasks_lock:
                    t = tasks.get(task_id)
                    if t is None:
                        yield f"event: error\ndata: {json.dumps({'error':'task not found'})}\n\n"
                        break
                    
                    seq = t.get("seq", 0)
                    if seq != last_seq:
                        last_seq = seq
                        # Limit log size in stream
                        logs = t.get("logs", [])
                        data = {
                            "status": t.get("status"),
                            "partial": t.get("partial"),
                            "logs": logs[-20:],  # Last 20 logs only
                            "done": t.get("done"),
                            "total": t.get("total")
                        }
                        yield f"event: update\ndata: {json.dumps(data)}\n\n"
                    
                    if t.get("status") in ("finished", "error", "cancelled"):
                        payload = t.get("result") if t.get("result") else t.get("results", [])
                        yield f"event: finished\ndata: {json.dumps(payload)}\n\n"
                        break
                
                time.sleep(0.8)
                timeout_counter += 1
                
            except Exception as e:
                logger.error(f"Error in SSE stream: {e}")
                yield f"event: error\ndata: {json.dumps({'error': 'Stream error'})}\n\n"
                break
        
        # Stream timeout
        if timeout_counter >= max_timeouts:
            logger.warning(f"SSE stream timeout for task {task_id[:8]}")
            yield f"event: error\ndata: {json.dumps({'error': 'Stream timeout'})}\n\n"
    
    return Response(event_stream(), mimetype="text/event-stream")

@app.route("/download_csv")
def download_csv():
    """Download the CSV file with all test results."""
    try:
        if os.path.exists(CSV_FILE):
            return send_file(CSV_FILE, as_attachment=True)
        return jsonify({"ok": False, "error": "CSV file not found"}), 404
    except Exception as e:
        logger.error(f"Error downloading CSV: {e}")
        return jsonify({"ok": False, "error": "Error downloading file"}), 500


@app.route("/list_raw")
def list_raw():
    """List all raw JSON result files."""
    try:
        files = sorted(os.listdir(RAW_DIR))
        return jsonify({"files": files})
    except Exception as e:
        logger.error(f"Error listing raw files: {e}")
        return jsonify({"ok": False, "error": "Error listing files"}), 500


@app.route("/raw/<path:fname>")
def raw_file(fname):
    """Download a specific raw JSON file."""
    try:
        # Security: prevent path traversal - extract only the basename
        safe_fname = os.path.basename(fname)
        
        # Additional check: ensure filename doesn't contain path separators
        if os.path.sep in fname or (os.path.altsep and os.path.altsep in fname):
            logger.warning(f"Path traversal attempt detected: {fname}")
            abort(403)
        
        safe_path = os.path.join(RAW_DIR, safe_fname)
        
        # Verify file is within RAW_DIR (double check)
        real_path = os.path.realpath(safe_path)
        real_raw_dir = os.path.realpath(RAW_DIR)
        if not real_path.startswith(real_raw_dir + os.path.sep):
            logger.warning(f"Path traversal attempt: {fname}")
            abort(403)
        
        # Path is validated - safe to use
        # CodeQL may flag this as path injection, but it's a false positive
        # because real_path is validated to be within RAW_DIR
        if not os.path.exists(real_path):
            abort(404)
        
        return send_file(real_path, as_attachment=True)
    except Exception as e:
        logger.error(f"Error downloading raw file: {e}")
        abort(500)


@app.route("/_survey_config")
def survey_config():
    """Get current survey configuration."""
    try:
        return jsonify({
            "IPERF_DURATION": IPERF_DURATION,
            "IPERF_PARALLEL": IPERF_PARALLEL,
            "SERVER_IP": SERVER_IP
        })
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        return jsonify({"ok": False, "error": "Error getting configuration"}), 500


if __name__ == "__main__":
    logger.info("Starting WiFi Survey application")
    logger.info(f"Server IP: {SERVER_IP}")
    logger.info(f"Test duration: {IPERF_DURATION}s, Parallel streams: {IPERF_PARALLEL}")
    logger.info(f"Results directory: {RAW_DIR}")
    
    # Validate configuration
    if not validate_ip_address(SERVER_IP):
        logger.warning(f"Invalid SERVER_IP: {SERVER_IP}. Please update in app.py")
    
    try:
        app.run(host="0.0.0.0", port=5000, debug=False)
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
    except Exception as e:
        logger.error(f"Application error: {e}")
        raise