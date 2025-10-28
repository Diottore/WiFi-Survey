// WiFi-Tester Frontend Application

let currentJobId = null;
let ws = null;
let map = null;
let markers = {};

// ECharts instances
let rssiChart = null;
let throughputChart = null;
let latencyChart = null;
let packetLossChart = null;

// Data storage
let measurementData = {
    points: [],
    rssi: [],
    throughputDl: [],
    throughputUl: [],
    latency: [],
    jitter: [],
    packetLoss: []
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    initializeMap();
    setupEventListeners();
});

function setupEventListeners() {
    const form = document.getElementById('testForm');
    form.addEventListener('submit', handleStartTest);
    
    const continueBtn = document.getElementById('continueBtn');
    continueBtn.addEventListener('click', handleContinue);
}

function initializeCharts() {
    // RSSI Chart
    rssiChart = echarts.init(document.getElementById('rssiChart'));
    rssiChart.setOption({
        title: { text: 'RSSI (dBm)' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: 'dBm' },
        series: [{
            name: 'RSSI',
            type: 'line',
            data: [],
            smooth: true,
            itemStyle: { color: '#5470c6' }
        }]
    });

    // Throughput Chart
    throughputChart = echarts.init(document.getElementById('throughputChart'));
    throughputChart.setOption({
        title: { text: 'Throughput (Mbps)' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Download', 'Upload'] },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: 'Mbps' },
        series: [
            {
                name: 'Download',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#91cc75' }
            },
            {
                name: 'Upload',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#fac858' }
            }
        ]
    });

    // Latency Chart
    latencyChart = echarts.init(document.getElementById('latencyChart'));
    latencyChart.setOption({
        title: { text: 'Latencia y Jitter (ms)' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Latencia', 'Jitter'] },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: 'ms' },
        series: [
            {
                name: 'Latencia',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#ee6666' }
            },
            {
                name: 'Jitter',
                type: 'line',
                data: [],
                smooth: true,
                itemStyle: { color: '#73c0de' }
            }
        ]
    });

    // Packet Loss Chart
    packetLossChart = echarts.init(document.getElementById('packetLossChart'));
    packetLossChart.setOption({
        title: { text: 'Pérdida de Paquetes (%)' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: '%', max: 100 },
        series: [{
            name: 'Packet Loss',
            type: 'bar',
            data: [],
            itemStyle: { color: '#fc8452' }
        }]
    });

    // Resize charts on window resize
    window.addEventListener('resize', function() {
        rssiChart.resize();
        throughputChart.resize();
        latencyChart.resize();
        packetLossChart.resize();
    });
}

function initializeMap() {
    map = L.map('map').setView([40.7128, -74.0060], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function addPoint() {
    const pointsList = document.getElementById('pointsList');
    const pointCount = pointsList.children.length + 1;
    
    const pointItem = document.createElement('div');
    pointItem.className = 'point-item';
    pointItem.innerHTML = `
        <input type="text" placeholder="ID (ej: P${pointCount})" class="point-id" value="P${pointCount}">
        <input type="number" placeholder="Latitud" class="point-lat" step="0.000001">
        <input type="number" placeholder="Longitud" class="point-lng" step="0.000001">
        <button type="button" class="btn-remove" onclick="removePoint(this)">×</button>
    `;
    pointsList.appendChild(pointItem);
}

function removePoint(btn) {
    const pointsList = document.getElementById('pointsList');
    if (pointsList.children.length > 1) {
        btn.parentElement.remove();
    } else {
        alert('Debe haber al menos un punto de medición');
    }
}

function getPoints() {
    const pointItems = document.querySelectorAll('.point-item');
    const points = [];
    
    pointItems.forEach(item => {
        const id = item.querySelector('.point-id').value;
        const lat = parseFloat(item.querySelector('.point-lat').value);
        const lng = parseFloat(item.querySelector('.point-lng').value);
        
        const point = { id };
        if (!isNaN(lat)) point.lat = lat;
        if (!isNaN(lng)) point.lng = lng;
        
        points.push(point);
    });
    
    return points;
}

async function handleStartTest(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const points = getPoints();
    
    if (points.length === 0) {
        addLog('Error: Debe agregar al menos un punto de medición', 'error');
        return;
    }
    
    const payload = {
        target_host: formData.get('targetHost'),
        iperf_mode: formData.get('iperfMode'),
        iperf_duration: parseInt(formData.get('iperfDuration')),
        repetitions: parseInt(formData.get('repetitions')),
        points: points
    };
    
    try {
        const response = await fetch('/api/start_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        currentJobId = data.id;
        
        addLog(`Prueba iniciada - Job ID: ${currentJobId}`, 'success');
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('exportJobId').value = currentJobId;
        
        // Clear previous data
        clearCharts();
        clearMarkers();
        
        // Connect WebSocket
        connectWebSocket(currentJobId);
        
        updateStatus(data);
    } catch (error) {
        addLog(`Error al iniciar prueba: ${error.message}`, 'error');
    }
}

async function handleStop() {
    if (!currentJobId) return;
    
    try {
        const response = await fetch('/api/stop_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: currentJobId })
        });
        
        const data = await response.json();
        addLog('Prueba detenida', 'info');
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        
        if (ws) {
            ws.close();
            ws = null;
        }
    } catch (error) {
        addLog(`Error al detener prueba: ${error.message}`, 'error');
    }
}

function handleContinue() {
    if (!ws || !currentJobId) return;
    
    const currentPointId = document.getElementById('currentPointInfo').dataset.pointId;
    
    if (currentPointId) {
        ws.send(JSON.stringify({
            type: 'continue',
            point_id: currentPointId
        }));
        
        addLog(`Continuando desde punto ${currentPointId}`, 'info');
        document.getElementById('continueBtn').style.display = 'none';
    }
}

function connectWebSocket(jobId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?job_id=${jobId}`;
    
    addLog(`Conectando WebSocket: ${wsUrl}`, 'info');
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        addLog('WebSocket conectado', 'success');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onerror = function(error) {
        addLog('Error en WebSocket', 'error');
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = function() {
        addLog('WebSocket desconectado', 'info');
    };
}

function handleWebSocketMessage(data) {
    console.log('WebSocket message:', data);
    
    switch (data.type) {
        case 'measurement':
            handleMeasurement(data);
            break;
        case 'point_done':
            handlePointDone(data);
            break;
        case 'status':
            handleStatusUpdate(data);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

function handleMeasurement(data) {
    addLog(`Medición recibida - Punto: ${data.point_id}, Rep: ${data.rep}`, 'info');
    
    const label = `${data.point_id}-R${data.rep}`;
    measurementData.points.push(label);
    
    // Update charts
    if (data.rssi !== null) {
        measurementData.rssi.push(data.rssi);
    }
    
    if (data.throughput_dl_kbps !== null) {
        measurementData.throughputDl.push((data.throughput_dl_kbps / 1000).toFixed(2));
    }
    
    if (data.throughput_ul_kbps !== null) {
        measurementData.throughputUl.push((data.throughput_ul_kbps / 1000).toFixed(2));
    }
    
    if (data.latency_ms !== null) {
        measurementData.latency.push(data.latency_ms.toFixed(2));
    }
    
    if (data.jitter_ms !== null) {
        measurementData.jitter.push(data.jitter_ms.toFixed(2));
    }
    
    if (data.packet_loss_pct !== null) {
        measurementData.packetLoss.push(data.packet_loss_pct);
    }
    
    updateCharts();
}

function handlePointDone(data) {
    addLog(`Punto ${data.point_id} completado - Estado: ${data.status}`, 'success');
    
    if (data.status === 'paused') {
        document.getElementById('currentPoint').style.display = 'block';
        document.getElementById('currentPointInfo').textContent = `Punto ${data.point_id} completado. Haga clic en continuar para el siguiente punto.`;
        document.getElementById('currentPointInfo').dataset.pointId = data.point_id;
        document.getElementById('continueBtn').style.display = 'inline-block';
    }
}

function handleStatusUpdate(data) {
    addLog(`Estado actualizado: ${data.status}`, 'info');
    
    if (data.status === 'completed' || data.status === 'stopped') {
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('currentPoint').style.display = 'none';
        
        if (ws) {
            ws.close();
            ws = null;
        }
    }
}

function updateCharts() {
    // RSSI
    rssiChart.setOption({
        xAxis: { data: measurementData.points },
        series: [{ data: measurementData.rssi }]
    });
    
    // Throughput
    throughputChart.setOption({
        xAxis: { data: measurementData.points },
        series: [
            { data: measurementData.throughputDl },
            { data: measurementData.throughputUl }
        ]
    });
    
    // Latency
    latencyChart.setOption({
        xAxis: { data: measurementData.points },
        series: [
            { data: measurementData.latency },
            { data: measurementData.jitter }
        ]
    });
    
    // Packet Loss
    packetLossChart.setOption({
        xAxis: { data: measurementData.points },
        series: [{ data: measurementData.packetLoss }]
    });
}

function clearCharts() {
    measurementData = {
        points: [],
        rssi: [],
        throughputDl: [],
        throughputUl: [],
        latency: [],
        jitter: [],
        packetLoss: []
    };
    updateCharts();
}

function clearMarkers() {
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};
}

function updateStatus(data) {
    const statusPanel = document.getElementById('statusPanel');
    statusPanel.innerHTML = `
        <p><strong>Job ID:</strong> ${data.id}</p>
        <p><strong>Host:</strong> ${data.target_host}</p>
        <p><strong>Estado:</strong> ${data.status}</p>
        <p><strong>Modo:</strong> ${data.iperf_mode}</p>
        <p><strong>Duración:</strong> ${data.iperf_duration}s</p>
        <p><strong>Repeticiones:</strong> ${data.repetitions}</p>
    `;
}

function addLog(message, type = 'info') {
    const logsDiv = document.getElementById('logs');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    logsDiv.appendChild(logEntry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

async function exportData(format) {
    const jobId = document.getElementById('exportJobId').value;
    
    if (!jobId) {
        addLog('Error: Ingrese un Job ID para exportar', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/export?job_id=${jobId}&format=${format}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wifi_test_job_${jobId}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        addLog(`Archivo ${format.toUpperCase()} descargado`, 'success');
    } catch (error) {
        addLog(`Error al exportar: ${error.message}`, 'error');
    }
}

// Make functions global
window.addPoint = addPoint;
window.removePoint = removePoint;
window.exportData = exportData;

// Setup stop button
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('stopBtn').addEventListener('click', handleStop);
});
