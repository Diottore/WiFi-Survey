// static/app.js v13 — Migración a Apache ECharts (live + resultados).
// Mantiene SSE/polling, filtros, exportaciones y layout mobile-first.
// Stage tracking: Live chart resets time for each stage (ping/download/upload),
// displaying each stage's own timeline from 0 to configured duration seconds.

(() => {
  const $ = id => document.getElementById(id);

  // ===== Theme Management =====
  function initTheme() {
    const themeToggle = $('themeToggle');
    const themeIcon = $('themeIcon');
    const html = document.documentElement;
    
    // Load saved theme or detect system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    function setTheme(theme) {
      html.setAttribute('data-theme', theme);
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
      localStorage.setItem('theme', theme);
      
      // Update charts if they exist
      if (typeof updateChartsTheme === 'function') {
        updateChartsTheme(theme);
      }
    }
    
    // Set initial theme
    setTheme(initialTheme);
    
    // Toggle theme on button click
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
      });
    }
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
  
  // Initialize theme on page load
  initTheme();

  // Panels / Mode
  const panelQuick = $('panel-quick'), panelSurvey = $('panel-survey'), panelResults = $('panel-results');
  const modeQuickBtn = $('modeQuick'), modeSurveyBtn = $('modeSurvey'), modeResultsBtn = $('modeResults');
  const goToSurveyBtn = $('btn-go-to-survey'), goToResultsBtn = $('modeResults') || $('btn-go-to-results'), goToTestsBtn = $('btn-go-to-tests');

  function setMode(mode, persist = true) {
    const map = { quick: panelQuick, survey: panelSurvey, results: panelResults };
    Object.entries(map).forEach(([k,v]) => v && v.classList.toggle('hidden', k !== mode));
    
    // Update tab button states and ARIA attributes
    [modeQuickBtn, modeSurveyBtn, modeResultsBtn].forEach(b => {
      if (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      }
    });
    
    if (mode === 'quick' && modeQuickBtn) {
      modeQuickBtn.classList.add('active');
      modeQuickBtn.setAttribute('aria-selected', 'true');
    }
    if (mode === 'survey' && modeSurveyBtn) {
      modeSurveyBtn.classList.add('active');
      modeSurveyBtn.setAttribute('aria-selected', 'true');
    }
    if (mode === 'results' && modeResultsBtn) {
      modeResultsBtn.classList.add('active');
      modeResultsBtn.setAttribute('aria-selected', 'true');
    }
    
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
  const quickStatusEl = $('quickStatus');
  const pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyStatusMsgEl = $('surveyStatusMsg');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), resultsList = $('resultsList'), emptyState=$('emptyState');
  const avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl'), avgPing = $('avgPing'), avgJitter = $('avgJitter'), totalTests = $('totalTests');

  // ===== Error Handling & Validation =====
  function clearFieldError(field) {
    if (!field) return;
    field.classList.remove('error');
    const errorMsg = field.parentElement?.querySelector('.error-message');
    if (errorMsg) errorMsg.remove();
  }

  function showFieldError(field, message) {
    if (!field) return;
    field.classList.add('error');
    clearFieldError(field); // Remove old error message first
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    field.parentElement?.appendChild(errorDiv);
  }

  function clearAllErrors() {
    document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    document.querySelectorAll('.error-message').forEach(el => el.remove());
  }

  function handleApiError(error, statusEl, fallbackMessage = 'Error desconocido') {
    let errorMessage = fallbackMessage;
    let fieldName = null;

    if (error && typeof error === 'object') {
      errorMessage = error.error || error.message || fallbackMessage;
      fieldName = error.field;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    // Display general error message
    if (statusEl) {
      statusEl.textContent = `❌ ${errorMessage}`;
      statusEl.style.color = '#ef4444';
    }

    // Highlight specific field if provided
    if (fieldName) {
      const field = $(fieldName) || document.querySelector(`[name="${fieldName}"]`);
      if (field) {
        showFieldError(field, errorMessage);
        field.focus();
      }
    }

    return errorMessage;
  }

  // Add input event listeners to clear errors on change
  [deviceEl, pointEl, runEl, pointsEl, repeatsEl].forEach(el => {
    if (el) {
      el.addEventListener('input', () => clearFieldError(el));
      el.addEventListener('focus', () => clearFieldError(el));
    }
  });

  // ===== Utility Functions =====
  // HTML escape function to prevent XSS
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Debounce function for performance optimization
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Smooth scroll to element
  function smoothScrollTo(element) {
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
    }
  }

  // Enable smooth scrolling globally
  document.documentElement.style.scrollBehavior = 'smooth';

  // ===== Toast Notifications =====
  function showToast(message, type = 'info', duration = 3000) {
    const container = $('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type} fade-in-up`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    toast.innerHTML = `
      <span style="font-size: 1.2rem;" aria-hidden="true">${icons[type] || icons.info}</span>
      <span style="flex: 1;">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after duration
    const removeToast = () => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    };
    
    const timeoutId = setTimeout(removeToast, duration);
    
    // Click to dismiss
    toast.addEventListener('click', () => {
      clearTimeout(timeoutId);
      removeToast();
    });
    
    // Limit number of toasts
    const toasts = container.querySelectorAll('.toast');
    if (toasts.length > 5) {
      toasts[0].click();
    }
  }

  // ===== Keyboard Shortcuts =====
  const shortcutsBackdrop = $('shortcutsBackdrop');
  const shortcutsHelp = document.querySelector('.shortcuts-help');
  const helpToggle = $('helpToggle');
  const closeShortcuts = $('closeShortcuts');
  
  function showShortcutsHelp() {
    if (shortcutsBackdrop) {
      shortcutsBackdrop.classList.add('show');
      shortcutsHelp?.classList.add('show');
    }
  }
  
  function hideShortcutsHelp() {
    if (shortcutsBackdrop) {
      shortcutsBackdrop.classList.remove('show');
      shortcutsHelp?.classList.remove('show');
    }
  }
  
  helpToggle?.addEventListener('click', showShortcutsHelp);
  closeShortcuts?.addEventListener('click', hideShortcutsHelp);
  shortcutsBackdrop?.addEventListener('click', (e) => {
    if (e.target === shortcutsBackdrop) {
      hideShortcutsHelp();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    // ?: Show shortcuts help
    if (e.key === '?') {
      e.preventDefault();
      showShortcutsHelp();
      return;
    }
    
    // Ctrl/Cmd + K: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
    
    // Ctrl/Cmd + D: Toggle dark mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      $('themeToggle')?.click();
    }
    
    // Tab navigation: 1, 2, 3
    if (e.key >= '1' && e.key <= '3' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const tabMap = { '1': modeQuickBtn, '2': modeSurveyBtn, '3': modeResultsBtn };
      tabMap[e.key]?.click();
    }
    
    // Escape: Close modals, clear search
    if (e.key === 'Escape') {
      const modal = $('rawModal');
      if (shortcutsBackdrop && shortcutsBackdrop.classList.contains('show')) {
        hideShortcutsHelp();
      } else if (modal && !modal.hidden) {
        modal.hidden = true;
      } else if (searchInput && searchInput.value) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
      }
    }
  });


  // Live UI
  const liveVisuals = $('liveVisuals');
  const runProgressFill = $('runProgressFill'), progressPct = $('progressPct'), timeRemainingEl = $('timeRemaining'), liveSummary = $('liveSummary');
  const instDlEl = $('instDl'), instUlEl = $('instUl'), instPingEl = $('instPing'), instJitterEl = $('instJitter'), instPing50El = $('instPing50'), instPing95El = $('instPing95'), instLossEl = $('instLoss');
  const showLiveQuick = $('showLiveQuick'), showLiveSurvey = $('showLiveSurvey'), hideLivePanelBtn = $('hideLivePanel');
  const clearLiveChartBtn = $('clearLiveChart');
  
  // Hide/Show live panel handlers
  hideLivePanelBtn && hideLivePanelBtn.addEventListener('click', ()=> {
    liveVisuals && liveVisuals.classList.remove('show');
  });
  
  // Clear live chart handler
  clearLiveChartBtn && clearLiveChartBtn.addEventListener('click', ()=> {
    if(confirm('¿Limpiar la gráfica en vivo? Esto no afectará los resultados guardados.')){
      liveChartReset();
      liveSummary && (liveSummary.textContent = 'Gráfica limpiada - Esperando nueva ejecución...');
      showToast('Gráfica en vivo limpiada', 'success');
    }
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
  const refreshChartBtn = $('refreshChartBtn'), sortResultsSelect = $('sortResultsSelect'), autoRefreshCheckbox = $('autoRefresh');

  // Export
  const exportJsonBtn = $('exportJsonBtn'), clearResultsBtn = $('clearResultsBtn');
  const exportCsvWideBtn = $('exportCsvWide'), exportCsvLongBtn = $('exportCsvLong'), exportSummaryJsonBtn = $('exportSummaryJson');
  const exportSamplesCsvBtn = $('exportSamplesCsv');

  // Estado
  let results = [];
  let currentPage = 1;
  const RESULTS_PER_PAGE = 20;
  const STORAGE_KEY = 'wifiSurveyResults';
  const MAX_STORED_RESULTS = 500; // Limit localStorage size

  // ===== LocalStorage Persistence =====
  function saveResultsToStorage() {
    try {
      // Keep only the most recent results to avoid localStorage quota issues
      const toSave = results.slice(0, MAX_STORED_RESULTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      return true;
    } catch (e) {
      console.error('Error saving to localStorage:', e);
      // If quota exceeded, try saving fewer results
      if (e.name === 'QuotaExceededError') {
        try {
          const reduced = results.slice(0, 100);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
          showToast('Espacio limitado: solo se guardaron los 100 resultados más recientes', 'warning');
        } catch (e2) {
          console.error('Could not save even reduced results:', e2);
        }
      }
      return false;
    }
  }

  function loadResultsFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          results = parsed;
          console.log(`Loaded ${results.length} results from localStorage`);
          return true;
        }
      }
    } catch (e) {
      console.error('Error loading from localStorage:', e);
    }
    return false;
  }

  function clearStoredResults() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.error('Error clearing localStorage:', e);
      return false;
    }
  }

  // Pagination controls
  function renderPagination() {
    const filteredResults = getFilteredSortedResults();
    const totalPages = Math.ceil(filteredResults.length / RESULTS_PER_PAGE);
    
    let paginationEl = $('pagination');
    if (!paginationEl) {
      paginationEl = document.createElement('div');
      paginationEl.id = 'pagination';
      paginationEl.className = 'pagination';
      paginationEl.setAttribute('role', 'navigation');
      paginationEl.setAttribute('aria-label', 'Paginación de resultados');
      
      const resultsContent = resultsList?.parentElement;
      if (resultsContent) {
        resultsContent.appendChild(paginationEl);
      }
    }
    
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    
    let html = '<div class="pagination-controls">';
    
    // Previous button
    html += `<button class="btn small ${currentPage === 1 ? 'disabled' : ''}" 
             onclick="window.goToPage(${currentPage - 1})" 
             ${currentPage === 1 ? 'disabled' : ''}
             aria-label="Página anterior">‹ Anterior</button>`;
    
    // Page numbers
    html += `<span class="pagination-info" aria-live="polite">Página ${currentPage} de ${totalPages}</span>`;
    
    // Next button
    html += `<button class="btn small ${currentPage === totalPages ? 'disabled' : ''}" 
             onclick="window.goToPage(${currentPage + 1})" 
             ${currentPage === totalPages ? 'disabled' : ''}
             aria-label="Página siguiente">Siguiente ›</button>`;
    
    html += '</div>';
    paginationEl.innerHTML = html;
  }

  // Navigate to specific page
  window.goToPage = function(page) {
    const filteredResults = getFilteredSortedResults();
    const totalPages = Math.ceil(filteredResults.length / RESULTS_PER_PAGE);
    
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderResultsList();
    smoothScrollTo(resultsList);
  };

  // Render results list with pagination
  function renderResultsList() {
    if (!resultsList) return;
    
    const filteredResults = getFilteredSortedResults();
    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    const pageResults = filteredResults.slice(startIndex, endIndex);
    
    resultsList.innerHTML = '';
    
    pageResults.forEach((r, idx) => {
      const globalIndex = results.indexOf(r);
      const card = document.createElement('div');
      card.className = 'result-item';
      card.style.animation = 'fadeIn 0.3s ease';
      card.innerHTML = `
        <div style="flex:1; min-width:140px;">
          <strong>${escapeHtml(r.point)}</strong>
          <div class="muted">${escapeHtml(r.ssid)}</div>
        </div>
        <div style="width:120px;text-align:right">${r.iperf_dl_mbps!=null? Number(r.iperf_dl_mbps).toFixed(2):'—'} Mbps</div>
        <div style="width:120px;text-align:right">${r.iperf_ul_mbps!=null? Number(r.iperf_ul_mbps).toFixed(2):'—'}</div>
        <div style="width:80px;text-align:right">${r.ping_avg!=null? r.ping_avg.toFixed(2):'—'} ms</div>
        <div style="width:80px;text-align:right">${r.ping_jitter!=null? r.ping_jitter.toFixed(2):'—'} ms</div>
        <div style="width:100px;text-align:center">
          <button class="btn small view-samples-btn" data-index="${globalIndex}" style="padding:4px 8px;font-size:.85rem;">Ver gráfica</button>
        </div>
        <div style="width:60px;text-align:center"><a class="muted" href="/raw/${escapeHtml((r.raw_file||'').split('/').pop())}" target="_blank">raw</a></div>
      `;
      resultsList.appendChild(card);
      
      // Add event listener to view samples button
      const viewBtn = card.querySelector('.view-samples-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => showResultSamples(globalIndex));
      }
    });
    
    if (emptyState) emptyState.style.display = filteredResults.length ? 'none' : 'block';
    renderPagination();
    refreshResultsLayout();
  }
  let lastSurveyTaskId = null;
  let currentSse = null;

  // ===== Utils =====
  // Removed duplicate debounce - using the one defined earlier
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
  let liveSamples = []; // {t, dl, ul, ping, stage}
  let currentStage = null; // Track current stage
  
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
  
  function liveChartPush(t, dl, ul, ping, stage){
    ensureLiveMiniChart();
    if(!liveChart) return;
    
    // If stage changed, reset the chart to show only the current stage
    // This ensures each stage (ping/download/upload) displays its own 0-duration timeline
    if(stage && stage !== currentStage) {
      currentStage = stage;
      liveSamples = []; // Clear samples when stage changes
    }
    
    liveSamples.push({t, dl, ul, ping, stage});
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
  
  function liveChartUpdateFromSamples(samples, currentStage){
    // Update the live chart using the actual samples from the backend
    // This provides accurate real-time visualization of test measurements
    ensureLiveMiniChart();
    if(!liveChart || !samples || !samples.length) return;
    
    // Get the current stage from the latest sample or use provided stage
    const latestStage = samples[samples.length - 1]?.stage || currentStage;
    
    // If stage changed, reset the chart to show only the current stage
    if(latestStage && latestStage !== window.lastLiveStage) {
      window.lastLiveStage = latestStage;
      liveSamples = []; // Clear samples when stage changes
    }
    
    // Use backend samples directly instead of creating synthetic ones
    liveSamples = samples.map(s => ({
      t: s.t ?? 0,
      dl: s.dl ?? null,
      ul: s.ul ?? null,
      ping: s.ping ?? null,
      stage: s.stage || latestStage
    }));
    
    // Limit to 600 most recent samples to prevent memory issues
    if(liveSamples.length > 600) {
      liveSamples = liveSamples.slice(-600);
    }
    
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
    currentStage = null;
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
  searchInput && searchInput.addEventListener('input', debounce(()=> { 
    currentPage = 1; 
    rebuildResultsChart(); 
    renderResultsList();
  }, 200));
  sortResultsSelect && sortResultsSelect.addEventListener('change', () => {
    currentPage = 1;
    rebuildResultsChart();
    renderResultsList();
  });
  refreshChartBtn && refreshChartBtn.addEventListener('click', () => {
    rebuildResultsChart();
    renderResultsList();
  });

  // ===== Theme Updates for Charts =====
  // This function is called by the theme manager when theme changes
  window.updateChartsTheme = function(theme) {
    // ECharts will automatically adapt to CSS theme changes
    // but we can force a redraw if needed
    try {
      if (liveChart) liveChart.resize();
      if (resultsChart) resultsChart.resize();
    } catch(e) {
      console.warn('Error updating charts theme:', e);
    }
  };

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const r=await fetch(`/task_status/${task_id}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if(!r.ok) {
          console.warn(`Poll failed: HTTP ${r.status}`);
          return;
        }
        
        const js=await r.json();
        if(js.partial) handlePartialUpdate(js);
        if(js.status==='finished'){
          handleFinalResult(js.result||js.results||{});
          clearInterval(pollIntervalHandle); pollIntervalHandle=null;
        }
      }catch(e){ 
        if(e.name === 'AbortError'){
          console.warn('Poll timeout for task', task_id);
        } else {
          console.warn('Poll error:', e);
        }
      }
    }, ms);
  }

  function fmtTime(s){ s=Math.max(0,Math.round(s)); const mm=String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }
  function num(n){ const v=Number(n); return isNaN(v)? null : v; }

  async function updateRemaining(elapsed, partial){
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const cfg = await fetch('/_survey_config', { signal: controller.signal })
        .then(r=>{
          clearTimeout(timeoutId);
          return r.ok? r.json(): null;
        });
      
      const dur = (cfg && cfg.IPERF_DURATION) ? cfg.IPERF_DURATION : (partial?.duration || 20);
      timeRemainingEl && (timeRemainingEl.textContent = fmtTime(Math.max(0, dur - (elapsed||0))));
    }catch(e){
      // Fallback silently - use partial data
      const dur = partial?.duration || 20;
      timeRemainingEl && (timeRemainingEl.textContent = fmtTime(Math.max(0, dur - (elapsed||0))));
    }
  }

  function handlePartialUpdate(dataContainer){
    const partial=dataContainer.partial || dataContainer;
    if(!partial) return;
    const dl=num(partial.dl_mbps) ?? 0;
    const ul=num(partial.ul_mbps) ?? 0;
    const pingAvg=num(partial.ping_avg_ms);
    const jitter=num(partial.ping_jitter_ms);
    const p50=num(partial.ping_p50_ms), p95=num(partial.ping_p95_ms), loss=num(partial.ping_loss_pct);
    const progress=Number(partial.progress_pct || partial.progress || 0);
    const elapsed=Number(partial.elapsed_s || 0);
    const stage=partial.stage || 'unknown';

    // Mostrar panel y actualizar mini gráfica
    if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
    
    // Use actual backend samples if available for accurate real-time visualization
    // This ensures the chart displays all actual measurements, not synthetic interpolated values
    const samples = dataContainer.samples;
    if(samples && samples.length > 0) {
      liveChartUpdateFromSamples(samples, stage);
    } else {
      // Fallback: create single sample from aggregated partial data if backend samples not available
      liveChartPush(elapsed, dl, ul, pingAvg, stage);
    }

    // Lecturas instantáneas
    instDlEl && (instDlEl.textContent = `${dl.toFixed(2)} Mbps`);
    instUlEl && (instUlEl.textContent = `${ul.toFixed(2)} Mbps`);
    instPingEl && (instPingEl.textContent = pingAvg!=null ? `${pingAvg.toFixed(2)} ms` : '—');
    instJitterEl && (instJitterEl.textContent = jitter!=null ? `${jitter.toFixed(2)} ms` : '—');
    instPing50El && (instPing50El.textContent = p50!=null ? `${p50.toFixed(2)} ms` : '—');
    instPing95El && (instPing95El.textContent = p95!=null ? `${p95.toFixed(2)} ms` : '—');
    instLossEl && (instLossEl.textContent = loss!=null ? `${loss.toFixed(2)} %` : '—');

    // Progreso y tiempo restante - Update ARIA
    if(runProgressFill) {
      runProgressFill.style.width = `${progress}%`;
      const progressBar = runProgressFill.parentElement;
      if(progressBar) progressBar.setAttribute('aria-valuenow', Math.round(progress));
    }
    progressPct && (progressPct.textContent = `${progress}%`);
    updateRemaining(elapsed, partial);
    
    // Update live summary with current stage
    const stageNames = { ping: 'Ping', download: 'Download', upload: 'Upload' };
    const stageName = stageNames[stage] || stage;
    liveSummary && (liveSummary.textContent = `Ejecutando ${stageName}... ${progress}%`);
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
    results.unshift(r); 
    if(results.length>500) results.pop();
    
    // Save to localStorage
    saveResultsToStorage();
    
    // Reset to first page when new result is added
    currentPage = 1;
    renderResultsList();
  }
  
  // Modal para ver muestras de un resultado individual
  function showResultSamples(index){
    const r = results[index];
    if(!r || !r.samples || !r.samples.length){
      showToast('No hay datos de muestras disponibles para este resultado', 'warning');
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
              <div><small class="muted">Jitter</small><div id="sampleJitter" style="font-weight:600;">—</div></div>
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
    $('sampleJitter').textContent = r.ping_jitter!=null ? `${Number(r.ping_jitter).toFixed(2)} ms` : '—';
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
    const originalText = runBtn.textContent;
    runBtn.textContent = '🔄 Ejecutando...';
    quickStatusEl && (quickStatusEl.textContent = '');
    
    const device=(deviceEl?.value||'').trim();
    const point=(pointEl?.value||'').trim();
    const runIndex=Number(runEl?.value)||1;
    
    // Client-side validation with visual feedback
    let hasErrors = false;
    
    if(!device){ 
      showFieldError(deviceEl, 'El nombre del dispositivo es requerido');
      quickStatusEl && (quickStatusEl.textContent = '⚠️ Por favor ingresa el nombre del dispositivo');
      quickStatusEl && (quickStatusEl.style.color = '#ef4444');
      runBtn.disabled=false;
      runBtn.textContent = originalText;
      return; 
    }
    if(!point){ 
      quickStatusEl && (quickStatusEl.textContent = '⚠️ Por favor ingresa el ID del punto');
      quickStatusEl && (quickStatusEl.style.color = '#ef4444');
      runBtn.disabled=false;
      runBtn.textContent = originalText;
      return; 
    }
    if(runIndex < 1 || runIndex > 100){
      quickStatusEl && (quickStatusEl.textContent = '⚠️ La repetición debe estar entre 1 y 100');
      quickStatusEl && (quickStatusEl.style.color = '#ef4444');
      runBtn.disabled=false;
      runBtn.textContent = originalText;
      return;
    }
    
    quickStatusEl && (quickStatusEl.textContent = '🔄 Iniciando prueba...');
    quickStatusEl && (quickStatusEl.style.color = '#0b74ff');
    
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for initial request
      
      const res=await fetch('/run_point',{ 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ device, point, run: runIndex }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if(!res.ok){
        throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
      }
      
      const j=await res.json();
      if(!j || !j.ok){ 
        const errorMsg = j?.error || 'Error desconocido';
        quickStatusEl && (quickStatusEl.textContent = `❌ Error: ${errorMsg}`);
        quickStatusEl && (quickStatusEl.style.color = '#ef4444');
        liveSummary && (liveSummary.textContent = `Error: ${errorMsg}`); 
        runBtn.disabled=false;
        runBtn.textContent = originalText;
        return; 
      }
      
      lastSurveyTaskId=j.task_id; $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id);
      // Resetear gráfica en vivo al iniciar nueva prueba
      liveChartReset(); 
      if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
      quickStatusEl && (quickStatusEl.textContent = '✅ Prueba iniciada correctamente');
      quickStatusEl && (quickStatusEl.style.color = '#10b981');
      liveSummary && (liveSummary.textContent='Tarea iniciada, esperando actualizaciones...'); 
      openSseForTask(j.task_id);
    }catch(e){ 
      if(e.name === 'AbortError'){
        quickStatusEl && (quickStatusEl.textContent = '❌ Timeout: El servidor no respondió a tiempo');
      } else {
        quickStatusEl && (quickStatusEl.textContent = `❌ Error de conexión: ${e.message}`);
      }
      quickStatusEl && (quickStatusEl.style.color = '#ef4444');
      liveSummary && (liveSummary.textContent = `Error: ${e.message}`); 
    } finally{ 
      runBtn.disabled=false;
      runBtn.textContent = originalText;
    }
  });

  // Survey
  startSurveyBtn && startSurveyBtn.addEventListener('click', async ()=>{
    startSurveyBtn.disabled=true;
    const originalText = startSurveyBtn.textContent;
    startSurveyBtn.textContent = '🔄 Iniciando...';
    surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '');
    
    const device=(surveyDeviceEl?.value||deviceEl?.value||'').trim();
    const ptsRaw=(pointsEl?.value||'').trim();
    const repeats=Number(repeatsEl?.value)||1;
    const manual=!!manualCheckbox?.checked;
    
    // Client-side validation with visual feedback
    let hasErrors = false;
    
    if(!device){
      showFieldError(surveyDeviceEl || deviceEl, 'El nombre del dispositivo es requerido');
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '⚠️ Por favor ingresa el nombre del dispositivo');
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
      startSurveyBtn.disabled=false;
      startSurveyBtn.textContent = originalText;
      return;
    }
    if(!ptsRaw){ 
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '⚠️ Por favor ingresa al menos un punto'); 
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
      startSurveyBtn.disabled=false;
      startSurveyBtn.textContent = originalText;
      return; 
    }
    if(repeats < 1 || repeats > 100){
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '⚠️ Las repeticiones deben estar entre 1 y 100');
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
      startSurveyBtn.disabled=false;
      startSurveyBtn.textContent = originalText;
      return;
    }
    
    const points= ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()).filter(Boolean) : ptsRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    
    if(points.length === 0){
      showFieldError(pointsEl, 'No se detectaron puntos válidos');
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '⚠️ No se detectaron puntos válidos');
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
      startSurveyBtn.disabled=false;
      startSurveyBtn.textContent = originalText;
      return;
    }
    
    surveyStatusMsgEl && (surveyStatusMsgEl.textContent = `🔄 Iniciando encuesta con ${points.length} punto(s), ${repeats} repetición(es)...`);
    surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#0b74ff');
    
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for initial request
      
      const res=await fetch('/start_survey',{ 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ device, points, repeats, manual }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if(!res.ok){
        throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
      }
      
      const j=await res.json();
      if(!j.ok){ 
        const errorMsg = j.error || 'Error desconocido';
        surveyStatusMsgEl && (surveyStatusMsgEl.textContent = `❌ Error: ${errorMsg}`);
        surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
        surveyLog && (surveyLog.textContent='Error: ' + errorMsg); 
        startSurveyBtn.disabled=false;
        startSurveyBtn.textContent = originalText;
        return; 
      }
      
      lastSurveyTaskId=j.task_id; $('lastSurveyId') && ($('lastSurveyId').textContent=j.task_id);
      cancelTaskBtn && (cancelTaskBtn.disabled=false);
      // Resetear gráfica en vivo al iniciar nueva encuesta
      liveChartReset(); 
      if(liveVisuals && !liveVisuals.classList.contains('show')) { liveVisuals.classList.add('show'); ensureLiveMiniChart(); }
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = `✅ Encuesta iniciada con ${points.length} punto(s)`);
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#10b981');
      openSseForTask(j.task_id); surveyArea && (surveyArea.hidden=false);
    }catch(e){ 
      if(e.name === 'AbortError'){
        surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '❌ Timeout: El servidor no respondió a tiempo');
      } else {
        surveyStatusMsgEl && (surveyStatusMsgEl.textContent = `❌ Error de conexión: ${e.message}`);
      }
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
      surveyLog && (surveyLog.textContent='Error al iniciar: '+e); 
    } finally{ 
      startSurveyBtn.disabled=false;
      startSurveyBtn.textContent = originalText;
    }
  });

  // Proceed / Cancel
  proceedBtn && proceedBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    proceedBtn.disabled=true;
    const originalText = proceedBtn.textContent;
    proceedBtn.textContent = '🔄 Procesando...';
    
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const r=await fetch(`/task_proceed/${encodeURIComponent(lastSurveyTaskId)}`,{
        method:'POST',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if(!r.ok){
        throw new Error(`Error del servidor: ${r.status}`);
      }
      
      const js=await r.json();
      if(!js.ok) {
        alert('Error al proceder: '+(js.error||'Error desconocido'));
      }
    }catch(e){
      if(e.name === 'AbortError'){
        alert('Timeout: El servidor no respondió a tiempo');
      } else {
        alert('Error: '+e.message);
      }
    } finally{
      proceedBtn.disabled=false;
      proceedBtn.textContent = originalText;
    }
  });
  
  cancelTaskBtn && cancelTaskBtn.addEventListener('click', async ()=>{
    if(!lastSurveyTaskId){ alert('No hay encuesta en curso'); return; }
    if(!confirm('¿Estás seguro de cancelar la encuesta en curso?')) return;
    
    cancelTaskBtn.disabled=true;
    const originalText = cancelTaskBtn.textContent;
    cancelTaskBtn.textContent = '🔄 Cancelando...';
    
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await fetch(`/task_cancel/${encodeURIComponent(lastSurveyTaskId)}`,{
        method:'POST',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      surveyStatusMsgEl && (surveyStatusMsgEl.textContent = '⚠️ Encuesta cancelada');
      surveyStatusMsgEl && (surveyStatusMsgEl.style.color = '#ef4444');
    }catch(e){
      if(e.name === 'AbortError'){
        alert('Timeout: No se pudo cancelar la encuesta');
      } else {
        console.error('Error cancelando encuesta:', e);
      }
    } finally{
      cancelTaskBtn.disabled=false;
      cancelTaskBtn.textContent = originalText;
    }
  });

  // Export
  exportJsonBtn?.addEventListener('click', async ()=> {
    exportJsonBtn.disabled=true;
    const originalText = exportJsonBtn.textContent;
    exportJsonBtn.textContent = '🔄 Exportando...';
    
    try{
      download('wifi_recent.json', JSON.stringify(results.slice(0,1000), null, 2), 'application/json');
    }catch(e){
      alert('Error al exportar JSON: ' + e.message);
    }finally{
      exportJsonBtn.disabled=false;
      exportJsonBtn.textContent = originalText;
    }
  });
  
  clearResultsBtn?.addEventListener('click', ()=> {
    if(!confirm('¿Estás seguro de limpiar todos los resultados?')) return;
    
    results=[]; 
    currentPage = 1;
    clearStoredResults(); // Clear localStorage
    resultsList && (resultsList.innerHTML='');
    const paginationEl = $('pagination');
    if (paginationEl) paginationEl.innerHTML = '';
    if(resultsChart){ resultsChart.setOption({ xAxis:{data:[]}, series:[{data:[]},{data:[]},{data:[]}] }, {notMerge:true}); }
    updateSummary(); emptyState && (emptyState.style.display='block');
    showToast('Resultados limpiados correctamente', 'success');
  });
  
  exportCsvWideBtn?.addEventListener('click', async ()=>{
    exportCsvWideBtn.disabled=true;
    const originalText = exportCsvWideBtn.textContent;
    exportCsvWideBtn.textContent = '🔄 Exportando...';
    
    try{
      const header=['point','n','dl_avg','dl_min','dl_max','dl_std','ul_avg','ul_min','ul_max','ul_std','ping_avg','ping_min','ping_max','ping_std','ping_p50','ping_p95','jitter_avg','jitter_min','jitter_max','jitter_std','loss_avg'];
      const lines=[toCsvRow(header)];
      const byPoint=groupBy(results,'point');
      for(const [pt,arr] of byPoint.entries()){
        const sDL=stats(arr.map(x=>Number(x.iperf_dl_mbps))); const sUL=stats(arr.map(x=>Number(x.iperf_ul_mbps)));
        const pAvg=stats(arr.map(x=>Number(x.ping_avg))); const p50s=stats(arr.map(x=>Number(x.ping_p50))); const p95s=stats(arr.map(x=>Number(x.ping_p95)));
        const jitterStats=stats(arr.map(x=>Number(x.ping_jitter)));
        const lossVals=arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v)); const lossAvg=lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null;
        lines.push(toCsvRow([pt,sDL.n,sDL.avg?.toFixed(4),sDL.min?.toFixed(4),sDL.max?.toFixed(4),sDL.std?.toFixed(4),
          sUL.avg?.toFixed(4),sUL.min?.toFixed(4),sUL.max?.toFixed(4),sUL.std?.toFixed(4),
          pAvg.avg?.toFixed(4),pAvg.min?.toFixed(4),pAvg.max?.toFixed(4),pAvg.std?.toFixed(4),
          p50s.p50?.toFixed(4),p95s.p95?.toFixed(4),
          jitterStats.avg?.toFixed(4),jitterStats.min?.toFixed(4),jitterStats.max?.toFixed(4),jitterStats.std?.toFixed(4),
          lossAvg!=null?lossAvg.toFixed(4):'']));
      }
      download('wifi_results_wide.csv', lines.join('\n'), 'text/csv');
    }catch(e){
      alert('Error al exportar CSV: ' + e.message);
    }finally{
      exportCsvWideBtn.disabled=false;
      exportCsvWideBtn.textContent = originalText;
    }
  });
  
  exportCsvLongBtn?.addEventListener('click', async ()=>{
    exportCsvLongBtn.disabled=true;
    const originalText = exportCsvLongBtn.textContent;
    exportCsvLongBtn.textContent = '🔄 Exportando...';
    
    try{
      const header=['device','point','timestamp','ssid','bssid','rssi','dl_mbps','ul_mbps','ping_avg_ms','ping_p50_ms','ping_p95_ms','ping_loss_pct','ping_jitter_ms','raw_file'];
      const lines=[toCsvRow(header)];
      results.forEach(r=> lines.push(toCsvRow([r.device,r.point,r.timestamp,r.ssid,r.bssid,r.rssi,r.iperf_dl_mbps,r.iperf_ul_mbps,r.ping_avg,r.ping_p50,r.ping_p95,r.ping_loss_pct,r.ping_jitter,r.raw_file])));
      download('wifi_results_long.csv', lines.join('\n'), 'text/csv');
    }catch(e){
      alert('Error al exportar CSV: ' + e.message);
    }finally{
      exportCsvLongBtn.disabled=false;
      exportCsvLongBtn.textContent = originalText;
    }
  });
  
  exportSummaryJsonBtn?.addEventListener('click', async ()=>{
    exportSummaryJsonBtn.disabled=true;
    const originalText = exportSummaryJsonBtn.textContent;
    exportSummaryJsonBtn.textContent = '🔄 Exportando...';
    
    try{
      const summary={}; const byPoint=groupBy(results,'point');
      for(const [pt,arr] of byPoint.entries()){
        const sDL=stats(arr.map(x=>Number(x.iperf_dl_mbps))); const sUL=stats(arr.map(x=>Number(x.iperf_ul_mbps)));
        const pAvg=stats(arr.map(x=>Number(x.ping_avg))); const p50s=stats(arr.map(x=>Number(x.ping_p50))); const p95s=stats(arr.map(x=>Number(x.ping_p95)));
        const jitterStats=stats(arr.map(x=>Number(x.ping_jitter)));
        const lossVals=arr.map(x=>Number(x.ping_loss_pct)).filter(v=>!isNaN(v));
        summary[pt]={ count:sDL.n, dl:{avg:sDL.avg,min:sDL.min,max:sDL.max,std:sDL.std}, ul:{avg:sUL.avg,min:sUL.min,max:sUL.max,std:sUL.std},
          ping:{avg:pAvg.avg,min:pAvg.min,max:pAvg.max,std:pAvg.std,p50:p50s.p50,p95:p95s.p95},
          jitter:{avg:jitterStats.avg,min:jitterStats.min,max:jitterStats.max,std:jitterStats.std},
          loss_avg: lossVals.length? lossVals.reduce((a,b)=>a+b,0)/lossVals.length : null };
      }
      download('wifi_summary.json', JSON.stringify(summary,null,2), 'application/json');
    }catch(e){
      alert('Error al exportar JSON: ' + e.message);
    }finally{
      exportSummaryJsonBtn.disabled=false;
      exportSummaryJsonBtn.textContent = originalText;
    }
  });
  
  exportSamplesCsvBtn?.addEventListener('click', async ()=>{
    exportSamplesCsvBtn.disabled=true;
    const originalText = exportSamplesCsvBtn.textContent;
    exportSamplesCsvBtn.textContent = '🔄 Exportando...';
    
    try{
      const header=['device','point','timestamp','t_s','dl_inst_mbps','ul_inst_mbps','ping_inst_ms'];
      const lines=[toCsvRow(header)];
      results.forEach(r=>{
        if(Array.isArray(r.samples)){
          r.samples.forEach(s=> lines.push(toCsvRow([r.device,r.point,r.timestamp, s.t??'', s.dl??'', s.ul??'', s.ping??'' ])));
        }
      });
      download('wifi_samples_long.csv', lines.join('\n'), 'text/csv');
    }catch(e){
      alert('Error al exportar CSV: ' + e.message);
    }finally{
      exportSamplesCsvBtn.disabled=false;
      exportSamplesCsvBtn.textContent = originalText;
    }
  });

  function updateSummary(){
    const n=v=>{ const x=Number(v); return isNaN(x)? null : x; };
    const avg=arr=> arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const rssiVals=results.map(x=>n(x.rssi)).filter(v=>v!=null);
    const dlVals=results.map(x=>n(x.iperf_dl_mbps)).filter(v=>v!=null);
    const ulVals=results.map(x=>n(x.iperf_ul_mbps)).filter(v=>v!=null);
    const pingVals=results.map(x=>n(x.ping_avg)).filter(v=>v!=null);
    const jitterVals=results.map(x=>n(x.ping_jitter)).filter(v=>v!=null);
    avgRssi && (avgRssi.textContent = rssiVals.length ? Math.round(avg(rssiVals))+' dBm' : '—');
    avgDl && (avgDl.textContent = dlVals.length ? avg(dlVals).toFixed(2)+' Mbps' : '—');
    avgUl && (avgUl.textContent = ulVals.length ? avg(ulVals).toFixed(2)+' Mbps' : '—');
    avgPing && (avgPing.textContent = pingVals.length ? avg(pingVals).toFixed(2)+' ms' : '—');
    avgJitter && (avgJitter.textContent = jitterVals.length ? avg(jitterVals).toFixed(2)+' ms' : '—');
    totalTests && (totalTests.textContent = results.length.toString());
  }

  // ===== Initialization =====
  // Load results from localStorage on startup
  function initializeApp() {
    const loaded = loadResultsFromStorage();
    if (loaded && results.length > 0) {
      console.log(`Restored ${results.length} results from previous session`);
      renderResultsList();
      updateSummary();
      // Rebuild chart if we're on results page
      if (!panelResults?.classList.contains('hidden')) {
        ensureResultsChart();
        rebuildResultsChart();
      }
      showToast(`Se cargaron ${results.length} resultados de la sesión anterior`, 'success', 4000);
    } else {
      updateSummary();
    }
  }

  // Initialize app
  initializeApp();
  
  // Load and display test configuration
  async function loadTestConfig(){
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const cfg = await fetch('/_survey_config', { signal: controller.signal })
        .then(r => {
          clearTimeout(timeoutId);
          if(!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });
      
      if(cfg){
        const testConfigEl = document.getElementById('testConfig');
        if(testConfigEl){
          testConfigEl.textContent = `${cfg.IPERF_DURATION}s × ${cfg.IPERF_PARALLEL} streams → ${cfg.SERVER_IP}`;
        }
      }
    }catch(e){ 
      console.warn('Failed to load config:', e);
      const testConfigEl = document.getElementById('testConfig');
      if(testConfigEl){
        testConfigEl.textContent = 'Config no disponible';
        testConfigEl.style.color = '#6b7280';
      }
    }
  }
  loadTestConfig();
  
  // Auto-refresh for results
  let autoRefreshInterval = null;
  autoRefreshCheckbox && autoRefreshCheckbox.addEventListener('change', ()=>{
    if(autoRefreshCheckbox.checked){
      autoRefreshInterval = setInterval(()=>{
        if(document.getElementById('panel-results') && !document.getElementById('panel-results').classList.contains('hidden')){
          rebuildResultsChart();
        }
      }, 5000); // Refresh every 5 seconds
    } else {
      if(autoRefreshInterval) clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  });
  
  // Health check periódico
  async function checkHealth(){
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const r = await fetch('/_health', { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      
      const h = await r.json();
      const statusEl = document.querySelector('.status');
      if(statusEl){
        if(h.status === 'ok') {
          statusEl.className = 'status online';
          statusEl.title = 'Sistema operativo';
        } else {
          statusEl.className = 'status offline';
          statusEl.title = 'Sistema con problemas';
        }
      }
      // Log warnings si hay problemas
      if(!h.checks?.server_reachable) console.warn('Server not reachable:', h.checks?.server_error);
      if(!h.checks?.iperf3_available) console.warn('iperf3 not available');
    }catch(e){ 
      console.warn('Health check failed:', e);
      const statusEl = document.querySelector('.status');
      if(statusEl){
        statusEl.className = 'status offline';
        statusEl.title = 'No se puede conectar al servidor';
      }
    }
  }
  checkHealth();
  setInterval(checkHealth, 30000); // Check every 30s

  // Expose (debug)
  window.__ws = Object.assign(window.__ws || {}, {
    ensureResultsChart, rebuildResultsChart
  });
})();