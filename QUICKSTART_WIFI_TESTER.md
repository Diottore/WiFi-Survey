# WiFi-Tester Quick Start Guide

Get started with WiFi-Tester in under 10 minutes!

## Prerequisites

- Python 3.8 or higher
- iperf3 server running on target host
- (Optional) Termux + Termux:API for Android

## Installation

### Option 1: Quick Install (Termux/Linux)

```bash
# Clone repository
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey

# Checkout WiFi-Tester branch
git checkout WiFi-Tester

# Install and start
cd backend
bash start.sh --install
```

### Option 2: Manual Install

```bash
# Clone and checkout
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey
git checkout WiFi-Tester

# Install dependencies
cd backend
pip install -r requirements.txt

# Start server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Option 3: Docker

```bash
cd WiFi-Survey/backend
docker build -t wifi-tester .
docker run -p 8000:8000 -v $(pwd)/data:/app/data wifi-tester
```

## Setup iperf3 Server

On your target PC/server:

```bash
# Install iperf3
# Ubuntu/Debian:
sudo apt-get install iperf3

# macOS:
brew install iperf3

# Run server
iperf3 -s
```

Note the IP address of this server (e.g., `192.168.1.10`)

## First Test

### 1. Start WiFi-Tester

```bash
cd backend
bash start.sh
```

Server starts at `http://0.0.0.0:8000`

### 2. Open Web Interface

- From same device: http://localhost:8000
- From network: http://YOUR_DEVICE_IP:8000

### 3. Configure Test

In the web interface:
- **Target Host**: `192.168.1.10` (your iperf3 server IP)
- **Number of Points**: `3` (test locations)
- **Repetitions per Point**: `2` (measurements per location)
- **iperf3 Mode**: `tcp` (or `udp`)
- **iperf3 Duration**: `10` seconds

### 4. Run Test

1. Click **"Start Test"**
2. Watch real-time measurements appear:
   - RSSI (signal strength)
   - Download/Upload throughput
   - Latency and jitter
   - Maps and charts update live

3. When Point 1 completes:
   - Move to next physical location
   - Click **"Continue"** button

4. Repeat for all points

5. When complete:
   - Click **"Export CSV"** or **"Export JSON"**
   - Save results

## Understanding the Interface

### Control Panel (Left Side)

- **Configuration**: Set test parameters
- **Start/Stop**: Control test execution
- **Status**: Current job status
- **Continue**: Appears when point completes
- **Export**: Download results

### Visualization (Right Side)

- **Map**: Shows test point locations and status
  - Gray = Pending
  - Orange = Running
  - Yellow = Paused
  - Green = Done
  - Red = Failed

- **Charts**: Real-time measurement graphs
  - RSSI: Signal strength over time
  - Throughput: Download/Upload speeds
  - Latency: Response time
  - Jitter: Latency variation

## Common Scenarios

### Scenario 1: Home WiFi Coverage Test

Test WiFi coverage in different rooms:

```
Configuration:
- Points: 5 (living room, bedroom, kitchen, office, basement)
- Repetitions: 3
- Mode: TCP
- Duration: 10s

Process:
1. Start in living room → Start Test
2. Complete → Move to bedroom → Continue
3. Repeat for each room
4. Export results for analysis
```

### Scenario 2: Office WiFi Performance

Test office WiFi at different times:

```
Configuration:
- Points: 10 (various desks/meeting rooms)
- Repetitions: 5
- Mode: TCP
- Duration: 15s

Process:
1. Mark locations on floor plan
2. Test each location
3. Export CSV
4. Analyze in spreadsheet
```

### Scenario 3: Outdoor Coverage

Test WiFi range outside:

```
Configuration:
- Points: 20 (gradually moving away)
- Repetitions: 2
- Mode: UDP (for max speed)
- Duration: 5s

Process:
1. Start at access point
2. Move 5 meters → Continue
3. Repeat until signal lost
4. Export results
5. Plot on map
```

## Interpreting Results

### RSSI (Signal Strength)

- `-30 to -50 dBm`: Excellent
- `-50 to -60 dBm`: Good
- `-60 to -70 dBm`: Fair
- `-70 to -80 dBm`: Weak
- Below `-80 dBm`: Very weak

### Throughput

Typical WiFi speeds:
- WiFi 6 (802.11ax): Up to 1-2 Gbps
- WiFi 5 (802.11ac): Up to 500-1000 Mbps
- WiFi 4 (802.11n): Up to 100-300 Mbps

### Latency

- `< 10 ms`: Excellent
- `10-20 ms`: Good
- `20-50 ms`: Fair
- `> 50 ms`: Poor (check for interference)

### Jitter

- `< 5 ms`: Excellent (good for VoIP/gaming)
- `5-10 ms`: Acceptable
- `> 10 ms`: May affect real-time applications

## Troubleshooting

### Can't Connect to Server

```bash
# Check if server is running
curl http://localhost:8000/health

# Check what's using port 8000
sudo lsof -i :8000

# Try different port
PORT=8080 bash start.sh
```

### iperf3 Connection Fails

```bash
# Test connectivity
ping 192.168.1.10

# Test iperf3 manually
iperf3 -c 192.168.1.10 -t 5

# Check firewall
# iperf3 uses port 5201 by default
```

### RSSI Not Detected

RSSI detection depends on platform:

**Termux/Android:**
```bash
# Check termux-api
termux-wifi-connectioninfo

# Grant location permission to Termux:API app
```

**Linux:**
```bash
# Check wireless tools
iw dev wlan0 link
# or
iwconfig wlan0
```

**Note**: RSSI will show as `null` if detection fails, but other metrics still work.

### WebSocket Not Connecting

1. Check browser console for errors
2. Try different browser
3. Verify WebSocket URL matches server
4. Check for proxy/firewall blocking WebSocket

## Tips for Best Results

1. **Stable Position**: Keep device still during measurements
2. **Multiple Repetitions**: Use 3-5 repetitions for accuracy
3. **Consistent Timing**: Test at same time of day
4. **Document Setup**: Note access point location, settings
5. **Control Variables**: Keep number of devices constant
6. **Battery**: Ensure device won't sleep (use termux-wake-lock)

## Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- See [TESTING.md](TESTING.md) for testing guide
- Check [WIFI_TESTER_README.md](WIFI_TESTER_README.md) for full documentation
- Explore API docs at http://localhost:8000/docs

## Advanced Usage

### API Access

```bash
# Start test via API
curl -X POST http://localhost:8000/api/start_test \
  -H "Content-Type: application/json" \
  -d '{
    "target_host": "192.168.1.10",
    "points": 5,
    "repetitions": 3,
    "iperf_mode": "tcp",
    "iperf_duration": 10
  }'

# Get status
curl http://localhost:8000/api/status?job_id=YOUR_JOB_ID

# Export
curl http://localhost:8000/api/export?job_id=YOUR_JOB_ID&format=csv -o results.csv
```

### Custom Configuration

Edit `backend/config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8000

iperf3:
  default_duration: 10
  default_mode: "tcp"

limits:
  max_points: 100
  max_repetitions: 10
```

### Automation

```python
# Python script to automate testing
import httpx
import time

async def run_wifi_test():
    async with httpx.AsyncClient() as client:
        # Start test
        response = await client.post(
            'http://localhost:8000/api/start_test',
            json={
                'target_host': '192.168.1.10',
                'points': 10,
                'repetitions': 3,
                'iperf_mode': 'tcp',
                'iperf_duration': 10
            }
        )
        
        job_id = response.json()['job_id']
        print(f"Started job: {job_id}")
        
        # Poll status
        while True:
            status = await client.get(
                f'http://localhost:8000/api/status?job_id={job_id}'
            )
            data = status.json()
            
            if data['status'] in ['completed', 'failed', 'stopped']:
                break
            
            time.sleep(5)
        
        # Export results
        csv = await client.get(
            f'http://localhost:8000/api/export?job_id={job_id}&format=csv'
        )
        
        with open(f'{job_id}.csv', 'w') as f:
            f.write(csv.text)
        
        print(f"Results saved to {job_id}.csv")
```

## Support

For issues or questions:
- Check [WIFI_TESTER_README.md](WIFI_TESTER_README.md)
- Review [TESTING.md](TESTING.md)
- Open issue on GitHub
- Read [ARCHITECTURE.md](ARCHITECTURE.md)

Happy testing! 📡
