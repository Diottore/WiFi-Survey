"""Pydantic schemas for API requests and responses."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class PointInput(BaseModel):
    """Point input for test configuration."""
    id: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class StartTestRequest(BaseModel):
    """Request schema for starting a test."""
    target_host: str
    points: List[PointInput]
    repetitions: int = 3
    iperf_mode: str = "tcp"
    iperf_duration: int = 10


class StopTestRequest(BaseModel):
    """Request schema for stopping a test."""
    job_id: int


class ContinuePointRequest(BaseModel):
    """Request schema for continuing from paused point."""
    job_id: int
    point_id: str


class JobStatusResponse(BaseModel):
    """Response schema for job status."""
    id: int
    status: str
    target_host: str
    iperf_mode: str
    iperf_duration: int
    repetitions: int
    created_at: datetime
    
    model_config = {"from_attributes": True}


class PointStatusResponse(BaseModel):
    """Response schema for point status."""
    point_id: str
    status: str
    current_repetition: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    
    model_config = {"from_attributes": True}


class StatusResponse(BaseModel):
    """Overall status response."""
    job: Optional[JobStatusResponse] = None
    points: List[PointStatusResponse] = []


class MeasurementResponse(BaseModel):
    """Response schema for measurement data."""
    id: int
    point_id: int
    job_id: int
    repetition: int
    timestamp: datetime
    rssi: Optional[float] = None
    throughput_dl_kbps: Optional[float] = None
    throughput_ul_kbps: Optional[float] = None
    latency_ms: Optional[float] = None
    jitter_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    ssid: Optional[str] = None
    bssid: Optional[str] = None
    frequency_mhz: Optional[int] = None
    
    model_config = {"from_attributes": True}
