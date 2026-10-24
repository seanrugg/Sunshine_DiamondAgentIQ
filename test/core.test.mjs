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

test('kb has the three divisions, each on its own rulebook', () => {
  assert.deepEqual(kb.league.divisions.map((d) => [d.id, d.base_sanction]),
    [['10U', 'little_league'], ['13U', 'little_league'], ['18U', 'babe_ruth_league']]);
  for (const f of kb.rule_facts) assert.ok(['little_league', 'babe_ruth_league'].includes(f.sanction), f.id);
});

test('every Sunshine house rule is loaded with text and a division', () => {
  assert.equal(kb.house_rules.length, 39);
  for (const h of kb.house_rules) {
    assert.ok(h.text, h.id);
    for (const d of h.divisions) assert.ok(['all', '10U', '13U', '18U'].includes(d), `${h.id} ${d}`);
  }
});

test('ages and named divisions map to divisions', () => {
  assert.equal(resolveDivision(kb.league, { age: 8 }).id, '10U');
  assert.equal(resolveDivision(kb.league, { age: 13 }).id, '13U');
  assert.equal(resolveDivision(kb.league, { age: 18 }).id, '18U');
  assert.equal(resolveDivision(kb.league, { age: 19 }), null);
  assert.equal(resolveDivision(kb.league, { age: 9, question: 'in 18u can you slide headfirst?' }).id, '18U');
});

test('pitch rest: 13U, 70 pitches on a Tuesday -> 4 days, eligible Sunday, limit 85', () => {
  const r = computeRest(kb, { age: 12, pitches: 70, pitchedOn: '2026-06-09' });
  assert.equal(r.division, '13U');
  assert.equal(r.rest_days, 4);
  assert.equal(r.eligible_on, '2026-06-14');
  assert.equal(r.daily_max, 85);
});

test('pitch rest: a 13-year-old uses the Sunshine 85 limit, not Little League 95', () => {
  const r = computeRest(kb, { age: 13, pitches: 90, pitchedOn: '2026-06-09' });
  assert.equal(r.daily_max, 85);
  assert.equal(r.over_limit, true);
});

test('pitch rest: 10U, 20 pitches needs no rest; 80 is over the 75 limit', () => {
  assert.equal(computeRest(kb, { division: '10U', pitches: 20, pitchedOn: '2026-06-09' }).eligible_on, '2026-06-10');
  assert.equal(computeRest(kb, { age: 9, pitches: 80 }).over_limit, true);
});

test('pitch rest: 18U uses the house table (105 limit, 3 days for 76-105)', () => {
  const r = computeRest(kb, { age: 17, pitches: 90, pitchedOn: '2026-06-09' });
  assert.equal(r.division, '18U');
  assert.equal(r.daily_max, 105);
  assert.equal(r.rest_days, 3);
  assert.equal(computeRest(kb, { age: 16, pitches: 25 }).rest_days, 0); // board: 25 or fewer, no rest
  assert.equal(computeRest(kb, { age: 16, pitches: 26 }).rest_days, 1);
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2026-06-29', 4), '2026-07-03');
});

test('tokenize expands everyday words to rule topics', () => {
  assert.ok(tokenize('Can my kid steal?').includes('baserunning'));
});

const ask = (input) => composeOffline(kb, input, retrieve(kb, input));
const top = (a) => a.rules[0]?.id;

test('judgment questions are labeled as the umpire\'s call and cite the Sunshine umpire rule', () => {
  const a = ask({ question: 'Can I argue the umpire\'s strike zone?', role: 'parent', age: 10 });
  assert.match(a.call_type, /judgment/);
  assert.ok(a.rules.some((r) => r.id === 'H035'));
});

test('a pitch count in the question is computed in code from the house rule', () => {
  const a = ask({ question: 'He threw 70 pitches today, when can he pitch again?', role: 'coach', age: 12 });
  assert.equal(a.pitch_rest.rest_days, 4);
  assert.match(a.verdict, /13U house rule/);
});

test('house rules answer house-rule questions, by division', () => {
  assert.equal(top(ask({ question: 'Can my kid wear cleats?', role: 'parent', division: '10U' })), 'H005');
  assert.equal(top(ask({ question: 'Can he wear cleats?', role: 'parent', division: '18U' })), 'H006');
  assert.equal(top(ask({ question: 'Which dugout is home?', role: 'coach', division: '18U' })), 'H009');
  assert.equal(top(ask({ question: 'A player shows up late. Where does he bat?', role: 'coach', division: '13U' })), 'H010');
  assert.equal(top(ask({ question: 'We only have 7 players, is it a forfeit?', role: 'coach', division: '13U' })), 'H014');
  assert.equal(top(ask({ question: 'Can a runner steal home in 10U?', role: 'umpire' })), 'H023');
  assert.equal(top(ask({ question: 'Can players chew gum or eat sunflower seeds in the dugout?', role: 'parent', division: '10U' })), 'H007');
  assert.equal(top(ask({ question: 'How do I get a pool player?', role: 'coach', division: '13U' })), 'H039');
  assert.equal(top(ask({ question: 'How many warm-up pitches?', role: 'umpire', division: '13U' })), 'H027');
  assert.match(ask({ question: 'Can he wear cleats?', role: 'parent', division: '18U' }).verdict, /James Monroe/);
});

test('a house rule hides the rulebook facts it overrides', () => {
  const a = ask({ question: 'What bats are legal?', role: 'parent', age: 9 });
  assert.equal(top(a), 'H003');
  assert.ok(!a.rules.some((r) => r.label.startsWith('Little League') && /bat/i.test(r.text)));
  const d = ask({ question: 'Can the batter run on a dropped third strike?', role: 'player', division: '13U' });
  assert.equal(top(d), 'H022');
});

test('18U falls back to Babe Ruth, never Little League', () => {
  const a = ask({ question: 'How far are the bases?', role: 'coach', division: '18U' });
  assert.ok(a.rules.every((r) => !r.label.includes('Little League')));
});

test('coaching questions get a lesson or tip', () => {
  const input = { question: 'My son struck out and is upset. How do I help him?', role: 'parent', age: 9 };
  const r = retrieve(kb, input);
  assert.equal(classifyCall(input.question, r), 'coaching');
  const a = composeOffline(kb, input, r);
  assert.ok(a.teachable.lesson && a.teachable.next_step);
});

test('game length differs by division', () => {
  assert.match(ask({ question: 'How many innings is a game?', role: 'coach', division: '13U' }).verdict, /six innings/);
  assert.match(ask({ question: 'How many innings is a game?', role: 'coach', division: '18U' }).verdict, /seven innings/);
});

test('model citations outside the given context are dropped', () => {
  const r = retrieve(kb, { question: 'courtesy runner', role: 'coach', division: '13U' });
  const given = r.rule_facts[0].id;
  const { cited, dropped } = checkCitations({ cited_ids: [given, 'F999'] }, r);
  assert.deepEqual(cited, [given]);
  assert.deepEqual(dropped, ['F999']);
});

test('Little League is the fallback when the house rules do not cover the question directly', () => {
  const a = ask({ question: 'Can a courtesy runner run for my catcher?', role: 'coach', division: '13U' });
  assert.match(a.verdict, /house rules don't cover this directly, so the Little League rules apply/);
  assert.equal(top(a), 'F019');                              // the Little League courtesy-runner rule leads
  assert.ok(a.rules.some((r) => r.id === 'H001'));           // the house rule that names Little League as the fallback
  const c = ask({ question: 'Can my catcher pitch after catching 4 innings?', role: 'coach', division: '13U' });
  assert.equal(top(c), 'F008');
});

test('a house rule still leads when it covers the question', () => {
  const a = ask({ question: 'Can my kid wear cleats?', role: 'parent', division: '10U' });
  assert.match(a.verdict, /^Sunshine's house rule covers this/);
});

test('questions neither rulebook in the app answers point to the full rulebook, not a loose match', () => {
  for (const question of ['How many mound visits do I get?', 'What happens with an infield fly?', 'Can my player bunt?']) {
    const a = ask({ question, role: 'coach', division: '13U' });
    assert.match(a.verdict, /full Little League rulebook applies/, question);
  }
  assert.match(ask({ question: 'Can a courtesy runner run for my catcher?', role: 'coach', division: '18U' }).verdict, /Babe Ruth League rulebook/);
});
