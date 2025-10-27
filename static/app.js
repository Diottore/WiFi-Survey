// static/app.js v8 — Resultados móviles sin solapamientos + gráfico robusto + tacómetro custom.
// Mantiene SSE/polling y exportaciones. Ángulo del tacómetro por defecto 180.

(() => {
  const $ = id => document.getElementById(id);

  // Config tacómetro (persistente si guardas en localStorage)
  const GAUGE_START_DEG = Number(localStorage.getItem('gaugeStartDeg') ?? 180);
  const GAUGE_SWEEP_DEG = Number(localStorage.getItem('gaugeSweepDeg') ?? 240);

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
      // Asegurar que el gráfico se cree y se mida después de estar visible.
      ensureResultsChart();
      requestAnimationFrame(()=> {
        requestAnimationFrame(()=> {
          try { resultsChart && resultsChart.resize(); } catch(e){}
        });
      });
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
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog');
  const resultsList = $('resultsList'), emptyState = $('emptyState');
  const avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl'), avgPing = $('avgPing');

  // Live UI
  const liveVisuals = $('liveVisuals');
  const speedGaugeCanvas = $('speedGauge');
  const speedValEl = $('speedVal'), speedUnitEl = $('speedUnit');
  const gaugeLabel = $('gaugeLabel');
  const runProgressFill = $('runProgressFill');
  const progressPct = $('progressPct');
  const timeRemainingEl = $('timeRemaining');
  const liveSummary = $('liveSummary');
  const instDlEl = $('instDl'), instUlEl = $('instUl'), instPingEl = $('instPing');
  const instPing50El = $('instPing50'), instPing95El = $('instPing95'), instLossEl = $('instLoss');
  const showLiveQuick = $('showLiveQuick'), showLiveSurvey = $('showLiveSurvey'), hideLivePanelBtn = $('hideLivePanel');
  const surveyDeviceEl = $('survey_device'), manualCheckbox = $('manual_confirm'), proceedBtn = $('proceedBtn');

  // Resultados - controles
  const searchInput = $('searchInput');
  const toggleDL = $('toggleDL'), toggleUL = $('toggleUL'), togglePing = $('togglePing');
  const refreshChartBtn = $('refreshChartBtn'), sortResultsSelect = $('sortResultsSelect');

  // Export
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn');
  const exportCsvWideBtn = $('exportCsvWide'), exportCsvLongBtn = $('exportCsvLong'), exportSummaryJsonBtn = $('exportSummaryJson');

  // Estado
  let results = [];
  let lastSurveyTaskId = null;
  let currentSse = null;

  // ======================
  // Tacómetro (canvas) — igual que v6/v7 con etiquetas sobre ticks
  // ======================
  class Speedometer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.value = 0; this.animVal = 0;
      this.max = opts.max || 200;
      this.displayStep = this.niceStep(this.max, 6);
      this.displayMax = this.displayStep * 6;
      this.observedPeak = 0;
      this.startDeg = Number(opts.startDeg ?? 180);
      this.sweepDeg = Number(opts.sweepDeg ?? 240);
      this.pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this._raf = null; this._lastTs = 0;
      this._resizeObserver = new ResizeObserver(()=> this.resize());
      this._resizeObserver.observe(canvas.parentElement || canvas);
      this.resize();
    }
    toRad(deg){ return deg * Math.PI / 180; }
    niceStep(max, majors=6){
      const step = Math.max(1, max/majors);
      const pow = Math.pow(10, Math.floor(Math.log10(step)));
      const base = step / pow;
      const n = base<=1?1:base<=2?2:base<=5?5:10;
      return n * pow;
    }
    niceMaxFor(v){ const step = this.niceStep(v, 6); return step * 6; }
    formatValue(val){
      if(val>=1000){ const g=val/1000; return {num: g>=10? String(Math.round(g)) : g.toFixed(1), unit:'Gbps'}; }
      return {num: Number(val).toFixed(val>=100?1:2), unit:'Mbps'};
    }
    set(v){
      this.value = Math.max(0, Number(v)||0);
      this.observedPeak = Math.max(this.observedPeak, this.value);
      const targetMax = this.niceMaxFor(this.observedPeak);
      this.max += (targetMax - this.max)*0.12;
      this.displayStep = this.niceStep(this.max,6);
      this.displayMax = this.displayStep*6;
      if(!this._raf) this._raf = requestAnimationFrame(ts=>this.draw(ts));
    }
    resize(){
      const box = this.canvas.getBoundingClientRect();
      const pr = this.pixelRatio;
      const w = Math.max(320, Math.round(box.width)) || 360;
      const h = Math.round(w * 0.62);
      this.canvas.width = Math.round(w*pr);
      this.canvas.height = Math.round(h*pr);
      this.canvas.style.width = w+'px';
      this.canvas.style.height = h+'px';
      this.cx = this.canvas.width/2;
      this.cy = this.canvas.height*0.95;
      this.radius = Math.min(this.cx, this.canvas.height*0.9)*0.92;
      this.thickness = Math.max(12, this.radius*0.12);
      this.tickLenMajor = this.thickness*0.9;
      this.tickLenMinor = this.thickness*0.55;
      this.fontBase = Math.max(10, this.canvas.width*0.035);
      this._raf = this._raf || requestAnimationFrame(ts=>this.draw(ts));
    }
    draw(ts){
      const ctx = this.ctx; const pr = this.pixelRatio;
      const dt = Math.min(0.08, (ts - this._lastTs)/1000 || 0.016); this._lastTs = ts;
      this.animVal += (this.value - this.animVal) * Math.min(1, dt*5);

      const startA = this.toRad(this.startDeg), endA = startA + this.toRad(this.sweepDeg);
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      ctx.save(); ctx.translate(this.cx, this.cy);

      // track
      ctx.lineCap='round'; ctx.lineWidth=this.thickness; ctx.strokeStyle='rgba(15,23,42,0.08)';
      ctx.beginPath(); ctx.arc(0,0,this.radius,startA,endA); ctx.stroke();

      // progreso
      const f = Math.max(0, Math.min(1, this.animVal/this.displayMax));
      const grad = ctx.createLinearGradient(-this.radius,0,this.radius,0);
      grad.addColorStop(0,'#06b6d4'); grad.addColorStop(0.55,'#0b74ff'); grad.addColorStop(1,'#7c3aed');
      ctx.strokeStyle = grad; ctx.shadowColor='rgba(12,74,110,0.35)'; ctx.shadowBlur = Math.max(6*pr, this.thickness*0.6);
      ctx.beginPath(); ctx.arc(0,0,this.radius, startA, startA + f*(endA-startA)); ctx.stroke(); ctx.shadowBlur=0;

      // ticks
      const majors=6, minors=4; ctx.lineWidth=Math.max(2*pr, this.thickness*0.14); ctx.strokeStyle='rgba(15,23,42,0.22)';
      for(let i=0;i<=majors;i++){
        const frac=i/majors, a=startA + frac*(endA-startA);
        const r1=this.radius + this.thickness*0.05, r2=r1 + this.tickLenMajor;
        ctx.beginPath(); ctx.moveTo(r1*Math.cos(a), r1*Math.sin(a)); ctx.lineTo(r2*Math.cos(a), r2*Math.sin(a)); ctx.stroke();
        if(i<majors){
          for(let m=1;m<minors;m++){
            const frac2=(i+m/minors)/majors, a2=startA + frac2*(endA-startA);
            const r3=this.radius + this.thickness*0.05, r4=r3 + this.tickLenMinor;
            ctx.beginPath(); ctx.moveTo(r3*Math.cos(a2), r3*Math.sin(a2)); ctx.lineTo(r4*Math.cos(a2), r4*Math.sin(a2)); ctx.stroke();
          }
        }
      }
      // etiquetas sobre ticks
      const fontPx=Math.max(10,this.fontBase*0.75); ctx.fillStyle='#111827';
      ctx.font = `600 ${fontPx}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const labelR = this.radius + this.thickness*1.55;
      for(let i=0;i<=majors;i++){
        const val = i*(this.displayStep);
        const text = val>=1000 ? ((val/1000)>=10 ? `${Math.round(val/1000)}k` : `${(val/1000).toFixed(1)}k`) : String(Math.round(val));
        const frac=i/majors, a=startA + frac*(endA-startA);
        const x=labelR*Math.cos(a), y=labelR*Math.sin(a);
        ctx.fillText(text, x, y);
      }

      ctx.restore();

      const {num, unit}=this.formatValue(this.animVal);
      speedValEl && (speedValEl.textContent=num);
      speedUnitEl && (speedUnitEl.textContent=unit);
      gaugeLabel && (gaugeLabel.textContent = `${Number(this.animVal).toFixed(2)} Mbps`);

      if(Math.abs(this.value - this.animVal) > 0.01) this._raf=requestAnimationFrame(t=>this.draw(t));
      else this._raf=null;
    }
  }
  let speedo=null;
  function showLiveVisuals(){ if(liveVisuals){ liveVisuals.classList.add('show'); createGauge(0,200); } }
  function hideLiveVisuals(){ if(liveVisuals){ liveVisuals.classList.remove('show'); } }
  $('hideLivePanel')?.addEventListener('click', hideLiveVisuals);
  showLiveQuick?.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });
  showLiveSurvey?.addEventListener('click', ()=> { showLiveVisuals(); setMode('results'); });
  function createGauge(initial=0, max=200){
    if(!speedGaugeCanvas) return null;
    if(!speedo) speedo = new Speedometer(speedGaugeCanvas, {max, startDeg:GAUGE_START_DEG, sweepDeg:GAUGE_SWEEP_DEG});
    setGaugeValue(initial); return speedo;
  }
  function setGaugeValue(v){ if(!speedo) createGauge(0,200); speedo && speedo.set(Number(v)||0); }

  // ======================
  // Gráfico de Resultados (Chart.js) — robusto en móvil
  // ======================
  let resultsChart = null;
  let chartRO = null;
  function ensureResultsChart(){
    const canvas = $('throughputChart'); if(!canvas) return;
    if(resultsChart) { try { resultsChart.resize(); } catch(e){} return; }

    const ctx = canvas.getContext('2d');
    resultsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'DL Mbps', data: [], borderColor: '#0b74ff', backgroundColor:'rgba(11,116,255,0.08)', yAxisID:'y', tension:0.24, pointRadius:3, fill:true },
          { label: 'UL Mbps', data: [], borderColor: '#06b6d4', backgroundColor:'rgba(6,182,212,0.06)', yAxisID:'y', tension:0.24, pointRadius:3, fill:true },
          { label: 'Ping ms', data: [], borderColor: '#ef4444', backgroundColor:'rgba(239,68,68,0.04)', yAxisID:'y1', tension:0.2, pointRadius:2, borderDash:[4,2], fill:false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index', intersect:false},
        animation:{ duration: 250 },
        plugins:{ legend:{ position:'top' }, tooltip:{ callbacks:{
          title:(items)=> items?.[0]?.label || '',
          label:(item)=> `${item.dataset.label}: ${Number(item.parsed.y).toFixed(item.dataset.yAxisID==='y'?2:2)}`
        }}},
        scales:{
          x:{ title:{display:true,text:'Punto'}, ticks:{ autoSkip:true, maxRotation:0 } },
          y:{ position:'left', title:{display:true,text:'Mbps'}, beginAtZero:true },
          y1:{ position:'right', title:{display:true,text:'Ping (ms)'}, beginAtZero:true, grid:{drawOnChartArea:false} }
        }
      }
    });

    const card = $('resultsChartCard');
    if(card && 'ResizeObserver' in window){
      chartRO = new ResizeObserver(()=> {
        try { resultsChart.resize(); } catch(e){}
      });
      chartRO.observe(card);
    }
    // primer render con datos actuales si existieran
    rebuildResultsChart();
  }

  function getFilteredSortedResults(){
    const q = (searchInput?.value || '').trim().toLowerCase();
    let arr = [...results];
    if(q){
      arr = arr.filter(r =>
        (r.point||'').toLowerCase().includes(q) ||
        (r.ssid||'').toLowerCase().includes(q) ||
        (r.device||'').toLowerCase().includes(q)
      );
    }
    const sort = sortResultsSelect?.value || 'newest';
    if(sort === 'oldest') arr.sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
    else if(sort === 'dl-desc') arr.sort((a,b)=> (Number(b.iperf_dl_mbps)||0) - (Number(a.iperf_dl_mbps)||0));
    else if(sort === 'dl-asc') arr.sort((a,b)=> (Number(a.iperf_dl_mbps)||0) - (Number(b.iperf_dl_mbps)||0));
    else arr.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    return arr;
  }

  function rebuildResultsChart(){
    if(!resultsChart) return;
    const arr = getFilteredSortedResults();
    const labels = arr.map(r => r.point || new Date(r.timestamp).toLocaleTimeString());
    const dl = arr.map(r => Number(r.iperf_dl_mbps)||0);
    const ul = arr.map(r => Number(r.iperf_ul_mbps)||0);
    const ping = arr.map(r => Number(r.ping_avg)||0);

    resultsChart.data.labels = labels;
    resultsChart.data.datasets[0].data = dl;
    resultsChart.data.datasets[1].data = ul;
    resultsChart.data.datasets[2].data = ping;

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
    const MAX_POINTS = 80;
    while(resultsChart.data.labels.length > MAX_POINTS){
      resultsChart.data.labels.pop();
      resultsChart.data.datasets.forEach(ds=>ds.data.pop());
    }
    if(toggleDL) resultsChart.data.datasets[0].hidden = !toggleDL.checked;
    if(toggleUL) resultsChart.data.datasets[1].hidden = !toggleUL.checked;
    if(togglePing) resultsChart.data.datasets[2].hidden = !togglePing.checked;
    resultsChart.update('active');
  }

  // Controles resultados
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  toggleDL && toggleDL.addEventListener('change', rebuildResultsChart);
  toggleUL && toggleUL.addEventListener('change', rebuildResultsChart);
  togglePing && togglePing.addEventListener('change', rebuildResultsChart);
  searchInput && searchInput.addEventListener('input', debounce(()=> rebuildResultsChart(), 200));
  sortResultsSelect && sortResultsSelect.addEventListener('change', rebuildResultsChart);
  refreshChartBtn && refreshChartBtn.addEventListener('click', rebuildResultsChart);

  // ======================
  // SSE / Polling
  // ======================
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

  function fmtTime(s){ s = Math.max(0, Math.round(s)); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }
  function num(n){ const v = Number(n); return isNaN(v)? null : v; }

  async function updateRemaining(elapsed, partial){
    try{
      const cfg = await fetch('/_survey_config').then(r=>r.ok? r.json(): null);
      const dur = (cfg && cfg.IPERF_DURATION) ? cfg.IPERF_DURATION : (partial?.duration || 20);
      timeRemainingEl && (timeRemainingEl.textContent = fmtTime(Math.max(0, dur - (elapsed||0))));
    } catch(e){}
  }

  function handlePartialUpdate(dataContainer){
    const partial = dataContainer.partial || dataContainer;
    if(!partial) return;
    const dl = num(partial.dl_mbps) ?? 0;
    const ul = num(partial.ul_mbps) ?? 0;
    const pingAvg = num(partial.ping_avg_ms);
    const p50 = num(partial.ping_p50_ms);
    const p95 = num(partial.ping_p95_ms);
    const loss = num(partial.ping_loss_pct);
    const progress = Number(partial.progress_pct || partial.progress || 0);
    const elapsed = Number(partial.elapsed_s || 0);

    showLiveVisuals();
    setGaugeValue(dl);
    instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
    instUlEl && (instUlEl.textContent = `${ul.toFixed(2)} Mbps`);
    instPingEl && (instPingEl.textContent = pingAvg!=null ? `${pingAvg.toFixed(2)} ms` : '—');
    instPing50El && (instPing50El.textContent = p50!=null ? `${p50.toFixed(2)} ms` : '—');
    instPing95El && (instPing95El.textContent = p95!=null ? `${p95.toFixed(2)} ms` : '—');
    instLossEl && (instLossEl.textContent = loss!=null ? `${loss.toFixed(2)} %` : '—');

    runProgressFill && (runProgressFill.style.width = `${progress}%`);
    progressPct && (progressPct.textContent = `${progress}%`);
    updateRemaining(elapsed, partial);
    liveSummary && (liveSummary.textContent = `Ejecutando... ${progress}%`);
  }

  function handleFinalResult(res){
    if(!res){ liveSummary && (liveSummary.textContent = 'Prueba finalizada (sin resultado)'); return; }
    if(Array.isArray(res)){
      res.forEach(r => pushResultToList(mapFinalToResult(r)));
      ensureResultsChart();
      rebuildResultsChart();
      liveSummary && (liveSummary.textContent = `Encuesta finalizada: ${res.length} puntos`);
    } else {
      const mapped = mapFinalToResult(res);
      const dl = Number(mapped.iperf_dl_mbps || 0);
      const start = speedo ? speedo.animVal : 0;
      const target = Math.max(start, dl);
      const steps = 24; let i=0;
      const anim = setInterval(()=>{ i++; const t = i/steps; setGaugeValue(start + (target-start)*(1 - Math.cos(Math.PI*t))/2); if(i>=steps) clearInterval(anim); }, 18);

      instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
      instUlEl && (instUlEl.textContent = `${Number(mapped.iperf_ul_mbps||0).toFixed(2)} Mbps`);
      instPingEl && (instPingEl.textContent = mapped.ping_avg!=null ? `${Number(mapped.ping_avg).toFixed(2)} ms` : '—');

      pushResultToList(mapped);
      ensureResultsChart();
      addLatestPointToChart(mapped);
      updateSummary();
    }
    runProgressFill && (runProgressFill.style.width = `0%`);
    progressPct && (progressPct.textContent = `0%`);
    timeRemainingEl && (timeRemainingEl.textContent = '00:00');
  }

  function mapFinalToResult(res){
    const n = v => { const x = Number(v); return isNaN(x)? null : x; };
    return {
      device: res.device || deviceEl?.value || '',
      point: res.point || pointEl?.value || '',
      timestamp: res.timestamp || new Date().toISOString(),
      ssid: res.ssid || '',
      bssid: res.bssid || '',
      rssi: res.rssi || '',
      iperf_dl_mbps: n(res.iperf_dl_mbps),
      iperf_ul_mbps: n(res.iperf_ul_mbps),
      ping_avg: n(res.ping_avg_ms) ?? n(res.ping_avg),
      ping_jitter: n(res.ping_jitter_ms) ?? n(res.ping_jitter),
      ping_p50: n(res.ping_p50_ms),
      ping_p95: n(res.ping_p95_ms),
      ping_loss_pct: n(res.ping_loss_pct),
      raw_file: res.raw_file || ''
    };
  }

  function pushResultToList(r){
    results.unshift(r);
    if(results.length > 500) results.pop();

    const card = document.createElement('div');
    card.className = 'result-item';
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
    runBtn.disabled = true;
    const device = (deviceEl?.value || 'phone').trim();
    const point = (pointEl?.value || 'P1').trim();
    const runIndex = Number(runEl?.value) || 1;
    try {
      const res = await fetch('/run_point', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ device, point, run: runIndex }) });
      const j = await res.json();
      if(!j || !j.ok){ liveSummary && (liveSummary.textContent = `Error iniciando prueba: ${j?.error||'unknown'}`); runBtn.disabled=false; return; }
      const task_id = j.task_id;
      lastSurveyTaskId = task_id;
      $('lastSurveyId') && ($('lastSurveyId').textContent = task_id);
      showLiveVisuals();
      liveSummary && (liveSummary.textContent = 'Tarea iniciada, esperando actualizaciones...');
      openSseForTask(task_id);
      setMode('results');
    } catch(e){
      liveSummary && (liveSummary.textContent = `Error comunicando con servidor: ${e.message}`);
      console.error(e);
    } finally { runBtn.disabled = false; }
  });

  // Survey
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
      if(!j.ok){ surveyLog && (surveyLog.textContent = 'Error: ' + (j.error||'')); startSurveyBtn.disabled=false; return; }
      const task_id = j.task_id;
      lastSurveyTaskId = task_id;
      $('lastSurveyId') && ($('lastSurveyId').textContent = task_id);
      cancelTaskBtn && (cancelTaskBtn.disabled = false);
      showLiveVisuals();
      openSseForTask(task_id);
      surveyArea && (surveyArea.hidden = false);
      setMode('results');
    } catch(e){
      surveyLog && (surveyLog.textContent = 'Error al iniciar: '+e);
      console.error(e);
    } finally { startSurveyBtn.disabled = false; }
  });

  // Proceed / Cancel
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
    try { await fetch(`/task_cancel/${encodeURIComponent(lastSurveyTaskId)}`, { method:'POST' }); } catch(e){ console.warn('Cancel error', e); }
  });

  // Export helpers
  function download(name, text, mime='text/plain'){
    const blob = new Blob([text], {type:mime});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function toCsvRow(cells){
    return cells.map(c=>{
      if(c==null) return '';
      const s = String(c);
      if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      return s;
    }).join(',');
  }
  function groupBy(arr, key){ const m = new Map(); arr.forEach(it=>{ const k = it[key]||''; if(!m.has(k)) m.set(k, []); m.get(k).push(it); }); return m; }
  function stats(arr){
    const vals = arr.filter(v=>typeof v==='number' && !isNaN(v));
    const n = vals.length;
    if(!n) return {n:0, avg:null, min:null, max:null, std:null, p50:null, p95:null};
    vals.sort((a,b)=>a-b);
    const sum = vals.reduce((a,b)=>a+b,0), avg = sum/n, min=vals[0], max=vals[n-1];
    const std = Math.sqrt(vals.reduce((a,b)=>a+(b-avg)*(b-avg),0)/n);
    const perc = (q)=>{ const k=(n-1)*(q/100), f=Math.floor(k), c=Math.min(f+1,n-1); return f===c? vals[f] : vals[f]*(c-k)+vals[c]*(k-f); };
    return {n, avg, min, max, std, p50:perc(50), p95:perc(95)};
  }
  function exportCsvLong(){
    const header = ['device','point','timestamp','ssid','bssid','rssi','dl_mbps','ul_mbps','ping_avg_ms','ping_p50_ms','ping_p95_ms','ping_loss_pct','ping_jitter_ms','raw_file'];
    const lines = [toCsvRow(header)];
    results.forEach(r=>{
      lines.push(toCsvRow([r.device,r.point,r.timestamp,r.ssid,r.bssid,r.rssi,r.iperf_dl_mbps,r.iperf_ul_mbps,r.ping_avg,r.ping_p50,r.ping_p95,r.ping_loss_pct,r.ping_jitter,r.raw_file]));
    });
    download('wifi_results_long.csv', lines.join('\n'), 'text/csv');
  }
  function exportCsvWide(){
    const header = ['point','n','dl_avg','dl_min','dl_max','dl_std','ul_avg','ul_min','ul_max','ul_std','ping_avg','ping_min','ping_max','ping_std','ping_p50','ping_p95','loss_avg'];
    const lines = [toCsvRow(header)];
    const byPoint = groupBy(results, 'point');
    for(const [pt, arr] of byPoint.entries()){
      const sDL = stats(arr.map(x=>Number(x.iperf_dl_mbps)));
      const sUL = stats(arr.map(x=>Number(x.iperf_ul_mbps)));
      const pAvg = stats(arr.map(x=>Number(x.ping_avg)));
      const p50s = stats(arr.map(x=>Number(x.ping_p50)));
      const p95s = stats(arr.map(x=>Number(x.ping_p95)));
      const lossVals = arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v));
      const lossAvg = lossVals.length ? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null;
      lines.push(toCsvRow([pt,sDL.n,sDL.avg?.toFixed(4),sDL.min?.toFixed(4),sDL.max?.toFixed(4),sDL.std?.toFixed(4),sUL.avg?.toFixed(4),sUL.min?.toFixed(4),sUL.max?.toFixed(4),sUL.std?.toFixed(4),pAvg.avg?.toFixed(4),pAvg.min?.toFixed(4),pAvg.max?.toFixed(4),pAvg.std?.toFixed(4),p50s.p50?.toFixed(4),p95s.p95?.toFixed(4),lossAvg!=null?lossAvg.toFixed(4):'']));
    }
    download('wifi_results_wide.csv', lines.join('\n'), 'text/csv');
  }
  function exportSummaryJson(){
    const summary = {};
    const byPoint = groupBy(results, 'point');
    for(const [pt, arr] of byPoint.entries()){
      const sDL = stats(arr.map(x=>Number(x.iperf_dl_mbps)));
      const sUL = stats(arr.map(x=>Number(x.iperf_ul_mbps)));
      const pAvg = stats(arr.map(x=>Number(x.ping_avg)));
      const p50s = stats(arr.map(x=>Number(x.ping_p50)));
      const p95s = stats(arr.map(x=>Number(x.ping_p95)));
      const lossVals = arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v));
      summary[pt] = {
        count: sDL.n,
        dl: {avg:sDL.avg,min:sDL.min,max:sDL.max,std:sDL.std},
        ul: {avg:sUL.avg,min:sUL.min,max:sUL.max,std:sUL.std},
        ping: {avg:pAvg.avg,min:pAvg.min,max:pAvg.max,std:pAvg.std,p50:p50s.p50,p95:p95s.p95},
        loss_avg: lossVals.length ? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null
      };
    }
    download('wifi_summary.json', JSON.stringify(summary, null, 2), 'application/json');
  }
  exportJsonBtn?.addEventListener('click', ()=> download('wifi_recent.json', JSON.stringify(results.slice(0,1000), null, 2), 'application/json'));
  clearResultsBtn?.addEventListener('click', ()=> { results=[]; resultsList && (resultsList.innerHTML=''); if(resultsChart){ resultsChart.data.labels=[]; resultsChart.data.datasets.forEach(ds=>ds.data=[]); resultsChart.update(); } updateSummary(); emptyState && (emptyState.style.display = 'block'); });
  exportCsvWideBtn?.addEventListener('click', exportCsvWide);
  exportCsvLongBtn?.addEventListener('click', exportCsvLong);
  exportSummaryJsonBtn?.addEventListener('click', exportSummaryJson);

  function updateSummary(){
    const n = v => { const x = Number(v); return isNaN(x)? null : x; };
    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const rssiVals = results.map(x=>n(x.rssi)).filter(v=>v!=null);
    const dlVals = results.map(x=>n(x.iperf_dl_mbps)).filter(v=>v!=null);
    const ulVals = results.map(x=>n(x.iperf_ul_mbps)).filter(v=>v!=null);
    const pingVals = results.map(x=>n(x.ping_avg)).filter(v=>v!=null);
    avgRssi && (avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals)) + ' dBm' : '—');
    avgDl && (avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2) + ' Mbps' : '—');
    avgUl && (avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2) + ' Mbps' : '—');
    avgPing && (avgPing.textContent = pingVals.length ? avg(pingVals).toFixed(2) + ' ms' : '—');
  }

  // Init mínimos
  createGauge(0,200);
  updateSummary();

  // Expose for debug
  window.__ws = Object.assign(window.__ws || {}, { ensureResultsChart, rebuildResultsChart });
})();