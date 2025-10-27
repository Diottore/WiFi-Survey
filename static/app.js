// Ajustes JS: forzar redimensionado del chart y evitar layout shoves en portrait
(() => {
  const $ = id => document.getElementById(id);

  const deviceEl = $('device'), pointEl = $('point'), runEl = $('run'), runBtn = $('runBtn');
  const downloadBtn = $('downloadBtn'), pointsEl = $('points'), repeatsEl = $('repeats');
  const startSurveyBtn = $('startSurvey'), cancelTaskBtn = $('cancelTask');
  const surveyArea = $('surveyArea'), surveyLog = $('surveyLog'), surveyStatus = $('surveyStatus'), progressBar = $('progressBar');
  const resultsList = $('resultsList'), avgRssi = $('avgRssi'), avgDl = $('avgDl'), avgUl = $('avgUl');
  const exportJsonBtn = $('exportJsonBtn'), statusDot = $('statusDot'), themeToggle = $('themeToggle');
  const serverIpEl = $('serverIp'), runToast = $('runToast');
  const surveyDeviceEl = $('survey_device');

  // chart
  const ctx = document.getElementById('throughputChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'DL Mbps', data: [], backgroundColor: '#0b74ff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });

  // safe resize listener: wait before resizing to allow CSS reflow on orientationchange
  function safeResizeChart(){ try{ setTimeout(()=>chart.resize(), 120); }catch(e){ console.warn(e); } }
  window.addEventListener('resize', safeResizeChart);
  window.addEventListener('orientationchange', () => { safeResizeChart(); });

  // helper to avoid adding empty/huge strings
  function normalizeText(s){ if(!s) return ''; return String(s).trim().replace(/\s+/g,' '); }

  function addResult(r){
    if(!r) return;
    r.point = normalizeText(r.point);
    r.ssid = normalizeText(r.ssid);
    r.bssid = normalizeText(r.bssid);
    r.rssi = normalizeText(r.rssi);

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-left" role="listitem" style="min-width:0">
        <div style="max-width:60vw; overflow-wrap:break-word;">
          <div style="font-weight:700">${r.point}</div>
          <div class="muted" style="font-size:0.9rem; margin-top:3px">${r.ssid || ''} ${r.bssid ? '('+r.bssid+')' : ''}</div>
        </div>
      </div>
      <div class="result-stats">
        <div class="badge">RSSI ${r.rssi ?? '—'} dBm</div>
        <div style="margin-top:6px"><strong>${r.iperf_dl_mbps ?? '—'}</strong> Mbps DL</div>
        <div class="muted" style="font-size:0.85rem">${r.iperf_ul_mbps ?? '—'} Mbps UL</div>
        <div style="margin-top:6px"><a href="/raw/${(r.raw_file||'').split('/').pop()}" target="_blank" class="muted">raw</a></div>
      </div>
    `;
    resultsList.prepend(card);

    // update chart safely
    chart.data.labels.unshift(r.point);
    chart.data.datasets[0].data.unshift(Number(r.iperf_dl_mbps) || 0);
    if(chart.data.labels.length>20){ chart.data.labels.pop(); chart.data.datasets[0].data.pop(); }
    chart.update('active');
  }

  // export, start survey, etc. reuse existing logic but ensure text normalized
  // ... (rest of logic remains as before; keep behavior identical)

  // expose small API for debugging
  window.__ws = { addResult };
})();