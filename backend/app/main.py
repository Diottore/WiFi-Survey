"""FastAPI application for WiFi-Tester."""
import asyncio
import csv
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .db import init_db, get_session
from .models import Job, Point, Measurement
from .schemas import (
    StartTestRequest, StopTestRequest, ContinuePointRequest,
    JobStatusResponse, PointStatusResponse, StatusResponse
)
from .runner import TestRunner

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="WiFi-Tester API", version="1.0.0")

# Initialize database
init_db()

# Store active runners
active_runners: Dict[int, TestRunner] = {}

# WebSocket connections
websocket_connections: Dict[int, WebSocket] = {}


class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
    
    async def connect(self, job_id: int, websocket: WebSocket):
        """Connect a WebSocket for a job."""
        await websocket.accept()
        self.active_connections[job_id] = websocket
        logger.info(f"WebSocket connected for job {job_id}")
    
    def disconnect(self, job_id: int):
        """Disconnect a WebSocket."""
        if job_id in self.active_connections:
            del self.active_connections[job_id]
            logger.info(f"WebSocket disconnected for job {job_id}")
    
    async def send_message(self, job_id: int, message: dict):
        """Send message to a specific job's WebSocket."""
        if job_id in self.active_connections:
            try:
                await self.active_connections[job_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")


manager = ConnectionManager()


async def ws_send_callback(job_id: int):
    """Create a callback function for sending WebSocket messages."""
    async def callback(event: dict):
        await manager.send_message(job_id, event)
    return callback


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "WiFi-Tester API", "version": "1.0.0"}


@app.post("/api/start_test")
async def start_test(
    request: StartTestRequest,
    session: Session = Depends(get_session)
) -> JobStatusResponse:
    """
    Start a new test job.
    
    Creates a job and points in the database, then launches the runner in background.
    """
    # Create job
    job = Job(
        target_host=request.target_host,
        iperf_mode=request.iperf_mode,
        iperf_duration=request.iperf_duration,
        repetitions=request.repetitions,
        status="created"
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    
    # Create points
    for point_input in request.points:
        point = Point(
            job_id=job.id,
            point_id=point_input.id,
            lat=point_input.lat,
            lng=point_input.lng,
            status="pending"
        )
        session.add(point)
    session.commit()
    
    logger.info(f"Created job {job.id} with {len(request.points)} points")
    
    # Create runner with WebSocket callback
    ws_callback = await ws_send_callback(job.id)
    runner = TestRunner(job.id, ws_callback)
    active_runners[job.id] = runner
    
    # Launch runner in background
    asyncio.create_task(runner.run())
    
    return JobStatusResponse.model_validate(job)


@app.post("/api/stop_test")
async def stop_test(
    request: StopTestRequest,
    session: Session = Depends(get_session)
):
    """Stop a running test job."""
    job = session.get(Job, request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Stop runner if active
    if request.job_id in active_runners:
        active_runners[request.job_id].stop()
    
    # Update job status
    job.status = "stopped"
    session.add(job)
    session.commit()
    
    logger.info(f"Stopped job {request.job_id}")
    
    return {"status": "stopped", "job_id": request.job_id}


@app.post("/api/continue_point")
async def continue_point(request: ContinuePointRequest):
    """Continue from a paused point."""
    if request.job_id in active_runners:
        active_runners[request.job_id].continue_point(request.point_id)
        return {"status": "continued", "point_id": request.point_id}
    else:
        raise HTTPException(status_code=404, detail="Job runner not found")


@app.get("/api/status")
async def get_status(
    job_id: Optional[int] = Query(None),
    session: Session = Depends(get_session)
) -> StatusResponse:
    """Get status of a job or all jobs."""
    if job_id:
        job = session.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get points
        statement = select(Point).where(Point.job_id == job_id)
        points = session.exec(statement).all()
        
        return StatusResponse(
            job=JobStatusResponse.model_validate(job),
            points=[PointStatusResponse.model_validate(p) for p in points]
        )
    else:
        # Return status of all jobs
        statement = select(Job)
        jobs = session.exec(statement).all()
        return {
            "jobs": [JobStatusResponse.model_validate(j) for j in jobs]
        }


@app.get("/api/export")
async def export_data(
    job_id: int = Query(...),
    format: str = Query("csv", pattern="^(csv|json)$"),
    session: Session = Depends(get_session)
):
    """
    Export measurement data for a job.
    
    Supports CSV and JSON formats.
    """
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get all measurements for this job
    statement = select(Measurement).where(Measurement.job_id == job_id)
    measurements = session.exec(statement).all()
    
    if format == "csv":
        # Create CSV file
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', newline='') as f:
            writer = csv.writer(f)
            
            # Write header
            writer.writerow([
                "job_id", "point_id", "repetition", "timestamp",
                "rssi", "ssid", "bssid", "frequency_mhz",
                "throughput_dl_kbps", "throughput_ul_kbps",
                "latency_ms", "jitter_ms", "packet_loss_pct"
            ])
            
            # Write data
            for m in measurements:
                writer.writerow([
                    m.job_id, m.point_id, m.repetition, m.timestamp.isoformat(),
                    m.rssi, m.ssid, m.bssid, m.frequency_mhz,
                    m.throughput_dl_kbps, m.throughput_ul_kbps,
                    m.latency_ms, m.jitter_ms, m.packet_loss_pct
                ])
            
            filepath = f.name
        
        return FileResponse(
            filepath,
            media_type="text/csv",
            filename=f"wifi_test_job_{job_id}.csv",
            headers={"Content-Disposition": f"attachment; filename=wifi_test_job_{job_id}.csv"}
        )
    
    elif format == "json":
        # Create JSON response
        data = {
            "job_id": job_id,
            "target_host": job.target_host,
            "iperf_mode": job.iperf_mode,
            "iperf_duration": job.iperf_duration,
            "repetitions": job.repetitions,
            "status": job.status,
            "created_at": job.created_at.isoformat(),
            "measurements": [
                {
                    "point_id": m.point_id,
                    "repetition": m.repetition,
                    "timestamp": m.timestamp.isoformat(),
                    "rssi": m.rssi,
                    "ssid": m.ssid,
                    "bssid": m.bssid,
                    "frequency_mhz": m.frequency_mhz,
                    "throughput_dl_kbps": m.throughput_dl_kbps,
                    "throughput_ul_kbps": m.throughput_ul_kbps,
                    "latency_ms": m.latency_ms,
                    "jitter_ms": m.jitter_ms,
                    "packet_loss_pct": m.packet_loss_pct
                }
                for m in measurements
            ]
        }
        
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            json.dump(data, f, indent=2)
            filepath = f.name
        
        return FileResponse(
            filepath,
            media_type="application/json",
            filename=f"wifi_test_job_{job_id}.json",
            headers={"Content-Disposition": f"attachment; filename=wifi_test_job_{job_id}.json"}
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, job_id: int = Query(...)):
    """
    WebSocket endpoint for real-time updates.
    
    Sends events: measurement, point_done, status
    """
    await manager.connect(job_id, websocket)
    try:
        while True:
            # Keep connection alive and receive continue commands
            data = await websocket.receive_json()
            
            # Handle continue command
            if data.get("type") == "continue" and "point_id" in data:
                if job_id in active_runners:
                    active_runners[job_id].continue_point(data["point_id"])
    except WebSocketDisconnect:
        manager.disconnect(job_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(job_id)


# Mount frontend static files
frontend_path = Path(__file__).parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")
    
    @app.get("/app")
    async def serve_frontend():
        """Serve frontend application."""
        index_path = frontend_path / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        else:
            return {"error": "Frontend not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
