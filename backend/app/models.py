"""
SQLModel database models for WiFi Survey application.
Defines Job, Point, and Measurement models for tracking test execution.
"""
from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from enum import Enum


class JobStatus(str, Enum):
    """Job status enumeration"""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class PointStatus(str, Enum):
    """Point status enumeration"""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    DONE = "done"
    FAILED = "failed"


class Job(SQLModel, table=True):
    """Job model representing a test job"""
    __tablename__ = "jobs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(unique=True, index=True)
    target_host: str
    points_count: int
    repetitions: int
    iperf_mode: str = "tcp"  # tcp or udp
    iperf_duration: int = 10
    status: str = Field(default=JobStatus.PENDING.value)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    # Relationship
    points: List["Point"] = Relationship(back_populates="job")


class Point(SQLModel, table=True):
    """Point model representing a measurement point"""
    __tablename__ = "points"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(foreign_key="jobs.job_id", index=True)
    point_id: str = Field(index=True)
    sequence: int
    status: str = Field(default=PointStatus.PENDING.value)
    repetitions_completed: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Relationship
    job: Job = Relationship(back_populates="points")
    measurements: List["Measurement"] = Relationship(back_populates="point")


class Measurement(SQLModel, table=True):
    """Measurement model representing a single test measurement"""
    __tablename__ = "measurements"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(index=True)
    point_id: str = Field(foreign_key="points.point_id", index=True)
    repetition: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # RSSI measurement
    rssi_dbm: Optional[float] = None
    
    # Throughput measurements (in Kbps)
    throughput_dl_kbps: Optional[float] = None
    throughput_ul_kbps: Optional[float] = None
    
    # Latency measurements
    latency_ms: Optional[float] = None
    jitter_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    
    # Additional metadata
    error_message: Optional[str] = None
    
    # Relationship
    point: Point = Relationship(back_populates="measurements")
