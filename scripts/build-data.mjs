#!/usr/bin/env node
// Builds app/data/kb.json from the CSV/JSON files in data/.
// Edit the files in data/, then run `npm run build:data`. Never edit kb.json by hand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, newlines in quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csv = (p) => parseCsv(read(p));
const num = (v) => (v === '' || v == null ? null : Number(v));
const bool = (v) => String(v).toLowerCase() === 'true';

export function buildKb() {
  const league = JSON.parse(read('data/league/league.json'));

  const houseRules = csv('data/league/house_rules.csv').map((r) => ({
    id: r.house_rule_id,
    kind: 'house_rule',
    divisions: (r.division || 'all').split(';').map((d) => d.trim()).filter(Boolean),
    topic: r.topic,
    section: r.section,
    keywords: r.keywords || '',
    question: r.question || '',
    text: r.rule_text,
    overrides: r.overrides_fact_key || null,
    call_type: r.call_type || 'rule',
    source_doc: r.source_doc,
    status: r.status || 'placeholder',
    verified: r.status === 'verified',
    note: r.note,
  }));

  const sources = Object.fromEntries(
    [...csv('data/little_league/rule_sources.csv'), ...csv('data/babe_ruth/rule_sources.csv')]
      .map((s) => [s.source_id, { title: s.title, url: s.url, edition: s.edition }]),
  );

  const facts = [...csv('data/little_league/rules_facts.csv'), ...csv('data/babe_ruth/rules_facts.csv')].map((r) => ({
    id: r.fact_id,
    kind: 'rulebook_fact',
    sanction: r.sanction,
    source_id: r.source_id,
    division: r.division,
    age_min: num(r.age_min),
    age_max: num(r.age_max),
    topic: r.topic,
    key: r.fact_key,
    value: r.fact_value,
    unit: r.unit,
    rule_ref: r.rule_ref,
    call_type: r.call_type || 'rule',
    text: r.summary,
    url: r.source_url,
    verified: bool(r.verified),
  }));

  const housePitchRest = csv('data/league/pitch_rest.csv').map((r) => ({
    division: r.division, pitches_min: num(r.pitches_min), pitches_max: num(r.pitches_max),
    rest_days: num(r.rest_days), daily_max: num(r.daily_max), house_rule_id: r.house_rule_id,
  }));

  const pitchRest = csv('data/little_league/pitch_rest.csv').map((r) => ({
    age_min: num(r.age_min), age_max: num(r.age_max),
    pitches_min: num(r.pitches_min), pitches_max: num(r.pitches_max),
    rest_days: num(r.rest_days), url: r.source_url, verified: bool(r.verified),
  }));

  const lessons = csv('data/coaching/lessons.csv').map((r) => ({
    id: r.lesson_id, kind: 'lesson', title: r.title, principle: r.principle, life_lesson: r.life_lesson,
    for: { player: r.for_player, coach: r.for_coach, parent: r.for_parent, umpire: r.for_umpire },
    tags: r.tags.split(';').filter(Boolean), verified: bool(r.verified),
  }));

  const insights = csv('data/coaching/insights.csv').map((r) => ({
    id: r.insight_id, kind: 'insight', topic: r.topic, sport: r.sport, age_min: num(r.age_min), age_max: num(r.age_max),
    audience: r.audience, situation: r.situation, text: r.insight, why: r.why, try_this: r.try_this, verified: bool(r.verified),
  }));

  const situations = csv('data/coaching/situations.csv').map((r) => ({
    id: r.situation_id, kind: 'situation', name: r.name, topic: r.topic, bases: r.bases, outs: r.outs, count: r.count,
    rule_fact_codes: r.rule_fact_codes.split(';').filter(Boolean),
    offense: r.offense, defense: r.defense, common_mistakes: r.common_mistakes,
    lesson_ids: r.lesson_ids.split(';').filter(Boolean), verified: bool(r.verified),
  }));

  const stories = csv('data/coaching/stories.csv').map((r) => ({
    id: r.story_id, kind: 'story', title: r.title, text: r.story, lesson_ids: r.lesson_ids.split(';').filter(Boolean),
    situation_ids: r.situation_ids.split(';').filter(Boolean), verified: bool(r.verified),
  }));

  return {
    built_at: new Date().toISOString(),
    league, house_rules: houseRules, rule_facts: facts, sources, house_pitch_rest: housePitchRest, ll_pitch_rest: pitchRest,
    lessons, insights, situations, stories,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const kb = buildKb();
  const out = join(root, 'app/data/kb.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(kb, null, 1));
  const entered = kb.house_rules.filter((h) => h.text).length;
  console.log(`kb.json: ${kb.rule_facts.length} rulebook facts, ${kb.house_pitch_rest.length} house pitch-rest rows, ` +
    `${entered}/${kb.house_rules.length} house rules entered, ${kb.lessons.length} lessons, ${kb.insights.length} tips`);
}
