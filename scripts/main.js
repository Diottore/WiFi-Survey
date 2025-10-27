```javascript
// ...existing code...

function saveAndDisplaySurvey(result) {
    saveSurveyResult(result);
    displaySurveyHistory();
}

// Llamar a esta función al finalizar una encuesta
// saveAndDisplaySurvey(surveyResult);

// Cargar el historial al iniciar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    displaySurveyHistory();
});
```