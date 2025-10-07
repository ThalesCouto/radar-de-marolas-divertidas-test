// Localize esta função no seu script.js e substitua-a:

function updateCurrentDisplay(beachKey, index) {
    const beach = globalState[beachKey];
    const hourlyData = beach.data;
    const statusElement = document.getElementById(`${beachKey}-status`);
    const subtitleElement = document.getElementById(`${beachKey}-current-subtitle`);

    if (!hourlyData || hourlyData.time.length <= index) {
        statusElement.innerHTML = `<p class="error">Dados de vento não disponíveis para este horário.</p>`;
        return;
    }
    
    const currentWind = {
        time: hourlyData.time[index],
        speed: hourlyData.wind_speed_10m[index],
        direction: hourlyData.wind_direction_10m[index]
    };

    const currentDirectionCardinal = degToCardinal(currentWind.direction);
    const currentScore = calculateWindScore(currentWind.direction, beach.desiredDeg);
    const desiredCardinal = degToCardinal(beach.desiredDeg);
    const pointColor = getColorForScore(currentScore);

    const currentHourStr = globalState.hourlyTimeLabels[index];
    subtitleElement.textContent = `Previsão selecionada: ${currentHourStr}h`;
    
    // ATENÇÃO: Mudança aqui para incluir o marcador do Norte
    const htmlContent = `
        <div class="current-data">
            <div class="nota-box">
                <div class="nota-score" style="color: ${pointColor};">${currentScore}</div>
                <div class="nota-label">Nota (0-10)</div>
            </div>
            <div class="nota-box">
                <div class="nota-score">${currentDirectionCardinal}</div>
                <div class="nota-label">Vento Previsto</div>
            </div>
            <div class="nota-box">
                <div class="nota-score">${currentWind.speed.toFixed(0)} km/h</div>
                <div class="nota-label">Velocidade</div>
            </div>
        </div>

        <div class="setas-container">
            <div class="seta-item">
                <div class="seta-atual-container">
                    <span id="north-marker">N</span>
                    <span class="icone-seta seta-atual" 
                          style="transform: rotate(${currentWind.direction - 90}deg); color: ${pointColor};">
                        &#x27A4;
                    </span>
                </div>
                <div class="seta-label">Previsto (${currentWind.direction}°)</div>
            </div>
            
            <div class="seta-item">
                <span class="icone-seta seta-desejada" 
                      style="transform: rotate(${beach.desiredDeg - 90}deg);">
                    &#x27A4;
                </span>
                <div class="seta-label">Ideal (${desiredCardinal}, ${beach.desiredDeg}°)</div>
            </div>
        </div>
    `;
    
    if (statusElement) {
         statusElement.innerHTML = htmlContent;
    }

    if (beach.chartInstance) {
        beach.chartInstance.update(); 
    }
}
