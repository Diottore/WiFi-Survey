let currentDataSets = [];

function updateChart(dataSets, chartType, chartColor) {
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
        type: chartType,
        data: {
            labels: dataSets.labels,
            datasets: dataSets.datasets.map(dataset => ({
                ...dataset,
                backgroundColor: chartColor
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Event listeners for customization
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