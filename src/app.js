// ============================================================
// APP — thin orchestrator
// Wires modules together. State lives here, logic lives elsewhere.
// ============================================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, TOTAL_QUESTIONS, DT_CAP_SECONDS, UI_UPDATE_INTERVAL_MS, COMMENTARY_CHANCE, SPEED_OPTIONS, PALETTE } from './core/config.js';
import { initHorses, raceTick, lerpHorses, resetHorseState } from './core/race-engine.js';
import { BENCHMARK_DATA } from './data/benchmark.js';
import { W, H, drawTrack } from './render/track.js';
import { drawHorses } from './render/horses.js';
import {
  announce,
  checkAnnouncements,
  addTerminalLog,
  addCommentaryEntry,
  updateStandings,
  updatePerformance,
  updateBettingOdds,
  launchConfetti,
  resetUI,
} from './render/ui.js';
import { initAuth, signInWithGoogle, signInWithEmail, registerWithEmail, signOut, onAuthStateChanged, getCurrentUser, getUserBalance } from './services/auth.js';
import { createEvent, placeBet, lockBets, resolveEvent, subscribeToPool } from './services/betting.js';
import { drawQRCode } from './render/qr.js';

// ---- APPLICATION STATE ----
// Single object. No module-level lets scattered across files.

const state = {
  horses: initHorses(BENCHMARK_DATA),
  running: false,
  finished: false,
  raceStart: 0,
  elapsed: 0,
  speed: 1,
  finishOrder: 0,
  winnerId: null,
  lastFrame: 0,

  // Betting
  currentEventId: null,
  poolUnsub: null,
  livePools: {},

  // Auth
  authUser: null,
  isRegisterMode: false,
};

// ---- CANVAS ----

const canvas = document.getElementById('track-canvas');
const ctx = canvas.getContext('2d');

// ---- DOM HELPERS ----

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = getElement(id);
  if (el) el.textContent = text;
}

function setDisplay(id, value) {
  const el = getElement(id);
  if (el) el.style.display = value;
}

// ---- AUTH UI ----

onAuthStateChanged(async (user) => {
  state.authUser = user;

  if (user) {
    setDisplay('sign-in-btn', 'none');
    setDisplay('user-pill', 'flex');
    setText('user-name', user.displayName || user.email || 'User');

    const avatar = getElement('user-avatar');
    if (avatar) {
      if (user.photoURL) {
        avatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = user.photoURL;
        img.alt = '';
        avatar.appendChild(img);
      } else {
        avatar.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
      }
    }

    try {
      const balance = await getUserBalance(user.uid);
      setText('user-balance', balance);
    } catch (err) {
      console.error('Failed to load balance:', err);
      setText('user-balance', '?');
    }
    setDisplay('setup-bet-btn', 'inline-block');
    hideAuthModal();
  } else {
    setDisplay('sign-in-btn', 'inline-block');
    setDisplay('user-pill', 'none');
    setDisplay('setup-bet-btn', 'none');
  }
});

function showAuthModal() {
  setDisplay('auth-modal', 'flex');
  setDisplay('auth-error', 'none');
  state.isRegisterMode = false;
  updateAuthMode();
}

function hideAuthModal() {
  setDisplay('auth-modal', 'none');
}

function toggleAuthMode(e) {
  e.preventDefault();
  state.isRegisterMode = !state.isRegisterMode;
  updateAuthMode();
}

function updateAuthMode() {
  setDisplay('name-row', state.isRegisterMode ? 'block' : 'none');
  setText('modal-title', state.isRegisterMode ? 'Register' : 'Sign In');
  setText('auth-submit-btn', state.isRegisterMode ? 'Create Account' : 'Sign In');
  setText('toggle-text', state.isRegisterMode ? 'Already have an account?' : "Don't have an account?");
  setText('toggle-link', state.isRegisterMode ? 'Sign In' : 'Register');
  setDisplay('auth-error', 'none');
}

async function handleGoogleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleEmailAuth(e) {
  e.preventDefault();
  const email = getElement('auth-email')?.value;
  const password = getElement('auth-pass')?.value;
  try {
    if (state.isRegisterMode) {
      const name = getElement('auth-name')?.value;
      await registerWithEmail(email, password, name);
    } else {
      await signInWithEmail(email, password);
    }
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleSignOut() {
  await signOut();
  state.currentEventId = null;
  if (state.poolUnsub) {
    state.poolUnsub();
    state.poolUnsub = null;
  }
  state.livePools = {};
  setDisplay('bet-controls', 'none');
}

function showAuthError(msg) {
  const el = getElement('auth-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

// ---- BETTING UI ----

async function setupBetting() {
  if (!state.authUser) return showAuthModal();
  if (state.running) return;

  try {
    state.currentEventId = await createEvent();
    if (!state.currentEventId) {
      setText('bet-status', 'Demo mode \u2014 Firebase not configured');
      return;
    }
    showBetControls();

    state.poolUnsub = subscribeToPool(state.currentEventId, (data) => {
      state.livePools = data.pools;
    });
  } catch (err) {
    console.error('Setup betting failed:', err);
    setText('bet-status', 'Error: ' + err.message);
  }
}

function showBetControls() {
  setDisplay('bet-controls', 'block');
  setDisplay('setup-bet-btn', 'none');

  const row = getElement('bet-input-row');
  if (!row) return;
  row.innerHTML = '';

  state.horses.forEach((h) => {
    const card = document.createElement('div');
    card.className = 'bet-input-card';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'bet-amount-' + h.id;
    input.min = '1';
    input.placeholder = '0';
    input.style.borderColor = h.color + '40';

    const btn = document.createElement('button');
    btn.className = 'bet-place-btn';
    btn.textContent = 'BET';
    btn.addEventListener('click', () => handlePlaceBet(h.id));

    card.appendChild(input);
    card.appendChild(btn);
    row.appendChild(card);
  });
  setText('bet-status', 'Place your bets!');
}

async function handlePlaceBet(horseId) {
  const uid = state.authUser?.uid;
  if (!state.currentEventId || !uid) return;

  const input = getElement('bet-amount-' + horseId);
  if (!input) return;
  const amount = parseInt(input.value, 10);
  if (isNaN(amount) || amount < 1) {
    setText('bet-status', 'Enter a valid bet amount');
    return;
  }

  try {
    await placeBet(state.currentEventId, horseId, amount);
    input.value = '';
    const balance = await getUserBalance(uid);
    setText('user-balance', balance);
    setText('bet-status', `Bet ${amount} on ${state.horses[horseId].name}!`);
  } catch (err) {
    setText('bet-status', 'Error: ' + err.message);
  }
}

// ---- DRAWING ----

function drawScene() {
  ctx.clearRect(0, 0, W, H);

  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  bgGrad.addColorStop(0, PALETTE.backgroundLight);
  bgGrad.addColorStop(1, PALETTE.background);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawTrack(ctx, state.elapsed, state.running);
  drawHorses(ctx, state.horses, state.running);

  // Vignette
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);
}

// ---- RACE EVENTS ----

function handleRaceEvents(events) {
  events.forEach((ev) => {
    if (ev.type === 'answer') {
      addTerminalLog(ev.horseId, ev.qNum, ev.subject, ev.correct);
    } else if (ev.type === 'finish') {
      onFinish(state.horses[ev.horseId]);
    }
  });
}

function onFinish(h) {
  state.finishOrder++;
  const place = state.finishOrder;
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : 'rd';
  const acc = Math.round((h.correct / h.currentQ) * 100);
  const icon = place === 1 ? '\u{1F3C6}' : place === 2 ? '\u{1F948}' : '\u{1F949}';

  h.finishTime = Date.now();
  h.finishElapsed = state.elapsed;
  h.progress = 1;

  if (place === 1) {
    state.winnerId = h.id;
    launchConfetti();
  }

  announce(icon, `${h.name} finishes ${place}${suffix}! Accuracy: ${acc}%, Penalty: ${(h.totalPenaltyTime / 1000).toFixed(1)}s`, 5000);
  addCommentaryEntry(`${icon} ${h.name} \u2014 ${place}${suffix} place (${acc}% acc)`, state.elapsed);

  const allDone = state.horses.every((hh) => hh.finishTime > 0);
  if (allDone) {
    state.running = false;
    setText('status-badge', '\u25CF RACE COMPLETE');
    const badge = getElement('status-badge');
    if (badge) badge.className = 'status-badge complete';
    setDisplay('live-badge', 'none');
    announce('\u{1F399}\uFE0F', 'What a race! All models have crossed the finish line!', 6000);

    if (state.currentEventId && state.winnerId !== null) {
      resolveEvent(state.currentEventId, state.winnerId).then(async (payouts) => {
        const uid = state.authUser?.uid;
        if (payouts && uid) {
          try {
            const balance = await getUserBalance(uid);
            setText('user-balance', balance);
            setText('bet-status', 'Race over! Payouts distributed.');
          } catch (_err) {
            setText('bet-status', 'Race over! Check your balance.');
          }
        }
      });
    }
  }
}

// ---- MAIN LOOP ----

function frame(ts) {
  const dt = Math.min((ts - state.lastFrame) / 1000, DT_CAP_SECONDS);
  state.lastFrame = ts;

  if (state.running) {
    state.elapsed = (Date.now() - state.raceStart) / 1000;
    const dtMs = dt * 1000 * state.speed;
    const events = raceTick(state.horses, dtMs);
    handleRaceEvents(events);
  }

  lerpHorses(state.horses, dt);
  drawScene();

  // Throttled UI updates
  if (Math.floor(ts / UI_UPDATE_INTERVAL_MS) !== Math.floor((ts - 16) / UI_UPDATE_INTERVAL_MS)) {
    updateStandings(state.horses);
    updatePerformance(state.horses);
    updateBettingOdds(state.horses);
    if (state.running) checkAnnouncements(state.horses, state.elapsed);
  }

  // Periodic commentary
  if (state.running && Math.random() < COMMENTARY_CHANCE * state.speed) {
    const rh = state.horses[Math.floor(Math.random() * state.horses.length)];
    if (rh.currentQ > 0 && !rh.finishTime) {
      const acc = Math.round((rh.correct / rh.currentQ) * 100);
      addCommentaryEntry(`${rh.emoji} ${rh.name} at Q${rh.currentQ} \u2014 ${acc}% accuracy`, state.elapsed);
    }
  }

  requestAnimationFrame(frame);
}

// ---- CONTROLS ----

async function startRace() {
  if (state.running) return;
  state.running = true;
  state.finished = false;
  state.finishOrder = 0;
  state.winnerId = null;
  state.raceStart = Date.now();

  const goBtn = getElement('start-btn');
  if (goBtn) goBtn.disabled = true;
  setText('status-badge', '\u25CF LIVE');
  const badge = getElement('status-badge');
  if (badge) badge.className = 'status-badge live';
  setDisplay('live-badge', 'inline');

  // Lock bets
  if (state.currentEventId) {
    await lockBets(state.currentEventId);
    setText('bet-status', 'BETS LOCKED');
    document.querySelectorAll('[id^="bet-amount-"]').forEach((i) => (i.disabled = true));
    document.querySelectorAll('.bet-place-btn').forEach((b) => (b.disabled = true));
  }

  state.horses.forEach((h) => {
    const el = getElement('log' + h.id);
    if (!el) return;
    el.innerHTML = '';

    const cmdLine = document.createElement('div');
    const cmdSpan = document.createElement('span');
    cmdSpan.style.color = h.color;
    cmdSpan.textContent = `$ mmlu-pro run --model=${h.name.toLowerCase().replace(/ /g, '-')} --hard --n=${TOTAL_QUESTIONS}`;
    cmdLine.appendChild(cmdSpan);
    el.appendChild(cmdLine);

    const loadLine = document.createElement('div');
    loadLine.className = 'terminal-dim';
    loadLine.textContent = 'Loading weights... \u2713';
    el.appendChild(loadLine);

    const startLine = document.createElement('div');
    startLine.className = 'terminal-dim';
    startLine.textContent = `Starting MMLU-Pro Hard (${TOTAL_QUESTIONS} questions, 10-choice)...`;
    el.appendChild(startLine);
  });

  addCommentaryEntry(`\u{1F3C1} Race started! ${TOTAL_QUESTIONS} MMLU-Pro Hard questions.`, state.elapsed);
  announce('\u{1F399}\uFE0F', `Welcome to the LLM Derby! ${TOTAL_QUESTIONS} MMLU-Pro Hard questions \u2014 let's race!`, 5000);
  setTimeout(() => {
    announce('\u{1F4CB}', `MMLU-Pro Hard: 10-choice multi-step reasoning. Wrong answers cost time!`, 4000);
  }, 2000);
}

function resetRace() {
  state.running = false;
  state.finished = false;
  state.finishOrder = 0;
  state.winnerId = null;
  state.elapsed = 0;
  state.speed = 1;
  state.currentEventId = null;
  if (state.poolUnsub) {
    state.poolUnsub();
    state.poolUnsub = null;
  }
  state.livePools = {};

  const goBtn = getElement('start-btn');
  if (goBtn) goBtn.disabled = false;
  setText('status-badge', 'AWAITING START');
  const badge = getElement('status-badge');
  if (badge) badge.className = 'status-badge';
  setDisplay('live-badge', 'none');

  // Reset speed buttons
  document.querySelectorAll('.speed-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });

  // Reset betting UI
  setDisplay('bet-controls', 'none');
  if (state.authUser) {
    setDisplay('setup-bet-btn', 'inline-block');
  }

  state.horses.forEach((h) => resetHorseState(h));
  resetUI(state.horses);
  updateStandings(state.horses);
  updatePerformance(state.horses);
  updateBettingOdds(state.horses);
}

function setSpeed(spd, btn) {
  state.speed = spd;
  document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
}

// ---- EVENT LISTENERS (no onclick attributes) ----

function bindEvents() {
  getElement('sign-in-btn')?.addEventListener('click', showAuthModal);
  getElement('modal-close')?.addEventListener('click', hideAuthModal);
  getElement('google-signin-btn')?.addEventListener('click', handleGoogleSignIn);
  getElement('auth-form')?.addEventListener('submit', handleEmailAuth);
  getElement('toggle-link')?.addEventListener('click', toggleAuthMode);
  getElement('logout-btn')?.addEventListener('click', handleSignOut);
  getElement('start-btn')?.addEventListener('click', startRace);
  getElement('reset-btn')?.addEventListener('click', resetRace);
  getElement('setup-bet-btn')?.addEventListener('click', setupBetting);

  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    const spd = parseInt(btn.dataset.speed, 10);
    if (!isNaN(spd)) {
      btn.addEventListener('click', () => setSpeed(spd, btn));
    }
  });
}

// ---- INIT ----

bindEvents();
initAuth();
updateStandings(state.horses);
updatePerformance(state.horses);
updateBettingOdds(state.horses);

state.horses.forEach((h) => {
  const el = getElement('log' + h.id);
  if (el) {
    const ready = document.createElement('div');
    ready.className = 'terminal-dim';
    ready.textContent = 'Ready.';
    el.appendChild(ready);
  }
});

drawQRCode('qr-canvas', window.location.href);
state.lastFrame = performance.now();
requestAnimationFrame(frame);
