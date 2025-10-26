// static/app.js - UI mejorada (mobile-first)
// Requiere los endpoints /run_point, /start_survey, /task_status/<id>, /download_csv, /list_raw, /raw/<file>
(() => {
  const $ = id => document.getElementById(id);

  // Elements
  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const downloadBtn = $('downloadBtn'), pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), surveyStatus = $('surveyStatus'), progressBar = $('progressBar');
  const resultsList = $('resultsList'), avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl');
  const exportJsonBtn = $('exportJsonBtn'), statusDot = $('statusDot'), themeToggle = $('themeToggle');
  const serverIpEl = $('serverIp'), runToast = $('runToast');

  serverIpEl.textContent = (window.SERVER_IP || '192.168.1.10');

  // state
  let currentTask = null;
  let results = []; // in-memory recent results

  // chart
  const ctx = document.getElementById('throughputChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'DL Mbps', data: [], backgroundColor: '#0b74ff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });

  // utilities
  function setStatus(online) {
    statusDot.className = online ? 'status online' : 'status offline';
    statusDot.title = online ? 'Conectado' : 'Esperando';
  }
  function showToast(msg, timeout=3000) {
    runToast.hidden = false;
    runToast.textContent = msg;
    runToast.style.opacity = 1;
    setTimeout(()=> { runToast.style.opacity = 0; runToast.hidden = true; }, timeout);
  }
  function prettyNum(n, decimals=2){ return typeof n === 'number' ? n.toFixed(decimals) : n; }

  // run a single point
  runBtn.addEventListener('click', async () => {
    const device = deviceEl.value.trim() || 'phone';
    const point = pointEl.value.trim() || 'P1';
    const run = Number(runEl.value) || 1;
    runBtn.disabled = true;
    showToast(`Iniciando ${point}...`);
    try {
      const res = await fetch('/run_point', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({device, point, run})
      });
      const j = await res.json();
      if(j.ok){
        addResult(j.result);
        setStatus(true);
        showToast('OK: medición completada');
      } else {
        console.error(j);
        showToast('Error en medición');
      }
    } catch (e) {
      console.error(e);
      showToast('Error de red');
      setStatus(false);
    } finally {
      runBtn.disabled = false;
    }
  });

  // add result to UI and memory
  function addResult(r){
    // push to results buffer (keep last 200)
    results.unshift(r);
    if(results.length>200) results.pop();

    // create card
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-left">
        <div>
          <div style="font-weight:700">${r.point}</div>
          <div class="muted">${r.ssid || ''} ${r.bssid ? '('+r.bssid+')' : ''}</div>
        </div>
      </div>
      <div class="result-stats">
        <div class="badge">RSSI ${r.rssi || '—'} dBm</div>
        <div style="margin-top:6px"><strong>${r.iperf_dl_mbps}</strong> Mbps DL</div>
        <div class="muted" style="font-size:0.85rem">${r.iperf_ul_mbps} Mbps UL</div>
        <div style="margin-top:6px"><a href="/raw/${r.raw_file.split('/').pop()}" target="_blank" class="muted">raw</a></div>
      </div>
    `;
    resultsList.prepend(card);

    // update chart
    chart.data.labels.unshift(r.point);
    chart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps) || 0);
    if(chart.data.labels.length>20){ chart.data.labels.pop(); chart.data.datasets[0].data.pop(); }
    chart.update();

    // update summary
    updateSummary();
  }

  function updateSummary(){
    if(results.length===0){
      avgRssi.textContent = '—'; avgDl.textContent = '—'; avgUl.textContent = '—';
      return;
    }
    const n = results.length;
    const rssiVals = results.map(x => Number(x.rssi)).filter(v => !isNaN(v));
    const dlVals = results.map(x => Number(x.iperf_dl_mbps)).filter(v => !isNaN(v));
    const ulVals = results.map(x => Number(x.iperf_ul_mbps)).filter(v => !isNaN(v));

    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals)) + ' dBm' : '—';
    avgDl.textContent = dlVals.length ? prettyNum(avg(dlVals)) + ' Mbps' : '—';
    avgUl.textContent = ulVals.length ? prettyNum(avg(ulVals)) + ' Mbps' : '—';
  }

  // survey background
  startSurveyBtn.addEventListener('click', async () => {
    const device = $('survey_device') ? $('survey_device').value.trim() : (deviceEl.value || 'phone');
    const ptsRaw = pointsEl.value.trim();
    if(!ptsRaw){ alert('Introduce al menos un punto'); return; }
    const points = ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(s=>s) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(s=>s);
    const repeats = Number(repeatsEl.value) || 1;

    startSurveyBtn.disabled = true;
    surveyArea.hidden = false;
    surveyLog.textContent = 'Creando tarea...';
    progressBar.value = 0;
    surveyStatus.textContent = 'Encolando...';

    try {
      const res = await fetch('/start_survey', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device, points, repeats})
      });
      const j = await res.json();
      if(!j.ok){ surveyLog.textContent = 'Error: ' + (j.error || ''); startSurveyBtn.disabled = false; return; }
      currentTask = j.task_id;
      cancelTaskBtn.disabled = false;
      pollTask(currentTask);
    } catch (e) {
      surveyLog.textContent = 'Error al iniciar encuesta: ' + e;
      startSurveyBtn.disabled = false;
    }
  });

  // poll task
  let pollInterval = null;
  function pollTask(taskId){
    surveyLog.textContent = '';
    pollInterval = setInterval(async () => {
      try {
        const r = await fetch(`/task_status/${taskId}`);
        const js = await r.json();
        if(!js){ surveyLog.textContent = 'Sin respuesta'; return; }
        surveyStatus.textContent = `${js.status} — ${js.done || 0}/${js.total || 0}`;
        progressBar.value = js.total ? Math.round((js.done/js.total)*100) : 0;
        surveyLog.textContent = (js.logs || []).slice(-200).join('\n');
        // add any new results
        (js.results || []).forEach(res => {
          // avoid duplicates by raw filename
          if(!results.find(x => x.raw_file === res.raw_file)) addResult(res);
        });
        if(js.status === 'finished' || js.status === 'error'){
          clearInterval(pollInterval); pollInterval = null;
          startSurveyBtn.disabled = false; cancelTaskBtn.disabled = true;
          surveyStatus.textContent = `Finalizado — ${js.status}`;
        }
      } catch (e) {
        surveyLog.textContent = 'Error poll: ' + e;
      }
    }, 2200);
  }

  cancelTaskBtn.addEventListener('click', () => {
    // server-side cancel not implemented; just stop polling
    if(pollInterval){ clearInterval(pollInterval); pollInterval = null; }
    startSurveyBtn.disabled = false; cancelTaskBtn.disabled = true;
    surveyStatus.textContent = 'Cancelado por usuario';
    surveyLog.textContent += '\nCancelada localmente.';
  });

  // download CSV
  downloadBtn.addEventListener('click', () => {
    window.location.href = '/download_csv';
  });

  // export recent results JSON
  exportJsonBtn.addEventListener('click', () => {
    const data = JSON.stringify(results.slice(0,200), null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'wifi_recent.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // theme toggle (dark mode)
  function applyTheme(dark){
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('ws_theme', dark ? 'dark' : 'light');
  }
themeToggle.addEventListener('click', () => {
    const current = localStorage.getItem('ws_theme') === 'dark';
    applyTheme(!current);
  });
  // init theme
  applyTheme(localStorage.getItem('ws_theme') === 'dark');

  // initial status check: try ping /run_point healthcheck
  (async function initialCheck(){
    try {
      const r = await fetch('/list_raw');
      if(r.ok) setStatus(true);
      else setStatus(false);
    } catch (e) { setStatus(false); }
  })();

  // expose helper for debugging
  window.__ws = { addResult, results, chart };
})();
