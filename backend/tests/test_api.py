"""
Unit tests for API endpoints.
Tests FastAPI routes with test client.
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine, Session, SQLModel
from sqlmodel.pool import StaticPool

from backend.app.main import app, get_db_session
from backend.app.models import Job, Point, Measurement


# Create in-memory test database
@pytest.fixture(name="session")
def session_fixture():
    """Create test database session"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """Create test client with overridden database session"""
    def get_session_override():
        return session

    app.dependency_overrides[get_db_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_root_endpoint(client: TestClient):
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data


def test_health_endpoint(client: TestClient):
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_start_test_endpoint(client: TestClient):
    """Test starting a new test job"""
    request_data = {
        "target_host": "192.168.1.1",
        "points": 3,
        "repetitions": 2,
        "iperf_mode": "tcp",
        "iperf_duration": 10
    }
    
    response = client.post("/api/start_test", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    assert data["ok"] is True
    assert "job_id" in data
    assert "message" in data


def test_start_test_invalid_mode(client: TestClient):
    """Test starting a test with invalid iperf mode"""
    request_data = {
        "target_host": "192.168.1.1",
        "points": 3,
        "repetitions": 2,
        "iperf_mode": "invalid",
        "iperf_duration": 10
    }
    
    response = client.post("/api/start_test", json=request_data)
    assert response.status_code == 422  # Validation error


def test_stop_test_not_found(client: TestClient):
    """Test stopping a non-existent job"""
    request_data = {
        "job_id": "non-existent-job-id"
    }
    
    response = client.post("/api/stop_test", json=request_data)
    assert response.status_code == 404


def test_get_status_not_found(client: TestClient):
    """Test getting status of non-existent job"""
    response = client.get("/api/status?job_id=non-existent-job-id")
    assert response.status_code == 404


def test_get_status_existing_job(client: TestClient, session: Session):
    """Test getting status of an existing job"""
    # Create a test job
    job = Job(
        job_id="test-job-123",
        target_host="192.168.1.1",
        points_count=3,
        repetitions=2,
        iperf_mode="tcp",
        iperf_duration=10,
        status="pending"
    )
    session.add(job)
    session.commit()
    
    response = client.get("/api/status?job_id=test-job-123")
    assert response.status_code == 200
    
    data = response.json()
    assert data["job_id"] == "test-job-123"
    assert data["status"] == "pending"
    assert data["target_host"] == "192.168.1.1"
    assert data["points_count"] == 3


def test_export_csv_not_found(client: TestClient):
    """Test exporting CSV for non-existent job"""
    response = client.get("/api/export?job_id=non-existent&format=csv")
    assert response.status_code == 404


def test_export_json_not_found(client: TestClient):
    """Test exporting JSON for non-existent job"""
    response = client.get("/api/export?job_id=non-existent&format=json")
    assert response.status_code == 404


def test_export_csv_no_measurements(client: TestClient, session: Session):
    """Test exporting CSV when job has no measurements"""
    # Create a test job without measurements
    job = Job(
        job_id="test-job-no-data",
        target_host="192.168.1.1",
        points_count=1,
        repetitions=1,
        status="pending"
    )
    session.add(job)
    session.commit()
    
    response = client.get("/api/export?job_id=test-job-no-data&format=csv")
    assert response.status_code == 404


def test_export_csv_with_measurements(client: TestClient, session: Session):
    """Test exporting CSV with measurements"""
    from datetime import datetime
    
    # Create job and measurements
    job = Job(
        job_id="test-job-export",
        target_host="192.168.1.1",
        points_count=1,
        repetitions=1,
        status="completed"
    )
    session.add(job)
    
    point = Point(
        job_id="test-job-export",
        point_id="P1",
        sequence=0,
        status="done"
    )
    session.add(point)
    
    measurement = Measurement(
        job_id="test-job-export",
        point_id="P1",
        repetition=1,
        timestamp=datetime.utcnow(),
        rssi_dbm=-60.0,
        throughput_dl_kbps=50000.0,
        throughput_ul_kbps=30000.0,
        latency_ms=10.0,
        jitter_ms=2.0,
        packet_loss_pct=0.0
    )
    session.add(measurement)
    session.commit()
    
    response = client.get("/api/export?job_id=test-job-export&format=csv")
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    
    # Check CSV content
    csv_content = response.text
    assert "job_id" in csv_content
    assert "test-job-export" in csv_content
    assert "P1" in csv_content


def test_export_json_with_measurements(client: TestClient, session: Session):
    """Test exporting JSON with measurements"""
    from datetime import datetime
    
    # Create job and measurements
    job = Job(
        job_id="test-job-json",
        target_host="192.168.1.1",
        points_count=1,
        repetitions=1,
        status="completed"
    )
    session.add(job)
    
    point = Point(
        job_id="test-job-json",
        point_id="P1",
        sequence=0,
        status="done"
    )
    session.add(point)
    
    measurement = Measurement(
        job_id="test-job-json",
        point_id="P1",
        repetition=1,
        timestamp=datetime.utcnow(),
        rssi_dbm=-55.0,
        throughput_dl_kbps=60000.0,
        throughput_ul_kbps=35000.0
    )
    session.add(measurement)
    session.commit()
    
    response = client.get("/api/export?job_id=test-job-json&format=json")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    
    # Parse JSON response
    data = response.json()
    assert data["job_id"] == "test-job-json"
    assert len(data["measurements"]) == 1
    assert data["measurements"][0]["rssi_dbm"] == -55.0
