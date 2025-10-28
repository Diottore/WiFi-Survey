"""
FastAPI application for WiFi Survey testing.
Provides REST API endpoints and WebSocket for real-time updates.
"""
import asyncio
import logging
import uuid
import json
import csv
import io
from datetime import datetime
from typing import Dict, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
import os
from pathlib import Path

from .db import init_db, get_db_session, get_session
from .models import Job, Point, Measurement, JobStatus, PointStatus
from .schemas import (
    StartTestRequest, StartTestResponse,
    StopTestRequest, StopTestResponse,
    JobStatusResponse, PointStatusResponse,
    ContinueTestRequest,
    WSMeasurementMessage, WSPointDoneMessage, WSStatusMessage
)
from .runner import MeasurementRunner

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Global state for running jobs
active_jobs: Dict[str, dict] = {}
websocket_connections: List[WebSocket] = []
job_pause_events: Dict[str, asyncio.Event] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    init_db()
    logger.info("Database initialized")
    yield
    # Shutdown
    logger.info("Shutting down...")


app = FastAPI(
    title="WiFi Survey API",
    description="FastAPI backend for WiFi testing with real-time measurements",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend static files
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")


# WebSocket connection manager
async def broadcast_message(message: dict):
    """Broadcast message to all connected WebSocket clients"""
    disconnected = []
    for websocket in websocket_connections:
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error broadcasting to websocket: {e}")
            disconnected.append(websocket)
    
    # Remove disconnected clients
    for ws in disconnected:
        if ws in websocket_connections:
            websocket_connections.remove(ws)


async def run_job_measurements(job_id: str, target_host: str, points_count: int, 
                                repetitions: int, iperf_mode: str, iperf_duration: int):
    """
    Background task to run measurements for a job.
    
    Args:
        job_id: Job identifier
        target_host: Target host for iperf3
        points_count: Number of points to measure
        repetitions: Repetitions per point
        iperf_mode: iperf3 mode (tcp/udp)
        iperf_duration: iperf3 duration in seconds
    """
    logger.info(f"Starting job {job_id} with {points_count} points, {repetitions} reps each")
    
    try:
        # Update job status to running
        with get_session() as session:
            job = session.exec(select(Job).where(Job.job_id == job_id)).first()
            if job:
                job.status = JobStatus.RUNNING.value
                job.started_at = datetime.utcnow()
                session.add(job)
                session.commit()
        
        # Broadcast status update
        await broadcast_message({
            "type": "status",
            "job_id": job_id,
            "status": JobStatus.RUNNING.value
        })
        
        # Create measurement runner
        runner = MeasurementRunner(target_host, iperf_mode, iperf_duration)
        
        # Process each point
        for point_seq in range(points_count):
            point_id = f"P{point_seq + 1}"
            
            # Create point in database
            with get_session() as session:
                point = Point(
                    job_id=job_id,
                    point_id=point_id,
                    sequence=point_seq,
                    status=PointStatus.RUNNING.value,
                    started_at=datetime.utcnow()
                )
                session.add(point)
                session.commit()
            
            # Run repetitions for this point
            for rep in range(repetitions):
                logger.info(f"Job {job_id}, Point {point_id}, Rep {rep + 1}/{repetitions}")
                
                # Check if job was stopped
                if job_id not in active_jobs or active_jobs[job_id].get("stopped"):
                    logger.info(f"Job {job_id} was stopped")
                    with get_session() as session:
                        job = session.exec(select(Job).where(Job.job_id == job_id)).first()
                        if job:
                            job.status = JobStatus.STOPPED.value
                            session.add(job)
                            session.commit()
                    return
                
                # Run measurement
                measurement_data = await runner.run_full_measurement()
                
                # Save measurement to database
                with get_session() as session:
                    measurement = Measurement(
                        job_id=job_id,
                        point_id=point_id,
                        repetition=rep + 1,
                        timestamp=datetime.utcnow(),
                        rssi_dbm=measurement_data.get("rssi_dbm"),
                        throughput_dl_kbps=measurement_data.get("throughput_dl_kbps"),
                        throughput_ul_kbps=measurement_data.get("throughput_ul_kbps"),
                        latency_ms=measurement_data.get("latency_ms"),
                        jitter_ms=measurement_data.get("jitter_ms"),
                        packet_loss_pct=measurement_data.get("packet_loss_pct"),
                        error_message=measurement_data.get("error_message")
                    )
                    session.add(measurement)
                    
                    # Update point
                    point = session.exec(select(Point).where(Point.point_id == point_id, Point.job_id == job_id)).first()
                    if point:
                        point.repetitions_completed = rep + 1
                        session.add(point)
                    
                    session.commit()
                
                # Broadcast measurement via WebSocket
                await broadcast_message({
                    "type": "measurement",
                    "job_id": job_id,
                    "point_id": point_id,
                    "rep": rep + 1,
                    "timestamp": measurement_data.get("timestamp"),
                    "rssi": measurement_data.get("rssi_dbm"),
                    "throughput_dl_kbps": measurement_data.get("throughput_dl_kbps"),
                    "throughput_ul_kbps": measurement_data.get("throughput_ul_kbps"),
                    "latency_ms": measurement_data.get("latency_ms"),
                    "jitter_ms": measurement_data.get("jitter_ms"),
                    "packet_loss_pct": measurement_data.get("packet_loss_pct")
                })
            
            # Mark point as paused and wait for continue signal
            with get_session() as session:
                point = session.exec(select(Point).where(Point.point_id == point_id, Point.job_id == job_id)).first()
                if point:
                    point.status = PointStatus.PAUSED.value
                    session.add(point)
                    session.commit()
            
            # Broadcast point_done event
            await broadcast_message({
                "type": "point_done",
                "job_id": job_id,
                "point_id": point_id
            })
            
            # Create pause event for this point if not last
            if point_seq < points_count - 1:
                pause_key = f"{job_id}:{point_id}"
                job_pause_events[pause_key] = asyncio.Event()
                
                # Wait for continue signal
                logger.info(f"Waiting for continue signal for {pause_key}")
                await job_pause_events[pause_key].wait()
                logger.info(f"Continue signal received for {pause_key}")
                
                # Mark point as done
                with get_session() as session:
                    point = session.exec(select(Point).where(Point.point_id == point_id, Point.job_id == job_id)).first()
                    if point:
                        point.status = PointStatus.DONE.value
                        point.completed_at = datetime.utcnow()
                        session.add(point)
                        session.commit()
            else:
                # Last point, mark as done
                with get_session() as session:
                    point = session.exec(select(Point).where(Point.point_id == point_id, Point.job_id == job_id)).first()
                    if point:
                        point.status = PointStatus.DONE.value
                        point.completed_at = datetime.utcnow()
                        session.add(point)
                        session.commit()
        
        # Mark job as completed
        with get_session() as session:
            job = session.exec(select(Job).where(Job.job_id == job_id)).first()
            if job:
                job.status = JobStatus.COMPLETED.value
                job.completed_at = datetime.utcnow()
                session.add(job)
                session.commit()
        
        await broadcast_message({
            "type": "status",
            "job_id": job_id,
            "status": JobStatus.COMPLETED.value
        })
        
        logger.info(f"Job {job_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Error running job {job_id}: {e}", exc_info=True)
        
        # Mark job as failed
        with get_session() as session:
            job = session.exec(select(Job).where(Job.job_id == job_id)).first()
            if job:
                job.status = JobStatus.FAILED.value
                job.error_message = str(e)
                session.add(job)
                session.commit()
        
        await broadcast_message({
            "type": "status",
            "job_id": job_id,
            "status": JobStatus.FAILED.value,
            "message": str(e)
        })
    
    finally:
        # Clean up
        if job_id in active_jobs:
            del active_jobs[job_id]


@app.post("/api/start_test", response_model=StartTestResponse)
async def start_test(request: StartTestRequest, background_tasks: BackgroundTasks):
    """Start a new test job"""
    job_id = str(uuid.uuid4())
    
    # Create job in database
    with get_session() as session:
        job = Job(
            job_id=job_id,
            target_host=request.target_host,
            points_count=request.points,
            repetitions=request.repetitions,
            iperf_mode=request.iperf_mode,
            iperf_duration=request.iperf_duration,
            status=JobStatus.PENDING.value
        )
        session.add(job)
        session.commit()
    
    # Mark as active
    active_jobs[job_id] = {"stopped": False}
    
    # Start background task
    background_tasks.add_task(
        run_job_measurements,
        job_id,
        request.target_host,
        request.points,
        request.repetitions,
        request.iperf_mode,
        request.iperf_duration
    )
    
    return StartTestResponse(
        ok=True,
        job_id=job_id,
        message=f"Test job started with {request.points} points"
    )


@app.post("/api/stop_test", response_model=StopTestResponse)
async def stop_test(request: StopTestRequest):
    """Stop a running test job"""
    if request.job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    
    active_jobs[request.job_id]["stopped"] = True
    
    return StopTestResponse(
        ok=True,
        message=f"Job {request.job_id} stop requested"
    )


@app.post("/api/continue")
async def continue_test(request: ContinueTestRequest):
    """Continue to next point after pause"""
    pause_key = f"{request.job_id}:{request.point_id}"
    
    if pause_key not in job_pause_events:
        raise HTTPException(status_code=404, detail="No paused point found")
    
    # Signal the job to continue
    job_pause_events[pause_key].set()
    del job_pause_events[pause_key]
    
    return {"ok": True, "message": f"Continuing from point {request.point_id}"}


@app.get("/api/status")
async def get_status(job_id: str = Query(...)):
    """Get status of a test job"""
    with get_session() as session:
        job = session.exec(select(Job).where(Job.job_id == job_id)).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get points for this job
        points = session.exec(select(Point).where(Point.job_id == job_id).order_by(Point.sequence)).all()
        
        points_data = [
            PointStatusResponse(
                point_id=p.point_id,
                sequence=p.sequence,
                status=p.status,
                repetitions_completed=p.repetitions_completed,
                created_at=p.created_at,
                started_at=p.started_at,
                completed_at=p.completed_at
            )
            for p in points
        ]
        
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status,
            target_host=job.target_host,
            points_count=job.points_count,
            repetitions=job.repetitions,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            points=points_data
        )


@app.get("/api/export")
async def export_results(job_id: str = Query(...), format: str = Query("csv", regex="^(csv|json)$")):
    """Export job results in CSV or JSON format"""
    with get_session() as session:
        # Get job
        job = session.exec(select(Job).where(Job.job_id == job_id)).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get all measurements for this job
        measurements = session.exec(
            select(Measurement)
            .where(Measurement.job_id == job_id)
            .order_by(Measurement.point_id, Measurement.repetition)
        ).all()
        
        if not measurements:
            raise HTTPException(status_code=404, detail="No measurements found for this job")
        
        if format == "csv":
            # Generate CSV
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow([
                "job_id", "point_id", "repetition", "timestamp",
                "rssi_dbm", "throughput_dl_kbps", "throughput_ul_kbps",
                "latency_ms", "jitter_ms", "packet_loss_pct", "error_message"
            ])
            
            # Write data
            for m in measurements:
                writer.writerow([
                    m.job_id, m.point_id, m.repetition, m.timestamp.isoformat(),
                    m.rssi_dbm, m.throughput_dl_kbps, m.throughput_ul_kbps,
                    m.latency_ms, m.jitter_ms, m.packet_loss_pct, m.error_message
                ])
            
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=job_{job_id}.csv"}
            )
        
        else:  # JSON format
            data = {
                "job_id": job.job_id,
                "target_host": job.target_host,
                "status": job.status,
                "created_at": job.created_at.isoformat(),
                "measurements": [
                    {
                        "point_id": m.point_id,
                        "repetition": m.repetition,
                        "timestamp": m.timestamp.isoformat(),
                        "rssi_dbm": m.rssi_dbm,
                        "throughput_dl_kbps": m.throughput_dl_kbps,
                        "throughput_ul_kbps": m.throughput_ul_kbps,
                        "latency_ms": m.latency_ms,
                        "jitter_ms": m.jitter_ms,
                        "packet_loss_pct": m.packet_loss_pct,
                        "error_message": m.error_message
                    }
                    for m in measurements
                ]
            }
            
            return StreamingResponse(
                iter([json.dumps(data, indent=2)]),
                media_type="application/json",
                headers={"Content-Disposition": f"attachment; filename=job_{job_id}.json"}
            )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    websocket_connections.append(websocket)
    logger.info(f"WebSocket client connected. Total clients: {len(websocket_connections)}")
    
    try:
        while True:
            # Receive messages from client (for continue signals, etc.)
            data = await websocket.receive_json()
            
            if data.get("type") == "continue":
                # Handle continue request
                job_id = data.get("job_id")
                point_id = data.get("point_id")
                pause_key = f"{job_id}:{point_id}"
                
                if pause_key in job_pause_events:
                    job_pause_events[pause_key].set()
                    del job_pause_events[pause_key]
                    
                    await websocket.send_json({
                        "type": "ack",
                        "message": f"Continue signal sent for {point_id}"
                    })
    
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if websocket in websocket_connections:
            websocket_connections.remove(websocket)
        logger.info(f"WebSocket client removed. Total clients: {len(websocket_connections)}")


@app.get("/")
async def root():
    """Serve frontend HTML"""
    frontend_html = FRONTEND_DIR / "index.html"
    if frontend_html.exists():
        with open(frontend_html, 'r') as f:
            return HTMLResponse(content=f.read())
    return {"message": "WiFi Survey API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}
