// ============================================================
// MAIN APP — orchestrates all modules
// ============================================================

import { W, H, drawTrack } from './track.js';
import { drawHorses } from './horses.js';
import { initHorses, raceTick, lerpHorses, resetHorseState, TQ, calcPenalty } from './race-engine.js';
import { announce, checkAnnouncements, addLog, addFeed, updStandings, updPerf, updBetting, spawnConfetti, resetUI, getBetAmount, resetBetAmounts } from './ui.js';
import { initAuth, signInWithGoogle, signInWithEmail, registerWithEmail, signOut, onAuthStateChanged, getCurrentUser, getUserBalance, isFirebaseReady } from './auth.js';
import { createEvent, placeBet, lockBets, resolveEvent, subscribeToPool } from './betting.js';
import { drawQRCode } from './qr.js';
import * as TTS from './tts-service.js';
import * as LLM from './llm-service.js';

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
let userBets = [];       // local cache of user's bets [{horse, amount}]
let betsLocked = false;
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
    try {
      const balance = await getUserBalance(user.uid);
      document.getElementById('userBal').textContent = balance;
      document.getElementById('betBal').textContent = '$' + balance;
    } catch (err) {
      console.error('Failed to load balance:', err);
      document.getElementById('userBal').textContent = '?';
      document.getElementById('betBal').textContent = '$?';
    }
    hideAuthModal();

    // Show betting panel and auto-create event
    document.getElementById('betSignin').style.display = 'none';
    document.getElementById('betGrid').style.display = 'grid';
    if (!currentEventId && !running) {
      await initBettingEvent();
    }
  } else {
    signInBtn.style.display = 'inline-block';
    userPill.style.display = 'none';
    document.getElementById('betSignin').style.display = 'block';
    document.getElementById('betGrid').style.display = 'none';
    document.getElementById('betMy').style.display = 'none';
    document.getElementById('betBal').textContent = '';
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

// ---- INFO MODAL ----

window.showInfoModal = function() {
  document.getElementById('infoModal').style.display = 'flex';
};

window.hideInfoModal = function() {
  document.getElementById('infoModal').style.display = 'none';
};

// Close modals on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'infoModal') window.hideInfoModal();
  if (e.target.id === 'authModal') window.hideAuthModal();
  if (e.target.id === 'ttsInfoPopup') window.toggleTTSInfo();
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const infoModal = document.getElementById('infoModal');
    const authModal = document.getElementById('authModal');
    if (infoModal && infoModal.style.display !== 'none') window.hideInfoModal();
    if (authModal && authModal.style.display !== 'none') window.hideAuthModal();
  }
});

// ---- BETTING UI ----

async function initBettingEvent() {
  try {
    currentEventId = await createEvent();
    if (!currentEventId) {
      document.getElementById('betStatus').textContent = 'Demo mode — no Firebase';
      return;
    }
    userBets = [];
    betsLocked = false;
    document.getElementById('betResult').style.display = 'none';
    document.getElementById('betStatus').textContent = 'Place your bets before the race starts!';
    document.getElementById('betStatus').className = 'bet-status';

    // Subscribe to real-time pool updates
    if (poolUnsub) poolUnsub();
    poolUnsub = subscribeToPool(currentEventId, (data) => {
      livePools = data.pools;
      // Re-render betting UI with new pool data
      updBetting(horses, livePools, { locked: betsLocked, userBets, showInputs: !!authUser });
    });

    // Initial render
    updBetting(horses, livePools, { locked: false, userBets, showInputs: true });
  } catch (err) {
    console.error('Setup betting failed:', err);
    document.getElementById('betStatus').textContent = 'Error: ' + err.message;
  }
}

window.doBet = async function(horseId) {
  if (!currentEventId || !authUser || betsLocked) return;
  const amount = getBetAmount(horseId);
  if (!amount || amount < 5) return;

  try {
    const success = await placeBet(currentEventId, horseId, amount);
    if (success) {
      userBets.push({ horse: horseId, amount });
      const balance = await getUserBalance(authUser.uid);
      document.getElementById('userBal').textContent = balance;
      document.getElementById('betBal').textContent = '$' + balance;
      document.getElementById('betStatus').textContent = `Bet $${amount} on ${horses[horseId].name}!`;
      updBetting(horses, livePools, { locked: false, userBets, showInputs: true });
    } else {
      document.getElementById('betStatus').textContent = 'Bet failed — check balance';
    }
  } catch (err) {
    document.getElementById('betStatus').textContent = 'Error: ' + err.message;
  }
};

// Reset bet handler — removes a placed bet from local state
window._resetBetHandler = function(horseId) {
  const idx = userBets.findIndex(b => b.horse === horseId);
  if (idx !== -1) {
    userBets.splice(idx, 1);
    document.getElementById('betStatus').textContent = 'Bet removed';
    updBetting(horses, livePools, { locked: false, userBets, showInputs: true });
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

// Throttle miss commentary so we don't overwhelm the TTS queue
let lastMissCommentTime = 0;
let lastStreakCommentTime = 0;
let lastTriviaTime = 0;
const MISS_COMMENT_COOLDOWN = 4; // seconds between miss comments
const STREAK_COMMENT_COOLDOWN = 8; // seconds between streak comments
const STREAK_THRESHOLD = 8; // only comment on streaks >= this
const TRIVIA_COOLDOWN = 25; // seconds between trivia questions
const TRIVIA_START_DELAY = 15; // wait this long before first trivia

// Fun trivia questions tied to MMLU-Pro subjects
const TRIVIA_QUESTIONS = [
  // Biology
  "Hey folks, does anyone here know which is the ONLY North American marsupial? That's right, the opossum!",
  "Here's one for you — what animal can survive being frozen SOLID and thaw back to life? The wood frog, ladies and gentlemen!",
  "Fun fact while we wait — an octopus has THREE hearts! No wonder they're so emotional!",
  // Physics
  "Quick trivia — what is the ONLY planet that spins clockwise? Venus! She's always been a little different!",
  "Did you know, light takes over EIGHT minutes to travel from the sun to Earth? These models are a BIT faster than that!",
  "Here's a brain buster — what temperature is the SAME in Fahrenheit and Celsius? Minus forty! Wild!",
  // History
  "History buffs, which war lasted only THIRTY EIGHT minutes? The Anglo-Zanzibar war of 1896! Shorter than this race!",
  "Pop quiz — who was the shortest-serving US president? William Henry Harrison, just 31 days! At least our models last longer!",
  // Math / CS
  "Fun one for the nerds — what is the ONLY even prime number? Two! The loneliest prime!",
  "Did you know the word ALGORITHM comes from a 9th century Persian mathematician? Al-Khwarizmi! Give it up for the OG!",
  // Chemistry
  "Quick one — what is the most ABUNDANT element in the universe? Hydrogen! Simple but mighty!",
  "Here's a fun fact — gold is so malleable you can make a thread TEN MILES long from a single ounce!",
  // Law / Economics
  "Trivia time — which country has the world's OLDEST constitution still in use? The United States, signed 1787!",
  "Did you know honey NEVER spoils? Archaeologists found 3000-year-old honey in Egyptian tombs and it was still good!",
  // Psychology / Philosophy
  "Here's a wild one — the human brain uses about TWENTY percent of the body's total energy! These AI models wish they were that efficient!",
  "Fun fact — the word ROBOT comes from Czech, meaning forced labor! Karel Čapek coined it in 1920!",
  // Medicine
  "Quick trivia — your body has about SIXTY THOUSAND miles of blood vessels! That's enough to wrap around Earth TWICE!",
  "Did you know humans share about SIXTY percent of their DNA with BANANAS? We're all a little fruity!",
];
let triviaIndex = 0;

// Race flavor commentary — position-based, randomized
// Each key is a progress threshold (0-1). Once the leader passes it, one comment fires.
const RACE_FLAVOR = {
  0.05: [
    "And they're OFF! The pack bursts out of the gate!",
    "HERE WE GO! All four horses charging out of the starting line!",
    "The gates are open and they're FLYING off the start!",
    "And AWAY they go! What a start to this race!",
  ],
  0.12: [
    "The pack is coming up on the first turn, jockeying for position!",
    "Heading into turn one, the horses are finding their lanes!",
    "First turn approaching and the field is starting to spread out!",
    "They're rounding the first bend, what a beautiful sight!",
  ],
  0.25: [
    "Quarter of the way through and the pack is HEATING UP!",
    "We're through the first quarter! The models are finding their rhythm!",
    "Twenty five percent done, and we're starting to see who's got the stamina!",
    "A quarter of the race is in the books, and what a race it's been so far!",
  ],
  0.35: [
    "The backstretch now, and the field is starting to separate!",
    "Down the back straight, you can feel the TENSION building!",
    "We're on the backstretch, the crowd is getting restless!",
    "Through the far side of the track, these models are working HARD!",
  ],
  0.50: [
    "HALFWAY there! This is where the race REALLY begins!",
    "We've hit the halfway point and things are getting INTERESTING!",
    "The halfway mark, and the cream is starting to rise to the top!",
    "Fifty percent done! Who's got what it takes to close this out?",
  ],
  0.62: [
    "Into the far turn, and you can see the horses digging DEEP!",
    "Rounding the far turn, the pressure is ON!",
    "The far turn, and every question counts now!",
    "Coming through the final curve, this is championship territory!",
  ],
  0.75: [
    "Three quarters done! The HOME STRETCH is calling!",
    "Seventy five percent complete, and the finish line is in SIGHT!",
    "The final quarter! This is where legends are MADE!",
    "We're in the closing stretch now, it's a SPRINT to the finish!",
  ],
  0.88: [
    "Down the final straight! The crowd is on their FEET!",
    "The home stretch! Can you feel the ENERGY in here?",
    "Final furlongs! Everything they've got, RIGHT NOW!",
    "They can SEE the finish line! Give it EVERYTHING!",
  ],
};
let flavorFired = {};
let lastFlavorTime = 0;
const FLAVOR_COOLDOWN = 8; // min seconds between flavor comments

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Subtitle display
let subtitleTimer = null;

function showSubtitle(text) {
  const el = document.getElementById('subtitle');
  if (!el) return;
  // Strip HTML for subtitle display
  const clean = text.replace(/<[^>]+>/g, '');
  el.textContent = clean;
  el.classList.add('active');
  if (subtitleTimer) clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => {
    el.classList.remove('active');
  }, 6000);
}

// Speak and show subtitle
function speakAndShow(text, feedIcon, feedElapsed) {
  TTS.speak(text);
  showSubtitle(text);
  if (feedIcon && feedElapsed !== undefined) {
    addFeed(`${feedIcon} ${text}`, feedElapsed);
  }
}

async function handleMissCommentary(h, ev) {
  const penaltySec = calcPenalty(h.cumulativeWrongs);

  // Try LLM first, fall back to templates
  if (LLM.isReady()) {
    const llmText = await LLM.generateMiss(h.color, ev.subject, penaltySec, ev.qNum);
    if (llmText) {
      speakAndShow(llmText, '❌', elapsed);
      return;
    }
  }

  // Fallback: template commentary
  const commentary = TTS.generateMissCommentary(h.name, ev.subject, penaltySec, ev.qNum, h.color);
  speakAndShow(commentary, '❌', elapsed);
}

async function handleStreakCommentary(h, ev) {
  // Try LLM first, fall back to templates
  if (LLM.isReady()) {
    const llmText = await LLM.generateStreak(h.color, ev.subject, h.streak);
    if (llmText) {
      speakAndShow(llmText, '🔥', elapsed);
      return;
    }
  }

  // Fallback: template commentary
  const commentary = TTS.generateStreakCommentary(h.name, ev.subject, h.streak, h.color);
  speakAndShow(commentary, '🔥', elapsed);
}

function handleRaceEvents(events) {
  for (const ev of events) {
    if (ev.type === 'answer') {
      addLog(ev.horseId, ev.qNum, ev.subject, ev.correct);

      const h = horses[ev.horseId];

      // Skip commentary for finished horses
      if (h.finishTime) continue;

      // Miss commentary — nearly constant but throttled
      if (!ev.correct && TTS.isReady() && elapsed - lastMissCommentTime > MISS_COMMENT_COOLDOWN) {
        lastMissCommentTime = elapsed;
        handleMissCommentary(h, ev);
      }

      // Streak commentary — celebrate hot streaks
      if (ev.correct && h.streak >= STREAK_THRESHOLD && h.streak % 4 === 0
          && elapsed - lastStreakCommentTime > STREAK_COMMENT_COOLDOWN) {
        lastStreakCommentTime = elapsed;
        handleStreakCommentary(h, ev);
      }

    } else if (ev.type === 'finish') {
      onFinish(horses[ev.horseId]);
    }
  }
}

let winnerId = null;

function onFinish(h) {
  finishOrder++;
  const place = finishOrder;
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  const acc = Math.round((h.correct / h.currentQ) * 100);
  const icon = place === 1 ? '🏆' : place === 2 ? '🥈' : place === 3 ? '🥉' : '4️⃣';

  h.finishTime = Date.now();
  h.finishElapsed = elapsed;
  h.finishPlace = place;
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
    finished = true;
    document.getElementById('stb').textContent = '● RACE COMPLETE';
    document.getElementById('stb').className = 'sts g';
    document.getElementById('liveBdg').style.display = 'none';
    announce('🎙️', 'What a race! All models have crossed the finish line!', 6000);

    // Resolve betting and show results
    if (currentEventId && winnerId !== null) {
      resolveEvent(currentEventId, winnerId).then(async (payouts) => {
        if (authUser) {
          const balance = await getUserBalance(authUser.uid);
          document.getElementById('userBal').textContent = balance;
          document.getElementById('betBal').textContent = '$' + balance;

          // Show payout result
          const resultEl = document.getElementById('betResult');
          const myPayout = payouts ? payouts.find(p => p.uid === authUser.uid) : null;
          const myTotalBet = userBets.reduce((s, b) => s + b.amount, 0);

          if (myTotalBet === 0) {
            resultEl.className = 'bet-result';
            resultEl.textContent = 'No bets placed this race';
          } else if (myPayout && myPayout.payout > myTotalBet) {
            const profit = Math.round(myPayout.payout - myTotalBet);
            resultEl.className = 'bet-result win';
            resultEl.textContent = `🎉 You won $${Math.round(myPayout.payout)}! (+$${profit} profit)`;
          } else if (myPayout) {
            resultEl.className = 'bet-result';
            resultEl.textContent = `Refunded $${Math.round(myPayout.payout)}`;
          } else {
            resultEl.className = 'bet-result lose';
            resultEl.textContent = `Better luck next time! Lost $${myTotalBet}`;
          }
          resultEl.style.display = 'block';
        }
        document.getElementById('betStatus').textContent = 'Race complete — payouts distributed';
        document.getElementById('betStatus').className = 'bet-status';
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
    updBetting(horses, livePools, { locked: betsLocked, userBets, showInputs: !!authUser && !betsLocked });
    if (running && !finished) checkAnnouncements(horses, elapsed);
  }

  // Race flavor commentary — fires once per progress threshold (stop after race ends)
  if (running && !finished && elapsed - lastFlavorTime > FLAVOR_COOLDOWN) {
    const leaderProg = Math.max(...horses.map(hh => hh.progress));
    for (const [threshold, lines] of Object.entries(RACE_FLAVOR)) {
      const t = parseFloat(threshold);
      if (leaderProg >= t && !flavorFired[threshold]) {
        flavorFired[threshold] = true;
        lastFlavorTime = elapsed;
        const line = pickRandom(lines);
        speakAndShow(line, '🐎', elapsed);
        break; // only one per frame
      }
    }
  }

  // Periodic commentary (stop after race ends)
  if (running && !finished && Math.random() < 0.003 * SPEED) {
    const rh = horses[Math.floor(Math.random() * horses.length)];
    if (rh.currentQ > 0 && !rh.finishTime) {
      const acc = Math.round((rh.correct / rh.currentQ) * 100);
      addFeed(`${rh.emoji} <b>${rh.name}</b> at Q${rh.currentQ} — ${acc}% accuracy`, elapsed);
    }
  }

  // Trivia questions — fun color commentary during the race (stop after race ends)
  if (running && !finished && TTS.isReady() && elapsed > TRIVIA_START_DELAY
      && elapsed - lastTriviaTime > TRIVIA_COOLDOWN) {
    // Check that no horse has finished yet (trivia is mid-race filler)
    const anyFinished = horses.some(hh => hh.finishTime > 0);
    if (!anyFinished) {
      lastTriviaTime = elapsed;
      const trivia = TRIVIA_QUESTIONS[triviaIndex % TRIVIA_QUESTIONS.length];
      triviaIndex++;
      speakAndShow(trivia, '🧠', elapsed);
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
    betsLocked = true;
    document.getElementById('betStatus').textContent = '🔒 BETS LOCKED';
    document.getElementById('betStatus').className = 'bet-status locked';
    updBetting(horses, livePools, { locked: true, userBets, showInputs: false });
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
  TTS.stop();
  TTS.resetCommentary();
  lastMissCommentTime = 0;
  lastStreakCommentTime = 0;
  lastTriviaTime = 0;
  lastFlavorTime = 0;
  flavorFired = {};
  // Clear subtitle
  const subEl = document.getElementById('subtitle');
  if (subEl) subEl.classList.remove('active');
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

  // Reset betting UI and create new event
  userBets = [];
  betsLocked = false;
  resetBetAmounts();
  document.getElementById('betResult').style.display = 'none';
  document.getElementById('betStatus').textContent = '';
  document.getElementById('betStatus').className = 'bet-status';

  horses.forEach(h => resetHorseState(h));
  resetUI(horses);
  updStandings(horses);
  updPerf(horses);
  updBetting(horses, {}, { showInputs: !!authUser, userBets });

  // Auto-create new event if logged in
  if (authUser) {
    initBettingEvent();
  }
};

window.setSpd = function(s, btn) {
  SPEED = s;
  document.querySelectorAll('.spdb').forEach(b => b.classList.remove('ac'));
  btn.classList.add('ac');
};

// ---- TTS CONTROLS ----

window.warmupTTS = async function () {
  // AudioContext must be created on user gesture
  TTS.ensureAudioContext();

  const warmBtn = document.getElementById('ttsWarmup');
  const loading = document.getElementById('ttsLoading');
  const readyCtrls = document.getElementById('ttsReadyCtrls');

  warmBtn.style.display = 'none';
  loading.style.display = 'flex';

  // Phase 1: Load TTS model (Kokoro-82M)
  let lastPct = 0;
  document.getElementById('ttsLoadText').textContent = 'Loading voice model...';
  const ttsSuccess = await TTS.init((p) => {
    if (p.progress !== undefined) {
      const pct = Math.round(p.progress);
      if (pct > lastPct) lastPct = pct;
      document.getElementById('ttsLoadFill').style.width = lastPct + '%';
      if (p.file) {
        const fname = p.file.split('/').pop();
        document.getElementById('ttsLoadText').textContent =
          `Voice: ${fname}... ${lastPct}%`;
      }
    }
  });

  if (!ttsSuccess) {
    loading.style.display = 'none';
    warmBtn.style.display = 'inline-flex';
    warmBtn.textContent = '⚠️ Load Failed — Retry';
    return;
  }

  // Phase 2: Load LLM model (SmolLM2-360M) — non-blocking
  // Show controls immediately so TTS is usable while LLM loads
  readyCtrls.style.display = 'flex';
  TTS.speak('Voice is ready! Loading the brain now!');

  document.getElementById('ttsLoadFill').style.width = '0%';
  document.getElementById('ttsLoadText').textContent = 'Loading AI commentary...';

  const llmSuccess = await LLM.init((p) => {
    if (p.progress !== undefined) {
      const pct = Math.round(p.progress);
      document.getElementById('ttsLoadFill').style.width = pct + '%';
      document.getElementById('ttsLoadText').textContent =
        `AI Brain: ${p.text || ''} ${pct}%`;
    }
  });

  loading.style.display = 'none';

  if (llmSuccess) {
    TTS.speak('AI commentary loaded! We are READY TO RACE!');
  } else {
    console.warn('[LLM] AI commentary failed to load — using template fallback');
    // TTS still works, just no dynamic LLM commentary
  }
};

window.toggleMute = function () {
  const btn = document.getElementById('ttsMuteBtn');
  if (TTS.isMuted()) {
    TTS.setMuted(false);
    TTS.ensureAudioContext();
    btn.textContent = '🔊';
  } else {
    TTS.setMuted(true);
    btn.textContent = '🔇';
  }
};

window.changeTTSVol = function (v) {
  TTS.setVolume(parseFloat(v));
};

window.toggleTTSInfo = function () {
  const popup = document.getElementById('ttsInfoPopup');
  popup.style.display = popup.style.display === 'none' ? 'flex' : 'none';
};

// ---- INIT ----
const signInBtn = document.getElementById('signInBtn');
signInBtn.textContent = 'Loading...';
signInBtn.disabled = true;
initAuth().then(() => {
  if (!isFirebaseReady()) {
    signInBtn.textContent = 'Sign In (offline)';
  } else {
    signInBtn.textContent = 'Sign In to Bet';
  }
  signInBtn.disabled = false;
}).catch(() => {
  signInBtn.textContent = 'Sign In to Bet';
  signInBtn.disabled = false;
});
updStandings(horses);
updPerf(horses);
updBetting(horses, {}, { showInputs: false, userBets });
horses.forEach(h => {
  document.getElementById('log' + h.id).innerHTML = '<div class="tdim">Ready.</div>';
});

// Draw QR code (will update URL when deployed)
drawQRCode('qrCanvas', window.location.href);

lastFrame = performance.now();
requestAnimationFrame(frame);
