import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKb } from '../scripts/build-data.mjs';
import { retrieve } from '../app/js/core/retrieve.js';
import { composeOffline, buildPrompt } from '../app/js/core/answer.js';

const kb = buildKb();
const ask = (input) => composeOffline(kb, input, retrieve(kb, input));

test('every answer carries a teachable moment with a next step or a lesson', () => {
  const qs = [
    ['parent', 'My son struck out looking to end the game. How do I help him?'],
    ['coach', 'Can a courtesy runner run for my catcher?'],
    ['umpire', 'A parent keeps yelling about balls and strikes. What do I do?'],
    ['player', 'I made the last out. How do I get past it?'],
    ['parent', 'Can my kid wear cleats?'],
    ['coach', 'How many mound visits do I get?'],
  ];
  for (const [role, question] of qs) {
    const t = ask({ question, role, division: '13U' }).teachable;
    assert.ok(t, question);
    assert.ok(t.moment.length > 40, question);
    assert.ok(t.lesson || t.principle, question);
    assert.ok(t.channel.who && t.channel.how, question);
  }
});

test('the strikeout moment teaches failure as information, for every role, asker first', () => {
  const t = ask({ question: 'My son struck out looking to end the game. How do I help him?', role: 'parent', division: '10U' }).teachable;
  assert.equal(t.lesson.id, 'L008');
  assert.equal(t.perspectives[0].role, 'parent');
  for (const r of ['player', 'parent', 'coach']) assert.ok(t.perspectives.some((p) => p.role === r), r);
  assert.match(t.next_step, /\w/);
});

test('a judgment-call moment points the parent away from the umpire and toward the ride home', () => {
  const a = ask({ question: 'Can I tell the umpire he missed a call?', role: 'parent', division: '10U' });
  assert.match(a.teachable.channel.how, /only head coaches discuss calls/);
  assert.match(a.teachable.channel.how, /ride home/);
});

test('game situations come with the moment they describe', () => {
  const t = ask({ question: 'The catcher dropped strike three with bases loaded and 2 outs and our runners stopped', role: 'coach', division: '13U' }).teachable;
  assert.equal(t.situation.id, 'SIT001');
  const f = ask({ question: 'The ball rolled foul and then came back fair and I stopped running', role: 'player', division: '13U' }).teachable;
  assert.equal(f.situation.id, 'SIT005');
});

test('plain rule questions teach from the philosophy or the ballpark, not an unrelated lesson', () => {
  assert.match(ask({ question: 'Can my kid wear cleats?', role: 'parent', division: '10U' }).teachable.principle.text, /Safety and health come first/);
  assert.match(ask({ question: 'Can players chew gum in the dugout?', role: 'parent', division: '10U' }).teachable.principle.text, /protect and enjoy/);
});

test('the coach story only appears when it fits', () => {
  assert.equal(ask({ question: 'Can my kid wear cleats?', role: 'parent', division: '10U' }).teachable.story, null);
  assert.equal(ask({ question: 'My hitter is scared of the ball', role: 'coach', division: '10U' }).teachable.story?.id, 'ST001');
});

test('the AI prompt carries the teachable-moment lesson and asks for the moment', () => {
  const input = { question: 'My son struck out looking to end the game.', role: 'parent', division: '10U' };
  const r = retrieve(kb, input);
  const [system, user] = buildPrompt(kb, input, r, { teach: composeOffline(kb, input, r).teachable });
  assert.match(user.content, /TEACHABLE MOMENT LESSON "A game built on failure"/);
  assert.match(system.content, /"teachable_moment"/);
  assert.match(system.content, /Failure is information, not identity/);
});
