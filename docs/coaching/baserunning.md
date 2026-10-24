# Situational baserunning (Sunshine additions)

Coaching material added to the Sunshine app on 2026-10-24 at Sean's direction, to teach situational baserunning: knowing the outs, when to run and when to hold, tagging up, and following the base coach. It lives in `data/coaching/*.csv` with the rest of the team's material and is marked draft (`verified=false`) until the team reviews it. These rows are not in the DiamondAgentIQ repo yet; copy them there to share.

The rules behind it are in `data/little_league/rules_facts.csv` (F301-F304: Little League Rules 7.03, 7.08) and `data/babe_ruth/rules_facts.csv` (F311, F313, F314: Official Baseball Rules, for 18U). They are team summaries; check them against the current rulebooks.

## Lessons

### L012: Know the situation before the pitch

Most baserunning mistakes happen before the ball is hit. Before every pitch, a runner should know how many outs there are, which bases are occupied, whether they are forced to run, and what they will do on a ground ball, a fly ball and a line drive.

**Beyond the diamond:** Thinking ahead turns panic into a plan. At school, at work and at home, the people who prepare before the moment make better decisions in it.

- **Player:** Before every pitch, check: how many outs, where are the runners, am I forced? Then decide: ground ball, go or hold; fly ball, tag up or go halfway; line drive, freeze. Then look at your base coach.
- **Coach:** Make the pre-pitch check a habit out loud: show the outs with your fingers and ask runners 'what do you do on a ground ball?' A baserunning mistake is usually a teaching gap, not a lack of effort.
- **Parent:** Baserunning is one of the hardest parts of the game to learn. After a mistake, ask 'how many outs were there?' instead of 'why did you run?' and let your player work it out.
- **Umpire:** Know the outs and the force situation before every pitch too. It's what lets you get the call right when two runners end up on the same base.

### L013: Eyes up: trust your base coach

A runner can't see the whole field, especially when the ball is behind them. The base coach can. Once the ball is in play, the runner's job is to run hard, find the coach early and follow the signal, even when instinct says otherwise.

**Beyond the diamond:** No one sees everything alone. Trusting a teammate who has the better view, and being someone others can trust, is how teams, families and workplaces get it right.

- **Player:** Run hard and find your coach before you reach the base, not after. Arms up means stop, a windmill means go, palms down means slide. Ball in front of you: your eyes help decide. Ball behind you: the coach decides.
- **Coach:** Use a few big, simple signals, the same ones every time, and practise them in every baserunning drill. Get in position and signal early. If a runner misses a sign, coach it at practice, not in front of everyone.
- **Parent:** Cheer the hustle and leave 'go' and 'stop' to the base coach. Shouting from the stands gives a runner two voices to follow and makes the decision harder.
- **Umpire:** Base coaches may signal and shout, but they may not physically help a runner. Watch for a coach touching or holding a runner who is rounding a base.

## Game situations

### SIT006: Two runners on the same base

bases: two runners on one base · outs: any

**Offense:** Both runners stay on the base until the umpire rules; never step off thinking you're out. The base belongs to the lead runner unless the lead runner was forced to advance; then it belongs to the trailing runner. The runner who isn't entitled to the base looks to the coach: go back to the base they came from if it's open and they can make it.

**Defense:** Tag both runners while they're on the base. The umpire calls out the one who wasn't entitled to it, so tagging both removes the guesswork. Then look for the next play.

**Common mistakes:** A runner walks off the base thinking the play is over and gets tagged; the fielder tags only one runner, the wrong one; the trailing runner freezes between bases instead of checking the coach.

Rules: F301;F302;F311 · Lessons: L012;L013

### SIT007: Fly ball with fewer than two outs

bases: any · outs: 0 or 1

**Offense:** On a deep fly ball, go back and tag up: leave only after the catch, on the coach's call. On a shallow fly, go halfway, or as far as you can and still get back, so you can advance if it drops or return if it's caught. Never run on contact with fewer than two outs on a ball in the air.

**Defense:** Catch it, then throw ahead of the lead runner to the base they're heading for, through the cut-off. If a runner left before the catch, appeal by throwing to that base before the runner gets back.

**Common mistakes:** Running on contact with fewer than two outs and getting doubled off; leaving the base before the catch; tagging up on a shallow fly and getting thrown out.

Rules: F304;F314 · Lessons: L012;L013

### SIT008: Two outs: run on contact

bases: any · outs: 2

**Offense:** With two outs, every runner runs on any batted ball. If the ball is caught the inning is over anyway, so there's nothing to protect; if it drops or gets through, runs score. Run hard and find the base coach.

**Defense:** Take the sure out. With two outs, get the force at the closest base or the out at first; don't chase the lead runner.

**Common mistakes:** Runners waiting on a fly ball with two outs; fielders trying for a harder play instead of the easy force that ends the inning.

Rules: F303;F313 · Lessons: L012

### SIT009: Runner on second, ground ball, fewer than two outs

bases: second · outs: 0 or 1

**Offense:** Ball hit in front of you (to the shortstop or third baseman): hold, unless you're forced. Ball hit behind you (to the right side): go to third. If first base is also occupied you're forced, so run. Line drive: freeze until it goes through.

**Defense:** Look the runner back before throwing to first. If the runner breaks for third on a ball hit in front of them, throw to third.

**Common mistakes:** Running into an out on a ball hit to the left side; forgetting you're forced when first base is occupied; breaking on a line drive and getting doubled off.

Rules: F303;F313 · Lessons: L012

### SIT010: Rounding a base: find the base coach

bases: any · outs: any

**Offense:** Pick up the base coach before you reach the base. Round it hard only when the coach waves you on; stop and get back on a stop sign. When the ball is behind you, the coach makes the call; at third base the third-base coach decides whether you score.

**Defense:** Throw behind a runner who rounds too far, and hit the cut-off so trailing runners can't take an extra base.

**Common mistakes:** Running with your head down and missing the stop sign; watching the ball instead of the coach when it's behind you; slowing down before the coach gives a sign.

Rules: (none) · Lessons: L013;L012

## Coaching tips

### C020: Before each pitch as a runner (for player)

Most baserunning outs come from not knowing the situation, not from being slow.

**Why:** When you've decided before the pitch, you react instead of think, and you don't freeze or run into an out.

**Try this:** Every pitch: check the outs (look for your coach's fingers), know whether you're forced, and decide what you'll do on a ground ball, a fly ball and a line drive before the ball is hit.

### C021: Coaching first or third base (for coach)

Runners follow what they can see: a few big, consistent signals work better than words.

**Why:** Crowd noise and a runner's own breathing drown out voices; arms don't get lost.

**Try this:** Pick three signals (both arms up = stop, windmill = go, palms down = slide) and use them in every baserunning drill so they're automatic by game day.

### C022: After a baserunning mistake (for parent)

A baserunning mistake usually means the situation was confusing, not that the player wasn't trying.

**Why:** Shame makes players hesitate on the bases; questions help them learn to read the situation.

**Try this:** On the ride home, ask two questions: how many outs were there, and what did the coach signal? Let your player work out the right play.

### C023: Teaching situational baserunning at practice (for coach)

Baserunning sense is learned in game-like reps, not explained once.

**Why:** Players have to see ground balls, fly balls and line drives with runners on to recognize them in a game.

**Try this:** Situation drill: put runners on base, call out the outs, and hit fungoes (ground ball, fly ball, line drive). Runners react while base coaches signal; after each rep, ask the runner why they ran or held.
