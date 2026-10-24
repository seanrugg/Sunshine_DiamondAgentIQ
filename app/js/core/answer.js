// Turns retrieved knowledge into an answer. Offline mode uses composeOffline
// (no model). Server mode sends buildPrompt() to a model and checks its reply
// with checkCitations(), falling back to composeOffline on any failure.
import { PHILOSOPHY, DISCLAIMER } from './philosophy.js';
import { computeRest } from './pitchRest.js';

const JUDGMENT_WORDS = ['strike zone', 'zone', 'safe', 'called', 'bad call', 'the call', 'tagged', 'balk', 'fair', 'foul', 'obstruction', 'interference', 'umpire', 'ump'];
const RULE_WORDS = ['how many', 'allowed', 'can she', 'can he', 'can they', 'can my', 'rule', 'limit', 'legal', 'eligible', 'pitches', 'rest', 'bat', 'innings', 'courtesy'];
const COACHING_WORDS = ['help', 'scared', 'afraid', 'nervous', 'confidence', 'practice', 'drill', 'improve', 'upset', 'cried', 'frustrated', 'better'];

/** 'judgment' | 'rule' | 'judgment_and_rule' | 'coaching' */
export function classifyCall(question, retrieved) {
  const q = ` ${String(question).toLowerCase()} `;
  const has = (list) => list.some((w) => new RegExp(`\\b${w}\\b`).test(q));
  const judgment = has(JUDGMENT_WORDS);
  const rule = has(RULE_WORDS) || retrieved.house_rules.length > 0;
  const coaching = has(COACHING_WORDS);
  if (judgment && rule) return 'judgment_and_rule';
  if (judgment) return 'judgment';
  if (rule) return 'rule';
  if (coaching) return 'coaching';
  return retrieved.ll_facts.length ? 'rule' : 'coaching';
}

export const CALL_LABELS = {
  rule: 'Written rule',
  judgment: "Umpire's judgment",
  judgment_and_rule: 'Judgment + rule',
  coaching: 'Coaching moment',
};

const ROLE_OPENERS = {
  parent: 'For parents',
  coach: 'For coaches',
  player: 'For players',
  umpire: 'For umpires',
};

export function citationOf(item, kb) {
  if (item.kind === 'house_rule') {
    return { id: item.id, label: `Sunshine house rule · ${item.section}`, verified: item.verified, url: null };
  }
  const src = kb.sources[item.source_id];
  return { id: item.id, label: `${src?.title || 'Little League'}${item.rule_ref ? ` · ${item.rule_ref}` : ''}`, verified: item.verified, url: item.url || src?.url || null };
}

/** If the question gives a pitch count, do the rest-day math in code. */
export function pitchQuestion(kb, input) {
  const m = String(input.question).match(/(\d{1,3})\s*pitch/i);
  if (!m || !Number.isFinite(input.age)) return null;
  const pitches = Number(m[1]);
  return { pitches, ...computeRest(kb, { age: input.age, pitches }) };
}

/** A complete answer built from the knowledge base alone (no model). */
export function composeOffline(kb, input, retrieved) {
  const role = input.role || 'parent';
  const callType = classifyCall(input.question, retrieved);
  const rules = [...retrieved.house_rules, ...retrieved.ll_facts].slice(0, 4);
  // Judgment calls: always show the rule that says they can't be protested.
  const notProtestable = kb.ll_facts.find((f) => f.topic === 'judgment');
  if (callType === 'judgment' && notProtestable && !rules.some((r) => r.id === notProtestable.id)) rules.unshift(notProtestable);
  const lesson = retrieved.lessons[0] || null;
  const tip = retrieved.insights[0] || null;

  const pitch = pitchQuestion(kb, input);
  let verdict;
  if (pitch?.ok) {
    verdict = `For ${[8, 11, 18].includes(input.age) ? 'an' : 'a'} ${input.age}-year-old who threw ${pitch.pitches} pitches, Little League requires ${pitch.rest_days} calendar day${pitch.rest_days === 1 ? '' : 's'} of rest` +
      `${pitch.over_limit ? ` (and ${pitch.pitches} is over the daily limit of ${pitch.daily_max})` : ''}. Use the Pitch Count tab to get the exact date they can pitch again.`;
  } else if (pitch?.gap) {
    verdict = pitch.error;
  } else if (callType === 'coaching' && (lesson || tip)) {
    verdict = tip ? `${tip.text} ${tip.try_this}` : lesson.principle;
  } else if (callType === 'judgment') {
    verdict = "This sounds like a judgment call. Calls like balls and strikes or safe and out belong to the umpire, and in Little League they can't be protested. The best move is to adjust to the call and learn from the moment.";
  } else if (rules.length) {
    verdict = rules[0].kind === 'house_rule'
      ? `Sunshine's house rule covers this: ${rules[0].text}`
      : `Here's what Little League rules say${retrieved.division ? ` for ${retrieved.division.label}` : ''}: ${rules[0].text}`;
  } else if (callType === 'coaching') {
    verdict = 'This is a coaching moment more than a rules question. Here is a way to think about it.';
  } else {
    verdict = "I couldn't find this in the Sunshine house rules or the Little League rules loaded in the app. Ask your coach or a board member.";
  }

  const draft = rules.some((r) => !r.verified);
  return {
    mode: 'offline',
    call_type: callType,
    call_label: CALL_LABELS[callType],
    verdict,
    rules: rules.map((r) => ({ id: r.id, text: r.text, ...citationOf(r, kb) })),
    pending_house_rules: retrieved.pending_house_rules.map((h) => ({ id: h.id, question: h.question })),
    for_role: lesson ? { label: ROLE_OPENERS[role], text: lesson.for[role] } : null,
    lesson: lesson ? { id: lesson.id, title: lesson.title, life_lesson: lesson.life_lesson } : null,
    tip: tip && !verdict.includes(tip.text) ? { id: tip.id, text: tip.text, try_this: tip.try_this } : null,
    situation: retrieved.situations[0] ? { name: retrieved.situations[0].name, offense: retrieved.situations[0].offense, defense: retrieved.situations[0].defense } : null,
    pitch_rest: pitch,
    draft_notice: draft ? 'Some rule summaries here are drafts written by our team from the linked sources and not yet checked by the league.' : null,
    disclaimer: DISCLAIMER,
    division: retrieved.division?.id || null,
  };
}

/** Messages for an OpenAI-compatible chat model. The model may cite only ids given here. */
export function buildPrompt(kb, input, retrieved) {
  const ctx = [];
  for (const h of retrieved.house_rules) ctx.push(`[${h.id}] SUNSHINE HOUSE RULE (${h.division}, ${h.section}): ${h.text}`);
  for (const f of retrieved.ll_facts) ctx.push(`[${f.id}] LITTLE LEAGUE (${f.age_min ?? '?'}-${f.age_max ?? '?'}, ${f.topic}${f.rule_ref ? ', ' + f.rule_ref : ''}): ${f.text}`);
  for (const l of retrieved.lessons) ctx.push(`[${l.id}] LESSON "${l.title}": ${l.principle} For a ${input.role}: ${l.for[input.role] || ''}`);
  for (const i of retrieved.insights) ctx.push(`[${i.id}] TIP (${i.topic}): ${i.text} Try this: ${i.try_this}`);
  for (const h of retrieved.pending_house_rules) ctx.push(`[${h.id}] HOUSE RULE NOT ENTERED YET: ${h.question}`);

  const div = retrieved.division;
  const system = `You are Sunshine DiamondAgentIQ, the learning companion for the ${kb.league.name} (${kb.league.ballpark.address}).
League mission: ${kb.league.mission}
${PHILOSOPHY}

Rules for your answer:
- Use ONLY the numbered context below. Sunshine house rules override Little League rules. If the context doesn't answer the question, say so and suggest asking a coach or board member.
- If a needed house rule is "not entered yet", say the league hasn't published it in the app yet.
- Say whether it is the umpire's judgment, a written rule, both, or a coaching moment.
- Speak to a ${input.role}${div ? ` in the ${div.label} division (ages ${div.age_min}-${div.age_max})` : ''}. Plain words, warm, short.
- Never do pitch-count arithmetic yourself; point to the Pitch Count tab.
- No medical advice. Never blame a child, a coach or an umpire.
Return JSON only: {"call_type":"rule|judgment|judgment_and_rule|coaching","verdict":"2-3 sentences","for_role":"1-2 sentences for the ${input.role}","life_lesson":"1 sentence","cited_ids":["ids you used"]}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Context:\n${ctx.join('\n') || '(nothing found)'}\n\nQuestion from a ${input.role}: ${input.question}` },
  ];
}

/** Keep only citations the model was actually given. */
export function checkCitations(modelJson, retrieved) {
  const allowed = new Set([
    ...retrieved.house_rules, ...retrieved.ll_facts, ...retrieved.lessons, ...retrieved.insights, ...retrieved.pending_house_rules,
  ].map((x) => x.id));
  const cited = (modelJson.cited_ids || []).filter((id) => allowed.has(id));
  const dropped = (modelJson.cited_ids || []).filter((id) => !allowed.has(id));
  return { cited, dropped };
}
