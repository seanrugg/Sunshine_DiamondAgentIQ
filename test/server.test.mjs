import { test, after } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.LLM_BASE_URL; // offline answers only, no network
const { server } = await import('../server/server.mjs');
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('health reports the league and no model', async () => {
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.ok, true);
  assert.equal(h.llm, false);
  assert.equal(h.league, 'Sunshine Baseball League');
});

test('ask returns an offline answer', async () => {
  const r = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Which bats can my 9 year old use?', role: 'parent', age: 9 }),
  });
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.equal(a.mode, 'offline');
  assert.ok(a.verdict.length > 20);
});

test('ask rejects an empty question', async () => {
  const r = await fetch(`${base}/api/ask`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 400);
});

test('serves the app and blocks path traversal', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/data/kb.json`)).status, 200);
  const r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.notEqual(r.status, 200);
});
