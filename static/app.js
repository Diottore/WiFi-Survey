// static/app.js v12 — Enhanced with input validation, better error handling, and improved stability
// Resultados mobile-first: toolbar sticky sin solapamiento, gráfico responsivo,
// controles con scroll-x en móvil y leyenda compacta. Live panel con gráfica de estabilidad.

(() => {
  'use strict';
  
  const $ = id => document.getElementById(id);
  
  // Validation helpers
  function validatePointName(point) {
    if (!point || point.length > 100) return false;
    return /^[a-zA-Z0-9_-]+$/.test(point);
  }
  
  function validateDeviceName(device) {
    if (!device || device.length > 50) return false;
    return device.trim().length > 0;
  }
  
  function showError(message, duration = 5000) {
    console.error(message);
    // Simple error display - could be enhanced with a toast notification
    if (liveSummary) {
      liveSummary.textContent = `Error: ${message}`;
      liveSummary.style.color = '#ef4444';
      setTimeout(() => {
        liveSummary.style.color = '';
      }, duration);
    }
  }
  
  function showSuccess(message, duration = 3000) {
    console.log(message);
    if (liveSummary) {
      liveSummary.textContent = message;
      liveSummary.style.color = '#10b981';
      setTimeout(() => {
        liveSummary.style.color = '';
      }, duration);
    }
  }

  // Panels / Mode
  const panelQuick = $('panel-quick'), panelSurvey = $('panel-survey'), panelResults = $('panel-results');
  const modeQuickBtn = $('modeQuick'), modeSurveyBtn = $('modeSurvey'), modeResultsBtn = $('modeResults');
  const goToSurveyBtn = $('btn-go-to-survey'), goToResultsBtn = $('modeResults') || $('btn-go-to-results'), goToTestsBtn = $('btn-go-to-tests');

  function setMode(mode, persist = true) {
    const map = { quick: panelQuick, survey: panelSurvey, results: panelResults };
    Object.entries(map).forEach(([k,v]) => v && v.classList.toggle('hidden', k !== mode));
    [modeQuickBtn, modeSurveyBtn, modeResultsBtn].forEach(b => b && b.classList.remove('active'));
    if (mode === 'quick' && modeQuickBtn) modeQuickBtn.classList.add('active');
    if (mode === 'survey' && modeSurveyBtn) modeSurveyBtn.classList.add('active');
    if (mode === 'results' && modeResultsBtn) modeResultsBtn.classList.add('active');
    if (persist) try { localStorage.setItem('uiMode', mode); } catch(e){}
    if (mode === 'results') {
      ensureResultsChart();
      // doble RAF para asegurar size correcto tras mostrar
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ try { resultsChart && resultsChart.resize(); } catch{} }));
    }
  }
  modeQuickBtn && modeQuickBtn.addEventListener('click', ()=> setMode('quick'));
  modeSurveyBtn && modeSurveyBtn.addEventListener('click', ()=> setMode('survey'));
  modeResultsBtn && modeResultsBtn.addEventListener('click', ()=> setMode('results'));
  goToSurveyBtn && goToSurveyBtn.addEventListener('click', ()=> setMode('survey'));
  goToResultsBtn && goToResultsBtn.addEventListener('click', ()=> setMode('results'));
  goToTestsBtn && goToTestsBtn.addEventListener('click', ()=> setMode('quick'));
  setMode(localStorage.getItem('uiMode') || 'quick', false);

  // Elements comunes
  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), resultsList = $('resultsList'), emptyState=$('emptyState');
  const avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl'), avgPing = $('avgPing');

  // Live UI
  const liveVisuals = $('liveVisuals');
  const runProgressFill = $('runProgressFill'), progressPct = $('progressPct'), timeRemainingEl = $('timeRemaining'), liveSummary = $('liveSummary');
  const instDlEl = $('instDl'), instUlEl = $('instUl'), instPingEl = $('instPing'), instPing50El = $('instPing50'), instPing95El = $('instPing95'), instLossEl = $('instLoss');
  const showLiveQuick = $('showLiveQuick'), showLiveSurvey = $('showLiveSurvey'), hideLivePanelBtn = $('hideLivePanel');
  const surveyDeviceEl = $('survey_device'), manualCheckbox = $('manual_confirm'), proceedBtn = $('proceedBtn');

  // Resultados - controles
  const searchInput = $('searchInput'); const toggleDL = $('toggleDL'), toggleUL = $('toggleUL'), togglePing = $('togglePing');
  const refreshChartBtn = $('refreshChartBtn'), sortResultsSelect = $('sortResultsSelect');

  // Export
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn');
  const exportCsvWideBtn = $('exportCsvWide'), exportCsvLongBtn = $('exportCsvLong'), exportSummaryJsonBtn = $('exportSummaryJson');
  const exportSamplesCsvBtn = $('exportSamplesCsv');

  // Estado
  let results = [];
  let lastSurveyTaskId = null;
  let currentSse = null;

  // ============ Live mini chart (estabilidad) ============
  let liveMiniChart = null;
  let liveSamples = []; // {t, dl, ul, ping}

  function ensureLiveMiniChart(){
    const canvas = $('liveMiniChart'); 
    if(!canvas) {
      console.warn('liveMiniChart canvas not found');
      return;
    }
    if(liveMiniChart) return;
    
    try {
      const ctx = canvas.getContext('2d');
      liveMiniChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label:'DL', data: [], borderColor:'#0b74ff', backgroundColor:'rgba(11,116,255,0.10)', yAxisID:'y', tension:0.25, pointRadius:0, fill:true },
            { label:'UL', data: [], borderColor:'#06b6d4', backgroundColor:'rgba(6,182,212,0.08)', yAxisID:'y', tension:0.25, pointRadius:0, fill:true },
            { label:'Ping', data: [], borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.06)', yAxisID:'y1', tension:0.15, pointRadius:0, fill:false, borderDash:[4,2] }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false, animation:{ duration: 0 },
          interaction:{ intersect:false, mode:'index' },
          plugins:{ legend:{ display:true, position: (matchMedia('(max-width:680px)').matches ? 'bottom' : 'top'),
            labels:{ boxWidth: 10, font:{ size: matchMedia('(max-width:680px)').matches ? 11 : 12 } } },
            tooltip:{ callbacks:{ title:(items)=> items?.[0]?.label ? `t=${items[0].label}s` : '',
            label:(it)=> `${it.dataset.label}: ${Number(it.parsed.y).toFixed(2)}` }}},
          scales: {
            x: { title:{display:true, text:'s'}, ticks:{ autoSkip:true, maxRotation:0, font:{ size: matchMedia('(max-width:680px)').matches ? 10 : 12 } } },
            y: { title:{display:true, text:'Mbps'}, beginAtZero:true, ticks:{ font:{ size: matchMedia('(max-width:680px)').matches ? 10 : 12 } } },
            y1:{ position:'right', title:{display:true, text:'ms'}, grid:{drawOnChartArea:false}, beginAtZero:true, ticks:{ font:{ size: matchMedia('(max-width:680px)').matches ? 10 : 12 } } }
          }
        }
      });
    } catch(e) {
      console.error('Error creating live mini chart:', e);
      showError('Error al crear el gráfico en vivo');
    }
  }
  
  function liveChartPush(t, dl, ul, ping){
    try {
      ensureLiveMiniChart();
      if(!liveMiniChart) return;
      liveSamples.push({t, dl, ul, ping});
      if(liveSamples.length > 600) liveSamples.shift(); // ~10 min @1Hz
      liveMiniChart.data.labels = liveSamples.map(s=>s.t);
      liveMiniChart.data.datasets[0].data = liveSamples.map(s=>s.dl ?? null);
      liveMiniChart.data.datasets[1].data = liveSamples.map(s=>s.ul ?? null);
      liveMiniChart.data.datasets[2].data = liveSamples.map(s=>s.ping ?? null);
      liveMiniChart.update('none');
    } catch(e) {
      console.error('Error updating live chart:', e);
    }
  }
  
  function liveChartReset(){
    try {
      liveSamples = [];
      if(liveMiniChart){
        liveMiniChart.data.labels = [];
        liveMiniChart.data.datasets.forEach(ds=>ds.data=[]);
        liveMiniChart.update('none');
      }
    } catch(e) {
      console.error('Error resetting live chart:', e);
    }
  }

  function showLiveVisuals(){ if(liveVisuals){ liveVisuals.classList.add('show'); ensureLiveMiniChart(); } }
  function hideLiveVisuals(){ if(liveVisuals){ liveVisuals.classList.remove('show'); } }
  hideLivePanelBtn && hideLivePanelBtn.addEventListener('click', hideLiveVisuals);
  showLiveQuick && showLiveQuick.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });
  showLiveSurvey && showLiveSurvey.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });

  // ============ Gráfico de Resultados (Chart.js) ============
  let resultsChart = null; let chartRO = null;

  function applyResultsChartResponsiveOptions(chart){
    const isMobile = matchMedia('(max-width:680px)').matches;
    chart.options.plugins.legend.position = isMobile ? 'bottom' : 'top';
    chart.options.plugins.legend.labels.boxWidth = 10;
    chart.options.plugins.legend.labels.font = { size: isMobile ? 11 : 12 };
    chart.options.scales.x.ticks.font = { size: isMobile ? 10 : 12 };
    chart.options.scales.y.ticks.font = { size: isMobile ? 10 : 12 };
    chart.options.scales.y1.ticks.font = { size: isMobile ? 10 : 12 };
  }

  function ensureResultsChart(){
    const canvas = $('throughputChart'); 
    if(!canvas) {
      console.warn('throughputChart canvas not found');
      return;
    }
    if(resultsChart) { 
      try { 
        applyResultsChartResponsiveOptions(resultsChart); 
        resultsChart.resize(); 
      } catch(e) { 
        console.error('Error resizing chart:', e); 
      }
      return; 
    }
    
    try {
      const ctx = canvas.getContext('2d');
      resultsChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
          { label:'DL Mbps', data: [], borderColor:'#0b74ff', backgroundColor:'rgba(11,116,255,0.08)', yAxisID:'y', tension:0.24, pointRadius:3, fill:true },
          { label:'UL Mbps', data: [], borderColor:'#06b6d4', backgroundColor:'rgba(6,182,212,0.06)', yAxisID:'y', tension:0.24, pointRadius:3, fill:true },
          { label:'Ping ms', data: [], borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.04)', yAxisID:'y1', tension:0.2, pointRadius:2, borderDash:[4,2], fill:false }
        ]},
        options: {
          responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false}, animation:{duration:250},
          plugins:{ legend:{ position:'top', labels:{ boxWidth: 12 } } },
          scales:{ x:{ title:{display:true,text:'Punto'}, ticks:{ autoSkip:true, maxRotation:0 } },
            y:{ position:'left', title:{display:true,text:'Mbps'}, beginAtZero:true },
            y1:{ position:'right', title:{display:true,text:'Ping (ms)'}, beginAtZero:true, grid:{drawOnChartArea:false} } }
        }
      });
      applyResultsChartResponsiveOptions(resultsChart);

      // ResizeObserver para que no quede en 0x0
      const card = $('resultsChartCard');
      if(card && 'ResizeObserver' in window){
        chartRO = new ResizeObserver(()=> { 
          try { 
            applyResultsChartResponsiveOptions(resultsChart); 
            resultsChart.resize(); 
          } catch(e) { 
            console.error('ResizeObserver error:', e); 
          } 
        });
        chartRO.observe(card);
      }
      // Escucha cambios de media query para reconfigurar leyenda/ticks
      matchMedia('(max-width:680px)').addEventListener?.('change', ()=> {
        try { 
          applyResultsChartResponsiveOptions(resultsChart); 
          resultsChart.update(); 
        } catch(e) {
          console.error('Media query change error:', e);
        }
      });

      rebuildResultsChart();
    } catch(e) {
      console.error('Error creating results chart:', e);
      showError('Error al crear el gráfico de resultados');
    }
  }

  function getFilteredSortedResults(){
    const q=(searchInput?.value||'').trim().toLowerCase();
    let arr=[...results];
    if(q){ arr=arr.filter(r=>(r.point||'').toLowerCase().includes(q)||(r.ssid||'').toLowerCase().includes(q)||(r.device||'').toLowerCase().includes(q)); }
    const sort=sortResultsSelect?.value||'newest';
    if(sort==='oldest') arr.sort((a,b)=> new Date(a.timestamp)-new Date(b.timestamp));
    else if(sort==='dl-desc') arr.sort((a,b)=> (Number(b.iperf_dl_mbps)||0)-(Number(a.iperf_dl_mbps)||0));
    else if(sort==='dl-asc') arr.sort((a,b)=> (Number(a.iperf_dl_mbps)||0)-(Number(b.iperf_dl_mbps)||0));
    else arr.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
    return arr;
  }

  function rebuildResultsChart(){
    if(!resultsChart) return;
    const arr=getFilteredSortedResults();
    resultsChart.data.labels = arr.map(r=> r.point || new Date(r.timestamp).toLocaleTimeString());
    resultsChart.data.datasets[0].data = arr.map(r=> Number(r.iperf_dl_mbps)||0);
    resultsChart.data.datasets[1].data = arr.map(r=> Number(r.iperf_ul_mbps)||0);
    resultsChart.data.datasets[2].data = arr.map(r=> Number(r.ping_avg)||0);
    if(toggleDL) resultsChart.data.datasets[0].hidden = !toggleDL.checked;
    if(toggleUL) resultsChart.data.datasets[1].hidden = !toggleUL.checked;
    if(togglePing) resultsChart.data.datasets[2].hidden = !togglePing.checked;
    resultsChart.update('active');
  }

  function addLatestPointToChart(r){
    if(!resultsChart) return;
    resultsChart.data.labels.unshift(r.point || new Date(r.timestamp).toLocaleTimeString());
    resultsChart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps)||0);
    resultsChart.data.datasets[1].data.unshift(Number(r.iperf_ul_mbps)||0);
    resultsChart.data.datasets[2].data.unshift(Number(r.ping_avg)||0);
    const MAX_POINTS=80; while(resultsChart.data.labels.length>MAX_POINTS){ resultsChart.data.labels.pop(); resultsChart.data.datasets.forEach(ds=>ds.data.pop()); }
    if(toggleDL) resultsChart.data.datasets[0].hidden = !toggleDL.checked;
    if(toggleUL) resultsChart.data.datasets[1].hidden = !toggleUL.checked;
    if(togglePing) resultsChart.data.datasets[2].hidden = !togglePing.checked;
    resultsChart.update('active');
  }

  // Controles resultados
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  toggleDL && toggleDL.addEventListener('change', rebuildResultsChart);
  toggleUL && toggleUL.addEventListener('change', rebuildResultsChart);
  togglePing && togglePing.addEventListener('change', rebuildResultsChart);
  searchInput && searchInput.addEventListener('input', debounce(()=> rebuildResultsChart(),200));
  sortResultsSelect && sortResultsSelect.addEventListener('change', rebuildResultsChart);
  refreshChartBtn && refreshChartBtn.addEventListener('click', rebuildResultsChart);

  // ============ SSE / Polling with better error handling ============
  function openSseForTask(task_id){
    if(!task_id) {
      console.error('openSseForTask called without task_id');
      return;
    }
    if(typeof(EventSource)==='undefined'){ 
      console.warn('EventSource not supported, falling back to polling');
      pollTaskStatus(task_id, 1000); 
      return; 
    }
    if(currentSse) try{ currentSse.close(); }catch(e){ console.warn('Error closing previous SSE:', e); }
    
    const es=new EventSource(`/stream/${encodeURIComponent(task_id)}`); 
    currentSse=es;
    
    es.addEventListener('error', (e) => { 
      console.warn('SSE error, falling back to polling:', e);
      try { es.close(); } catch(err) { console.warn('Error closing SSE:', err); }
      pollTaskStatus(task_id, 1000); 
    });
    
    es.addEventListener('update', ev => { 
      try { 
        const data = JSON.parse(ev.data);
        handlePartialUpdate(data); 
      } catch(e) { 
        console.error('Error parsing SSE update:', e); 
      } 
    });
    
    es.addEventListener('finished', ev => { 
      try { 
        const data = JSON.parse(ev.data || 'null');
        handleFinalResult(data); 
      } catch(e) { 
        console.error('Error parsing SSE finished:', e); 
      } 
      try { es.close(); } catch(err) { console.warn('Error closing SSE:', err); }
      currentSse = null; 
    });
    
    return es;
  }
  
  let pollIntervalHandle=null;
  function pollTaskStatus(task_id, ms=1200){
    if(pollIntervalHandle) clearInterval(pollIntervalHandle);
    let errorCount = 0;
    const maxErrors = 5;
    
    pollIntervalHandle=setInterval(async()=>{
      try { 
        const r=await fetch(`/task_status/${task_id}`); 
        if(!r.ok) {
          errorCount++;
          console.warn(`Poll error (${errorCount}/${maxErrors}):`, r.status);
          if (errorCount >= maxErrors) {
            clearInterval(pollIntervalHandle);
            pollIntervalHandle = null;
            showError('Error de conexión con el servidor');
          }
          return; 
        }
        errorCount = 0; // Reset on success
        const js=await r.json(); 
        if(js.partial) handlePartialUpdate(js); 
        if(js.status==='finished' || js.status==='error' || js.status==='cancelled') { 
          handleFinalResult(js.result||js.results||{}); 
          clearInterval(pollIntervalHandle); 
          pollIntervalHandle=null; 
        } 
      } catch(e) { 
        errorCount++;
        console.warn(`Poll exception (${errorCount}/${maxErrors}):`, e);
        if (errorCount >= maxErrors) {
          clearInterval(pollIntervalHandle);
          pollIntervalHandle = null;
          showError('Error de conexión persistente con el servidor');
        }
      }
    }, ms);
  }

  function fmtTime(s){ s=Math.max(0,Math.round(s)); const mm=String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }
  function num(n){ const v=Number(n); return isNaN(v)? null : v; }

  async function updateRemaining(elapsed, partial){
    try{
      const cfg = await fetch('/_survey_config').then(r=>r.ok? r.json(): null);
      const dur = (cfg && cfg.IPERF_DURATION) ? cfg.IPERF_DURATION : (partial?.duration || 20);
      timeRemainingEl && (timeRemainingEl.textContent = fmtTime(Math.max(0, dur - (elapsed||0))));
    }catch{}
  }

  function handlePartialUpdate(dataContainer){
    const partial=dataContainer.partial || dataContainer;
    if(!partial) return;
    const dl=num(partial.dl_mbps) ?? 0;
    const ul=num(partial.ul_mbps) ?? 0;
    const pingAvg=num(partial.ping_avg_ms);
    const p50=num(partial.ping_p50_ms), p95=num(partial.ping_p95_ms), loss=num(partial.ping_loss_pct);
    const progress=Number(partial.progress_pct || partial.progress || 0);
    const elapsed=Number(partial.elapsed_s || 0);

    // Mostrar panel y actualizar gráfica en vivo
    showLiveVisuals();
    liveChartPush(elapsed, dl, ul, pingAvg);

    // Lecturas instantáneas
    instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
    instUlEl && (instUlEl.textContent = `${ul.toFixed(2)} Mbps`);
    instPingEl && (instPingEl.textContent = pingAvg!=null ? `${pingAvg.toFixed(2)} ms` : '—');
    instPing50El && (instPing50El.textContent = p50!=null ? `${p50.toFixed(2)} ms` : '—');
    instPing95El && (instPing95El.textContent = p95!=null ? `${p95.toFixed(2)} ms` : '—');
    instLossEl && (instLossEl.textContent = loss!=null ? `${loss.toFixed(2)} %` : '—');

    // Progreso y tiempo restante
    runProgressFill && (runProgressFill.style.width = `${progress}%`);
    progressPct && (progressPct.textContent = `${progress}%`);
    updateRemaining(elapsed, partial);
    liveSummary && (liveSummary.textContent = `Ejecutando... ${progress}%`);
  }

  function handleFinalResult(res){
    if(!res){ liveSummary && (liveSummary.textContent = 'Prueba finalizada (sin resultado)'); return; }
    if(Array.isArray(res)){
      res.forEach(r => pushResultToList(mapFinalToResult(r)));
      ensureResultsChart(); rebuildResultsChart();
      liveSummary && (liveSummary.textContent = `Encuesta finalizada: ${res.length} puntos`);
    } else {
      const mapped = mapFinalToResult(res);
      // Fallback: si el backend no trajo samples, usa los del frontend
      if(!mapped.samples || !mapped.samples.length){
        mapped.samples = liveSamples.map(s=>({ t:s.t, dl:s.dl, ul:s.ul, ping:s.ping }));
      }

      // Actualiza lecturas finales
      const dl=Number(mapped.iperf_dl_mbps||0);
      instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
      instUlEl && (instUlEl.textContent = `${Number(mapped.iperf_ul_mbps||0).toFixed(2)} Mbps`);
      instPingEl && (instPingEl.textContent = mapped.ping_avg!=null ? `${Number(mapped.ping_avg).toFixed(2)} ms` : '—');

      pushResultToList(mapped);
      ensureResultsChart(); addLatestPointToChart(mapped);
      updateSummary();
    }

    // Reset progreso y buffer de muestras para la próxima prueba
    runProgressFill && (runProgressFill.style.width = `0%`);
    progressPct && (progressPct.textContent = `0%`);
    timeRemainingEl && (timeRemainingEl.textContent = '00:00');
    setTimeout(()=> liveChartReset(), 500);
  }

  function mapFinalToResult(res){
    const n=v=>{ const x=Number(v); return isNaN(x)? null : x; };
    const out = {
      device: res.device || deviceEl?.value || '',
      point: res.point || pointEl?.value || '',
      timestamp: res.timestamp || new Date().toISOString(),
      ssid: res.ssid || '', bssid: res.bssid || '', rssi: res.rssi || '',
      iperf_dl_mbps: n(res.iperf_dl_mbps), iperf_ul_mbps: n(res.iperf_ul_mbps),
      ping_avg: n(res.ping_avg_ms) ?? n(res.ping_avg), ping_jitter: n(res.ping_jitter_ms) ?? n(res.ping_jitter),
      ping_p50: n(res.ping_p50_ms), ping_p95: n(res.ping_p95_ms), ping_loss_pct: n(res.ping_loss_pct),
      raw_file: res.raw_file || ''
    };
    if(Array.isArray(res.samples)){ out.samples = res.samples.map(s=> ({ t:n(s.t), dl:n(s.dl), ul:n(s.ul), ping:n(s.ping) })); }
    return out;
  }

  function pushResultToList(r){
    results.unshift(r); if(results.length>500) results.pop();
    const card=document.createElement('div'); card.className='result-item';
    card.innerHTML = `
      <div style="flex:1; min-width:140px;">
        <strong>${(r.point ?? '')}</strong>
        <div class="muted">${(r.ssid ?? '')}</div>
      </div>
      <div style="width:120px;text-align:right">${r.iperf_dl_mbps!=null? Number(r.iperf_dl_mbps).toFixed(2):'—'} Mbps</div>
      <div style="width:120px;text-align:right">${r.iperf_ul_mbps!=null? Number(r.iperf_ul_mbps).toFixed(2):'—'} Mbps</div>
      <div style="width:80px;text-align:right">${r.ping_avg!=null? r.ping_avg.toFixed(2):'—'}</div>
      <div style="width:60px;text-align:center"><a class="muted" href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank">raw</a></div>
    `;
    if(resultsList) resultsList.prepend(card);
    if(emptyState) emptyState.style.display = results.length ? 'none' : 'block';
  }

  // Run quick
  runBtn && runBtn.addEventListener('click', async ()=>{
    const device=(deviceEl?.value||'phone').trim();
    const point=(pointEl?.value||'P1').trim();
    const runIndex=Number(runEl?.value)||1;
    
    // Validation
    if (!validateDeviceName(device)) {
      showError('Nombre de dispositivo inválido (máximo 50 caracteres)');
      return;
    }
    if (!validatePointName(point)) {
      showError('Nombre de punto inválido. Use solo letras, números, guiones y guiones bajos.');
      return;
    }
    if (runIndex < 1 || runIndex > 1000) {
      showError('El índice de ejecución debe estar entre 1 y 1000');
      return;
    }
    
    runBtn.disabled=true;
    try{
      const res=await fetch('/run_point',{ 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ device, point, run: runIndex }) 
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error de conexión' }));
        showError(errorData.error || `Error HTTP ${res.status}`);
        return;
      }
      
      const j=await res.json();
      if(!j || !j.ok){ 
        showError(j?.error || 'Error desconocido');
        return; 
      }
      
      lastSurveyTaskId=j.task_id; 
      $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id.substring(0, 8) + '...');
      liveChartReset(); 
      showLiveVisuals(); 
      showSuccess('Tarea iniciada correctamente');
      openSseForTask(j.task_id); 
      setMode('results');
    } catch(e) { 
      showError(`Error de conexión: ${e.message}`);
      console.error('Run point error:', e);
    } finally { 
      runBtn.disabled=false; 
    }
  });

  // Survey
  startSurveyBtn && startSurveyBtn.addEventListener('click', async ()=>{
    const device=(surveyDeviceEl?.value||deviceEl?.value||'phone').trim();
    const ptsRaw=(pointsEl?.value||'').trim();
    const repeats=Number(repeatsEl?.value)||1;
    const manual=!!manualCheckbox?.checked;
    
    // Validation
    if (!validateDeviceName(device)) {
      showError('Nombre de dispositivo inválido (máximo 50 caracteres)');
      return;
    }
    if(!ptsRaw) { 
      showError('Debe introducir al menos un punto'); 
      return; 
    }
    
    const points= ptsRaw.includes(',') 
      ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) 
      : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    
    if (points.length === 0) {
      showError('Debe introducir al menos un punto válido');
      return;
    }
    if (points.length > 100) {
      showError('Demasiados puntos (máximo 100)');
      return;
    }
    
    // Validate each point name
    for (const pt of points) {
      if (!validatePointName(pt)) {
        showError(`Nombre de punto inválido: "${pt}". Use solo letras, números, guiones y guiones bajos.`);
        return;
      }
    }
    
    if (repeats < 1 || repeats > 50) {
      showError('Las repeticiones deben estar entre 1 y 50');
      return;
    }
    
    startSurveyBtn.disabled=true;
    try{
      const res=await fetch('/start_survey',{ 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ device, points, repeats, manual }) 
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error de conexión' }));
        showError(errorData.error || `Error HTTP ${res.status}`);
        if (surveyLog) surveyLog.textContent = 'Error: ' + (errorData.error || 'Unknown error');
        return;
      }
      
      const j=await res.json();
      if(!j.ok) { 
        showError(j.error || 'Error desconocido');
        if (surveyLog) surveyLog.textContent='Error: ' + (j.error||''); 
        return; 
      }
      
      lastSurveyTaskId=j.task_id; 
      $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id.substring(0, 8) + '...');
      cancelTaskBtn && (cancelTaskBtn.disabled=false);
      liveChartReset(); 
      showLiveVisuals(); 
      openSseForTask(j.task_id); 
      surveyArea && (surveyArea.hidden=false); 
      setMode('results');
      showSuccess('Encuesta iniciada correctamente');
    } catch(e) { 
      showError(`Error de conexión: ${e.message}`);
      if (surveyLog) surveyLog.textContent='Error al iniciar: '+e; 
      console.error('Start survey error:', e);
    } finally { 
      startSurveyBtn.disabled=false; 
    }
  });

  // Proceed / Cancel with better error handling
  proceedBtn && proceedBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ 
      showError('No hay encuesta en curso'); 
      return; 
    }
    proceedBtn.disabled=true; 
    try{ 
      const r=await fetch(`/task_proceed/${encodeURIComponent(lastSurveyTaskId)}`,{method:'POST'}); 
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ error: 'Error de conexión' }));
        showError('Error al proceder: '+(errorData.error||''));
        return;
      }
      const js=await r.json(); 
      if(!js.ok) {
        showError('Error al proceder: '+(js.error||''));
      } else {
        showSuccess('Continuando con siguiente punto...', 2000);
      }
    } catch(e) { 
      showError(`Error de conexión: ${e.message}`); 
      console.error('Proceed error:', e);
    } finally { 
      proceedBtn.disabled=false; 
    }
  });
  
  cancelTaskBtn && cancelTaskBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ 
      showError('No hay encuesta en curso'); 
      return; 
    }
    if (!confirm('¿Está seguro de que desea cancelar la encuesta?')) {
      return;
    }
    try{ 
      await fetch(`/task_cancel/${encodeURIComponent(lastSurveyTaskId)}`,{method:'POST'}); 
      showSuccess('Encuesta cancelada', 3000);
      cancelTaskBtn.disabled=true;
    } catch(e) {
      showError(`Error al cancelar: ${e.message}`);
      console.error('Cancel error:', e);
    }
  });

  // Export helpers
  function download(name,text,mime='text/plain'){ const blob=new Blob([text],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
  function toCsvRow(cells){ return cells.map(c=>{ if(c==null) return ''; const s=String(c); return /[",\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }).join(','); }
  function groupBy(arr,key){ const m=new Map(); arr.forEach(it=>{ const k=it[key]||''; if(!m.has(k)) m.set(k,[]); m.get(k).push(it); }); return m; }
  function stats(arr){ const vals=arr.filter(v=>typeof v==='number'&&!isNaN(v)); const n=vals.length; if(!n) return {n:0,avg:null,min:null,max:null,std:null,p50:null,p95:null}; vals.sort((a,b)=>a-b); const sum=vals.reduce((a,b)=>a+b,0), avg=sum/n, min=vals[0], max=vals[n-1]; const std=Math.sqrt(vals.reduce((a,b)=>a+(b-avg)*(b-avg),0)/n); const perc=q=>{ const k=(n-1)*(q/100), f=Math.floor(k), c=Math.min(f+1,n-1); return f===c? vals[f] : vals[f]*(c-k)+vals[c]*(k-f); }; return {n,avg,min,max,std,p50:perc(50),p95:perc(95)}; }

  exportJsonBtn?.addEventListener('click', ()=> download('wifi_recent.json', JSON.stringify(results.slice(0,1000), null, 2), 'application/json'));
  clearResultsBtn?.addEventListener('click', ()=> { results=[]; resultsList && (resultsList.innerHTML=''); if(resultsChart){ resultsChart.data.labels=[]; resultsChart.data.datasets.forEach(ds=>ds.data=[]); resultsChart.update(); } updateSummary(); emptyState && (emptyState.style.display='block'); });
  exportCsvWideBtn?.addEventListener('click', ()=>{
    const header=['point','n','dl_avg','dl_min','dl_max','dl_std','ul_avg','ul_min','ul_max','ul_std','ping_avg','ping_min','ping_max','ping_std','ping_p50','ping_p95','loss_avg'];
    const lines=[toCsvRow(header)];
    const byPoint=groupBy(results,'point');
    for(const [pt,arr] of byPoint.entries()){
      const sDL=stats(arr.map(x=>Number(x.iperf_dl_mbps))); const sUL=stats(arr.map(x=>Number(x.iperf_ul_mbps)));
      const pAvg=stats(arr.map(x=>Number(x.ping_avg))); const p50s=stats(arr.map(x=>Number(x.ping_p50))); const p95s=stats(arr.map(x=>Number(x.ping_p95)));
      const lossVals=arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v)); const lossAvg=lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null;
      lines.push(toCsvRow([pt,sDL.n,sDL.avg?.toFixed(4),sDL.min?.toFixed(4),sDL.max?.toFixed(4),sDL.std?.toFixed(4),sUL.avg?.toFixed(4),sUL.min?.toFixed(4),sUL.max?.toFixed(4),sUL.std?.toFixed(4),pAvg.avg?.toFixed(4),pAvg.min?.toFixed(4),pAvg.max?.toFixed(4),pAvg.std?.toFixed(4),p50s.p50?.toFixed(4),p95s.p95?.toFixed(4),lossAvg!=null?lossAvg.toFixed(4):'']));
    }
    download('wifi_results_wide.csv', lines.join('\n'), 'text/csv');
  });
  exportCsvLongBtn?.addEventListener('click', ()=>{
    const header=['device','point','timestamp','ssid','bssid','rssi','dl_mbps','ul_mbps','ping_avg_ms','ping_p50_ms','ping_p95_ms','ping_loss_pct','ping_jitter_ms','raw_file'];
    const lines=[toCsvRow(header)];
    results.forEach(r=> lines.push(toCsvRow([r.device,r.point,r.timestamp,r.ssid,r.bssid,r.rssi,r.iperf_dl_mbps,r.iperf_ul_mbps,r.ping_avg,r.ping_p50,r.ping_p95,r.ping_loss_pct,r.ping_jitter,r.raw_file])));
    download('wifi_results_long.csv', lines.join('\n'), 'text/csv');
  });
  exportSummaryJsonBtn?.addEventListener('click', ()=>{
    const summary={}; const byPoint=groupBy(results,'point');
    for(const [pt,arr] of byPoint.entries()){
      const sDL=stats(arr.map(x=>Number(x.iperf_dl_mbps))); const sUL=stats(arr.map(x=>Number(x.iperf_ul_mbps)));
      const pAvg=stats(arr.map(x=>Number(x.ping_avg))); const p50s=stats(arr.map(x=>Number(x.ping_p50))); const p95s=stats(arr.map(x=>Number(x.ping_p95)));
      const lossVals=arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v));
      summary[pt]={ count:sDL.n, dl:{avg:sDL.avg,min:sDL.min,max:sDL.max,std:sDL.std}, ul:{avg:sUL.avg,min:sUL.min,max:sUL.max,std:sUL.std}, ping:{avg:pAvg.avg,min:pAvg.min,max:pAvg.max,std:pAvg.std,p50:p50s.p50,p95:p95s.p95}, loss_avg: lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null };
    }
    download('wifi_summary.json', JSON.stringify(summary,null,2), 'application/json');
  });
  exportSamplesCsvBtn?.addEventListener('click', ()=>{
    const header=['device','point','timestamp','t_s','dl_inst_mbps','ul_inst_mbps','ping_inst_ms'];
    const lines=[toCsvRow(header)];
    results.forEach(r=>{
      if(Array.isArray(r.samples)){
        r.samples.forEach(s=> lines.push(toCsvRow([r.device,r.point,r.timestamp, s.t??'', s.dl??'', s.ul??'', s.ping??'' ])));
      }
    });
    download('wifi_samples_long.csv', lines.join('\n'), 'text/csv');
  });

  function updateSummary(){
    const n=v=>{ const x=Number(v); return isNaN(x)? null : x; };
    const avg=arr=> arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const rssiVals=results.map(x=>n(x.rssi)).filter(v=>v!=null);
    const dlVals=results.map(x=>n(x.iperf_dl_mbps)).filter(v=>v!=null);
    const ulVals=results.map(x=>n(x.iperf_ul_mbps)).filter(v=>v!=null);
    const pingVals=results.map(x=>n(x.ping_avg)).filter(v=>v!=null);
    avgRssi && (avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals))+' dBm' : '—');
    avgDl && (avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2)+' Mbps' : '—');
    avgUl && (avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2)+' Mbps' : '—');
    avgPing && (avgPing.textContent = pingVals.length ? avg(pingVals).toFixed(2)+' ms' : '—');
  }

  // Init mínimos
  updateSummary();

  // Expose (debug)
  window.__ws = Object.assign(window.__ws || {}, { ensureResultsChart, rebuildResultsChart });
})();