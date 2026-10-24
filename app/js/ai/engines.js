// The four ways the app can answer, cheapest first:
//   offline  - rules only, no AI. Works on every phone, including the oldest.
//   device   - a small AI model downloaded once and run on this phone (WebGPU).
//   provider - the user's own AI provider and key (Google AI Studio, OpenRouter, Ollama…).
//   server   - the league's server, if the league runs one.
// Every tier starts from the same offline answer; AI only rewrites the wording.
import { retrieve } from '../core/retrieve.js';
import { composeOffline, buildPrompt, parseModelJson, mergeModelAnswer, codeOnly } from '../core/answer.js';
import { chatProvider } from '../core/providers.js';

export const TIERS = {
  offline: { label: 'Offline', short: 'Offline' },
  device: { label: 'AI on this phone', short: 'Phone AI' },
  provider: { label: 'My AI provider', short: 'My AI' },
  server: { label: 'League server', short: 'League AI' },
};

// Small models that run in a phone browser. Sizes are approximate.
export const DEVICE_MODELS = [
  {
    id: 'llama-1b', label: 'Llama 3.2 1B (recommended)', download: 'about 0.7 GB', memMB: { f16: 879, f32: 1129 },
    ids: { f16: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC' },
    note: 'Best balance for most newer phones.',
  },
  {
    id: 'gemma-1b', label: 'Gemma 3 1B (smallest)', download: 'about 0.7 GB', memMB: { f16: 711 },
    ids: { f16: 'gemma3-1b-it-q4f16_1-MLC' },
    note: 'Uses the least memory. Needs a phone GPU with 16-bit support.',
  },
  {
    id: 'llama-3b', label: 'Llama 3.2 3B (tablets and laptops)', download: 'about 1.8 GB', memMB: { f16: 2264, f32: 2952 },
    ids: { f16: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-3B-Instruct-q4f32_1-MLC' },
    note: 'Better answers, but too big for most phones.',
  },
];

const KEY = 'sdiq.ai.v1';
const DEFAULTS = {
  tier: 'offline',
  chosen: false,                 // has the user picked a tier yet (first-run card)
  device: { model: 'llama-1b' },
  provider: { preset: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: '', model: '' },
  server: { url: '' },
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULTS, ...saved,
      device: { ...DEFAULTS.device, ...saved.device },
      provider: { ...DEFAULTS.provider, ...saved.provider },
      server: { ...DEFAULTS.server, ...saved.server },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings last this session */ }
}

// ---------- what can this phone do? ----------
let deviceInfo = null;

/** Checks WebGPU, 16-bit GPU support, memory and free storage. Never throws. */
export async function detectDevice() {
  if (deviceInfo) return deviceInfo;
  const info = { webgpu: false, f16: false, memoryGB: navigator.deviceMemory ?? null, freeMB: null, reason: '' };
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) info.freeMB = Math.round((est.quota - (est.usage || 0)) / 1e6);
  } catch { /* unknown */ }
  try {
    if (!('gpu' in navigator)) {
      info.reason = "This browser can't run AI on the phone (no WebGPU). Offline answers or an AI provider will work.";
    } else {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) info.reason = "This phone's graphics chip isn't available to the browser. Offline answers or an AI provider will work.";
      else {
        info.webgpu = true;
        info.f16 = adapter.features.has('shader-f16');
        info.maxBufferMB = Math.round((adapter.limits?.maxBufferSize || 0) / 1e6);
      }
    }
  } catch {
    info.reason = "This phone couldn't start its graphics chip for AI. Offline answers or an AI provider will work.";
  }
  if (info.webgpu && info.memoryGB !== null && info.memoryGB < 4) {
    info.reason = `This phone reports ${info.memoryGB} GB of memory. An AI model may not fit; offline answers are the safe choice.`;
    info.lowMemory = true;
  }
  info.recommended = info.webgpu && !info.lowMemory ? 'device' : 'offline';
  deviceInfo = info;
  return info;
}

/** Which exact model build to use on this phone, or null if it can't run it. */
export function pickBuild(modelKey, info) {
  const m = DEVICE_MODELS.find((x) => x.id === modelKey) || DEVICE_MODELS[0];
  if (!info?.webgpu) return null;
  const precision = info.f16 && m.ids.f16 ? 'f16' : m.ids.f32 ? 'f32' : null;
  if (!precision) return null;
  return { ...m, modelId: m.ids[precision], precision, needMB: m.memMB[precision] };
}

// ---------- the phone model ----------
let webllm = null;     // the vendored library, loaded only when needed
let engine = null;     // the running engine
let engineModel = null;
let starting = null;   // { modelId, promise } while a model is loading, so callers share one load

async function lib() {
  webllm ??= await import('../../vendor/web-llm/index.js');
  return webllm;
}

export async function isDownloaded(modelId) {
  try { return await (await lib()).hasModelInCache(modelId); } catch { return false; }
}

/**
 * Download (first time) and start the model. onProgress gets { progress 0-1, text }.
 * The files are kept in the browser's storage, so after this the model works offline.
 */
export async function startDeviceModel(modelId, onProgress = () => {}) {
  if (engine && engineModel === modelId) return engine;
  if (starting?.modelId === modelId) {
    starting.listeners.push(onProgress);
    return starting.promise;
  }
  const listeners = [onProgress];
  const promise = (async () => {
    try { await navigator.storage?.persist?.(); } catch { /* best effort: ask the browser not to evict the model */ }
    const { CreateWebWorkerMLCEngine } = await lib();
    if (engine) { try { await engine.unload(); } catch { /* ignore */ } }
    engine = null;
    const worker = new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' });
    const e = await CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (p) => listeners.forEach((fn) => fn({ progress: p.progress ?? 0, text: p.text || '' })),
    });
    engine = e;
    engineModel = modelId;
    return e;
  })();
  starting = { modelId, promise, listeners };
  try {
    return await promise;
  } finally {
    if (starting?.promise === promise) starting = null;
  }
}

export async function deleteDeviceModel(modelId) {
  if (engine && engineModel === modelId) { try { await engine.unload(); } catch { /* ignore */ } engine = null; engineModel = null; }
  await (await lib()).deleteModelAllInfoInCache(modelId);
}

// A slow or busy phone falls back to the offline answer instead of hanging.
// The clock covers loading the model and writing the answer; a model that is
// still loading keeps loading in the background for the next question.
const DEVICE_TIMEOUT_MS = 90000;

async function chatDevice(modelId, messages) {
  let timer;
  let e = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { e?.interruptGenerate(); } catch { /* ignore */ }
      reject(new Error(e ? 'The phone AI took too long on this phone' : 'The phone AI is still starting up; try again in a moment'));
    }, DEVICE_TIMEOUT_MS);
  });
  try {
    const run = (async () => {
      e = await startDeviceModel(modelId);
      return e.chat.completions.create({ messages, temperature: 0.2, max_tokens: 300, response_format: { type: 'json_object' } });
    })();
    run.catch(() => {}); // if the clock wins, a late failure shouldn't surface as an error
    const r = await Promise.race([run, timeout]);
    return r.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

// ---------- league server ----------
/** url '' means the server that served this app. */
export async function checkServer(url) {
  const r = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`The server said ${r.status}`);
  return r.json();
}

async function askServer(url, input) {
  const r = await fetch(`${url.replace(/\/+$/, '')}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`The league server said ${r.status}`);
  return r.json();
}

// ---------- one entry point for the app ----------
/**
 * Answer a question with the chosen tier, falling back to the offline answer
 * (with fallback_reason set) whenever the AI can't be reached or misbehaves.
 */
export async function answerQuestion(kb, input, settings, info) {
  const retrieved = retrieve(kb, input);
  const offline = composeOffline(kb, input, retrieved);
  const tier = settings.tier;
  if (tier === 'offline' || codeOnly(offline)) return offline;

  try {
    if (tier === 'server') {
      return await askServer(settings.server.url, input);
    }
    // Phones get a shorter prompt: less to read means a faster answer.
    const messages = buildPrompt(kb, input, retrieved, { compact: tier === 'device', teach: offline.teachable });
    let text, engineLabel;
    if (tier === 'device') {
      const build = pickBuild(settings.device.model, info);
      if (!build) throw new Error("This phone can't run the AI model.");
      text = await chatDevice(build.modelId, messages);
      engineLabel = `${build.label.replace(/ \(.*\)$/, '')} on this phone`;
    } else {
      text = await chatProvider(settings.provider, messages);
      engineLabel = `${settings.provider.model} via your provider`;
    }
    return mergeModelAnswer(kb, offline, parseModelJson(text), retrieved, { mode: tier, engine: engineLabel });
  } catch (err) {
    return { ...offline, fallback_reason: String(err.message || err) };
  }
}
