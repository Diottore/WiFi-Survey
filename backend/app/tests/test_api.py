"""Tests for the FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


def test_root(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert "WiFi-Tester API" in response.json()["message"]


def test_start_test_validation(client):
    """Test start_test endpoint validation."""
    # Test with missing required fields
    response = client.post("/api/start_test", json={})
    assert response.status_code == 422  # Validation error
    
    # Test with invalid iperf_mode
    response = client.post("/api/start_test", json={
        "target_host": "192.168.1.1",
        "points": [{"id": "P1"}],
        "iperf_mode": "invalid"
    })
    # Should still accept it (no validation on mode in schema)
    
def test_stop_test_validation(client):
    """Test stop_test endpoint validation."""
    # Test with missing job_id
    response = client.post("/api/stop_test", json={})
    assert response.status_code == 422  # Validation error


def test_status_endpoint_exists(client):
    """Test that status endpoint exists."""
    # Without job_id, should return list of all jobs
    response = client.get("/api/status")
    assert response.status_code == 200


def test_export_endpoint_validation(client):
    """Test export endpoint validation."""
    # Test without job_id
    response = client.get("/api/export?format=csv")
    assert response.status_code == 422  # Missing required parameter
    
    # Test with invalid format
    response = client.get("/api/export?job_id=1&format=invalid")
    assert response.status_code == 422  # Invalid format
