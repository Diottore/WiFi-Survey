const surveyHistory = [];

function saveSurveyResult(result) {
    surveyHistory.push(result);
    localStorage.setItem('surveyHistory', JSON.stringify(surveyHistory));
}

function loadSurveyHistory() {
    const history = localStorage.getItem('surveyHistory');
    return history ? JSON.parse(history) : [];
}

function displaySurveyHistory() {
    const history = loadSurveyHistory();
    const historyContainer = document.getElementById('history');
    historyContainer.innerHTML = history.map((entry, index) => `
        <div>
            <h3>Encuesta ${index + 1}</h3>
            <p>${JSON.stringify(entry)}</p>
        </div>
    `).join('');
}
