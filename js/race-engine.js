// ============================================================
// RACE ENGINE — deterministic data table replay
// ============================================================

import { BENCHMARK_DATA } from './data.js';

const TQ = 300;

// Time compression — speeds up the race so QRE 8B finishes in ~4 min
// Answer times are divided by this factor; penalties are set independently
const TIME_SCALE = 4.5;

// Penalty config — grows with CONSECUTIVE wrongs only, resets on correct
const PENALTY_BASE = 0.7;       // seconds base penalty for first miss
const PENALTY_INCREMENT = 0.15; // per consecutive wrong answer
const PENALTY_CAP = 2.5;        // max penalty seconds

function calcPenalty(cumulativeWrongs) {
  return Math.min(PENALTY_BASE + cumulativeWrongs * PENALTY_INCREMENT, PENALTY_CAP);
}

export function createHorseState(modelData) {
  // Pre-compute estimated total time for progress calculation
  const totalAnswerTime = modelData.questions.reduce((sum, q) => sum + q.time_ms / TIME_SCALE, 0);
  let projectedPenalty = 0;
  let consecutiveWrongs = 0;
  modelData.questions.forEach(q => {
    if (q.correct) {
      consecutiveWrongs = 0;
    } else {
      consecutiveWrongs++;
      projectedPenalty += calcPenalty(consecutiveWrongs) * 1000;
    }
  });

  return {
    id: modelData.id,
    name: modelData.name,
    emoji: modelData.emoji,
    color: modelData.color,
    questions: modelData.questions,

    // Race state
    currentQ: 0,          // index into questions array (0-299)
    cumulativeTime: 0,    // ms of answer time accumulated
    cumulativeWrongs: 0,
    penaltyRemaining: 0,  // ms of penalty left to serve
    totalPenaltyTime: 0,  // ms total penalty accumulated
    correct: 0,
    tps: 0,               // current display tok/s

    // Estimated total time for progress bar
    estimatedTotalTime: totalAnswerTime + projectedPenalty,

    // Track state
    progress: 0,
    displayProg: 0,
    finishTime: 0,        // wall-clock ms when finished (0 = not done)
    finishElapsed: 0,     // elapsed seconds when finished

    // Visual state
    particles: [],
    answerFlash: 0,
    lastCorrect: false,
    streak: 0,
    bestStreak: 0
  };
}

export function initHorses() {
  return BENCHMARK_DATA.map(createHorseState);
}

// Advance the race by dt milliseconds of wall-clock time (already scaled by speed)
// Returns array of events that happened this tick
export function raceTick(horses, dtMs) {
  const events = [];

  horses.forEach(h => {
    if (h.finishTime || h.currentQ >= TQ) return;

    // If serving a penalty, count it down
    if (h.penaltyRemaining > 0) {
      h.penaltyRemaining -= dtMs;
      if (h.penaltyRemaining < 0) {
        // Overflow goes to next question time
        const overflow = -h.penaltyRemaining;
        h.penaltyRemaining = 0;
        h.cumulativeTime += overflow;
      }
      updateProgress(h);
      return;
    }

    // Accumulate time toward current question
    h.cumulativeTime += dtMs;

    // Check if enough time has passed for current question
    while (h.currentQ < TQ && h.penaltyRemaining <= 0) {
      const q = h.questions[h.currentQ];
      const timeNeeded = cumulatedTimeNeeded(h, h.currentQ);

      if (h.cumulativeTime >= timeNeeded) {
        // Submit this answer
        h.currentQ++;
        h.answerFlash = 1.0;
        h.lastCorrect = q.correct;

        // Update tok/s display
        h.tps = Math.round((q.tokens / q.time_ms) * 1000);

        if (q.correct) {
          h.correct++;
          h.streak++;
          if (h.streak > h.bestStreak) h.bestStreak = h.streak;
          h.cumulativeWrongs = 0; // Reset consecutive wrong streak
        } else {
          h.streak = 0;
          h.cumulativeWrongs++;
          const penaltyMs = calcPenalty(h.cumulativeWrongs) * 1000;
          h.penaltyRemaining = penaltyMs;
          h.totalPenaltyTime += penaltyMs;
        }

        events.push({
          type: 'answer',
          horseId: h.id,
          qNum: h.currentQ,
          subject: q.subject,
          correct: q.correct,
          tokens: q.tokens
        });

        // Check finish
        if (h.currentQ >= TQ && h.penaltyRemaining <= 0) {
          events.push({ type: 'finish', horseId: h.id });
        }

        // If penalty started, break out of the while loop
        if (h.penaltyRemaining > 0) break;
      } else {
        break;
      }
    }

    updateProgress(h);
  });

  return events;
}

// Compute cumulative time needed up to and including question index qIdx
// Times are compressed by TIME_SCALE for faster races
function cumulatedTimeNeeded(horse, qIdx) {
  let total = 0;
  for (let i = 0; i <= qIdx; i++) {
    total += horse.questions[i].time_ms / TIME_SCALE;
  }
  return total;
}

function updateProgress(h) {
  if (h.currentQ >= TQ) {
    h.progress = 1;
    return;
  }

  // Progress = (time spent so far) / (estimated total time)
  const timeSpent = h.cumulativeTime + h.totalPenaltyTime - h.penaltyRemaining;
  h.progress = Math.min(0.999, Math.max(0, timeSpent / h.estimatedTotalTime));
}

// Lerp display progress for smooth animation
export function lerpHorses(horses, dt) {
  horses.forEach(h => {
    const speed = 6 * dt;
    h.displayProg += (h.progress - h.displayProg) * Math.min(speed, 0.5);
    if (Math.abs(h.displayProg - h.progress) < 0.0001) h.displayProg = h.progress;
  });
}

export function resetHorseState(h) {
  h.currentQ = 0;
  h.cumulativeTime = 0;
  h.cumulativeWrongs = 0;
  h.penaltyRemaining = 0;
  h.totalPenaltyTime = 0;
  h.correct = 0;
  h.tps = 0;
  h.progress = 0;
  h.displayProg = 0;
  h.finishTime = 0;
  h.finishElapsed = 0;
  h.streak = 0;
  h.bestStreak = 0;
  h.particles = [];
  h.answerFlash = 0;
  h.lastCorrect = false;
}

export { TQ, calcPenalty };
