const surveyHistory = [];

function saveSurveyResult(result) {
    const history = loadSurveyHistory();
    history.push(result);
    localStorage.setItem('surveyHistory', JSON.stringify(history));
}

function loadSurveyHistory() {
    const history = localStorage.getItem('surveyHistory');
    return history ? JSON.parse(history) : [];
}

function displaySurveyHistory() {
    const history = loadSurveyHistory();
    const historyContainer = document.getElementById('history-list');
    if (!historyContainer) return;

    historyContainer.innerHTML = history.map((entry, index) => {
        const date = new Date(entry.timestamp).toLocaleString();
        const networks = entry.networks.map(n => `<li>${n.ssid} (${n.signal} dBm)</li>`).join('');
        return `
            <div class="history-entry">
                <h4>Encuesta ${index + 1} - ${date}</h4>
                <ul>${networks}</ul>
            </div>
        `;
    }).join('');
}
