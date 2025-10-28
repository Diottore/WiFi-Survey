// WiFi Survey Tester - Frontend Application

class WiFiSurveyApp {
    constructor() {
        this.ws = null;
        this.currentJobId = null;
        this.charts = {};
        this.map = null;
        this.markers = {};
        this.measurementData = {
            rssi: [],
            throughputDL: [],
            throughputUL: [],
            latency: [],
            jitter: []
        };
        
        this.init();
    }
    
    init() {
        this.initMap();
        this.initCharts();
        this.initEventListeners();
        this.connectWebSocket();
    }
    
    initMap() {
        // Initialize Leaflet map centered on a default location
        this.map = L.map('map').setView([0, 0], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
        
        // Add a note about using current location
        L.control.attribution().addTo(this.map);
    }
    
    initCharts() {
        // Initialize ECharts instances
        this.charts.rssi = echarts.init(document.getElementById('rssiChart'));
        this.charts.throughput = echarts.init(document.getElementById('throughputChart'));
        this.charts.latency = echarts.init(document.getElementById('latencyChart'));
        this.charts.jitter = echarts.init(document.getElementById('jitterChart'));
        
        // Configure charts
        const baseOption = {
            tooltip: {
                trigger: 'axis'
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%',
                top: '10%'
            },
            xAxis: {
                type: 'category',
                data: [],
                name: 'Measurement'
            },
            yAxis: {
                type: 'value'
            }
        };
        
        // RSSI Chart
        this.charts.rssi.setOption({
            ...baseOption,
            yAxis: { ...baseOption.yAxis, name: 'dBm' },
            series: [{
                name: 'RSSI',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#667eea' }
            }]
        });
        
        // Throughput Chart
        this.charts.throughput.setOption({
            ...baseOption,
            yAxis: { ...baseOption.yAxis, name: 'Mbps' },
            series: [
                {
                    name: 'Download',
                    type: 'line',
                    data: [],
                    smooth: true,
                    itemStyle: { color: '#48bb78' }
                },
                {
                    name: 'Upload',
                    type: 'line',
                    data: [],
                    smooth: true,
                    itemStyle: { color: '#f6ad55' }
                }
            ],
            legend: {
                data: ['Download', 'Upload'],
                bottom: 0
            }
        });
        
        // Latency Chart
        this.charts.latency.setOption({
            ...baseOption,
            yAxis: { ...baseOption.yAxis, name: 'ms' },
            series: [{
                name: 'Latency',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#f56565' }
            }]
        });
        
        // Jitter Chart
        this.charts.jitter.setOption({
            ...baseOption,
            yAxis: { ...baseOption.yAxis, name: 'ms' },
            series: [{
                name: 'Jitter',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#9f7aea' }
            }]
        });
    }
    
    initEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startTest());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopTest());
        document.getElementById('continueBtn').addEventListener('click', () => this.continueTest());
        document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportResults('csv'));
        document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportResults('json'));
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8000/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('WebSocket connected', 'success');
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('WebSocket error', 'error');
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateStatus('WebSocket disconnected. Reconnecting...', 'warning');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }
    
    handleWebSocketMessage(message) {
        console.log('WebSocket message:', message);
        
        switch (message.type) {
            case 'measurement':
                this.handleMeasurement(message);
                break;
            case 'point_done':
                this.handlePointDone(message);
                break;
            case 'status':
                this.handleStatusUpdate(message);
                break;
            case 'ack':
                console.log('Acknowledgment:', message.message);
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }
    
    handleMeasurement(data) {
        // Update progress display
        document.getElementById('currentPointDisplay').textContent = data.point_id;
        document.getElementById('repetitionDisplay').textContent = `${data.rep}`;
        
        // Create label for chart
        const label = `${data.point_id}-${data.rep}`;
        
        // Update measurement data
        if (data.rssi !== null && data.rssi !== undefined) {
            this.measurementData.rssi.push({ label, value: data.rssi });
        }
        if (data.throughput_dl_kbps !== null) {
            this.measurementData.throughputDL.push({ label, value: data.throughput_dl_kbps / 1000 });
        }
        if (data.throughput_ul_kbps !== null) {
            this.measurementData.throughputUL.push({ label, value: data.throughput_ul_kbps / 1000 });
        }
        if (data.latency_ms !== null) {
            this.measurementData.latency.push({ label, value: data.latency_ms });
        }
        if (data.jitter_ms !== null) {
            this.measurementData.jitter.push({ label, value: data.jitter_ms });
        }
        
        // Update charts
        this.updateCharts();
        
        // Update marker on map if exists
        if (this.markers[data.point_id]) {
            this.markers[data.point_id].setIcon(this.createMarkerIcon('running'));
        }
    }
    
    handlePointDone(data) {
        console.log('Point done:', data.point_id);
        
        // Show continue button
        document.getElementById('continueSection').style.display = 'block';
        document.getElementById('currentPoint').textContent = data.point_id;
        
        // Update marker status
        if (this.markers[data.point_id]) {
            this.markers[data.point_id].setIcon(this.createMarkerIcon('paused'));
        }
        
        this.updateStatus(`Point ${data.point_id} completed. Waiting to continue...`, 'info');
    }
    
    handleStatusUpdate(data) {
        console.log('Status update:', data.status);
        this.updateStatus(`Job ${data.status}`, 'info');
        
        if (data.status === 'completed') {
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            document.getElementById('exportCsvBtn').disabled = false;
            document.getElementById('exportJsonBtn').disabled = false;
            this.updateStatus('Test completed!', 'success');
        } else if (data.status === 'failed') {
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            this.updateStatus(`Test failed: ${data.message || 'Unknown error'}`, 'error');
        }
    }
    
    async startTest() {
        const targetHost = document.getElementById('targetHost').value;
        const points = parseInt(document.getElementById('points').value);
        const repetitions = parseInt(document.getElementById('repetitions').value);
        const iperfMode = document.getElementById('iperfMode').value;
        const iperfDuration = parseInt(document.getElementById('iperfDuration').value);
        
        if (!targetHost) {
            alert('Please enter a target host');
            return;
        }
        
        try {
            const response = await fetch('http://localhost:8000/api/start_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_host: targetHost,
                    points: points,
                    repetitions: repetitions,
                    iperf_mode: iperfMode,
                    iperf_duration: iperfDuration
                })
            });
            
            const data = await response.json();
            
            if (data.ok) {
                this.currentJobId = data.job_id;
                document.getElementById('jobIdDisplay').textContent = `Job ID: ${data.job_id}`;
                document.getElementById('startBtn').disabled = true;
                document.getElementById('stopBtn').disabled = false;
                
                // Reset data
                this.measurementData = {
                    rssi: [],
                    throughputDL: [],
                    throughputUL: [],
                    latency: [],
                    jitter: []
                };
                this.updateCharts();
                
                // Add markers for all points
                this.addPointMarkers(points);
                
                this.updateStatus('Test started', 'success');
            } else {
                alert('Failed to start test');
            }
        } catch (error) {
            console.error('Error starting test:', error);
            alert('Error starting test: ' + error.message);
        }
    }
    
    async stopTest() {
        if (!this.currentJobId) return;
        
        try {
            const response = await fetch('http://localhost:8000/api/stop_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: this.currentJobId })
            });
            
            const data = await response.json();
            
            if (data.ok) {
                document.getElementById('startBtn').disabled = false;
                document.getElementById('stopBtn').disabled = true;
                this.updateStatus('Test stopped', 'warning');
            }
        } catch (error) {
            console.error('Error stopping test:', error);
            alert('Error stopping test: ' + error.message);
        }
    }
    
    async continueTest() {
        const pointId = document.getElementById('currentPoint').textContent;
        
        if (!this.currentJobId || !pointId) return;
        
        // Send continue message via WebSocket
        this.ws.send(JSON.stringify({
            type: 'continue',
            job_id: this.currentJobId,
            point_id: pointId
        }));
        
        // Hide continue button
        document.getElementById('continueSection').style.display = 'none';
        
        // Update marker status
        if (this.markers[pointId]) {
            this.markers[pointId].setIcon(this.createMarkerIcon('done'));
        }
        
        this.updateStatus('Continuing to next point...', 'info');
    }
    
    async exportResults(format) {
        if (!this.currentJobId) {
            alert('No test results to export');
            return;
        }
        
        try {
            const url = `http://localhost:8000/api/export?job_id=${this.currentJobId}&format=${format}`;
            window.open(url, '_blank');
        } catch (error) {
            console.error('Error exporting results:', error);
            alert('Error exporting results: ' + error.message);
        }
    }
    
    updateCharts() {
        // Update RSSI chart
        this.charts.rssi.setOption({
            xAxis: {
                data: this.measurementData.rssi.map(d => d.label)
            },
            series: [{
                data: this.measurementData.rssi.map(d => d.value)
            }]
        });
        
        // Update Throughput chart
        const throughputLabels = [...new Set([
            ...this.measurementData.throughputDL.map(d => d.label),
            ...this.measurementData.throughputUL.map(d => d.label)
        ])];
        
        this.charts.throughput.setOption({
            xAxis: {
                data: throughputLabels
            },
            series: [
                {
                    data: this.measurementData.throughputDL.map(d => d.value)
                },
                {
                    data: this.measurementData.throughputUL.map(d => d.value)
                }
            ]
        });
        
        // Update Latency chart
        this.charts.latency.setOption({
            xAxis: {
                data: this.measurementData.latency.map(d => d.label)
            },
            series: [{
                data: this.measurementData.latency.map(d => d.value)
            }]
        });
        
        // Update Jitter chart
        this.charts.jitter.setOption({
            xAxis: {
                data: this.measurementData.jitter.map(d => d.label)
            },
            series: [{
                data: this.measurementData.jitter.map(d => d.value)
            }]
        });
    }
    
    addPointMarkers(pointsCount) {
        // Clear existing markers
        Object.values(this.markers).forEach(marker => marker.remove());
        this.markers = {};
        
        // Add new markers in a grid pattern around center
        const center = this.map.getCenter();
        const gridSize = Math.ceil(Math.sqrt(pointsCount));
        const spacing = 0.001; // Degrees
        
        for (let i = 0; i < pointsCount; i++) {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const lat = center.lat + (row - gridSize / 2) * spacing;
            const lng = center.lng + (col - gridSize / 2) * spacing;
            
            const pointId = `P${i + 1}`;
            const marker = L.marker([lat, lng], {
                icon: this.createMarkerIcon('pending')
            }).addTo(this.map);
            
            marker.bindPopup(`<b>${pointId}</b><br>Status: Pending`);
            this.markers[pointId] = marker;
        }
    }
    
    createMarkerIcon(status) {
        const colors = {
            pending: '#718096',
            running: '#f6ad55',
            paused: '#f6e05e',
            done: '#48bb78',
            failed: '#f56565'
        };
        
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${colors[status]}; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
            iconSize: [25, 25],
            iconAnchor: [12, 12]
        });
    }
    
    updateStatus(message, type = 'info') {
        const statusDisplay = document.getElementById('statusDisplay');
        statusDisplay.textContent = message;
        
        // Update color based on type
        const colors = {
            info: '#3182ce',
            success: '#38a169',
            warning: '#d69e2e',
            error: '#e53e3e'
        };
        
        statusDisplay.style.color = colors[type] || colors.info;
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new WiFiSurveyApp();
});
