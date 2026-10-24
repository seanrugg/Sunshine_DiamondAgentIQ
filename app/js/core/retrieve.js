// Keyword retrieval over the knowledge base. Small, offline and explainable:
// it runs in the browser (offline mode) and on the server (to build the
// model's context). Sunshine house rules always rank above Little League facts.

const STOP = new Set(('a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so ' +
  'that the their them then there they this to was we were what when where which who why will with you your').split(' '));

// Everyday words people use -> words in the rule data.
const SYNONYMS = {
  pitches: ['pitch'], count: ['pitch_count'], limit: ['pitch_count'], threw: ['pitch_count'], thrown: ['pitch_count'], throw: ['pitch_count'], pitched: ['pitch', 'rest'], pitcher: ['pitch', 'pitching'], rest: ['pitch_rest', 'rest'],
  balk: ['balk', 'pitching'], steal: ['baserunning', 'steal'], stealing: ['baserunning', 'steal'], lead: ['baserunning'],
  dropped: ['uncaught_third_strike', 'dropped_third_strike'], uncaught: ['uncaught_third_strike', 'dropped_third_strike'],
  bat: ['bats', 'equipment', 'bat'], bats: ['bats', 'equipment'], bbcor: ['bats', 'equipment'], helmet: ['equipment', 'safety'],
  strike: ['strike_zone', 'judgment'], zone: ['strike_zone', 'judgment'], safe: ['judgment'],
  ump: ['umpires', 'umpire', 'judgment'], umpire: ['umpires', 'umpire', 'judgment', 'umpire_discussion'], call: ['judgment', 'umpire_discussion'], protest: ['protest', 'protests'],
  parent: ['conduct', 'parent_support', 'fan_conduct'], parents: ['conduct', 'parent_support', 'fan_conduct'], yell: ['fan_conduct', 'sportsmanship'], booing: ['fan_conduct'],
  inning: ['game_length', 'innings'], innings: ['game_length'], mercy: ['mercy_rule'], runs: ['run_cap', 'mercy_rule'],
  courtesy: ['courtesy_runner'], runner: ['courtesy_runner', 'baserunning'], lineup: ['batting_order', 'playing_time', 'late_player'],
  playing: ['playing_time'], bench: ['playing_time'], catcher: ['catcher'], catch: ['catcher'], rain: ['weather', 'rainouts'],
  lightning: ['weather', 'safety'], thunder: ['weather', 'safety'], age: ['age', 'eligibility'], old: ['age', 'eligibility'],
  struck: ['failure_recovery', 'confidence_mindset', 'two_strike_approach'], strikeout: ['failure_recovery', 'confidence_mindset'],
  scared: ['confidence_mindset', 'fear'], afraid: ['confidence_mindset', 'fear'], nervous: ['confidence_mindset'],
  challenger: ['challenger', 'mercy_and_inclusion'], disability: ['challenger', 'mercy_and_inclusion'], buddy: ['challenger'],
  cleats: ['footwear'], spikes: ['footwear'], shoes: ['footwear'], gum: ['turf_care'], seeds: ['turf_care'], gatorade: ['turf_care'],
  dugout: ['home_dugout'], late: ['late_player'], shows: ['late_player'], show: ['late_player'], arrives: ['late_player'], '8': ['minimum_players'], '7': ['minimum_players'], eight: ['minimum_players'], seven: ['minimum_players'],
  fence: ['parent_coaching'], sideline: ['parent_coaching'], sidelines: ['parent_coaching'], stands: ['fan_conduct'], forfeit: ['minimum_players'], slide: ['sliding'], sliding: ['sliding'], headfirst: ['sliding'],
  warmup: ['warmups'], warm: ['warmups'], pool: ['pool_players'], taunt: ['sportsmanship'], taunting: ['sportsmanship'], ejected: ['injury_ejection', 'sportsmanship'],
  mound: ['field_size'], distance: ['field_size'], bases: ['field_size'], long: ['game_length'], time: ['game_length'],
  foul: ['run_it_out'], hustle: ['run_it_out'], obstruction: ['obstruction'], interference: ['interference', 'obstruction'],
};

export function tokenize(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w));
  const out = new Set(words);
  for (const w of words) {
    if (w.endsWith('s') && w.length > 3) out.add(w.slice(0, -1));
    for (const s of SYNONYMS[w] || []) out.add(s);
  }
  return [...out];
}

/** Which Sunshine division an age (or division id) belongs to. */
export function resolveDivision(league, { division, age, question }) {
  const divs = league.divisions;
  const named = String(question || '').match(/\b(10|13|18)\s?u\b/i);
  if (named) return divs.find((d) => d.id === `${named[1]}U`) || null;
  if (division) return divs.find((d) => d.id === division) || null;
  if (Number.isFinite(age)) return divs.find((d) => age >= d.age_min && age <= d.age_max) || null;
  return null;
}

function ageOverlap(item, div) {
  if (!div) return true;
  const lo = item.age_min ?? 0, hi = item.age_max ?? 99;
  return hi >= div.age_min && lo <= div.age_max;
}

function score(tokens, ...fields) {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  const words = new Set();
  for (const w of hay.split(/[^a-z0-9_]+/)) {
    if (!w) continue;
    words.add(w);
    if (w.endsWith('s') && w.length > 3) words.add(w.slice(0, -1));
    if (w.includes('_')) for (const part of w.split('_')) words.add(part);
  }
  let s = 0;
  for (const t of tokens) if (words.has(t)) s += t.includes('_') ? 3 : 1; // topic keys weigh more
  return s;
}

/**
 * Find what the knowledge base says about a question.
 * @returns {{ division, house_rules, pending_house_rules, rule_facts, lessons, insights, situations }}
 */
export function retrieve(kb, { question, division, age, role, limit = 5 }) {
  const div = resolveDivision(kb.league, { division, age, question });
  const tokens = tokenize(question);
  // A question word that maps straight to an item's topic is the strongest signal.
  const rank = (items, fieldsOf, min = 1) => items
    .map((it) => ({ it, s: score(tokens, ...fieldsOf(it)) + (tokens.includes(it.topic) ? 4 : 0) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);

  const inDivision = (h) => !div || h.divisions.includes('all') || h.divisions.includes(div.id);
  const houseRules = rank(kb.house_rules.filter((h) => h.text && inDivision(h)), (h) => [h.topic, h.section, h.keywords, h.text], 2);
  const pendingHouseRules = rank(kb.house_rules.filter((h) => !h.text && inDivision(h)), (h) => [h.topic, h.section, h.keywords, h.question]).slice(0, 2);

  // Rulebook facts: Little League for 10U/13U, Babe Ruth for 18U. A matched
  // house rule that overrides a rulebook fact hides that fact.
  const overrides = new Set(houseRules.map((h) => h.overrides).filter(Boolean));
  const overridden = (f) => overrides.has(f.key) || overrides.has(f.topic) ||
    (overrides.has('bat_standard') && f.topic === 'equipment' && /\bbats?\b/i.test(f.text));
  const facts = rank(
    kb.rule_facts.filter((f) => (!div || f.sanction === div.base_sanction) && ageOverlap(f, div) && !overridden(f)),
    (f) => [f.topic, f.key, f.division, f.text],
  ).slice(0, Math.max(2, limit - houseRules.length));
  const lessons = rank(kb.lessons, (l) => [l.tags.join(' '), l.title, l.principle]).slice(0, 2);
  const insights = rank(
    kb.insights.filter((i) => ageOverlap(i, div) && i.sport !== 'softball' && (!role || i.audience === 'all' || i.audience === role)),
    (i) => [i.topic, i.situation, i.text],
  ).slice(0, 2);
  const situations = rank(kb.situations, (s) => [s.topic, s.name]).slice(0, 1);

  return { division: div, tokens, house_rules: houseRules, pending_house_rules: pendingHouseRules, rule_facts: facts, lessons, insights, situations };
}
