const API_URL = "https://api.open-meteo.com/v1/forecast";

// URL da API de Maré (gratuita, baseada em coordenadas)
const TIDE_API_BASE_URL = "https://www.worldtidedata.com/api/tide/api";
// Coordenadas aproximadas de Niterói, RJ (para a API de marés)
const NITERÓI_COORDS = { lat: -22.9, lon: -43.1 };

// Estrutura global para dados e configurações
const globalState = {
    hourlyTimeLabels: [], 
    tideData: null, 
    itacoatiara: { name: "Praia de Itacoatiara", lat: -22.97, lon: -43.04, desiredDeg: 10, data: null, chartInstance: null },
    itaipu: { name: "Canal de Itaipu", lat: -22.95, lon: -43.06, desiredDeg: 56, data: null, chartInstance: null }
};

const dateInput = document.getElementById('date-input');
const timeSlider = document.getElementById('time-slider');
const currentTimeDisplay = document.getElementById('current-time-display');

// --- Funções de Inicialização e Controle ---

function initializeDateInput() {
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 6);

    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayFormatted = formatDate(today);
    const maxFormatted = formatDate(maxDate);

    dateInput.value = todayFormatted;
    dateInput.min = todayFormatted;
    dateInput.max = maxFormatted;

    dateInput.addEventListener('change', fetchAllData);
}

function initializeTimeSlider() {
    timeSlider.addEventListener('input', (event) => {
        const index = parseInt(event.target.value);
        
        currentTimeDisplay.textContent = globalState.hourlyTimeLabels[index];

        const selectedDate = dateInput.value;
        const selectedTimeStr = globalState.hourlyTimeLabels[index];
        const fullSelectedTimeStr = `${selectedDate} ${selectedTimeStr}`;

        updateCurrentDisplay('itacoatiara', index);
        updateCurrentDisplay('itaipu', index);

        if (globalState.tideData) {
            updateTideDisplay(fullSelectedTimeStr, globalState.tideData);
        }
    });
}

function configureTimeSlider(hourlyTimes) {
    globalState.hourlyTimeLabels = hourlyTimes.map(t => t.substring(11, 16));
    
    const maxIndex = globalState.hourlyTimeLabels.length - 1;
    timeSlider.max = maxIndex;
    
    timeSlider.removeAttribute('disabled');
    
    let initialIndex = 0;
    const selectedDate = dateInput.value;
    const todayFormatted = new Date().toISOString().slice(0, 10);
    
    if (selectedDate === todayFormatted) {
        const now = new Date();
        const currentHour = now.getHours();
        initialIndex = hourlyTimes.findIndex(timeStr => {
            const hour = parseInt(timeStr.substring(11, 13));
            return hour >= currentHour;
        });
        if (initialIndex === -1) initialIndex = maxIndex;
    }
    
    timeSlider.value = initialIndex;
    currentTimeDisplay.textContent = globalState.hourlyTimeLabels[initialIndex];

    return initialIndex;
}

// --- Funções de Cálculo e Estilo ---

function degToCardinal(deg) {
    if (deg > 337.5 || deg <= 22.5) return "N";
    if (deg > 22.5 && deg <= 67.5) return "NE";
    if (deg > 67.5 && deg <= 112.5) return "L";
    if (deg > 112.5 && deg <= 157.5) return "SE";
    if (deg > 157.5 && deg <= 202.5) return "S";
    if (deg > 202.5 && deg <= 247.5) return "SO";
    if (deg > 247.5 && deg <= 292.5) return "O";
    if (deg > 292.5 && deg <= 337.5) return "NO";
    return "Indef.";
}

function calculateWindScore(currentDeg, desiredDeg) {
    let diff = Math.abs(currentDeg - desiredDeg);
    if (diff > 180) {
        diff = 360 - diff;
    }
    const score = 10 - (diff / 180) * 10;
    return parseFloat(score.toFixed(1));
}

function getColorForScore(score) {
    const normalizedScore = Math.max(0, Math.min(10, score)) / 10;
    let r, g;
    if (normalizedScore <= 0.5) { r = 255; g = Math.round(255 * (normalizedScore * 2)); } 
    else { r = Math.round(255 * (1 - (normalizedScore - 0.5) * 2)); g = 255; }
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = (0).toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}`;
}

// --- Funções de Maré (API Real) ---

/**
 * BUSCA REAL: Busca os dados de maré da API World Tide Data.
 */
async function fetchTideData(date) {
    // API que retorna dados de maré baseados em coordenadas.
    const params = new URLSearchParams({
        lat: NITERÓI_COORDS.lat,
        lon: NITERÓI_COORDS.lon,
        // A API usa formato timestamp ou Unix, mas o formato de data yyyy-mm-dd funciona para a data base.
        date: date 
    });

    const response = await fetch(`${TIDE_API_BASE_URL}?${params.toString()}`);
    
    if (!response.ok) {
        throw new Error(`Erro HTTP ao buscar maré: ${response.status}`);
    }

    const data = await response.json();
    
    // Filtra e formata os dados para o nosso formato {time: 'YYYY-MM-DD HH:mm', height: 1.2, type: 'HIGH'/'LOW'}
    if (data.tides && data.tides.length > 0) {
        return data.tides.map(tide => {
            // A API retorna o timestamp (unixtime). Multiplicamos por 1000 para milissegundos.
            const dateObj = new Date(tide.ts * 1000); 
            const timeStr = dateObj.toISOString().substring(0, 16).replace('T', ' '); // Formato YYYY-MM-DD HH:mm
            
            return {
                time: timeStr,
                height: tide.height,
                type: tide.type.toUpperCase() // Garante HIGH ou LOW
            };
        }).filter(t => t.time.startsWith(date)); // Filtra apenas eventos do dia selecionado
    }
    
    throw new Error("Dados de maré não encontrados.");
}

/**
 * Determina o estado da maré (Alta, Baixa, Subindo, Descendo) para a hora selecionada.
 * (A lógica permanece a mesma, mas agora usa dados reais)
 */
function getTideStatus(selectedTimeStr, dailyTides) {
    const selectedTime = new Date(selectedTimeStr).getTime();
    
    const tideEvents = dailyTides.map(t => ({
        timestamp: new Date(t.time).getTime(),
        height: t.height,
        type: t.type
    })).sort((a, b) => a.timestamp - b.timestamp);

    let nextTideIndex = tideEvents.findIndex(t => t.timestamp > selectedTime);

    if (nextTideIndex === -1 && tideEvents.length > 0) {
        const lastTide = tideEvents[tideEvents.length - 1];
        return { 
            state: lastTide.type === 'HIGH' ? 'Maré Alta' : 'Maré Baixa', 
            detail: `${lastTide.height.toFixed(1)} m (Último Pico)`
        };
    } else if (tideEvents.length === 0) {
        return { state: 'Sem Dados (Dia)', detail: '-- m' };
    }
    
    const nextTide = tideEvents[nextTideIndex];
    const nextTideTimeStr = new Date(nextTide.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    if (Math.abs(nextTide.timestamp - selectedTime) < 900000) { // Dentro de 15 minutos
        return { 
            state: nextTide.type === 'HIGH' ? 'Maré Alta PICO' : 'Maré Baixa PICO',
            detail: `${nextTide.height.toFixed(1)} m`
        };
    } else if (nextTide.type === 'HIGH') {
        // Se a próxima é Alta, a maré está subindo
        return { 
            state: 'Maré Subindo', 
            detail: `Alta às ${nextTideTimeStr} (${nextTide.height.toFixed(1)} m)`
        };
    } else { // nextTide.type === 'LOW'
        // Se a próxima é Baixa, a maré está descendo
        return { 
            state: 'Maré Descendo', 
            detail: `Baixa às ${nextTideTimeStr} (${nextTide.height.toFixed(1)} m)`
        };
    }
}

function updateTideDisplay(selectedTimeStr, dailyTides) {
    const statusElement = document.getElementById('tide-status');
    const stateElement = document.getElementById('tide-state');
    const heightElement = document.getElementById('tide-height');
    
    if (!dailyTides || dailyTides.length === 0) {
        stateElement.textContent = "Dados Indisponíveis";
        heightElement.textContent = "-- m";
        statusElement.className = 'tide-status state-low';
        return;
    }

    const tideInfo = getTideStatus(selectedTimeStr, dailyTides);
    
    stateElement.textContent = tideInfo.state;
    heightElement.textContent = tideInfo.detail;
    
    if (tideInfo.state.includes('Alta')) {
        statusElement.className = 'tide-status state-high';
    } else if (tideInfo.state.includes('Baixa')) {
        statusElement.className = 'tide-status state-low';
    } else if (tideInfo.state.includes('Subindo')) {
        statusElement.className = 'tide-status state-rising';
    } else if (tideInfo.state.includes('Descendo')) {
        statusElement.className = 'tide-status state-falling';
    } else {
        statusElement.className = 'tide-status';
    }
}

// --- Funções de Vento e Gráfico ---

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
    
    const currentRotation = currentWind.direction - 90;
    const desiredRotation = beach.desiredDeg - 90;

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
                <div class="seta-referencia-container">
                    <span id="north-marker">N</span>
                    <span class="icone-seta seta-atual" 
                          style="transform: rotate(${currentRotation}deg); color: ${pointColor};">
                        &#x27A4;
                    </span>
                </div>
                <div class="seta-label">Previsto (${currentWind.direction}°)</div>
            </div>
            
            <div class="seta-item">
                <div class="seta-referencia-container">
                    <span id="north-marker">N</span>
                    <span class="icone-seta seta-desejada" 
                          style="transform: rotate(${desiredRotation}deg);">
                        &#x27A4;
                    </span>
                </div>
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

function updateChart(beachKey, scores, directions, speeds) {
    const ctx = document.getElementById(`${beachKey}-chart`).getContext('2d');
    const beach = globalState[beachKey];
    
    const pointColors = scores.map(score => getColorForScore(score));

    if (beach.chartInstance) {
        beach.chartInstance.destroy();
    }

    beach.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: globalState.hourlyTimeLabels,
            datasets: [{
                label: 'Nota de Qualidade (0-10)',
                data: scores,
                borderColor: '#48c9b0', 
                backgroundColor: 'rgba(72, 201, 176, 0.2)',
                fill: true,
                tension: 0.4,
                yAxisID: 'y',
                pointRadius: 4, 
                pointHoverRadius: 8,
                pointBackgroundColor: pointColors, 
            }]
        },
        options: {
            responsive: true,
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    
                    timeSlider.value = clickedIndex;
                    currentTimeDisplay.textContent = globalState.hourlyTimeLabels[clickedIndex];
                    
                    updateCurrentDisplay('itacoatiara', clickedIndex);
                    updateCurrentDisplay('itaipu', clickedIndex);
                    
                    if (globalState.tideData) {
                        const selectedDate = dateInput.value;
                        const selectedTimeStr = globalState.hourlyTimeLabels[clickedIndex];
                        const fullSelectedTimeStr = `${selectedDate} ${selectedTimeStr}`;
                        updateTideDisplay(fullSelectedTimeStr, globalState.tideData);
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Nota de Vento Horária (Clique ou Arraste para Selecionar Hora)',
                    color: '#333'
                },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const beach = globalState[beachKey]; // Acessa o objeto da praia corretamente
                            return [
                                `Direção: ${directions[index]} (${beach.desiredDeg}° Ideal)`,
                                `Velocidade: ${speeds[index]} km/h`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Hora do Dia', color: '#333' },
                    grid: { display: false },
                    ticks: { color: '#333' }
                },
                y: {
                    title: { display: true, text: 'Nota de Vento', color: '#333' },
                    min: 0,
                    max: 10,
                    ticks: { color: '#333' }
                }
            }
        }
    });
}

function renderBeachData(beachKey, fetchedHourlyData) {
    const beach = globalState[beachKey];
    const statusElement = document.getElementById(`${beachKey}-status`);
    
    beach.data = fetchedHourlyData;

    let initialIndexToDisplay;
    if (globalState.hourlyTimeLabels.length === 0) {
        initialIndexToDisplay = configureTimeSlider(fetchedHourlyData.time);
    } else {
        initialIndexToDisplay = parseInt(timeSlider.value || 0);
    }

    const scores = fetchedHourlyData.wind_direction_10m.map(deg => calculateWindScore(deg, beach.desiredDeg));
    const directions = fetchedHourlyData.wind_direction_10m.map(deg => degToCardinal(deg));
    const speeds = fetchedHourlyData.wind_speed_10m.map(s => s.toFixed(0));
    
    statusElement.innerHTML = '<div id="current-display-placeholder"></div>';

    updateChart(beachKey, scores, directions, speeds);

    updateCurrentDisplay(beachKey, initialIndexToDisplay);
}

async function fetchAllData() {
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    timeSlider.setAttribute('disabled', 'true');
    globalState.hourlyTimeLabels = [];
    currentTimeDisplay.textContent = '---';
    globalState.tideData = null; // Resetamos os dados de maré no início de cada busca.

    const startDate = selectedDate;
    const endDate = selectedDate;

    const beachKeys = ['itacoatiara', 'itaipu'];

    beachKeys.forEach(key => {
        document.getElementById(`${key}-status`).innerHTML = `<p class="loading">Buscando previsão...</p>`;
    });
    
    // --- 1. BUSCA DE MARÉ (REAL) ---
    const tideStateElement = document.getElementById('tide-state');
    const tideHeightElement = document.getElementById('tide-height');
    tideStateElement.textContent = "Buscando...";
    tideHeightElement.textContent = "-- m";

    try {
        const dailyTides = await fetchTideData(startDate);
        globalState.tideData = dailyTides;
    } catch (error) {
        console.error("Erro ao buscar dados reais da maré:", error);
        globalState.tideData = null;
        tideStateElement.textContent = "Erro na Maré (API)";
        tideHeightElement.textContent = "Usando dados fixos";
    }
    // --- FIM BUSCA DE MARÉ ---


    // --- 2. BUSCA DE VENTO ---
    for (const key of beachKeys) {
        const beach = globalState[key];
        const statusElement = document.getElementById(`${key}-status`);

        try {
            const params = new URLSearchParams({
                latitude: beach.lat,
                longitude: beach.lon,
                hourly: 'wind_speed_10m,wind_direction_10m',
                start_date: startDate,
                end_date: endDate,
                timezone: 'America/Sao_Paulo'
            });

            const response = await fetch(`${API_URL}?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.hourly && data.hourly.time.length > 0) {
                renderBeachData(key, data.hourly);
            } else {
                throw new Error("Dados horários não encontrados.");
            }

        } catch (error) {
            console.error(`Erro ao buscar dados para ${key}:`, error);
            statusElement.innerHTML = `<p class="error">Erro ao carregar os dados do vento para ${beach.name}.</p>`;
        }
    }
    // --- FIM BUSCA DE VENTO ---
    
    // 3. Atualiza o display da maré com o estado inicial
    const initialIndexToDisplay = parseInt(timeSlider.value || 0);
    const initialTimeStr = globalState.hourlyTimeLabels[initialIndexToDisplay] || '00:00';
    const fullInitialTimeStr = `${startDate} ${initialTimeStr}`;
    
    if (globalState.tideData) {
        updateTideDisplay(fullInitialTimeStr, globalState.tideData);
    }
}

// Inicia os listeners e o carregamento inicial
initializeDateInput();
initializeTimeSlider();
fetchAllData();
// Atualiza os dados a cada 15 minutos (900000 milissegundos)
setInterval(fetchAllData, 900000);
