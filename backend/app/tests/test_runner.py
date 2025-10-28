"""Tests for the test runner module."""
import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from sqlmodel import Session, create_engine, SQLModel

from app.models import Job, Point, Measurement
from app.runner import TestRunner


@pytest.fixture
def test_engine():
    """Create a test database engine."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def test_session(test_engine):
    """Create a test database session."""
    with Session(test_engine) as session:
        yield session


@pytest.fixture
def test_job(test_session):
    """Create a test job."""
    job = Job(
        target_host="192.168.1.1",
        iperf_mode="tcp",
        iperf_duration=10,
        repetitions=2,
        status="created"
    )
    test_session.add(job)
    test_session.commit()
    test_session.refresh(job)
    return job


@pytest.fixture
def test_point(test_session, test_job):
    """Create a test point."""
    point = Point(
        job_id=test_job.id,
        point_id="P1",
        lat=40.7128,
        lng=-74.0060,
        status="pending"
    )
    test_session.add(point)
    test_session.commit()
    test_session.refresh(point)
    return point


@pytest.mark.asyncio
async def test_run_ping_mock():
    """Test ping execution with mocked subprocess."""
    runner = TestRunner(1)
    
    mock_output = """
PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.
64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.23 ms

--- 192.168.1.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 1.230/1.230/1.230/0.000 ms
"""
    
    with patch('asyncio.create_subprocess_exec') as mock_proc:
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (mock_output.encode(), b"")
        mock_process.returncode = 0
        mock_proc.return_value = mock_process
        
        result = await runner.run_ping("192.168.1.1", count=1)
        
        assert result["latency_ms"] == pytest.approx(1.230)
        assert result["jitter_ms"] == pytest.approx(0.0)
        assert result["packet_loss_pct"] == 0.0


@pytest.mark.asyncio
async def test_run_iperf3_mock():
    """Test iperf3 execution with mocked subprocess."""
    runner = TestRunner(1)
    
    mock_output = '''
{
    "end": {
        "sum_received": {
            "bits_per_second": 50000000.0
        }
    }
}
'''
    
    with patch('asyncio.create_subprocess_exec') as mock_proc:
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (mock_output.encode(), b"")
        mock_process.returncode = 0
        mock_proc.return_value = mock_process
        
        result = await runner.run_iperf3("192.168.1.1", 10, "tcp", "download")
        
        assert result == pytest.approx(50000.0)  # 50 Mbps in kbps


def test_get_rssi_info_mock():
    """Test RSSI detection with mocked subprocess."""
    runner = TestRunner(1)
    
    mock_output = '{"rssi": -45, "ssid": "TestSSID", "bssid": "00:11:22:33:44:55", "frequency": 2437}'
    
    with patch('subprocess.check_output', return_value=mock_output.encode()):
        result = runner.get_rssi_info()
        
        assert result["rssi"] == -45
        assert result["ssid"] == "TestSSID"
        assert result["bssid"] == "00:11:22:33:44:55"
        assert result["frequency_mhz"] == 2437


def test_stop_runner():
    """Test stopping a runner."""
    runner = TestRunner(1)
    runner.running = True
    
    runner.stop()
    
    assert runner.running is False


def test_continue_point():
    """Test continuing from a paused point."""
    runner = TestRunner(1)
    runner.paused_point = "P1"
    runner.continue_event = asyncio.Event()
    
    # Should set the event
    runner.continue_point("P1")
    assert runner.continue_event.is_set()
    
    # Reset and test wrong point
    runner.continue_event = asyncio.Event()
    runner.continue_point("P2")
    assert not runner.continue_event.is_set()
