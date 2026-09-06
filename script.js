// ==========================================
// SUPABASE BACKEND INTEGRATION
// ==========================================
const SUPABASE_URL = 'https://yjzkcqbbhusqcyhgrbke.supabase.co';
const SUPABASE_KEY = 'sb_publishable_owBdQVbMJ6SvVpjm-JE0ig_OqHeMFdQ';

// Initialize Supabase Client safely
let supabaseClient = null;
if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn('Supabase SDK not loaded in HTML yet.');
}

// Function to save bet data and account balance to Supabase
async function recordBet(phone, betAmount, multiplier, winAmount, balanceAfter) {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('bets')
        .insert([
            {
                phone: phone || 'Anonymous',
                bet_amount: betAmount,
                multiplier: multiplier,
                win_amount: winAmount,
                balance_after: balanceAfter
            }
        ]);

    if (error) {
        console.error('Error saving bet to Supabase:', error.message);
    } else {
        console.log('Bet successfully recorded in Supabase:', data);
    }
}

// ==========================================
// SOUND TOGGLE CONTROLLER
// ==========================================
let isMuted = false;

function toggleSound() {
    isMuted = !isMuted;
    const soundIcon = document.getElementById('soundIcon');
    if (soundIcon) {
        soundIcon.textContent = isMuted ? '🔇' : '🔊';
    }

    if (isMuted) {
        stopEngineSound(false);
    } else if (gameState === 'FLYING') {
        startEngineSound();
    }
}

// ==========================================
// TOTO AVIATOR CORE ENGINE & STATE MANAGEMENT
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initStars();
}
window.addEventListener('resize', resizeCanvas);

// Global State
let balance = 0.00;
let gameState = 'WAITING'; // 'WAITING', 'FLYING', 'CRASHED'
let currentMultiplier = 1.00;
let crashTarget = 1.00;
let stars = [];
let planePos = { x: 0, y: 0 };
let progress = 0;
let selectedPaymentMethod = null;

let bets = {
    1: { amount: 10.00, placed: false, cashedOut: false },
    2: { amount: 10.00, placed: false, cashedOut: false }
};

// UI Elements
const multiplierText = document.getElementById('multiplier-text');
const waitingBadge = document.getElementById('waiting-badge');
const balanceVal = document.getElementById('balance-val');
const statsList = document.getElementById('stats-list');
const totalBetsCount = document.getElementById('total-bets-count');

// ==========================================
// AUDIO SYNTHESIZER ENGINE (Web Audio API)
// ==========================================
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
}

function startEngineSound() {
    if (isMuted) return;
    initAudio();

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    if (engineOsc) stopEngineSound();

    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
    engineGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

function updateEnginePitch(mult) {
    if (isMuted || !engineOsc || !audioCtx) return;
    const freq = Math.min(60 + (mult * 45), 800);
    engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
}

function stopEngineSound(isCrash = false) {
    if (engineOsc) {
        engineOsc.stop();
        engineOsc.disconnect();
        engineOsc = null;
    }
    if (isCrash && !isMuted && audioCtx) {
        const crashOsc = audioCtx.createOscillator();
        const crashGain = audioCtx.createGain();
        crashOsc.type = 'square';
        crashOsc.frequency.setValueAtTime(120, audioCtx.currentTime);
        crashOsc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.4);
        
        crashGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        crashGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

        crashOsc.connect(crashGain);
        crashGain.connect(audioCtx.destination);
        crashOsc.start();
        crashOsc.stop(audioCtx.currentTime + 0.4);
    }
}

// ==========================================
// CANVAS & FLIGHT ANIMATION LOOP
// ==========================================
function initStars() {
    if (!canvas) return;
    stars = [];
    for (let i = 0; i < 40; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 1,
            speed: Math.random() * 1.5 + 0.5
        });
    }
}

function startContinuousEngine() {
    resizeCanvas();
    runGameRound();
    requestAnimationFrame(renderFrame);
}

function runGameRound() {
    gameState = 'WAITING';
    currentMultiplier = 1.00;
    progress = 0;
    
    if (waitingBadge) {
        waitingBadge.innerText = 'WAITING FOR NEXT ROUND';
        waitingBadge.style.display = 'block';
    }
    if (multiplierText) {
        multiplierText.innerText = '1.00x';
        multiplierText.style.color = '#ffffff';
    }

    // Reset bet panel buttons for next round
    for (let id of [1, 2]) {
        let b = bets[id];
        let btn = document.getElementById(`action-btn-${id}`);
        if (b.placed && !b.cashedOut) {
            // Bet stays queued from waiting period
            btn.innerHTML = `CANCEL<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
            btn.style.background = "#d81b36";
        } else {
            b.placed = false;
            b.cashedOut = false;
            if (btn) {
                btn.innerHTML = `BET<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
                btn.style.background = "";
                btn.className = "main-action-btn btn-bet";
            }
        }
    }

    // Set deterministic crash multiplier for round
    const rand = Math.random();
    crashTarget = rand < 0.1 ? 1.00 : parseFloat((1.01 + Math.pow(rand, 3) * 15).toFixed(2));

    // Wait 4 seconds then launch flight
    setTimeout(() => {
        if (waitingBadge) waitingBadge.style.display = 'none';
        gameState = 'FLYING';
        startEngineSound();

        // Switch active placed bet buttons to CASHOUT
        for (let id of [1, 2]) {
            if (bets[id].placed) {
                bets[id].cashedOut = false;
                let btn = document.getElementById(`action-btn-${id}`);
                if (btn) {
                    btn.className = "main-action-btn btn-cashout";
                    btn.style.background = "#f39c12";
                }
            }
        }
    }, 4000);
}

function renderFrame() {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid rendering
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Move & render stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    stars.forEach(star => {
        if (gameState === 'FLYING') {
            star.x -= star.speed * (currentMultiplier * 0.5);
            star.y += star.speed * 0.2;
            if (star.x < 0) star.x = canvas.width;
            if (star.y > canvas.height) star.y = 0;
        }
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Active flight trajectory rendering
    if (gameState === 'FLYING') {
        progress += 0.005;
        currentMultiplier = parseFloat((currentMultiplier + 0.01 * (1 + progress * 2)).toFixed(2));
        
        updateEnginePitch(currentMultiplier);

        if (multiplierText) multiplierText.innerText = `${currentMultiplier.toFixed(2)}x`;

        // Update real-time button cashout values
        for (let id of [1, 2]) {
            if (bets[id].placed && !bets[id].cashedOut) {
                let btn = document.getElementById(`action-btn-${id}`);
                if (btn) {
                    let liveWin = (bets[id].amount * currentMultiplier).toFixed(2);
                    btn.innerHTML = `CASH OUT<br><span class="btn-sub-amt">${liveWin} KES</span>`;
                }
            }
        }

        const startX = 20;
        const startY = canvas.height - 20;
        planePos.x = Math.min(startX + (canvas.width - 100) * (progress * 0.8), canvas.width - 60);
        planePos.y = Math.max(startY - (canvas.height - 80) * Math.pow(progress * 0.8, 0.7), 60);

        // Flight line curve
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(planePos.x * 0.3, startY, planePos.x, planePos.y);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#e74c3c';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Jet Marker
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(planePos.x, planePos.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Check crash state
        if (currentMultiplier >= crashTarget) {
            gameState = 'CRASHED';
            stopEngineSound(true);

            if (multiplierText) {
                multiplierText.innerText = `FLEW AWAY @ ${currentMultiplier.toFixed(2)}x`;
                multiplierText.style.color = '#e74c3c';
            }

            // Disable uncashed bets and log loss with updated balance to Supabase
            for (let id of [1, 2]) {
                if (bets[id].placed && !bets[id].cashedOut) {
                    let btn = document.getElementById(`action-btn-${id}`);
                    if (btn) {
                        btn.innerHTML = `FLEW AWAY<br><span class="btn-sub-amt">0.00 KES</span>`;
                        btn.className = "main-action-btn btn-disabled";
                        btn.style.background = "#7f8c8d";
                    }
                    // Save lost bet along with current balance to Supabase
                    recordBet('Player', bets[id].amount, currentMultiplier, 0.00, balance);
                }
            }

            addHistoryBadge(currentMultiplier);
            setTimeout(runGameRound, 3000);
        }
    }

    requestAnimationFrame(renderFrame);
}

function addHistoryBadge(mult) {
    const historyBar = document.getElementById('history-bar');
    if (!historyBar) return;

    const badge = document.createElement('div');
    badge.className = `hist-badge ${mult >= 10 ? 'hist-high' : mult >= 2 ? 'hist-mid' : 'hist-low'}`;
    badge.innerText = `${mult.toFixed(2)}x`;

    historyBar.insertBefore(badge, historyBar.firstChild);
    if (historyBar.children.length > 10) {
        historyBar.removeChild(historyBar.lastChild);
    }
}

// ==========================================
// PLAYER BETTING LOGIC
// ==========================================
function setBet(panelId, amount) {
    if (gameState === 'FLYING') return;
    bets[panelId].amount = amount;
    const input = document.getElementById(`bet-amount-${panelId}`);
    const sub = document.getElementById(`sub-${panelId}`);
    if (input) input.value = amount.toFixed(2);
    if (sub) sub.innerText = `${amount.toFixed(2)} KES`;
}

function adjustBet(panelId, delta) {
    if (gameState === 'FLYING') return;
    let input = document.getElementById(`bet-amount-${panelId}`);
    if (!input) return;
    let val = Math.max(10, parseFloat(input.value) + delta);
    bets[panelId].amount = val;
    input.value = val.toFixed(2);
    const sub = document.getElementById(`sub-${panelId}`);
    if (sub) sub.innerText = `${val.toFixed(2)} KES`;
}

function handleAction(panelId) {
    initAudio();
    let b = bets[panelId];
    let inputElem = document.getElementById(`bet-amount-${panelId}`);
    let inputVal = inputElem ? parseFloat(inputElem.value) || 10.00 : 10.00;
    b.amount = inputVal;
    let btn = document.getElementById(`action-btn-${panelId}`);

    if (gameState === 'WAITING') {
        if (!b.placed) {
            if (balance < b.amount) {
                alert('Insufficient balance. Please deposit funds.');
                return;
            }
            balance -= b.amount;
            if (balanceVal) balanceVal.innerText = balance.toFixed(2);
            
            b.placed = true;
            if (btn) {
                btn.innerHTML = `CANCEL<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
                btn.style.background = "#d81b36";
            }
        } else {
            balance += b.amount;
            if (balanceVal) balanceVal.innerText = balance.toFixed(2);
            
            b.placed = false;
            if (btn) {
                btn.innerHTML = `BET<br><span class="btn-sub-amt">${b.amount.toFixed(2)} KES</span>`;
                btn.style.background = "";
                btn.className = "main-action-btn btn-bet";
            }
        }
    } else if (gameState === 'FLYING' && b.placed && !b.cashedOut) {
        b.cashedOut = true;
        let winnings = b.amount * currentMultiplier;
        balance += winnings;
        if (balanceVal) balanceVal.innerText = balance.toFixed(2);
        
        if (btn) {
            btn.innerHTML = `WON<br><span class="btn-sub-amt">${winnings.toFixed(2)} KES</span>`;
            btn.className = "main-action-btn btn-disabled";
            btn.style.background = "#2ecc71";
        }

        // Save winning cashout along with updated balance to Supabase
        recordBet('Player', b.amount, currentMultiplier, winnings, balance);
    }
}

// ==========================================
// REALTIME LIVE STATS FEED
// ==========================================
const mockUsers = ['2***3', '2***6', '2***2', '2***8', '2***1', '2***9', '2***5'];
let liveBetsCount = 2965;

function generateInitialStats() {
    if (!statsList) return;
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

setInterval(() => {
    if (statsList && Math.random() > 0.3) {
        liveBetsCount += Math.floor(Math.random() * 3) + 1;
        if (totalBetsCount) totalBetsCount.innerText = liveBetsCount;

        let user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
        let bet = (Math.floor(Math.random() * 15) + 1) * 100;
        let isWin = gameState === 'FLYING' && Math.random() > 0.5;
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

// ==========================================
// MODAL & DRAWER NAVIGATION LOGIC
// ==========================================
function toggleDepositModal() {
    const modal = document.getElementById('depositModal');
    if (!modal) return;
    modal.classList.toggle('open');
    if (!modal.classList.contains('open')) {
        resetDepositModal();
    }
}

function openPaymentForm(method) {
    selectedPaymentMethod = method;
    const title = document.getElementById('modal-title');
    if (title) title.innerText = `${method} Deposit`;
    
    const selView = document.getElementById('payment-selection-view');
    if (selView) selView.style.display = 'none';
    
    const formView = document.getElementById('payment-form-view');
    const inputsContainer = document.getElementById('payment-inputs');
    if (formView) formView.style.display = 'flex';

    if (inputsContainer) {
        if (method === 'M-Pesa' || method === 'Airtel Money') {
            inputsContainer.innerHTML = `
                <label style="font-size:0.8rem; color:#bdc3c7;">Phone Number</label>
                <input type="text" id="deposit-phone" placeholder="07XXXXXXXX or 01XXXXXXXX" style="width:100%; padding:8px; background:#07090d; border:1px solid #222b38; color:#fff; border-radius:6px; margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#bdc3c7;">Amount (KES)</label>
                <input type="number" id="deposit-amount" placeholder="Min 10 KES" style="width:100%; padding:8px; background:#07090d; border:1px solid #222b38; color:#fff; border-radius:6px;">
            `;
        } else if (method === 'Crypto') {
            inputsContainer.innerHTML = `
                <label style="font-size:0.8rem; color:#bdc3c7;">Network</label>
                <select id="crypto-network" style="width:100%; padding:8px; background:#07090d; border:1px solid #222b38; color:#fff; border-radius:6px; margin-bottom:8px;">
                    <option value="USDT_TRC20">USDT (TRC20)</option>
                    <option value="BTC">Bitcoin (BTC)</option>
                    <option value="ETH">Ethereum (ERC20)</option>
                </select>
                <label style="font-size:0.8rem; color:#bdc3c7;">Amount (USD)</label>
                <input type="number" id="deposit-amount" placeholder="Min $1" style="width:100%; padding:8px; background:#07090d; border:1px solid #222b38; color:#fff; border-radius:6px;">
            `;
        }
    }
}

function processDeposit() {
    const amountElem = document.getElementById('deposit-amount');
    const amount = amountElem ? parseFloat(amountElem.value) : 0;
    
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    if (selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'Airtel Money') {
        const phoneElem = document.getElementById('deposit-phone');
        const phone = phoneElem ? phoneElem.value : '';
        if (!phone) {
            alert('Please enter a valid phone number.');
            return;
        }
        
        balance += amount;
        if (balanceVal) balanceVal.innerText = balance.toFixed(2);
        alert(`STK Push prompt sent to ${phone}. Balance updated by ${amount} KES.`);
    } else if (selectedPaymentMethod === 'Crypto') {
        const networkElem = document.getElementById('crypto-network');
        const network = networkElem ? networkElem.value : 'Crypto';
        const kesEquivalent = amount * 130;
        balance += kesEquivalent;
        if (balanceVal) balanceVal.innerText = balance.toFixed(2);
        alert(`Crypto deposit initiated for ${amount} USD on ${network}. Balance credited.`);
    }

    toggleDepositModal();
}

function resetDepositModal() {
    selectedPaymentMethod = null;
    const title = document.getElementById('modal-title');
    const selView = document.getElementById('payment-selection-view');
    const formView = document.getElementById('payment-form-view');
    
    if (title) title.innerText = 'Select Deposit Method';
    if (selView) selView.style.display = 'flex';
    if (formView) formView.style.display = 'none';
}

function toggleMenu() {
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    if (sideMenu) sideMenu.classList.toggle('open');
    if (menuOverlay) menuOverlay.classList.toggle('open');
}

function switchBetTab(panelId, tab) {
    let panel = document.getElementById(`panel-${panelId}`);
    if (!panel) return;
    panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
}

function switchStatsTab(tabName) {
    document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
}

// Start continuous loop engine on window load
window.addEventListener('load', startContinuousEngine);
