// static/app.js - UI pulida: navegación clara, sin desbordes y live panel controlado.
// SSE/polling mantenido. Modo persistente con localStorage. Validaciones para evitar errores visuales.

(() => {
  const $ = id => document.getElementById(id);

  // Panels / Mode
  const panelQuick = $('panel-quick'), panelSurvey = $('panel-survey'), panelResults = $('panel-results');
  const modeQuickBtn = $('modeQuick'), modeSurveyBtn = $('modeSurvey'), modeResultsBtn = $('modeResults');
  const goToSurveyBtn = $('btn-go-to-survey'), goToResultsBtn = $('modeResults') || $('btn-go-to-results'), goToTestsBtn = $('btn-go-to-tests');

  function setMode(mode, persist = true) {
    if (!panelQuick || !panelSurvey || !panelResults) return;
    const map = { quick: panelQuick, survey: panelSurvey, results: panelResults };
    Object.entries(map).forEach(([k,v]) => v.classList.toggle('hidden', k !== mode));
    // toggle active on mode buttons
    [modeQuickBtn, modeSurveyBtn, modeResultsBtn].forEach(b => b && b.classList.remove('active'));
    if (mode === 'quick' && modeQuickBtn) modeQuickBtn.classList.add('active');
    if (mode === 'survey' && modeSurveyBtn) modeSurveyBtn.classList.add('active');
    if (mode === 'results' && modeResultsBtn) modeResultsBtn.classList.add('active');
    if (persist) try { localStorage.setItem('uiMode', mode); } catch(e){}
  }

  modeQuickBtn && modeQuickBtn.addEventListener('click', ()=> setMode('quick'));
  modeSurveyBtn && modeSurveyBtn.addEventListener('click', ()=> setMode('survey'));
  modeResultsBtn && modeResultsBtn.addEventListener('click', ()=> setMode('results'));
  goToSurveyBtn && goToSurveyBtn.addEventListener('click', ()=> setMode('survey'));
  goToResultsBtn && goToResultsBtn.addEventListener('click', ()=> setMode('results'));
  goToTestsBtn && goToTestsBtn.addEventListener('click', ()=> setMode('quick'));

  const savedMode = (localStorage.getItem('uiMode') || 'quick');
  setMode(savedMode, false);

  // Elements - quick & survey
  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const downloadBtn = $('downloadBtn'), pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), surveyStatus = $('surveyStatus'), progressBar = $('progressBar');
  const resultsList = $('resultsList'), avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl');
  const avgPing = $('avgPing'), avgJitter = $('avgJitter');
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn'), statusDot = $('statusDot');
  const surveyDeviceEl = $('survey_device'), manualCheckbox = $('manual_confirm'), proceedBtn = $('proceedBtn');

  // Live UI elements
  const liveVisuals = $('liveVisuals'); // card container
  const speedGaugeCanvas = $('speedGauge');
  const gaugeLabel = $('gaugeLabel');
  const runProgressFill = $('runProgressFill');
  const progressPct = $('progressPct');
  const timeRemainingEl = $('timeRemaining');
  const liveSummary = $('liveSummary');
  const instDlEl = $('instDl'), instUlEl = $('instUl'), instPingEl = $('instPing');
  const showLiveQuick = $('showLiveQuick'), showLiveSurvey = $('showLiveSurvey'), hideLivePanelBtn = $('hideLivePanel');

  // State
  let results = [], filteredResults = [], gaugeChart = null, lastSurveyTaskId = null;
  let currentSse = null;

  // Chart (optional)
  const ctx = document.getElementById('throughputChart')?.getContext('2d');
  const chart = ctx ? new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'DL Mbps', data: [], borderColor: '#0b74ff', backgroundColor: 'rgba(11,116,255,0.08)', yAxisID: 'y', tension: 0.24, pointRadius: 4, fill: true },
      { label: 'UL Mbps', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.06)', yAxisID: 'y', tension: 0.24, pointRadius: 4, fill: true },
      { label: 'Ping ms', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.04)', yAxisID: 'y1', tension: 0.2, pointRadius: 3, borderDash: [4,2], fill: false }
    ] },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false}, plugins:{legend:{position:'top'}}, scales:{ x:{title:{display:true,text:'Punto'}}, y:{beginAtZero:true}, y1:{beginAtZero:true, grid:{drawOnChartArea:false}} } }
  }) : null;

  // Gauge creation (lazy)
  function createGauge(initial=0, max=200){
    if(!speedGaugeCanvas) return null;
    if(gaugeChart) return gaugeChart;
    const gctx = speedGaugeCanvas.getContext('2d');
    const data = { labels:['val','rest'], datasets:[{ data:[initial, Math.max(0, max-initial)], backgroundColor:['#0b74ff','#e6e9ee'], borderWidth:0 }]};
    const pluginNeedle = {
      id: 'needle',
      afterDatasetDraw(chart, args, options){
        const {ctx} = chart;
        const meta = chart.getDatasetMeta(0).data[0];
        if(!meta) return;
        const cx = meta.x, cy = meta.y + 18;
        const radius = Math.min(meta.x, meta.y) * 0.9;
        const value = chart.config.data.datasets[0].data[0];
        const angle = (-Math.PI/2) + ((value / (options.maxValue||max)) * Math.PI);
        const nx = cx + Math.cos(angle) * (radius * 0.78);
        const ny = cy + Math.sin(angle) * (radius * 0.78);
        ctx.save();
        ctx.lineWidth = 3; ctx.strokeStyle = options.color || '#222';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.fillStyle = options.centerColor || '#222';
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    };
    if (!Chart.registry.plugins.get('needle')) Chart.register(pluginNeedle);
    gaugeChart = new Chart(gctx, { type:'doughnut', data, options:{ rotation:-Math.PI, circumference:Math.PI, cutout:'60%', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{enabled:false}}, maxValue:max }, plugins:['needle']});
    if (gaugeLabel) gaugeLabel.textContent = `${initial.toFixed(2)} Mbps`;
    return gaugeChart;
  }

  function setGaugeValue(v, max=200){
    if(!speedGaugeCanvas) return;
    if(!gaugeChart) createGauge(0,max);
    if(!gaugeChart) return;
    gaugeChart.data.datasets[0].data[0] = Math.max(0, Math.min(v, max));
    gaugeChart.data.datasets[0].data[1] = Math.max(0, max - gaugeChart.data.datasets[0].data[0]);
    gaugeChart.options.maxValue = max;
    gaugeChart.update('none');
    if (gaugeLabel) gaugeLabel.textContent = `${Number(gaugeChart.data.datasets[0].data[0]).toFixed(2)} Mbps`;
  }

  function showLiveVisuals(){
    if(!liveVisuals) return;
    liveVisuals.classList.add('show');
    createGauge(0,200);
  }
  function hideLiveVisuals(){
    if(!liveVisuals) return;
    liveVisuals.classList.remove('show');
  }

  hideLivePanelBtn && hideLivePanelBtn.addEventListener('click', hideLiveVisuals);
  showLiveQuick && showLiveQuick.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });
  showLiveSurvey && showLiveSurvey.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });

  // Helpers
  function fmtTime(s){ s = Math.max(0, Math.round(s)); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // SSE and polling
  function openSseForTask(task_id){
    if(!task_id) return;
    if(typeof(EventSource) === 'undefined') { pollTaskStatus(task_id, 1000); return; }
    if(currentSse) try{ currentSse.close(); }catch(e){}
    const es = new EventSource(`/stream/${encodeURIComponent(task_id)}`);
    currentSse = es;
    es.addEventListener('open', ()=> console.debug('SSE open', task_id));
    es.addEventListener('error', (e)=> { console.warn('SSE error', e); es.close(); pollTaskStatus(task_id, 1000); });
    es.addEventListener('update', ev => { try{ const data = JSON.parse(ev.data); handlePartialUpdate(data); }catch(e){console.error(e);} });
    es.addEventListener('finished', ev => { try{ const final = JSON.parse(ev.data||'null'); handleFinalResult(final); }catch(e){console.error(e);} es.close(); currentSse=null; });
    return es;
  }

  let pollIntervalHandle = null;
  function pollTaskStatus(task_id, ms=1200){
    if(pollIntervalHandle) clearInterval(pollIntervalHandle);
    pollIntervalHandle = setInterval(async ()=>{
      try{
        const res = await fetch(`/task_status/${task_id}`);
        if(!res.ok) return;
        const js = await res.json();
        if(js.partial) handlePartialUpdate(js);
        if(js.status === 'finished') { handleFinalResult(js.result||js.results||{}); clearInterval(pollIntervalHandle); pollIntervalHandle=null; }
      }catch(e){ console.warn('poll error', e); }
    }, ms);
  }

  function handlePartialUpdate(dataContainer){
    const partial = dataContainer.partial || dataContainer;
    if(!partial) return;
    const dl = Number(partial.dl_mbps || partial.iperf_dl_mbps || 0);
    const ul = Number(partial.ul_mbps || partial.iperf_ul_mbps || 0);
    const ping = partial.ping_avg_ms || partial.ping_avg || '';
    const progress = partial.progress_pct || partial.progress || 0;
    const elapsed = partial.elapsed_s || 0;
    showLiveVisuals();
    setGaugeValue(dl, 200);
    if (instDlEl) instDlEl.textContent = `${dl.toFixed(2)} Mbps`;
    if (instUlEl) instUlEl.textContent = `${ul.toFixed(2)} Mbps`;
    if (instPingEl) instPingEl.textContent = `${(ping!=='' && !isNaN(Number(ping)))? Number(ping).toFixed(2)+' ms':'—'}`;
    if (runProgressFill) runProgressFill.style.width = `${progress}%`;
    if (progressPct) progressPct.textContent = `${progress}%`;
    (async ()=>{
      try{
        const cfg = await fetch('/_survey_config').then(r=>r.ok? r.json(): null);
        if(cfg && cfg.IPERF_DURATION && timeRemainingEl){
          timeRemainingEl.textContent = fmtTime(Math.max(0, cfg.IPERF_DURATION - (elapsed||0)));
        } else if (timeRemainingEl) {
          timeRemainingEl.textContent = fmtTime(Math.max(0, (partial.duration||20) - (elapsed||0)));
        }
      }catch(e){}
    })();
    if (liveSummary) liveSummary.textContent = `Ejecutando... ${progress}%`;
  }

  function handleFinalResult(res){
    if(!res){ if (liveSummary) liveSummary.textContent = 'Prueba finalizada (sin resultado)'; return; }
    if(Array.isArray(res)){
      res.forEach(r => pushResultToList(r));
      if (liveSummary) liveSummary.textContent = `Encuesta finalizada: ${res.length} puntos`;
    } else {
      const dl = Number(res.iperf_dl_mbps || 0), ul = Number(res.iperf_ul_mbps || 0);
      const start = gaugeChart ? gaugeChart.data.datasets[0].data[0] : 0;
      const target = Math.min(400, dl);
      const steps = 20; let i=0;
      const stepInterval = setInterval(()=>{ i++; const t = i/steps; const value = start + (target - start) * (1 - Math.cos(Math.PI*t))/2; setGaugeValue(value, Math.max(200,target)); if(i>=steps) clearInterval(stepInterval); },25);
      if (instDlEl) instDlEl.textContent = `${dl.toFixed(2)} Mbps`;
      if (instUlEl) instUlEl.textContent = `${ul.toFixed(2)} Mbps`;
      if (instPingEl) instPingEl.textContent = `${res.ping_avg_ms || res.ping_avg || '—'}`;
      if (liveSummary) liveSummary.textContent = `Resultado final: DL ${dl.toFixed(2)} Mbps · UL ${ul.toFixed(2)} Mbps`;
      const r = {
        device: res.device || deviceEl?.value || '',
        point: res.point || pointEl?.value || '',
        timestamp: res.timestamp || new Date().toISOString(),
        ssid: res.ssid || '',
        bssid: res.bssid || '',
        rssi: res.rssi || '',
        iperf_dl_mbps: dl,
        iperf_ul_mbps: ul,
        ping_avg: res.ping_avg_ms || res.ping_avg || '',
        ping_jitter: res.ping_jitter_ms || res.ping_jitter || '',
        raw_file: res.raw_file || ''
      };
      pushResultToList(r);
      if(chart){
        const label = r.point || ('pt'+Date.now());
        chart.data.labels.unshift(label);
        chart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps)||0);
        chart.data.datasets[1].data.unshift(Number(r.iperf_ul_mbps)||0);
        chart.data.datasets[2].data.unshift(Number(r.ping_avg)||0);
        const MAX_POINTS = 40;
        if(chart.data.labels.length > MAX_POINTS){ chart.data.labels.pop(); chart.data.datasets.forEach(ds=>ds.data.pop()); }
        chart.update('active');
      }
      updateSummary();
    }
    if (runProgressFill) runProgressFill.style.width = `0%`;
    if (progressPct) progressPct.textContent = `0%`;
    if (timeRemainingEl) timeRemainingEl.textContent = '00:00';
    // Mantener panel visible hasta que el usuario lo cierre manualmente.
  }

  // Results helpers
  function pushResultToList(r){
    r.point = r.point || 'pt';
    results.unshift(r);
    if(results.length > 500) results.pop();
    const card = document.createElement('div');
    card.className = 'result-item';
    card.innerHTML = `
      <div style="flex:1; min-width:140px;">
        <strong>${escapeHtml(r.point)}</strong>
        <div class="muted">${escapeHtml(r.ssid||'')}</div>
      </div>
      <div style="width:120px;text-align:right">${Number(r.iperf_dl_mbps||0).toFixed(2)} Mbps</div>
      <div style="width:120px;text-align:right">${Number(r.iperf_ul_mbps||0).toFixed(2)} Mbps</div>
      <div style="width:80px;text-align:right">${r.ping_avg ?? '—'}</div>
      <div style="width:60px;text-align:center"><a class="muted" href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank">raw</a></div>
    `;
    resultsList && resultsList.prepend(card);
  }

  // Run quick test
  runBtn && runBtn.addEventListener('click', async ()=>{
    runBtn.disabled = true;
    const device = (deviceEl?.value || 'phone').trim();
    const point = (pointEl?.value || 'P1').trim();
    const runIndex = Number(runEl?.value) || 1;
    try {
      const res = await fetch('/run_point', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ device, point, run: runIndex }) });
      const j = await res.json();
      if(!j || !j.ok){ if (liveSummary) liveSummary.textContent = `Error iniciando prueba: ${j?.error||'unknown'}`; runBtn.disabled=false; return; }
      const task_id = j.task_id;
      lastSurveyTaskId = task_id;
      const lastSurveyIdEl = $('lastSurveyId'); if (lastSurveyIdEl) lastSurveyIdEl.textContent = task_id;
      showLiveVisuals();
      if (liveSummary) liveSummary.textContent = 'Tarea iniciada, esperando actualizaciones...';
      openSseForTask(task_id);
      setMode('results');
    } catch(e){
      if (liveSummary) liveSummary.textContent = `Error comunicando con servidor: ${e.message}`;
      console.error(e);
    } finally { runBtn.disabled = false; }
  });

  // Start survey
  startSurveyBtn && startSurveyBtn.addEventListener('click', async ()=>{
    startSurveyBtn.disabled = true;
    const device = (surveyDeviceEl?.value || deviceEl?.value || 'phone').trim();
    const ptsRaw = (pointsEl?.value || '').trim();
    if(!ptsRaw){ alert('Introduce puntos'); startSurveyBtn.disabled=false; return; }
    const points = ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    const repeats = Number(repeatsEl?.value) || 1;
    const manual = !!manualCheckbox?.checked;
    try {
      const res = await fetch('/start_survey', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ device, points, repeats, manual }) });
      const j = await res.json();
      if(!j.ok){ if (surveyLog) surveyLog.textContent = 'Error: ' + (j.error||''); startSurveyBtn.disabled=false; return; }
      const task_id = j.task_id;
      lastSurveyTaskId = task_id;
      const lastSurveyIdEl = $('lastSurveyId'); if (lastSurveyIdEl) lastSurveyIdEl.textContent = task_id;
      if (cancelTaskBtn) cancelTaskBtn.disabled = false;
      showLiveVisuals();
      openSseForTask(task_id);
      if (surveyArea) surveyArea.hidden = false;
      setMode('results');
    } catch(e){
      if (surveyLog) surveyLog.textContent = 'Error al iniciar: '+e;
      console.error(e);
    } finally { startSurveyBtn.disabled = false; }
  });

  // Proceed / Cancel survey
  proceedBtn && proceedBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    proceedBtn.disabled = true;
    try {
      const r = await fetch(`/task_proceed/${encodeURIComponent(lastSurveyTaskId)}`, { method:'POST' });
      const js = await r.json();
      if(!js.ok) alert('Error al proceder: '+(js.error||''));
    } catch(e){ alert('Error: '+e); }
    proceedBtn.disabled = false;
  });

  cancelTaskBtn && cancelTaskBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    try {
      await fetch(`/task_cancel/${encodeURIComponent(lastSurveyTaskId)}`, { method:'POST' });
    } catch(e){ console.warn('Cancel error', e); }
  });

  // Export / Clear
  exportJsonBtn && exportJsonBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(results.slice(0,500), null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wifi_recent.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  clearResultsBtn && clearResultsBtn.addEventListener('click', ()=> {
    results=[]; filteredResults=[]; if(resultsList) resultsList.innerHTML=''; if(chart){ chart.data.labels=[]; chart.data.datasets.forEach(ds=>ds.data=[]); chart.update(); } updateSummary();
  });

  function updateSummary(){
    const rssiVals = results.map(x=>Number(x.rssi)).filter(n=>!isNaN(n));
    const dlVals = results.map(x=>Number(x.iperf_dl_mbps)).filter(n=>!isNaN(n));
    const ulVals = results.map(x=>Number(x.iperf_ul_mbps)).filter(n=>!isNaN(n));
    const pingVals = results.map(x=>Number(x.ping_avg)).filter(n=>!isNaN(n));
    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : NaN;
    if (avgRssi) avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals)) + ' dBm' : '—';
    if (avgDl) avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2) + ' Mbps' : '—';
    if (avgUl) avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2) + ' Mbps' : '—';
    if (avgPing) avgPing.textContent = pingVals.length ? avg(pingVals).toFixed(2) + ' ms' : '—';
  }

  // Status dot (best-effort)
  async function setStatusFromServer(){
    try {
      const r = await fetch('/list_raw');
      setStatus(!!r.ok);
    } catch(e){ setStatus(false); }
  }
  function setStatus(ok){
    const dot = document.querySelector('#statusDot');
    if(dot) dot.style.background = ok? '#34d399' : '#f87171';
  }
  setStatusFromServer();

  // Initialize
  updateSummary();

  // Expose for debug
  window.__ws = Object.assign(window.__ws || {}, { createGauge, setGaugeValue, showLiveVisuals, hideLiveVisuals, openSseForTask });
})();