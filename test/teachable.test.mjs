import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKb } from '../scripts/build-data.mjs';
import { retrieve } from '../app/js/core/retrieve.js';
import { composeOffline, buildPrompt } from '../app/js/core/answer.js';

const kb = buildKb();
const ask = (input) => composeOffline(kb, input, retrieve(kb, input));

test('coaching and judgment moments carry the full teachable moment', () => {
  for (const [role, question] of [
    ['parent', 'My son struck out looking to end the game. How do I help him?'],
    ['umpire', 'A parent keeps yelling about balls and strikes. What do I do?'],
    ['player', 'I made the last out. How do I get past it?'],
  ]) {
    const t = ask({ question, role, division: '13U' }).teachable;
    assert.ok(t.moment && t.lesson && t.channel, question);
  }
});

test('plain rule questions carry no coaching filler', () => {
  for (const question of ['Can my kid wear cleats?', 'Can players chew gum in the dugout?', 'How many innings is a game?', 'How many mound visits do I get?']) {
    const t = ask({ question, role: 'parent', division: '10U' }).teachable;
    assert.equal(t.moment, null, question);
    assert.equal(t.lesson, null, question);
    assert.equal(t.channel, null, question);
    assert.equal(t.beyond, null, question);
    assert.equal(t.next_step, null, question);
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

test('two runners on the same base: the Little League rule leads, with a baserunning teachable moment', () => {
  const a = ask({ question: 'What happens when 2 runners occupy the same base?', role: 'coach', division: '13U' });
  assert.match(a.verdict, /Little League rules apply for 13U: Two runners may not occupy the same base/);
  assert.deepEqual(a.rules.slice(0, 2).map((r) => r.id), ['F301', 'F302']);
  assert.equal(a.teachable.situation.id, 'SIT006');
  assert.equal(a.teachable.moment, null);                 // no generic filler
  assert.equal(a.teachable.channel, null);
  assert.equal(a.rules.length, 3);                        // 7.03(a), 7.03(b) and the house rule naming Little League
  const ten = ask({ question: 'What happens when 2 runners occupy the same base?', role: 'coach', age: 8 });
  assert.equal(ten.rules[0].id, 'F301');                  // 10U: the Little League rule, not the 10U stealing rule
  const b = ask({ question: 'What happens when 2 runners occupy the same base?', role: 'coach', division: '18U' });
  assert.equal(b.rules[0].id, 'F311');                    // 18U: the Babe Ruth (Official Baseball Rules) version
});

test('runner reads answer exactly the situation asked about', () => {
  const read = (question) => ask({ question, role: 'player', division: '13U' });
  assert.match(read('Runner on first, one out, line drive to short. What do I do?').verdict, /^Runner on first, fewer than two outs, line drive: Take three or four steps and freeze/);
  assert.match(read('I am on second and first base is open, ground ball to the right side').verdict, /^Runner on second, first base open.*Run hard to third/);
  assert.match(read('My runner on second ran on a ground ball to short and was thrown out').verdict, /in front of you.*only if it's safe/);
  assert.match(read('Runners on first and second, ground ball to short').verdict, /forced\. Run hard to third/);
  assert.match(read('Bases loaded, no outs, fly ball to left').verdict, /Tag up, and run hard home/);
  assert.match(read('With two outs do I run on contact?').verdict, /Run hard to the next base on every batted ball/);
  const both = read('I am on second, what do I do on a ground ball?');
  assert.equal(both.reads.length, 2);                       // left side and right side, nothing else
  assert.equal(both.teachable.lesson, null);
  assert.equal(both.teachable.next_step, null);
  const rule = ask({ question: 'What happens when 2 runners occupy the same base?', role: 'coach', division: '13U' }).teachable;
  assert.equal(rule.lesson, null);                          // a 'what happens' rule question: rule and situation only
  assert.equal(rule.next_step, null);
});

test('baserunning questions get the rule or the situation that fits, and the coaching that goes with it', () => {
  const tagUp = ask({ question: 'My son got doubled off on a fly ball. What happened?', role: 'parent', division: '10U' });
  assert.equal(tagUp.rules[0].id, 'F304');
  assert.equal(tagUp.teachable.situation.id, 'SIT007');
  assert.match(tagUp.teachable.next_step, /how many outs/);   // the parent tip
  const coach = ask({ question: 'I ran through the third base coach stop sign and got thrown out at home', role: 'player', division: '13U' });
  assert.equal(coach.teachable.situation.id, 'SIT010');
  assert.equal(coach.teachable.lesson.id, 'L013');
});

test('Challenger-division rules stay out of regular answers', () => {
  const a = ask({ question: 'What happens if two runners end up on third base?', role: 'coach', division: '13U' });
  assert.ok(a.rules.every((r) => !/Challenger/i.test(r.label)));
});
