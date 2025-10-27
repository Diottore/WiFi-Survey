// static/app.js - mejoras responsive y rendimiento (debounced chart resize, batching results)
// Cargar con defer en el HTML. Mantiene compatibilidad con endpoints existentes.

(() => {
  const $ = id => document.getElementById(id);

  // Elements
  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const downloadBtn = $('downloadBtn'), pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), surveyStatus = $('surveyStatus'), progressBar = $('progressBar');
  const resultsList = $('resultsList'), avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl');
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn'), statusDot = $('statusDot');
  const surveyDeviceEl = $('survey_device'), fabRun = $('fabRun');

  // Simple results buffer to batch DOM updates
  let resultBuffer = [];
  let flushing = false;
  let results = []; // in-memory

  // Chart
  const ctx = document.getElementById('throughputChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'DL Mbps', data: [], backgroundColor: '#0066ff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });

  // Debounce helper
  function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); } }

  // Use ResizeObserver to resize chart safely when parent changes (orientation/keyboard)
  const ro = new ResizeObserver(debounce(() => { try{ chart.resize(); }catch(e){/*ignore*/} }, 120));
  ro.observe(document.querySelector('.chart-card') || document.body);

  // normalize text and avoid layout breaking long strings
  function norm(s){ if(s===null||s===undefined) return ''; return String(s).trim().replace(/\s+/g,' '); }

  // add to buffer and schedule flush
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
    // batch DOM operations
    const frag = document.createDocumentFragment();
    while(resultBuffer.length){
      const r = resultBuffer.shift();
      results.unshift(r);
      if(results.length>300) results.pop();

      const card = document.createElement('div');
      card.className = 'result-card';
      const sSsid = norm(r.ssid), sBssid = norm(r.bssid);
      card.innerHTML = `
        <div class="result-left" role="listitem" style="min-width:0">
          <div style="max-width:60vw;overflow-wrap:break-word">
            <div class="title">${norm(r.point)}</div>
            <div class="muted">${sSsid}${sBssid?(' · '+sBssid):''}</div>
          </div>
        </div>
        <div class="result-stats">
          <div class="badge">RSSI ${norm(r.rssi)||'—'} dBm</div>
          <div style="margin-top:6px"><strong>${r.iperf_dl_mbps ?? '—'}</strong> Mbps</div>
          <div class="muted" style="font-size:.85rem">${r.iperf_ul_mbps ?? '—'} Mbps</div>
          <div style="margin-top:6px"><a href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank" class="muted">raw</a></div>
        </div>
      `;
      frag.appendChild(card);

      // update chart data in memory
      chart.data.labels.unshift(norm(r.point));
      chart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps) || 0);
      if(chart.data.labels.length>20){ chart.data.labels.pop(); chart.data.datasets[0].data.pop(); }
    }

    // prepend fragment
    resultsList.prepend(frag);
    // update chart (batched)
    chart.update('active');

    // update summary
    updateSummary();

    flushing = false;
  }

  function updateSummary(){
    const rssiVals = results.map(x=>Number(x.rssi)).filter(n=>!isNaN(n));
    const dlVals = results.map(x=>Number(x.iperf_dl_mbps)).filter(n=>!isNaN(n));
    const ulVals = results.map(x=>Number(x.iperf_ul_mbps)).filter(n=>!isNaN(n));
    const avg = arr => arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals)) + ' dBm' : '—';
    avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2) + ' Mbps' : '—';
    avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2) + ' Mbps' : '—';
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

  // FAB quick-run
  if(fabRun) fabRun.addEventListener('click', ()=> runBtn.click());

  // Start survey
  startSurveyBtn.addEventListener('click', async ()=>{
    startSurveyBtn.disabled = true;
    const device = norm(surveyDeviceEl.value) || norm(deviceEl.value) || 'phone';
    const ptsRaw = norm(pointsEl.value);
    if(!ptsRaw){ alert('Introduce puntos'); startSurveyBtn.disabled=false; return; }
    const points = ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    const repeats = Number(repeatsEl.value) || 1;
    try {
      const res = await fetch('/start_survey', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device, points, repeats})
      });
      const j = await res.json();
      if(!j.ok){ surveyLog.textContent = 'Error: ' + (j.error||''); startSurveyBtn.disabled=false; return; }
      pollTask(j.task_id);
      cancelTaskBtn.disabled = false;
    } catch(e){ surveyLog.textContent = 'Error al iniciar: '+e; startSurveyBtn.disabled=false; }
  });

  // Polling task status
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
        if(js.status==='finished' || js.status==='error'){ clearInterval(pollHandle); pollHandle=null; startSurveyBtn.disabled=false; cancelTaskBtn.disabled=true; }
      } catch(e){ surveyLog.textContent = 'Poll error: '+e; }
    }, 2000);
  }

  cancelTaskBtn.addEventListener('click', ()=> {
    if(pollHandle) clearInterval(pollHandle);
    pollHandle = null;
    startSurveyBtn.disabled=false;
    cancelTaskBtn.disabled=true;
    surveyStatus.textContent = 'Cancelado';
  });

  // Download, export, clear
  downloadBtn.addEventListener('click', ()=> { window.location.href = '/download_csv'; });
  exportJsonBtn && exportJsonBtn.addEventListener('click', ()=> {
    const blob = new Blob([JSON.stringify(results.slice(0,200), null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wifi_recent.json'; a.click();
    URL.revokeObjectURL(a.href);
  });
  clearResultsBtn && clearResultsBtn.addEventListener('click', ()=> { results=[]; resultsList.innerHTML=''; chart.data.labels=[]; chart.data.datasets[0].data=[]; chart.update(); updateSummary(); });

  // status
  function setStatus(ok){ statusDot.className = ok ? 'status online' : 'status offline'; }

  // initial health check
  (async ()=>{ try { const r = await fetch('/list_raw'); setStatus(r.ok); } catch(e){ setStatus(false); } })();

  // expose for debug
  window.__ws = { pushResult, results, chart };

})();