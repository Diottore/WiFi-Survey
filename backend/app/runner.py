"""Test runner for executing WiFi measurements."""
import asyncio
import subprocess
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from sqlmodel import Session, select

from .models import Job, Point, Measurement
from .db import engine
from .utils import parse_ping_output, parse_iperf3_output, detect_rssi, run_simulated_test

logger = logging.getLogger(__name__)


class TestRunner:
    """Manages test execution for a job."""
    
    def __init__(self, job_id: int, ws_callback: Optional[Callable] = None):
        """
        Initialize test runner.
        
        Args:
            job_id: Job ID to run
            ws_callback: Optional WebSocket callback for sending events
        """
        self.job_id = job_id
        self.ws_callback = ws_callback
        self.running = False
        self.paused_point = None
        self.continue_event = asyncio.Event()
    
    async def send_event(self, event_type: str, data: Dict[str, Any]):
        """Send event via WebSocket if callback is available."""
        if self.ws_callback:
            event = {
                "type": event_type,
                "job_id": self.job_id,
                "timestamp": datetime.utcnow().isoformat(),
                **data
            }
            try:
                await self.ws_callback(event)
            except Exception as e:
                logger.error(f"Error sending WebSocket event: {e}")
    
    async def run_ping(self, target_host: str, count: int = 10) -> Dict[str, Optional[float]]:
        """
        Run ping test.
        
        Returns dict with latency_ms, jitter_ms, packet_loss_pct.
        """
        try:
            process = await asyncio.create_subprocess_exec(
                "ping", "-c", str(count), target_host,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=count + 10)
            
            if process.returncode == 0:
                output = stdout.decode()
                return parse_ping_output(output)
            else:
                logger.warning(f"Ping failed: {stderr.decode()}")
                return {"latency_ms": None, "jitter_ms": None, "packet_loss_pct": None}
        except (asyncio.TimeoutError, FileNotFoundError) as e:
            logger.warning(f"Ping execution failed: {e}")
            return {"latency_ms": None, "jitter_ms": None, "packet_loss_pct": None}
    
    async def run_iperf3(
        self, 
        target_host: str, 
        duration: int, 
        mode: str = "tcp",
        direction: str = "download"
    ) -> Optional[float]:
        """
        Run iperf3 test.
        
        Args:
            target_host: Server hostname/IP
            duration: Test duration in seconds
            mode: tcp or udp
            direction: download or upload
        
        Returns throughput in kbps or None if failed.
        """
        try:
            cmd = ["iperf3", "-c", target_host, "-t", str(duration), "-J"]
            
            if mode == "udp":
                cmd.append("-u")
            
            if direction == "upload":
                cmd.append("-R")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), 
                timeout=duration + 20
            )
            
            if process.returncode == 0:
                output = stdout.decode()
                result = parse_iperf3_output(output)
                return result.get("throughput_kbps")
            else:
                logger.warning(f"iperf3 failed: {stderr.decode()}")
                return None
        except (asyncio.TimeoutError, FileNotFoundError) as e:
            logger.warning(f"iperf3 execution failed: {e}")
            return None
    
    def get_rssi_info(self) -> Dict[str, Any]:
        """Get RSSI and WiFi info synchronously."""
        return detect_rssi()
    
    async def run_measurement(
        self, 
        point_db_id: int,
        point_id: str,
        repetition: int,
        target_host: str,
        iperf_duration: int,
        iperf_mode: str,
        simulated: bool = False
    ) -> Measurement:
        """
        Run a complete measurement for a point.
        
        Returns the created Measurement object.
        """
        logger.info(f"Running measurement for point {point_id}, repetition {repetition}")
        
        if simulated:
            # Use simulated data
            data = run_simulated_test()
        else:
            # Run actual tests
            # Get RSSI info
            rssi_info = await asyncio.to_thread(self.get_rssi_info)
            
            # Run ping test
            ping_result = await self.run_ping(target_host)
            
            # Run iperf3 download
            throughput_dl = await self.run_iperf3(
                target_host, 
                iperf_duration, 
                iperf_mode, 
                "download"
            )
            
            # Run iperf3 upload
            throughput_ul = await self.run_iperf3(
                target_host, 
                iperf_duration, 
                iperf_mode, 
                "upload"
            )
            
            data = {
                **rssi_info,
                **ping_result,
                "throughput_dl_kbps": throughput_dl,
                "throughput_ul_kbps": throughput_ul
            }
        
        # Create measurement in DB
        with Session(engine) as session:
            measurement = Measurement(
                point_id=point_db_id,
                job_id=self.job_id,
                repetition=repetition,
                rssi=data.get("rssi"),
                ssid=data.get("ssid"),
                bssid=data.get("bssid"),
                frequency_mhz=data.get("frequency_mhz"),
                latency_ms=data.get("latency_ms"),
                jitter_ms=data.get("jitter_ms"),
                packet_loss_pct=data.get("packet_loss_pct"),
                throughput_dl_kbps=data.get("throughput_dl_kbps"),
                throughput_ul_kbps=data.get("throughput_ul_kbps")
            )
            session.add(measurement)
            session.commit()
            session.refresh(measurement)
        
        # Send measurement event
        await self.send_event("measurement", {
            "point_id": point_id,
            "rep": repetition,
            "rssi": measurement.rssi,
            "throughput_dl_kbps": measurement.throughput_dl_kbps,
            "throughput_ul_kbps": measurement.throughput_ul_kbps,
            "latency_ms": measurement.latency_ms,
            "jitter_ms": measurement.jitter_ms,
            "packet_loss_pct": measurement.packet_loss_pct
        })
        
        return measurement
    
    async def run(self):
        """Run the test job."""
        self.running = True
        
        # Check if tools are available (simulated mode)
        try:
            subprocess.run(["ping", "-c", "1", "127.0.0.1"], 
                         capture_output=True, timeout=5)
            simulated = False
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("ping not available, using simulated mode")
            simulated = True
        
        try:
            subprocess.run(["iperf3", "--version"], 
                         capture_output=True, timeout=5)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("iperf3 not available, using simulated mode")
            simulated = True
        
        # Get job details
        with Session(engine) as session:
            job = session.get(Job, self.job_id)
            if not job:
                logger.error(f"Job {self.job_id} not found")
                return
            
            # Update job status
            job.status = "running"
            session.add(job)
            session.commit()
            
            target_host = job.target_host
            iperf_duration = job.iperf_duration
            iperf_mode = job.iperf_mode
            repetitions = job.repetitions
            
            # Get points
            statement = select(Point).where(Point.job_id == self.job_id)
            points = session.exec(statement).all()
        
        await self.send_event("status", {"status": "running"})
        
        # Execute measurements for each point
        for point in points:
            if not self.running:
                logger.info("Test stopped by user")
                break
            
            # Update point status
            with Session(engine) as session:
                db_point = session.get(Point, point.id)
                db_point.status = "running"
                session.add(db_point)
                session.commit()
            
            # Run repetitions
            for rep in range(1, repetitions + 1):
                if not self.running:
                    break
                
                await self.run_measurement(
                    point.id,
                    point.point_id,
                    rep,
                    target_host,
                    iperf_duration,
                    iperf_mode,
                    simulated
                )
                
                # Update current repetition
                with Session(engine) as session:
                    db_point = session.get(Point, point.id)
                    db_point.current_repetition = rep
                    session.add(db_point)
                    session.commit()
            
            # Mark point as paused and wait for continue signal
            with Session(engine) as session:
                db_point = session.get(Point, point.id)
                db_point.status = "paused"
                session.add(db_point)
                session.commit()
            
            await self.send_event("point_done", {
                "point_id": point.point_id,
                "status": "paused"
            })
            
            # Wait for continue signal
            self.paused_point = point.point_id
            self.continue_event.clear()
            logger.info(f"Waiting for continue signal for point {point.point_id}")
            await self.continue_event.wait()
            self.paused_point = None
            
            # Mark point as completed
            with Session(engine) as session:
                db_point = session.get(Point, point.id)
                db_point.status = "completed"
                session.add(db_point)
                session.commit()
        
        # Update job status
        with Session(engine) as session:
            job = session.get(Job, self.job_id)
            if self.running:
                job.status = "completed"
            else:
                job.status = "stopped"
            session.add(job)
            session.commit()
        
        final_status = "completed" if self.running else "stopped"
        await self.send_event("status", {"status": final_status})
        
        self.running = False
        logger.info(f"Test job {self.job_id} finished with status: {final_status}")
    
    def stop(self):
        """Stop the test."""
        logger.info(f"Stopping test job {self.job_id}")
        self.running = False
        # If paused, trigger continue to allow graceful exit
        if self.paused_point:
            self.continue_event.set()
    
    def continue_point(self, point_id: str):
        """Continue from paused point."""
        if self.paused_point == point_id:
            logger.info(f"Continuing from point {point_id}")
            self.continue_event.set()
        else:
            logger.warning(f"Cannot continue point {point_id}, current paused point is {self.paused_point}")
