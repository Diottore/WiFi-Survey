#!/data/data/com.termux/files/usr/bin/bash
# WiFi-Tester startup script for Termux

echo "=== WiFi-Tester Startup Script ==="
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "Warning: This script is optimized for Termux"
fi

# Change to backend directory
cd "$(dirname "$0")"

# Check Python
if ! command -v python &> /dev/null; then
    echo "Error: Python is not installed"
    echo "Install with: pkg install python"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check if iperf3 is installed
if ! command -v iperf3 &> /dev/null; then
    echo "Warning: iperf3 is not installed"
    echo "Install with: pkg install iperf3"
    echo "Tests will run in simulated mode"
fi

# Start the application
echo ""
echo "Starting WiFi-Tester API server..."
echo "Access the web interface at: http://127.0.0.1:8000/app"
echo "Press Ctrl+C to stop"
echo ""

# Run with uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
