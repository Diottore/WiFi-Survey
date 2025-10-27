// static/app.js - Interfaz mejorada con organización más clara y funcionalidad optimizada.
// Incluye tabs, gráficos, búsquedas, y controles dinámicos con mejoras en la interacción visual.

(() => {
  const $ = id => document.getElementById(id);

  // Manejo de Tabs para organizar la interfaz
  const tabs = Array.from(document.querySelectorAll('.tab'));
  function showPanel(panelId) {
    // Mostrar solo el panel seleccionado
    document.querySelectorAll('.panel').forEach(p => {
      p.id === panelId ? p.classList.remove('hidden') : p.classList.add('hidden');
    });

    // Actualizar el estado visual de las tabs
    tabs.forEach(t => {
      const target = t.getAttribute('data-target');
      t.classList.toggle('active', target === panelId);
      t.setAttribute('aria-selected', target === panelId);
    });

    // Mostrar el botón flotante solo en el panel de pruebas
    $('fabRun').style.display = panelId === 'panel-tests' ? 'inline-flex' : 'none';
  }
  tabs.forEach(t => t.addEventListener('click', () => showPanel(t.getAttribute('data-target'))));

  // Elementos de controles y la interfaz
  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const downloadBtn = $('downloadBtn'), pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), surveyStatus = $('surveyStatus'), progressBar = $('progressBar');
  const resultsList = $('resultsList'), avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl');
  const avgPing = $('avgPing'), avgJitter = $('avgJitter');
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn'), statusDot = $('statusDot');
  const surveyDeviceEl = $('survey_device'), fabRun = $('fabRun');
  const manualCheckbox = $('manual_confirm'), proceedBtn = $('proceedBtn');
  const toggleDL = $('toggleDL'), toggleUL = $('toggleUL'), togglePing = $('togglePing');
  const searchInput = $('searchInput'), autoscrollToggle = $('autoscrollToggle');

  // Variables y estado
  let results = [];
  let filteredResults = [];
  let currentTaskId = null;

  // Configuración del gráfico
  const ctx = document.getElementById('throughputChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'DL Mbps', data: [], borderColor: '#0b74ff', backgroundColor: 'rgba(11,116,255,0.08)', yAxisID: 'y', tension: 0.24, pointRadius: 4, fill: true },
        { label: 'UL Mbps', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.06)', yAxisID: 'y', tension: 0.24, pointRadius: 4, fill: true },
        { label: 'Ping ms', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.04)', yAxisID: 'y1', tension: 0.2, pointRadius: 3, borderDash: [4,2], fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { title: { display: true, text: 'Punto' } },
        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Throughput (Mbps)' }, beginAtZero: true },
        y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Ping (ms)' }, beginAtZero: true, grid: { drawOnChartArea: false } }
      }
    }
  });

  // Función para actualizar el resumen
  function updateSummary() {
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '—';
    avgRssi.textContent = avg(results.map(r => r.rssi));
    avgDl.textContent = avg(results.map(r => r.iperf_dl_mbps));
    avgUl.textContent = avg(results.map(r => r.iperf_ul_mbps));
    avgPing.textContent = avg(results.map(r => r.ping_avg));
    avgJitter.textContent = avg(results.map(r => r.ping_jitter));
  }

  // Función para renderizar los resultados
  function renderResults() {
    resultsList.innerHTML = '';
    filteredResults.forEach(result => {
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <div class="result-point">${result.point}</div>
        <div class="result-dl">${result.iperf_dl_mbps} Mbps</div>
        <div class="result-ul">${result.iperf_ul_mbps} Mbps</div>
        <div class="result-ping">${result.ping_avg} ms</div>
      `;
      resultsList.appendChild(div);
    });
  }

  // Buscar en resultados
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    filteredResults = results.filter(r => r.point.toLowerCase().includes(query) || r.ssid.toLowerCase().includes(query));
    renderResults();
  });

  // Botón de ejecutar prueba
  runBtn.addEventListener('click', async () => {
    const point = pointEl.value;
    const device = deviceEl.value;
    console.log(`Running test for ${point} on device ${device}`);
    // Aquí se implementaría la lógica para ejecutar la prueba
  });

  // Botón de iniciar encuesta
  startSurveyBtn.addEventListener('click', async () => {
    console.log('Starting survey...');
    // Aquí se implementaría la lógica para iniciar encuestas
  });

  // Botón de cancelar tarea
  cancelTaskBtn.addEventListener('click', () => {
    console.log('Cancelling task...');
    // Aquí se implementaría la lógica para cancelar la tarea
  });

  // Exportar resultados como JSON
  exportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'results.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Limpiar resultados
  clearResultsBtn.addEventListener('click', () => {
    results = [];
    filteredResults = [];
    renderResults();
    chart.data.labels = [];
    chart.data.datasets.forEach(dataset => dataset.data = []);
    chart.update();
    updateSummary();
  });

  // Inicializar la vista
  function initialize() {
    showPanel('panel-tests');
    filteredResults = results;
    renderResults();
  }

  initialize();
})();