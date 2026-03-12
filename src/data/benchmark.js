// ============================================================
// BENCHMARK DATA — seeded deterministic question generation
// ============================================================

import { SUBJECTS, SUBJECT_DIFFICULTY, TOTAL_QUESTIONS, DEFAULT_MODEL_CONFIGS } from '../core/config.js';

/**
 * Seeded pseudo-random number generator (LCG).
 * Same seed always produces the same sequence.
 */
export function seededRNG(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Generate benchmark question data for a single model config.
 * Returns array of 300 questions: { q, subject, correct, tokens, time_ms }
 */
export function generateModelData(config, seed) {
  const rng = seededRNG(seed);
  const data = [];
  let correctCount = 0;
  const targetCorrect = config.targetCorrect;

  // Pre-assign subjects in a realistic pattern (20 per subject)
  const subjectPool = [];
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    subjectPool.push(SUBJECTS[i % SUBJECTS.length]);
  }
  // Shuffle subjects deterministically
  for (let i = subjectPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [subjectPool[i], subjectPool[j]] = [subjectPool[j], subjectPool[i]];
  }

  // Generate correct/incorrect pattern with streak tendency
  const correctPattern = [];
  let remaining = TOTAL_QUESTIONS;
  let correctRemaining = targetCorrect;

  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const subject = subjectPool[i];
    const difficulty = SUBJECT_DIFFICULTY[subject];

    let prob = correctRemaining / remaining;
    prob *= 1 - difficulty * 0.3 + 0.15;

    if (i >= 2) {
      const lastTwo = correctPattern.slice(-2);
      if (lastTwo[0] === lastTwo[1]) {
        prob = lastTwo[0] ? Math.min(prob * 1.15, 0.95) : Math.max(prob * 0.85, 0.05);
      }
    }

    const isCorrect = rng() < prob;
    correctPattern.push(isCorrect);
    if (isCorrect) correctRemaining--;
    remaining--;
  }

  // Generate question entries
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const subject = subjectPool[i];
    const difficulty = SUBJECT_DIFFICULTY[subject];
    const isCorrect = correctPattern[i];

    const baseTokens = 50 + difficulty * 40;
    const tokens = Math.round(baseTokens + (rng() - 0.5) * 30);

    const tpsVariance = 0.85 + rng() * 0.3;
    const effectiveTPS = config.baseTPS * tpsVariance;
    const baseTimeMs = Math.round((tokens / effectiveTPS) * 1000);
    const timeMs = isCorrect ? baseTimeMs : Math.round(baseTimeMs * (1 + rng() * 0.15));

    if (isCorrect) correctCount++;

    data.push({
      q: i + 1,
      subject,
      correct: isCorrect,
      tokens: Math.max(30, Math.min(130, tokens)),
      time_ms: Math.max(200, timeMs),
    });
  }

  return data;
}

/**
 * Generate full benchmark data for an array of model configs.
 * Each config must have: id, name, emoji, color, baseTPS, targetCorrect, seed
 */
export function generateBenchmarkData(configs) {
  return configs.map((config) => ({
    ...config,
    questions: generateModelData(config, config.seed),
  }));
}

/**
 * Default benchmark data for demo mode (3 models).
 */
export const BENCHMARK_DATA = generateBenchmarkData(DEFAULT_MODEL_CONFIGS);
