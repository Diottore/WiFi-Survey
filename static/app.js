// app.js - lógica cliente para la UI mejorada
(async function(){
  const runBtn = document.getElementById('runBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const deviceEl = document.getElementById('device');
  const pointEl = document.getElementById('point');
  const runEl = document.getElementById('run');
  const logEl = document.getElementById('log');

  const startSurveyBtn = document.getElementById('startSurvey');
  const pointsEl = document.getElementById('points');
  const repeatsEl = document.getElementById('repeats');
  const surveyLog = document.getElementById('surveyLog');
  const surveyStatus = document.getElementById('surveyStatus');
  const progressBar = document.getElementById('progressBar');

  const resultsTableBody = document.querySelector('#resultsTable tbody');
  const throughputChartCtx = document.getElementById('throughputChart').getContext('2d');
  let chart = new Chart(throughputChartCtx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'DL Mbps', data: [], backgroundColor: '#1f6feb' }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true}} }
  });

  function log(s){ logEl.textContent = s + "\n" + logEl.textContent; }

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    log('Iniciando medición puntual...');
    try {
      const res = await fetch('/run_point', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device: deviceEl.value, point: pointEl.value, run: Number(runEl.value)||1})
      });
      const j = await res.json();
      if(j.ok){
        log('Resultado: ' + JSON.stringify(j.result, null, 2));
        addResultToTable(j.result);
      } else {
        log('Error: ' + JSON.stringify(j));
      }
    } catch(e){
      log('Error fetch: ' + e);
    } finally { runBtn.disabled = false; }
  });

  downloadBtn.addEventListener('click', () => {
    window.location.href = '/download_csv';
  });

  function addResultToTable(r){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.point}</td><td>${r.rssi}</td><td>${r.iperf_dl_mbps}</td><td>${r.iperf_ul_mbps}</td><td>${r.ping_avg}</td><td><a href="/raw/${r.raw_file.split('/').pop()}" target="_blank">raw</a></td>`;
    resultsTableBody.prepend(tr);
    // update chart
    chart.data.labels.unshift(r.point);
    chart.data.datasets[0].data.unshift(r.iperf_dl_mbps);
    if(chart.data.labels.length>15){ chart.data.labels.pop(); chart.data.datasets[0].data.pop(); }
    chart.update();
  }

  // Survey (background)
  startSurveyBtn.addEventListener('click', async () => {
    startSurveyBtn.disabled = true;
    surveyLog.textContent = "";
    surveyStatus.textContent = "Creando tarea...";
    progressBar.style.display = "block";
    progressBar.value = 0;

    const ptsRaw = pointsEl.value.trim();
    const points = ptsRaw.includes(',') ? ptsRaw.split(',').map(s=>s.trim()) : ptsRaw.split(/\s+/).map(s=>s.trim());
    const repeats = Number(repeatsEl.value)||1;
    const device = document.getElementById('survey_device').value || 'phone';

    try {
      const res = await fetch('/start_survey', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({device, points, repeats})
      });
      const j = await res.json();
      if(!j.ok){ surveyStatus.textContent = 'Error: ' + (j.error || ''); startSurveyBtn.disabled = false; return; }
      const taskId = j.task_id;
      surveyStatus.textContent = `Tarea creada: ${taskId}. Ejecutando...`;
      // poll status
      const poll = setInterval(async () => {
        const st = await fetch(`/task_status/${taskId}`);
        const js = await st.json();
        if(!js){ return; }
        const total = js.total||1;
        const done = js.done||0;
        const pct = Math.round((done/total)*100);
        progressBar.value = pct;
        surveyLog.textContent = js.logs.slice(-200).join("\n");
        surveyStatus.textContent = `Tarea ${taskId} — ${js.status} — ${done}/${total}`;
        // append new results to table
        (js.results||[]).forEach(r => {
          // avoid duplicates by checking if already present in table via raw_file name
          if(!document.querySelector(`a[href="/raw/${r.raw_file.split('/').pop()}"]`)){
            addResultToTable(r);
          }
        });
        if(js.status === 'finished' || js.status === 'error'){
          clearInterval(poll);
          startSurveyBtn.disabled = false;
          surveyStatus.textContent = `Tarea finalizada: ${taskId} — ${js.status}`;
          progressBar.value = 100;
        }
      }, 2500);
    } catch(e){
      surveyStatus.textContent = 'Error al iniciar encuesta: ' + e;
      startSurveyBtn.disabled = false;
      progressBar.style.display = "none";
    }
  });

})();