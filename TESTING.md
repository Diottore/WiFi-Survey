# WiFi-Tester Testing Guide

This document describes how to test the WiFi-Tester implementation.

## Quick Validation

Run the validation script to verify the implementation:

```bash
python3 validate_implementation.py
```

This checks:
- Python version compatibility
- File structure completeness
- Python syntax validity
- Type hint compatibility
- Frontend integration
- Documentation presence

## Unit Tests

### Prerequisites

Install test dependencies:

```bash
cd backend
pip install -r requirements.txt
```

### Running Tests

Run all tests:

```bash
cd backend
pytest tests/ -v
```

Run specific test files:

```bash
# API tests
pytest tests/test_api.py -v

# Runner tests
pytest tests/test_runner.py -v
```

Run with coverage:

```bash
pytest tests/ --cov=app --cov-report=html
```

### Test Coverage

The test suite covers:

**test_api.py:**
- ✅ Root and health endpoints
- ✅ Start test endpoint validation
- ✅ Stop test endpoint
- ✅ Job status retrieval
- ✅ CSV export functionality
- ✅ JSON export functionality
- ✅ Invalid input handling
- ✅ Not found error cases

**test_runner.py:**
- ✅ Command execution
- ✅ Command timeout handling
- ✅ RSSI detection (all strategies)
- ✅ Ping measurement parsing
- ✅ iperf3 measurement parsing
- ✅ Full measurement workflow
- ✅ Error handling

## Manual Testing

### 1. Start the Backend

```bash
cd backend
bash start.sh
```

The server should start on http://localhost:8000

### 2. Test REST API

Using curl or a REST client:

```bash
# Health check
curl http://localhost:8000/health

# Start a test job
curl -X POST http://localhost:8000/api/start_test \
  -H "Content-Type: application/json" \
  -d '{
    "target_host": "192.168.1.1",
    "points": 3,
    "repetitions": 2,
    "iperf_mode": "tcp",
    "iperf_duration": 10
  }'

# Get job status (replace JOB_ID)
curl http://localhost:8000/api/status?job_id=JOB_ID

# Export results
curl http://localhost:8000/api/export?job_id=JOB_ID&format=csv -o results.csv
curl http://localhost:8000/api/export?job_id=JOB_ID&format=json -o results.json
```

### 3. Test WebSocket

Use the web interface or a WebSocket client:

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:8000/ws
```

Expected messages:
- `measurement` - Real-time measurement data
- `point_done` - Point completion notification
- `status` - Job status updates

### 4. Test Frontend

1. Open browser to http://localhost:8000
2. Configure test parameters
3. Click "Start Test"
4. Verify real-time updates in charts
5. Check map markers update
6. Test pause/continue workflow
7. Export results in CSV and JSON

## Testing on Different Platforms

### Termux/Android

```bash
# Install dependencies
pkg install python iperf3 termux-api

# Run tests
cd backend
pip install -r requirements.txt
pytest tests/

# Start server
bash start.sh
```

Test RSSI detection:

```bash
# Should work on Android
termux-wifi-connectioninfo

# Or
dumpsys wifi | grep RSSI
```

### Linux Desktop

```bash
# Install dependencies
sudo apt-get install python3-pip iperf3 fping iw

# Run tests
cd backend
pip3 install -r requirements.txt
pytest tests/

# Start server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Test RSSI detection:

```bash
# Should work on Linux
iw dev wlan0 link | grep signal

# Or
iwconfig wlan0 | grep Signal
```

### Docker

```bash
# Build image
cd backend
docker build -t wifi-tester .

# Run tests in container
docker run wifi-tester pytest tests/ -v

# Run server
docker run -p 8000:8000 wifi-tester
```

## Integration Testing

### Prerequisites

1. Running iperf3 server:
   ```bash
   iperf3 -s
   ```

2. Network connectivity to iperf3 server

3. WiFi connection (for RSSI detection)

### Full Workflow Test

1. Start backend server
2. Open web interface
3. Configure:
   - Target host: IP of iperf3 server
   - Points: 3
   - Repetitions: 2
   - Mode: TCP
   - Duration: 10s
4. Click "Start Test"
5. Observe:
   - ✅ Charts update in real-time
   - ✅ Map markers show progress
   - ✅ Progress indicators update
   - ✅ WebSocket messages arrive
6. When first point completes:
   - ✅ "Continue" button appears
   - ✅ Point marked as paused
7. Click "Continue"
   - ✅ Next point starts
   - ✅ Measurements continue
8. When all points complete:
   - ✅ Export buttons enabled
   - ✅ Job marked as completed
9. Export results:
   - ✅ CSV downloads correctly
   - ✅ JSON downloads correctly
   - ✅ Data matches measurements

## Performance Testing

### Load Testing

Test with multiple concurrent jobs:

```python
import httpx
import asyncio

async def start_test():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'http://localhost:8000/api/start_test',
            json={
                'target_host': '192.168.1.1',
                'points': 5,
                'repetitions': 2,
                'iperf_mode': 'tcp',
                'iperf_duration': 5
            }
        )
        return response.json()

async def main():
    tasks = [start_test() for _ in range(10)]
    results = await asyncio.gather(*tasks)
    print(f"Started {len(results)} jobs")

asyncio.run(main())
```

### Database Performance

Check database growth with many measurements:

```bash
# Start a long test
# Monitor database file size
watch -n 1 ls -lh backend/db.sqlite

# Check query performance
sqlite3 backend/db.sqlite
SELECT COUNT(*) FROM measurements;
.timer on
SELECT * FROM measurements ORDER BY timestamp DESC LIMIT 100;
```

## Troubleshooting Tests

### Import Errors

If you see `ModuleNotFoundError`:

```bash
cd backend
pip install -r requirements.txt
```

### Test Database Conflicts

Tests use in-memory SQLite. If issues occur:

```bash
rm -f backend/db.sqlite
pytest tests/ -v
```

### WebSocket Connection Issues

If WebSocket tests fail:

1. Check server is running
2. Verify port 8000 is accessible
3. Check firewall settings
4. Try different browser/client

### iperf3 Not Available

Tests mock iperf3 calls. For integration testing:

```bash
# Ubuntu/Debian
sudo apt-get install iperf3

# macOS
brew install iperf3

# Termux
pkg install iperf3
```

## Continuous Integration

The test suite can be integrated into CI/CD:

```yaml
# .github/workflows/wifi-tester-tests.yml
name: WiFi-Tester Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v --cov=app
      - name: Run validation
        run: python3 validate_implementation.py
```

## Security Testing

### Input Validation

Test with invalid inputs:

```bash
# Invalid iperf mode
curl -X POST http://localhost:8000/api/start_test \
  -H "Content-Type: application/json" \
  -d '{"target_host": "test", "points": 1, "repetitions": 1, "iperf_mode": "invalid"}'

# Out of range values
curl -X POST http://localhost:8000/api/start_test \
  -H "Content-Type: application/json" \
  -d '{"target_host": "test", "points": 1000, "repetitions": 100}'
```

### Command Injection

Tests verify that external commands are called safely:
- No shell=True usage
- Commands use list-based arguments
- Timeouts prevent hanging

### SQL Injection

SQLModel with parameterized queries prevents SQL injection.
Tests verify database operations are safe.

## Test Maintenance

### Adding New Tests

1. Create test file in `backend/tests/`
2. Follow existing patterns
3. Use pytest fixtures for setup
4. Mock external dependencies
5. Test both success and error cases

### Updating Tests

When modifying code:
1. Update corresponding tests
2. Add tests for new features
3. Verify all tests pass
4. Check test coverage

### Test Best Practices

- ✅ Test one thing per test
- ✅ Use descriptive test names
- ✅ Mock external dependencies
- ✅ Test error conditions
- ✅ Keep tests fast
- ✅ Make tests independent
- ✅ Use fixtures for common setup

## Reporting Issues

When reporting test failures:

1. Include Python version
2. Include platform (Linux/Termux/Docker)
3. Include full error output
4. Include steps to reproduce
5. Include relevant logs

Run diagnostics:

```bash
python3 validate_implementation.py
cd backend
pytest tests/ -v --tb=long
```
