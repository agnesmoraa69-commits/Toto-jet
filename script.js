/* script.js */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let balance = 0.00;
let gameState = 'IDLE'; 
let currentMultiplier = 1.00;
let crashPoint = 1.00;
let gameInterval = null;

let bets = {
    1: { amount: 10.00, placed: false, cashedOut: false },
    2: { amount: 10.00, placed: false, cashedOut: false }
};

const multiplierText = document.getElementById('multiplier-text');
const balanceVal = document.getElementById('balance-val');

function setBet(panelId, amount) {
    if (gameState !== 'IDLE') return;
    bets[panelId].amount = amount;
    document.getElementById(`bet-amount-${panelId}`).value = amount.toFixed(2);
    updateButtonSubtext(panelId);
}

function adjustBet(panelId, delta) {
    if (gameState !== 'IDLE') return;
    let input = document.getElementById(`bet-amount-${panelId}`);
    let val = Math.max(10, parseFloat(input.value) + delta);
    bets[panelId].amount = val;
    input.value = val.toFixed(2);
    updateButtonSubtext(panelId);
}

function updateButtonSubtext(panelId) {
    let btn = document.getElementById(`action-btn-${panelId}`);
    if(!bets[panelId].placed) {
        btn.innerHTML = `Bet<br><span class="btn-sub-amt">${bets[panelId].amount.toFixed(2)} KES</span>`;
    }
}

function handleAction(panelId) {
    let b = bets[panelId];
    let inputVal = parseFloat(document.getElementById(`bet-amount-${panelId}`).value) || 10.00;
    b.amount = inputVal;
    let btn = document.getElementById(`action-btn-${panelId}`);

    if (gameState === 'IDLE' || gameState === 'COUNTDOWN') {
        if (!b.placed) {
            b.placed = true;
            btn.innerHTML = `Cancel<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
            btn.style.background = "#d81b36";
            if (gameState === 'IDLE') {
                startLaunchSequence();
            }
        } else {
            b.placed = false;
            btn.innerHTML = `Bet<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
            btn.style.background = "";
            btn.className = "main-action-btn btn-bet";
        }
    } else if (gameState === 'RUNNING' && b.placed && !b.cashedOut) {
        b.cashedOut = true;
        let winnings = b.amount * currentMultiplier;
        balance += winnings;
        balanceVal.innerText = balance.toFixed(2);
        btn.innerHTML = `Won<br><span class="btn-sub-amt">${winnings.toFixed(2)}</span>`;
        btn.className = "main-action-btn btn-disabled";
    }
}

function startLaunchSequence() {
    gameState = 'RUNNING';
    currentMultiplier = 1.00;
    crashPoint = parseFloat((Math.max(1.01, 0.99 / (1 - Math.random() * 0.95))).toFixed(2));

    for (let id of [1, 2]) {
        if (bets[id].placed) {
            bets[id].cashedOut = false;
            let btn = document.getElementById(`action-btn-${id}`);
            btn.innerHTML = `Cash Out<br><span class="btn-sub-amt">{(bets[id].amount * currentMultiplier).toFixed(2)} KES</span>`;
            btn.className = "main-action-btn btn-cashout";
        }
    }

    let startTime = Date.now();
    gameInterval = setInterval(() => {
        let elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = parseFloat((Math.exp(0.07 * elapsed)).toFixed(2));

        if (currentMultiplier >= crashPoint) {
            currentMultiplier = crashPoint;
            endGame();
        }

        multiplierText.innerText = currentMultiplier.toFixed(2) + 'x';
        
        for (let id of [1, 2]) {
            if (bets[id].placed && !bets[id].cashedOut) {
                let btn = document.getElementById(`action-btn-${id}`);
                let liveWin = bets[id].amount * currentMultiplier;
                btn.innerHTML = `Cash Out<br><span class="btn-sub-amt">${liveWin.toFixed(2)} KES</span>`;
            }
        }

        drawPlaneScene(elapsed);
    }, 40);
}

function endGame() {
    clearInterval(gameInterval);
    gameState = 'CRASHED';
    multiplierText.innerText = crashPoint.toFixed(2) + 'x';
    multiplierText.style.color = "#d81b36";

    for (let id of [1, 2]) {
        let btn = document.getElementById(`action-btn-${id}`);
        if (bets[id].placed && !bets[id].cashedOut) {
            btn.innerHTML = `Lost<br><span class="btn-sub-amt">0.00</span>`;
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
    for (let id of [1, 2]) {
        bets[id].placed = false;
        bets[id].cashedOut = false;
        let btn = document.getElementById(`action-btn-${id}`);
        btn.innerHTML = `Bet<br><span class="btn-sub-amt">${bets[id].amount.toFixed(2)} KES</span>`;
        btn.className = "main-action-btn btn-bet";
        btn.style.background = "";
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function toggleMenu() {
    document.getElementById('sideMenu').classList.toggle('open');
    document.getElementById('menuOverlay').classList.toggle('open');
}

function toggleChatDrawer() {
    alert("Live chat room drawer opened.");
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

function drawPlaneScene(progress) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let w = canvas.width;
    let h = canvas.height;

    // Draw red vector curve trajectory
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.3, h * 0.85, w * Math.min(0.75, progress / 7), h * Math.max(0.2, h - (progress * 25)));
    ctx.strokeStyle = '#d81b36';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Red propeller plane graphic at curve tip
    let px = w * Math.min(0.75, progress / 7);
    let py = Math.max(25, h - (progress * 25));

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.1);
    ctx.fillStyle = '#d81b36';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

