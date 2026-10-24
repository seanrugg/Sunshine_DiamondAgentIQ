// Turns retrieved knowledge into an answer. Offline mode uses composeOffline
// (no model). Server mode sends buildPrompt() to a model and checks its reply
// with checkCitations(), falling back to composeOffline on any failure.
import { PHILOSOPHY, PHILOSOPHY_SHORT, DISCLAIMER } from './philosophy.js';
import { computeRest } from './pitchRest.js';
import { STRONG_MATCH } from './retrieve.js';
import { buildTeachable } from './teachable.js';

const JUDGMENT_WORDS = ['strike zone', 'balls and strikes', 'missed a call', 'missed the call', 'zone', 'safe', 'called', 'bad call', 'the call', 'tagged', 'balk', 'fair', 'foul', 'obstruction', 'interference', 'umpire', 'ump'];
const RULE_WORDS = ['how many', 'allowed', 'rule', 'limit', 'legal', 'eligible', 'pitches', 'rest', 'bat', 'bats', 'innings', 'courtesy', 'cleats', 'dugout', 'mercy', 'forfeit', 'lineup', 'steal', 'slide', 'warm-up', 'warmup', 'gum', 'seeds'];
const COACHING_WORDS = ['help', 'scared', 'afraid', 'nervous', 'confidence', 'practice', 'drill', 'improve', 'upset', 'cried', 'frustrated', 'better', 'get past', 'get over', 'last out', 'struck out', 'strikeout', 'mistake', 'error', 'slump', 'lost'];

/** 'judgment' | 'rule' | 'judgment_and_rule' | 'coaching' */
export function classifyCall(question, retrieved) {
  const q = ` ${String(question).toLowerCase()} `;
  const has = (list) => list.some((w) => new RegExp(`\\b${w}\\b`).test(q));
  const judgment = has(JUDGMENT_WORDS);
  const coaching = has(COACHING_WORDS);
  // A loosely matched house rule doesn't turn a "how do I help him" question into a rules question.
  const rule = has(RULE_WORDS) || (!coaching && retrieved.house_rules.length > 0);
  if (judgment && rule) return 'judgment_and_rule';
  if (judgment) return 'judgment';
  if (rule) return 'rule';
  if (coaching) return 'coaching';
  return retrieved.rule_facts.length ? 'rule' : 'coaching';
}

export const CALL_LABELS = {
  rule: 'Written rule',
  judgment: "Umpire's judgment",
  judgment_and_rule: 'Judgment + rule',
  coaching: 'Coaching moment',
};

export const SANCTION_LABELS = { little_league: 'Little League', babe_ruth_league: 'Babe Ruth League' };

const ROLE_OPENERS = {
  parent: 'For parents',
  coach: 'For coaches',
  player: 'For players',
  umpire: 'For umpires',
};

export function citationOf(item, kb) {
  if (item.kind === 'house_rule') {
    return { id: item.id, label: `Sunshine house rule · ${item.section}`, verified: item.verified, url: item.source_doc || null };
  }
  const src = kb.sources[item.source_id];
  const book = SANCTION_LABELS[item.sanction] || 'Rulebook';
  return { id: item.id, label: `${src?.title || book}${item.rule_ref ? ` · ${item.rule_ref}` : ''}`, verified: item.verified, url: item.url || src?.url || null };
}

/** If the question gives a pitch count, do the rest-day math in code. */
export function pitchQuestion(kb, input) {
  const m = String(input.question).match(/(\d{1,3})\s*pitch/i);
  if (!m) return null;
  const pitches = Number(m[1]);
  const r = computeRest(kb, { age: input.age, division: input.division, question: input.question, pitches });
  return r.ok ? { pitches, ...r } : null;
}

/** A complete answer built from the knowledge base alone (no model). */
export function composeOffline(kb, input, retrieved) {
  const role = input.role || 'parent';
  const callType = classifyCall(input.question, retrieved);
  const div = retrieved.division;
  const book = SANCTION_LABELS[div?.base_sanction] || 'Little League / Babe Ruth';
  // Order the sources by what actually answers the question (see retrieve.primary).
  const relevantFacts = retrieved.rule_facts.filter((f) => f.score >= 2);
  const related = (retrieved.related_house_rules || []).filter((h) => h.score >= STRONG_MATCH);
  let rules;
  if (retrieved.primary === 'house') rules = [...retrieved.house_rules, ...relevantFacts];
  else if (retrieved.primary === 'rulebook') {
    // The house rules themselves name the rulebook as the fallback (H001 for 10U/13U, H002 for 18U).
    const basis = kb.house_rules.find((h) => h.topic === 'rulebook' && div && h.divisions.includes(div.id));
    rules = [...relevantFacts.slice(0, 3), ...(basis ? [basis] : [])];
  } else rules = [...related, ...relevantFacts.filter((f) => f.score >= STRONG_MATCH)];
  rules = rules.slice(0, 4);
  // Judgment calls: always show how Sunshine handles questions about a call.
  if (callType === 'judgment' || callType === 'judgment_and_rule') {
    const must = ['H035', 'H034'];
    if (role === 'parent') must.push('H037');
    if (div?.base_sanction === 'little_league') must.push(kb.rule_facts.find((f) => f.topic === 'judgment')?.id);
    for (const id of must.reverse()) {
      const item = kb.house_rules.find((h) => h.id === id) || kb.rule_facts.find((f) => f.id === id);
      if (item && !rules.some((r) => r.id === id)) rules.push(item);
    }
  }
  // The teachable moment: every answer carries one, built from the team's coaching material.
  const teach = buildTeachable(kb, input, { callType, rules, division: div });
  const tip = teach.next_step ? { text: teach.next_step } : null;

  // Strategy questions about a game situation (when to run, tag up, hold) are answered from the
  // situation itself, with the rules it rests on, unless a rule already answers the question.
  const sit = teach.situation;
  const sitData = sit && kb.situations.find((x) => x.id === sit.id);
  const BASERUNNING = ['two_runners_same_base', 'fly_ball_baserunning', 'two_out_baserunning', 'ground_ball_baserunning', 'base_coach_signals'];
  const situationLed = !!sitData && BASERUNNING.includes(sitData.topic) && retrieved.primary !== 'house' &&
    !(retrieved.primary === 'rulebook' && rules[0] && sitData.rule_fact_codes.includes(rules[0].id));
  if (situationLed) {
    const linked = kb.rule_facts.filter((f) => sitData.rule_fact_codes.includes(f.id) && (!div || f.sanction === div.base_sanction));
    const basis = kb.house_rules.find((h) => h.topic === 'rulebook' && div && h.divisions.includes(div.id));
    rules = [...linked, ...rules.filter((r) => r.kind === 'house_rule' && r.topic !== 'rulebook' && (r.score ?? 0) >= STRONG_MATCH), ...(linked.length && basis ? [basis] : [])].slice(0, 4);
  }

  const pitch = pitchQuestion(kb, input);
  let verdict;
  if (pitch?.ok) {
    verdict = `Under the Sunshine ${pitch.division} house rule, ${pitch.pitches} pitches means ${pitch.rest_days} calendar day${pitch.rest_days === 1 ? '' : 's'} of rest` +
      `${pitch.over_limit ? `, and ${pitch.pitches} is over the ${pitch.division} daily limit of ${pitch.daily_max}` : ''}. Use the Pitch Count tab to get the exact date they can pitch again.`;
    const rule = kb.house_rules.find((h) => h.id === pitch.house_rule?.id);
    if (rule && !rules.some((r) => r.id === rule.id)) rules.unshift(rule);
  } else if (situationLed) {
    verdict = `This is situational baserunning: ${sit.name.toLowerCase()}. ${sit.offense}`;
  } else if (callType === 'coaching') {
    verdict = teach.moment;
  } else if (callType === 'judgment') {
    verdict = "This sounds like the umpire's judgment: calls like balls and strikes or safe and out belong to the umpire. In Sunshine, only a head coach or manager may discuss a call with the umpire, preferably between innings, and taunting or arguing with umpires leads to ejection after one warning. The best move is to adjust to the call and learn from the moment.";
  } else if (retrieved.primary === 'house') {
    verdict = `Sunshine's house rule covers this: ${rules[0].text}`;
  } else if (retrieved.primary === 'rulebook') {
    verdict = `Sunshine's house rules don't cover this directly, so the ${book} rules apply${div ? ` for ${div.label}` : ''}: ${rules[0].text}`;
  } else {
    verdict = `Neither the Sunshine house rules nor the ${book} rules in this app answer that directly. ` +
      `Where the house rules are silent, the full ${book} rulebook applies${book === 'Little League' ? ' (it\'s in the Little League app)' : ''}, so check it or ask your coach or a board member.` +
      (rules.length ? ' These rules may be related:' : '');
  }

  const draft = rules.some((r) => !r.verified);
  const shownType = situationLed && !pitch?.ok ? 'coaching' : callType;
  return {
    mode: 'offline',
    call_type: shownType,
    call_label: situationLed && !pitch?.ok ? 'Game situation' : CALL_LABELS[callType],
    verdict,
    rules: rules.map((r) => ({ id: r.id, text: r.text, ...citationOf(r, kb) })),
    pending_house_rules: retrieved.pending_house_rules.map((h) => ({ id: h.id, question: h.question })),
    teachable: teach,
    for_role: teach.perspectives.find((p) => p.you) ? { label: ROLE_OPENERS[role], text: teach.perspectives.find((p) => p.you).text } : null,
    lesson: teach.lesson ? { id: teach.lesson.id, title: teach.lesson.title, life_lesson: teach.lesson.life_lesson } : null,
    tip,
    situation: teach.situation,
    pitch_rest: pitch,
    draft_notice: [
      draft ? `The ${book} summaries here are written by our team from the linked sources and haven't been checked by the league yet. Sunshine house rules are from the league's house rules document.` : '',
      teach.draft ? "The coaching guidance comes from our team's coaching notes, which haven't been formally reviewed yet." : '',
    ].filter(Boolean).join(' ') || null,
    disclaimer: DISCLAIMER,
    division: retrieved.division?.id || null,
  };
}

/** Messages for an OpenAI-compatible chat model. The model may cite only ids given here. */
export function buildPrompt(kb, input, retrieved, { compact = false, teach = null } = {}) {
  const ctx = [];
  const n = compact ? 3 : 99;
  retrieved = {
    ...retrieved,
    house_rules: retrieved.house_rules.slice(0, n),
    rule_facts: retrieved.rule_facts.slice(0, compact ? Math.max(0, 3 - retrieved.house_rules.length) : 99),
    lessons: retrieved.lessons.slice(0, compact ? 1 : 99),
    insights: retrieved.insights.slice(0, compact ? 1 : 99),
    pending_house_rules: compact ? [] : retrieved.pending_house_rules,
  };
  for (const h of retrieved.house_rules) ctx.push(`[${h.id}] SUNSHINE HOUSE RULE (${h.divisions.join('/')}, ${h.section}): ${h.text}`);
  for (const h of (retrieved.related_house_rules || []).filter((x) => x.score >= STRONG_MATCH).slice(0, compact ? 0 : 2)) ctx.push(`[${h.id}] SUNSHINE HOUSE RULE, MAY NOT APPLY (${h.divisions.join('/')}, ${h.section}): ${h.text}`);
  for (const f of retrieved.rule_facts) ctx.push(`[${f.id}] ${(SANCTION_LABELS[f.sanction] || 'RULEBOOK').toUpperCase()} (ages ${f.age_min ?? '?'}-${f.age_max ?? '?'}, ${f.topic}${f.rule_ref ? ', ' + f.rule_ref : ''}): ${f.text}`);
  if (teach?.lesson) {
    const l = kb.lessons.find((x) => x.id === teach.lesson.id);
    ctx.push(`[${l.id}] TEACHABLE MOMENT LESSON "${l.title}": ${l.principle} Beyond the diamond: ${l.life_lesson} For a ${input.role}: ${l.for[input.role] || ''}`);
  } else if (teach?.principle) ctx.push(`[PHILOSOPHY] ${teach.principle.text}`);
  if (teach?.situation && !compact) ctx.push(`[${teach.situation.id}] GAME SITUATION "${teach.situation.name}": Offense: ${teach.situation.offense} Defense: ${teach.situation.defense}`);
  if (!teach) for (const l of retrieved.lessons) ctx.push(`[${l.id}] LESSON "${l.title}": ${l.principle} For a ${input.role}: ${l.for[input.role] || ''}`);
  for (const i of retrieved.insights) ctx.push(`[${i.id}] TIP (${i.topic}): ${i.text} Try this: ${i.try_this}`);
  for (const h of retrieved.pending_house_rules) ctx.push(`[${h.id}] HOUSE RULE NOT ENTERED YET: ${h.question}`);

  const div = retrieved.division;
  const system = `You are Sunshine DiamondAgentIQ, the learning companion for the ${kb.league.name} (${kb.league.ballpark.address}).
League mission: ${kb.league.mission}
${compact ? PHILOSOPHY_SHORT : PHILOSOPHY}

Rules for your answer:
- Use ONLY the numbered context below. Sunshine house rules override the rulebook (Little League for 10U and 13U, Babe Ruth League for 18U). If the context doesn't answer the question, say so and suggest asking a coach or board member.
- If no SUNSHINE HOUSE RULE below covers the question directly, say so and answer from the rulebook rules (Little League for 10U and 13U, Babe Ruth League for 18U): that is the league's fallback. If nothing below answers it, say the full rulebook applies and suggest checking it or asking a coach.
- If a needed house rule is "not entered yet", say the league hasn't published it in the app yet.
- Say whether it is the umpire's judgment, a written rule, both, or a coaching moment.
- Speak to a ${input.role}${div ? ` in the ${div.label} division (ages ${div.age_min}-${div.age_max})` : ''}. Plain words, warm, short.
- Never do pitch-count arithmetic yourself; point to the Pitch Count tab.
- No medical advice. Never blame a child, a coach or an umpire.
- The teachable moment is the most important part: turn this stressful or confusing moment into something the ${input.role} can learn from, using the TEACHABLE MOMENT LESSON. Calm, encouraging, no blame.
Return JSON only: {"call_type":"rule|judgment|judgment_and_rule|coaching","verdict":"2-3 sentences","teachable_moment":"1-2 sentences","life_lesson":"1 sentence","cited_ids":["ids you used"]}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Context:\n${ctx.join('\n') || '(nothing found)'}\n\nQuestion from a ${input.role}: ${input.question}` },
  ];
}

/** Keep only citations the model was actually given. */
export function checkCitations(modelJson, retrieved) {
  const allowed = new Set([
    ...retrieved.house_rules, ...retrieved.rule_facts, ...retrieved.lessons, ...retrieved.insights, ...retrieved.pending_house_rules,
  ].map((x) => x.id));
  const cited = (modelJson.cited_ids || []).filter((id) => allowed.has(id));
  const dropped = (modelJson.cited_ids || []).filter((id) => !allowed.has(id));
  return { cited, dropped };
}

/** Pull the JSON object out of a model reply (models sometimes wrap it in prose or code fences). */
export function parseModelJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not return an answer in the expected format.');
  const out = JSON.parse(m[0]);
  if (!out.verdict || typeof out.verdict !== 'string') throw new Error('The AI answer was missing its main point.');
  return out;
}

/**
 * Combine a model's reply with the offline answer. The offline answer supplies
 * the rules, sources and safety notes; the model only rewrites the wording.
 * Sources are limited to what the model was given (checkCitations).
 */
export function mergeModelAnswer(kb, offline, out, retrieved, { mode, engine }) {
  const { cited, dropped } = checkCitations(out, retrieved);
  const callType = CALL_LABELS[out.call_type] ? out.call_type : offline.call_type;
  const given = [...retrieved.house_rules, ...retrieved.rule_facts];
  const rules = cited.length
    ? [
      ...offline.rules.filter((r) => cited.includes(r.id)),
      ...given.filter((x) => cited.includes(x.id) && !offline.rules.some((r) => r.id === x.id)).map((x) => ({ text: x.text, ...citationOf(x, kb) })),
      ...offline.rules.filter((r) => !cited.includes(r.id)), // keep the rest, after the cited ones
    ]
    : offline.rules;
  return {
    ...offline,
    mode,
    engine,
    call_type: callType,
    call_label: CALL_LABELS[callType],
    verdict: String(out.verdict).slice(0, 1200),
    ai_moment: out.teachable_moment ? String(out.teachable_moment).slice(0, 600) : null,
    // The lesson, situation and per-role guidance stay exactly as the team wrote them.
    rules,
    dropped_citations: dropped,
  };
}

/** True when the question should be answered by code alone (pitch math never goes to a model). */
export function codeOnly(offline) {
  return !!offline.pitch_rest?.ok;
}
