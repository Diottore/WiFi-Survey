// Agregar el Histograma de RSSI
const rssiHistogramCtx = document.getElementById('rssiHistogramChart').getContext('2d');
const rssiHistogramChart = new Chart(rssiHistogramCtx, {
  type: 'bar',
  data: {
    labels: [], // Etiquetas de los intervalos de RSSI
    datasets: [] // Datasets por ubicación
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Distribución de RSSI por Ubicación' }
    },
    scales: {
      x: { title: { display: true, text: 'Rango de RSSI (dBm)' } },
      y: { title: { display: true, text: 'Frecuencia' }, beginAtZero: true, stacked: true },
    }
  }
});

// Función para agrupar RSSI en intervalos
function groupRssiByRange(rssi, rangeSize = 5) {
  const minRssi = -100;
  const maxRssi = 0;
  const rangeIndex = Math.floor((rssi - minRssi) / rangeSize);
  return Math.max(0, Math.min(rangeIndex, (maxRssi - minRssi) / rangeSize - 1));
}

// Función para actualizar el histograma
function updateRssiHistogram(results) {
  const rangeLabels = [];
  const rangeSize = 5; // Intervalos de 5 dBm
  for (let i = -100; i < 0; i += rangeSize) {
    rangeLabels.push(`${i} a ${i + rangeSize}`);
  }

  const groupedData = {};
  results.forEach(result => {
    const rssi = parseFloat(result.rssi);
    const location = result.point || 'Desconocido';
    const range = groupRssiByRange(rssi, rangeSize);
    if (!groupedData[location]) groupedData[location] = new Array(rangeLabels.length).fill(0);
    if (range >= 0 && range < rangeLabels.length) groupedData[location][range]++;
  });

  rssiHistogramChart.data.labels = rangeLabels;
  rssiHistogramChart.data.datasets = Object.keys(groupedData).map(location => ({
    label: location,
    data: groupedData[location],
    backgroundColor: getRandomColor(), // Función para asignar colores únicos
  }));
  rssiHistogramChart.update();
}

// Llamar a la función desde pushResult
function pushResult(r) {
  if (!r) return;
  resultBuffer.push(r);
  if (!flushing) {
    flushing = true;
    requestAnimationFrame(() => flushResults());
  }

  // Actualizar el histograma con los resultados actuales
  updateRssiHistogram(results);
}