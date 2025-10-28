# WiFi-Tester - Complete WiFi Testing Solution

## Overview

WiFi-Tester is a modern, full-featured WiFi performance testing application built with FastAPI backend and a responsive Single-Page Application frontend. It provides real-time measurements of WiFi performance including RSSI, throughput, latency, and jitter.

## Features

### 🎯 Core Capabilities
- **Real-time Measurements**: Live monitoring of WiFi performance metrics
- **Multi-point Testing**: Support for multiple test locations with automatic pause/continue workflow
- **Comprehensive Metrics**:
  - RSSI (Received Signal Strength Indicator)
  - Download/Upload Throughput (via iperf3)
  - Latency, Jitter, Packet Loss (via ping/fping)
- **Data Persistence**: SQLite database for storing all measurements
- **Export Options**: CSV and JSON export formats
- **Visual Analytics**: Real-time charts and map-based point tracking

### 🔧 Technical Features
- **Async Processing**: Non-blocking background tasks for measurements
- **WebSocket Communication**: Real-time updates from server to client
- **Multi-strategy RSSI Detection**: Automatic fallback across multiple detection methods
- **Termux/Android Support**: Optimized for mobile WiFi testing
- **Docker Support**: Easy containerized deployment

## Quick Start

### Prerequisites

#### For Termux/Android
- **Termux** and **Termux:API** from F-Droid
- Python 3.9+
- iperf3
- termux-api package

#### For Linux/Desktop
- Python 3.9+
- iperf3
- ping or fping
- (Optional) iw or iwconfig for RSSI detection

### Installation

#### Termux/Android

```bash
# Install system packages
pkg update && pkg upgrade -y
pkg install python iperf3 termux-api git -y

# Clone repository
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey

# Checkout WiFi-Tester branch
git checkout WiFi-Tester

# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start the server
bash start.sh
```

#### Linux/Desktop

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install python3 python3-pip iperf3 fping iw wireless-tools

# Clone repository
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey

# Checkout WiFi-Tester branch
git checkout WiFi-Tester

# Install Python dependencies
cd backend
pip3 install -r requirements.txt

# Start the server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### Using Docker

```bash
cd WiFi-Survey/backend
docker build -t wifi-tester .
docker run -p 8000:8000 -v $(pwd)/data:/app/data wifi-tester
```

### Setting up iperf3 Server

On your target server or PC:

```bash
# Install iperf3
# Ubuntu/Debian:
sudo apt-get install iperf3

# macOS:
brew install iperf3

# Run iperf3 server
iperf3 -s
```

## Usage

### 1. Start the Backend

```bash
cd backend
bash start.sh
```

The server will start on `http://0.0.0.0:8000`

### 2. Access the Web Interface

Open your browser and navigate to:
- From the same device: `http://localhost:8000`
- From another device on the network: `http://<device-ip>:8000`

### 3. Configure Test Parameters

In the web interface:
1. **Target Host**: IP address of your iperf3 server (e.g., `192.168.1.10`)
2. **Number of Points**: How many measurement locations (e.g., `5`)
3. **Repetitions per Point**: Measurements per location (e.g., `2`)
4. **iperf3 Mode**: TCP or UDP
5. **iperf3 Duration**: Test duration in seconds (e.g., `10`)

### 4. Run Tests

1. Click **Start Test** to begin
2. Wait for measurements to complete at first point
3. When prompted, move to next physical location
4. Click **Continue** to proceed with next point
5. Repeat until all points are measured

### 5. View Results

- **Real-time Charts**: View RSSI, throughput, latency, and jitter as tests run
- **Map View**: See test point locations and status
- **Export**: Download results in CSV or JSON format

## API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### REST Endpoints

- `POST /api/start_test` - Start a new test job
- `POST /api/stop_test` - Stop running job
- `GET /api/status?job_id=<id>` - Get job status
- `GET /api/export?job_id=<id>&format=csv|json` - Export results
- `POST /api/continue` - Continue to next point

### WebSocket

- `ws://localhost:8000/ws` - Real-time measurement updates

## Configuration

### Environment Variables

- `DATABASE_URL` - Database connection string (default: `sqlite:///./db.sqlite`)
- `HOST` - Server host (default: `0.0.0.0`)
- `PORT` - Server port (default: `8000`)

### Config File

Edit `backend/config.yaml` to customize:
- Server settings
- iperf3 defaults
- Ping parameters
- RSSI detection settings
- Testing limits

## Testing

Run the test suite:

```bash
cd backend
pytest tests/ -v
```

Tests cover:
- API endpoints
- Measurement runner
- Parser utilities
- Database operations

## Troubleshooting

### iperf3 Connection Failed
- Ensure iperf3 server is running on target host
- Check firewall settings (iperf3 uses port 5201 by default)
- Verify network connectivity with `ping`

### RSSI Detection Not Working
The system tries multiple methods:
1. Check if `termux-wifi-connectioninfo` works (Termux)
2. Try `dumpsys wifi` (Android with proper permissions)
3. Use `iw dev wlan0 link` (Linux)
4. Use `iwconfig wlan0` (Linux)

If none work, RSSI will be reported as `null` but other metrics will still function.

### WebSocket Not Connecting
- Check that backend is running
- Verify port 8000 is accessible
- Check browser console for errors
- Ensure no firewall blocking WebSocket connections

### Termux-specific Issues

**App keeps sleeping:**
```bash
termux-wake-lock
```

**Storage permissions:**
```bash
termux-setup-storage
```

**API not working:**
```bash
pkg install termux-api
# Install Termux:API app from F-Droid
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Development

### Project Structure

```
WiFi-Survey/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application
│   │   ├── models.py        # Database models
│   │   ├── db.py           # Database management
│   │   ├── runner.py       # Measurement engine
│   │   ├── schemas.py      # Request/response models
│   │   └── utils.py        # Helper functions
│   ├── tests/
│   │   ├── test_api.py     # API tests
│   │   └── test_runner.py  # Runner tests
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── start.sh
│   └── config.yaml
├── frontend/
│   ├── index.html
│   └── static/
│       ├── app.js
│       └── styles.css
└── ARCHITECTURE.md
```

### Adding New Features

1. **Backend**: Add endpoints in `main.py`, update models if needed
2. **Frontend**: Update `app.js` for new UI functionality
3. **Tests**: Add tests in `backend/tests/`
4. **Documentation**: Update README and ARCHITECTURE.md

## Security Notes

- **Network Exposure**: If binding to `0.0.0.0`, ensure you're on a trusted network
- **Input Validation**: All inputs are validated via Pydantic schemas
- **Command Injection**: External commands use list-based arguments (no shell=True)
- **Database**: Uses parameterized queries via SQLModel

## Performance Tips

- **Shorter Tests**: For many points, use shorter iperf3 duration (5-10s)
- **TCP vs UDP**: TCP is more reliable, UDP tests raw bandwidth
- **Parallel Streams**: iperf3 with multiple streams may give better results
- **Network Conditions**: Test during off-peak hours for consistent results

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pytest`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [iperf3](https://iperf.fr/) - Network performance measurement
- [Leaflet](https://leafletjs.com/) - Interactive maps
- [Apache ECharts](https://echarts.apache.org/) - Visualization library
- [Termux](https://termux.com/) - Android terminal emulator
- [SQLModel](https://sqlmodel.tiangolo.com/) - SQL databases with Python

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing documentation
- Review ARCHITECTURE.md for technical details

---

Built with ❤️ for the WiFi testing community
