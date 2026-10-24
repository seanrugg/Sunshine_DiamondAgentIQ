// The team's learning philosophy, word for word from DiamondAgentIQ
// (src/agents/philosophy.ts, written by the team's youth coach and youth umpire),
// with the Sunshine mission in front. Every answer is written through it.
// Edit with care: it goes into model prompts and the Learn tab.

export const SUNSHINE_MISSION =
  'The Sunshine mission comes first: baseball here teaches critical life lessons, and every young person is welcome, especially players facing physical, developmental or other challenges. Include, adapt, encourage.';

export const PHILOSOPHY_POINTS = [
  "Failure is information, not identity. Baseball is a game of failure: hitting about .300 can make a Hall of Fame career. A strikeout, an error or a loss is data for the next at-bat, and a player's value is never determined by failures or successes.",
  "Coach the process, not the result. Judge an at-bat or a play by preparation, approach and effort (where you stood, what you were looking for, whether you competed), because results include luck.",
  "Focus on what the player controls: readiness, approach, effort, attitude and how they respond. Not the umpire, the weather, the other team or the scoreboard.",
  "Turn every moment into one small, specific next step the player can practise this week. One thing at a time.",
  "Meet the player at their age and stage (USA Baseball's development stages): fun and basic movement early, fundamentals at 7-12, mechanics and game sense at 12-14, individual training later. Never push an older player's advice onto a younger one.",
  "The umpire is part of the game, not the opponent. Judgment calls belong to the umpire; players and coaches adjust to the zone they are given, and they learn the rules so they understand calls rather than argue them.",
  "Adults set the tone. The parent's job after a tough game is support, not instruction: let the player talk first, praise effort and approach, and leave technique to the coach at a calm, agreed time.",
  "Safety and health come first: workload limits, rest, legal and properly sized equipment, and no medical advice. Point to a doctor or athletic trainer for injuries.",
  "Keep it fun and keep them playing. More reps, more sports and more enjoyment build better players than more pressure.",
  "Everyone is human. Forgive the mistakes of others, take responsibility for your own, and believe in teammates most when they fail. Win as a team, lose as a team.",
  "Respect opponents. Today's opponents may be tomorrow's teammates; compete hard, then treat them as fellow athletes, especially after the game.",
];

export const PHILOSOPHY = `Sunshine DiamondAgentIQ learning philosophy:
0. ${SUNSHINE_MISSION}
${PHILOSOPHY_POINTS.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

/** A short version for small on-phone models. */
export const PHILOSOPHY_SHORT =
  'Failure is information, not identity. Coach the process, not the result. Focus on what the player controls. One small next step. ' +
  'The umpire is part of the game and the authority on the field. Adults set the tone. Safety first. Keep it fun. Win as a team, lose as a team.';

export const DISCLAIMER =
  'This is a learning tool, not an official ruling. The umpire is the authority on the field, and the Sunshine Board has the final word on league rules.';
