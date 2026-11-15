# Level design review

Do the levels follow the principles of fun? Four questions, each now answered by an automated
check (`npm test`, `npm run levels:report`, the Level Lab):

1. **Are the levels visibly different from each other?**
2. **Does the difficulty progress?**
3. **Do they use every movement option** — the mid-air dash, long drops, stomping, the ground pound?
4. **Are there non-obvious paths?**

## Findings on the original campaign

Measured with the campaign audit (`src/campaignAudit.js`) on the original 12 levels:

| Question | Finding |
|---|---|
| Visibly different? | **No.** Every level was "go forward along +z while gently rising". 13 pairs of levels were near-identical by their layout signature — *A little higher* and *Zigzag* scored 0.12 apart (threshold 0.55, 0.7 within a tier). The six generated levels all had 50–60 units of length, 2.2–3 unit platforms, 14–22 jumps and 20–26 s par times: tiers 3 and 4 differed mainly in their sky. |
| Difficulty progresses? | **Not smoothly.** Ratings 2.9, 3.6, **3.1**, 3.3, 5.3, **5.1**, 6.0, 6.0, 6.7, 6.8, 7.0, **6.9** — three drops, a plateau, and a cliff from level 6 to 7 (par 9 s → 23 s, 8 → 20 platforms). The hardest jump never exceeded 70% of the limit, so tier 4 was barely harder than tier 3. |
| Every movement option? | **No.** No route ever needed — or rewarded — the air dash (the audit only planned plain jumps). The longest drop on any route was 1.4 units (less than a jump's height): no leap of faith anywhere. The ground pound only mattered in fights. |
| Non-obvious paths? | **Only punishing ones.** Off-route content was 18 dead-end "false paths", which cost time and never pay off; the generator *rejected* any alternate route. Curiosity was never rewarded. (Re-measured with the dash, several of those "dead ends" actually led somewhere — by accident.) |

## Principles applied

- **Distinct identities.** Every level has a recognisable shape — tall and narrow, low and wide,
  a descent, a tower, a long crossing — measured by a layout signature (length, width, height
  range, net rise, the height *profile* along the route, platform size, sideways and up/down travel,
  the moves, shortcuts, dead ends and fights it asks for). Sizes compare by ratio: twice as tall
  reads as different at any scale.
- **A steady ramp.** Challenge (jump precision + required dashes + fights) rises at every level;
  each tier is clearly harder than the last; course length grows without cliffs.
- **Teach, then use.** Each move is introduced on its own, gently and with a hint, then keeps
  appearing: the dash lesson's chasm needs only 53% of the dash's reach (0.8 s timing window),
  later chasms up to ~78%.
- **Reward curiosity.** Shortcuts — off the obvious line, needing a daring dash — skip part of the
  course (and often its enemies). Dead ends still exist, but as tempting low ledges you can climb
  back out of.

## What changed

### The audits

- **The air dash is part of the game's physics model**: when no fair route exists with plain jumps,
  the route planner uses air-dash jumps — as few as possible, then the easiest. The bot finds the
  dash timing by trying every tick on copies of the deterministic physics, which also measures the
  **timing window** a human gets (`TIGHT_DASH` below 100 ms).
- **Move vocabulary** per level: plain jumps, air-dash jumps, long drops (≥ 2.5 down).
- **Shortcuts are proven**: an alternate branch counts only if the bot enters it from the route,
  crosses it and leaves it further along, skipping at least one route platform — every move in the
  real physics (`SHORTCUT_UNVERIFIED` otherwise).
- **False paths are judged from where you'd jump in** (a dash in from the platform before, that only
  leads back to that spot, is still no progress); everything counts the dash when asking "does this
  lead anywhere?".
- New fun requirements by difficulty: a required dash from 0.15 (two from 0.6), a long drop from
  0.2, a shortcut from 0.15; dead ends capped at 4.
- **The campaign audit** (`src/campaignAudit.js`): `TOO_SIMILAR`, `CHALLENGE_DROP`, `FLAT_TIERS`,
  `LENGTH_CLIFF`, `MOVE_UNUSED`, `MOVE_DROPPED`, `HARSH_INTRODUCTION`, `UNTAUGHT`.

### The hand-made levels (tiers 1–2)

| # | Level | Identity | Changes |
|---|---|---|---|
| 1 | First steps | the tutorial: flat, wide stones | now low and flat (hop up, down, up) instead of a copy of the climbs that follow; move hint |
| 2 | A little higher | tall and narrow: twice the height of anything before | rebuilt as a 3.2-high climb past the first enemy; stomp hint |
| 3 | Zigzag | low and wide: big swings left and right | wider swings, a step harder than level 2 (was a dip) |
| 4 | **Mind the Gap** (was *Precision*) | the air-dash lesson | a chasm only the dash crosses (with a hint), a side pillar hiding a dash shortcut, a dead-end ledge past the chasm |
| 5 | **Long Way Down** (was *Master*) | the first course that goes *down* | from a tall pillar: dash across, leap of faith into a valley (crawler), climb out past a spiker, leap again; a secret ledge dashes over the whole valley |
| 6 | Climb | the tallest climb | keeps the stair climb and crux, then dashes to a high perch and leaps 3.0 down to the goal; a secret ledge skips the crawler and the crux |

### The generator (tiers 3–4)

- New patterns: **dash chasms** (a plain jump falls clearly short, the dash lands within a band of
  its reach, and no earlier platform can dash past the design), **leaps of faith** (2.6–4.5 down onto a
  wide landing) and **shortcuts** (an off-line platform needing at least one dash, skipping 2–4 route
  platforms, kept apart from dead ends).
- **Dead ends that survive the dash**: a ledge 1.05–1.3 below its junction, then the route climbs
  ≥ 0.62 — more than a full jump above the ledge, out of reach of any dash, however close.
- **Themes** give each generated level a shape: *ascent* (towers and stairs, then leaps),
  *cascade* (tall start, tumbling down), *switchbacks* (winding, an extra shortcut), *skyway* (long
  crossings, an extra dash chasm), *gauntlet* (an extra fight). The level's tip names its theme.
- Cheap pre-checks reject designs that can't meet the requirements before auditing them
  (generation is ~8× faster, despite the extra rules).
- `scripts/pick-campaign.mjs` scans seeds × themes and searches (with backtracking) for a
  campaign: a smooth challenge ramp to evenly spaced targets, no theme twice in a tier, visibly
  distinct from every other level, and every tier using every move.

## One new technique per region

Each region adds a movement technique and keeps the earlier ones (`TIER_ABILITIES` in
`src/levels.js`; `level.abilities` gates them in the physics):

| Region | New technique | How it's taught | How it's needed / mixed |
|---|---|---|---|
| Green Meadows | **bounce pads** (terrain: land on one and you're launched ~3.4 up) | *A little higher*: an optional pad off to the side, a hop-skip past a step | *Zigzag*: the goal ledge is far above a jump — only the pad reaches it; *Long Way Down* (canyon) climbs out of its valley on one |
| Sunbaked Canyon | **air dash** | *Mind the Gap*: a chasm only the dash crosses (with a hint) | every later level has at least one dash chasm |
| Alpine Dusk | **glide** (hold jump while falling) | the region's first level opens with a hint | glide gaps: a long way across and down (6–10 across, 2–5 down) that only a glide makes |
| Starlit Ruins | **double jump** (jump again in the air) | the region's first level opens with a hint | double walls: a ledge 1.8–2.5 up, too tall for one jump; deeper dead ends (judged with the double jump) |

The audits know every move: `moveReach(kind, dh)` / `movePeak(kind)` in `src/levelAudit.js` give each
move's horizontal reach at a height change and its peak; when plain jumps can't make a gap the route
planner uses the gentlest special move the level allows (dash, then glide, then double jump; bounce
pads are part of the terrain), and the bot proves it in the real physics, timing included. The
generator (`src/levelGenerator.js`) has a pattern per technique — **glide gaps**, **double walls**
and **spring pads** (a pad, then a ledge high above it that only its bounce reaches) — and schedules the
techniques it is given (`generateLevel({ abilities, techniques })`) so every level of a region uses
its technique at least once and the last region mixes them. False paths can now go deeper when the
double jump is around (a dead end is still judged with every move the level allows). The campaign
audit counts the techniques (`TECHNIQUES`): a region's first level must teach its technique
(`UNTAUGHT` otherwise), and a technique's weight adds to a level's challenge — so the ramp accounts
for the new moves.

## The campaign now

| # | Level | Tier | Identity | Challenge | Moves |
|---|---|---|---|---|---|
| 1 | First steps | Meadow | tutorial | 3.04 | jump |
| 2 | A little higher | Meadow | tall & narrow | 4.76 | jump, stomp, + a first bounce pad (optional) |
| 3 | Zigzag | Meadow | low & wide | 5.37 | jump, stomp, bounce pad to the goal |
| 4 | Mind the Gap | Canyon | dash lesson | 5.73 | + dash, shortcut, dead end |
| 5 | Long Way Down | Canyon | descent | 6.99 | + long drops, spiker, bounce pad out of the valley |
| 6 | Climb | Canyon | tower | 7.06 | dash, long drops, shortcut, dead end |
| 7 | Lofty Steps | Alpine | ascent | 9.54 | + glide; all of the above |
| 8 | Tumbling Spires | Alpine | switchbacks | 9.75 | all but the double jump |
| 9 | Sunny Terraces | Alpine | skyway | 10.50 | all but the double jump (2 dash chasms) |
| 10 | Mossy Drift | Starlit | switchbacks | 10.97 | + double jump; everything |
| 11 | Hidden Pass | Starlit | cascade | 11.62 | everything (3 long drops) |
| 12 | Winding Crossing | Starlit | gauntlet | 11.76 | everything (6 enemies) |

Every campaign level passes the audits with its region's abilities; the generated ones were re-picked
(`scripts/pick-campaign.mjs`) for a smooth ramp, distinct layouts and their region's technique.

## Goal and reward

Every level ends at a floating gem instead of a flag. Collecting it starts that level's boss battle
(`src/bosses.js`: generated per run, getting harder through the campaign; the last level of each
region ends with that region's capstone mini-game, and a travel level — raft, mine cart, snowmobile
or biplane — takes you on to the next region). No mini-game repeats within a run, and the star
rating at the end counts the games beaten (see the README). Winning unlocks a random clothing item. The level
audits treat the gem position exactly like the old goal.

## Arcade checkpoints

Levels 2, 4, 6, 8, 9 and 11 (in every run) get an arcade cabinet halfway: `src/arcade.js` puts it on
the middle-most platform of the audit's verified route that is roomy (at least 1.8 m both ways), has
no ground enemy and isn't the start or the goal. It is decoration — not solid — so it never changes
what the audits proved; winning its mini-game only moves the restart point there.

## Runs: new layouts every time, within the rules

Each run replaces the levels above with new ones (`src/runLevels.js`), and only if they keep what
makes this campaign work:

| Check | Why |
|---|---|
| level audit: completable by the bot, no unfair / hard / precise jumps, zero warnings | the same bar as every campaign level |
| fun audit at the base level's design difficulty, encounter audit | false paths, shortcuts, dashes, drops, turns, fair fights — as required at that point of the ramp |
| every move the base level uses is still used | each tier keeps the full movement vocabulary; the dash lesson still teaches the dash |
| challenge between the level before (run or hand-written) and the hand-written level after; within 0.9 of its base | the ramp never drops, whichever levels end up remixed |
| par time within ±30 % of the base, no length cliffs | levels keep their size |
| signature distance from every other level (0.55, 0.7 within a tier); a unique name | levels stay visibly distinct |

Hand-made levels are remixed (mirrored half the time, platforms nudged up to ~0.7 m sideways, 0.45 m
forward, 0.25 m up/down, sizes ±10 %, enemies re-timed; the tutorial least). Generated levels try three
fresh layouts from the same theme and difficulty, then remixes. In practice 10–12 of the 12 levels
are new in every run (`test/run.test.js` plays a full run through the campaign audit).

## Checking a level

- `npm test` — every campaign level passes the level, fun, encounter and campaign audits.
- `npm run levels:report` — the campaign plus the generator at scale (dash windows, shortcuts and
  their routes, the campaign audit).
- **Level Lab** (`levels.html`) — route moves (air-dash jumps, drops), shortcut platforms marked ★,
  false paths ✕, the dash timing window, and "watch the bot solve it".
