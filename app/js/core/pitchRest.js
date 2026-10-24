// Pitch-count rest math. Code does the arithmetic, never a model.
// Sunshine house rules set the limits for every division (H015 for 10U/13U,
// H016 for 18U), from kb.house_pitch_rest. Little League's own chart
// (kb.ll_pitch_rest) is kept only for reference.
import { resolveDivision } from './retrieve.js';

/** Add whole days to a YYYY-MM-DD date, returning YYYY-MM-DD (timezone-safe). */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * @param {object} kb     knowledge base
 * @param {object} input  { age?, division?, pitches, pitchedOn?: 'YYYY-MM-DD' }
 *                        The division comes from `division`, or else from `age`.
 */
export function computeRest(kb, { age, division, question, pitches, pitchedOn }) {
  if (!Number.isFinite(pitches) || pitches < 0) {
    return { ok: false, error: 'Enter the number of pitches thrown.' };
  }
  const div = resolveDivision(kb.league, { division, age, question });
  if (!div) {
    return { ok: false, error: 'Pick a division (10U, 13U or 18U) or enter an age from 8 to 18.' };
  }
  const table = kb.house_pitch_rest.filter((r) => r.division === div.id);
  const max = table[0].daily_max;
  const rule = kb.house_rules.find((h) => h.id === table[0].house_rule_id);
  const notes = [];

  const tier = table.find((r) => pitches >= r.pitches_min && pitches <= r.pitches_max);
  const over = pitches > max;
  const rest = pitches === 0 ? 0 : tier ? tier.rest_days : Math.max(...table.map((r) => r.rest_days));
  if (over) notes.push(`${pitches} is over the Sunshine ${div.label} daily limit of ${max} pitches.`);
  if (rule?.note) notes.push(rule.note);

  // Rulebook notes that still apply under the house limits (Little League divisions only).
  if (div.base_sanction === 'little_league') {
    for (const key of over ? ['complete_batter_at_limit', 'three_consecutive_days'] : ['three_consecutive_days']) {
      const f = kb.rule_facts.find((x) => x.sanction === 'little_league' && x.key === key);
      if (f) notes.push(`${f.text} (Little League)`);
    }
  }

  // N rest days means N full calendar days off; eligible the day after.
  const eligible = pitchedOn ? addDays(pitchedOn, rest + 1) : null;
  return {
    ok: true,
    division: div.id,
    rest_days: rest,
    eligible_on: eligible,
    daily_max: max,
    over_limit: over,
    house_rule: rule ? { id: rule.id, text: rule.text } : null,
    source: `Sunshine house rule ${rule?.id ?? ''}`.trim(),
    notes,
  };
}
