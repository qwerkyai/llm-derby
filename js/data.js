// ============================================================
// PRE-RUN BENCHMARK DATA
// 300 MMLU-Pro Hard questions × 3 models
// NOTE: This is placeholder data. Real data will be swapped in
// after actual NVIDIA DGX Spark benchmarks.
// ============================================================

const SUBJECTS = [
  'Physics', 'Chemistry', 'Biology', 'Math', 'History', 'Law',
  'Economics', 'Philosophy', 'Psychology', 'Computer Science',
  'Engineering', 'Medicine', 'Business', 'Sociology', 'Political Science'
];

// Subject difficulty weights (higher = harder, more errors)
const SUBJECT_DIFFICULTY = {
  'Physics': 0.7, 'Chemistry': 0.65, 'Biology': 0.5, 'Math': 0.8,
  'History': 0.4, 'Law': 0.6, 'Economics': 0.55, 'Philosophy': 0.5,
  'Psychology': 0.45, 'Computer Science': 0.6, 'Engineering': 0.7,
  'Medicine': 0.55, 'Business': 0.4, 'Sociology': 0.35, 'Political Science': 0.4
};

// Seeded random number generator for deterministic data
function seededRNG(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function generateModelData(config, seed) {
  const rng = seededRNG(seed);
  const data = [];
  let correctCount = 0;
  const targetCorrect = config.targetCorrect;
  const totalQ = 300;

  // Pre-assign subjects in a realistic pattern (20 per subject)
  const subjectPool = [];
  for (let i = 0; i < totalQ; i++) {
    subjectPool.push(SUBJECTS[i % SUBJECTS.length]);
  }
  // Shuffle subjects deterministically
  for (let i = subjectPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [subjectPool[i], subjectPool[j]] = [subjectPool[j], subjectPool[i]];
  }

  // Generate correct/incorrect pattern with streaks
  const correctPattern = [];
  let remaining = totalQ;
  let correctRemaining = targetCorrect;

  for (let i = 0; i < totalQ; i++) {
    const subject = subjectPool[i];
    const difficulty = SUBJECT_DIFFICULTY[subject];

    // Base probability from target accuracy
    let prob = correctRemaining / remaining;

    // Adjust for subject difficulty (harder subjects = less likely correct)
    prob *= (1 - difficulty * 0.3 + 0.15);

    // Add streak tendency: if last 2 were same, slight bias to continue
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

  // Generate entries
  for (let i = 0; i < totalQ; i++) {
    const subject = subjectPool[i];
    const difficulty = SUBJECT_DIFFICULTY[subject];
    const isCorrect = correctPattern[i];

    // Token count: harder questions = more tokens, with variance
    const baseTokens = 50 + difficulty * 40; // 50-82 base
    const tokens = Math.round(baseTokens + (rng() - 0.5) * 30); // ±15

    // Time calculation: tokens / tok_per_sec, with ±15% variance
    const tpsVariance = 0.85 + rng() * 0.30; // 0.85-1.15
    const effectiveTPS = config.baseTPS * tpsVariance;
    const baseTimeMs = Math.round((tokens / effectiveTPS) * 1000);

    // Slightly longer for wrong answers (model "deliberated")
    const timeMs = isCorrect ? baseTimeMs : Math.round(baseTimeMs * (1 + rng() * 0.15));

    if (isCorrect) correctCount++;

    data.push({
      q: i + 1,
      subject: subject,
      correct: isCorrect,
      tokens: Math.max(30, Math.min(130, tokens)),
      time_ms: Math.max(200, timeMs)
    });
  }

  return data;
}

// Model configs
const MODEL_CONFIGS = [
  {
    id: 0,
    name: 'Llama 3.1 3B',
    emoji: '🦙',
    color: '#6d8cff',
    baseTPS: 52,
    targetCorrect: 120, // ~40% accuracy
    seed: 42
  },
  {
    id: 1,
    name: 'Qre Llama 3B',
    emoji: '⚡',
    color: '#ff5e8a',
    baseTPS: 95,
    targetCorrect: 105, // ~35% accuracy
    seed: 137
  },
  {
    id: 2,
    name: 'Qre Llama 8B',
    emoji: '🏇',
    color: '#00d4a0',
    baseTPS: 50,
    targetCorrect: 162, // ~54% accuracy
    seed: 256
  }
];

// Generate all benchmark data
export const BENCHMARK_DATA = MODEL_CONFIGS.map(config => ({
  ...config,
  questions: generateModelData(config, config.seed)
}));

export { SUBJECTS, MODEL_CONFIGS };
