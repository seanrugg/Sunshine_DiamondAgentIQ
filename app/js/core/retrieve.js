// Keyword retrieval over the knowledge base. Small, offline and explainable:
// it runs in the browser (offline mode) and on the server (to build the
// model's context). Sunshine house rules always rank above Little League facts.

const STOP = new Set(('a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so ' +
  'that the their them then there they this to was we were what when where which who why will with you your').split(' '));

// Everyday words people use -> words in the rule data.
const SYNONYMS = {
  pitches: ['pitch', 'pitch_count', 'rest'], pitched: ['pitch', 'rest'], pitcher: ['pitch', 'pitching'], rest: ['pitch_rest', 'rest'],
  balk: ['balk', 'pitching'], steal: ['baserunning', 'steal'], stealing: ['baserunning', 'steal'], lead: ['baserunning'],
  dropped: ['uncaught_third_strike'], uncaught: ['uncaught_third_strike'], third: ['uncaught_third_strike'],
  bat: ['bats', 'equipment', 'bat'], bats: ['bats', 'equipment'], bbcor: ['bats', 'equipment'], helmet: ['equipment', 'safety'],
  strike: ['strike_zone', 'judgment'], zone: ['strike_zone', 'judgment'], safe: ['judgment'],
  ump: ['umpires', 'umpire', 'judgment'], umpire: ['umpires', 'umpire', 'judgment'], call: ['judgment'], protest: ['protest', 'protests'],
  parent: ['conduct', 'parent_support'], parents: ['conduct', 'parent_support'], yell: ['conduct', 'sportsmanship'], booing: ['conduct'],
  inning: ['game_length', 'innings'], innings: ['game_length', 'pitching_innings'], mercy: ['run_rule'], run: ['run_rule'],
  courtesy: ['courtesy_runner'], runner: ['courtesy_runner', 'baserunning'], lineup: ['batting_order', 'playing_time'],
  playing: ['playing_time'], bench: ['playing_time'], catcher: ['catcher'], catch: ['catcher'], rain: ['weather', 'rainouts'],
  lightning: ['weather', 'safety'], thunder: ['weather', 'safety'], age: ['age', 'eligibility'], old: ['age', 'eligibility'],
  struck: ['failure_recovery', 'confidence_mindset', 'two_strike_approach'], strikeout: ['failure_recovery', 'confidence_mindset'],
  scared: ['confidence_mindset', 'fear'], afraid: ['confidence_mindset', 'fear'], nervous: ['confidence_mindset'],
  challenger: ['challenger', 'mercy_and_inclusion'], disability: ['challenger', 'mercy_and_inclusion'], buddy: ['challenger'],
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
export function resolveDivision(league, { division, age }) {
  const divs = league.divisions;
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
 * @returns {{ division, house_rules, ll_facts, lessons, insights, situations }}
 */
export function retrieve(kb, { question, division, age, role, limit = 5 }) {
  const div = resolveDivision(kb.league, { division, age });
  const tokens = tokenize(question);
  const rank = (items, fieldsOf) => items
    .map((it) => ({ it, s: score(tokens, ...fieldsOf(it)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);

  const houseRules = rank(
    kb.house_rules.filter((h) => h.text && (h.division === 'all' || !div || h.division === div.id)),
    (h) => [h.topic, h.section, h.text],
  );
  const pendingHouseRules = rank(
    kb.house_rules.filter((h) => !h.text && (h.division === 'all' || !div || h.division === div.id)),
    (h) => [h.topic, h.section, h.question],
  ).slice(0, 2);
  const facts = rank(kb.ll_facts.filter((f) => ageOverlap(f, div)), (f) => [f.topic, f.key, f.division, f.text]);
  const lessons = rank(kb.lessons, (l) => [l.tags.join(' '), l.title, l.principle]).slice(0, 2);
  const insights = rank(
    kb.insights.filter((i) => ageOverlap(i, div) && i.sport !== 'softball' && (!role || i.audience === 'all' || i.audience === role)),
    (i) => [i.topic, i.situation, i.text],
  ).slice(0, 2);
  const situations = rank(kb.situations, (s) => [s.topic, s.name]).slice(0, 1);

  return { division: div, tokens, house_rules: houseRules, pending_house_rules: pendingHouseRules, ll_facts: facts, lessons, insights, situations };
}
