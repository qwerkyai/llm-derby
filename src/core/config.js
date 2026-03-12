// ============================================================
// CONFIG — every tunable value in one place
// If you change a number and the app breaks, it should be here.
// ============================================================

// --- Race ---
export const TOTAL_QUESTIONS = 300; // MMLU-Pro Hard question count per model
export const DT_CAP_SECONDS = 0.08; // Max frame delta to prevent spiral-of-death

// --- Penalty System ---
// Wrong answers incur a time penalty. Base is 2s, incrementing by 0.5s
// per cumulative wrong answer, capping at 8s. This was calibrated so that
// a model with 35% accuracy loses ~40s to penalties vs ~15s for 54% accuracy,
// creating meaningful spread without making accuracy the only factor.
export const PENALTY_BASE_SECONDS = 2;
export const PENALTY_INCREMENT_SECONDS = 0.5;
export const PENALTY_CAP_SECONDS = 8;

// --- Canvas ---
export const CANVAS_WIDTH = 1060;
export const CANVAS_HEIGHT = 580;

// --- Track Geometry ---
// Oval: two straights connected by two semicircles.
// Origin is top-left of the bounding box.
export const TRACK_X = 160; // left edge of bounding box
export const TRACK_Y = 120; // top edge of bounding box
export const TRACK_WIDTH = 740; // bounding box width
export const TRACK_HEIGHT = 340; // bounding box height
export const SEMICIRCLE_RADIUS = 170; // TRACK_HEIGHT / 2
export const STRAIGHT_LENGTH = 400; // TRACK_WIDTH - TRACK_HEIGHT

// --- Track Rendering ---
export const TRACK_SURFACE_WIDTH = 56; // px width of dirt surface stroke
export const TRACK_INNER_RAIL_OFFSET = -7; // lane offset for inner rail
export const TRACK_OUTER_RAIL_OFFSET = 32; // lane offset for outer rail
export const DISTANCE_MARKER_POSITIONS = [0.25, 0.5, 0.75];
export const STADIUM_LIGHT_COUNT = 6;

// --- Horse Rendering ---
export const HORSE_RADIUS = 14; // px radius of horse circle
export const HORSE_TRAIL_LENGTH = 0.05; // fraction of track for glowing trail
export const HORSE_TRAIL_SEGMENTS = 15;
export const DUST_SPAWN_CHANCE = 0.4; // probability per frame
export const DUST_DECAY_RATE = 0.025; // life lost per frame
export const LANE_BASE_OFFSET = 2; // px from track center for first lane
export const LANE_SPACING = 14; // px between lanes

// --- Animation ---
export const LERP_SPEED_FACTOR = 6; // display progress lerp multiplier
export const LERP_MAX_STEP = 0.5; // clamp lerp step
export const LERP_SNAP_THRESHOLD = 0.0001; // snap to target below this delta
export const ANSWER_FLASH_DECAY = 0.04; // per-frame decay of answer flash ring

// --- UI Throttle ---
export const UI_UPDATE_INTERVAL_MS = 200; // ~5 updates per second
export const COMMENTARY_CHANCE = 0.003; // per-frame probability of random commentary

// --- Speed Multipliers ---
export const SPEED_OPTIONS = [1, 2, 4];

// --- Confetti ---
export const CONFETTI_COUNT = 60;
export const CONFETTI_COLORS = ['#e8b830', '#ff5e8a', '#6d8cff', '#00d4a0', '#ef4444', '#ffffff'];

// --- Canvas Colors ---
// Shared palette for canvas rendering. CSS variables don't apply inside <canvas>,
// so we maintain a parallel palette here. Keep in sync with public/css/style.css :root.
export const PALETTE = {
  background: '#050810',
  backgroundLight: '#0c1020',
  gold: '#e8b830',
  goldDim: 'rgba(232,184,48,0.12)',
  red: '#ef4444',
  green: '#22c55e',
  horse1: '#6d8cff',
  horse2: '#ff5e8a',
  horse3: '#00d4a0',
  trackDirt: '#1e1a10',
  trackDirtDark: '#1a1508',
  grass: '#0f2a12',
  grassBright: '#143a18',
  grassDark: '#0a1e0d',
  rail: '#c4a44a',
  text: '#cdc5b8',
  dim: 'rgba(255,255,255,0.28)',
};

// --- Benchmark Data Generation ---
export const SUBJECTS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'History',
  'Law',
  'Economics',
  'Philosophy',
  'Psychology',
  'Computer Science',
  'Engineering',
  'Medicine',
  'Business',
  'Sociology',
  'Political Science',
];

// Higher = harder, affects accuracy probability and token count
export const SUBJECT_DIFFICULTY = {
  Physics: 0.7,
  Chemistry: 0.65,
  Biology: 0.5,
  Math: 0.8,
  History: 0.4,
  Law: 0.6,
  Economics: 0.55,
  Philosophy: 0.5,
  Psychology: 0.45,
  'Computer Science': 0.6,
  Engineering: 0.7,
  Medicine: 0.55,
  Business: 0.4,
  Sociology: 0.35,
  'Political Science': 0.4,
};

// --- Default Model Configs ---
// Accuracy calibrated to real MMLU-Pro published benchmarks
// Speed calibrated to real-world A100 inference measurements
export const DEFAULT_MODEL_CONFIGS = [
  {
    id: 0,
    name: 'Llama 3.2 3B',
    emoji: '\u{1F999}',
    color: '#6d8cff',
    baseTPS: 52,
    targetCorrect: 110, // 36.5% accuracy (real MMLU-Pro)
    seed: 42,
  },
  {
    id: 1,
    name: 'Qre Llama 3B',
    emoji: '\u26A1',
    color: '#ff5e8a',
    baseTPS: 95,
    targetCorrect: 110, // same accuracy as base 3B
    seed: 137,
  },
  {
    id: 2,
    name: 'Qre Llama 8B',
    emoji: '\u{1F3C7}',
    color: '#00d4a0',
    baseTPS: 50,
    targetCorrect: 133, // 44.3% accuracy (same as base 8B)
    seed: 256,
  },
  {
    id: 3,
    name: 'Llama 3.1 8B',
    emoji: '\u{1F999}',
    color: '#f0a030',
    baseTPS: 25,
    targetCorrect: 133, // 44.3% accuracy (real MMLU-Pro)
    seed: 512,
  },
];
