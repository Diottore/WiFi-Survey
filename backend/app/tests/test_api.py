"""Tests for the FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from unittest.mock import patch, MagicMock

from app.main import app, get_session
from app.models import Job, Point, Measurement


@pytest.fixture
def test_engine():
    """Create a test database engine."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def test_session(test_engine):
    """Create a test database session."""
    def override_get_session():
        with Session(test_engine) as session:
            yield session
    
    app.dependency_overrides[get_session] = override_get_session
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client(test_session):
    """Create a test client."""
    return TestClient(app)


def test_root(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert "WiFi-Tester API" in response.json()["message"]


def test_start_test(client):
    """Test starting a test."""
    with patch('app.main.TestRunner') as mock_runner_class:
        mock_runner = MagicMock()
        mock_runner_class.return_value = mock_runner
        
        with patch('asyncio.create_task'):
            payload = {
                "target_host": "192.168.1.1",
                "points": [
                    {"id": "P1", "lat": 40.7128, "lng": -74.0060},
                    {"id": "P2", "lat": 40.7129, "lng": -74.0061}
                ],
                "repetitions": 3,
                "iperf_mode": "tcp",
                "iperf_duration": 10
            }
            
            response = client.post("/api/start_test", json=payload)
            
            assert response.status_code == 200
            data = response.json()
            assert data["target_host"] == "192.168.1.1"
            assert data["iperf_mode"] == "tcp"
            assert data["iperf_duration"] == 10
            assert data["repetitions"] == 3


def test_stop_test(client):
    """Test stopping a test."""
    # First create a job
    with patch('app.main.TestRunner') as mock_runner_class:
        mock_runner = MagicMock()
        mock_runner_class.return_value = mock_runner
        
        with patch('asyncio.create_task'):
            payload = {
                "target_host": "192.168.1.1",
                "points": [{"id": "P1"}],
                "repetitions": 3
            }
            
            response = client.post("/api/start_test", json=payload)
            job_id = response.json()["id"]
            
            # Now stop it
            response = client.post("/api/stop_test", json={"job_id": job_id})
            
            assert response.status_code == 200
            assert response.json()["status"] == "stopped"


def test_get_status(client):
    """Test getting job status."""
    # Create a job first
    with patch('app.main.TestRunner') as mock_runner_class:
        mock_runner = MagicMock()
        mock_runner_class.return_value = mock_runner
        
        with patch('asyncio.create_task'):
            payload = {
                "target_host": "192.168.1.1",
                "points": [{"id": "P1"}],
                "repetitions": 3
            }
            
            response = client.post("/api/start_test", json=payload)
            job_id = response.json()["id"]
            
            # Get status
            response = client.get(f"/api/status?job_id={job_id}")
            
            assert response.status_code == 200
            data = response.json()
            assert data["job"]["id"] == job_id
            assert len(data["points"]) == 1


def test_export_csv(client):
    """Test CSV export."""
    # Create a job with a measurement
    with patch('app.main.TestRunner'):
        with patch('asyncio.create_task'):
            payload = {
                "target_host": "192.168.1.1",
                "points": [{"id": "P1"}],
                "repetitions": 1
            }
            
            response = client.post("/api/start_test", json=payload)
            job_id = response.json()["id"]
            
            # Export CSV
            response = client.get(f"/api/export?job_id={job_id}&format=csv")
            
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/csv; charset=utf-8"


def test_export_json(client):
    """Test JSON export."""
    # Create a job
    with patch('app.main.TestRunner'):
        with patch('asyncio.create_task'):
            payload = {
                "target_host": "192.168.1.1",
                "points": [{"id": "P1"}],
                "repetitions": 1
            }
            
            response = client.post("/api/start_test", json=payload)
            job_id = response.json()["id"]
            
            # Export JSON
            response = client.get(f"/api/export?job_id={job_id}&format=json")
            
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/json"


def test_export_invalid_job(client):
    """Test exporting with invalid job ID."""
    response = client.get("/api/export?job_id=99999&format=csv")
    assert response.status_code == 404
