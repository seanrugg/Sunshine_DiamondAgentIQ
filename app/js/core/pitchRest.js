// Pitch-count rest math. Code does the arithmetic, never a model.
// Uses the Little League baseball rest table in kb.pitch_rest, unless a
// verified Sunshine house rule (topic pitch_count) says otherwise.

/** Little League "league age" bands in the rest table: 6-8, 9-10, 11-12, 13-14, 15-16. */
export function restBand(table, age) {
  return table.filter((r) => age >= r.age_min && age <= r.age_max);
}

export function dailyMax(band) {
  return band.length ? Math.max(...band.map((r) => r.pitches_max)) : null;
}

/** Add whole days to a YYYY-MM-DD date, returning YYYY-MM-DD (timezone-safe). */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * @param {object} kb       knowledge base (needs pitch_rest, house_rules)
 * @param {object} input    { age, pitches, pitchedOn: 'YYYY-MM-DD' }
 * @returns {object} { ok, rest_days, eligible_on, daily_max, over_limit, band, house_rule, notes[] }
 */
export function computeRest(kb, { age, pitches, pitchedOn }) {
  const notes = [];
  const houseRule = (kb.house_rules || []).find((h) => h.topic === 'pitch_count' && h.text);
  if (houseRule) notes.push(`Sunshine house rule: ${houseRule.text}`);

  if (!Number.isFinite(age) || !Number.isFinite(pitches) || pitches < 0) {
    return { ok: false, error: 'Enter the pitcher\'s age and the number of pitches thrown.' };
  }
  const band = restBand(kb.pitch_rest, age);
  if (!band.length) {
    return {
      ok: false,
      gap: true,
      error: `Little League's pitch-count chart doesn't cover age ${age} (it stops at 16). ` +
        'Ask the Sunshine Board what limit 18U uses, and follow the safer choice until then.',
      house_rule: houseRule || null,
    };
  }
  const max = dailyMax(band);
  if (pitches === 0) return { ok: true, rest_days: 0, eligible_on: pitchedOn || null, daily_max: max, band, notes, house_rule: houseRule || null };

  const tier = band.find((r) => pitches >= r.pitches_min && pitches <= r.pitches_max);
  const over = pitches > max;
  const rest = tier ? tier.rest_days : Math.max(...band.map((r) => r.rest_days));
  const fact = (key) => (kb.ll_facts || []).find((f) => f.key === key && age >= (f.age_min ?? 0) && age <= (f.age_max ?? 99));
  if (over) {
    notes.push(`${pitches} is over the daily limit of ${max} for age ${age}.`);
    const finish = fact('complete_batter_at_limit');
    if (finish) notes.push(finish.text);
  }
  for (const key of ['three_consecutive_days', 'threshold_reached_mid_batter']) {
    const f = fact(key);
    if (f) notes.push(f.text);
  }

  // Little League: N rest days means N full calendar days off; eligible the day after.
  const eligible = pitchedOn ? addDays(pitchedOn, rest + 1) : null;
  return {
    ok: true, rest_days: rest, eligible_on: eligible, daily_max: max, over_limit: over,
    band: `${band[0].age_min}-${band[0].age_max}`, source_url: band[0].url, verified: band.every((b) => b.verified),
    house_rule: houseRule || null, notes,
  };
}
