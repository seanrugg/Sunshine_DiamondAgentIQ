// The teachable moment: what sets DiamondAgentIQ apart. Every answer turns a
// stressful, confusing moment into something a player, parent and coach can
// each learn from. Built only from the team's coaching material
// (data/coaching: lessons, situations, stories, tips) and the learning
// philosophy, never invented. Runs offline; an AI model may only reword the
// "moment" sentence (see answer.js).

import { PHILOSOPHY_POINTS } from './philosophy.js';

const ROLES = ['player', 'parent', 'coach', 'umpire'];
const ROLE_LABEL = { player: 'Player', parent: 'Parent', coach: 'Coach', umpire: 'Umpire' };

// Words people use -> lesson tags (data/coaching/lessons.csv `tags`).
const TAG_WORDS = [
  [/same base|two runners|both runners|2 runners|occup/, ['two_runners', 'baserunning', 'situational']],
  [/tag(ging)? up|fly ?ball|pop ?up|line drive|halfway|doubled off/, ['tag_up', 'baserunning', 'situational']],
  [/base coach|coach'?s? (sign|signal)|signals?\b|stop sign|waved|third[- ]base coach|first[- ]base coach/, ['base_coach', 'signals', 'listening']],
  [/\b\d\s*outs?\b|\b(no|one|two|1|2) outs?\b|how many outs|run on contact/, ['outs', 'situational']],
  [/baserunn|running the bases|when to run|hold (the|a|his|her|their) base|stay on (the|his|her) base|advance|forced|force play|picked off|ran into an out|thrown out at/, ['baserunning', 'situational', 'force']],
  [/struck out|strike ?out|strikeouts?|whiff/, ['strikeout', 'failure']],
  [/last out|ended the game|end the game|game[- ]ending/, ['last_out', 'loss', 'blame']],
  [/\berror|mistake|messed up|dropped the ball|booted/, ['error', 'mistake', 'responsibility']],
  [/\blost\b|\bloss\b|\blose\b|losing/, ['loss']],
  [/\bwon\b|\bwin\b|winning/, ['win', 'winning']],
  [/slump|0-for|hitless|can't hit|cannot hit/, ['slump', 'confidence']],
  [/scared|afraid|fear|nervous|anxious|confiden/, ['scared_hitter', 'confidence']],
  [/blame|fault/, ['blame', 'responsibility']],
  [/yell|scream|argu|angry|upset|heated|booing|boo\b/, ['conflict', 'yelling', 'de_escalation']],
  [/umpire|\bump\b|\bcall\b|called|missed call|bad call|strike zone/, ['umpire', 'conflict']],
  [/pitch(es|ed|er|ing)?\b.*\d|\d+\s*pitch|pitch count|rest days?|arm/, ['pitch_count', 'arm_care', 'development']],
  [/playoff|championship|big game/, ['playoffs', 'opportunity']],
  [/dropped third|uncaught third|third strike|strike three|dropped strike/, ['dropped_third_strike', 'new_rule']],
  [/foul|fair\b/, ['fair_foul', 'hustle']],
  [/interference|hit by (the|a) (batted )?ball|dead ball/, ['interference', 'dead_ball', 'umpire']],
  [/opponent|other team|handshake|shake hands|taunt|trash/, ['sportsmanship', 'opponents', 'respect']],
  [/teammate|team ?mate/, ['teammates', 'team', 'encouragement']],
  [/first year|new player|never played|first season/, ['first_year', 'opportunity']],
  [/bench|playing time|\bsit\b|sits out|innings on defense/, ['team', 'development']],
];

// House-rule and rule topics -> lesson tags, so rule answers carry a lesson too.
const TOPIC_TAGS = {
  sportsmanship: ['sportsmanship', 'respect'], fan_conduct: ['conflict', 'de_escalation'], parent_coaching: ['conflict', 'responsibility'],
  conduct: ['conflict', 'de_escalation'], umpire_discussion: ['umpire', 'conflict', 'de_escalation'], strike_zone: ['umpire', 'strikeout'],
  pitch_count: ['pitch_count', 'arm_care', 'development'], warmups: ['arm_care', 'development'],
  batting_order: ['team'], playing_time: ['team', 'development'], late_player: ['team', 'responsibility'],
  injury_ejection: ['responsibility', 'conflict'], minimum_players: ['team'], pool_players: ['team', 'opportunity'],
  dropped_third_strike: ['dropped_third_strike'], uncaught_third_strike: ['dropped_third_strike'], baserunning: ['baserunning', 'situational'],
  two_runners_same_base: ['two_runners', 'baserunning', 'situational'], force_play: ['force', 'baserunning', 'situational'], tag_up: ['tag_up', 'baserunning', 'situational'],
  sliding: ['hustle', 'learning'], run_cap: ['team'], mercy_rule: ['sportsmanship', 'respect'], judgment: ['umpire'],
  protest: ['umpire', 'conflict'], courtesy_runner: ['team'], catcher: ['arm_care', 'development'],
};

// Words -> coaching-tip topics (data/coaching/insights.csv `topic`).
const TIP_WORDS = [
  [/same base|two runners|both runners|2 runners|occup|baserunn|when to run|hold (the|a|his|her|their) base|tag(ging)? up|fly ?ball|line drive|forced|advance|doubled off|ran into an out|thrown out|run on contact|\b(no|one|two|1|2) outs?\b|how many outs/, ['situational_baserunning', 'baserunning_mistake', 'situational_baserunning_drill']],
  [/base coach|signals?\b|stop sign|waved/, ['base_coach_signals', 'situational_baserunning_drill']],
  [/struck out|strike ?out|ended the game|last out/, ['failure_recovery', 'two_strike_approach', 'plate_coverage']],
  [/outside|away|reach/, ['plate_coverage']],
  [/looking|took (a|the) (pitch|strike)|called strike|strike zone/, ['strike_zone', 'two_strike_approach']],
  [/two strikes|0-2|1-2|2-2|full count/, ['two_strike_approach']],
  [/scared|afraid|fear|nervous|down on (him|her|them)self|confiden/, ['confidence_mindset', 'failure_recovery']],
  [/umpire|\bump\b|\bcall\b|called|yell|argu/, ['umpire_respect', 'umpire_communication']],
  [/ride home|after the game|upset|cried|crying/, ['parent_support', 'failure_recovery']],
  [/pitch(es|er|ing)?|arm|rest/, ['pitch_workload']],
  [/\bbats?\b|bbcor|usabat|drop -?\d/, ['equipment_bat', 'bat_weight_check', 'bat_fit_now', 'drop_weight']],
  [/foul|fair\b|run it out|hustle/, ['run_it_out']],
  [/practice|drill|season|year[- ]round|other sports?/, ['practice_balance', 'multi_sport']],
];

const has = (q, re) => re.test(q);

/** Tags that describe this moment, from the question and the rules that answered it. */
export function momentTags(question, rules = [], callType = '') {
  const q = String(question || '').toLowerCase();
  const tags = new Set();
  for (const [re, t] of TAG_WORDS) if (has(q, re)) t.forEach((x) => tags.add(x));
  for (const r of rules.slice(0, 1)) (TOPIC_TAGS[r.topic] || []).forEach((x) => tags.add(x)); // the rule that answered
  if (callType === 'judgment' || callType === 'judgment_and_rule') ['umpire', 'conflict'].forEach((x) => tags.add(x));
  return tags;
}

// When a judgment call or a coaching question names no lesson, these fit every such moment.
const DEFAULT_LESSON = { judgment: 'L002', judgment_and_rule: 'L010', coaching: 'L008' };

/** The lesson whose tags fit best; a lesson's first two tags are what it's mainly about. Null if none fit. */
export function pickLesson(kb, tags) {
  return scoreLessons(kb, tags)[0]?.lesson || null;
}

function scoreLessons(kb, tags) {
  return kb.lessons
    .map((l) => ({ lesson: l, score: l.tags.reduce((sum, t, i) => sum + (tags.has(t) ? (i < 2 ? 1.5 : 1) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

// A rule question with no lesson in it still teaches: the matching point of the team's philosophy.
const TOPIC_PRINCIPLE = {
  footwear: 7, bats: 7, equipment: 7, safety: 7, weather: 7, catcher: 7, pitch_count: 7, warmups: 7,
  mercy_rule: 10, sportsmanship: 10, run_cap: 8, game_length: 8, playing_time: 8, batting_order: 8,
};
function principleFor(kb, rules) {
  const topic = rules[0]?.topic;
  if (topic === 'turf_care' || topic === 'home_dugout') {
    return { source: 'Sunshine Ballpark', text: kb.league.welcome };
  }
  const i = TOPIC_PRINCIPLE[topic] ?? 5; // default: learn the rules so you understand calls rather than argue them
  return { source: 'Our coaching philosophy', text: PHILOSOPHY_POINTS[i] };
}

export function pickTips(kb, question, role, division) {
  const q = String(question || '').toLowerCase();
  const topics = [];
  for (const [re, t] of TIP_WORDS) if (has(q, re)) t.forEach((x) => { if (!topics.includes(x)) topics.push(x); });
  const fits = (i) => i.sport !== 'softball' &&
    (!division || ((i.age_max ?? 99) >= division.age_min && (i.age_min ?? 0) <= division.age_max));
  const ordered = topics.flatMap((t) => kb.insights.filter((i) => i.topic === t && fits(i)));
  const uniq = [...new Map(ordered.map((i) => [i.id, i])).values()];
  const forRole = (r) => uniq.find((i) => i.audience === r) || uniq.find((i) => i.audience === 'all');
  return { all: uniq, player: forRole('player'), parent: forRole('parent'), coach: forRole('coach'), asker: forRole(role) || uniq[0] || null };
}

export function pickSituation(kb, question, lesson) {
  const q = String(question || '').toLowerCase();
  let pool = [];
  const topic = (t) => kb.situations.filter((s) => s.topic === t);
  if (has(q, /dropped third|uncaught third|third strike|strike three|dropped strike/)) pool = topic('dropped_third_strike');
  else if (has(q, /same base|two runners|both runners|2 runners|occup/)) pool = topic('two_runners_same_base');
  else if (has(q, /tag(ging)? up|fly ?ball|pop ?up|halfway|doubled off/)) pool = topic('fly_ball_baserunning');
  else if (has(q, /\b(two|2) outs?\b.*\b(run|go|hold)|run on contact/)) pool = topic('two_out_baserunning');
  else if (has(q, /ground ?ball|grounder|in front of|behind (him|her|me|the runner)|line drive/) && has(q, /runner|run|hold|second|2nd/)) pool = topic('ground_ball_baserunning');
  else if (has(q, /base coach|signals?\b|stop sign|waved|rounding|rounded/)) pool = topic('base_coach_signals');
  if (pool.length) { /* found above */ } else if (has(q, /foul|fair\b/)) pool = kb.situations.filter((s) => s.topic.startsWith('fair_foul'));
  else if (has(q, /hit by (the|a) (batted )?ball|ball hit (the|a) runner|runner (was )?hit/)) pool = kb.situations.filter((s) => s.topic === 'runner_hit_by_batted_ball');
  if (!pool.length) return null;
  // Prefer the one whose bases and outs the question mentions.
  const score = (s) => (q.includes(String(s.bases).toLowerCase()) ? 1 : 0) +
    (q.match(/(\d|no|one|two)\s+outs?/) && q.includes(String(s.outs)) ? 1 : 0) +
    (lesson && s.lesson_ids.includes(lesson.id) ? 0.5 : 0);
  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Who to talk to, how and when, by role and kind of moment. Grounded in the philosophy and Sunshine's conduct rules. */
export function channelFor(role, callType) {
  const call = callType === 'judgment' || callType === 'judgment_and_rule';
  if (role === 'parent') {
    return {
      who: 'You first, then the coach',
      how: call
        ? "Not the umpire, and not from the stands: in Sunshine only head coaches discuss calls, preferably between innings. On the ride home, let your child talk first and keep it supportive. If a rule still puzzles you, ask the coach after the game."
        : 'Let your child talk first on the ride home and keep it supportive. If you want to talk technique or playing time, ask the coach for a few minutes later in the week.',
    };
  }
  if (role === 'player') {
    return {
      who: 'Your coach',
      how: call
        ? "Let the call go and get ready for the next pitch; the umpire's call is part of the game. Afterwards, ask your coach what you can control next time."
        : 'Ask at the start or end of practice for one thing to work on, then practise it with a parent or teammate between practices.',
    };
  }
  if (role === 'umpire') {
    return {
      who: 'Your partner or the head umpire',
      how: 'Give one calm explanation to the head coach if asked; only head coaches discuss calls. Talk the play through with your partner after the game, and keep your focus on the next play between innings.',
    };
  }
  // coach
  return call
    ? { who: 'The head umpire, between innings', how: 'Ask if you may approach. Rule interpretations only, never judgment calls, and Sunshine strongly recommends waiting until between innings. Then talk to your players at the next practice.' }
    : { who: 'The player, one-on-one', how: 'A short, calm talk at practice: one thing to work on, plenty of encouragement, and let the player tell you how it feels.' };
}

const MOMENT = {
  judgment: (role) => (role === 'umpire'
    ? 'Calls like this are why the umpire is on the field. A calm, consistent explanation turns a heated moment into one where everyone learns the rule.'
    : "In the moment it can feel like one call decided everything. It was the umpire's judgment, and that's part of the game. What a player controls is readiness, approach, effort and how they respond to the next pitch."),
  judgment_and_rule: () => 'Part of this is the umpire\'s judgment and part is a written rule. Knowing the rule turns frustration into understanding: everyone can see why the call went the way it did, and what to do next time.',
  rule: () => 'Confusion about a rule turns into frustration fast, in the dugout and in the stands. Now everyone knows the rule, so the next time it comes up it is a moment to teach, not argue.',
  coaching: () => 'This moment stings, and that is normal. It is information, not identity: judge it by the process (ready, approach, effort), pick one small thing to work on, and let the rest go.',
};

/**
 * The teachable moment for an answer.
 * @returns {{ moment, lesson, principle, perspectives, channel, next_step, plan, situation, story, draft }}
 */
export function buildTeachable(kb, input, { callType, rules = [], division = null }) {
  const role = ROLES.includes(input.role) ? input.role : 'parent';
  const tags = momentTags(input.question, rules, callType);
  const ranked = scoreLessons(kb, tags);
  const situation = pickSituation(kb, input.question, ranked[0]?.lesson || null);
  // A game situation brings its own lessons; use one of them unless the question points clearly elsewhere.
  let lesson = ranked[0]?.lesson || null;
  if (situation && (!lesson || (!situation.lesson_ids.includes(lesson.id) && ranked[0].score < 3))) {
    lesson = kb.lessons.find((l) => l.id === situation.lesson_ids[0]) || lesson;
  }
  lesson ||= DEFAULT_LESSON[callType] ? kb.lessons.find((l) => l.id === DEFAULT_LESSON[callType]) : null;
  const tips = pickTips(kb, input.question, role, division);
  // The coach's story only when it is really about this kind of moment.
  const STORY_TAGS = ['opportunity', 'playoffs', 'confidence', 'scared_hitter', 'pitch_count', 'development'];
  const story = (situation && kb.stories.find((s) => s.situation_ids.includes(situation.id))) ||
    (lesson && kb.stories.find((s) => s.lesson_ids.includes(lesson.id) && STORY_TAGS.some((t) => tags.has(t)))) || null;

  // Every role's view of the same moment, the asker's first.
  const order = [role, ...ROLES.filter((r) => r !== role)];
  const perspectives = lesson ? order.filter((r) => lesson.for[r]).map((r) => ({ role: r, label: ROLE_LABEL[r], text: lesson.for[r], you: r === role })) : [];

  // One concrete next step per audience, from the coaching tips; the situation adds a team drill.
  const plan = {
    player: tips.player?.try_this || null,
    team: situation ? `Run this at practice: ${situation.name.toLowerCase()}. Offense: ${situation.offense}` : (tips.coach?.try_this || null),
    home: tips.parent?.try_this || null,
  };
  const nextStep = (tips.asker && tips.asker.try_this) || plan[role === 'coach' ? 'team' : role === 'parent' ? 'home' : 'player'] || null;

  const used = [lesson, situation, story, tips.asker].filter(Boolean);
  return {
    moment: MOMENT[callType]?.(role) || MOMENT.coaching(role),
    lesson: lesson ? { id: lesson.id, title: lesson.title, principle: lesson.principle, life_lesson: lesson.life_lesson } : null,
    principle: lesson ? null : principleFor(kb, rules),
    perspectives,
    channel: channelFor(role, callType),
    next_step: nextStep,
    why: tips.asker?.why || null,
    plan,
    situation: situation ? { id: situation.id, name: situation.name, offense: situation.offense, defense: situation.defense, common_mistakes: situation.common_mistakes } : null,
    story: story ? { id: story.id, title: story.title, text: story.text } : null,
    draft: used.some((x) => x.verified === false),
  };
}
