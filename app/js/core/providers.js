// AI providers the user can connect: any OpenAI-compatible chat endpoint.
// Pure fetch, so it runs in the browser and in Node tests. The API key never
// leaves the user's device except in the request to the provider they chose.

export const PROVIDER_PRESETS = {
  google: {
    label: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    hint: 'Free tier available. Get a key at aistudio.google.com.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'Many models, some free (names ending in ":free").',
  },
  ollama: {
    label: 'Ollama on this computer',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    keyUrl: null,
    hint: 'Start Ollama with OLLAMA_ORIGINS=* so the app can reach it. Desktop only.',
  },
  custom: {
    label: 'Other (OpenAI-compatible)',
    baseUrl: '',
    needsKey: false,
    keyUrl: null,
    hint: 'Any endpoint that speaks the OpenAI chat completions format.',
  },
};

function headers(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  if (/openrouter\.ai/.test(cfg.baseUrl)) h['X-Title'] = 'Sunshine DiamondAgentIQ';
  return h;
}

const base = (cfg) => String(cfg.baseUrl || '').replace(/\/+$/, '');

/** List model ids the provider offers (free OpenRouter models first). */
export async function listProviderModels(cfg, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const r = await fetchImpl(`${base(cfg)}/models`, { headers: headers(cfg), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`The provider said ${r.status} ${r.statusText || ''}`.trim());
  const j = await r.json();
  const ids = (j.data || j.models || []).map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
  return ids.sort((a, b) => (b.endsWith(':free') - a.endsWith(':free')) || a.localeCompare(b));
}

/** One chat completion. Returns the message text. */
export async function chatProvider(cfg, messages, { fetchImpl = fetch, timeoutMs = 45000, json = true } = {}) {
  if (!base(cfg)) throw new Error('No provider address set.');
  if (!cfg.model) throw new Error('Pick a model first.');
  const body = { model: cfg.model, messages, temperature: 0.2, max_tokens: 500 };
  if (json) body.response_format = { type: 'json_object' };
  let r = await fetchImpl(`${base(cfg)}/chat/completions`, {
    method: 'POST', headers: headers(cfg), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  // Some models reject response_format; retry once without it.
  if (r.status === 400 && json) {
    delete body.response_format;
    r = await fetchImpl(`${base(cfg)}/chat/completions`, {
      method: 'POST', headers: headers(cfg), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
  }
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = (Array.isArray(j) ? j[0] : j)?.error?.message || ''; } catch { /* not json */ }
    throw new Error(`The provider said ${r.status}${detail ? `: ${detail}` : ''}`);
  }
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('The provider sent back an empty answer.');
  return text;
}
