# Dockerfile for WiFi Survey Backend
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    iperf3 \
    iputils-ping \
    fping \
    iproute2 \
    wireless-tools \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Set environment variables
ENV DATABASE_URL=sqlite:///./data/db.sqlite
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
