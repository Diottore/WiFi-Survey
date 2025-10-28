"""Utility functions for parsing network test outputs."""
import re
import json
import subprocess
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


def parse_ping_output(output: str) -> Dict[str, Optional[float]]:
    """
    Parse ping command output.
    
    Returns dict with latency_ms, jitter_ms, packet_loss_pct.
    """
    result = {
        "latency_ms": None,
        "jitter_ms": None,
        "packet_loss_pct": None
    }
    
    # Parse packet loss
    loss_match = re.search(r'(\d+)%\s+packet\s+loss', output)
    if loss_match:
        result["packet_loss_pct"] = float(loss_match.group(1))
    
    # Parse RTT statistics (min/avg/max/mdev or stddev)
    rtt_match = re.search(r'rtt\s+min/avg/max/mdev\s+=\s+([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)', output)
    if rtt_match:
        result["latency_ms"] = float(rtt_match.group(2))  # avg
        result["jitter_ms"] = float(rtt_match.group(4))  # mdev (stddev)
    
    return result


def parse_iperf3_output(output: str) -> Dict[str, Optional[float]]:
    """
    Parse iperf3 JSON output.
    
    Returns dict with throughput in kbps.
    """
    result = {
        "throughput_kbps": None
    }
    
    try:
        data = json.loads(output)
        
        # Get sum_received for download or sum_sent for upload
        if "end" in data:
            end_data = data["end"]
            
            # Try sum_received first (server perspective for download)
            if "sum_received" in end_data:
                bits_per_second = end_data["sum_received"].get("bits_per_second", 0)
                result["throughput_kbps"] = bits_per_second / 1000.0
            # Try sum_sent (client perspective for upload)
            elif "sum_sent" in end_data:
                bits_per_second = end_data["sum_sent"].get("bits_per_second", 0)
                result["throughput_kbps"] = bits_per_second / 1000.0
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse iperf3 output: {e}")
    
    return result


def detect_rssi() -> Dict[str, Any]:
    """
    Detect RSSI using multiple strategies.
    
    Tries in order:
    1. termux-wifi-connectioninfo (Termux on Android)
    2. dumpsys wifi (Android via adb)
    3. iw (Linux)
    4. iwconfig (Linux legacy)
    
    Returns dict with rssi, ssid, bssid, frequency_mhz if available.
    """
    result = {
        "rssi": None,
        "ssid": None,
        "bssid": None,
        "frequency_mhz": None
    }
    
    # Strategy 1: termux-wifi-connectioninfo
    try:
        output = subprocess.check_output(
            ["termux-wifi-connectioninfo"],
            stderr=subprocess.DEVNULL,
            timeout=5
        ).decode()
        
        data = json.loads(output)
        result["rssi"] = data.get("rssi")
        result["ssid"] = data.get("ssid", "").strip('"')
        result["bssid"] = data.get("bssid")
        result["frequency_mhz"] = data.get("frequency")
        
        if result["rssi"] is not None:
            logger.info(f"RSSI detected via termux-wifi-connectioninfo: {result['rssi']}")
            return result
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired):
        pass
    
    # Strategy 2: dumpsys wifi (requires adb or root)
    try:
        output = subprocess.check_output(
            ["dumpsys", "wifi"],
            stderr=subprocess.DEVNULL,
            timeout=5
        ).decode()
        
        rssi_match = re.search(r'rssi=(-?\d+)', output)
        if rssi_match:
            result["rssi"] = float(rssi_match.group(1))
            logger.info(f"RSSI detected via dumpsys: {result['rssi']}")
            return result
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # Strategy 3: iw (Linux)
    try:
        output = subprocess.check_output(
            ["iw", "dev"],
            stderr=subprocess.DEVNULL,
            timeout=5
        ).decode()
        
        # Get interface name
        iface_match = re.search(r'Interface\s+(\S+)', output)
        if iface_match:
            iface = iface_match.group(1)
            
            # Get link info
            link_output = subprocess.check_output(
                ["iw", "dev", iface, "link"],
                stderr=subprocess.DEVNULL,
                timeout=5
            ).decode()
            
            rssi_match = re.search(r'signal:\s*(-?\d+)\s*dBm', link_output)
            if rssi_match:
                result["rssi"] = float(rssi_match.group(1))
                
            ssid_match = re.search(r'SSID:\s*(.+)', link_output)
            if ssid_match:
                result["ssid"] = ssid_match.group(1).strip()
            
            freq_match = re.search(r'freq:\s*(\d+)', link_output)
            if freq_match:
                result["frequency_mhz"] = int(freq_match.group(1))
            
            if result["rssi"] is not None:
                logger.info(f"RSSI detected via iw: {result['rssi']}")
                return result
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # Strategy 4: iwconfig (legacy Linux)
    try:
        output = subprocess.check_output(
            ["iwconfig"],
            stderr=subprocess.DEVNULL,
            timeout=5
        ).decode()
        
        # Find wireless interface with signal level
        for line in output.split('\n'):
            signal_match = re.search(r'Signal\s+level[=:]\s*(-?\d+)\s*dBm', line, re.IGNORECASE)
            if signal_match:
                result["rssi"] = float(signal_match.group(1))
                logger.info(f"RSSI detected via iwconfig: {result['rssi']}")
                return result
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    logger.warning("Could not detect RSSI with any strategy")
    return result


def run_simulated_test() -> Dict[str, Any]:
    """
    Run a simulated test when real tools are not available.
    
    Returns simulated measurement data.
    """
    import random
    
    return {
        "rssi": random.uniform(-70, -30),
        "ssid": "SimulatedSSID",
        "bssid": "00:11:22:33:44:55",
        "frequency_mhz": 2437,
        "latency_ms": random.uniform(1, 50),
        "jitter_ms": random.uniform(0.1, 5),
        "packet_loss_pct": random.uniform(0, 2),
        "throughput_dl_kbps": random.uniform(10000, 100000),
        "throughput_ul_kbps": random.uniform(5000, 50000)
    }
