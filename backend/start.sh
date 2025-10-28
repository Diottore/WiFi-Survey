#!/bin/bash
# start.sh - Convenience script to start WiFi Survey backend
# Suitable for Termux and Linux environments

set -e

echo "=== WiFi Survey Backend Startup ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found. Please install Python 3.9+."
    exit 1
fi

echo "Python version: $(python3 --version)"

# Check if we're in the backend directory
if [ ! -f "app/main.py" ]; then
    echo "Error: This script must be run from the backend directory."
    echo "Usage: cd backend && bash start.sh"
    exit 1
fi

# Install dependencies if needed
if [ "$1" == "--install" ]; then
    echo ""
    echo "Installing dependencies..."
    pip install -r requirements.txt
    echo "Dependencies installed."
    echo ""
fi

# Set default host and port
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo ""
echo "Starting FastAPI server..."
echo "Host: $HOST"
echo "Port: $PORT"
echo ""
echo "Access the API at: http://$HOST:$PORT"
echo "API docs at: http://$HOST:$PORT/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start uvicorn
python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
