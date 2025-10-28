"""
Utility functions for parsing command outputs and formatting data.
"""
import re
import logging
import json
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def parse_ping_output(output: str) -> Dict[str, Optional[float]]:
    """
    Parse ping output to extract latency, jitter, and packet loss.
    
    Args:
        output: Raw ping command output
        
    Returns:
        Dictionary with latency_ms, jitter_ms, and packet_loss_pct
    """
    result = {
        "latency_ms": None,
        "jitter_ms": None,
        "packet_loss_pct": None
    }
    
    try:
        # Parse packet loss (e.g., "10% packet loss")
        loss_match = re.search(r'(\d+(?:\.\d+)?)\s*%\s+packet\s+loss', output, re.IGNORECASE)
        if loss_match:
            result["packet_loss_pct"] = float(loss_match.group(1))
        
        # Parse latency statistics (e.g., "rtt min/avg/max/mdev = 1.234/5.678/9.012/2.345 ms")
        stats_match = re.search(r'rtt\s+min/avg/max/(?:mdev|stddev)\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)', output, re.IGNORECASE)
        if stats_match:
            result["latency_ms"] = float(stats_match.group(2))  # avg
            result["jitter_ms"] = float(stats_match.group(4))   # mdev/stddev
        
    except Exception as e:
        logger.warning(f"Error parsing ping output: {e}")
    
    return result


def parse_iperf3_output(output: str) -> Dict[str, Optional[float]]:
    """
    Parse iperf3 JSON output to extract throughput.
    
    Args:
        output: Raw iperf3 output (should be JSON)
        
    Returns:
        Dictionary with throughput in Kbps
    """
    result = {
        "throughput_kbps": None,
        "error": None
    }
    
    try:
        # Try to parse as JSON first
        data = json.loads(output)
        
        # Extract bits_per_second from end.sum_received (download) or end.sum_sent (upload)
        if "end" in data:
            end = data["end"]
            
            # For download tests, use sum_received
            if "sum_received" in end and "bits_per_second" in end["sum_received"]:
                bps = end["sum_received"]["bits_per_second"]
                result["throughput_kbps"] = bps / 1000.0
            # For upload tests, use sum_sent
            elif "sum_sent" in end and "bits_per_second" in end["sum_sent"]:
                bps = end["sum_sent"]["bits_per_second"]
                result["throughput_kbps"] = bps / 1000.0
                
    except json.JSONDecodeError:
        # Try regex parsing as fallback
        try:
            # Look for patterns like "1.23 Mbits/sec" or "123 Kbits/sec"
            match = re.search(r'([\d.]+)\s+(Mbits|Kbits|Gbits)/sec', output, re.IGNORECASE)
            if match:
                value = float(match.group(1))
                unit = match.group(2).lower()
                
                if unit == "gbits":
                    result["throughput_kbps"] = value * 1000000.0
                elif unit == "mbits":
                    result["throughput_kbps"] = value * 1000.0
                elif unit == "kbits":
                    result["throughput_kbps"] = value
        except Exception as e:
            logger.warning(f"Error in fallback iperf3 parsing: {e}")
            result["error"] = str(e)
    except Exception as e:
        logger.warning(f"Error parsing iperf3 output: {e}")
        result["error"] = str(e)
    
    return result


def parse_rssi_termux_wifi(output: str) -> Optional[float]:
    """
    Parse termux-wifi-connectioninfo output for RSSI.
    
    Args:
        output: JSON output from termux-wifi-connectioninfo
        
    Returns:
        RSSI in dBm or None
    """
    try:
        data = json.loads(output)
        rssi = data.get("rssi")
        if rssi is not None:
            return float(rssi)
    except Exception as e:
        logger.warning(f"Error parsing termux-wifi-connectioninfo: {e}")
    return None


def parse_rssi_dumpsys(output: str) -> Optional[float]:
    """
    Parse dumpsys wifi output for RSSI.
    
    Args:
        output: Output from dumpsys wifi command
        
    Returns:
        RSSI in dBm or None
    """
    try:
        # Look for "mWifiInfo SSID: ... RSSI: -XX"
        match = re.search(r'RSSI:\s*(-?\d+)', output)
        if match:
            return float(match.group(1))
    except Exception as e:
        logger.warning(f"Error parsing dumpsys wifi: {e}")
    return None


def parse_rssi_iw(output: str) -> Optional[float]:
    """
    Parse iw dev wlan0 link output for RSSI/signal.
    
    Args:
        output: Output from iw dev wlan0 link command
        
    Returns:
        RSSI in dBm or None
    """
    try:
        # Look for "signal: -XX dBm"
        match = re.search(r'signal:\s*(-?\d+)\s*dBm', output, re.IGNORECASE)
        if match:
            return float(match.group(1))
    except Exception as e:
        logger.warning(f"Error parsing iw output: {e}")
    return None


def parse_rssi_iwconfig(output: str) -> Optional[float]:
    """
    Parse iwconfig output for signal level.
    
    Args:
        output: Output from iwconfig command
        
    Returns:
        RSSI in dBm or None
    """
    try:
        # Look for "Signal level=-XX dBm" or "Signal level:-XX dBm"
        match = re.search(r'Signal\s+level[=:]\s*(-?\d+)\s*dBm', output, re.IGNORECASE)
        if match:
            return float(match.group(1))
    except Exception as e:
        logger.warning(f"Error parsing iwconfig output: {e}")
    return None


def format_measurement_csv(measurements: list) -> str:
    """
    Format measurements as CSV string.
    
    Args:
        measurements: List of measurement dictionaries
        
    Returns:
        CSV formatted string
    """
    import csv
    import io
    
    if not measurements:
        return ""
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=measurements[0].keys())
    writer.writeheader()
    writer.writerows(measurements)
    return output.getvalue()
