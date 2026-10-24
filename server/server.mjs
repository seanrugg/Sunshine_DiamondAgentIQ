#!/usr/bin/env node
// Sunshine DiamondAgentIQ server. Zero npm dependencies (Node 22+).
// - Serves the app in ../app (so one process is the whole demo on a VPS).
// - POST /api/ask: retrieves from kb.json, asks an OpenAI-compatible model if
//   LLM_BASE_URL is set, checks its citations, and falls back to the offline
//   answer on any failure. Without LLM_BASE_URL it returns the offline answer.
// - GET /api/health: { ok, llm, model, kb }.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieve } from '../app/js/core/retrieve.js';
import { composeOffline, buildPrompt, checkCitations, citationOf, CALL_LABELS } from '../app/js/core/answer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const LLM = {
  baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/$/, ''), // e.g. http://localhost:11434/v1 (Ollama)
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'llama3.2:3b',
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
};

export const kb = JSON.parse(readFileSync(join(ROOT, 'data', 'kb.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, limit = 16_000) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  return JSON.parse(data || '{}');
}

function cleanInput(body) {
  const question = String(body.question || '').trim().slice(0, 1000);
  if (!question) throw Object.assign(new Error('question is required'), { status: 400 });
  const role = ['parent', 'coach', 'player', 'umpire'].includes(body.role) ? body.role : 'parent';
  const age = Number.isFinite(Number(body.age)) && body.age !== '' && body.age != null ? Number(body.age) : undefined;
  const division = typeof body.division === 'string' ? body.division : undefined;
  return { question, role, age, division };
}

async function callModel(messages) {
  const r = await fetch(`${LLM.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(LLM.apiKey ? { Authorization: `Bearer ${LLM.apiKey}` } : {}) },
    body: JSON.stringify({ model: LLM.model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(LLM.timeoutMs),
  });
  if (!r.ok) throw new Error(`model HTTP ${r.status}`);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('model returned no JSON');
  return JSON.parse(m[0]);
}

export async function answer(input) {
  const retrieved = retrieve(kb, input);
  const offline = composeOffline(kb, input, retrieved);
  if (!LLM.baseUrl || offline.pitch_rest?.ok || offline.pitch_rest?.gap) return offline; // pitch math stays in code

  try {
    const out = await callModel(buildPrompt(kb, input, retrieved));
    const { cited, dropped } = checkCitations(out, retrieved);
    if (!out.verdict) throw new Error('model answer missing verdict');
    const callType = CALL_LABELS[out.call_type] ? out.call_type : offline.call_type;
    return {
      ...offline,
      mode: 'llm',
      model: LLM.model,
      call_type: callType,
      call_label: CALL_LABELS[callType],
      verdict: String(out.verdict),
      for_role: out.for_role ? { label: offline.for_role?.label || 'For you', text: String(out.for_role) } : offline.for_role,
      lesson: out.life_lesson && offline.lesson ? { ...offline.lesson, life_lesson: String(out.life_lesson) } : offline.lesson,
      // Only show sources the model actually cited, from what it was given.
      rules: cited.length ? offline.rules.filter((r) => cited.includes(r.id)).concat(
        [...retrieved.house_rules, ...retrieved.rule_facts].filter((x) => cited.includes(x.id) && !offline.rules.some((r) => r.id === x.id))
          .map((x) => ({ text: x.text, ...citationOf(x, kb) })),
      ) : offline.rules,
      dropped_citations: dropped,
    };
  } catch (err) {
    return { ...offline, mode: 'offline', fallback_reason: String(err.message || err) };
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

export const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.url === '/api/health') {
      return send(res, 200, { ok: true, llm: !!LLM.baseUrl, model: LLM.baseUrl ? LLM.model : null, kb: kb.built_at, league: kb.league.name });
    }
    if (req.url === '/api/ask' && req.method === 'POST') {
      const input = cleanInput(await readJson(req));
      const started = Date.now();
      const out = await answer(input);
      console.log(JSON.stringify({ at: new Date().toISOString(), role: input.role, division: out.division, mode: out.mode, call: out.call_type, ms: Date.now() - started }));
      return send(res, 200, out);
    }
    if (req.method === 'GET') return serveStatic(req, res);
    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    send(res, err.status || 500, { error: err.status ? err.message : 'server error' });
    if (!err.status) console.error(err);
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, HOST, () => {
    console.log(`Sunshine DiamondAgentIQ on http://${HOST}:${PORT}  (model: ${LLM.baseUrl ? `${LLM.model} @ ${LLM.baseUrl}` : 'none, offline answers'})`);
  });
}
