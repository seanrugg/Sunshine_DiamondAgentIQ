// Runner reads: what a runner should do, by where they are, the outs and the
// kind of batted ball. From data/coaching/baserunning_reads.csv (the "Base
// Running Situations to Practice" sheet, in our own words). Only the reads
// that match the question are returned, so answers carry no filler.

const BASE = { first: 'first', '1st': 'first', second: 'second', '2nd': 'second', third: 'third', '3rd': 'third' };

/** Pull runner position, outs and batted-ball type out of a question. Anything not mentioned is null. */
export function parseBaserunning(question) {
  const q = String(question || '').toLowerCase();

  let outs = null;
  if (/\b(no|zero|0)\s+outs?\b|nobody out|none out/.test(q)) outs = 0;
  else if (/\b(one|1)\s+outs?\b/.test(q)) outs = 1;
  else if (/\b(two|2)\s+outs?\b/.test(q)) outs = 2;

  // "Two runners on second" asks for the rule (7.03), not a runner read.
  const sameBase = /\b(two|2|both) runners\b|same base/.test(q);

  let runner = null;
  const on =[...q.matchAll(/\b(first|1st|second|2nd|third|3rd)\b/g)].map((m) => BASE[m[1]]);
  if (sameBase) runner = null;
  else if (/bases loaded|loaded bases|bases are loaded/.test(q)) runner = 'third_loaded';
  else if (/(first|1st)( base)? (is )?(open|empty)|(no one|nobody) (is )?on (first|1st)/.test(q) && /\b(second|2nd)\b/.test(q)) runner = 'second';
  else if (/(first|1st) and (second|2nd)|(second|2nd) and (first|1st)|runners? on (first|1st) and/.test(q)) runner = 'second_forced';
  else if (/runners? (is |was )?(on|at) (first|1st|second|2nd|third|3rd)|(on|at|from) (first|1st|second|2nd|third|3rd)( base)?\b/.test(q) && on.length) runner = on[0];

  let ball = null;
  const left = /left side|to (the )?short|shortstop|to third|third base ?man|\bss\b|\b3b\b|in front of/.test(q);
  const right = /right side|to second|second base ?man|to first|first base ?man|\b2b\b|\b1b\b|behind (him|her|me|the runner)/.test(q);
  if (/pop ?up|popped up|pop fly/.test(q)) ball = 'popup';
  else if (/line drive|liner/.test(q)) ball = 'line_drive';
  else if (/foul (fly|pop)|fly.*foul/.test(q)) ball = /right/.test(q) ? 'deep_foul_fly_right' : /left/.test(q) ? 'deep_foul_fly_left' : 'deep_foul_fly';
  else if (/fly ?ball|flied out|deep fly|fly out/.test(q)) ball = /right/.test(q) ? 'deep_fly_right' : /left/.test(q) ? 'deep_fly_left' : 'deep_fly';
  else if (/ground ?ball|grounder|grounded|chopper|roller/.test(q)) ball = left && !right ? 'ground_left' : right && !left ? 'ground_right' : 'ground';

  return { outs, runner, ball, mentioned: outs !== null || runner !== null || ball !== null };
}

// "deep_fly" in a question matches the left/right rows too, and the reverse.
function ballMatches(rowBall, ball) {
  if (!ball || rowBall === 'any') return true;
  if (rowBall === ball) return true;
  const family = (b) => b.replace(/_(left|right)$/, '');
  return family(rowBall) === family(ball) && (rowBall === family(rowBall) || ball === family(ball));
}

/**
 * The reads that fit the question: at most 3, and only when the question names
 * enough of the situation (a runner or a batted ball) to make them specific.
 */
export function findReads(kb, question) {
  const s = parseBaserunning(question);
  if (!s.mentioned) return { situation: s, reads: [] };
  if (s.outs === 2) return { situation: s, reads: kb.reads.filter((r) => r.outs === '2') };
  if (!s.runner && !s.ball) return { situation: s, reads: [] };
  const rows = kb.reads.filter((r) => r.outs === '0-1' &&
    (!s.runner || r.runner === s.runner) && ballMatches(r.ball, s.ball));
  // Without a runner position, the same ball reads differently from each base: only answer if they agree.
  if (!s.runner && new Set(rows.map((r) => r.read)).size > 1) return { situation: s, reads: [] };
  return { situation: s, reads: rows.slice(0, 3), needs_outs: s.outs === null };
}

const RUNNER_LABEL = {
  first: 'Runner on first', second: 'Runner on second, first base open', third: 'Runner on third, first and second open',
  second_forced: 'Runner on second with a runner on first', third_loaded: 'Runner on third, bases loaded', any: 'Any runner',
};
const BALL_LABEL = {
  popup: 'pop-up', line_drive: 'line drive', ground_left: 'ground ball to the left side', ground_right: 'ground ball to the right side',
  deep_fly: 'deep fly ball', deep_fly_left: 'deep fly to left', deep_fly_right: 'deep fly to right', deep_foul_fly: 'deep foul fly',
  deep_foul_fly_left: 'deep foul fly to left', deep_foul_fly_right: 'deep foul fly to right', any: 'any batted ball',
};

export function readLabel(r) {
  return `${RUNNER_LABEL[r.runner] || r.runner}, ${r.outs === '2' ? 'two outs' : 'fewer than two outs'}, ${BALL_LABEL[r.ball] || r.ball}`;
}
