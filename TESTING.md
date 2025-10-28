# Testing Guide for WiFi Survey

## Overview

This document describes the testing infrastructure and procedures for the WiFi Survey application.

## Test Structure

```
WiFi-Survey/
├── test_validation.py          # Unit tests for validation module
├── test_api_integration.py     # Integration tests for API endpoints
└── .github/workflows/ci.yml    # Continuous Integration configuration
```

## Running Tests

### Unit Tests

```bash
# Run validation tests
python3 test_validation.py

# Run with verbose output
python3 test_validation.py -v

# Run specific test class
python3 -m unittest test_validation.TestValidatorDeviceName
```

### Syntax Checking

```bash
# Check Python syntax
python3 -m py_compile app.py
python3 -m py_compile validation.py
python3 -m py_compile iperf3_automation.py

# Check all Python files
find . -name "*.py" -not -path "./.venv/*" -exec python3 -m py_compile {} \;
```

### Linting

```bash
# Install development dependencies first
pip install -r requirements-dev.txt

# Run flake8 for style checking
flake8 app.py validation.py --max-line-length=120

# Run pylint for comprehensive analysis
pylint app.py validation.py

# Auto-format code with black
black app.py validation.py --line-length=120
```

### Shell Script Testing

```bash
# Run shellcheck on bash scripts
shellcheck mobile_wifi_survey.sh
shellcheck install.sh
```

## Test Coverage

### Current Test Coverage

**validation.py**: ~100% coverage
- Device name validation
- Point ID validation
- Run index validation
- Duration validation
- Parallel streams validation
- Repeats validation
- Points list validation
- Complete payload validation

**app.py**: Partial coverage
- Configuration loading
- Helper functions (parse_ping_time, _percentile)
- API endpoint integration tests

### Adding New Tests

When adding new features, ensure:

1. **Unit tests** for individual functions
2. **Integration tests** for API endpoints
3. **Edge case coverage** for boundary conditions
4. **Error handling tests** for failure modes

Example test structure:

```python
import unittest
from module import function_to_test

class TestNewFeature(unittest.TestCase):
    """Test new feature functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        pass
    
    def tearDown(self):
        """Clean up after tests."""
        pass
    
    def test_normal_case(self):
        """Test normal operation."""
        result = function_to_test(valid_input)
        self.assertEqual(result, expected_output)
    
    def test_edge_case(self):
        """Test boundary conditions."""
        result = function_to_test(edge_input)
        self.assertIsNotNone(result)
    
    def test_error_handling(self):
        """Test error conditions."""
        with self.assertRaises(ExpectedException):
            function_to_test(invalid_input)
```

## Continuous Integration

The project uses GitHub Actions for CI:

- Runs on: Python 3.9, 3.10, 3.11, 3.12
- Checks: Syntax, linting, tests
- Triggers: Push to main, pull requests

## Manual Testing Procedures

### Testing the Flask Application

1. **Start the application**:
   ```bash
   python3 app.py
   ```

2. **Test health endpoint**:
   ```bash
   curl http://localhost:5000/_health
   ```

3. **Test configuration endpoint**:
   ```bash
   curl http://localhost:5000/_survey_config
   ```

4. **Test run_point endpoint**:
   ```bash
   curl -X POST http://localhost:5000/run_point \
     -H "Content-Type: application/json" \
     -d '{"device":"test","point":"P1","run":1}'
   ```

### Testing iperf3 Connectivity

```bash
# Test ping to server
ping -c 5 <SERVER_IP>

# Test iperf3 download
iperf3 -c <SERVER_IP> -t 10

# Test iperf3 upload
iperf3 -c <SERVER_IP> -t 10 -R

# Test JSON output
iperf3 -c <SERVER_IP> -t 5 --json
```

### Testing Termux APIs

```bash
# Test WiFi info
termux-wifi-connectioninfo

# Test location (if needed)
termux-location

# Test wake lock
termux-wake-lock
termux-wake-unlock
```

## Performance Testing

### Load Testing

Test with multiple concurrent requests:

```bash
# Install apache bench
apt install apache2-utils  # or pkg install apache2-utils

# Run load test
ab -n 100 -c 10 http://localhost:5000/_health
```

### Network Performance

Monitor during iperf3 tests:

```bash
# Monitor network usage
nethogs  # or similar tool

# Monitor CPU/memory
htop

# Check process resources
ps aux | grep python
```

## Debugging

### Enable Debug Logging

Edit `app.py`:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Change from INFO to DEBUG
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### View Real-time Logs

```bash
# Follow application logs
tail -f <log_file>

# Or run with output
python3 app.py 2>&1 | tee app.log
```

### Common Issues and Solutions

**Issue**: Tests fail with import errors
- **Solution**: Ensure you're in the correct directory and virtual environment

**Issue**: iperf3 connection fails
- **Solution**: Check server is running and firewall allows connections

**Issue**: Termux API not working
- **Solution**: Install Termux:API from F-Droid and grant permissions

## Test Data Management

### Creating Test Fixtures

```python
# test_fixtures.py
TEST_WIFI_DATA = {
    "ssid": "TestNetwork",
    "bssid": "00:11:22:33:44:55",
    "rssi": -45,
    "frequency": 5180
}

TEST_IPERF_RESULT = {
    "end": {
        "sum_received": {
            "bits_per_second": 100000000
        }
    }
}
```

### Cleaning Test Data

```bash
# Remove test results
rm -rf raw_results/*_test_*.json
rm wifi_survey_results_test.csv
```

## Pre-commit Hooks

Install pre-commit hooks:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Test Metrics

Track these metrics:
- **Test Coverage**: Aim for >80%
- **Pass Rate**: Should be 100%
- **Execution Time**: Monitor for performance regressions
- **Code Complexity**: Keep functions simple and testable

## Contributing Tests

When contributing:

1. Add tests for new features
2. Ensure all existing tests pass
3. Update test documentation
4. Follow existing test patterns
5. Include both positive and negative test cases

## Resources

- [unittest documentation](https://docs.python.org/3/library/unittest.html)
- [pytest documentation](https://docs.pytest.org/)
- [flake8 documentation](https://flake8.pycqa.org/)
- [shellcheck wiki](https://www.shellcheck.net/wiki/)

## Version

Last updated: 2025-10-28
Document version: 1.0
