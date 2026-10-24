import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKb } from '../scripts/build-data.mjs';
import { retrieve } from '../app/js/core/retrieve.js';
import { composeOffline, buildPrompt, parseModelJson, mergeModelAnswer, codeOnly } from '../app/js/core/answer.js';
import { chatProvider, listProviderModels, PROVIDER_PRESETS } from '../app/js/core/providers.js';

const kb = buildKb();
const input = { question: 'Can my kid wear cleats?', role: 'parent', division: '10U' };
const retrieved = retrieve(kb, input);
const offline = composeOffline(kb, input, retrieved);

/** A fake OpenAI-compatible provider. */
function fakeFetch(reply, calls = []) {
  return async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'paid-model' }, { id: 'free-model:free' }] });
    if (typeof reply === 'function') return reply(calls.at(-1));
    return Response.json({ choices: [{ message: { content: reply } }] });
  };
}

test('presets include Google AI Studio, OpenRouter and Ollama', () => {
  for (const k of ['google', 'openrouter', 'ollama', 'custom']) assert.ok(PROVIDER_PRESETS[k], k);
});

test('chatProvider sends the key, model and JSON mode', async () => {
  const calls = [];
  const text = await chatProvider({ baseUrl: 'https://x.test/v1/', apiKey: 'k1', model: 'm1' }, [{ role: 'user', content: 'hi' }], { fetchImpl: fakeFetch('{"verdict":"ok"}', calls) });
  assert.equal(text, '{"verdict":"ok"}');
  assert.equal(calls[0].url, 'https://x.test/v1/chat/completions');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer k1');
  assert.equal(calls[0].body.model, 'm1');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
});

test('chatProvider retries without JSON mode when a model rejects it', async () => {
  const calls = [];
  const reply = (call) => (call.body.response_format
    ? new Response('{"error":{"message":"json mode not supported"}}', { status: 400 })
    : Response.json({ choices: [{ message: { content: '{"verdict":"ok"}' } }] }));
  await chatProvider({ baseUrl: 'https://x.test/v1', model: 'm' }, [], { fetchImpl: fakeFetch(reply, calls) });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.response_format, undefined);
});

test('chatProvider explains provider errors', async () => {
  const reply = () => new Response('{"error":{"message":"API key not valid"}}', { status: 401 });
  await assert.rejects(chatProvider({ baseUrl: 'https://x.test/v1', model: 'm' }, [], { fetchImpl: fakeFetch(reply) }), /401: API key not valid/);
  await assert.rejects(chatProvider({ baseUrl: 'https://x.test/v1', model: '' }, []), /Pick a model/);
});

test('listProviderModels puts free models first', async () => {
  assert.deepEqual(await listProviderModels({ baseUrl: 'https://x.test/v1' }, { fetchImpl: fakeFetch('') }), ['free-model:free', 'paid-model']);
});

test('parseModelJson finds JSON wrapped in prose or code fences', () => {
  assert.equal(parseModelJson('Sure!\n```json\n{"verdict":"No cleats."}\n```').verdict, 'No cleats.');
  assert.throws(() => parseModelJson('no json here'), /expected format/);
  assert.throws(() => parseModelJson('{"call_type":"rule"}'), /missing/);
});

test('mergeModelAnswer keeps the rules, drops made-up citations, and labels the engine', () => {
  const given = retrieved.house_rules[0].id;
  const out = { call_type: 'rule', verdict: 'Sneakers only on the turf.', teachable_moment: 'Pack turf shoes.', cited_ids: [given, 'H999'] };
  const a = mergeModelAnswer(kb, offline, out, retrieved, { mode: 'device', engine: 'Llama 3.2 1B on this phone' });
  assert.equal(a.verdict, 'Sneakers only on the turf.');
  assert.equal(a.rules[0].id, given);
  assert.deepEqual(a.dropped_citations, ['H999']);
  assert.equal(a.engine, 'Llama 3.2 1B on this phone');
  assert.equal(a.ai_moment, 'Pack turf shoes.');
  assert.deepEqual(a.teachable, offline.teachable); // the team's coaching material is never rewritten
});

test('an unknown call type from the model falls back to the offline one', () => {
  const a = mergeModelAnswer(kb, offline, { call_type: 'vibes', verdict: 'x' }, retrieved, { mode: 'provider', engine: 'e' });
  assert.equal(a.call_type, offline.call_type);
});

test('pitch questions are answered in code, never sent to a model', () => {
  const q = { question: 'He threw 70 pitches, when can he pitch?', role: 'coach', division: '13U' };
  assert.equal(codeOnly(composeOffline(kb, q, retrieve(kb, q))), true);
  assert.equal(codeOnly(offline), false);
});

test('the prompt holds only retrieved rules and tells the model to cite ids', () => {
  const [system, user] = buildPrompt(kb, input, retrieved);
  assert.match(system.content, /Use ONLY the numbered context/);
  assert.match(user.content, /\[H005\]/);
});

test('the phone prompt is compact: at most 3 rules, short guidance', () => {
  const q = { question: 'Can a runner steal home in 10U on a passed ball?', role: 'umpire' };
  const r = retrieve(kb, q);
  const full = buildPrompt(kb, q, r);
  const small = buildPrompt(kb, q, r, { compact: true });
  const count = (m) => (m[1].content.match(/^\[(H|F)\d+\]/gm) || []).length;
  assert.ok(count(small) <= 3);
  assert.ok(small[0].content.length < full[0].content.length);
});

test('every file the offline cache lists exists (a missing one breaks offline install)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const f of list.filter((f) => f !== './')) assert.ok(existsSync(new URL(`../app/${f}`, import.meta.url)), f);
  assert.ok(existsSync(new URL('../app/vendor/web-llm/index.js', import.meta.url)));
});

test('Google-style error arrays are explained too', async () => {
  const reply = () => new Response('[{"error":{"code":400,"message":"Please pass a valid API key"}}]', { status: 400 });
  await assert.rejects(chatProvider({ baseUrl: 'https://x.test/v1', model: 'm' }, [], { fetchImpl: fakeFetch(reply) }), /valid API key/);
});
