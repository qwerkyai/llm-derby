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
let voice = 'am_michael';
let speed = 1.0;
let modelLoading = false;
let modelReady = false;
let onLoadProgress = null;

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
    // Use fp32 for webgpu, q8 for wasm (best quality/speed balance)
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
    source.connect(audioCtx.destination);
    currentSource = source;
    source.onended = () => {
      currentSource = null;
      resolve();
    };
    source.start(0);
  });
}

// ---- EMOTIONAL TEXT TRANSFORMATION ----
// Makes text sound like an excited race announcer

export function exciteText(text) {
  // Strip HTML tags for TTS
  let t = text.replace(/<[^>]+>/g, '');

  // Amplify existing exclamation/emphasis
  t = t.replace(/!+/g, '!!');

  // Add excitement to key racing phrases
  const excitePatterns = [
    [/takes the lead/gi, 'TAKES THE LEAD!'],
    [/neck and neck/gi, 'NECK AND NECK!'],
    [/finishes (\d)(st|nd|rd)/gi, 'FINISHES $1$2!'],
    [/race started/gi, 'THE RACE HAS STARTED!'],
    [/what a race/gi, 'WHAT A RACE!'],
    [/virtually tied/gi, 'VIRTUALLY TIED!'],
    [/crossed the finish line/gi, 'CROSSED THE FINISH LINE!'],
    [/hits (\d+)%/gi, 'hits $1 percent!'],
    [/accuracy: (\d+)%/gi, 'with $1 percent accuracy!'],
    [/Welcome to/gi, 'WELCOME to'],
    [/let's race/gi, "LET'S RACE!"],
  ];

  for (const [pattern, replacement] of excitePatterns) {
    t = t.replace(pattern, replacement);
  }

  // Add dramatic pauses before big moments
  t = t.replace(/\b(AND)\b/g, '... AND');
  t = t.replace(/penalty/gi, '... penalty');

  // Clean up multiple spaces and leading/trailing whitespace
  t = t.replace(/\s+/g, ' ').trim();

  return t;
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
      // Use streaming for longer text (splits on sentences)
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
    console.warn('[TTS] Stream error:', err.message);
    // Fallback to non-streaming
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
