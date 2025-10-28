"""
Asynchronous test runner for WiFi measurements.
Executes ping, iperf3, and RSSI measurements.
"""
import asyncio
import subprocess
import logging
from typing import Optional, Dict, Any, Callable, Tuple
from datetime import datetime
import shutil

from .utils import (
    parse_ping_output,
    parse_iperf3_output,
    parse_rssi_termux_wifi,
    parse_rssi_dumpsys,
    parse_rssi_iw,
    parse_rssi_iwconfig
)

logger = logging.getLogger(__name__)


class CommandRunner:
    """Helper class to run external commands"""
    
    @staticmethod
    async def run_command(cmd: list, timeout: int = 30, check_stderr: bool = False) -> Tuple[int, str, str]:
        """
        Run a command asynchronously.
        
        Args:
            cmd: Command and arguments as list
            timeout: Timeout in seconds
            check_stderr: Whether to check stderr for errors
            
        Returns:
            Tuple of (return_code, stdout, stderr)
        """
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return (
                process.returncode,
                stdout.decode('utf-8', errors='ignore'),
                stderr.decode('utf-8', errors='ignore')
            )
        except asyncio.TimeoutError:
            logger.error(f"Command timed out after {timeout}s: {' '.join(cmd)}")
            try:
                process.kill()
                await process.wait()
            except:
                pass
            return (-1, "", "Timeout")
        except Exception as e:
            logger.error(f"Error running command {' '.join(cmd)}: {e}")
            return (-1, "", str(e))


class RSSIDetector:
    """Detects RSSI using multiple strategies with automatic fallback"""
    
    def __init__(self):
        self.strategies = [
            ("termux-wifi-connectioninfo", self._detect_termux_wifi),
            ("dumpsys wifi", self._detect_dumpsys),
            ("iw dev wlan0 link", self._detect_iw),
            ("iwconfig wlan0", self._detect_iwconfig),
        ]
        self.working_strategy = None
    
    async def detect_rssi(self) -> Optional[float]:
        """
        Detect RSSI using available methods.
        
        Returns:
            RSSI in dBm or None if detection fails
        """
        # Try the last working strategy first
        if self.working_strategy:
            rssi = await self.working_strategy()
            if rssi is not None:
                return rssi
            # Strategy stopped working, reset it
            self.working_strategy = None
        
        # Try all strategies
        for name, strategy in self.strategies:
            logger.debug(f"Trying RSSI detection strategy: {name}")
            rssi = await strategy()
            if rssi is not None:
                logger.info(f"RSSI detected using {name}: {rssi} dBm")
                self.working_strategy = strategy
                return rssi
        
        logger.warning("Could not detect RSSI with any available method")
        return None
    
    async def _detect_termux_wifi(self) -> Optional[float]:
        """Detect RSSI using termux-wifi-connectioninfo"""
        if not shutil.which("termux-wifi-connectioninfo"):
            return None
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            ["termux-wifi-connectioninfo"],
            timeout=5
        )
        
        if returncode == 0 and stdout:
            return parse_rssi_termux_wifi(stdout)
        return None
    
    async def _detect_dumpsys(self) -> Optional[float]:
        """Detect RSSI using dumpsys wifi"""
        if not shutil.which("dumpsys"):
            return None
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            ["dumpsys", "wifi"],
            timeout=5
        )
        
        if returncode == 0 and stdout:
            return parse_rssi_dumpsys(stdout)
        return None
    
    async def _detect_iw(self) -> Optional[float]:
        """Detect RSSI using iw dev wlan0 link"""
        if not shutil.which("iw"):
            return None
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            ["iw", "dev", "wlan0", "link"],
            timeout=5
        )
        
        if returncode == 0 and stdout:
            return parse_rssi_iw(stdout)
        return None
    
    async def _detect_iwconfig(self) -> Optional[float]:
        """Detect RSSI using iwconfig wlan0"""
        if not shutil.which("iwconfig"):
            return None
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            ["iwconfig", "wlan0"],
            timeout=5
        )
        
        if returncode == 0 and stdout:
            return parse_rssi_iwconfig(stdout)
        return None


class MeasurementRunner:
    """Runs individual measurements for a point"""
    
    def __init__(self, target_host: str, iperf_mode: str = "tcp", iperf_duration: int = 10):
        self.target_host = target_host
        self.iperf_mode = iperf_mode
        self.iperf_duration = iperf_duration
        self.rssi_detector = RSSIDetector()
    
    async def measure_latency(self, count: int = 10) -> Dict[str, Optional[float]]:
        """
        Measure latency, jitter, and packet loss using ping.
        
        Args:
            count: Number of ping packets
            
        Returns:
            Dictionary with latency_ms, jitter_ms, packet_loss_pct
        """
        # Try fping first (faster), fallback to ping
        ping_cmd = None
        if shutil.which("fping"):
            ping_cmd = ["fping", "-c", str(count), "-q", self.target_host]
        elif shutil.which("ping"):
            ping_cmd = ["ping", "-c", str(count), self.target_host]
        else:
            logger.error("No ping or fping command available")
            return {"latency_ms": None, "jitter_ms": None, "packet_loss_pct": None}
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            ping_cmd,
            timeout=count + 10
        )
        
        # fping outputs to stderr
        output = stderr if "fping" in ping_cmd[0] else stdout
        
        if output:
            return parse_ping_output(output)
        
        return {"latency_ms": None, "jitter_ms": None, "packet_loss_pct": None}
    
    async def measure_throughput(self, direction: str = "download") -> Optional[float]:
        """
        Measure throughput using iperf3.
        
        Args:
            direction: "download" or "upload"
            
        Returns:
            Throughput in Kbps or None
        """
        if not shutil.which("iperf3"):
            logger.error("iperf3 not available")
            return None
        
        cmd = [
            "iperf3",
            "-c", self.target_host,
            "-t", str(self.iperf_duration),
            "-J"  # JSON output
        ]
        
        # Add mode-specific flags
        if self.iperf_mode == "udp":
            cmd.extend(["-u", "-b", "100M"])  # UDP mode with 100Mbps target
        
        # Add direction flag
        if direction == "upload":
            cmd.append("-R")  # Reverse mode for download from server perspective = upload from client
        
        returncode, stdout, stderr = await CommandRunner.run_command(
            cmd,
            timeout=self.iperf_duration + 30
        )
        
        if returncode == 0 and stdout:
            result = parse_iperf3_output(stdout)
            return result.get("throughput_kbps")
        else:
            logger.error(f"iperf3 failed: {stderr}")
        
        return None
    
    async def measure_rssi(self) -> Optional[float]:
        """
        Measure RSSI using available detection methods.
        
        Returns:
            RSSI in dBm or None
        """
        return await self.rssi_detector.detect_rssi()
    
    async def run_full_measurement(self) -> Dict[str, Any]:
        """
        Run a complete measurement including RSSI, latency, and throughput.
        
        Returns:
            Dictionary with all measurement results
        """
        result = {
            "timestamp": datetime.utcnow().isoformat(),
            "rssi_dbm": None,
            "throughput_dl_kbps": None,
            "throughput_ul_kbps": None,
            "latency_ms": None,
            "jitter_ms": None,
            "packet_loss_pct": None,
            "error_message": None
        }
        
        try:
            # Measure RSSI
            rssi = await self.measure_rssi()
            result["rssi_dbm"] = rssi
            
            # Measure latency
            latency_data = await self.measure_latency()
            result.update(latency_data)
            
            # Measure download throughput
            dl_throughput = await self.measure_throughput(direction="download")
            result["throughput_dl_kbps"] = dl_throughput
            
            # Measure upload throughput
            ul_throughput = await self.measure_throughput(direction="upload")
            result["throughput_ul_kbps"] = ul_throughput
            
        except Exception as e:
            logger.error(f"Error during measurement: {e}")
            result["error_message"] = str(e)
        
        return result
