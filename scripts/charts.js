let currentDataSets = [];
let myChart = null; // Variable para mantener la instancia del gráfico

function updateChart(dataSets, chartType, chartColor) {
    const ctx = document.getElementById('chart').getContext('2d');

    // Si ya existe un gráfico, lo destruimos antes de crear uno nuevo.
    if (myChart) {
        myChart.destroy();
    }

    // Asigna un color base a cada dataset, pero permite la personalización.
    const datasetsWithColors = dataSets.datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: generateColor(chartColor, index, dataSets.datasets.length),
        borderColor: generateColor(chartColor, index, dataSets.datasets.length),
        fill: false
    }));

    myChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: dataSets.labels,
            datasets: datasetsWithColors
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Intensidad de señal (dBm)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' dBm';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Función auxiliar para generar variaciones de color para cada dataset.
function generateColor(baseColor, index, total) {
    const R = parseInt(baseColor.substring(1, 3), 16);
    const G = parseInt(baseColor.substring(3, 5), 16);
    const B = parseInt(baseColor.substring(5, 7), 16);
    const alpha = 0.8 - (index * (0.7 / total));
    return `rgba(${R}, ${G}, ${B}, ${alpha})`;
}

// Event listeners para personalización
document.getElementById('chartType').addEventListener('change', (e) => {
    const chartType = e.target.value;
    const chartColor = document.getElementById('chartColor').value;
    updateChart(currentDataSets, chartType, chartColor);
});

document.getElementById('chartColor').addEventListener('input', (e) => {
    const chartColor = e.target.value;
    const chartType = document.getElementById('chartType').value;
    updateChart(currentDataSets, chartType, chartColor);
});