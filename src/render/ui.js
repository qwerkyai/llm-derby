// ============================================================
// UI — standings, performance grid, commentary, announcer
// Reads state, writes to DOM. Never mutates application state.
// ============================================================

import { TOTAL_QUESTIONS, CONFETTI_COUNT, CONFETTI_COLORS } from '../core/config.js';

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Announcer state (UI-local, not application state)
let announcementQueue = [];
let announcementTimer = null;
let lastLeader = -1;
let milestones = {};

// ---- ANNOUNCER ----

export function announce(icon, text, dur) {
  announcementQueue.push({ icon, text, dur: dur || 4000 });
  if (!announcementTimer) showNextAnnouncement();
}

function showNextAnnouncement() {
  if (announcementQueue.length === 0) {
    announcementTimer = null;
    const el = document.getElementById('announcer');
    if (el) el.classList.remove('active');
    return;
  }
  const a = announcementQueue.shift();
  const iconEl = document.getElementById('announcer-icon');
  const textEl = document.getElementById('announcer-text');
  const wrapEl = document.getElementById('announcer');
  if (iconEl) iconEl.textContent = a.icon;
  if (textEl) textEl.textContent = a.text;
  if (wrapEl) wrapEl.classList.add('active');
  announcementTimer = setTimeout(() => {
    if (wrapEl) wrapEl.classList.remove('active');
    setTimeout(showNextAnnouncement, 300);
  }, a.dur);
}

export function checkAnnouncements(horses, elapsed) {
  const sorted = horses.slice().sort((a, b) => b.progress - a.progress);
  const leader = sorted[0].id;
  if (leader !== lastLeader && lastLeader !== -1 && elapsed > 3) {
    announce('\u{1F504}', `${sorted[0].name} takes the lead!`);
  }
  lastLeader = leader;

  sorted.forEach((h) => {
    const pct = Math.floor((h.currentQ / TOTAL_QUESTIONS) * 100);
    [25, 50, 75].forEach((m) => {
      const key = h.id + '-' + m;
      if (pct >= m && !milestones[key]) {
        milestones[key] = true;
        const acc = h.correct > 0 ? Math.round((h.correct / h.currentQ) * 100) : 0;
        announce('\u{1F4CD}', `${h.name} hits ${m}% — accuracy: ${acc}%`);
      }
    });
  });

  if (elapsed > 10 && Math.random() < 0.005) {
    const gap = Math.abs(sorted[0].progress - sorted[1].progress);
    if (gap < 0.03) {
      announce('\u{1F525}', `Neck and neck! ${sorted[0].name} and ${sorted[1].name} are virtually tied!`);
    }
  }
}

// ---- TERMINAL LOGS ----

export function addTerminalLog(horseId, qNum, subject, correct) {
  const el = document.getElementById('log' + horseId);
  if (!el) return;
  const ans = CHOICES[Math.floor(Math.random() * 10)];
  const corAns = correct ? ans : CHOICES[(CHOICES.indexOf(ans) + 1 + Math.floor(Math.random() * 9)) % 10];
  const line = document.createElement('div');

  if (correct) {
    const dim = document.createElement('span');
    dim.className = 'terminal-dim';
    dim.textContent = `Q${qNum} [${subject}]`;
    const arrow = document.createTextNode(' \u2192 ');
    const result = document.createElement('span');
    result.className = 'terminal-correct';
    result.textContent = `\u2713 ${ans}`;
    line.appendChild(dim);
    line.appendChild(arrow);
    line.appendChild(result);
  } else {
    const dim = document.createElement('span');
    dim.className = 'terminal-dim';
    dim.textContent = `Q${qNum} [${subject}]`;
    const arrow = document.createTextNode(' \u2192 ');
    const result = document.createElement('span');
    result.className = 'terminal-error';
    result.textContent = `\u2717 ${ans} (was ${corAns})`;
    line.appendChild(dim);
    line.appendChild(arrow);
    line.appendChild(result);
  }
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ---- COMMENTARY FEED ----

export function addCommentaryEntry(text, elapsed) {
  const fd = document.getElementById('commentary-feed');
  if (!fd) return;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const ts = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  const div = document.createElement('div');
  div.className = 'feed-item';
  const timeSpan = document.createElement('span');
  timeSpan.className = 'feed-time';
  timeSpan.textContent = ts;
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  div.appendChild(timeSpan);
  div.appendChild(textSpan);
  fd.insertBefore(div, fd.firstChild);
  if (fd.children.length > 50) fd.removeChild(fd.lastChild);
}

// ---- STANDINGS ----

export function updateStandings(horses) {
  const sorted = horses.slice().sort((a, b) => {
    if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
    if (a.finishTime) return -1;
    if (b.finishTime) return 1;
    return b.progress - a.progress;
  });

  const container = document.getElementById('standings');
  if (!container) return;
  container.innerHTML = '';

  sorted.forEach((h, i) => {
    const acc = h.currentQ > 0 ? ((h.correct / h.currentQ) * 100).toFixed(1) : '0.0';
    const card = document.createElement('div');
    card.className = 'horse-card' + (i === 0 ? ' leader' : '');

    const place = document.createElement('div');
    place.className = 'horse-card-place';
    place.textContent = i + 1;

    const icon = document.createElement('div');
    icon.className = 'horse-card-icon';
    icon.style.background = h.color + '12';
    icon.textContent = h.emoji;

    const info = document.createElement('div');
    info.className = 'horse-card-info';

    const name = document.createElement('div');
    name.className = 'horse-card-name';
    name.style.color = h.color;
    name.textContent = h.name;

    const stats = document.createElement('div');
    stats.className = 'horse-card-stats';
    stats.textContent = `${h.correct}/${h.currentQ} \u00b7 ${acc}% \u00b7 Q${h.currentQ}/${TOTAL_QUESTIONS}`;

    const bar = document.createElement('div');
    bar.className = 'horse-card-bar';
    const fill = document.createElement('div');
    fill.className = 'horse-card-bar-fill';
    fill.style.width = h.displayProg * 100 + '%';
    fill.style.background = h.color;
    bar.appendChild(fill);

    info.appendChild(name);
    info.appendChild(stats);
    info.appendChild(bar);
    card.appendChild(place);
    card.appendChild(icon);
    card.appendChild(info);
    container.appendChild(card);
  });
}

// ---- PERFORMANCE GRID ----

export function updatePerformance(horses) {
  horses.forEach((h) => {
    const acc = h.currentQ > 0 ? Math.round((h.correct / h.currentQ) * 100) + '%' : '\u2014';
    const accEl = document.getElementById('perf-acc-' + h.id);
    const tpsEl = document.getElementById('perf-tps-' + h.id);
    const penEl = document.getElementById('perf-pen-' + h.id);
    if (accEl) accEl.textContent = acc;
    if (tpsEl) tpsEl.textContent = h.tps > 0 ? Math.round(h.tps) : '\u2014';
    if (penEl) {
      const penSec = h.totalPenaltyTime / 1000;
      penEl.textContent = penSec > 0 ? penSec.toFixed(1) + 's' : '\u2014';
    }
  });
}

// ---- BETTING ODDS ----

export function updateBettingOdds(horses) {
  const scores = horses.map((h) => {
    const accScore = h.currentQ > 0 ? h.correct / h.currentQ : 0.4;
    return h.progress * 0.6 + accScore * 0.4 + 0.01;
  });
  const total = scores.reduce((a, b) => a + b, 0);
  const probs = scores.map((s) => s / total);
  const maxP = Math.max(...probs);

  const container = document.getElementById('betting-cards');
  if (!container) return;
  container.innerHTML = '';

  horses.forEach((h, i) => {
    const cents = Math.round(probs[i] * 100);
    const isFav = probs[i] === maxP;

    const card = document.createElement('div');
    card.className = 'bet-card' + (isFav ? ' favorite' : '');

    const name = document.createElement('div');
    name.className = 'bet-card-name';
    name.style.color = h.color;
    name.textContent = h.emoji + ' ' + h.name.split(' ')[0];

    const odds = document.createElement('div');
    odds.className = 'bet-card-odds';
    odds.style.color = isFav ? 'var(--green)' : 'var(--text)';
    odds.textContent = cents + '\u00A2';

    const label = document.createElement('div');
    label.className = 'bet-card-label';
    label.textContent = isFav ? '\u2605 FAVORITE' : 'WIN';

    card.appendChild(name);
    card.appendChild(odds);
    card.appendChild(label);
    container.appendChild(card);
  });
}

// ---- CONFETTI ----

export function launchConfetti() {
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.top = '-20px';
    c.style.width = 4 + Math.random() * 8 + 'px';
    c.style.height = 4 + Math.random() * 8 + 'px';
    c.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    c.style.animationDuration = 2 + Math.random() * 3 + 's';
    c.style.animationDelay = Math.random() * 1.5 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

// ---- RESET ----

export function resetUI(horses) {
  lastLeader = -1;
  milestones = {};
  announcementQueue = [];
  if (announcementTimer) {
    clearTimeout(announcementTimer);
    announcementTimer = null;
  }
  const annEl = document.getElementById('announcer');
  if (annEl) annEl.classList.remove('active');
  const feedEl = document.getElementById('commentary-feed');
  if (feedEl) feedEl.innerHTML = '';
  horses.forEach((h) => {
    const el = document.getElementById('log' + h.id);
    if (el) {
      el.innerHTML = '';
      const ready = document.createElement('div');
      ready.className = 'terminal-dim';
      ready.textContent = 'Ready.';
      el.appendChild(ready);
    }
  });
}
