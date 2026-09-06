/* script.js */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let balance = 10000.00;
let currentBet = 100;
let gameState = 'IDLE'; 
let currentMultiplier = 1.00;
let crashPoint = 1.00;
let hasPlacedBet = false;
let hasCashedOut = false;
let gameInterval = null;
let countdownTimer = 3;

const multiplierText = document.getElementById('multiplier-text');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const balanceVal = document.getElementById('balance-val');
const betInput = document.getElementById('bet-amount');

function setBet(amount) {
    if(gameState !== 'IDLE' && gameState !== 'COUNTDOWN') return;
    currentBet = amount;
    betInput.value = amount;
}

function adjustBet(val) {
    if(gameState !== 'IDLE' && gameState !== 'COUNTDOWN') return;
    currentBet = Math.max(10, parseFloat(betInput.value) + val);
    betInput.value = currentBet;
}

function updateBalanceDisplay() {
    balanceVal.innerText = balance.toLocaleString('en-US', {minimumFractionDigits: 2});
}

function handleAction() {
    currentBet = parseFloat(betInput.value) || 100;

    if (gameState === 'IDLE' || gameState === 'COUNTDOWN') {
        if (balance < currentBet) {
            alert("Not enough balance!");
            return;
        }
        balance -= currentBet;
        updateBalanceDisplay();
        hasPlacedBet = true;
        actionBtn.innerText = "Cancel";
        actionBtn.style.background = "#e11d48";
        
        if (gameState === 'IDLE') {
            startCountdown();
        }
    } else if (gameState === 'RUNNING' && hasPlacedBet && !hasCashedOut) {
        hasCashedOut = true;
        let winnings = currentBet * currentMultiplier;
        balance += winnings;
        updateBalanceDisplay();
        statusText.innerText = `Cashed out KES ${winnings.toFixed(2)}`;
        actionBtn.innerText = `Won ${winnings.toFixed(0)}`;
        actionBtn.className = "main-action-btn btn-disabled";
    }
}

function startCountdown() {
    gameState = 'COUNTDOWN';
    countdownTimer = 3;
    statusText.innerText = `Next round in ${countdownTimer}s`;
    
    let countInterval = setInterval(() => {
        countdownTimer--;
        if (countdownTimer > 0) {
            statusText.innerText = `Next round in ${countdownTimer}s`;
        } else {
            clearInterval(countInterval);
            launchGame();
        }
    }, 1000);
}

function generateCrashPoint() {
    let r = Math.random();
    if (r < 0.05) return 1.00;
    return parseFloat((Math.max(1.01, 0.99 / (1 - Math.random() * 0.97))).toFixed(2));
}

function launchGame() {
    gameState = 'RUNNING';
    currentMultiplier = 1.00;
    crashPoint = generateCrashPoint();
    hasCashedOut = false;

    if (hasPlacedBet) {
        actionBtn.innerText = "Cash Out";
        actionBtn.className = "main-action-btn btn-cashout";
        actionBtn.style.display = "block";
    } else {
        actionBtn.innerText = "Playing...";
        actionBtn.className = "main-action-btn btn-disabled";
    }

    statusText.innerText = "Fly away!";
    multiplierText.style.color = "#ffffff";

    let startTime = Date.now();
    
    gameInterval = setInterval(() => {
        let elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = parseFloat((Math.exp(0.08 * elapsed)).toFixed(2));

        if (currentMultiplier >= crashPoint) {
            currentMultiplier = crashPoint;
            endGame();
        }

        multiplierText.innerText = currentMultiplier.toFixed(2) + 'x';
        drawScene(elapsed);
    }, 40);
}

function endGame() {
    clearInterval(gameInterval);
    gameState = 'CRASHED';
    multiplierText.innerText = crashPoint.toFixed(2) + 'x';
    multiplierText.style.color = "#e11d48";
    statusText.innerText = "Flew Away!";

    if (hasPlacedBet && !hasCashedOut) {
        actionBtn.innerText = "Lost";
        actionBtn.className = "main-action-btn btn-disabled";
    }

    addHistoryBadge(crashPoint);

    setTimeout(() => {
        resetForNextRound();
    }, 3000);
}

function resetForNextRound() {
    gameState = 'IDLE';
    hasPlacedBet = false;
    hasCashedOut = false;
    actionBtn.innerText = "Bet";
    actionBtn.className = "main-action-btn btn-bet";
    multiplierText.style.color = "#ffffff";
    multiplierText.innerText = "1.00x";
    statusText.innerText = "Waiting for next round...";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function addHistoryBadge(mult) {
    const bar = document.getElementById('history-bar');
    const badge = document.createElement('div');
    badge.className = "hist-badge " + (mult < 2 ? "hist-low" : mult < 10 ? "hist-mid" : "hist-high");
    badge.innerText = mult.toFixed(2) + 'x';
    bar.prepend(badge);
    if(bar.children.length > 8) bar.lastChild.remove();
}

function drawScene(progress) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (gameState !== 'RUNNING') return;

    let w = canvas.width;
    let h = canvas.height;

    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * Math.min(1, progress / 10), h * Math.max(0.1, h - (progress * 20)));
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 4;
    ctx.stroke();

    let currentX = w * Math.min(0.8, progress / 10);
    let currentY = Math.max(40, h - (progress * 25));

    ctx.beginPath();
    ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#e11d48';
    ctx.fill();
    ctx.shadowBlur = 0;
}

