// ...existing code...

function saveAndDisplaySurvey(result) {
    saveSurveyResult(result);
    displaySurveyHistory();
}

// Llamar a esta función al finalizar una encuesta
// saveAndDisplaySurvey(surveyResult);

// Cargar el historial al iniciar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    const startSurveyBtn = document.getElementById('startSurveyBtn');
    const chartTypeSelect = document.getElementById('chartType');
    const chartColorInput = document.getElementById('chartColor');

    if (startSurveyBtn) {
        startSurveyBtn.addEventListener('click', runNewSurvey);
    }
    if (chartTypeSelect) {
        chartTypeSelect.addEventListener('change', updateChartWithHistory);
    }
    if (chartColorInput) {
        chartColorInput.addEventListener('input', updateChartWithHistory);
    }

    // Carga inicial de datos al abrir la página
    displaySurveyHistory();
    updateChartWithHistory();
});

function runNewSurvey() {
    // Esta función simula la obtención de datos de una nueva encuesta de WiFi.
    const newSurveyResult = {
        timestamp: Date.now(),
        networks: [
            { ssid: "WIFI_CASA", signal: -35 - Math.floor(Math.random() * 15) },
            { ssid: "WIFI_VECINO", signal: -55 - Math.floor(Math.random() * 20) },
            { ssid: "RED_MOVIL", signal: -65 - Math.floor(Math.random() * 25) },
            { ssid: `WIFI_RANDOM_${Math.floor(Math.random() * 5)}`, signal: -75 - Math.floor(Math.random() * 15) }
        ]
    };

    saveSurveyResult(newSurveyResult);
    displaySurveyHistory();
    updateChartWithHistory();
}

function updateChartWithHistory() {
    const history = loadSurveyHistory();
    if (history.length === 0) {
        // Si no hay historial, limpia el gráfico.
        const chartType = document.getElementById('chartType').value;
        const chartColor = document.getElementById('chartColor').value;
        updateChart({ labels: [], datasets: [] }, chartType, chartColor);
        return;
    }

    const allSsids = [...new Set(history.flatMap(entry => entry.networks.map(n => n.ssid)))].sort();

    const datasets = history.map((entry, index) => {
        const data = allSsids.map(ssid => {
            const network = entry.networks.find(n => n.ssid === ssid);
            return network ? network.signal : null; // 'null' para que Chart.js no dibuje el punto.
        });

        return {
            label: `Encuesta ${index + 1} (${new Date(entry.timestamp).toLocaleTimeString()})`,
            data: data,
        };
    });

    const chartData = {
        labels: allSsids,
        datasets: datasets
    };

    const chartType = document.getElementById('chartType').value;
    const chartColor = document.getElementById('chartColor').value;
    updateChart(chartData, chartType, chartColor);
}