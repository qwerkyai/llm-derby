// ============================================================
// TTS SERVICE — Kokoro TTS with streaming & emotional marks
// Runs entirely in the browser (local LLM inference)
// ============================================================

// State
let tts = null;
let audioCtx = null;
let currentSource = null;
let speechQueue = [];
let isSpeaking = false;
let muted = false;
let voice = 'am_adam';
let speed = 1.4; // Fast like a real horse race announcer (~250 WPM effective)
let volume = 0.8;
let gainNode = null;
let modelLoading = false;
let modelReady = false;
let onLoadProgress = null;

// Track recently used templates to avoid repetition
let recentMissTemplates = [];
let recentCorrectTemplates = [];
const RECENT_MEMORY = 8; // Remember last N templates to avoid repeats

// Color nicknames for each horse (by color hex)
const COLOR_NAMES = {
  '#6d8cff': 'Blue',
  '#ff5e8a': 'Pink',
  '#00d4a0': 'Green',
  '#f0a030': 'Orange',
};

// ---- INIT & MODEL LOADING ----

async function detectDevice() {
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        console.log('[TTS] WebGPU available — using GPU acceleration');
        return 'webgpu';
      }
    } catch (e) { /* fallback */ }
  }
  console.log('[TTS] WebGPU not available — falling back to WASM');
  return 'wasm';
}

export async function init(progressCallback) {
  if (modelReady || modelLoading) return modelReady;
  modelLoading = true;
  onLoadProgress = progressCallback || null;

  try {
    const { KokoroTTS } = await import('https://esm.sh/kokoro-js@1.1.1');
    const device = await detectDevice();
    const dtype = device === 'webgpu' ? 'fp32' : 'q8';

    console.log(`[TTS] Loading Kokoro model (dtype=${dtype}, device=${device})...`);
    console.log('[TTS] First load is ~160MB download — cached after that');

    tts = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype,
        device,
        progress_callback: (p) => {
          if (onLoadProgress && p.progress !== undefined) {
            onLoadProgress(p);
          }
        }
      }
    );

    modelReady = true;
    modelLoading = false;
    console.log('[TTS] Model loaded! Ready to speak.');
    return true;
  } catch (err) {
    console.error('[TTS] Failed to load model:', err);
    modelLoading = false;
    return false;
  }
}

// ---- AUDIO CONTEXT (must be created on user gesture) ----

export function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ---- PLAY RAW FLOAT32 AUDIO ----

function playAudio(audioData) {
  return new Promise((resolve) => {
    if (!audioCtx || muted || !audioData || audioData.length === 0) {
      resolve();
      return;
    }
    const buffer = audioCtx.createBuffer(1, audioData.length, 24000);
    buffer.getChannelData(0).set(audioData);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode || audioCtx.destination);
    currentSource = source;
    source.onended = () => {
      currentSource = null;
      resolve();
    };
    source.start(0);
  });
}

// ---- EMOTIONAL TEXT TRANSFORMATION ----
// Makes text sound like an excited, high-energy race announcer
// Techniques: short punchy sentences, caps for emphasis, exclamation marks,
// dramatic pauses with "...", and strategic word choice

export function exciteText(text) {
  // Strip HTML tags for TTS
  let t = text.replace(/<[^>]+>/g, '');

  // Amplify existing exclamation/emphasis
  t = t.replace(/!+/g, '!');

  // Add excitement to key racing phrases
  const excitePatterns = [
    [/takes the lead/gi, 'TAKES THE LEAD!'],
    [/neck and neck/gi, 'NECK AND NECK!'],
    [/finishes (\d)(st|nd|rd)/gi, 'FINISHES $1$2!'],
    [/race started/gi, 'THE RACE HAS STARTED!'],
    [/what a race/gi, 'WHAT! A! RACE!'],
    [/virtually tied/gi, 'VIRTUALLY TIED!'],
    [/crossed the finish line/gi, 'CROSSED THE FINISH LINE!'],
    [/hits (\d+)%/gi, 'hits $1 percent!'],
    [/accuracy[:\s]+(\d+)%/gi, 'with $1 percent accuracy!'],
    [/Welcome to/gi, 'WELCOME... to'],
    [/let's race/gi, "LET'S RACE!"],
    [/penalty/gi, '... PENALTY!'],
  ];

  for (const [pattern, replacement] of excitePatterns) {
    t = t.replace(pattern, replacement);
  }

  // Clean up multiple spaces and leading/trailing whitespace
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}


// ============================================================
// MISS COMMENTARY — varied, subject-aware wrong-answer callouts
// ============================================================

// Subject-specific flavor text for when a model misses
const SUBJECT_FLAVOR = {
  'Physics': ['quantum mechanics', 'thermodynamics', 'that tricky physics'],
  'Chemistry': ['molecular bonds', 'organic chemistry', 'chemical reactions'],
  'Biology': ['cellular biology', 'genetics', 'life sciences'],
  'Math': ['calculus', 'number theory', 'that brutal math'],
  'History': ['historical dates', 'world history', 'the history books'],
  'Law': ['legal precedent', 'constitutional law', 'the fine print'],
  'Economics': ['market theory', 'macroeconomics', 'supply and demand'],
  'Philosophy': ['epistemology', 'philosophical logic', 'deep thinking'],
  'Psychology': ['behavioral science', 'cognitive theory', 'the human mind'],
  'Computer Science': ['algorithms', 'data structures', 'computer science'],
  'Engineering': ['structural analysis', 'engineering principles', 'the engineering'],
  'Medicine': ['medical diagnosis', 'clinical knowledge', 'that tough medical question'],
  'Business': ['business strategy', 'management theory', 'the business case'],
  'Sociology': ['social dynamics', 'sociological theory', 'society questions'],
  'Political Science': ['political theory', 'governance', 'political science'],
};

// Template pools — {color} = horse color name, {subject} = subject area,
// {flavor} = subject flavor text, {penalty} = penalty seconds, {qNum} = question number
const MISS_TEMPLATES = [
  // Short punchy reactions
  "OH! {color} gets it WRONG! That {flavor} question was a TOUGH one!",
  "OUCH! {color} stumbles on {subject}! That's a {penalty} second penalty!",
  "NO! {color} misses on {subject}! That'll cost them!",
  "{color} gets BURNED by {flavor}! {penalty} seconds added!",
  "WRONG ANSWER from {color}! {subject} strikes again!",
  "OH NO! {color} whiffs on question {qNum}! A {penalty} second setback!",
  "That {subject} question TRIPS UP {color}! Penalty time!",
  "MISS! {color} can't crack that {flavor} problem!",
  "{color} drops the ball on {subject}! {penalty} seconds, ouch!",
  "UH OH! {color} gets caught by a {subject} curveball!",

  // Dramatic / excited
  "AND {color} gets it WRONG, folks! {flavor} proves TOO MUCH! {penalty} second penalty!",
  "HEARTBREAK for {color}! That {subject} question was a KILLER!",
  "The wheels come off for {color} on {subject}! {penalty} seconds in the box!",
  "{color} takes a HIT! {flavor} claims another VICTIM!",
  "DOWN GOES {color} on question {qNum}! {subject} is UNFORGIVING today!",

  // Commentary style
  "That {subject} question was NO JOKE and {color} just found out! {penalty} second penalty!",
  "{color} was SO CLOSE but {flavor} had other plans!",
  "You HATE to see it! {color} misses on {subject}!",
  "COSTLY mistake from {color}! {penalty} seconds they can NOT afford!",
  "The pressure is ON and {color} cracks on {subject}!",
  "{color} bites the dust on {flavor}! That's gonna hurt!",
  "NOT the answer {color} needed! {subject} adds {penalty} seconds to the clock!",

  // Penalty focused
  "PENALTY! {color} gets {penalty} seconds for that {subject} miss!",
  "{penalty} seconds on the clock for {color}! {flavor} is BRUTAL today!",
  "And that MISS from {color} means {penalty} more seconds of penalty time!",
];

// Correct answer templates (used less frequently, for streaks and milestones)
const CORRECT_STREAK_TEMPLATES = [
  "{color} is ON FIRE! {streak} in a row!",
  "ANOTHER correct answer from {color}! They are ROLLING!",
  "{color} NAILS that {subject} question! What a STREAK!",
  "UNSTOPPABLE! {color} keeps crushing it with {streak} straight!",
  "{color} makes {subject} look EASY! {streak} correct and counting!",
  "The HOT HAND continues for {color}! {streak} in a row, folks!",
  "CAN'T STOP {color}! That's {streak} straight correct answers!",
];

function pickTemplate(templates, recentList) {
  // Filter out recently used templates
  const available = templates.filter((_, i) => !recentList.includes(i));
  // If we've used them all, reset
  const pool = available.length > 0 ? available : templates;
  const idx = templates.indexOf(pool[Math.floor(Math.random() * pool.length)]);

  // Track this template
  recentList.push(idx);
  if (recentList.length > RECENT_MEMORY) recentList.shift();

  return templates[idx];
}

function getSubjectFlavor(subject) {
  const flavors = SUBJECT_FLAVOR[subject] || ['that topic', 'the material', 'the coursework'];
  return flavors[Math.floor(Math.random() * flavors.length)];
}

// Generate commentary for a missed question (fallback templates)
export function generateMissCommentary(horseName, subject, penaltySec, qNum, colorHex) {
  const template = pickTemplate(MISS_TEMPLATES, recentMissTemplates);
  const flavor = getSubjectFlavor(subject);
  const color = COLOR_NAMES[colorHex] || horseName;

  return template
    .replace(/\{color\}/g, color)
    .replace(/\{subject\}/g, subject)
    .replace(/\{flavor\}/g, flavor)
    .replace(/\{penalty\}/g, penaltySec.toFixed(1))
    .replace(/\{qNum\}/g, qNum);
}

// Generate commentary for a hot streak (fallback templates)
export function generateStreakCommentary(horseName, subject, streak, colorHex) {
  const template = pickTemplate(CORRECT_STREAK_TEMPLATES, recentCorrectTemplates);
  const color = COLOR_NAMES[colorHex] || horseName;

  return template
    .replace(/\{color\}/g, color)
    .replace(/\{subject\}/g, subject)
    .replace(/\{streak\}/g, streak);
}

// Reset commentary tracking (on race reset)
export function resetCommentary() {
  recentMissTemplates = [];
  recentCorrectTemplates = [];
}


// ---- SPEAK (QUEUED) ----

export function speak(text) {
  if (!modelReady || muted) return;

  const excitedText = exciteText(text);
  speechQueue.push(excitedText);

  if (!isSpeaking) {
    processQueue();
  }
}

async function processQueue() {
  if (isSpeaking || speechQueue.length === 0 || !tts) return;
  isSpeaking = true;

  while (speechQueue.length > 0) {
    const text = speechQueue.shift();
    if (muted) continue;

    try {
      // Use streaming for longer text (splits on sentences for faster start)
      if (text.length > 80) {
        await speakStreaming(text);
      } else {
        const result = await tts.generate(text, { voice, speed });
        if (!muted && result.audio) {
          await playAudio(result.audio);
        }
      }
    } catch (err) {
      console.warn('[TTS] Speech error:', err.message);
    }
  }

  isSpeaking = false;
}

// ---- STREAMING SPEECH (for longer text) ----

async function speakStreaming(text) {
  if (!tts || muted) return;

  try {
    const stream = tts.stream(text, {
      voice,
      speed,
      split_pattern: /[.!?]+/
    });

    for await (const chunk of stream) {
      if (muted) break;
      if (chunk.audio && chunk.audio.length > 0) {
        await playAudio(chunk.audio);
      }
    }
  } catch (err) {
    console.warn('[TTS] Stream error, falling back:', err.message);
    try {
      const result = await tts.generate(text, { voice, speed });
      if (!muted && result.audio) {
        await playAudio(result.audio);
      }
    } catch (e) {
      console.warn('[TTS] Fallback also failed:', e.message);
    }
  }
}

// ---- CONTROLS ----

export function stop() {
  speechQueue = [];
  if (currentSource) {
    try { currentSource.stop(); } catch (e) { /* ok */ }
    currentSource = null;
  }
  isSpeaking = false;
}

export function setMuted(m) {
  muted = m;
  if (m) stop();
}

export function isMuted() {
  return muted;
}

export function setVoice(v) {
  voice = v;
}

export function getVoice() {
  return voice;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (gainNode) gainNode.gain.value = volume;
}

export function setSpeed(s) {
  speed = Math.max(0.5, Math.min(2.0, s));
}

export function getSpeed() {
  return speed;
}

export function isReady() {
  return modelReady;
}

export function isLoading() {
  return modelLoading;
}

export function listVoices() {
  if (!tts) return [];
  try {
    return Object.keys(tts.voices || {});
  } catch (e) {
    return [];
  }
}
