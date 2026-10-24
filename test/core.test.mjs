import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKb, parseCsv } from '../scripts/build-data.mjs';
import { computeRest, addDays } from '../app/js/core/pitchRest.js';
import { retrieve, resolveDivision, tokenize } from '../app/js/core/retrieve.js';
import { composeOffline, classifyCall, checkCitations } from '../app/js/core/answer.js';

const kb = buildKb();

test('csv parser handles quotes, commas and newlines', () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi""\nthere"\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"\nthere' }]);
});

test('kb has the three Sunshine divisions and only Little League baseball facts', () => {
  assert.deepEqual(kb.league.divisions.map((d) => d.id), ['10U', '13U', '18U']);
  assert.ok(kb.ll_facts.length > 30);
  for (const f of kb.ll_facts) assert.ok((f.age_max ?? 99) >= 8 && (f.age_min ?? 0) <= 18, f.id);
});

test('ages map to divisions', () => {
  assert.equal(resolveDivision(kb.league, { age: 8 }).id, '10U');
  assert.equal(resolveDivision(kb.league, { age: 13 }).id, '13U');
  assert.equal(resolveDivision(kb.league, { age: 18 }).id, '18U');
  assert.equal(resolveDivision(kb.league, { age: 19 }), null);
});

test('pitch rest: 12-year-old, 70 pitches on a Tuesday -> 4 days, eligible Sunday', () => {
  const r = computeRest(kb, { age: 12, pitches: 70, pitchedOn: '2026-06-09' });
  assert.equal(r.ok, true);
  assert.equal(r.rest_days, 4);
  assert.equal(r.eligible_on, '2026-06-14');
  assert.equal(r.daily_max, 85);
});

test('pitch rest: 20 pitches needs no rest day', () => {
  const r = computeRest(kb, { age: 10, pitches: 20, pitchedOn: '2026-06-09' });
  assert.equal(r.rest_days, 0);
  assert.equal(r.eligible_on, '2026-06-10');
});

test('pitch rest: over the daily limit is flagged', () => {
  const r = computeRest(kb, { age: 9, pitches: 80, pitchedOn: '2026-06-09' });
  assert.equal(r.over_limit, true);
});

test('pitch rest: ages 17-18 are a known gap, not a guess', () => {
  const r = computeRest(kb, { age: 17, pitches: 50, pitchedOn: '2026-06-09' });
  assert.equal(r.ok, false);
  assert.equal(r.gap, true);
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2026-06-29', 4), '2026-07-03');
});

test('tokenize expands everyday words to rule topics', () => {
  assert.ok(tokenize('Can my kid steal?').includes('baserunning'));
});

test('judgment questions are labeled as the umpire\'s call and cite the protest rule', () => {
  const input = { question: 'Can I argue the umpire\'s strike zone?', role: 'parent', age: 10 };
  const a = composeOffline(kb, input, retrieve(kb, input));
  assert.match(a.call_type, /judgment/);
  assert.ok(a.rules.some((r) => r.id === 'F015'));
});

test('a pitch count in the question is computed in code', () => {
  const input = { question: 'He threw 70 pitches today, when can he pitch again?', role: 'coach', age: 12 };
  const a = composeOffline(kb, input, retrieve(kb, input));
  assert.equal(a.pitch_rest.rest_days, 4);
  assert.match(a.verdict, /4 calendar days/);
});

test('coaching questions get a lesson or tip', () => {
  const input = { question: 'My son struck out and is upset. How do I help him?', role: 'parent', age: 9 };
  const r = retrieve(kb, input);
  assert.equal(classifyCall(input.question, r), 'coaching');
  const a = composeOffline(kb, input, r);
  assert.ok(a.lesson || a.tip);
});

test('placeholder house rules are never cited as rules', () => {
  const input = { question: 'How many innings is a game?', role: 'coach', division: '13U' };
  const a = composeOffline(kb, input, retrieve(kb, input));
  for (const r of a.rules) assert.ok(!r.id.startsWith('H') || kb.house_rules.find((h) => h.id === r.id).text);
});

test('model citations outside the given context are dropped', () => {
  const r = retrieve(kb, { question: 'courtesy runner', role: 'coach', division: '13U' });
  const given = r.ll_facts[0].id;
  const { cited, dropped } = checkCitations({ cited_ids: [given, 'F999'] }, r);
  assert.deepEqual(cited, [given]);
  assert.deepEqual(dropped, ['F999']);
});
