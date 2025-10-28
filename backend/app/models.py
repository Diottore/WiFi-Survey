"""SQLModel models for WiFi-Tester application."""
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship


class Job(SQLModel, table=True):
    """Job represents a test session with multiple points."""
    __tablename__ = "jobs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    target_host: str
    iperf_mode: str = "tcp"  # tcp or udp
    iperf_duration: int = 10
    repetitions: int = 3
    status: str = "created"  # created, running, stopped, completed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    points: list["Point"] = Relationship(back_populates="job")


class Point(SQLModel, table=True):
    """Point represents a measurement location."""
    __tablename__ = "points"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id")
    point_id: str  # User-defined point identifier
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: str = "pending"  # pending, running, paused, completed
    current_repetition: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    job: Job = Relationship(back_populates="points")
    measurements: list["Measurement"] = Relationship(back_populates="point")


class Measurement(SQLModel, table=True):
    """Measurement represents a single test measurement."""
    __tablename__ = "measurements"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    point_id: int = Field(foreign_key="points.id")
    job_id: int = Field(foreign_key="jobs.id")
    repetition: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # RSSI data
    rssi: Optional[float] = None
    
    # Throughput data (in kbps)
    throughput_dl_kbps: Optional[float] = None
    throughput_ul_kbps: Optional[float] = None
    
    # Latency data
    latency_ms: Optional[float] = None
    jitter_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    
    # WiFi information
    ssid: Optional[str] = None
    bssid: Optional[str] = None
    frequency_mhz: Optional[int] = None
    
    # Relationships
    point: Point = Relationship(back_populates="measurements")
