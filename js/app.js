// ============================================================
// MAIN APP — orchestrates all modules
// ============================================================

import { W, H, drawTrack } from './track.js';
import { drawHorses } from './horses.js';
import { initHorses, raceTick, lerpHorses, resetHorseState, TQ } from './race-engine.js';
import { announce, checkAnnouncements, addLog, addFeed, updStandings, updPerf, updBetting, spawnConfetti, resetUI } from './ui.js';
import { initAuth, signInWithGoogle, signInWithEmail, registerWithEmail, signOut, onAuthStateChanged, getCurrentUser, getUserBalance, isFirebaseReady } from './auth.js';
import { createEvent, placeBet, lockBets, resolveEvent, subscribeToPool } from './betting.js';
import { drawQRCode } from './qr.js';

// State
let horses = initHorses();
let running = false;
let finished = false;
let raceStart = 0;
let elapsed = 0;
let SPEED = 1;
let finishOrder = 0;
let lastFrame = 0;

// Betting state
let currentEventId = null;
let poolUnsub = null;
let livePools = {};
let isRegisterMode = false;

// Canvas
const canvas = document.getElementById('tc');
const ctx = canvas.getContext('2d');

// ---- AUTH UI ----

let authUser = null;

onAuthStateChanged(async (user) => {
  authUser = user;
  const signInBtn = document.getElementById('signInBtn');
  const userPill = document.getElementById('userPill');
  const setupBetBtn = document.getElementById('setupBetBtn');

  if (user) {
    signInBtn.style.display = 'none';
    userPill.style.display = 'flex';
    document.getElementById('userName').textContent = user.displayName || user.email || 'User';
    const avatar = document.getElementById('userAvatar');
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="">`;
    } else {
      avatar.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
    }
    // Load balance
    const balance = await getUserBalance(user.uid);
    document.getElementById('userBal').textContent = balance;
    setupBetBtn.style.display = 'inline-block';
    hideAuthModal();
  } else {
    signInBtn.style.display = 'inline-block';
    userPill.style.display = 'none';
    setupBetBtn.style.display = 'none';
  }
});

window.showAuthModal = function() {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authError').style.display = 'none';
  isRegisterMode = false;
  updateAuthMode();
};

window.hideAuthModal = function() {
  document.getElementById('authModal').style.display = 'none';
};

window.toggleAuthMode = function(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  updateAuthMode();
};

function updateAuthMode() {
  document.getElementById('nameRow').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('modalTitle').textContent = isRegisterMode ? 'Register' : 'Sign In';
  document.getElementById('authSubmitBtn').textContent = isRegisterMode ? 'Create Account' : 'Sign In';
  document.getElementById('toggleText').textContent = isRegisterMode ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('toggleLink').textContent = isRegisterMode ? 'Sign In' : 'Register';
  document.getElementById('authError').style.display = 'none';
}

window.doGoogleSignIn = async function() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showAuthError(err.message);
  }
};

window.doEmailAuth = async function(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPass').value;
  try {
    if (isRegisterMode) {
      const name = document.getElementById('authName').value;
      await registerWithEmail(email, password, name);
    } else {
      await signInWithEmail(email, password);
    }
  } catch (err) {
    showAuthError(err.message);
  }
  return false;
};

window.doSignOut = async function() {
  await signOut();
  currentEventId = null;
  if (poolUnsub) { poolUnsub(); poolUnsub = null; }
  livePools = {};
  document.getElementById('betControls').style.display = 'none';
};

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

// ---- BETTING UI ----

window.setupBetting = async function() {
  if (!authUser) return showAuthModal();
  if (running) return; // Can't setup during race

  try {
    currentEventId = await createEvent();
    if (!currentEventId) {
      // Firebase not configured — show demo message
      document.getElementById('betStatus').textContent = 'Demo mode — Firebase not configured';
      return;
    }
    showBetControls();

    // Subscribe to real-time pool updates
    poolUnsub = subscribeToPool(currentEventId, (data) => {
      livePools = data.pools;
    });
  } catch (err) {
    console.error('Setup betting failed:', err);
  }
};

function showBetControls() {
  const controls = document.getElementById('betControls');
  controls.style.display = 'block';
  document.getElementById('setupBetBtn').style.display = 'none';

  let html = '';
  horses.forEach(h => {
    html += `<div class="bet-input-card">
      <input type="number" id="betAmt${h.id}" min="1" placeholder="0" style="border-color:${h.color}40">
      <button class="bet-place-btn" onclick="doBet(${h.id})">BET</button>
    </div>`;
  });
  document.getElementById('betInputRow').innerHTML = html;
  document.getElementById('betStatus').textContent = 'Place your bets!';
}

window.doBet = async function(horseId) {
  if (!currentEventId || !authUser) return;
  const input = document.getElementById('betAmt' + horseId);
  const amount = parseInt(input.value);
  if (!amount || amount < 1) return;

  try {
    const success = await placeBet(currentEventId, horseId, amount);
    if (success) {
      input.value = '';
      const balance = await getUserBalance(authUser.uid);
      document.getElementById('userBal').textContent = balance;
      document.getElementById('betStatus').textContent = `Bet ${amount} on ${horses[horseId].name}!`;
    } else {
      document.getElementById('betStatus').textContent = 'Bet failed — check balance';
    }
  } catch (err) {
    document.getElementById('betStatus').textContent = 'Error: ' + err.message;
  }
};

// ---- DRAWING ----

function drawScene() {
  ctx.clearRect(0, 0, W, H);

  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  bgGrad.addColorStop(0, '#0c1020');
  bgGrad.addColorStop(1, '#050810');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawTrack(ctx, elapsed, running);
  drawHorses(ctx, horses, running);

  // Vignette
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);
}

// ---- RACE EVENTS ----

function handleRaceEvents(events) {
  events.forEach(ev => {
    if (ev.type === 'answer') {
      addLog(ev.horseId, ev.qNum, ev.subject, ev.correct);
    } else if (ev.type === 'finish') {
      onFinish(horses[ev.horseId]);
    }
  });
}

let winnerId = null;

function onFinish(h) {
  finishOrder++;
  const place = finishOrder;
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : 'rd';
  const acc = Math.round((h.correct / h.currentQ) * 100);
  const icon = place === 1 ? '🏆' : place === 2 ? '🥈' : '🥉';

  h.finishTime = Date.now();
  h.finishElapsed = elapsed;
  h.progress = 1;

  if (place === 1) {
    winnerId = h.id;
    spawnConfetti();
  }

  announce(icon, `<b>${h.name}</b> finishes ${place}${suffix}! Accuracy: ${acc}%, Penalty: ${(h.totalPenaltyTime / 1000).toFixed(1)}s`, 5000);
  addFeed(`${icon} <b>${h.name}</b> — ${place}${suffix} place (${acc}% acc)`, elapsed);

  const allDone = horses.every(hh => hh.finishTime > 0);
  if (allDone) {
    running = false;
    document.getElementById('stb').textContent = '● RACE COMPLETE';
    document.getElementById('stb').className = 'sts g';
    document.getElementById('liveBdg').style.display = 'none';
    announce('🎙️', 'What a race! All models have crossed the finish line!', 6000);

    // Resolve betting
    if (currentEventId && winnerId !== null) {
      resolveEvent(currentEventId, winnerId).then(async (payouts) => {
        if (payouts && authUser) {
          const balance = await getUserBalance(authUser.uid);
          document.getElementById('userBal').textContent = balance;
          document.getElementById('betStatus').textContent = 'Race over! Payouts distributed.';
        }
      });
    }
  }
}

// ---- MAIN LOOP ----

function frame(ts) {
  const dt = Math.min((ts - lastFrame) / 1000, 0.08);
  lastFrame = ts;

  if (running) {
    elapsed = (Date.now() - raceStart) / 1000;
    const dtMs = dt * 1000 * SPEED;
    const events = raceTick(horses, dtMs);
    handleRaceEvents(events);
  }

  lerpHorses(horses, dt);
  drawScene();

  // Throttled UI updates (~5 times/sec)
  if (Math.floor(ts / 200) !== Math.floor((ts - 16) / 200)) {
    updStandings(horses);
    updPerf(horses);
    updBetting(horses);
    if (running) checkAnnouncements(horses, elapsed);
  }

  // Periodic commentary
  if (running && Math.random() < 0.003 * SPEED) {
    const rh = horses[Math.floor(Math.random() * horses.length)];
    if (rh.currentQ > 0 && !rh.finishTime) {
      const acc = Math.round((rh.correct / rh.currentQ) * 100);
      addFeed(`${rh.emoji} <b>${rh.name}</b> at Q${rh.currentQ} — ${acc}% accuracy`, elapsed);
    }
  }

  requestAnimationFrame(frame);
}

// ---- CONTROLS ----

window.startRace = async function() {
  if (running) return;
  running = true;
  finished = false;
  finishOrder = 0;
  winnerId = null;
  raceStart = Date.now();
  document.getElementById('goBtn').disabled = true;
  document.getElementById('stb').textContent = '● LIVE';
  document.getElementById('stb').className = 'sts r';
  document.getElementById('liveBdg').style.display = 'inline';

  // Lock bets
  if (currentEventId) {
    await lockBets(currentEventId);
    document.getElementById('betStatus').textContent = 'BETS LOCKED';
    const inputs = document.querySelectorAll('[id^="betAmt"]');
    inputs.forEach(i => i.disabled = true);
    const btns = document.querySelectorAll('.bet-place-btn');
    btns.forEach(b => b.disabled = true);
  }

  horses.forEach(h => {
    const el = document.getElementById('log' + h.id);
    el.innerHTML = '';
    el.innerHTML += `<div><span style="color:${h.color}">$ mmlu-pro run --model=${h.name.toLowerCase().replace(/ /g, '-')} --hard --n=${TQ}</span></div>`;
    el.innerHTML += '<div class="tdim">Loading weights... ✓</div>';
    el.innerHTML += `<div class="tdim">Starting MMLU-Pro Hard (${TQ} questions, 10-choice)...</div>`;
  });

  addFeed('🏁 <b>Race started!</b> 300 MMLU-Pro Hard questions.', elapsed);
  announce('🎙️', 'Welcome to the LLM Derby! 300 MMLU-Pro Hard questions — let\'s race!', 5000);
  setTimeout(() => {
    announce('📋', 'MMLU-Pro Hard: 10-choice multi-step reasoning. Wrong answers cost time!', 4000);
  }, 2000);
};

window.resetRace = function() {
  running = false;
  finished = false;
  finishOrder = 0;
  winnerId = null;
  elapsed = 0;
  SPEED = 1;
  currentEventId = null;
  if (poolUnsub) { poolUnsub(); poolUnsub = null; }
  livePools = {};

  document.getElementById('goBtn').disabled = false;
  document.getElementById('stb').textContent = 'AWAITING START';
  document.getElementById('stb').className = 'sts';
  document.getElementById('liveBdg').style.display = 'none';

  // Reset speed buttons
  document.querySelectorAll('.spdb').forEach((b, i) => {
    b.classList.toggle('ac', i === 0);
  });

  // Reset betting UI
  document.getElementById('betControls').style.display = 'none';
  if (authUser) {
    document.getElementById('setupBetBtn').style.display = 'inline-block';
  }

  horses.forEach(h => resetHorseState(h));
  resetUI(horses);
  updStandings(horses);
  updPerf(horses);
  updBetting(horses);
};

window.setSpd = function(s, btn) {
  SPEED = s;
  document.querySelectorAll('.spdb').forEach(b => b.classList.remove('ac'));
  btn.classList.add('ac');
};

// ---- INIT ----
initAuth();
updStandings(horses);
updPerf(horses);
updBetting(horses);
horses.forEach(h => {
  document.getElementById('log' + h.id).innerHTML = '<div class="tdim">Ready.</div>';
});

// Draw QR code (will update URL when deployed)
drawQRCode('qrCanvas', window.location.href);

lastFrame = performance.now();
requestAnimationFrame(frame);
