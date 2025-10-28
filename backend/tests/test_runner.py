"""
Unit tests for runner module.
Tests measurement functions with mocked subprocess calls.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.app.runner import MeasurementRunner, RSSIDetector, CommandRunner


@pytest.mark.asyncio
async def test_command_runner():
    """Test basic command execution"""
    returncode, stdout, stderr = await CommandRunner.run_command(
        ["echo", "test"],
        timeout=5
    )
    
    assert returncode == 0
    assert "test" in stdout
    assert stderr == ""


@pytest.mark.asyncio
async def test_command_runner_timeout():
    """Test command timeout handling"""
    returncode, stdout, stderr = await CommandRunner.run_command(
        ["sleep", "10"],
        timeout=1
    )
    
    assert returncode == -1
    assert stderr == "Timeout"


@pytest.mark.asyncio
async def test_rssi_detector_no_tools():
    """Test RSSI detector when no tools are available"""
    detector = RSSIDetector()
    
    with patch('shutil.which', return_value=None):
        rssi = await detector.detect_rssi()
        assert rssi is None


@pytest.mark.asyncio
async def test_rssi_detector_termux():
    """Test RSSI detection with termux-wifi-connectioninfo"""
    detector = RSSIDetector()
    
    mock_output = '{"rssi": -65}'
    
    with patch('shutil.which', return_value='/usr/bin/termux-wifi-connectioninfo'):
        with patch.object(CommandRunner, 'run_command', 
                         return_value=(0, mock_output, '')):
            rssi = await detector.detect_rssi()
            assert rssi == -65.0


@pytest.mark.asyncio
async def test_measurement_runner_ping():
    """Test ping measurement"""
    runner = MeasurementRunner("192.168.1.1")
    
    mock_ping_output = """
    PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.
    64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.23 ms
    64 bytes from 192.168.1.1: icmp_seq=2 ttl=64 time=1.45 ms
    
    --- 192.168.1.1 ping statistics ---
    2 packets transmitted, 2 received, 0% packet loss, time 1001ms
    rtt min/avg/max/mdev = 1.230/1.340/1.450/0.110 ms
    """
    
    with patch('shutil.which', return_value='/usr/bin/ping'):
        with patch.object(CommandRunner, 'run_command',
                         return_value=(0, mock_ping_output, '')):
            result = await runner.measure_latency(count=2)
            
            assert result['latency_ms'] == 1.340
            assert result['jitter_ms'] == 0.110
            assert result['packet_loss_pct'] == 0.0


@pytest.mark.asyncio
async def test_measurement_runner_iperf3_json():
    """Test iperf3 measurement with JSON output"""
    runner = MeasurementRunner("192.168.1.1", iperf_mode="tcp", iperf_duration=5)
    
    mock_iperf_output = '''
    {
        "end": {
            "sum_received": {
                "bits_per_second": 100000000
            }
        }
    }
    '''
    
    with patch('shutil.which', return_value='/usr/bin/iperf3'):
        with patch.object(CommandRunner, 'run_command',
                         return_value=(0, mock_iperf_output, '')):
            result = await runner.measure_throughput(direction="download")
            
            assert result == 100000.0  # 100 Mbps = 100000 Kbps


@pytest.mark.asyncio
async def test_measurement_runner_no_iperf3():
    """Test iperf3 measurement when iperf3 is not available"""
    runner = MeasurementRunner("192.168.1.1")
    
    with patch('shutil.which', return_value=None):
        result = await runner.measure_throughput()
        assert result is None


@pytest.mark.asyncio
async def test_full_measurement():
    """Test full measurement run"""
    runner = MeasurementRunner("192.168.1.1", iperf_mode="tcp", iperf_duration=5)
    
    # Mock all external calls
    with patch.object(runner, 'measure_rssi', return_value=-60.0):
        with patch.object(runner, 'measure_latency', 
                         return_value={'latency_ms': 10.0, 'jitter_ms': 2.0, 'packet_loss_pct': 0.0}):
            with patch.object(runner, 'measure_throughput',
                             side_effect=[50000.0, 30000.0]):  # DL then UL
                result = await runner.run_full_measurement()
                
                assert result['rssi_dbm'] == -60.0
                assert result['latency_ms'] == 10.0
                assert result['jitter_ms'] == 2.0
                assert result['packet_loss_pct'] == 0.0
                assert result['throughput_dl_kbps'] == 50000.0
                assert result['throughput_ul_kbps'] == 30000.0
                assert result['error_message'] is None
