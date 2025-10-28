# WiFi-Tester Architecture

## Overview

WiFi-Tester is a complete WiFi testing solution built with FastAPI backend and a modern Single-Page Application (SPA) frontend. It enables real-time WiFi performance measurements with support for multiple test points and repetitions.

## Architecture Components

### Backend (FastAPI)

#### Technology Stack
- **Framework**: FastAPI (Python 3.9+)
- **Database**: SQLite with SQLModel ORM
- **Real-time Communication**: WebSocket
- **Async Processing**: asyncio for background tasks

#### Core Modules

1. **models.py** - Database Models
   - `Job`: Represents a test job with configuration
   - `Point`: Represents a measurement point
   - `Measurement`: Stores individual measurement results

2. **db.py** - Database Management
   - SQLite connection and session management
   - Database initialization
   - Session context managers

3. **runner.py** - Measurement Engine
   - `CommandRunner`: Executes external commands asynchronously
   - `RSSIDetector`: Multi-strategy RSSI detection with fallback
   - `MeasurementRunner`: Orchestrates ping, iperf3, and RSSI measurements

4. **main.py** - API Endpoints
   - REST API for job control (start, stop, status, export)
   - WebSocket for real-time updates
   - Background task management

5. **schemas.py** - Request/Response Models
   - Pydantic models for validation
   - WebSocket message schemas

6. **utils.py** - Helper Functions
   - Output parsers for ping, iperf3, and RSSI commands
   - Data formatting utilities

#### API Endpoints

**REST Endpoints:**
- `POST /api/start_test` - Start a new test job
- `POST /api/stop_test` - Stop a running job
- `GET /api/status?job_id=...` - Get job status
- `GET /api/export?job_id=...&format=csv|json` - Export results
- `POST /api/continue` - Continue to next point after pause

**WebSocket:**
- `/ws` - Real-time measurement updates and control

#### RSSI Detection Strategy

The system attempts RSSI detection in the following order:
1. `termux-wifi-connectioninfo` (Termux/Android)
2. `dumpsys wifi` (Android)
3. `iw dev wlan0 link` (Linux with iw)
4. `iwconfig wlan0` (Linux with wireless-tools)

The first successful method is cached for subsequent measurements.

#### Measurement Flow

1. **Job Creation**: User initiates job via REST API
2. **Point Iteration**: For each point (1 to N):
   - Execute M repetitions of measurements
   - Each repetition includes:
     - RSSI detection
     - Latency/jitter/packet loss (ping/fping)
     - Download throughput (iperf3)
     - Upload throughput (iperf3)
   - After completing repetitions, pause and wait for continue signal
3. **Real-time Updates**: Send measurements via WebSocket
4. **Persistence**: Store all measurements in SQLite
5. **Export**: Generate CSV or JSON on demand

### Frontend (SPA)

#### Technology Stack
- **UI Framework**: Vanilla JavaScript (ES6+)
- **Maps**: Leaflet.js
- **Charts**: Apache ECharts
- **Styling**: CSS3 with responsive design

#### Core Components

1. **index.html** - Application Structure
   - Control panel for test configuration
   - Map view for point visualization
   - Real-time chart displays
   - Progress indicators

2. **app.js** - Application Logic
   - WebSocket connection management
   - Chart updates and data management
   - User interaction handling
   - Map marker management

3. **styles.css** - Visual Design
   - Responsive layout
   - Modern gradient design
   - Chart and map styling

#### User Workflow

1. **Configuration**: Enter target host, points, repetitions, iperf3 settings
2. **Start Test**: Click "Start Test" to begin measurement campaign
3. **Real-time Monitoring**: View measurements as they arrive via WebSocket
4. **Point Completion**: When a point completes all repetitions:
   - UI shows "Continue" button
   - User moves to next physical location
   - User clicks "Continue" to resume
5. **Export Results**: Download CSV or JSON when test completes

## Data Flow

```
User Input → FastAPI Endpoint → Background Task → Measurement Runner
                                        ↓
                                  External Tools
                               (ping, iperf3, rssi)
                                        ↓
                                  Parse Results
                                        ↓
                                  Store in SQLite
                                        ↓
                              Broadcast via WebSocket
                                        ↓
                               Frontend Updates Charts
```

## Database Schema

### Jobs Table
- id (PK)
- job_id (unique)
- target_host
- points_count
- repetitions
- iperf_mode (tcp/udp)
- iperf_duration
- status
- created_at, started_at, completed_at
- error_message

### Points Table
- id (PK)
- job_id (FK)
- point_id
- sequence
- status
- repetitions_completed
- created_at, started_at, completed_at

### Measurements Table
- id (PK)
- job_id
- point_id (FK)
- repetition
- timestamp
- rssi_dbm
- throughput_dl_kbps
- throughput_ul_kbps
- latency_ms
- jitter_ms
- packet_loss_pct
- error_message

## Deployment

### Termux/Android
```bash
cd backend
pip install -r requirements.txt
bash start.sh
```

### Linux Desktop
```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Docker
```bash
cd backend
docker build -t wifi-tester .
docker run -p 8000:8000 -v $(pwd)/data:/app/data wifi-tester
```

## Testing

### Backend Tests
```bash
cd backend
pytest tests/
```

Tests cover:
- API endpoints (test_api.py)
- Measurement runner (test_runner.py)
- Parser utilities (implicit in runner tests)

## Configuration

Environment variables:
- `DATABASE_URL` - Database connection string (default: sqlite:///./db.sqlite)
- `HOST` - Server host (default: 0.0.0.0)
- `PORT` - Server port (default: 8000)

## Security Considerations

- All external commands are executed with timeouts
- Input validation via Pydantic schemas
- CORS enabled for development (should be restricted in production)
- WebSocket messages validated
- Database queries use parameterized statements (SQLModel)

## Future Enhancements

- Authentication and authorization
- Multi-user support
- GPS integration for automatic point positioning
- Advanced analytics and reporting
- Support for additional measurement tools
- Mobile app (React Native)
- Real-time collaboration features
