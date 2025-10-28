"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class StartTestRequest(BaseModel):
    """Request schema for starting a test job"""
    target_host: str = Field(..., description="Target host for iperf3 tests")
    points: int = Field(..., ge=1, le=100, description="Number of measurement points")
    repetitions: int = Field(1, ge=1, le=10, description="Number of repetitions per point")
    iperf_mode: str = Field("tcp", pattern="^(tcp|udp)$", description="iperf3 mode: tcp or udp")
    iperf_duration: int = Field(10, ge=5, le=60, description="iperf3 test duration in seconds")


class StartTestResponse(BaseModel):
    """Response schema for starting a test job"""
    ok: bool
    job_id: str
    message: str


class StopTestRequest(BaseModel):
    """Request schema for stopping a test job"""
    job_id: str


class StopTestResponse(BaseModel):
    """Response schema for stopping a test job"""
    ok: bool
    message: str


class JobStatusResponse(BaseModel):
    """Response schema for job status"""
    job_id: str
    status: str
    target_host: str
    points_count: int
    repetitions: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    points: List["PointStatusResponse"]


class PointStatusResponse(BaseModel):
    """Response schema for point status"""
    point_id: str
    sequence: int
    status: str
    repetitions_completed: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class MeasurementData(BaseModel):
    """Measurement data schema"""
    repetition: int
    timestamp: datetime
    rssi_dbm: Optional[float]
    throughput_dl_kbps: Optional[float]
    throughput_ul_kbps: Optional[float]
    latency_ms: Optional[float]
    jitter_ms: Optional[float]
    packet_loss_pct: Optional[float]
    error_message: Optional[str]


class ExportFormat(str):
    """Export format enumeration"""
    CSV = "csv"
    JSON = "json"


class ContinueTestRequest(BaseModel):
    """Request schema for continuing to next point"""
    job_id: str
    point_id: str


# WebSocket message schemas
class WSMessage(BaseModel):
    """Base WebSocket message"""
    type: str


class WSMeasurementMessage(WSMessage):
    """WebSocket measurement message"""
    type: str = "measurement"
    job_id: str
    point_id: str
    rep: int
    timestamp: str
    rssi: Optional[float]
    throughput_dl_kbps: Optional[float]
    throughput_ul_kbps: Optional[float]
    latency_ms: Optional[float]
    jitter_ms: Optional[float]
    packet_loss_pct: Optional[float]


class WSPointDoneMessage(WSMessage):
    """WebSocket point done message"""
    type: str = "point_done"
    job_id: str
    point_id: str


class WSStatusMessage(WSMessage):
    """WebSocket status message"""
    type: str = "status"
    job_id: str
    status: str
    message: Optional[str] = None
