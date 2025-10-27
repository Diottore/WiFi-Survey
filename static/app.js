// static/app.js - Tabs (Pruebas / Resultados) + lógica previa (chart líneas)
// Añadida interacción para modo manual: botón "Continuar" cuando la tarea está en estado waiting.

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

  // Buffers and state
  let resultBuffer = [];
  let flushing = false;
  let results = [];
  let currentTaskId = null;

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

  function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); } }
  const ro = new ResizeObserver(debounce(() => { try{ chart.resize(); }catch(e){} }, 120));
  const chartCard = document.querySelector('.chart-card') || document.body;
  ro.observe(chartCard);

  function norm(s){ if(s===null||s===undefined) return ''; return String(s).trim().replace(/\s+/g,' '); }

  function pushResult(r){
    if(!r) return;
    resultBuffer.push(r);
    if(!flushing){
      flushing = true;
      requestAnimationFrame(() => flushResults());
    }
  }

  function flushResults(){
    if(resultBuffer.length===0){ flushing=false; return; }
    const frag = document.createDocumentFragment();
    while(resultBuffer.length){
      const r = resultBuffer.shift();
      r.point = norm(r.point);
      r.ssid = norm(r.ssid);
      r.bssid = norm(r.bssid);
      r.rssi = norm(r.rssi);
      r.iperf_dl_mbps = r.iperf_dl_mbps ?? r.dl_mbps ?? r.dl ?? 0;
      r.iperf_ul_mbps = r.iperf_ul_mbps ?? r.ul_mbps ?? r.ul ?? 0;
      r.ping_avg = r.ping_avg ?? r.ping_avg_ms ?? r.ping?.avg_ms ?? '';
      r.ping_jitter = r.ping_jitter ?? r.ping_jitter_ms ?? r.ping?.jitter_ms ?? '';

      results.unshift(r);
      if(results.length>300) results.pop();

      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <div class="result-left" role="listitem" style="min-width:0">
          <div style="max-width:60vw;overflow-wrap:break-word">
            <div class="title">${r.point}</div>
            <div class="muted">${r.ssid}${r.bssid?(' · '+r.bssid):''}</div>
          </div>
        </div>
        <div class="result-stats">
          <div class="badge">RSSI ${r.rssi || '—'} dBm</div>
          <div style="margin-top:6px"><strong>${r.iperf_dl_mbps ?? '—'}</strong> Mbps</div>
          <div class="muted" style="font-size:.85rem">UL ${r.iperf_ul_mbps ?? '—'} Mbps</div>
          <div style="margin-top:6px"><span class="muted">Ping: </span><strong>${r.ping_avg ?? '—'}</strong> ms</div>
          <div style="margin-top:2px"><span class="muted">Jitter: </span><strong>${r.ping_jitter ?? '—'}</strong> ms</div>
          <div style="margin-top:6px"><a href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank" class="muted">raw</a></div>
        </div>
      `;
      frag.appendChild(card);

      const label = r.point || ('pt' + Date.now());
      chart.data.labels.unshift(label);
      chart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps) || 0);
      chart.data.datasets[1].data.unshift(Number(r.iperf_ul_mbps) || 0);
      const pingNum = (r.ping_avg !== '' && !isNaN(Number(r.ping_avg))) ? Number(r.ping_avg) : null;
      chart.data.datasets[2].data.unshift(pingNum);
      const MAX_POINTS = 40;
      if(chart.data.labels.length > MAX_POINTS){
        chart.data.labels.pop();
        chart.data.datasets.forEach(ds => ds.data.pop());
      }
    }

    resultsList.prepend(frag);
    chart.update('active');
    updateSummary();
    flushing = false;
  }

  function updateSummary(){
    const rssiVals = results.map(x=>Number(x.rssi)).filter(n=>!isNaN(n));
    const dlVals = results.map(x=>Number(x.iperf_dl_mbps)).filter(n=>!isNaN(n));
    const ulVals = results.map(x=>Number(x.iperf_ul_mbps)).filter(n=>!isNaN(n));
    const pingVals = results.map(x=>Number(x.ping_avg)).filter(n=>!isNaN(n));
    const jitterVals = results.map(x=>Number(x.ping_jitter)).filter(n=>!isNaN(n));
    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : NaN;
    avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals)) + ' dBm' : '—';
    avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2) + ' Mbps' : '—';
    avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2) + ' Mbps' : '—';
    avgPing && (avgPing.textContent = pingVals.length ? avg(pingVals).toFixed(2) + ' ms' : '—');
    avgJitter && (avgJitter.textContent = jitterVals.length ? avg(jitterVals).toFixed(2) + ' ms' : '—');
  }

  // Run point (single)
  runBtn.addEventListener('click', async ()=>{
    runBtn.disabled = true;
    const device = norm(deviceEl.value) || 'phone';
    const point = norm(pointEl.value) || 'P1';
    const run = Number(runEl.value) || 1;
    try {
      const res = await fetch('/run_point', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device, point, run})
      });
      const j = await res.json();
      if(j && j.ok){ pushResult(j.result); setStatus(true); } else { console.warn(j); setStatus(false); }
    } catch(e){ console.error(e); setStatus(false); }
    runBtn.disabled = false;
  });

  if(fabRun) fabRun.addEventListener('click', ()=> runBtn.click());

  // Start survey
  startSurveyBtn.addEventListener('click', async ()=>{
    startSurveyBtn.disabled = true;
    const device = norm(surveyDeviceEl.value) || norm(deviceEl.value) || 'phone';
    const ptsRaw = norm(pointsEl.value);
    if(!ptsRaw){ alert('Introduce puntos'); startSurveyBtn.disabled=false; return; }
    const points = ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    const repeats = Number(repeatsEl.value) || 1;
    const manual = !!manualCheckbox?.checked;
    try {
      const res = await fetch('/start_survey', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device, points, repeats, manual})
      });
      const j = await res.json();
      if(!j.ok){ surveyLog.textContent = 'Error: ' + (j.error||''); startSurveyBtn.disabled=false; return; }
      currentTaskId = j.task_id;
      pollTask(j.task_id);
      cancelTaskBtn.disabled = false;
      showPanel('panel-results');
    } catch(e){ surveyLog.textContent = 'Error al iniciar: '+e; startSurveyBtn.disabled=false; }
  });

  // Proceed button (manual mode)
  proceedBtn && proceedBtn.addEventListener('click', async ()=>{
    if(!currentTaskId) return;
    proceedBtn.disabled = true;
    try {
      const r = await fetch(`/task_proceed/${currentTaskId}`, { method:'POST' });
      const js = await r.json();
      if(js && js.ok){
        proceedBtn.hidden = true;
        proceedBtn.disabled = false;
      } else {
        surveyLog.textContent = 'Error al continuar: ' + (js.error||'');
      }
    } catch(e){ surveyLog.textContent = 'Error al enviar continuar: '+e; }
  });

  // Polling
  let pollHandle = null;
  function pollTask(taskId){
    surveyArea.hidden = false;
    surveyLog.textContent = 'En ejecución...';
    pollHandle = setInterval(async ()=>{
      try {
        const r = await fetch(`/task_status/${taskId}`);
        const js = await r.json();
        if(!js){ surveyLog.textContent = 'Sin respuesta'; return; }
        surveyStatus.textContent = `${js.status} — ${js.done||0}/${js.total||0}`;
        progressBar.value = js.total? Math.round((js.done/js.total)*100):0;
        surveyLog.textContent = (js.logs||[]).slice(-200).join('\n');
        (js.results||[]).forEach(res => {
          if(!results.find(x=>x.raw_file===res.raw_file)) pushResult(res);
        });
        if(js.status==='waiting'){
          proceedBtn && (proceedBtn.hidden = false);
        } else {
          proceedBtn && (proceedBtn.hidden = true);
        }
        if(js.status==='finished' || js.status==='error' || js.status==='cancelled'){
          clearInterval(pollHandle); pollHandle=null; startSurveyBtn.disabled=false; cancelTaskBtn.disabled=true; proceedBtn && (proceedBtn.hidden = true);
        }
      } catch(e){ surveyLog.textContent = 'Poll error: '+e; }
    }, 2000);
  }

  cancelTaskBtn.addEventListener('click', async ()=> {
    if(!currentTaskId) return;
    try {
      await fetch(`/task_cancel/${currentTaskId}`, { method:'POST' });
    } catch(e){ console.warn('Cancel error', e); }
    if(pollHandle) clearInterval(pollHandle);
    pollHandle = null;
    startSurveyBtn.disabled=false;
    cancelTaskBtn.disabled=true;
    surveyStatus.textContent = 'Cancelado';
    proceedBtn && (proceedBtn.hidden = true);
  });

  downloadBtn.addEventListener('click', ()=> { window.location.href = '/download_csv'; });
  exportJsonBtn && exportJsonBtn.addEventListener('click', ()=> {
    const blob = new Blob([JSON.stringify(results.slice(0,200), null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wifi_recent.json'; a.click();
    URL.revokeObjectURL(a.href);
  });
  clearResultsBtn && clearResultsBtn.addEventListener('click', ()=> { results=[]; resultsList.innerHTML=''; chart.data.labels=[]; chart.data.datasets.forEach(ds=>ds.data=[]); chart.update(); updateSummary(); });

  function setStatus(ok){ statusDot.className = ok ? 'status online' : 'status offline'; }
  (async ()=>{ try { const r = await fetch('/list_raw'); setStatus(r.ok); } catch(e){ setStatus(false); } })();

  window.__ws = { pushResult, results, chart, showPanel };

})();