# World design: zones, NPCs, quests, spells, the town, home and pets

This document describes the layer around the runs — where a run goes, who you meet, what
you learn, and what you bring home — and *why* it is built the way it is. Everything here
follows the project's existing rule: **generated content is only trusted once a mechanical
check says so** (level audits, bot-balanced games, readability checks, tests).

```
 character screen ─► TOWN SQUARE (3D) ──portal──► a RUN: 4 stages × 3 levels ──► back to town
                      │   villagers trade          each stage in a ZONE (4 of 8)    with a decoration
                      │   notice board             one NPC per stage: quest → spell   (and maybe a stray pet)
                      └─path─► HOME (2D): wardrobe, pets, decorations
```

## 1. More zones than stages

A run still has **four stages** (`TIERS` in `levels/index.js`): three levels each, a difficulty band
and a movement technique (bounce pads → air dash → glide → double jump). What changed is that a
stage is no longer tied to one place: each run draws a **zone** for every stage from a pool of
**eight** (`src/world/zones.js`), so the journey changes run to run (2000 random runs give 203
different journeys).

| Zone | Stages it can be | Capstone mini-game | Vehicles (crossings) | Look |
|---|---|---|---|---|
| Green Meadows | 1–2 | Copycat | raft | grass, fields, cottages |
| **Sunny Lagoon** | 1–3 | **Bubble Pop** | raft | sand & coral, turquoise water, palms, sailboats, a lighthouse |
| Sunbaked Canyon | 1–3 | Quick Draw | raft, mine cart | red rock, mesas, cacti |
| **Mushroom Grove** | 2–3 | **Spore Bomber** | raft | teal moss, giant glowing mushrooms, fireflies at dusk |
| Alpine Dusk | 2–4 | Avalanche Run | mine cart, snowmobile | snow stone, spires, pines |
| **Ember Peaks** | 3–4 | **Lava Guard** | mine cart | ember-cracked basalt, a sea of lava, volcano cones, obsidian |
| **Crystal Caverns** | 3–4 | **Shard Storm** | mine cart | amethyst facets, geode bands, crystal spires, stalactites |
| Starlit Ruins | 3–4 | Star Invaders | snowmobile | moonstone, columns, aurora, the void |

- **The mood follows the difficulty**: `stages` says where a zone may appear (a volcano is
  never the tutorial, the meadow never the finale). The technique belongs to the stage, so
  whatever zone stage 3 is, it teaches the glide.
- **Every crossing gets a vehicle that fits** one of the zones it joins (the biplane fits any,
  at most once); `planZones` only accepts journeys where every crossing can get its own
  vehicle, so the encounter plan never has to repeat a game (tested over 80 runs; 300 checked
  while building).
- **Each new zone brings its whole look**: a biome (`world/biomes.js`), four procedural textures
  (`engine/textures.js` — platform tops and sides, the distant ground; swatches within ΔE 1 of the
  painted result), a scenery kit (`world/scenery.js`, safe by the scenery audit on every level), a 2D
  stage palette and parallax landscape for its mini-games (`engine/palette.js`, `games/kit/art.js`), boss
  names, NPC jobs and decorations.
- **Checked**: every zone readable (platform vs horizon / below, avatar and gem vs platform),
  every pair of zones clearly different (DOM-free ΔE ≥ 18; rendered in the real game ΔE ≥ 15 —
  `npm run visuals:verify`), every 2D palette readable at all 60 recolour steps.
- Run 0 (the hand-written campaign) keeps the classic journey. `?zones=lagoon,grove,volcano,crystal`
  forces one.

## 2. The new mini-games

Five games, each pure and deterministic with a perfect bot, human-like balance rules
(`BALANCE_RULES`) and per-run mechanical checks, like the others — plus the quest-only Dungeon
Delve (§4). 28 games in all now.

| Game | Role | How it plays | Tuning notes |
|---|---|---|---|
| **Blade Duel** (`parry`) | boss or checkpoint; NPC duels | the foe winds up a strike at one of three heights (its blade points there, a glint flashes); hold ↑ / nothing / ↓ to guard high / middle / low; a block staggers it — **Space to parry**; **three parries win** | later: shorter wind-ups, **feints** (the glint jumps — the wind-up stretches so 70 % of a wind-up is left to follow it), two-strike combos, a narrower parry window. Strikes come high/low twice as often as middle (the resting guard). Swinging at nothing puts you off balance (no button mashing) |
| **Bubble Pop** (lagoon) | capstone | aim the launcher (← → or mouse), shoot; three of a colour pop, what hangs from nothing drops; every pop hits the boss; the rock creeps down | the bot tries every angle (bank shots included). Bots "think" 0.45 s + 4 × their reaction time before a shot — a puzzle game has to leave people time to look |
| **Spore Bomber** (grove) | capstone | step through a clearing (**one cell per press**), drop spore-puffs that burst in a cross; catch the boss in a burst | tap-to-step (no overshooting into a burst on a late key release); the boss decides *once per puff* whether it noticed it (so corners and timing pay off); it stops after planting its own puff (an opening); sporelings eat your puffs rather than hurt you (no unfair traps) |
| **Lava Guard** (volcano) | capstone | Missile-Command style: lava bombs arc toward three huts; fire water shots that burst where you aim; later bombs split | splash bursts take time to fly and spread — aim ahead; the bot picks targets at a human cadence |
| **Shard Storm** (crystal) | capstone | Asteroids style: turn, thrust, shoot in a wrapping cave; crystals split; the boss hides in a **ring of orbiting crystals** — shoot a gap, then shoot through | every hit makes the ring snap back (so hits need a new gap, not a stream of shots) |

Latest balance (6 seeds, win rate easy / medium / hard; see `npm run balance`): see the
README's balance table — the five new games meet the same rules as the others (an expert wins at
hard settings, an average player at medium, a novice sometimes at easy).

## 3. NPCs

`src/characters/npcs.js` makes a person from a seed: a character design (the same data the hero uses),
a **silly face**, a silly name (*Ottoline Featherstone*, *Percival Grumblesnout*), a job that
fits the zone (*Lava Surfer*, *Shell Collector*, *Mushroom Forager*), a greeting, a trade offer
and a quest.

- **Silly faces** (`sillyFace`): eyes (googly — they jiggle, crossed, wonky, tiny, sleepy,
  winking, *eye-stalks*, beady), brows (unibrow, angry, raised, bushy, wiggly), nose (Pinocchio,
  pig, potato, hook, button), mouth (buck teeth, tongue out, huge grin, "ooh", wobbly,
  gap-toothed, frown), whiskers (curly, walrus, goatee, beard, stubble), extras (freckles, blush,
  a mole, a band-aid, thick specs), ears (big) and a **bobble-head** size. No two NPCs of a run
  share more than four features (`facesDiffer ≥ 3`, re-rolled otherwise).
- **Silly, not unsettling.** Reviewing contact sheets of hundreds of faces (`faces.html`, 3D look
  beside the dialog portrait) showed which features tipped faces from funny to disconcerting: a
  red clown nose reads as a wound on the blocky 3D head, pointy ears as odd slabs, a cyclops eye or
  spiral "✕" eyes as creepy or dead, red lips and fangs as blood, warts as a rash, red irises as
  bloodshot — they're gone
  (`DROPPED_FACE_PARTS`). And a face full of quirks is a monster, not a person: every quirk has an
  **oddness** score and a face may spend at most `ODDNESS_BUDGET` (a test enforces both). The
  people you meet first — Mayor Marigold, the inn's Bertha, Pippa, Tess and Rocco — have faces chosen by
  hand. There's no reliable automatic "is this creepy" detector; the budget plus a sheet a human
  looks at is the honest version.
- **Looks: everyone in view is easy to tell apart** (`characters/looks.js`). Picking colours at
  random gave groups where two people wore the same red jacket or three faces were nearly one tone.
  Now every colour is picked **as far as possible (in OKLab, a perceptual colour space) from what
  the others in view already have**: a run's four NPCs, the square's four card battlers, the Ring's
  three tamers. Skin tones spread light to dark; tops, hair, trousers and hats spread too; within a
  person, hair must read against the face, trousers against the top, a hat against the hair; and
  nobody's top blends into where they stand (the zone's sky and ground — `backdropOf`). The hero
  and the hand-made regulars are *context*: NPCs never dress like them, but they don't steer the
  spread (a light-skinned hero would otherwise push every NPC dark, and every run's first NPC would
  come out in the same "opposite of the hero" colours). A pick is random among the options within
  72 % of the farthest, so groups vary from visit to visit.
- **Shapes, not just colours** (`npcs.js` `lookDifference`): people in a group must differ at a
  glance, and what sets a silhouette is the body build, the *kind* of hat (bare, snug, tall, wide,
  a crown, a flower wreath), wings / a cape / a pack, then hair, the top, the head, the trousers.
  Each member of a group is the best of a few dozen possible outfits — the one most unlike the
  others — and no two share a build, a hat shape or a back item; each wears a different special
  item and has a different first name. The first attempt only spread colours, and the Ring's three
  tamers still looked alike: same builds, same bare heads, and (because their colours also had to
  avoid every regular in the inn, the hero and the yard) the same five tops. Now only who's actually
  in view counts (in the yard: Rocco and you), clothes are compared mostly by hue (plain OKLab put
  white and charcoal "farthest" from everything, so they kept winning), and the top palette has more
  hues. A test checks that every pair in a group differs in shape (tamers by at least 8 of 14 points).
- **The rules of reality are optional**: about one in six people has a **fantasy skin** — leaf
  green (goblin, forest folk), blue (genie) or deep purple — at most one in a small group. Mid-dark
  and clearly coloured: in review, greyish tones (sage, dusty blue, mauve) read as sickly, light
  ones as a lavender that pops off the screen, and teal as a fish or a zombie in 3D (dropped).
  **A fantasy face is the loud thing about a person, so the rest goes with it**: clothes from a
  small set that suits the tone (`FANTASY_OUTFITS`: earthy with green, gold and wine with blue, gold
  and teal with purple), quiet trousers, dark or white hair — and a plain, friendly face (below).
- **Weirdness** (`npcs.js` `weirdness`, budget 4): "how strange does this whole person look" is hard
  to put into words, so it's scored from what review of the 2D portraits *and the real 3D figures*
  (`cast3d.html`) showed. Face quirks are weighted by how they look in 3D (eye stalks and a big wonky
  eye cost 2 — charming in 2D, rough on the blocky head), a bobble-head 1, a fantasy skin 3 (so a
  green, blue or purple person has one quirk at most). Some combinations are ruled out: on a fantasy
  face, big whiskers, big ears, a frown, a scowl or a pig snout (a green face with a snout is an
  orc; a walrus moustache on teal was a duck's bill); whiskers lighter than the face (blond on dark
  skin reads as a gold ring round the mouth, a pale goatee as a tooth — white is fine: grandad);
  pink, purple or teal whiskers (lipstick, a bruise); eye stalks under a hat that covers the head.
  A face that won't fit is re-rolled, then tamed (quirks swapped for plain features) — a test
  checks 1500 NPCs. Ignatius, the square's viking, was the case in point: teal, a yellow walrus
  moustache and buck teeth under a viking helmet — a platypus. He's now a ginger viking.
- **3D fixes from that review**: hats that would cover a silly face's big eyes sit a little higher
  and brows under a hat aren't painted on it (they were floating on caps); tiny and beady eyes are
  small and shiny (big black squares read as empty sockets); a wonky eye is at most 1.25× in 3D (a
  1.5× googly eye is a white slab over a third of the face); eye stalks grow out of the face and
  lean out past the brow (on top of the head they were a faceless head with antennae); a beard goes
  round the jaw under the mouth (a slab over it read as a bib). 2D and 3D now agree on crowns (gold)
  and headbands (the hat colour) — and on overalls (the shirt is the top colour).
- **Rocco the Ring Master** was blue with white hair and googly eyes — in 3D a skull under a top
  hat. He's a showman now: a wink, a waxed moustache, dark hair, the red coat.
- A mohawk under a hat read as a feathered headdress, so hatted folk (a traded hat too) get short hair.
- **Bosses** (`progression/bosses.js`): a stage's three bosses take a **triad** of hues (120° apart,
  jittered), turned away from the zone's sky, hills and ground (`backdropHues`) so none blends into its
  backdrop — any turn at least two-thirds as good as the best, so a zone's bosses aren't always the
  same three colours. Yellows are lifted (they go mustard at the lightness that suits other hues).
- **Review by eye**: `node scripts/cast-sheet.mjs out.png 1 2 3` draws everyone you'd meet together
  — the square (hero, mayor, battlers), the inn (regulars, tamers) and each stage of a run on its
  zone's backdrop (the NPC, the three bosses). The looks above came out of reviewing those sheets;
  the tests check the measurable parts (spread, contrast, fantasy share).
- **Bertha** stands *behind* her bar at three times hero scale, on a step so the counter comes to her
  waist, holding a small foaming stein at her chest (a `toast` pose in heroSprite.js) — no arm-waving. Overall
  straps on the big portrait read as a jaw, so she wears a tunic and headband.
- **Three renderings of the same face**: boxes on the 3D avatar's head (`characters/npcFace.js`
  `sillyFace3D`, hooked into `characters/avatar.js`), squeezed into the 28×36 hero sprite for duels, and a
  **64×64 pixel-art portrait** for the dialog box that blinks, wanders its googly pupils and
  flaps its mouth while the text types out.
- **In a level**: one NPC per stage, in its first or second level (never the capstone — you
  should have the spell before the stage's big fight), standing off to the side of a roomy
  platform on the *verified route*, in the first third of it, never on the goal, a spring,
  the arcade's platform or an enemy's. Like the arcade cabinet they're decoration, not solid,
  so the level audits stay true. Walk up, press **E**: the camera eases over your shoulder to
  frame their face (the dialog sits bottom-left, the NPC in the right third).

## 4. Quests — the recommendation

**Don't put quests inside the levels.** Every level is audited: proven completable by a bot in
the real physics, fair jumps, a steady difficulty ramp across the campaign, visibly distinct
layouts, every move used (`LEVEL_DESIGN.md`). A quest that changes a level ("fetch the thing
from that ledge", "survive the extra wave") either breaks those guarantees or needs its own
audit for every combination — and it muddies what a level *is*: a run at the gem.

**Make quests side activities that branch off and come back** — each its own complete,
checkable thing. Three are built (an NPC offers a rift 40 %, a delve 30 %, a duel 30 % of the time — on the gentle first run only rifts):

1. **Rifts** — *the roguelite level*. "My rubber duck fell into a rift!" The NPC opens a rift
   to a short **generated level** — the same generator, the same audits — in the same zone
   (tinged violet, sparkles drifting through), at the stage's difficulty (30 % into its band),
   generated off the main thread by the run worker. Each rift has a **twist**:
   - *Glass Heart* — one heart only
   - *Against the Clock* — the par time × 1.8 + 6 s
   - *Lost Trinkets* — three trinkets on the verified route; the gem appears when you have them
   Fall out of hearts (or time) and the rift spits you out. You return to where you stood.
2. **Duels** — a Blade Duel against the NPC themself (their clothes, their silly face), harder
   in later stages.
3. **Delves** — *the dungeon crawl* (`games/delve/rules.js`). "A Rift Warden moved into my root
   cellar!" (sea cave, old mine, hollow tree, ice cellar, forge vaults, geode halls, ruined crypt —
   by zone.) A side-on 2D crawl: **three rooms** of foes, then the **Rift Warden**. Clear a room
   and its door slides open. This is the one place the **class is a real kit**, not just a
   spellbook:

   | | weapon (J) | move (K) |
   |---|---|---|
   | Warrior | sword — short reach, 2 damage, swats arrows out of the air | **shield** (hold): blocks anything from the front or above — arrows, slimes, bats, even the Warden's charge, which stuns it |
   | Hunter | bow — fast arrows, 1 damage, long range | **dodge-roll**: nothing can hit you mid-roll (through arrows, waves, the charge) |
   | Sorcerer | arcane bolt — slow, 2 damage, **pierces** every foe in a line | **blink**: a short teleport (out of a shadow, past a charge) |

   Foes are readable and only hurt while they attack: **slimes** squash before they hop (on the
   floor they're just squishy), **bats** flash "!" then dive at where you were, **skeleton archers**
   lob arrows at *where you stand* (keep moving; they won't shoot point-blank). The **Warden**
   telegraphs everything — *SLAM!* (two shockwaves along the floor: jump them), *CHARGE!* (jump it,
   roll through, blink past or block it), *LEAP!* (its shadow shows where it lands: get out from
   under) — and keeps its **guard up while it stalks you** (weapons clink off): hit it while it
   winds up, recovers or is stunned. **No aim help**: shots fly straight at waist height (low
   enough for slimes), or at 45° up while ↑ is held (bats, archers on ledges) — the Warrior's ↑
   swing goes overhead. Shots have a forgiving hit box (8 px above and below their line).

   **Spells work here too — and recharge** (12 s; the spell bar counts down). Their hits land on
   the nearest foe (`g.spellHit`): Cleave / Arcane Bolt, Volley's arrows, Thorns and Predator all
   become real damage; shields, heals, slow-motion and the clock work as everywhere.

   Balanced like every game — per class: a perfect bot of each class clears it at every
   difficulty in 25–45 s of a ~125 s clock; human-like experts win 100 % with every class,
   average players 89–100 %, novices at the easy settings 56–78 % (`test/delve.test.js`,
   `test/balance.test.js`).

**Does a dungeon crawler dilute the game?** Not as a quest. The run's spine — levels, the gem,
the boss — stays the same; the delve sits where rifts and duels already sit (an optional branch
off an NPC, one per stage at most, ~40–90 s), so it's one more flavour of side-trip rather than a
second game competing with the first. What it adds that nothing else does is *class identity*:
elsewhere a Warrior and a Sorcerer differ only in which spells they press; in a delve they fight
differently (stand and block vs. roll and shoot vs. blink and pierce). Where it *would* dilute:
as a stage of the run (a run would become two games), with loot/levelling of its own (a second
power curve beside spells), or long multi-floor dungeons. Keep it short, keep its rewards the
same spell choice, and it makes the classes matter without pulling focus.

**One go at a rift.** That is the roguelite stake: run out of hearts (or time) and the rift
closes — it costs you the spell, never your progress (you're back in the level, hearts and all).
A duel or a delve, like any fight, lets you try again before you walk away.

**Rifts reward Riftcards and clothes; duels and delves reward spells.** A rift is *the* place things
fall through, so it's where cards (and now and then a piece of clothing) come from — a pack of three
from the rift's zone, rarer later in the run and the higher your card rank. For duels and delves
**the reward is a choice**: two spells from your class's book that you don't know yet — pick one.
That makes each stage a small build decision, and two of a class's six spells stay unlearned
every run.

Ideas that fit the same pattern, for later: NPC challenges from the run's *leftover* games (a
run uses 21 of 27 — the rest could be NPC side games); requests that span stages (carry the
stage-1 NPC's letter to the stage-3 NPC); rift races against your own ghost; an NPC who offers
to swap one of your spells.

## 5. Trading

NPCs wear random clothes — and usually one **unlockable you don't own yet** (rarer further into
a run: the stage's row of the drop table). Trade it for **one of yours of the same rarity** (any
slot; same-slot items are listed first — "your hat for their hat"). They put on what you gave
them; if you were wearing it, that slot goes back to the default. One trade per NPC. The town's
villagers trade too (new faces after every run).

## 6. Classes and the spellbook

Choose a class at the portal: **Warrior** (*hold the line*), **Hunter** (*read, then strike*) or
**Sorcerer** (*bend the rules*). You start with the class's signature spell; each stage's NPC
teaches one more → up to five by the end of a run. Spells are forgotten when the run ends.

Spells **work in every 2D game** (all 28 — bosses, checkpoints, journeys, duels, delves) because they only
touch what every game shares (`games/kit/common.js`): hearts, the clock, the boss's health (or the
goal still to make), the hit-blink, and how fast the game runs. Active spells: one cast per
battle. **All from the keyboard**: 1–5 (top row or numpad) casts that spell, **Tab** casts the next
one that would do something now (not a heal at full hearts) — one key by the left hand whatever the
game uses. No game uses 1–5 or Tab (Key Jump's hard mode types 6–9 and 0), so this works
everywhere; pressing a spent spell says so (or, in a delve, how long until it's back). Clicking the
spell bar works too. `test/spells.test.js` casts every spell in every game.

| | Warrior | Hunter | Sorcerer |
|---|---|---|---|
| signature | **Shield Wall** — 5 s: hits don't cost hearts | **Eagle Eye** — 6 s at half speed | **Time Warp** — 5 s at 40 % speed |
| | Second Wind — +1 heart | Volley — three hits, one after another | Arcane Bolt — two hits |
| | Iron Skin *(passive)* — a fourth heart | Trail Rations — +1 heart | Chronoshift — +20 s |
| | Thorns *(passive)* — every heart you lose hits the boss | Keen Senses *(passive)* — +10 s on every clock | Mana Shield — 4 s guard |
| | Cleave — two hits | Camouflage — 4 s guard | Mend — +1 heart |
| | Last Stand *(passive)* — once, survive a knock-out on 1 heart | Predator *(passive)* — every 5th good move is an extra hit | Echo *(passive)* — every spell twice a battle |

Each book has something to survive with, something to win faster with, and a passive that makes
the others better — the complementary builds: a **warrior tank** (Iron Skin + Thorns + Last
Stand wins *by being hit*), a **hunter tempo** build (Eagle Eye slows the world to land more good
moves; Predator turns good moves into hits), a **sorcerer** who casts everything twice (Echo).

Spells are a bonus on top of games that are balanced *without* them (the balance rules don't
change), so they make a run easier but never make a game unwinnable without them.

**Saying what a spell does and when to use it.** Every spell has a plain `what` (what happens —
e.g. Time Warp: *slows the WHOLE game — the boss, its attacks and you — to 40 % speed for 5 s*) and a
`when` (a tip — *cast it when things get fast or busy*). They're shown wherever you meet a spell:
the portal's class cards (the signature spell, with its key), the NPC's offer (*what / when / how to
cast*), the confirmation after you learn one, every battle's rules card (*Your spells — press the
number key*: key, what, tip), tooltips on the spell bar and HUD, and for your first three battles
a **coach bubble** over the spell bar (*Press 1: Time Warp — …*).

## 7. The town square (3D) and your home (2D)

**The town square** (`src/town/hub.js`) grew out of the avatar playground's arena (which can now load
it too: `playground.html?arena=town`): a checkered plaza, a **fountain** with leaping water, a ring
of **columns** with gold finials, the **portal** — a great arch with a swirl of light — on the
far side; **four card tables** — green baize, cards laid out, stools, each battler under their
faction's banner, bunting strung between the poles; a **notice board** (your runs, stars, quests, trades,
pets, decorations) at the fountain's foot; benches and planters; **Mayor Marigold** (a tall, eccentric old wizard with a long silver beard, who
welcomes you and tells the story as it unfolds); lamp posts, trees and the town's cottages; a
wooden **path east to your home** and one **west to the inn**, the Tipsy Teapot (see 9b).
Every floor is at one height (nothing to trip on), hedges taller than a jump keep you in, and it
is tested: you can walk from the spawn to the portal and to your door in the real physics.
The square is laid out for looking around: you come in between the card tables (two pairs flanking
the way in, the battlers *behind* the low tables, talked to across them — `talkRadius`), the notice
board and the mayor at the fountain's foot, the fountain and its ring of columns beyond, the portal at the far end. **The camera turns**:
drag with the mouse (or hold **Z / X**), the wheel zooms, and movement follows the camera (↑ is
always "away from the camera"). Talking eases the camera round from wherever you've turned it.

- Walk into the portal: it shows **where it leads this time** (the four zones of the next run)
  and asks for your class. Step through.
- Finishing a run brings you back to the portal with a **decoration** — and, after three stars
  or more, maybe a **stray pet**.
- `?hub=0`, `?level=N`, `?run=S` and `?seed=S` skip the town (tests, benchmarks, the level lab).

**Your home** (`src/town/home.js`) is 2D pixel art, like the battles: walk with ← →, use things with
↑ / E.
- *Living room*: the front door (back to town), a window, a shelf, the walls, a rug, a ceiling
  hook, a trophy stand — and on your first visit, **a basket with three critters** to adopt.
- *Bedroom*: the **wardrobe** (your clothes: the character screen, in wardrobe mode), the **pet
  bed** (your pet sleeps there; choose who comes along), the bed, a poster, a corner.
- **Decorations** (`src/town/decor.js`, 25): one per finished run, themed on a zone you visited (an
  aquarium from the lagoon, a lava lamp from the volcano, a geode chandelier from the caverns…;
  rarer ones need more stars); a **perfect run** brings the Golden Trophy. Each has a spot;
  items that share a spot take turns (tick what's on display).

## 8. Pets — the recommendation

**Make pets companions, not power-ups.** Spells already are the run's power curve, and every
mini-game is balanced by bots; a pet that helped in fights would have to be part of that
balance (or quietly break it). So pets are **cosmetic, but everywhere** — the same places your
clothes are:

- **3D** (`characters/pets.js` `createPetFollower`): the pet trots after you along *your footsteps* — the
  trail of places you actually stood — so it hops the gaps you jumped and never walks on thin
  air (tested); it sits and looks around when you stop; if you get far ahead (respawns, rifts)
  it poofs to you. In levels, rifts and town; on the character-screen pedestal.
- **2D**: it sits on the battle HUD next to your hearts and reacts — hops at a good move, hides
  its eyes when you're hit, cheers when you win, sleeps when you lose. On the reward pedestal.
  At home it sleeps in the pet bed; your other pets roam the house.
- **Eight species** (cat, pup, bunny, frog — common; fox, owl — rare; slime — epic; dragonling —
  legendary), each seeded with a coat, a pattern (spots, stripes, a patch, socks), a collar and a
  name (*Biscuit*, *Noodle*, *Mochi*…).
- **Getting one**: the basket at your door on the first visit (choose one of three); after a
  run with **three stars or more**, a stray may follow you home — rarer the better the run (a
  perfect run can bring a dragonling). Choose who comes along at the pet bed.

Ideas for later that keep pets cosmetic: pet hats (the wardrobe for pets), tricks that unlock
with runs, a pet that finds a trinket in rifts (a hint arrow, not an advantage).

## 9. Riftcards — why a card game, and how it ties in

The runs already have lots of *reflex* games; a card game adds the one thing they don't: a slow,
thinking game you can play at your own pace in town, with a **collection that lasts between runs** —
the meta-progression the runs were missing (spells and most rewards are per-run or cosmetic).

- **It's fed by the runs**: a closed rift offers a pick of one of three cards of its zone's faction (a choice, not a pile — what you take says what deck you're building), finished runs drop a pack, so
  playing the platformer grows your collection; every card battler you beat lets you pick one of
  three of their spares (two of your faction, one of theirs — so you can drift into a new faction).
  **Once per battler**: a rematch is for fun. (It used to pay a card every win, which made the
  square an endless card tap and the rifts pointless for collecting; now the square pays at most
  four picks per visit, and the rifts stay where new cards come from.)
- **The world shows up on the table**: each zone is a **faction** with a personality and a perk —
  swarming Bloomkin who win ties, Tidefolk who draw on a win, Dustriders whose back row shrugs off
  weather, Sporefolk who leave a creature behind, Frostkin whose blizzards only chill you, Emberborn
  whose scorch spares their own, Prismfolk who shine first, Starborn led by heroes. The **town square
  is the crossroads** where battlers from every world meet: new faces every time you come back, each
  playing their home world's faction.
- **It's a ladder you climb between journeys**: the battlers in town play at your tier (Novice →
  Champion). There are **four tables; beat any three** and you rise — so you can skip the matchup you
  dislike, but it's no faster: the tougher players only arrive while you're away, so the card game paces itself against the runs instead of being ground in one sitting.
  Higher tiers play sharper and with rarer cards; the rarity of what you win rises too. Clearing
  Champion brings the story's finale, the Rift King (his own legendary deck, 12 cards to your 10, and
  he looks ahead).
- **Why Gwent-style, not lanes** (Riftcards 1 was a lane battler with hearts and energy): the lane
  game was mostly about the curve — the best deck won. Rows and rounds put the decisions on *when*:
  one card a turn, **pass** to sit a round out, and **no new cards between rounds**, so every card
  spent to win a round is missing for the next two. Winning a round cheaply, letting one go, baiting
  the other side into overspending — that's the game, and it reads at a glance (one number per
  row). Rows give the zones their flavour (fliers in the sky, archers at the back) and weather
  something to hit.
- **Rules that came out of simulation** (`test/cards.test.js` and the card sims, thousands of AI-vs-AI matches):
  no draws between rounds (with one card per round, card advantage barely mattered and a reckless
  "throw in your biggest card" player beat careful play); **at most two spies a deck** (each spy is a
  card ahead — a spy-heavy deck won ~90 %); **medics are weak creatures** (bringing back your best
  card is already two cards in one); each faction's starter takes the **weather that hurts it least**;
  perks tuned until every starter wins 40–55 % against the others, and full collections stay within
  ~40–55 % too.
- **The computer player** keeps habits a good player has (get ahead cheaply and pass; let a round go
  when far behind; keep bond partners together; stop spending once the other side can't catch up)
  and low tiers are sloppy on purpose (they throw in their biggest card, or give up a round too soon).
  Champions and the King **look ahead**: each sensible move is played out many times on copies of the
  match with your unseen cards reshuffled, and the one that wins most is kept.

## 9b. The loop: bosses → ranch → Ring; rifts → cards; the inn → gold → looks

The question was how cards, bosses, a monster-fighting ring and an inn fit together without
being four unrelated systems. The answer that holds together best:

- **Every boss you beat can become yours.** The bosses are the most bespoke thing in the game
  (generated bodies, names, colours, and a mini-game each) — so they're what you collect for the
  Ring, not cards. At the end of each stage, one of that stage's beaten bosses comes home (pick one
  of up to three): it keeps its looks and name; its **type** comes from its zone; its **signature
  move** from the game you fought it in (the Tennis boss *volleys*, the Quick Draw boss *always
  shoots first*, the Spore Bomber *poisons everyone*, the Blade Duel boss *parries*). One per stage
  (four per run at most) keeps each a real choice and the ranch from flooding — and only if you beat
  the stage's **last** boss (its capstone): the others won't leave without their leader, so the
  hardest fight of a stage is also the one with a prize. A type you don't have yet is marked in the
  choice, nudging you toward a squad that covers itself.
- **Cards stay rift critters, not bosses.** Putting bosses on cards as well would make the card
  game and the Ring compete for the same collection. Two collections with two sources: rifts (NPC
  quests) and finished runs feed **Riftcards**; bosses feed **the Ring**. Both ladders pace
  themselves against the runs (the tougher opponents only arrive while you're away), so the
  platformer stays the centre and both side games keep sending you back into it.
- **The Ring is a party battle, not a Pokémon copy.** Pokémon's fun is types, moves with side
  effects and growth; the party RPG's is choosing a command for each of several fighters and
  watching the round play out in speed order. Three-on-three with all three on the field gives
  both: the decisions are which target, which move now vs later (cooldowns), whether to guard,
  shield or taunt for a hurt friend. It's deliberately small: four commands per monster, eight
  types in a clean chart (each strong against two, weak against two, no pair mutual), statuses
  that read at a glance. Levels come from the stage a boss was befriended in and grow with fights;
  simulation (`test/ring.test.js`) keeps equal squads even, two levels a clear edge, types telling,
  and every signature move worth having but none a must-have.
- **The inn is the gold economy — for looks only.** Its challenge board turns the mini-game
  gauntlet into an income (three of the games you've met, each won once, new ones after every run
  — so the board sends you back out on runs rather than letting you farm it), the Ring pays a
  little, runs pay by stars. Gold buys **only cosmetics** (the tailor). That's deliberate and, I think, right:
  if gold bought cards or monsters, the card ladder and the Ring would stop being earned through
  play, and grinding the board would beat playing well. The tailor edits what you already own
  (patterns on tops, capes and wings; trail colours), so the clothes you win stay the source of new
  items and gold makes them *yours*.
- **The ranch is the trophy room for monsters**: a side-scrolling pasture behind your house that
  grows as your herd does, where they roam, nap and come over to say hello — the 2D counterpart of
  pets following you in 3D.
- **Having a card game, a monster game and a gauntlet of arcade games at once** breaks a "one
  unique mechanic" rule — and that's fine here: this game *is* a gauntlet of familiar genres, each
  given one bespoke twist (cards: the worlds' home ground and weather; the Ring: moves from the
  boss's own game; the gauntlet: no repeats in a run).

## 9c. Riftcards 2 — less literal

The first Riftcards 2 followed its inspiration too closely (the same rows, weather and abilities
by the same names). What changed: the abilities and specials speak the game's language (pack,
swarm, sneak, revive, burn, nimble, legend; Blizzard, Sea Mist, Dust Storm, Sunny Day, Brass Band,
Lava Burst); and each round is played **in one of the worlds** — three drawn per match and shown from
the start — where that world's faction gets **home ground** (+1) and the Alpine, Lagoon and Canyon
worlds bring their weather for everyone but the locals. Knowing that round two is in your home world
changes how you spend round one. The card art also changed: every creature stands on a backdrop for
its row (sky, field, dusk) instead of a wash of its faction's colour, each faction has two
colourways, and bodies now include arms, claws and tentacles.

## 10. Story and progression

A light story gives the systems a reason to exist (`progression/story.js`): **Hearthmoor** around the Great
Portal; rifts tearing open and critters tumbling through; cards catching their likeness; the Rift King
who opens rifts to find a worthy opponent. Beats are told once each, in town, when they apply.

**Introduce systems gradually.** The first run is plain platforming, bosses and rift quests (no class,
no spells — the portal explains why); classes, spells and duels arrive on run 2; delves on run 3; the
card ladder is open from the start in town (the first battler you play lets you choose a faction and lends you its starter deck).
Everything unlocks at once with the test menu's 🔓.

**Save and resume**: the run is saved at the start of every level (its seed, zones, class, spells,
results, quest states and trades — everything else is remade from the seed); the portal offers to
continue it. **Fewer games per run**: four arcade checkpoints (one a stage) instead of six — 19
encounters, so each counts — and the **home arcade** replays any game you've met.

## 11. Music and sound

Chiptune, generated: a small Web Audio synth and a composer that writes a tune per level, game and
place from a style (mode, tempo, progressions, bass / accompaniment / drum patterns, lead voice) and a
seed. The musical rules that keep it listenable are tested: strong beats on chord tones, a melody
scale that never sits a semitone off the chord, mostly stepwise lines, a motif that returns three times
in eight bars (repetition is what makes a tune catchy), cadences home at the loop point. Each zone's
style is chosen to match its look and mood; each NPC has a voice (a pitch, a timbre, a wobble) they
babble in while they talk.

## 12. Journeys in 3D

The four travel games (River Raft, Mine Cart, Snowmobile, Biplane) play **in 3D by default**
(`src/games/kit/travel3d.js`): the *same* game objects step, score and are checked by the same bots; only the
drawing changes — the WebGL renderer shows the zone you're heading to, you **sit** in the vehicle
(the avatar's `sit` pose; ducking in the mine cart), your pet rides along (not in the one-seat
biplane), and the pixel HUD (hearts, clock, trip bar, spells) floats on top with index 0
see-through. Cameras: behind and above the raft (the river's banks come from `riverAt`), a chase
camera down the mine tunnel (timber frames, lamps, gaps in the track), side-on for the snowmobile
(the tilt on landing matters; hills built around the sled each frame so crevasses come and go), and
behind the biplane (rings face you). Hits flash the screen red and shake it. The trip's rules card
has **▦ Play the 2D version / 🎥 Play the 3D version**; the choice is remembered
(`profile.travelView`); `?travel=2d|3d` overrides. In the VM's visible Chrome (`?quality=test`) the
3D journeys run at 60 fps (scene build + draw 1–3 ms per frame).

## 13. What's saved

`src/progression/profile.js` (localStorage `platformer.profile.v1`): the last class, runs finished, best
stars, pets and the active one, decorations and what's on display, quests done, trades, the
villagers' seed, whether journeys play in 2D or 3D (`travelView`), Riftcards (collection, decks,
faction, tier, wins, the King), your monsters and squad, the Ring's tier, gold, the tailor's work, the arcade's records and the games you've met, story beats told, settings, and the run
in progress. Clothes stay in the character store (`platformer.characters.v1`) — trades move
items in and out of it. Everything else (the journey, spells, NPCs) belongs to the run.

## 14. Extending it

- **A zone**: a biome + materials + painters (check the swatch in `textures.html`), a scenery
  kit, a `STAGE_THEMES` entry and a branch in `createLandscape`, a capstone game, an entry in
  `ZONES` (stages, vehicles, names), NPC jobs, decorations. The tests then check readability,
  distinctness, scenery safety and that the encounter plan still never repeats.
- **A spell**: an entry in `SPELL_LIST` with an effect the runtime knows (guard, heal, hit,
  volley, slow, time) or a passive handled in `createSpellRuntime`; an icon in `ICONS`.
- **A quest kind**: a branch in `makeNpc` (the quest), `questPitch` / `questDone` (the words),
  and a `start…` function in `app/boot.js` that ends in `rewardSpell(actor)` or a loss. A quest game
  (like `delve`) has `roles: ['quest']`, so the encounter planner never picks it for a run; a
  game with its own foes can take spells' hits with `spellHit(n)` and make spells recharge with
  `spellRecharge`.
- **A decoration**: `DECOR_LIST` (a spot and a pixel painter).
- **A pet species**: `SPECIES`, `COATS`, a branch in `petParts` (3D) and `paintPet` (2D).
