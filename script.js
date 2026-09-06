/* script.js */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let balance = 0.00;
let gameState = 'IDLE'; // 'IDLE', 'RUNNING', 'CRASHED'
let currentMultiplier = 1.00;
let crashPoint = 1.00;
let gameInterval = null;
let animFrameId = null;

let bets = {
    1: { amount: 10.00, placed: false, cashedOut: false },
    2: { amount: 10.00, placed: false, cashedOut: false }
};

// Elements
const multiplierText = document.getElementById('multiplier-text');
const waitingBadge = document.getElementById('waiting-badge');
const balanceVal = document.getElementById('balance-val');
const statsList = document.getElementById('stats-list');
const totalBetsCount = document.getElementById('total-bets-count');

// Audio Synthesizer for Jet Sound Effect (Web Audio API)
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime); // Low engine pitch
    engineGain.gain.setValueAtTime(0.001, audioCtx.currentTime); // Silent initially

    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

function updateJetAudio(multiplier) {
    const soundEnabled = document.getElementById('soundToggle').checked;
    if (!audioCtx || !soundEnabled) return;

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (gameState === 'RUNNING') {
        let freq = 80 + (multiplier * 40);
        engineOsc.frequency.setTargetAtTime(Math.min(freq, 800), audioCtx.currentTime, 0.1);
        engineGain.gain.setTargetAtTime(0.08, audioCtx.currentTime, 0.1);
    } else if (gameState === 'IDLE') {
        engineOsc.frequency.setTargetAtTime(50, audioCtx.currentTime, 0.2);
        engineGain.gain.setTargetAtTime(0.02, audioCtx.currentTime, 0.2);
    } else {
        engineGain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.05);
    }
}

// Background Particle System for Idle & Flying States
let particles = [];
for (let i = 0; i < 40; i++) {
    particles.push({
        x: Math.random() * 400,
        y: Math.random() * 200,
        size: Math.random() * 2 + 1,
        speedX: Math.random() * 0.5 + 0.2,
        speedY: Math.random() * 0.2 - 0.1,
        opacity: Math.random() * 0.5 + 0.2
    });
}

let idleGridOffset = 0;
let idleTime = 0;

function drawCanvasScene(elapsed) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let w = canvas.width;
    let h = canvas.height;

    idleTime += 0.03;
    idleGridOffset = (idleGridOffset + (gameState === 'RUNNING' ? 3 : 0.8)) % 30;

    // 1. Render Animated Grid Lines
    ctx.strokeStyle = 'rgba(216, 27, 54, 0.12)';
    ctx.lineWidth = 1;
    for (let x = -idleGridOffset; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // 2. Render Floating Particles
    particles.forEach(p => {
        p.x -= (gameState === 'RUNNING' ? p.speedX * 3 : p.speedX);
        if (p.x < 0) p.x = w;
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // 3. Render Jet / Trajectory Curve
    if (gameState === 'RUNNING') {
        let px = Math.min(w * 0.75, elapsed * 35);
        let py = Math.max(30, h - (elapsed * 22));

        // Filled area beneath flight curve
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(px * 0.5, h, px, py);
        ctx.lineTo(px, h);
        ctx.closePath();
        let grad = ctx.createLinearGradient(0, py, 0, h);
        grad.addColorStop(0, 'rgba(216, 27, 54, 0.35)');
        grad.addColorStop(1, 'rgba(216, 27, 54, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Flight curve line
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(px * 0.5, h, px, py);
        ctx.strokeStyle = '#d81b36';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Jet Indicator Dot with Flame effect
        ctx.save();
        ctx.translate(px, py);
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(-8, 2, 4 + Math.sin(idleTime * 10) * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d81b36';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

    } else if (gameState === 'IDLE') {
        // Hovering Jet Icon on Runway in IDLE State
        let hoverY = h - 25 + Math.sin(idleTime * 2) * 4;
        ctx.fillStyle = 'rgba(216, 27, 54, 0.8)';
        ctx.beginPath();
        ctx.arc(30, hoverY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(22, hoverY, 3 + Math.sin(idleTime * 6) * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    updateJetAudio(currentMultiplier);
    animFrameId = requestAnimationFrame(() => drawCanvasScene(elapsed));
}

// Start continuous background animation loop
drawCanvasScene(0);

// Virtual Real-time Results Feed Simulation
const mockUsers = ['2***3', '2***6', '2***2', '2***8', '2***1', '2***9', '2***5'];
let liveBetsCount = 2965;

function generateInitialStats() {
    statsList.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        let user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
        let bet = (Math.floor(Math.random() * 20) + 1) * 100;
        let isWin = Math.random() > 0.4;
        let mult = isWin ? (Math.random() * 3 + 1.1).toFixed(2) + 'x' : '-';
        let winVal = isWin ? (bet * parseFloat(mult)).toFixed(2) : '-';

        let row = document.createElement('div');
        row.className = 'stat-item';
        row.innerHTML = `
            <span>${user}</span>
            <span>${bet.toFixed(2)}</span>
            <span>${mult}</span>
            <span class="${isWin ? 'win-val' : ''}">${winVal}</span>
            <span>${user}</span>
        `;
        statsList.appendChild(row);
    }
}
generateInitialStats();

// Interval to simulate live active users betting in real time
setInterval(() => {
    if (Math.random() > 0.3) {
        liveBetsCount += Math.floor(Math.random() * 3) + 1;
        totalBetsCount.innerText = liveBetsCount;

        let user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
        let bet = (Math.floor(Math.random() * 15) + 1) * 100;
        let isWin = gameState === 'RUNNING' && Math.random() > 0.5;
        let mult = isWin ? currentMultiplier.toFixed(2) + 'x' : '-';
        let winVal = isWin ? (bet * currentMultiplier).toFixed(2) : '-';

        let row = document.createElement('div');
        row.className = 'stat-item new-entry';
        row.innerHTML = `
            <span>${user}</span>
            <span>${bet.toFixed(2)}</span>
            <span>${mult}</span>
            <span class="${isWin ? 'win-val' : ''}">${winVal}</span>
            <span>${user}</span>
        `;

        statsList.insertBefore(row, statsList.firstChild);
        if (statsList.children.length > 10) {
            statsList.removeChild(statsList.lastChild);
        }

        setTimeout(() => row.classList.remove('new-entry'), 800);
    }
}, 2000);

// Betting Logic
function setBet(panelId, amount) {
    if (gameState === 'RUNNING') return;
    bets[panelId].amount = amount;
    document.getElementById(`bet-amount-${panelId}`).value = amount.toFixed(2);
    document.getElementById(`sub-${panelId}`).innerText = `${amount.toFixed(2)} KES`;
}

function adjustBet(panelId, delta) {
    if (gameState === 'RUNNING') return;
    let input = document.getElementById(`bet-amount-${panelId}`);
    let val = Math.max(10, parseFloat(input.value) + delta);
    bets[panelId].amount = val;
    input.value = val.toFixed(2);
    document.getElementById(`sub-${panelId}`).innerText = `${val.toFixed(2)} KES`;
}

function handleAction(panelId) {
    initAudio();
    let b = bets[panelId];
    let inputVal = parseFloat(document.getElementById(`bet-amount-${panelId}`).value) || 10.00;
    b.amount = inputVal;
    let btn = document.getElementById(`action-btn-${panelId}`);

    if (gameState === 'IDLE') {
        if (!b.placed) {
            b.placed = true;
            btn.innerHTML = `CANCEL<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
            btn.style.background = "#d81b36";
            startLaunchSequence();
        } else {
            b.placed = false;
            btn.innerHTML = `BET<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
            btn.style.background = "";
            btn.className = "main-action-btn btn-bet";
        }
    } else if (gameState === 'RUNNING' && b.placed && !b.cashedOut) {
        b.cashedOut = true;
        let winnings = b.amount * currentMultiplier;
        balance += winnings;
        balanceVal.innerText = balance.toFixed(2);
        btn.innerHTML = `WON<br><span class="btn-sub-amt">${winnings.toFixed(2)} KES</span>`;
        btn.className = "main-action-btn btn-disabled";
    }
}

function startLaunchSequence() {
    if (gameState === 'RUNNING') return;
    gameState = 'RUNNING';
    waitingBadge.style.display = 'none';
    currentMultiplier = 1.00;
    crashPoint = parseFloat((Math.max(1.05, (Math.random() * 4) + 1)).toFixed(2));

    for (let id of [1, 2]) {
        if (bets[id].placed) {
            bets[id].cashedOut = false;
            let btn = document.getElementById(`action-btn-${id}`);
            btn.className = "main-action-btn btn-cashout";
        }
    }

    let startTime = Date.now();
    gameInterval = setInterval(() => {
        let elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = parseFloat((Math.exp(0.12 * elapsed)).toFixed(2));

        if (currentMultiplier >= crashPoint) {
            currentMultiplier = crashPoint;
            endGame();
            return;
        }

        multiplierText.innerText = currentMultiplier.toFixed(2) + 'x';

        for (let id of [1, 2]) {
            if (bets[id].placed && !bets[id].cashedOut) {
                let btn = document.getElementById(`action-btn-${id}`);
                let liveWin = (bets[id].amount * currentMultiplier).toFixed(2);
                btn.innerHTML = `CASH OUT<br><span class="btn-sub-amt">${liveWin} KES</span>`;
            }
        }
    }, 50);
}

function endGame() {
    clearInterval(gameInterval);
    gameState = 'CRASHED';
    multiplierText.innerText = crashPoint.toFixed(2) + 'x';
    multiplierText.style.color = "#d81b36";
    waitingBadge.innerText = "FLEW AWAY!";
    waitingBadge.style.display = 'block';

    for (let id of [1, 2]) {
        let btn = document.getElementById(`action-btn-${id}`);
        if (bets[id].placed && !bets[id].cashedOut) {
            btn.innerHTML = `LOST<br><span class="btn-sub-amt">0.00 KES</span>`;
            btn.className = "main-action-btn btn-disabled";
        }
    }

    setTimeout(() => {
        resetRound();
    }, 2500);
}

function resetRound() {
    gameState = 'IDLE';
    multiplierText.style.color = "#ffffff";
    multiplierText.innerText = "1.00x";
    waitingBadge.innerText = "WAITING FOR NEXT ROUND";
    waitingBadge.style.display = 'block';

    for (let id of [1, 2]) {
        bets[id].placed = false;
        bets[id].cashedOut = false;
        let btn = document.getElementById(`action-btn-${id}`);
        btn.innerHTML = `BET<br><span class="btn-sub-amt">${bets[id].amount.toFixed(2)} KES</span>`;
        btn.className = "main-action-btn btn-bet";
        btn.style.background = "";
    }
}

// Modals and UI Toggles
function toggleDepositModal() {
    document.getElementById('depositModal').classList.toggle('open');
}

function selectPayment(method) {
    alert(`Selected deposit method: ${method}`);
    toggleDepositModal();
}

function toggleMenu() {
    document.getElementById('sideMenu').classList.toggle('open');
    document.getElementById('menuOverlay').classList.toggle('open');
}

function toggleChatDrawer() {
    alert("Live chat drawer opened.");
}

function switchBetTab(panelId, tab) {
    let panel = document.getElementById(`panel-${panelId}`);
    panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
}

function switchStatsTab(tabName) {
    document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
}
