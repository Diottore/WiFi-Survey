// static/app.js v13 — Migración a Apache ECharts (live + resultados).
// Mantiene SSE/polling, filtros, exportaciones y layout mobile-first.

(() => {
  const $ = id => document.getElementById(id);

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
      refreshResultsLayout();
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
  
  // Hide/Show live panel handlers
  hideLivePanelBtn && hideLivePanelBtn.addEventListener('click', ()=> {
    liveVisuals && liveVisuals.classList.remove('show');
  });
  showLiveQuick && showLiveQuick.addEventListener('click', ()=> {
    if(liveVisuals && !liveVisuals.classList.contains('show')) {
      liveVisuals.classList.add('show');
      ensureLiveMiniChart();
    }
  });
  showLiveSurvey && showLiveSurvey.addEventListener('click', ()=> {
    if(liveVisuals && !liveVisuals.classList.contains('show')) {
      liveVisuals.classList.add('show');
      ensureLiveMiniChart();
    }
  });
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

  // ===== Utils =====
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function download(name,text,mime='text/plain'){ const blob=new Blob([text],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
  function toCsvRow(cells){ return cells.map(c=>{ if(c==null) return ''; const s=String(c); return /[",\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }).join(','); }
  function groupBy(arr,key){ const m=new Map(); arr.forEach(it=>{ const k=it[key]||''; if(!m.has(k)) m.set(k,[]); m.get(k).push(it); }); return m; }
  function stats(arr){
    const vals=arr.filter(v=>typeof v==='number'&&!isNaN(v)); const n=vals.length;
    if(!n) return {n:0,avg:null,min:null,max:null,std:null,p50:null,p95:null};
    vals.sort((a,b)=>a-b); const sum=vals.reduce((a,b)=>a+b,0), avg=sum/n, min=vals[0], max=vals[n-1];
    const std=Math.sqrt(vals.reduce((a,b)=>a+(b-avg)*(b-avg),0)/n);
    const perc=q=>{ const k=(n-1)*(q/100), f=Math.floor(k), c=Math.min(f+1,n-1); return f===c? vals[f] : vals[f]*(c-k)+vals[c]*(k-f); };
    return {n,avg,min,max,std,p50:perc(50),p95:perc(95)};
  }
  function refreshResultsLayout(){
    requestAnimationFrame(()=> requestAnimationFrame(()=> {
      try { resultsChart && resultsChart.resize(); } catch{}
    }));
  }

  // ======================
  // ECharts: Estabilidad en vivo
  // ======================
  let liveChart = null;
  let liveSamples = []; // {t, dl, ul, ping}
  function ensureLiveMiniChart(){
    const el = $('liveMiniChart'); if(!el) return;
    if(liveChart) return;
    liveChart = echarts.init(el, null, {renderer:'canvas'});
    liveChart.setOption({
      grid:{left:40,right:46,top:28,bottom:32},
      tooltip:{trigger:'axis'},
      legend:{
        top:0,
        textStyle:{fontSize:12}
      },
      xAxis:{ type:'category', name:'s', boundaryGap:false, data:[] },
      yAxis:[
        { type:'value', name:'Mbps', min:0, axisLabel:{formatter: '{value}'} },
        { type:'value', name:'ms', min:0, axisLabel:{formatter: '{value}'} }
      ],
      series:[
        { name:'DL', type:'line', smooth:true, areaStyle:{opacity:0.15}, itemStyle:{color:'#0b74ff'}, yAxisIndex:0, data:[] },
        { name:'UL', type:'line', smooth:true, areaStyle:{opacity:0.12}, itemStyle:{color:'#06b6d4'}, yAxisIndex:0, data:[] },
        { name:'Ping', type:'line', smooth:true, itemStyle:{color:'#ef4444'}, lineStyle:{type:'dashed'}, yAxisIndex:1, data:[] }
      ]
    });
    window.addEventListener('resize', ()=> liveChart && liveChart.resize());
  }
  function liveChartPush(t, dl, ul, ping){
    ensureLiveMiniChart();
    if(!liveChart) return;
    liveSamples.push({t, dl, ul, ping});
    if(liveSamples.length > 600) liveSamples.shift();
    const xs = liveSamples.map(s=> s.t);
    liveChart.setOption({
      xAxis:{ data: xs },
      series:[
        { name:'DL', data: liveSamples.map(s=> s.dl ?? null) },
        { name:'UL', data: liveSamples.map(s=> s.ul ?? null) },
        { name:'Ping', data: liveSamples.map(s=> s.ping ?? null) }
      ]
    }, { notMerge:false, lazyUpdate:true });
  }
  function liveChartReset(){
    liveSamples = [];
    if(liveChart){
      liveChart.setOption({
        xAxis:{data:[]},
        series:[{data:[]},{data:[]},{data:[]}]
      }, {notMerge:true, lazyUpdate:true});
    }
  }

  // ======================
  // ECharts: Resultados
  // ======================
  let resultsChart = null;
  let resultsChartEl = null;

  function getLegendSelectedFromToggles(){
    return {
      'DL Mbps': !!toggleDL?.checked,
      'UL Mbps': !!toggleUL?.checked,
      'Ping ms': !!togglePing?.checked
    };
  }

  function ensureResultsChart(){
    resultsChartEl = $('throughputChart');
    if(!resultsChartEl) return;
    if(resultsChart) { try { resultsChart.resize(); } catch{} return; }
    resultsChart = echarts.init(resultsChartEl, null, {renderer:'canvas'});
    resultsChart.setOption({
      grid:{left:48,right:52,top:30,bottom:42},
      tooltip:{trigger:'axis'},
      legend:{ top:0, selected: getLegendSelectedFromToggles(), textStyle:{fontSize:12} },
      xAxis:{ type:'category', name:'Punto', boundaryGap:false, data:[] },
      yAxis:[
        { type:'value', name:'Mbps', min:0 },
        { type:'value', name:'ms', min:0 }
      ],
      dataZoom:[
        { type:'inside' },
        { type:'slider', height:14, bottom:12 }
      ],
      series:[
        { name:'DL Mbps', type:'line', smooth:true, areaStyle:{opacity:0.15}, itemStyle:{color:'#0b74ff'}, yAxisIndex:0, data:[] },
        { name:'UL Mbps', type:'line', smooth:true, areaStyle:{opacity:0.12}, itemStyle:{color:'#06b6d4'}, yAxisIndex:0, data:[] },
        { name:'Ping ms', type:'line', smooth:true, itemStyle:{color:'#ef4444'}, lineStyle:{type:'dashed'}, yAxisIndex:1, data:[] }
      ]
    });
    // Resize robusto
    const ro = new ResizeObserver(()=> { try { resultsChart.resize(); } catch{} });
    ro.observe($('resultsChartCard') || resultsChartEl);
    window.addEventListener('resize', debounce(()=> { try { resultsChart.resize(); } catch{} }, 120));
    window.matchMedia('(max-width:680px)').addEventListener?.('change', ()=> { try { resultsChart.resize(); } catch{} });
  }

  function getFilteredSortedResults(){
    const q=(searchInput?.value||'').trim().toLowerCase();
    let arr=[...results];
    if(q){
      arr = arr.filter(r =>
        (r.point||'').toLowerCase().includes(q) ||
        (r.ssid||'').toLowerCase().includes(q) ||
        (r.device||'').toLowerCase().includes(q)
      );
    }
    const sort=sortResultsSelect?.value || 'newest';
    if(sort==='oldest') arr.sort((a,b)=> new Date(a.timestamp)-new Date(b.timestamp));
    else if(sort==='dl-desc') arr.sort((a,b)=> (Number(b.iperf_dl_mbps)||0)-(Number(a.iperf_dl_mbps)||0));
    else if(sort==='dl-asc') arr.sort((a,b)=> (Number(a.iperf_dl_mbps)||0)-(Number(b.iperf_dl_mbps)||0));
    else arr.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
    return arr;
  }

  function applyLegendSelectionFromToggles(){
    if(!resultsChart) return;
    const selected = getLegendSelectedFromToggles();
    resultsChart.setOption({ legend:{ selected } }, {notMerge:false});
  }

  function rebuildResultsChart(){
    if(!resultsChart) return;
    const arr=getFilteredSortedResults();
    const labels = arr.map(r=> r.point || new Date(r.timestamp).toLocaleTimeString());
    resultsChart.setOption({
      xAxis:{ data: labels },
      legend:{ selected: getLegendSelectedFromToggles() },
      series:[
        { name:'DL Mbps', data: arr.map(r=> Number(r.iperf_dl_mbps)||0) },
        { name:'UL Mbps', data: arr.map(r=> Number(r.iperf_ul_mbps)||0) },
        { name:'Ping ms', data: arr.map(r=> Number(r.ping_avg)||0) }
      ]
    }, {notMerge:false, lazyUpdate:true});
    refreshResultsLayout();
  }

  function addLatestPointToChart(r){
    if(!resultsChart) return;
    // Mantenemos "más recientes primero" como venías usando (unshift)
    const current = resultsChart.getOption();
    const labels = (current.xAxis?.[0]?.data || []).slice();
    const dl = (current.series?.[0]?.data || []).slice();
    const ul = (current.series?.[1]?.data || []).slice();
    const ping = (current.series?.[2]?.data || []).slice();

    labels.unshift(r.point || new Date(r.timestamp).toLocaleTimeString());
    dl.unshift(Number(r.iperf_dl_mbps)||0);
    ul.unshift(Number(r.iperf_ul_mbps)||0);
    ping.unshift(Number(r.ping_avg)||0);

    const MAX_POINTS = 80;
    while(labels.length > MAX_POINTS){ labels.pop(); dl.pop(); ul.pop(); ping.pop(); }

    resultsChart.setOption({
      xAxis:{ data: labels },
      series:[
        { name:'DL Mbps', data: dl },
        { name:'UL Mbps', data: ul },
        { name:'Ping ms', data: ping }
      ]
    }, {notMerge:false, lazyUpdate:true});
    applyLegendSelectionFromToggles();
    refreshResultsLayout();
  }

  // Controles resultados
  toggleDL && toggleDL.addEventListener('change', ()=> { applyLegendSelectionFromToggles(); });
  toggleUL && toggleUL.addEventListener('change', ()=> { applyLegendSelectionFromToggles(); });
  togglePing && togglePing.addEventListener('change', ()=> { applyLegendSelectionFromToggles(); });
  searchInput && searchInput.addEventListener('input', debounce(()=> rebuildResultsChart(), 200));
  sortResultsSelect && sortResultsSelect.addEventListener('change', rebuildResultsChart);
  refreshChartBtn && refreshChartBtn.addEventListener('click', rebuildResultsChart);

  // ======================
  // SSE / Polling
  // ======================
  function openSseForTask(task_id){
    if(!task_id) return;
    if(typeof(EventSource)==='undefined'){ pollTaskStatus(task_id, 1000); return; }
    if(currentSse) try{ currentSse.close(); }catch{}
    const es=new EventSource(`/stream/${encodeURIComponent(task_id)}`); currentSse=es;
    es.addEventListener('error',()=>{ try{es.close();}catch{} pollTaskStatus(task_id,1000); });
    es.addEventListener('update', ev=>{ try{ handlePartialUpdate(JSON.parse(ev.data)); }catch(e){ console.error(e); } });
    es.addEventListener('finished', ev=>{ try{ handleFinalResult(JSON.parse(ev.data||'null')); }catch(e){ console.error(e); } try{es.close();}catch{} currentSse=null; });
    return es;
  }
  let pollIntervalHandle=null;
  function pollTaskStatus(task_id, ms=1200){
    if(pollIntervalHandle) clearInterval(pollIntervalHandle);
    pollIntervalHandle=setInterval(async()=>{
      try{
        const r=await fetch(`/task_status/${task_id}`);
        if(!r.ok) return;
        const js=await r.json();
        if(js.partial) handlePartialUpdate(js);
        if(js.status==='finished'){
          handleFinalResult(js.result||js.results||{});
          clearInterval(pollIntervalHandle); pollIntervalHandle=null;
        }
      }catch(e){ console.warn('poll error',e); }
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

    // Mostrar panel y actualizar mini gráfica
    if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
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
      const dl=Number(mapped.iperf_dl_mbps||0);
      instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
      instUlEl && (instUlEl.textContent = `${Number(mapped.iperf_ul_mbps||0).toFixed(2)} Mbps`);
      instPingEl && (instPingEl.textContent = mapped.ping_avg!=null ? `${Number(mapped.ping_avg).toFixed(2)} ms` : '—');

      pushResultToList(mapped);
      ensureResultsChart(); addLatestPointToChart(mapped);
      updateSummary();
    }

    // Actualizar progreso a 100% y mantener gráfica en vivo visible
    runProgressFill && (runProgressFill.style.width = `100%`);
    progressPct && (progressPct.textContent = `100%`);
    timeRemainingEl && (timeRemainingEl.textContent = '00:00');
    liveSummary && (liveSummary.textContent = 'Prueba completada - Visualiza la gráfica arriba');
    
    // NO resetear la gráfica en vivo inmediatamente - dejar visible para revisión
    // El usuario puede ocultarla manualmente o se reseteará al iniciar una nueva prueba
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
      <div style="width:120px;text-align:right">${r.iperf_ul_mbps!=null? Number(r.iperf_ul_mbps).toFixed(2):'—'}</div>
      <div style="width:80px;text-align:right">${r.ping_avg!=null? r.ping_avg.toFixed(2):'—'}</div>
      <div style="width:100px;text-align:center">
        <button class="btn small view-samples-btn" data-index="${results.length-1}" style="padding:4px 8px;font-size:.85rem;">Ver gráfica</button>
      </div>
      <div style="width:60px;text-align:center"><a class="muted" href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank">raw</a></div>
    `;
    if(resultsList) resultsList.prepend(card);
    
    // Add event listener to view samples button
    const viewBtn = card.querySelector('.view-samples-btn');
    if(viewBtn){
      viewBtn.addEventListener('click', ()=> showResultSamples(results.length-1-parseInt(viewBtn.getAttribute('data-index'))));
    }
    
    if(emptyState) emptyState.style.display = results.length ? 'none' : 'block';
    refreshResultsLayout();
  }
  
  // Modal para ver muestras de un resultado individual
  function showResultSamples(index){
    const r = results[index];
    if(!r || !r.samples || !r.samples.length){
      alert('No hay datos de muestras disponibles para este resultado');
      return;
    }
    
    // Crear modal si no existe
    let modal = $('samplesModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'samplesModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box card" style="max-width:900px; margin:40px auto; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <h3 style="margin:0;">Gráfica de prueba</h3>
              <div class="muted" id="samplesModalSubtitle"></div>
            </div>
            <button id="closeSamplesModal" class="btn small">Cerrar</button>
          </div>
          <div id="samplesChartWrap" style="height:400px;">
            <div id="samplesChart" style="width:100%;height:100%;"></div>
          </div>
          <div style="margin-top:12px; padding:10px; background:#f8f9fa; border-radius:8px;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px;">
              <div><small class="muted">Punto</small><div id="samplePoint" style="font-weight:600;">—</div></div>
              <div><small class="muted">DL avg</small><div id="sampleDL" style="font-weight:600;">—</div></div>
              <div><small class="muted">UL avg</small><div id="sampleUL" style="font-weight:600;">—</div></div>
              <div><small class="muted">Ping avg</small><div id="samplePing" style="font-weight:600;">—</div></div>
              <div><small class="muted">RSSI</small><div id="sampleRSSI" style="font-weight:600;">—</div></div>
              <div><small class="muted">SSID</small><div id="sampleSSID" style="font-weight:600;">—</div></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      $('closeSamplesModal').addEventListener('click', ()=> modal.setAttribute('hidden',''));
      modal.addEventListener('click', (e)=> { if(e.target === modal) modal.setAttribute('hidden',''); });
    }
    
    // Actualizar datos del modal
    $('samplesModalSubtitle').textContent = `${r.point || 'N/A'} - ${new Date(r.timestamp).toLocaleString()}`;
    $('samplePoint').textContent = r.point || '—';
    $('sampleDL').textContent = r.iperf_dl_mbps!=null ? `${Number(r.iperf_dl_mbps).toFixed(2)} Mbps` : '—';
    $('sampleUL').textContent = r.iperf_ul_mbps!=null ? `${Number(r.iperf_ul_mbps).toFixed(2)} Mbps` : '—';
    $('samplePing').textContent = r.ping_avg!=null ? `${Number(r.ping_avg).toFixed(2)} ms` : '—';
    $('sampleRSSI').textContent = r.rssi!=null ? `${r.rssi} dBm` : '—';
    $('sampleSSID').textContent = r.ssid || '—';
    
    // Crear/actualizar gráfica
    const chartEl = $('samplesChart');
    let samplesChart = echarts.getInstanceByDom(chartEl);
    if(!samplesChart) samplesChart = echarts.init(chartEl);
    
    const times = r.samples.map(s=> s.t);
    const dlData = r.samples.map(s=> s.dl ?? null);
    const ulData = r.samples.map(s=> s.ul ?? null);
    const pingData = r.samples.map(s=> s.ping ?? null);
    
    samplesChart.setOption({
      grid:{left:50,right:50,top:40,bottom:40},
      tooltip:{trigger:'axis'},
      legend:{ top:5, textStyle:{fontSize:12} },
      xAxis:{ type:'category', name:'Tiempo (s)', boundaryGap:false, data:times },
      yAxis:[
        { type:'value', name:'Mbps', min:0, axisLabel:{formatter: '{value}'} },
        { type:'value', name:'ms', min:0, axisLabel:{formatter: '{value}'} }
      ],
      series:[
        { name:'DL', type:'line', smooth:true, areaStyle:{opacity:0.15}, itemStyle:{color:'#0b74ff'}, yAxisIndex:0, data:dlData },
        { name:'UL', type:'line', smooth:true, areaStyle:{opacity:0.12}, itemStyle:{color:'#06b6d4'}, yAxisIndex:0, data:ulData },
        { name:'Ping', type:'line', smooth:true, itemStyle:{color:'#ef4444'}, lineStyle:{type:'dashed'}, yAxisIndex:1, data:pingData }
      ]
    });
    
    modal.removeAttribute('hidden');
    setTimeout(()=> samplesChart.resize(), 100);
  }

  // Run quick
  runBtn && runBtn.addEventListener('click', async ()=>{
    runBtn.disabled=true;
    const device=(deviceEl?.value||'phone').trim(), point=(pointEl?.value||'P1').trim(), runIndex=Number(runEl?.value)||1;
    try{
      const res=await fetch('/run_point',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ device, point, run: runIndex }) });
      const j=await res.json();
      if(!j || !j.ok){ liveSummary && (liveSummary.textContent = `Error: ${j?.error||'unknown'}`); runBtn.disabled=false; return; }
      lastSurveyTaskId=j.task_id; $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id);
      // Resetear gráfica en vivo al iniciar nueva prueba
      liveChartReset(); 
      if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
      liveSummary && (liveSummary.textContent='Tarea iniciada, esperando actualizaciones...'); 
      openSseForTask(j.task_id); 
      setMode('results');
    }catch(e){ liveSummary && (liveSummary.textContent = `Error: ${e.message}`); } finally{ runBtn.disabled=false; }
  });

  // Survey
  startSurveyBtn && startSurveyBtn.addEventListener('click', async ()=>{
    startSurveyBtn.disabled=true;
    const device=(surveyDeviceEl?.value||deviceEl?.value||'phone').trim();
    const ptsRaw=(pointsEl?.value||'').trim(); if(!ptsRaw){ alert('Introduce puntos'); startSurveyBtn.disabled=false; return; }
    const points= ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    const repeats=Number(repeatsEl?.value)||1; const manual=!!manualCheckbox?.checked;
    try{
      const res=await fetch('/start_survey',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ device, points, repeats, manual }) });
      const j=await res.json();
      if(!j.ok){ surveyLog && (surveyLog.textContent='Error: ' + (j.error||'')); startSurveyBtn.disabled=false; return; }
      lastSurveyTaskId=j.task_id; $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id);
      cancelTaskBtn && (cancelTaskBtn.disabled=false);
      // Resetear gráfica en vivo al iniciar nueva encuesta
      liveChartReset(); 
      if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
      openSseForTask(j.task_id); surveyArea && (surveyArea.hidden=false); setMode('results');
    }catch(e){ surveyLog && (surveyLog.textContent='Error al iniciar: '+e); } finally{ startSurveyBtn.disabled=false; }
  });

  // Proceed / Cancel
  proceedBtn && proceedBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    proceedBtn.disabled=true; try{
      const r=await fetch(`/task_proceed/${encodeURIComponent(lastSurveyTaskId)}`,{method:'POST'}); const js=await r.json();
      if(!js.ok) alert('Error al proceder: '+(js.error||''));
    }catch(e){ alert('Error: '+e); } finally{ proceedBtn.disabled=false; }
  });
  cancelTaskBtn && cancelTaskBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    try{ await fetch(`/task_cancel/${encodeURIComponent(lastSurveyTaskId)}`,{method:'POST'}); }catch{}
  });

  // Export
  exportJsonBtn?.addEventListener('click', ()=> download('wifi_recent.json', JSON.stringify(results.slice(0,1000), null, 2), 'application/json'));
  clearResultsBtn?.addEventListener('click', ()=> {
    results=[]; resultsList && (resultsList.innerHTML='');
    if(resultsChart){ resultsChart.setOption({ xAxis:{data:[]}, series:[{data:[]},{data:[]},{data:[]}] }, {notMerge:true}); }
    updateSummary(); emptyState && (emptyState.style.display='block');
  });
  exportCsvWideBtn?.addEventListener('click', ()=>{
    const header=['point','n','dl_avg','dl_min','dl_max','dl_std','ul_avg','ul_min','ul_max','ul_std','ping_avg','ping_min','ping_max','ping_std','ping_p50','ping_p95','loss_avg'];
    const lines=[toCsvRow(header)];
    const byPoint=groupBy(results,'point');
    for(const [pt,arr] of byPoint.entries()){
      const sDL=stats(arr.map(x=>Number(x.iperf_dl_mbps))); const sUL=stats(arr.map(x=>Number(x.iperf_ul_mbps)));
      const pAvg=stats(arr.map(x=>Number(x.ping_avg))); const p50s=stats(arr.map(x=>Number(x.ping_p50))); const p95s=stats(arr.map(x=>Number(x.ping_p95)));
      const lossVals=arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v)); const lossAvg=lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null;
      lines.push(toCsvRow([pt,sDL.n,sDL.avg?.toFixed(4),sDL.min?.toFixed(4),sDL.max?.toFixed(4),sDL.std?.toFixed(4),
        sUL.avg?.toFixed(4),sUL.min?.toFixed(4),sUL.max?.toFixed(4),sUL.std?.toFixed(4),
        pAvg.avg?.toFixed(4),pAvg.min?.toFixed(4),pAvg.max?.toFixed(4),pAvg.std?.toFixed(4),
        p50s.p50?.toFixed(4),p95s.p95?.toFixed(4),lossAvg!=null?lossAvg.toFixed(4):'']));
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
      summary[pt]={ count:sDL.n, dl:{avg:sDL.avg,min:sDL.min,max:sDL.max,std:sDL.std}, ul:{avg:sUL.avg,min:sUL.min,max:sUL.max,std:sUL.std},
        ping:{avg:pAvg.avg,min:pAvg.min,max:pAvg.max,std:pAvg.std,p50:p50s.p50,p95:p95s.p95},
        loss_avg: lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null };
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
  
  // Health check periódico
  async function checkHealth(){
    try{
      const r = await fetch('/_health');
      const h = await r.json();
      const statusEl = document.querySelector('.status');
      if(statusEl){
        if(h.status === 'ok') statusEl.className = 'status online';
        else statusEl.className = 'status offline';
      }
      // Log warnings si hay problemas
      if(!h.checks?.server_reachable) console.warn('Server not reachable:', h.checks?.server_error);
      if(!h.checks?.iperf3_available) console.warn('iperf3 not available');
    }catch(e){ console.warn('Health check failed:', e); }
  }
  checkHealth();
  setInterval(checkHealth, 30000); // Check every 30s

  // Expose (debug)
  window.__ws = Object.assign(window.__ws || {}, {
    ensureResultsChart, rebuildResultsChart
  });
})();