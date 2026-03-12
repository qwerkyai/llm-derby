// ============================================================
// RACE ENGINE — deterministic data table replay
// Pure logic. No DOM. No side effects. Fully testable.
// ============================================================

import {
  TOTAL_QUESTIONS,
  PENALTY_BASE_SECONDS,
  PENALTY_INCREMENT_SECONDS,
  PENALTY_CAP_SECONDS,
  LERP_SPEED_FACTOR,
  LERP_MAX_STEP,
  LERP_SNAP_THRESHOLD,
} from './config.js';

/**
 * Calculate penalty time in seconds for a wrong answer.
 * Scales linearly with cumulative wrong answers, capped at PENALTY_CAP_SECONDS.
 */
export function calculatePenalty(cumulativeWrongs) {
  return Math.min(PENALTY_BASE_SECONDS + cumulativeWrongs * PENALTY_INCREMENT_SECONDS, PENALTY_CAP_SECONDS);
}

/**
 * Create the initial state for a racing horse from model benchmark data.
 * Pre-computes estimated total time for progress bar calculation.
 */
export function createHorseState(modelData) {
  const totalAnswerTime = modelData.questions.reduce((sum, q) => sum + q.time_ms, 0);
  let projectedPenalty = 0;
  let wrongCount = 0;
  modelData.questions.forEach((q) => {
    if (!q.correct) {
      wrongCount++;
      projectedPenalty += calculatePenalty(wrongCount) * 1000;
    }
  });

  return {
    id: modelData.id,
    name: modelData.name,
    emoji: modelData.emoji,
    color: modelData.color,
    questions: modelData.questions,

    currentQ: 0,
    cumulativeTime: 0,
    cumulativeWrongs: 0,
    penaltyRemaining: 0,
    totalPenaltyTime: 0,
    correct: 0,
    tps: 0,

    estimatedTotalTime: totalAnswerTime + projectedPenalty,

    progress: 0,
    displayProg: 0,
    finishTime: 0,
    finishElapsed: 0,

    particles: [],
    answerFlash: 0,
    lastCorrect: false,
    streak: 0,
    bestStreak: 0,
  };
}

/**
 * Initialize horses from an array of model benchmark data.
 */
export function initHorses(benchmarkData) {
  return benchmarkData.map(createHorseState);
}

/**
 * Compute cumulative time needed up to and including question index qIdx.
 */
function cumulatedTimeNeeded(horse, qIdx) {
  let total = 0;
  for (let i = 0; i <= qIdx; i++) {
    total += horse.questions[i].time_ms;
  }
  return total;
}

/**
 * Update a horse's progress value based on time spent vs estimated total.
 */
function updateProgress(horse) {
  if (horse.currentQ >= TOTAL_QUESTIONS) {
    horse.progress = 1;
    return;
  }
  const timeSpent = horse.cumulativeTime + horse.totalPenaltyTime - horse.penaltyRemaining;
  horse.progress = Math.min(0.999, Math.max(0, timeSpent / horse.estimatedTotalTime));
}

/**
 * Advance the race by dtMs milliseconds (already scaled by speed).
 * Returns array of events: { type: 'answer' | 'finish', ... }
 */
export function raceTick(horses, dtMs) {
  const events = [];

  horses.forEach((h) => {
    if (h.finishTime || h.currentQ >= TOTAL_QUESTIONS) return;

    if (h.penaltyRemaining > 0) {
      h.penaltyRemaining -= dtMs;
      if (h.penaltyRemaining < 0) {
        const overflow = -h.penaltyRemaining;
        h.penaltyRemaining = 0;
        h.cumulativeTime += overflow;
      }
      updateProgress(h);
      return;
    }

    h.cumulativeTime += dtMs;

    while (h.currentQ < TOTAL_QUESTIONS && h.penaltyRemaining <= 0) {
      const q = h.questions[h.currentQ];
      const timeNeeded = cumulatedTimeNeeded(h, h.currentQ);

      if (h.cumulativeTime >= timeNeeded) {
        h.currentQ++;
        h.answerFlash = 1.0;
        h.lastCorrect = q.correct;
        h.tps = Math.round((q.tokens / q.time_ms) * 1000);

        if (q.correct) {
          h.correct++;
          h.streak++;
          if (h.streak > h.bestStreak) h.bestStreak = h.streak;
        } else {
          h.streak = 0;
          h.cumulativeWrongs++;
          const penaltyMs = calculatePenalty(h.cumulativeWrongs) * 1000;
          h.penaltyRemaining = penaltyMs;
          h.totalPenaltyTime += penaltyMs;
        }

        events.push({
          type: 'answer',
          horseId: h.id,
          qNum: h.currentQ,
          subject: q.subject,
          correct: q.correct,
          tokens: q.tokens,
        });

        if (h.currentQ >= TOTAL_QUESTIONS && h.penaltyRemaining <= 0) {
          events.push({ type: 'finish', horseId: h.id });
        }

        if (h.penaltyRemaining > 0) break;
      } else {
        break;
      }
    }

    updateProgress(h);
  });

  return events;
}

/**
 * Smoothly interpolate display progress toward actual progress.
 */
export function lerpHorses(horses, dt) {
  horses.forEach((h) => {
    const speed = LERP_SPEED_FACTOR * dt;
    h.displayProg += (h.progress - h.displayProg) * Math.min(speed, LERP_MAX_STEP);
    if (Math.abs(h.displayProg - h.progress) < LERP_SNAP_THRESHOLD) {
      h.displayProg = h.progress;
    }
  });
}

/**
 * Reset a horse's race state without recreating the object.
 */
export function resetHorseState(horse) {
  horse.currentQ = 0;
  horse.cumulativeTime = 0;
  horse.cumulativeWrongs = 0;
  horse.penaltyRemaining = 0;
  horse.totalPenaltyTime = 0;
  horse.correct = 0;
  horse.tps = 0;
  horse.progress = 0;
  horse.displayProg = 0;
  horse.finishTime = 0;
  horse.finishElapsed = 0;
  horse.streak = 0;
  horse.bestStreak = 0;
  horse.particles = [];
  horse.answerFlash = 0;
  horse.lastCorrect = false;
}
