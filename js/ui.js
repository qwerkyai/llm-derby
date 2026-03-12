// ============================================================
// UI — standings, performance grid, commentary, announcer
// ============================================================

import { TQ } from './race-engine.js';
import { speak, isReady as ttsReady } from './tts-service.js';

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Announcer state
let annQueue = [];
let annTimer = null;
let lastLead = -1;
let milestones = {};
let lastTiedCall = 0;

// ---- ANNOUNCER ----

export function announce(icon, text, dur) {
  annQueue.push({ icon, text, dur: dur || 4000 });
  if (!annTimer) showNextAnn();

  // Show subtitle
  const subEl = document.getElementById('subtitle');
  if (subEl) {
    subEl.textContent = text.replace(/<[^>]+>/g, '');
    subEl.classList.add('active');
    setTimeout(() => subEl.classList.remove('active'), (dur || 4000) + 1000);
  }

  // Pipe to TTS (non-blocking — never delays the race)
  if (ttsReady()) {
    speak(text);
  }
}

function showNextAnn() {
  if (annQueue.length === 0) {
    annTimer = null;
    document.getElementById('ann').classList.remove('active');
    return;
  }
  const a = annQueue.shift();
  document.getElementById('aI').textContent = a.icon;
  document.getElementById('aT').innerHTML = a.text;
  document.getElementById('ann').classList.add('active');
  annTimer = setTimeout(() => {
    document.getElementById('ann').classList.remove('active');
    setTimeout(showNextAnn, 300);
  }, a.dur);
}

export function checkAnnouncements(horses, elapsed) {
  const sorted = horses.slice().sort((a, b) => b.progress - a.progress);
  const leader = sorted[0].id;
  if (leader !== lastLead && lastLead !== -1 && elapsed > 3) {
    announce('🔄', `<b>${sorted[0].name}</b> takes the lead!`);
  }
  lastLead = leader;

  sorted.forEach(h => {
    const pct = Math.floor((h.currentQ / TQ) * 100);
    [25, 50, 75].forEach(m => {
      const key = h.id + '-' + m;
      if (pct >= m && !milestones[key]) {
        milestones[key] = true;
        const acc = h.correct > 0 ? Math.round((h.correct / h.currentQ) * 100) : 0;
        announce('📍', `<b>${h.name}</b> hits ${m}% — accuracy: ${acc}%`);
      }
    });
  });

  // "Virtually tied" — max once per 30 seconds
  if (elapsed > 10 && Math.random() < 0.002 && elapsed - lastTiedCall > 30) {
    const gap = Math.abs(sorted[0].progress - sorted[1].progress);
    if (gap < 0.02) {
      lastTiedCall = elapsed;
      announce('🔥', `Neck and neck! <b>${sorted[0].name}</b> and <b>${sorted[1].name}</b> are virtually tied!`);
    }
  }
}

// ---- TERMINAL LOGS ----

export function addLog(horseId, qNum, subject, correct) {
  const el = document.getElementById('log' + horseId);
  const ans = CHOICES[Math.floor(Math.random() * 10)];
  const corAns = correct ? ans : CHOICES[(CHOICES.indexOf(ans) + 1 + Math.floor(Math.random() * 9)) % 10];
  const line = document.createElement('div');

  if (correct) {
    line.innerHTML = `<span class="tdim">Q${qNum} [${subject}]</span> → <span class="tok">✓ ${ans}</span>`;
  } else {
    line.innerHTML = `<span class="tdim">Q${qNum} [${subject}]</span> → <span class="terr">✗ ${ans} (was ${corAns})</span>`;
  }
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ---- COMMENTARY FEED ----

export function addFeed(text, elapsed) {
  const fd = document.getElementById('fd');
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const ts = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  const div = document.createElement('div');
  div.className = 'fi';
  div.innerHTML = `<span class="ft">${ts}</span><span>${text}</span>`;
  fd.insertBefore(div, fd.firstChild);
  if (fd.children.length > 50) fd.removeChild(fd.lastChild);
}

// ---- STANDINGS ----

export function updStandings(horses) {
  const sorted = horses.slice().sort((a, b) => {
    if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
    if (a.finishTime) return -1;
    if (b.finishTime) return 1;
    return b.progress - a.progress;
  });

  let html = '';
  sorted.forEach((h, i) => {
    const acc = h.currentQ > 0 ? ((h.correct / h.currentQ) * 100).toFixed(1) : '0.0';
    html += `<div class="hc${i === 0 ? ' ld' : ''}">` +
      `<div class="hc-p">${i + 1}</div>` +
      `<div class="hc-i" style="background:${h.color}12">${h.emoji}</div>` +
      `<div class="hc-nfo">` +
      `<div class="hc-nm" style="color:${h.color}">${h.name}</div>` +
      `<div class="hc-st">${h.correct}/${h.currentQ} · ${acc}% · Q${h.currentQ}/${TQ}</div>` +
      `<div class="hc-bar"><div class="hc-bf" style="width:${h.displayProg * 100}%;background:${h.color}"></div></div>` +
      `</div></div>`;
  });
  document.getElementById('stnd').innerHTML = html;
}

// ---- PERFORMANCE GRID ----

export function updPerf(horses) {
  horses.forEach(h => {
    const acc = h.currentQ > 0 ? Math.round((h.correct / h.currentQ) * 100) + '%' : '—';
    document.getElementById('sa' + h.id).textContent = acc;
    document.getElementById('st' + h.id).textContent = h.tps > 0 ? Math.round(h.tps) : '—';
    const penSec = h.totalPenaltyTime / 1000;
    document.getElementById('sp' + h.id).textContent = penSec > 0 ? penSec.toFixed(1) + 's' : '—';
  });
}

// ---- BETTING ----

// Renders betting cards with pool odds and bet inputs
// pools: { horseId: totalAmount } from Firestore subscription
// opts: { locked, userBets: [{horse, amount}], showInputs }
export function updBetting(horses, pools = {}, opts = {}) {
  const grid = document.getElementById('betGrid');
  if (!grid) return;

  const totalPool = Object.values(pools).reduce((a, b) => a + b, 0);
  const locked = opts.locked || false;

  // Calculate odds from pool data, or simulated if no bets
  let odds = {};
  if (totalPool > 0) {
    horses.forEach(h => {
      const pool = pools[h.id] || 0;
      odds[h.id] = pool > 0 ? totalPool / pool : 0;
    });
  } else {
    // Simulated odds when no bets placed
    const scores = horses.map(h => {
      const accScore = h.currentQ > 0 ? (h.correct / h.currentQ) : 0.25;
      return h.progress * 0.5 + accScore * 0.5 + 0.01;
    });
    const total = scores.reduce((a, b) => a + b, 0);
    horses.forEach((h, i) => {
      odds[h.id] = total / scores[i];
    });
  }

  const minOdds = Math.min(...Object.values(odds).filter(o => o > 0));

  let html = '';
  horses.forEach(h => {
    const pool = pools[h.id] || 0;
    const odd = odds[h.id] || 0;
    const isFav = odd > 0 && odd === minOdds;
    const oddsStr = odd > 0 ? odd.toFixed(1) + 'x' : '—';
    const poolStr = totalPool > 0 ? '$' + pool : '';

    html += `<div class="bet-card${isFav ? ' fav' : ''}${locked ? ' locked' : ''}">` +
      `<div class="bet-name" style="color:${h.color}">${h.emoji} ${h.name}</div>` +
      `<div class="bet-odds" style="color:${isFav ? 'var(--green)' : 'var(--text)'}">${oddsStr}</div>` +
      `<div class="bet-pool">${poolStr}</div>` +
      `<div class="bet-label">${isFav ? '★ FAV' : 'WIN'}</div>`;

    if (opts.showInputs && !locked) {
      html += `<div class="bet-input">` +
        `<input type="number" id="betAmt${h.id}" min="1" placeholder="$">` +
        `<button class="bet-place-btn" onclick="doBet(${h.id})">BET</button>` +
        `</div>`;
    }
    html += `</div>`;
  });
  grid.innerHTML = html;

  // Update user's bets display
  const myEl = document.getElementById('betMy');
  if (opts.userBets && opts.userBets.length > 0) {
    myEl.style.display = 'block';
    myEl.innerHTML = '<div style="margin-bottom:2px;color:var(--text);font-weight:600">Your bets:</div>' +
      opts.userBets.map(b => {
        const horse = horses.find(h => h.id === b.horse);
        return `<div class="bet-my-item"><span class="bet-my-horse" style="color:${horse ? horse.color : 'var(--text)'}">${horse ? horse.emoji + ' ' + horse.name : 'Horse ' + b.horse}</span><span class="bet-my-amt">$${b.amount}</span></div>`;
      }).join('');
  } else {
    myEl.style.display = 'none';
  }
}

// ---- CONFETTI ----

export function spawnConfetti() {
  const colors = ['#e8b830', '#ff5e8a', '#6d8cff', '#00d4a0', '#ef4444', '#ffffff'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.top = '-20px';
    c.style.width = (4 + Math.random() * 8) + 'px';
    c.style.height = (4 + Math.random() * 8) + 'px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    c.style.animationDuration = (2 + Math.random() * 3) + 's';
    c.style.animationDelay = Math.random() * 1.5 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

// ---- RESET ----

export function resetUI(horses) {
  lastLead = -1;
  milestones = {};
  lastTiedCall = 0;
  annQueue = [];
  if (annTimer) { clearTimeout(annTimer); annTimer = null; }
  document.getElementById('ann').classList.remove('active');
  document.getElementById('fd').innerHTML = '';
  horses.forEach(h => {
    document.getElementById('log' + h.id).innerHTML = '<div class="tdim">Ready.</div>';
  });
}
