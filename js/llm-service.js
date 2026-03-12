// ============================================================
// LLM SERVICE — WebLLM + SmolLM2-360M for dynamic commentary
// Runs entirely in the browser (WebGPU inference)
// ============================================================

let engine = null;
let llmReady = false;
let llmLoading = false;

// Color nicknames for each horse (by color hex)
const COLOR_NAMES = {
  '#6d8cff': 'Blue',
  '#ff5e8a': 'Pink',
  '#00d4a0': 'Green',
  '#f0a030': 'Orange',
};

function getColorName(color) {
  return COLOR_NAMES[color] || 'that horse';
}

// ---- INIT & MODEL LOADING ----

export async function init(progressCallback) {
  if (llmReady || llmLoading) return llmReady;
  llmLoading = true;

  try {
    const webllm = await import('https://esm.sh/@mlc-ai/web-llm@0.2.78');

    const modelId = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        if (progressCallback) {
          progressCallback({
            progress: report.progress ? report.progress * 100 : undefined,
            text: report.text || 'Loading LLM...',
          });
        }
      },
    });

    llmReady = true;
    llmLoading = false;
    console.log('[LLM] SmolLM2-360M loaded! Ready for commentary.');
    return true;
  } catch (err) {
    console.error('[LLM] Failed to load model:', err);
    llmLoading = false;
    return false;
  }
}

// ---- GENERATE COMMENTARY ----

// Fast, non-blocking commentary generation with timeout
export async function generateCommentary(prompt, timeoutMs = 3000) {
  if (!llmReady || !engine) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const reply = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an excited, fast-talking horse race announcer calling an AI model benchmark race. Refer to horses ONLY by their color (Blue, Pink, Green) — NEVER use model names. Keep responses to 1-2 SHORT punchy sentences. Use CAPS for emphasis. Be dramatic and entertaining. No quotation marks in output.`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 60,
      temperature: 0.9,
      top_p: 0.95,
    });

    clearTimeout(timer);

    const text = reply.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 5) return null;

    // Clean up any quotes the model might add
    return text.replace(/^["']|["']$/g, '').replace(/\n/g, ' ');
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[LLM] Generation error:', err.message);
    }
    return null;
  }
}

// ---- SPECIFIC COMMENTARY GENERATORS ----

export async function generateMiss(colorHex, subject, penaltySec, qNum) {
  const color = getColorName(colorHex);
  const prompt = `${color} just got question ${qNum} WRONG on ${subject}! They get a ${penaltySec.toFixed(1)} second penalty. Give an excited announcer reaction.`;
  return generateCommentary(prompt);
}

export async function generateStreak(colorHex, subject, streak) {
  const color = getColorName(colorHex);
  const prompt = `${color} just got ${streak} answers correct in a row! Their latest correct was ${subject}. Give an excited announcer reaction about their hot streak.`;
  return generateCommentary(prompt);
}

export async function generateLeadChange(colorHex) {
  const color = getColorName(colorHex);
  const prompt = `${color} just TOOK THE LEAD in the race! Give a dramatic announcer call.`;
  return generateCommentary(prompt);
}

export async function generateFinish(colorHex, place, accuracy) {
  const color = getColorName(colorHex);
  const suffix = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : '4th';
  const prompt = `${color} just crossed the finish line in ${suffix} place with ${accuracy}% accuracy! ${place === 1 ? 'They WIN!' : ''} Give an announcer reaction.`;
  return generateCommentary(prompt);
}

export async function generateNeckAndNeck(color1Hex, color2Hex) {
  const c1 = getColorName(color1Hex);
  const c2 = getColorName(color2Hex);
  const prompt = `${c1} and ${c2} are NECK AND NECK, virtually tied! Give an excited announcer call about how close this race is.`;
  return generateCommentary(prompt);
}

// ---- STATE ----

export function isReady() {
  return llmReady;
}

export function isLoading() {
  return llmLoading;
}
