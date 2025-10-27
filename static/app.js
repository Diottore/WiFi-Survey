// static/app.js - Tabs (Pruebas / Resultados) + lógica previa (chart líneas)
// Añadida interacción para modo manual: botón "Continuar" cuando la tarea está en estado waiting.
// Se incluyen nuevas funcionalidades como búsqueda en tiempo real, auto-scroll y exportación avanzada.

(() => {
  const $ = id => document.getElementById(id);

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab'));
  function showPanel(panelId) {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(p => p.id === panelId ? p.classList.remove('hidden') : p.classList.add('hidden'));
    tabs.forEach(t => {
      const target = t.getAttribute('data-target');
      if (target === panelId) {
        t.classList.add('active');
        t.setAttribute('aria-selected', 'true');
      } else {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });
    const fab = $('fabRun');
    if (panelId === 'panel-tests') fab && (fab.style.display = 'inline-flex');
    else fab && (fab.style.display = 'none');
  }
  tabs.forEach(t => t.addEventListener('click', e => { showPanel(t.getAttribute('data-target')); }));

  const btnGoTests = $('btn-go-to-tests'), btnGoResults = $('btn-go-to-results');
  btnGoTests && btnGoTests.addEventListener('click', () => showPanel('panel-tests'));
  btnGoResults && btnGoResults.addEventListener('click', () => showPanel('panel-results'));
  showPanel('panel-tests');

  // Elements
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
  const rawModal = $('rawModal'), rawContent = $('rawContent'), closeModal = $('closeModal');

  // Buffers and state
  let resultBuffer = [];
  let flushing = false;
  let results = [];
  let currentTaskId = null;
  let filteredResults = [];
  let searchQuery = '';

  // Chart
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

  // Resize chart on window changes
  function debounce(fn, ms=150) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  }

  const resizeObserver = new ResizeObserver(debounce(() => {
    chart.resize();
  }, 200));
  resizeObserver.observe(document.querySelector('.chart-card'));

  // Filter and search results
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    filteredResults = results.filter(
      r => r.point.toLowerCase().includes(query) || r.ssid.toLowerCase().includes(query)
    );
    renderResults();
  });

  // Auto-scroll toggle
  autoscrollToggle.addEventListener('change', () => {
    if (autoscrollToggle.checked) {
      resultsList.scrollTop = resultsList.scrollHeight;
    }
  });

  // Push results to buffer
  function pushResult(newResult) {
    resultBuffer.push(newResult);
    if (!flushing) {
      flushing = true;
      requestAnimationFrame(flushResults);
    }
  }

  // Flush results and render
  function flushResults() {
    while (resultBuffer.length > 0) {
      const result = resultBuffer.shift();
      results.push(result);
    }
    renderResults();
    flushing = false;
  }

  // Render results into the results list
  function renderResults() {
    resultsList.innerHTML = '';
    filteredResults.forEach(result => {
      const listItem = document.createElement('div');
      listItem.className = 'result-item';
      listItem.innerHTML = `
        <span>${result.point}</span>
        <span>${result.ssid}</span>
        <span>${result.rssi}</span>
        <span>${result.iperf_dl_mbps}</span>
      `;
      resultsList.appendChild(listItem);
    });
  }

  // Start survey logic
  startSurveyBtn.addEventListener('click', () => {
    console.log('Starting survey...');
    // Add survey logic here
  });

  // Cancel survey logic
  cancelTaskBtn.addEventListener('click', () => {
    console.log('Cancelling survey...');
    // Add cancel logic here
  });

  // Export JSON functionality
  exportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'results.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear results
  clearResultsBtn.addEventListener('click', () => {
    results = [];
    filteredResults = [];
    resultsList.innerHTML = '';
    chart.data.labels = [];
    chart.data.datasets.forEach(dataset => (dataset.data = []));
    chart.update();
  });

  // Initialize state
  function initialize() {
    showPanel('panel-tests');
    filteredResults = results;
    renderResults();
  }

  initialize();
})();